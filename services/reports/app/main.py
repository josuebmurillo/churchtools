from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Reports Service", version="0.1.0")

DATABASE_URL = os.getenv("REPORTS_DATABASE_URL", "sqlite:///./reports.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class AttendanceSnapshotModel(Base):
    __tablename__ = "attendance_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(String, nullable=False)
    event_id = Column(Integer, nullable=True)
    total_asistencia = Column(Integer, nullable=False, default=0)
    total_visitantes = Column(Integer, nullable=False, default=0)


class ParticipationSnapshotModel(Base):
    __tablename__ = "participation_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(String, nullable=False)
    event_id = Column(Integer, nullable=True)
    total_activos = Column(Integer, nullable=False, default=0)
    total_voluntarios = Column(Integer, nullable=False, default=0)


class AttendanceSnapshotCreate(BaseModel):
    fecha: str
    event_id: int | None = None
    total_asistencia: int
    total_visitantes: int = 0


class ParticipationSnapshotCreate(BaseModel):
    fecha: str
    event_id: int | None = None
    total_activos: int
    total_voluntarios: int


def ensure_column_exists(table_name: str, column_name: str, column_sql: str) -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        return
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    ensure_column_exists("attendance_snapshots", "event_id", "INTEGER")
    ensure_column_exists("participation_snapshots", "event_id", "INTEGER")


@app.get("/health")
def health():
    return {"status": "ok", "service": "reports"}


@app.get("/reports/attendance")
def attendance_report():
    with SessionLocal() as db:
        latest = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.id.desc()).first()
        if not latest:
            return {"total_asistencia": 0, "total_visitantes": 0, "event_id": None}
        return {
            "total_asistencia": latest.total_asistencia,
            "total_visitantes": latest.total_visitantes,
            "event_id": latest.event_id,
        }


@app.get("/reports/attendance/history")
def attendance_history():
    with SessionLocal() as db:
        rows = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.fecha.asc()).all()
        return [
            {
                "fecha": row.fecha,
                "event_id": row.event_id,
                "total_asistencia": row.total_asistencia,
                "total_visitantes": row.total_visitantes,
            }
            for row in rows
        ]


@app.post("/reports/attendance/history")
def create_attendance_snapshot(payload: AttendanceSnapshotCreate):
    with SessionLocal() as db:
        snapshot = AttendanceSnapshotModel(
            fecha=payload.fecha,
            event_id=payload.event_id,
            total_asistencia=payload.total_asistencia,
            total_visitantes=payload.total_visitantes,
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "event_id": snapshot.event_id,
            "total_asistencia": snapshot.total_asistencia,
            "total_visitantes": snapshot.total_visitantes,
        }


@app.get("/reports/participation")
def participation_report():
    with SessionLocal() as db:
        latest = db.query(ParticipationSnapshotModel).order_by(ParticipationSnapshotModel.id.desc()).first()
        if not latest:
            return {"total_activos": 0, "total_voluntarios": 0, "event_id": None}
        return {
            "total_activos": latest.total_activos,
            "total_voluntarios": latest.total_voluntarios,
            "event_id": latest.event_id,
        }


@app.get("/reports/participation/history")
def participation_history():
    with SessionLocal() as db:
        rows = db.query(ParticipationSnapshotModel).order_by(ParticipationSnapshotModel.fecha.asc()).all()
        return [
            {
                "fecha": row.fecha,
                "event_id": row.event_id,
                "total_activos": row.total_activos,
                "total_voluntarios": row.total_voluntarios,
            }
            for row in rows
        ]


@app.post("/reports/participation/history")
def create_participation_snapshot(payload: ParticipationSnapshotCreate):
    with SessionLocal() as db:
        snapshot = ParticipationSnapshotModel(
            fecha=payload.fecha,
            event_id=payload.event_id,
            total_activos=payload.total_activos,
            total_voluntarios=payload.total_voluntarios,
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "event_id": snapshot.event_id,
            "total_activos": snapshot.total_activos,
            "total_voluntarios": snapshot.total_voluntarios,
        }
