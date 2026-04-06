from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, func
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Ministries Service", version="0.1.0")

DATABASE_URL = os.getenv("MINISTRIES_DATABASE_URL", "sqlite:///./ministries.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class MinistryModel(Base):
    __tablename__ = "ministries"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    parent_id = Column(Integer, nullable=True)


class TeamModel(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ministry_id = Column(Integer, nullable=True)
    description = Column(String, nullable=True)


class TeamRoleModel(Base):
    __tablename__ = "team_roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    level = Column(Integer, nullable=True)
    ministry_id = Column(Integer, nullable=True)


class TeamMemberModel(Base):
    __tablename__ = "team_members"
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, nullable=False)
    team_id = Column(Integer, nullable=False)
    role_id = Column(Integer, nullable=True)
    fecha_ingreso = Column(String, nullable=True)
    estado = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class MinistryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None


class Ministry(MinistryCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class TeamCreate(BaseModel):
    name: str
    ministry_id: Optional[int] = None
    description: Optional[str] = None


class Team(TeamCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class TeamRoleCreate(BaseModel):
    name: str
    level: Optional[int] = None
    ministry_id: int


class TeamRole(TeamRoleCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class TeamMemberCreate(BaseModel):
    person_id: int
    team_id: int
    role_id: Optional[int] = None
    fecha_ingreso: Optional[str] = None
    estado: Optional[str] = None


class TeamMember(TeamMemberCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


def get_ministry_delete_preview(db, ministry_id: int) -> dict:
    ministry = db.get(MinistryModel, ministry_id)
    if not ministry:
        raise HTTPException(status_code=404, detail="Ministry not found")

    team_ids = [team.id for team in db.query(TeamModel).filter_by(ministry_id=ministry_id).all()]
    role_ids = [role.id for role in db.query(TeamRoleModel).filter_by(ministry_id=ministry_id).all()]

    team_members_count = 0
    if team_ids:
        team_members_count = db.query(TeamMemberModel).filter(TeamMemberModel.team_id.in_(team_ids)).count()

    members_with_roles_count = 0
    if role_ids:
        members_with_roles_count = db.query(TeamMemberModel).filter(TeamMemberModel.role_id.in_(role_ids)).count()

    child_ministries_count = db.query(MinistryModel).filter(MinistryModel.parent_id == ministry_id).count()

    return {
        "ministry_id": ministry_id,
        "ministry_name": ministry.name,
        "teams": len(team_ids),
        "team_roles": len(role_ids),
        "team_members": team_members_count,
        "members_with_role_links": members_with_roles_count,
        "child_ministries": child_ministries_count,
        "requires_cascade": bool(team_ids or role_ids or team_members_count or members_with_roles_count or child_ministries_count),
    }


def delete_ministry_cascade(db, ministry: MinistryModel, preview: dict) -> dict:
    ministry_id = ministry.id

    teams = db.query(TeamModel).filter_by(ministry_id=ministry_id).all()
    roles = db.query(TeamRoleModel).filter_by(ministry_id=ministry_id).all()
    team_ids = [team.id for team in teams]
    role_ids = [role.id for role in roles]

    members_unassigned = 0
    if role_ids:
        members_unassigned = db.query(TeamMemberModel).filter(TeamMemberModel.role_id.in_(role_ids)).count()
        db.query(TeamMemberModel).filter(TeamMemberModel.role_id.in_(role_ids)).update(
            {TeamMemberModel.role_id: None},
            synchronize_session=False,
        )

    team_members_deleted = 0
    if team_ids:
        team_members_deleted = db.query(TeamMemberModel).filter(TeamMemberModel.team_id.in_(team_ids)).count()
        db.query(TeamMemberModel).filter(TeamMemberModel.team_id.in_(team_ids)).delete(synchronize_session=False)

    roles_deleted = 0
    if role_ids:
        roles_deleted = db.query(TeamRoleModel).filter(TeamRoleModel.id.in_(role_ids)).delete(synchronize_session=False)

    teams_deleted = 0
    if team_ids:
        teams_deleted = db.query(TeamModel).filter(TeamModel.id.in_(team_ids)).delete(synchronize_session=False)

    child_ministries_detached = db.query(MinistryModel).filter(MinistryModel.parent_id == ministry_id).update(
        {MinistryModel.parent_id: None},
        synchronize_session=False,
    )

    db.delete(ministry)
    db.commit()

    return {
        "deleted": True,
        "id": ministry_id,
        "cascade": True,
        "summary": {
            "teams_deleted": teams_deleted,
            "team_roles_deleted": roles_deleted,
            "team_members_deleted": team_members_deleted,
            "members_unassigned": members_unassigned,
            "child_ministries_detached": child_ministries_detached,
        },
        "preview": preview,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "ministries"}


@app.get("/ministries")
def list_ministries():
    with SessionLocal() as db:
        return db.query(MinistryModel).all()


@app.post("/ministries", response_model=Ministry)
def create_ministry(payload: MinistryCreate):
    with SessionLocal() as db:
        if payload.parent_id:
            parent = db.get(MinistryModel, payload.parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent ministry not found")
        ministry = MinistryModel(**payload.dict())
        db.add(ministry)
        db.commit()
        db.refresh(ministry)
        return ministry


@app.get("/ministries/{ministry_id}", response_model=Ministry)
def get_ministry(ministry_id: int):
    with SessionLocal() as db:
        ministry = db.get(MinistryModel, ministry_id)
        if not ministry:
            raise HTTPException(status_code=404, detail="Ministry not found")
        return ministry


@app.put("/ministries/{ministry_id}", response_model=Ministry)
def update_ministry(ministry_id: int, payload: MinistryCreate):
    with SessionLocal() as db:
        ministry = db.get(MinistryModel, ministry_id)
        if not ministry:
            raise HTTPException(status_code=404, detail="Ministry not found")
        if payload.parent_id:
            if payload.parent_id == ministry_id:
                raise HTTPException(status_code=400, detail="Ministry cannot be its own parent")
            parent = db.get(MinistryModel, payload.parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent ministry not found")
        for key, value in payload.dict().items():
            setattr(ministry, key, value)
        db.commit()
        db.refresh(ministry)
        return ministry


@app.delete("/ministries/{ministry_id}")
def delete_ministry(ministry_id: int, cascade: bool = Query(default=False)):
    with SessionLocal() as db:
        ministry = db.get(MinistryModel, ministry_id)
        if not ministry:
            raise HTTPException(status_code=404, detail="Ministry not found")

        preview = get_ministry_delete_preview(db, ministry_id)
        if preview["requires_cascade"] and not cascade:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Ministry has related records",
                    "preview": preview,
                },
            )

        if cascade:
            return delete_ministry_cascade(db, ministry, preview)

        db.delete(ministry)
        db.commit()
        return {"deleted": True, "id": ministry_id, "cascade": False}


@app.get("/ministries/{ministry_id}/delete-preview")
def ministry_delete_preview(ministry_id: int):
    with SessionLocal() as db:
        return get_ministry_delete_preview(db, ministry_id)


@app.get("/teams")
def list_teams():
    with SessionLocal() as db:
        return db.query(TeamModel).all()


@app.post("/teams", response_model=Team)
def create_team(payload: TeamCreate):
    with SessionLocal() as db:
        if payload.ministry_id:
            ministry = db.get(MinistryModel, payload.ministry_id)
            if not ministry:
                raise HTTPException(status_code=404, detail="Ministry not found")
        team = TeamModel(**payload.dict())
        db.add(team)
        db.commit()
        db.refresh(team)
        return team


@app.get("/teams/{team_id}", response_model=Team)
def get_team(team_id: int):
    with SessionLocal() as db:
        team = db.get(TeamModel, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        return team


@app.put("/teams/{team_id}", response_model=Team)
def update_team(team_id: int, payload: TeamCreate):
    with SessionLocal() as db:
        team = db.get(TeamModel, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        if payload.ministry_id:
            ministry = db.get(MinistryModel, payload.ministry_id)
            if not ministry:
                raise HTTPException(status_code=404, detail="Ministry not found")
        for key, value in payload.dict().items():
            setattr(team, key, value)
        db.commit()
        db.refresh(team)
        return team


@app.delete("/teams/{team_id}")
def delete_team(team_id: int):
    with SessionLocal() as db:
        team = db.get(TeamModel, team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        member = db.query(TeamMemberModel).filter_by(team_id=team_id).first()
        if member:
            raise HTTPException(status_code=400, detail="Team has members")
        db.delete(team)
        db.commit()
        return {"deleted": True, "id": team_id}


@app.get("/team-roles")
def list_team_roles():
    with SessionLocal() as db:
        return db.query(TeamRoleModel).all()


@app.post("/team-roles", response_model=TeamRole)
def create_team_role(payload: TeamRoleCreate):
    with SessionLocal() as db:
        ministry = db.get(MinistryModel, payload.ministry_id)
        if not ministry:
            raise HTTPException(status_code=404, detail="Ministry not found")
        existing = (
            db.query(TeamRoleModel)
            .filter(func.lower(TeamRoleModel.name) == payload.name.lower())
            .filter(TeamRoleModel.ministry_id == payload.ministry_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Role already exists")
        role = TeamRoleModel(**payload.dict())
        db.add(role)
        db.commit()
        db.refresh(role)
        return role


@app.get("/team-roles/{role_id}", response_model=TeamRole)
def get_team_role(role_id: int):
    with SessionLocal() as db:
        role = db.get(TeamRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role


@app.put("/team-roles/{role_id}", response_model=TeamRole)
def update_team_role(role_id: int, payload: TeamRoleCreate):
    with SessionLocal() as db:
        role = db.get(TeamRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        ministry = db.get(MinistryModel, payload.ministry_id)
        if not ministry:
            raise HTTPException(status_code=404, detail="Ministry not found")
        existing = (
            db.query(TeamRoleModel)
            .filter(func.lower(TeamRoleModel.name) == payload.name.lower())
            .filter(TeamRoleModel.ministry_id == payload.ministry_id)
            .first()
        )
        if existing and existing.id != role_id:
            raise HTTPException(status_code=400, detail="Role already exists")
        for key, value in payload.dict().items():
            setattr(role, key, value)
        db.commit()
        db.refresh(role)
        return role


@app.delete("/team-roles/{role_id}")
def delete_team_role(role_id: int):
    with SessionLocal() as db:
        role = db.get(TeamRoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")

        members_with_role = db.query(TeamMemberModel).filter_by(role_id=role_id).all()
        for member in members_with_role:
            member.role_id = None

        db.delete(role)
        db.commit()
        return {
            "deleted": True,
            "id": role_id,
            "unassigned_members": len(members_with_role),
        }


@app.get("/team-members")
def list_team_members():
    with SessionLocal() as db:
        return db.query(TeamMemberModel).all()


@app.post("/team-members", response_model=TeamMember)
def create_team_member(payload: TeamMemberCreate):
    with SessionLocal() as db:
        team = db.get(TeamModel, payload.team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        if payload.role_id:
            role = db.get(TeamRoleModel, payload.role_id)
            if not role:
                raise HTTPException(status_code=404, detail="Role not found")
            if role.ministry_id and team.ministry_id and role.ministry_id != team.ministry_id:
                raise HTTPException(status_code=400, detail="Role does not belong to team ministry")
        existing = (
            db.query(TeamMemberModel)
            .filter_by(team_id=payload.team_id, person_id=payload.person_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Member already in team")
        member = TeamMemberModel(**payload.dict())
        db.add(member)
        db.commit()
        db.refresh(member)
        return member


@app.get("/team-members/{member_id}", response_model=TeamMember)
def get_team_member(member_id: int):
    with SessionLocal() as db:
        member = db.get(TeamMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Team member not found")
        return member


@app.put("/team-members/{member_id}", response_model=TeamMember)
def update_team_member(member_id: int, payload: TeamMemberCreate):
    with SessionLocal() as db:
        member = db.get(TeamMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Team member not found")
        team = db.get(TeamModel, payload.team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        if payload.role_id:
            role = db.get(TeamRoleModel, payload.role_id)
            if not role:
                raise HTTPException(status_code=404, detail="Role not found")
            if role.ministry_id and team.ministry_id and role.ministry_id != team.ministry_id:
                raise HTTPException(status_code=400, detail="Role does not belong to team ministry")
        existing = (
            db.query(TeamMemberModel)
            .filter_by(team_id=payload.team_id, person_id=payload.person_id)
            .first()
        )
        if existing and existing.id != member_id:
            raise HTTPException(status_code=400, detail="Member already in team")
        for key, value in payload.dict().items():
            setattr(member, key, value)
        db.commit()
        db.refresh(member)
        return member


@app.delete("/team-members/{member_id}")
def delete_team_member(member_id: int):
    with SessionLocal() as db:
        member = db.get(TeamMemberModel, member_id)
        if not member:
            raise HTTPException(status_code=404, detail="Team member not found")
        db.delete(member)
        db.commit()
        return {"deleted": True, "id": member_id}
