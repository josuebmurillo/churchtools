from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Vendors Service", version="0.1.0")

DATABASE_URL = os.getenv("VENDORS_DATABASE_URL", "sqlite:///./vendors.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class VendorModel(Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    contact_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    category = Column(String, nullable=True)
    description = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class VendorCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None


class Vendor(VendorCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "vendors"}


@app.get("/vendors", response_model=list[Vendor])
def list_vendors():
    with SessionLocal() as db:
        return db.query(VendorModel).order_by(VendorModel.name).all()


@app.post("/vendors", response_model=Vendor, status_code=201)
def create_vendor(payload: VendorCreate):
    with SessionLocal() as db:
        vendor = VendorModel(**payload.dict())
        db.add(vendor)
        db.commit()
        db.refresh(vendor)
        return vendor


@app.get("/vendors/{vendor_id}", response_model=Vendor)
def get_vendor(vendor_id: int):
    with SessionLocal() as db:
        vendor = db.get(VendorModel, vendor_id)
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        return vendor


@app.put("/vendors/{vendor_id}", response_model=Vendor)
def update_vendor(vendor_id: int, payload: VendorCreate):
    with SessionLocal() as db:
        vendor = db.get(VendorModel, vendor_id)
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        for key, value in payload.dict().items():
            setattr(vendor, key, value)
        db.commit()
        db.refresh(vendor)
        return vendor


@app.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: int):
    with SessionLocal() as db:
        vendor = db.get(VendorModel, vendor_id)
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        db.delete(vendor)
        db.commit()
        return {"deleted": True, "id": vendor_id}
