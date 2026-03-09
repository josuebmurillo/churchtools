from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Text, func, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Music Service", version="0.1.0")

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
        return db.query(RepertoireModel).all()


@app.post("/repertoires", response_model=Repertoire)
def create_repertoire(payload: RepertoireCreate):
    with SessionLocal() as db:
        repertoire = RepertoireModel(**payload.dict())
        db.add(repertoire)
        db.commit()
        db.refresh(repertoire)
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
        db.delete(repertoire)
        db.commit()
        return {"deleted": True, "id": repertoire_id}


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
