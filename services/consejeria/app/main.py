from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Consejeria Service", version="0.1.0")

DATABASE_URL = os.getenv("CONSEJERIA_DATABASE_URL", "sqlite:///./consejeria.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ConsejeriaModel(Base):
    __tablename__ = "consejerias"
    id = Column(Integer, primary_key=True, index=True)
    solicitante_person_id = Column(Integer, nullable=False)
    consejero_person_id = Column(Integer, nullable=False)
    fecha = Column(String, nullable=False)
    motivo = Column(String, nullable=False)
    observaciones = Column(String, nullable=True)
    estado = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class ConsejeriaCreate(BaseModel):
    solicitante_person_id: int
    consejero_person_id: int
    fecha: str
    motivo: str
    observaciones: Optional[str] = None
    estado: Optional[str] = None


class Consejeria(ConsejeriaCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


CONSEJERIA_STATES = {"abierta", "en_proceso", "cerrada"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "consejeria"}


@app.get("/consejerias")
def list_consejerias(
    solicitante_person_id: Optional[int] = None,
    consejero_person_id: Optional[int] = None,
):
    with SessionLocal() as db:
        query = db.query(ConsejeriaModel)
        if solicitante_person_id:
            query = query.filter(ConsejeriaModel.solicitante_person_id == solicitante_person_id)
        if consejero_person_id:
            query = query.filter(ConsejeriaModel.consejero_person_id == consejero_person_id)
        return query.all()


@app.post("/consejerias", response_model=Consejeria)
def create_consejeria(payload: ConsejeriaCreate):
    with SessionLocal() as db:
        if payload.solicitante_person_id == payload.consejero_person_id:
            raise HTTPException(
                status_code=400,
                detail="Counselor and requesting person must be different",
            )
        if payload.estado and payload.estado not in CONSEJERIA_STATES:
            raise HTTPException(status_code=400, detail="Invalid consejeria status")
        consejeria = ConsejeriaModel(**payload.dict())
        db.add(consejeria)
        db.commit()
        db.refresh(consejeria)
        return consejeria


@app.get("/consejerias/{consejeria_id}", response_model=Consejeria)
def get_consejeria(consejeria_id: int):
    with SessionLocal() as db:
        consejeria = db.get(ConsejeriaModel, consejeria_id)
        if not consejeria:
            raise HTTPException(status_code=404, detail="Consejeria not found")
        return consejeria


@app.put("/consejerias/{consejeria_id}", response_model=Consejeria)
def update_consejeria(consejeria_id: int, payload: ConsejeriaCreate):
    with SessionLocal() as db:
        consejeria = db.get(ConsejeriaModel, consejeria_id)
        if not consejeria:
            raise HTTPException(status_code=404, detail="Consejeria not found")
        if payload.solicitante_person_id == payload.consejero_person_id:
            raise HTTPException(
                status_code=400,
                detail="Counselor and requesting person must be different",
            )
        if payload.estado and payload.estado not in CONSEJERIA_STATES:
            raise HTTPException(status_code=400, detail="Invalid consejeria status")
        for key, value in payload.dict().items():
            setattr(consejeria, key, value)
        db.commit()
        db.refresh(consejeria)
        return consejeria


@app.delete("/consejerias/{consejeria_id}")
def delete_consejeria(consejeria_id: int):
    with SessionLocal() as db:
        consejeria = db.get(ConsejeriaModel, consejeria_id)
        if not consejeria:
            raise HTTPException(status_code=404, detail="Consejeria not found")
        db.delete(consejeria)
        db.commit()
        return {"deleted": True, "id": consejeria_id}


@app.get("/consejerias/solicitante/{person_id}")
def list_by_solicitante(person_id: int):
    with SessionLocal() as db:
        return db.query(ConsejeriaModel).filter_by(solicitante_person_id=person_id).all()


@app.get("/consejerias/consejero/{person_id}")
def list_by_consejero(person_id: int):
    with SessionLocal() as db:
        return db.query(ConsejeriaModel).filter_by(consejero_person_id=person_id).all()
