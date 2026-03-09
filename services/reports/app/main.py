from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
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
    total_asistencia = Column(Integer, nullable=False, default=0)
    total_visitantes = Column(Integer, nullable=False, default=0)


class ParticipationSnapshotModel(Base):
    __tablename__ = "participation_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(String, nullable=False)
    total_activos = Column(Integer, nullable=False, default=0)
    total_voluntarios = Column(Integer, nullable=False, default=0)


class AttendanceSnapshotCreate(BaseModel):
    fecha: str
    total_asistencia: int
    total_visitantes: int = 0


class ParticipationSnapshotCreate(BaseModel):
    fecha: str
    total_activos: int
    total_voluntarios: int


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "service": "reports"}


@app.get("/reports/attendance")
def attendance_report():
    with SessionLocal() as db:
        latest = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.id.desc()).first()
        if not latest:
            return {"total_asistencia": 0, "total_visitantes": 0}
        return {"total_asistencia": latest.total_asistencia, "total_visitantes": latest.total_visitantes}


@app.get("/reports/attendance/history")
def attendance_history():
    with SessionLocal() as db:
        rows = db.query(AttendanceSnapshotModel).order_by(AttendanceSnapshotModel.fecha.asc()).all()
        return [
            {
                "fecha": row.fecha,
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
            total_asistencia=payload.total_asistencia,
            total_visitantes=payload.total_visitantes,
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "total_asistencia": snapshot.total_asistencia,
            "total_visitantes": snapshot.total_visitantes,
        }


@app.get("/reports/participation")
def participation_report():
    with SessionLocal() as db:
        latest = db.query(ParticipationSnapshotModel).order_by(ParticipationSnapshotModel.id.desc()).first()
        if not latest:
            return {"total_activos": 0, "total_voluntarios": 0}
        return {"total_activos": latest.total_activos, "total_voluntarios": latest.total_voluntarios}


@app.get("/reports/participation/history")
def participation_history():
    with SessionLocal() as db:
        rows = db.query(ParticipationSnapshotModel).order_by(ParticipationSnapshotModel.fecha.asc()).all()
        return [
            {
                "fecha": row.fecha,
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
            total_activos=payload.total_activos,
            total_voluntarios=payload.total_voluntarios,
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return {
            "id": snapshot.id,
            "fecha": snapshot.fecha,
            "total_activos": snapshot.total_activos,
            "total_voluntarios": snapshot.total_voluntarios,
        }
