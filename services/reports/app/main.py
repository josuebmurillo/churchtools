from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import httpx

app = FastAPI(title="Reports Service", version="0.1.0")

DATABASE_URL = os.getenv("REPORTS_DATABASE_URL", "sqlite:///./reports.db")
EVENTS_SERVICE_URL = os.getenv("EVENTS_SERVICE_URL", "http://events:8000")
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
    total_servidores = Column(Integer, nullable=False, default=0)


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
    total_visitantes: int = 0
    total_servidores: int = 0


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


def get_event_for_attendance(event_id: int) -> dict:
    try:
        response = httpx.get(f"{EVENTS_SERVICE_URL}/events/{event_id}", timeout=10)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Events service unavailable") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Event not found")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Could not validate event")
    return response.json()


def resolve_attendance_fecha_and_event(fecha: str, event_id: int | None) -> tuple[str, int | None]:
    if event_id is None:
        return fecha, None

    event = get_event_for_attendance(event_id)
    if not event.get("is_worship", False):
        raise HTTPException(status_code=400, detail="Attendance reports only allow events marked as culto")

    event_date = (event.get("date") or "").strip()
    if not event_date:
        raise HTTPException(status_code=400, detail="Selected culto event must have a date")

    return event_date.split("T")[0], event_id


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    ensure_column_exists("attendance_snapshots", "event_id", "INTEGER")
    ensure_column_exists("attendance_snapshots", "total_servidores", "INTEGER DEFAULT 0")
    ensure_column_exists("participation_snapshots", "event_id", "INTEGER")
    with engine.begin() as connection:
        connection.execute(text("UPDATE attendance_snapshots SET total_servidores = 0 WHERE total_servidores IS NULL"))


@app.get("/health")
def health():
    return {"status": "ok", "service": "reports"}


@app.get("/reports/attendance")
def attendance_report():
    with SessionLocal() as db:
        latest = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.id.desc()).first()
        if not latest:
            return {"total_asistencia": 0, "total_visitantes": 0, "total_servidores": 0, "event_id": None}
        return {
            "total_asistencia": latest.total_asistencia,
            "total_visitantes": latest.total_visitantes,
            "total_servidores": latest.total_servidores,
            "event_id": latest.event_id,
        }


@app.get("/reports/attendance/history")
def attendance_history():
    with SessionLocal() as db:
        rows = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.fecha.asc()).all()
        return [
            {
                "id": row.id,
                "fecha": row.fecha,
                "event_id": row.event_id,
                "total_asistencia": row.total_asistencia,
                "total_visitantes": row.total_visitantes,
                "total_servidores": row.total_servidores,
            }
            for row in rows
        ]


@app.post("/reports/attendance/history")
def create_attendance_snapshot(payload: AttendanceSnapshotCreate):
    fecha, event_id = resolve_attendance_fecha_and_event(payload.fecha, payload.event_id)
    total_visitantes = max(payload.total_visitantes, 0)
    total_servidores = max(payload.total_servidores, 0)
    total_asistencia = total_visitantes + total_servidores

    with SessionLocal() as db:
        snapshot = AttendanceSnapshotModel(
            fecha=fecha,
            event_id=event_id,
            total_asistencia=total_asistencia,
            total_visitantes=total_visitantes,
            total_servidores=total_servidores,
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
            "total_servidores": snapshot.total_servidores,
        }


@app.put("/reports/attendance/history/{snapshot_id}")
def update_attendance_snapshot(snapshot_id: int, payload: AttendanceSnapshotCreate):
    fecha, event_id = resolve_attendance_fecha_and_event(payload.fecha, payload.event_id)
    total_visitantes = max(payload.total_visitantes, 0)
    total_servidores = max(payload.total_servidores, 0)
    total_asistencia = total_visitantes + total_servidores

    with SessionLocal() as db:
        snapshot = db.get(AttendanceSnapshotModel, snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Attendance snapshot not found")
        snapshot.fecha = fecha
        snapshot.event_id = event_id
        snapshot.total_asistencia = total_asistencia
        snapshot.total_visitantes = total_visitantes
        snapshot.total_servidores = total_servidores
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "event_id": snapshot.event_id,
            "total_asistencia": snapshot.total_asistencia,
            "total_visitantes": snapshot.total_visitantes,
            "total_servidores": snapshot.total_servidores,
        }


@app.delete("/reports/attendance/history/{snapshot_id}")
def delete_attendance_snapshot(snapshot_id: int):
    with SessionLocal() as db:
        snapshot = db.get(AttendanceSnapshotModel, snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Attendance snapshot not found")
        db.delete(snapshot)
        db.commit()
        return {"deleted": True, "id": snapshot_id}


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
                "id": row.id,
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


@app.put("/reports/participation/history/{snapshot_id}")
def update_participation_snapshot(snapshot_id: int, payload: ParticipationSnapshotCreate):
    with SessionLocal() as db:
        snapshot = db.get(ParticipationSnapshotModel, snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Participation snapshot not found")
        snapshot.fecha = payload.fecha
        snapshot.event_id = payload.event_id
        snapshot.total_activos = payload.total_activos
        snapshot.total_voluntarios = payload.total_voluntarios
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "event_id": snapshot.event_id,
            "total_activos": snapshot.total_activos,
            "total_voluntarios": snapshot.total_voluntarios,
        }


@app.delete("/reports/participation/history/{snapshot_id}")
def delete_participation_snapshot(snapshot_id: int):
    with SessionLocal() as db:
        snapshot = db.get(ParticipationSnapshotModel, snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Participation snapshot not found")
        db.delete(snapshot)
        db.commit()
        return {"deleted": True, "id": snapshot_id}
