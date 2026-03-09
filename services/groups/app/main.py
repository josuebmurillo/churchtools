from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Groups Service", version="0.1.0")

DATABASE_URL = os.getenv("GROUPS_DATABASE_URL", "sqlite:///./groups.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class SmallGroupModel(Base):
    __tablename__ = "small_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    leader_person_id = Column(Integer, nullable=False)
    ministry_id = Column(Integer, nullable=True)
    meeting_schedule = Column(String, nullable=True)


class SmallGroupMemberModel(Base):
    __tablename__ = "small_group_members"
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, nullable=False)
    person_id = Column(Integer, nullable=False)
    fecha_ingreso = Column(String, nullable=True)
    estado = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class SmallGroupCreate(BaseModel):
    name: str
    leader_person_id: int
    ministry_id: Optional[int] = None
    meeting_schedule: Optional[str] = None


class SmallGroup(SmallGroupCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class SmallGroupMemberCreate(BaseModel):
    group_id: int
    person_id: int
    fecha_ingreso: Optional[str] = None
    estado: Optional[str] = None


class SmallGroupMember(SmallGroupMemberCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "groups"}


@app.get("/small-groups")
def list_groups():
    with SessionLocal() as db:
        return db.query(SmallGroupModel).all()


@app.post("/small-groups", response_model=SmallGroup)
def create_group(payload: SmallGroupCreate):
    with SessionLocal() as db:
        group = SmallGroupModel(**payload.dict())
        db.add(group)
        db.commit()
        db.refresh(group)
        return group


@app.get("/small-groups/{group_id}", response_model=SmallGroup)
def get_group(group_id: int):
    with SessionLocal() as db:
        group = db.get(SmallGroupModel, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        return group


@app.put("/small-groups/{group_id}", response_model=SmallGroup)
def update_group(group_id: int, payload: SmallGroupCreate):
    with SessionLocal() as db:
        group = db.get(SmallGroupModel, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        for key, value in payload.dict().items():
            setattr(group, key, value)
        db.commit()
        db.refresh(group)
        return group


@app.delete("/small-groups/{group_id}")
def delete_group(group_id: int):
    with SessionLocal() as db:
        group = db.get(SmallGroupModel, group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        member = db.query(SmallGroupMemberModel).filter_by(group_id=group_id).first()
        if member:
            raise HTTPException(status_code=400, detail="Group has members")
        db.delete(group)
        db.commit()
        return {"deleted": True, "id": group_id}


@app.get("/small-group-members")
def list_group_members():
    with SessionLocal() as db:
        return db.query(SmallGroupMemberModel).all()


@app.post("/small-group-members", response_model=SmallGroupMember)
def create_group_member(payload: SmallGroupMemberCreate):
    with SessionLocal() as db:
        group = db.get(SmallGroupModel, payload.group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        existing = (
            db.query(SmallGroupMemberModel)
            .filter_by(group_id=payload.group_id, person_id=payload.person_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Member already in group")
        member = SmallGroupMemberModel(**payload.dict())
        db.add(member)
        db.commit()
        db.refresh(member)
        return member


@app.get("/small-group-members/{member_id}", response_model=SmallGroupMember)
def get_group_member(member_id: int):
    with SessionLocal() as db:
        member = db.get(SmallGroupMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Group member not found")
        return member


@app.put("/small-group-members/{member_id}", response_model=SmallGroupMember)
def update_group_member(member_id: int, payload: SmallGroupMemberCreate):
    with SessionLocal() as db:
        member = db.get(SmallGroupMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Group member not found")
        group = db.get(SmallGroupModel, payload.group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        existing = (
            db.query(SmallGroupMemberModel)
            .filter_by(group_id=payload.group_id, person_id=payload.person_id)
            .first()
        )
        if existing and existing.id != member_id:
            raise HTTPException(status_code=400, detail="Member already in group")
        for key, value in payload.dict().items():
            setattr(member, key, value)
        db.commit()
        db.refresh(member)
        return member


@app.delete("/small-group-members/{member_id}")
def delete_group_member(member_id: int):
    with SessionLocal() as db:
        member = db.get(SmallGroupMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Group member not found")
        db.delete(member)
        db.commit()
        return {"deleted": True, "id": member_id}
