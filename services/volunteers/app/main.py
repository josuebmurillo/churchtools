from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Volunteers Service", version="0.1.0")

DATABASE_URL = os.getenv("VOLUNTEERS_DATABASE_URL", "sqlite:///./volunteers.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class VolunteerRoleModel(Base):
    __tablename__ = "volunteer_roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)


class ShiftModel(Base):
    __tablename__ = "shifts"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, nullable=False)
    role_id = Column(Integer, nullable=False)
    inicio = Column(String, nullable=True)
    fin = Column(String, nullable=True)


class ShiftAssignmentModel(Base):
    __tablename__ = "shift_assignments"
    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, nullable=False)
    person_id = Column(Integer, nullable=False)
    estado = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class VolunteerRoleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class VolunteerRole(VolunteerRoleCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ShiftCreate(BaseModel):
    event_id: int
    role_id: int
    inicio: Optional[str] = None
    fin: Optional[str] = None


class Shift(ShiftCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ShiftAssignmentCreate(BaseModel):
    shift_id: int
    person_id: int
    estado: Optional[str] = None


class ShiftAssignment(ShiftAssignmentCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


SHIFT_ASSIGNMENT_STATES = {"pendiente", "confirmado", "cancelado"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "volunteers"}


@app.get("/volunteer-roles")
def list_roles():
    with SessionLocal() as db:
        return db.query(VolunteerRoleModel).all()


@app.post("/volunteer-roles", response_model=VolunteerRole)
def create_role(payload: VolunteerRoleCreate):
    with SessionLocal() as db:
        role = VolunteerRoleModel(**payload.dict())
        db.add(role)
        db.commit()
        db.refresh(role)
        return role


@app.get("/volunteer-roles/{role_id}", response_model=VolunteerRole)
def get_role(role_id: int):
    with SessionLocal() as db:
        role = db.get(VolunteerRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role


@app.put("/volunteer-roles/{role_id}", response_model=VolunteerRole)
def update_role(role_id: int, payload: VolunteerRoleCreate):
    with SessionLocal() as db:
        role = db.get(VolunteerRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        for key, value in payload.dict().items():
            setattr(role, key, value)
        db.commit()
        db.refresh(role)
        return role


@app.delete("/volunteer-roles/{role_id}")
def delete_role(role_id: int):
    with SessionLocal() as db:
        role = db.get(VolunteerRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        shift = db.query(ShiftModel).filter_by(role_id=role_id).first()
        if shift:
            raise HTTPException(status_code=400, detail="Role has shifts")
        db.delete(role)
        db.commit()
        return {"deleted": True, "id": role_id}


@app.get("/shifts")
def list_shifts():
    with SessionLocal() as db:
        return db.query(ShiftModel).all()


@app.post("/shifts", response_model=Shift)
def create_shift(payload: ShiftCreate):
    with SessionLocal() as db:
        role = db.get(VolunteerRoleModel, payload.role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Shift start must be before end")
        shift = ShiftModel(**payload.dict())
        db.add(shift)
        db.commit()
        db.refresh(shift)
        return shift


@app.get("/shifts/{shift_id}", response_model=Shift)
def get_shift(shift_id: int):
    with SessionLocal() as db:
        shift = db.get(ShiftModel, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        return shift


@app.put("/shifts/{shift_id}", response_model=Shift)
def update_shift(shift_id: int, payload: ShiftCreate):
    with SessionLocal() as db:
        shift = db.get(ShiftModel, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        role = db.get(VolunteerRoleModel, payload.role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        if payload.inicio and payload.fin and payload.inicio >= payload.fin:
            raise HTTPException(status_code=400, detail="Shift start must be before end")
        for key, value in payload.dict().items():
            setattr(shift, key, value)
        db.commit()
        db.refresh(shift)
        return shift


@app.delete("/shifts/{shift_id}")
def delete_shift(shift_id: int):
    with SessionLocal() as db:
        shift = db.get(ShiftModel, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        db.delete(shift)
        db.commit()
        return {"deleted": True, "id": shift_id}


@app.get("/shift-assignments")
def list_assignments():
    with SessionLocal() as db:
        return db.query(ShiftAssignmentModel).all()


@app.post("/shift-assignments", response_model=ShiftAssignment)
def create_assignment(payload: ShiftAssignmentCreate):
    with SessionLocal() as db:
        shift = db.get(ShiftModel, payload.shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        existing = (
            db.query(ShiftAssignmentModel)
            .filter_by(shift_id=payload.shift_id, person_id=payload.person_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Assignment already exists")
        if payload.estado and payload.estado not in SHIFT_ASSIGNMENT_STATES:
            raise HTTPException(status_code=400, detail="Invalid assignment status")
        assignment = ShiftAssignmentModel(**payload.dict())
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment


@app.get("/shift-assignments/{assignment_id}", response_model=ShiftAssignment)
def get_assignment(assignment_id: int):
    with SessionLocal() as db:
        assignment = db.get(ShiftAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return assignment


@app.put("/shift-assignments/{assignment_id}", response_model=ShiftAssignment)
def update_assignment(assignment_id: int, payload: ShiftAssignmentCreate):
    with SessionLocal() as db:
        assignment = db.get(ShiftAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        shift = db.get(ShiftModel, payload.shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        existing = (
            db.query(ShiftAssignmentModel)
            .filter_by(shift_id=payload.shift_id, person_id=payload.person_id)
            .first()
        )
        if existing and existing.id != assignment_id:
            raise HTTPException(status_code=400, detail="Assignment already exists")
        if payload.estado and payload.estado not in SHIFT_ASSIGNMENT_STATES:
            raise HTTPException(status_code=400, detail="Invalid assignment status")
        for key, value in payload.dict().items():
            setattr(assignment, key, value)
        db.commit()
        db.refresh(assignment)
        return assignment


@app.delete("/shift-assignments/{assignment_id}")
def delete_assignment(assignment_id: int):
    with SessionLocal() as db:
        assignment = db.get(ShiftAssignmentModel, assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        db.delete(assignment)
        db.commit()
        return {"deleted": True, "id": assignment_id}
