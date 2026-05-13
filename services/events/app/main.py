from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Boolean, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from urllib import error, request
import json
import os

app = FastAPI(title="Events Service", version="0.1.0")

MUSIC_SERVICE_URL = os.getenv("MUSIC_SERVICE_URL", "http://music:8000")

DATABASE_URL = os.getenv("EVENTS_DATABASE_URL", "sqlite:///./events.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class EventModel(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    date = Column(String, nullable=True)
    ministry_id = Column(Integer, nullable=True)
    schedule = Column(String, nullable=True)
    is_worship = Column(Boolean, nullable=False, default=False)


class EventScheduleModel(Base):
    __tablename__ = "event_schedules"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, nullable=False)
    inicio = Column(String, nullable=True)
    fin = Column(String, nullable=True)
    tipo = Column(String, nullable=True)
    observacion = Column(String, nullable=True)
    encargado_person_id = Column(Integer, nullable=True)


class EventAssignmentModel(Base):
    __tablename__ = "event_assignments"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, nullable=False)
    team_id = Column(Integer, nullable=False)
    responsable_person_id = Column(Integer, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    ensure_events_is_worship_column()
    ensure_event_schedules_extra_columns()


def ensure_events_is_worship_column():
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "events" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("events")}
    if "is_worship" in columns:
        return

    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            connection.execute(text("ALTER TABLE events ADD COLUMN is_worship BOOLEAN DEFAULT 0"))
            connection.execute(text("UPDATE events SET is_worship = 0 WHERE is_worship IS NULL"))
        else:
            connection.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS is_worship BOOLEAN DEFAULT FALSE"))
            connection.execute(text("UPDATE events SET is_worship = FALSE WHERE is_worship IS NULL"))


def ensure_event_schedules_extra_columns():
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "event_schedules" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("event_schedules")}
    with engine.begin() as connection:
        if "observacion" not in columns:
            if engine.dialect.name == "sqlite":
                connection.execute(text("ALTER TABLE event_schedules ADD COLUMN observacion VARCHAR"))
            else:
                connection.execute(text("ALTER TABLE event_schedules ADD COLUMN IF NOT EXISTS observacion VARCHAR"))

        if "encargado_person_id" not in columns:
            if engine.dialect.name == "sqlite":
                connection.execute(text("ALTER TABLE event_schedules ADD COLUMN encargado_person_id INTEGER"))
            else:
                connection.execute(text("ALTER TABLE event_schedules ADD COLUMN IF NOT EXISTS encargado_person_id INTEGER"))


class EventCreate(BaseModel):
    name: str
    date: Optional[str] = None
    ministry_id: Optional[int] = None
    schedule: Optional[str] = None
    is_worship: bool = False


class Event(EventCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class EventScheduleCreate(BaseModel):
    event_id: int
    inicio: Optional[str] = None
    fin: Optional[str] = None
    tipo: Optional[str] = None
    observacion: Optional[str] = None
    encargado_person_id: Optional[int] = None


class EventSchedule(EventScheduleCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class EventAssignmentCreate(BaseModel):
    event_id: int
    team_id: int
    responsable_person_id: Optional[int] = None


class EventAssignment(EventAssignmentCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


def is_worship_timeline_type(value: Optional[str]) -> bool:
    if not value:
        return False
    normalized = value.strip().lower()
    return normalized == "worship" or "alabanza" in normalized or "adoracion" in normalized or "adoración" in normalized


def event_has_worship_schedule(db, event_id: int) -> bool:
    schedules = db.query(EventScheduleModel).filter_by(event_id=event_id).all()
    return any(is_worship_timeline_type(schedule.tipo) for schedule in schedules)


def sync_repertoire_for_event(db, event_id: int) -> None:
    has_worship_schedule = event_has_worship_schedule(db, event_id)
    if has_worship_schedule:
        payload = json.dumps({"event_id": event_id}).encode()
        req = request.Request(
            f"{MUSIC_SERVICE_URL}/repertoires",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    else:
        req = request.Request(
            f"{MUSIC_SERVICE_URL}/repertoires/by-event/{event_id}",
            method="DELETE",
        )

    try:
        with request.urlopen(req, timeout=10):
            return
    except error.HTTPError as exc:
        detail = exc.read().decode() if exc.fp else exc.reason
        raise HTTPException(status_code=502, detail=f"Music sync failed: {detail}") from exc
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail="Music service unavailable") from exc


@app.get("/health")
def health():
    return {"status": "ok", "service": "events"}


@app.get("/events")
def list_events():
    with SessionLocal() as db:
        return db.query(EventModel).all()


@app.post("/events", response_model=Event)
def create_event(payload: EventCreate):
    with SessionLocal() as db:
        event = EventModel(**payload.dict())
        db.add(event)
        db.commit()
        db.refresh(event)
        return event


@app.get("/events/{event_id}", response_model=Event)
def get_event(event_id: int):
    with SessionLocal() as db:
        event = db.get(EventModel, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        return event


@app.put("/events/{event_id}", response_model=Event)
def update_event(event_id: int, payload: EventCreate):
    with SessionLocal() as db:
        event = db.get(EventModel, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        for key, value in payload.dict().items():
            setattr(event, key, value)
        db.commit()
        db.refresh(event)
        return event


@app.delete("/events/{event_id}")
def delete_event(event_id: int):
    with SessionLocal() as db:
        event = db.get(EventModel, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        schedules = db.query(EventScheduleModel).filter_by(event_id=event_id).all()
        assignments = db.query(EventAssignmentModel).filter_by(event_id=event_id).all()
        for schedule in schedules:
            db.delete(schedule)
        for assignment in assignments:
            db.delete(assignment)
        db.delete(event)
        db.commit()
        sync_repertoire_for_event(db, event_id)
        return {"deleted": True, "id": event_id}


@app.get("/event-schedules")
def list_schedules():
    with SessionLocal() as db:
        return db.query(EventScheduleModel).all()


@app.post("/event-schedules", response_model=EventSchedule)
def create_schedule(payload: EventScheduleCreate):
    with SessionLocal() as db:
        event = db.get(EventModel, payload.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Schedule start must be before end")
        schedule = EventScheduleModel(**payload.dict())
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        sync_repertoire_for_event(db, payload.event_id)
        return schedule


@app.get("/event-schedules/{schedule_id}", response_model=EventSchedule)
def get_schedule(schedule_id: int):
    with SessionLocal() as db:
        schedule = db.get(EventScheduleModel, schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return schedule


@app.put("/event-schedules/{schedule_id}", response_model=EventSchedule)
def update_schedule(schedule_id: int, payload: EventScheduleCreate):
    with SessionLocal() as db:
        schedule = db.get(EventScheduleModel, schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        previous_event_id = schedule.event_id
        event = db.get(EventModel, payload.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Schedule start must be before end")
        for key, value in payload.dict().items():
            setattr(schedule, key, value)
        db.commit()
        db.refresh(schedule)
        sync_repertoire_for_event(db, previous_event_id)
        if payload.event_id != previous_event_id:
            sync_repertoire_for_event(db, payload.event_id)
        return schedule


@app.delete("/event-schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    with SessionLocal() as db:
        schedule = db.get(EventScheduleModel, schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        event_id = schedule.event_id
        db.delete(schedule)
        db.commit()
        sync_repertoire_for_event(db, event_id)
        return {"deleted": True, "id": schedule_id}


@app.get("/event-assignments")
def list_assignments():
    with SessionLocal() as db:
        return db.query(EventAssignmentModel).all()


@app.post("/event-assignments", response_model=EventAssignment)
def create_assignment(payload: EventAssignmentCreate):
    with SessionLocal() as db:
        event = db.get(EventModel, payload.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        assignment = EventAssignmentModel(**payload.dict())
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment


@app.get("/event-assignments/{assignment_id}", response_model=EventAssignment)
def get_assignment(assignment_id: int):
    with SessionLocal() as db:
        assignment = db.get(EventAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return assignment


@app.put("/event-assignments/{assignment_id}", response_model=EventAssignment)
def update_assignment(assignment_id: int, payload: EventAssignmentCreate):
    with SessionLocal() as db:
        assignment = db.get(EventAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        event = db.get(EventModel, payload.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        for key, value in payload.dict().items():
            setattr(assignment, key, value)
        db.commit()
        db.refresh(assignment)
        return assignment


@app.delete("/event-assignments/{assignment_id}")
def delete_assignment(assignment_id: int):
    with SessionLocal() as db:
        assignment = db.get(EventAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        db.delete(assignment)
        db.commit()
        return {"deleted": True, "id": assignment_id}
