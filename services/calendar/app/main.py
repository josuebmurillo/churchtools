from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Calendar Service", version="0.1.0")

DATABASE_URL = os.getenv("CALENDAR_DATABASE_URL", "sqlite:///./calendar.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class FacilityModel(Base):
    __tablename__ = "facilities"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    capacity = Column(Integer, nullable=True)


class ReservationModel(Base):
    __tablename__ = "reservations"
    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, nullable=False)
    event_id = Column(Integer, nullable=True)
    inicio = Column(String, nullable=True)
    fin = Column(String, nullable=True)
    responsable_person_id = Column(Integer, nullable=True)
    estado = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class FacilityCreate(BaseModel):
    name: str
    location: Optional[str] = None
    capacity: Optional[int] = None


class Facility(FacilityCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ReservationCreate(BaseModel):
    facility_id: int
    event_id: Optional[int] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    responsable_person_id: Optional[int] = None
    estado: Optional[str] = None


class Reservation(ReservationCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "calendar"}


@app.get("/facilities")
def list_facilities():
    with SessionLocal() as db:
        return db.query(FacilityModel).all()


@app.post("/facilities", response_model=Facility)
def create_facility(payload: FacilityCreate):
    with SessionLocal() as db:
        facility = FacilityModel(**payload.dict())
        db.add(facility)
        db.commit()
        db.refresh(facility)
        return facility


@app.get("/facilities/{facility_id}", response_model=Facility)
def get_facility(facility_id: int):
    with SessionLocal() as db:
        facility = db.get(FacilityModel, facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        return facility


@app.put("/facilities/{facility_id}", response_model=Facility)
def update_facility(facility_id: int, payload: FacilityCreate):
    with SessionLocal() as db:
        facility = db.get(FacilityModel, facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        for key, value in payload.dict().items():
            setattr(facility, key, value)
        db.commit()
        db.refresh(facility)
        return facility


@app.delete("/facilities/{facility_id}")
def delete_facility(facility_id: int):
    with SessionLocal() as db:
        facility = db.get(FacilityModel, facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        reservation = db.query(ReservationModel).filter_by(facility_id=facility_id).first()
        if reservation:
            raise HTTPException(status_code=400, detail="Facility has reservations")
        db.delete(facility)
        db.commit()
        return {"deleted": True, "id": facility_id}


@app.get("/reservations")
def list_reservations():
    with SessionLocal() as db:
        return db.query(ReservationModel).all()


@app.post("/reservations", response_model=Reservation)
def create_reservation(payload: ReservationCreate):
    with SessionLocal() as db:
        facility = db.get(FacilityModel, payload.facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Reservation start must be before end")
        if payload.inicio and payload.fin:
            overlap = (
                db.query(ReservationModel)
                .filter(ReservationModel.facility_id == payload.facility_id)
                .filter(ReservationModel.inicio < payload.fin)
                .filter(ReservationModel.fin > payload.inicio)
                .first()
            )
            if overlap:
                raise HTTPException(status_code=400, detail="Reservation overlaps existing booking")
        reservation = ReservationModel(**payload.dict())
        db.add(reservation)
        db.commit()
        db.refresh(reservation)
        return reservation


@app.get("/reservations/{reservation_id}", response_model=Reservation)
def get_reservation(reservation_id: int):
    with SessionLocal() as db:
        reservation = db.get(ReservationModel, reservation_id)
        if not reservation:
            raise HTTPException(status_code=404, detail="Reservation not found")
        return reservation


@app.put("/reservations/{reservation_id}", response_model=Reservation)
def update_reservation(reservation_id: int, payload: ReservationCreate):
    with SessionLocal() as db:
        reservation = db.get(ReservationModel, reservation_id)
        if not reservation:
            raise HTTPException(status_code=404, detail="Reservation not found")
        facility = db.get(FacilityModel, payload.facility_id)
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Reservation start must be before end")
        if payload.inicio and payload.fin:
            overlap = (
                db.query(ReservationModel)
                .filter(ReservationModel.facility_id == payload.facility_id)
                .filter(ReservationModel.inicio < payload.fin)
                .filter(ReservationModel.fin > payload.inicio)
                .filter(ReservationModel.id != reservation_id)
                .first()
            )
            if overlap:
                raise HTTPException(status_code=400, detail="Reservation overlaps existing booking")
        for key, value in payload.dict().items():
            setattr(reservation, key, value)
        db.commit()
        db.refresh(reservation)
        return reservation


@app.delete("/reservations/{reservation_id}")
def delete_reservation(reservation_id: int):
    with SessionLocal() as db:
        reservation = db.get(ReservationModel, reservation_id)
        if not reservation:
            raise HTTPException(status_code=404, detail="Reservation not found")
        db.delete(reservation)
        db.commit()
        return {"deleted": True, "id": reservation_id}
