from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Events Service", version="0.1.0")

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
    ensure_event_schedules_extra_columns()


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
        db.delete(event)
        db.commit()
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
        event = db.get(EventModel, payload.event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Schedule start must be before end")
        for key, value in payload.dict().items():
            setattr(schedule, key, value)
        db.commit()
        db.refresh(schedule)
        return schedule


@app.delete("/event-schedules/{schedule_id}")
def delete_schedule(schedule_id: int):
    with SessionLocal() as db:
        schedule = db.get(EventScheduleModel, schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        db.delete(schedule)
        db.commit()
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
