from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Text, func, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from urllib import error, request
import json
import os

app = FastAPI(title="Music Service", version="0.1.0")

EVENTS_SERVICE_URL = os.getenv("EVENTS_SERVICE_URL", "http://events:8000")

DATABASE_URL = os.getenv("MUSIC_DATABASE_URL", "sqlite:///./music.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class SongModel(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    author = Column(String, nullable=True)
    bpm = Column(Integer, nullable=True)
    key = Column(String, nullable=True)
    chord_chart_pdf_url = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    lyrics_markdown = Column(Text, nullable=True)


class RepertoireModel(Base):
    __tablename__ = "repertoires"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, nullable=False)


class RepertoireSongModel(Base):
    __tablename__ = "repertoire_songs"
    id = Column(Integer, primary_key=True, index=True)
    repertoire_id = Column(Integer, nullable=False)
    song_id = Column(Integer, nullable=False)
    orden = Column(Integer, nullable=True)
    tonalidad_override = Column(String, nullable=True)
    bpm_override = Column(Integer, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    ensure_song_columns()
    with SessionLocal() as db:
        reconcile_repertoires_with_events(db)
        deduplicate_all_repertoires(db)
        normalize_all_repertoire_songs(db)
        db.commit()


class SongCreate(BaseModel):
    name: str
    author: Optional[str] = None
    bpm: Optional[int] = None
    key: Optional[str] = None
    chord_chart_pdf_url: Optional[str] = None
    youtube_url: Optional[str] = None
    lyrics_markdown: Optional[str] = None


def ensure_song_columns() -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("songs")}

    statements: list[str] = []
    if "youtube_url" not in existing_columns:
        statements.append("ALTER TABLE songs ADD COLUMN youtube_url VARCHAR")
    if "lyrics_markdown" not in existing_columns:
        statements.append("ALTER TABLE songs ADD COLUMN lyrics_markdown TEXT")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


class Song(SongCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class RepertoireCreate(BaseModel):
    event_id: int


class Repertoire(RepertoireCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class RepertoireSongCreate(BaseModel):
    repertoire_id: int
    song_id: int
    orden: Optional[int] = None
    tonalidad_override: Optional[str] = None
    bpm_override: Optional[int] = None


class RepertoireSong(RepertoireSongCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class RepertoireSongsReorder(BaseModel):
    repertoire_id: int
    ordered_item_ids: list[int]


class RepertoireSongsNormalize(BaseModel):
    repertoire_id: Optional[int] = None


def renumber_repertoire_songs(db, repertoire_id: int):
    items = (
        db.query(RepertoireSongModel)
        .filter_by(repertoire_id=repertoire_id)
        .order_by(RepertoireSongModel.orden.asc(), RepertoireSongModel.id.asc())
        .all()
    )
    for index, current in enumerate(items, start=1):
        current.orden = index


def normalize_all_repertoire_songs(db):
    repertoire_ids = [
        repertoire_id
        for (repertoire_id,) in db.query(RepertoireSongModel.repertoire_id)
        .distinct()
        .all()
    ]
    for repertoire_id in repertoire_ids:
        renumber_repertoire_songs(db, repertoire_id)
    return len(repertoire_ids)


def deduplicate_repertoires_for_event(db, event_id: int):
    repertoires = (
        db.query(RepertoireModel)
        .filter_by(event_id=event_id)
        .order_by(RepertoireModel.id.asc())
        .all()
    )
    if not repertoires:
        return None

    def repertoire_sort_key(repertoire: RepertoireModel):
        song_count = (
            db.query(func.count(RepertoireSongModel.id))
            .filter_by(repertoire_id=repertoire.id)
            .scalar()
            or 0
        )
        return (-song_count, repertoire.id)

    primary = min(repertoires, key=repertoire_sort_key)
    existing_song_ids = {
        song_id
        for (song_id,) in db.query(RepertoireSongModel.song_id)
        .filter_by(repertoire_id=primary.id)
        .all()
    }

    for duplicate in repertoires:
        if duplicate.id == primary.id:
            continue

        duplicate_items = (
            db.query(RepertoireSongModel)
            .filter_by(repertoire_id=duplicate.id)
            .order_by(RepertoireSongModel.orden.asc(), RepertoireSongModel.id.asc())
            .all()
        )
        for item in duplicate_items:
            if item.song_id in existing_song_ids:
                db.delete(item)
                continue
            item.repertoire_id = primary.id
            existing_song_ids.add(item.song_id)
        db.delete(duplicate)

    renumber_repertoire_songs(db, primary.id)
    return primary


def deduplicate_all_repertoires(db):
    event_ids = [
        event_id
        for (event_id,) in db.query(RepertoireModel.event_id)
        .distinct()
        .all()
    ]
    for event_id in event_ids:
        deduplicate_repertoires_for_event(db, event_id)


def ensure_repertoire_for_event(db, event_id: int):
    repertoire = deduplicate_repertoires_for_event(db, event_id)
    if repertoire:
        return repertoire

    repertoire = RepertoireModel(event_id=event_id)
    db.add(repertoire)
    db.commit()
    db.refresh(repertoire)
    return repertoire


def delete_repertoire_and_songs(db, repertoire: RepertoireModel):
    linked_items = db.query(RepertoireSongModel).filter_by(repertoire_id=repertoire.id).all()
    for item in linked_items:
        db.delete(item)
    db.delete(repertoire)


def delete_repertoires_for_event(db, event_id: int):
    repertoires = db.query(RepertoireModel).filter_by(event_id=event_id).all()
    deleted_ids: list[int] = []
    for repertoire in repertoires:
        deleted_ids.append(repertoire.id)
        delete_repertoire_and_songs(db, repertoire)
    return deleted_ids


def reconcile_repertoires_with_events(db):
    try:
        with request.urlopen(f"{EVENTS_SERVICE_URL}/events", timeout=10) as response:
            events = json.loads(response.read().decode())
        with request.urlopen(f"{EVENTS_SERVICE_URL}/event-schedules", timeout=10) as response:
            schedules = json.loads(response.read().decode())
    except (error.URLError, error.HTTPError, json.JSONDecodeError):
        return

    existing_event_ids = {event["id"] for event in events if "id" in event}
    visible_event_ids = {
        schedule["event_id"]
        for schedule in schedules
        if schedule.get("event_id") in existing_event_ids
        and isinstance(schedule.get("tipo"), str)
        and (
            schedule["tipo"].strip().lower() == "worship"
            or "alabanza" in schedule["tipo"].lower()
            or "adoracion" in schedule["tipo"].lower()
            or "adoración" in schedule["tipo"].lower()
        )
    }

    repertoire_event_ids = [
        event_id
        for (event_id,) in db.query(RepertoireModel.event_id)
        .distinct()
        .all()
    ]
    for event_id in repertoire_event_ids:
        if event_id not in visible_event_ids:
            delete_repertoires_for_event(db, event_id)


@app.get("/health")
def health():
    return {"status": "ok", "service": "music"}


@app.get("/songs")
def list_songs():
    with SessionLocal() as db:
        return db.query(SongModel).all()


@app.post("/songs", response_model=Song)
def create_song(payload: SongCreate):
    with SessionLocal() as db:
        existing = (
            db.query(SongModel)
            .filter(func.lower(SongModel.name) == payload.name.lower())
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Song already exists")
        song = SongModel(**payload.dict())
        db.add(song)
        db.commit()
        db.refresh(song)
        return song


@app.get("/songs/{song_id}", response_model=Song)
def get_song(song_id: int):
    with SessionLocal() as db:
        song = db.get(SongModel, song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        return song


@app.put("/songs/{song_id}", response_model=Song)
def update_song(song_id: int, payload: SongCreate):
    with SessionLocal() as db:
        song = db.get(SongModel, song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        existing = (
            db.query(SongModel)
            .filter(func.lower(SongModel.name) == payload.name.lower())
            .first()
        )
        if existing and existing.id != song_id:
            raise HTTPException(status_code=400, detail="Song already exists")
        for key, value in payload.dict().items():
            setattr(song, key, value)
        db.commit()
        db.refresh(song)
        return song


@app.delete("/songs/{song_id}")
def delete_song(song_id: int):
    with SessionLocal() as db:
        song = db.get(SongModel, song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        linked_items = db.query(RepertoireSongModel).filter_by(song_id=song_id).all()
        removed_from_repertoires = 0
        affected_repertoires = set()
        for item in linked_items:
            affected_repertoires.add(item.repertoire_id)
            db.delete(item)
            removed_from_repertoires += 1

        for repertoire_id in affected_repertoires:
            renumber_repertoire_songs(db, repertoire_id)

        db.delete(song)
        db.commit()
        return {
            "deleted": True,
            "id": song_id,
            "removed_from_repertoires": removed_from_repertoires,
        }


@app.get("/repertoires")
def list_repertoires():
    with SessionLocal() as db:
        reconcile_repertoires_with_events(db)
        deduplicate_all_repertoires(db)
        db.commit()
        return db.query(RepertoireModel).all()


@app.post("/repertoires", response_model=Repertoire)
def create_repertoire(payload: RepertoireCreate):
    with SessionLocal() as db:
        repertoire = ensure_repertoire_for_event(db, payload.event_id)
        return repertoire


@app.get("/repertoires/{repertoire_id}", response_model=Repertoire)
def get_repertoire(repertoire_id: int):
    with SessionLocal() as db:
        repertoire = db.get(RepertoireModel, repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        return repertoire


@app.put("/repertoires/{repertoire_id}", response_model=Repertoire)
def update_repertoire(repertoire_id: int, payload: RepertoireCreate):
    with SessionLocal() as db:
        repertoire = db.get(RepertoireModel, repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        for key, value in payload.dict().items():
            setattr(repertoire, key, value)
        db.commit()
        db.refresh(repertoire)
        return repertoire


@app.delete("/repertoires/{repertoire_id}")
def delete_repertoire(repertoire_id: int):
    with SessionLocal() as db:
        repertoire = db.get(RepertoireModel, repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        delete_repertoire_and_songs(db, repertoire)
        db.commit()
        return {"deleted": True, "id": repertoire_id}


@app.delete("/repertoires/by-event/{event_id}")
def delete_repertoire_by_event(event_id: int):
    with SessionLocal() as db:
        deleted_ids = delete_repertoires_for_event(db, event_id)
        db.commit()
        return {"deleted": True, "event_id": event_id, "repertoire_ids": deleted_ids}


@app.get("/repertoire-songs")
def list_repertoire_songs():
    with SessionLocal() as db:
        return db.query(RepertoireSongModel).all()


@app.post("/repertoire-songs", response_model=RepertoireSong)
def create_repertoire_song(payload: RepertoireSongCreate):
    with SessionLocal() as db:
        repertoire = db.get(RepertoireModel, payload.repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        song = db.get(SongModel, payload.song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        existing = (
            db.query(RepertoireSongModel)
            .filter_by(repertoire_id=payload.repertoire_id, song_id=payload.song_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Song already in repertoire")

        next_order = payload.orden
        if next_order is None:
            max_order = (
                db.query(func.max(RepertoireSongModel.orden))
                .filter_by(repertoire_id=payload.repertoire_id)
                .scalar()
            )
            next_order = (max_order or 0) + 1

        item = RepertoireSongModel(
            repertoire_id=payload.repertoire_id,
            song_id=payload.song_id,
            orden=next_order,
            tonalidad_override=payload.tonalidad_override,
            bpm_override=payload.bpm_override,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item


@app.get("/repertoire-songs/{item_id}", response_model=RepertoireSong)
def get_repertoire_song(item_id: int):
    with SessionLocal() as db:
        item = db.get(RepertoireSongModel, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Repertoire song not found")
        return item


@app.put("/repertoire-songs/{item_id}", response_model=RepertoireSong)
def update_repertoire_song(item_id: int, payload: RepertoireSongCreate):
    with SessionLocal() as db:
        item = db.get(RepertoireSongModel, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Repertoire song not found")
        repertoire = db.get(RepertoireModel, payload.repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")
        song = db.get(SongModel, payload.song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        existing = (
            db.query(RepertoireSongModel)
            .filter_by(repertoire_id=payload.repertoire_id, song_id=payload.song_id)
            .first()
        )
        if existing and existing.id != item_id:
            raise HTTPException(status_code=400, detail="Song already in repertoire")
        for key, value in payload.dict().items():
            setattr(item, key, value)
        db.commit()
        db.refresh(item)
        return item


@app.put("/repertoires/{repertoire_id}/repertoire-songs/reorder")
def reorder_repertoire_songs(repertoire_id: int, payload: RepertoireSongsReorder):
    with SessionLocal() as db:
        if payload.repertoire_id != repertoire_id:
            raise HTTPException(status_code=400, detail="repertoire_id mismatch between path and body")

        repertoire = db.get(RepertoireModel, repertoire_id)
        if not repertoire:
            raise HTTPException(status_code=404, detail="Repertoire not found")

        items = (
            db.query(RepertoireSongModel)
            .filter_by(repertoire_id=repertoire_id)
            .order_by(RepertoireSongModel.orden.asc(), RepertoireSongModel.id.asc())
            .all()
        )

        existing_ids = {item.id for item in items}
        incoming_ids = payload.ordered_item_ids

        if len(incoming_ids) != len(existing_ids):
            raise HTTPException(
                status_code=400,
                detail="ordered_item_ids must contain all repertoire song ids exactly once",
            )

        if len(set(incoming_ids)) != len(incoming_ids):
            raise HTTPException(status_code=400, detail="ordered_item_ids contains duplicates")

        if set(incoming_ids) != existing_ids:
            raise HTTPException(
                status_code=400,
                detail="ordered_item_ids does not match repertoire songs",
            )

        item_by_id = {item.id: item for item in items}
        for index, item_id in enumerate(incoming_ids, start=1):
            item_by_id[item_id].orden = index

        db.commit()
        return {
            "updated": True,
            "repertoire_id": repertoire_id,
            "total": len(incoming_ids),
        }


@app.post("/repertoire-songs/normalize")
def normalize_repertoire_songs(payload: RepertoireSongsNormalize):
    with SessionLocal() as db:
        if payload.repertoire_id is not None:
            repertoire = db.get(RepertoireModel, payload.repertoire_id)
            if not repertoire:
                raise HTTPException(status_code=404, detail="Repertoire not found")
            renumber_repertoire_songs(db, payload.repertoire_id)
            db.commit()
            return {
                "normalized": True,
                "scope": "single",
                "repertoire_id": payload.repertoire_id,
            }

        total = normalize_all_repertoire_songs(db)
        db.commit()
        return {
            "normalized": True,
            "scope": "all",
            "repertoires": total,
        }


@app.delete("/repertoire-songs/{item_id}")
def delete_repertoire_song(item_id: int):
    with SessionLocal() as db:
        item = db.get(RepertoireSongModel, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Repertoire song not found")
        repertoire_id = item.repertoire_id
        db.delete(item)
        renumber_repertoire_songs(db, repertoire_id)
        db.commit()
        return {"deleted": True, "id": item_id}
