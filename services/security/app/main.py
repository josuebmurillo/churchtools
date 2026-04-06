from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Boolean, func
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta

app = FastAPI(title="Security Service", version="0.1.0")

MODULE_ROLE_DEFINITIONS = {
    "admin": "Acceso al modulo de administracion",
    "music": "Acceso al modulo de musicos",
    "volunteers": "Acceso al modulo de voluntarios",
}

MODULE_PERMISSION_DEFINITIONS = {
    "admin:resumen": "Acceso al resumen de administracion",
    "admin:usuarios": "Acceso al modulo de usuarios",
    "admin:ministerios": "Acceso al modulo de ministerios",
    "admin:voluntarios": "Acceso al modulo de voluntarios",
    "admin:seguimiento": "Acceso al modulo de seguimiento",
    "admin:consejerias": "Acceso al modulo de consejerias",
    "admin:calendario": "Acceso al modulo de calendario",
    "admin:metricas": "Acceso al modulo de metricas",
    "admin:mapa": "Acceso al modulo de mapa",
    "admin:proveedores": "Acceso al modulo de proveedores",
    "music:general": "Acceso al modulo general de musica",
    "music:ensayo": "Acceso al modulo de ensayo",
    "music:setlist": "Acceso al modulo de setlist",
    "music:canciones": "Acceso al modulo de canciones",
    "volunteers:eventos": "Acceso al modulo de eventos de voluntarios",
    "volunteers:turnos": "Acceso al modulo de turnos",
    "volunteers:asignaciones": "Acceso al modulo de asignaciones",
}

SECRET_KEY = os.getenv("SECURITY_SECRET_KEY", "change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("SECURITY_TOKEN_EXPIRE_MINUTES", "60"))

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

DATABASE_URL = os.getenv("SECURITY_DATABASE_URL", "sqlite:///./security.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, nullable=True)
    username = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    active = Column(Boolean, nullable=False, default=True)


class RoleModel(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)


class PermissionModel(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)


class UserRoleModel(Base):
    __tablename__ = "user_roles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    role_id = Column(Integer, nullable=False)


class RolePermissionModel(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, nullable=False)
    permission_id = Column(Integer, nullable=False)


class UserPermissionModel(Base):
    __tablename__ = "user_permissions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    permission_id = Column(Integer, nullable=False)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        role_map: dict[str, RoleModel] = {}
        for role_name, description in MODULE_ROLE_DEFINITIONS.items():
            role = (
                db.query(RoleModel)
                .filter(func.lower(RoleModel.name) == role_name)
                .first()
            )
            if not role:
                role = RoleModel(name=role_name, description=description)
                db.add(role)
                db.commit()
                db.refresh(role)
            role_map[role_name] = role

        permission_map: dict[str, PermissionModel] = {}
        for permission_name, description in MODULE_PERMISSION_DEFINITIONS.items():
            permission = (
                db.query(PermissionModel)
                .filter(func.lower(PermissionModel.name) == permission_name)
                .first()
            )
            if not permission:
                permission = PermissionModel(name=permission_name, description=description)
                db.add(permission)
                db.commit()
                db.refresh(permission)
            permission_map[permission_name] = permission

        bootstrap_admin = (
            db.query(UserModel)
            .filter(
                (func.lower(UserModel.email) == "admin@iglesia.com")
                | (func.lower(UserModel.username) == "admin")
            )
            .first()
        )
        if bootstrap_admin:
            role_link = (
                db.query(UserRoleModel)
                .filter_by(user_id=bootstrap_admin.id, role_id=role_map["admin"].id)
                .first()
            )
            if not role_link:
                db.add(UserRoleModel(user_id=bootstrap_admin.id, role_id=role_map["admin"].id))
                db.commit()
            current_permission_ids = {
                link.permission_id
                for link in db.query(UserPermissionModel).filter_by(user_id=bootstrap_admin.id).all()
            }
            missing_permission_ids = [
                permission.id
                for permission in permission_map.values()
                if permission.id not in current_permission_ids
            ]
            if missing_permission_ids:
                db.add_all(
                    UserPermissionModel(user_id=bootstrap_admin.id, permission_id=permission_id)
                    for permission_id in missing_permission_ids
                )
                db.commit()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def validate_password(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_by_username(db, username: str) -> Optional[UserModel]:
    return db.query(UserModel).filter(UserModel.username == username).first()


def get_user_by_email(db, email: str) -> Optional[UserModel]:
    return db.query(UserModel).filter(UserModel.email == email).first()


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserModel:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    with SessionLocal() as db:
        user = db.get(UserModel, int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user


def is_admin_user(db, user_id: int) -> bool:
    return (
        db.query(UserRoleModel)
        .join(RoleModel, UserRoleModel.role_id == RoleModel.id)
        .filter(UserRoleModel.user_id == user_id)
        .filter(func.lower(RoleModel.name) == "admin")
        .first()
        is not None
    )


def get_admin_user(current_user: UserModel = Depends(get_current_user)) -> UserModel:
    with SessionLocal() as db:
        if not is_admin_user(db, current_user.id):
            raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


def get_user_roles(db, user_id: int) -> list[RoleModel]:
    return (
        db.query(RoleModel)
        .join(UserRoleModel, UserRoleModel.role_id == RoleModel.id)
        .filter(UserRoleModel.user_id == user_id)
        .order_by(RoleModel.name.asc())
        .all()
    )


def validate_role_ids(db, role_ids: list[int]) -> list[int]:
    unique_role_ids = list(dict.fromkeys(role_ids))
    if not unique_role_ids:
        return []
    roles = db.query(RoleModel).filter(RoleModel.id.in_(unique_role_ids)).all()
    found_ids = {role.id for role in roles}
    missing_role_ids = [role_id for role_id in unique_role_ids if role_id not in found_ids]
    if missing_role_ids:
        raise HTTPException(status_code=404, detail="One or more roles were not found")
    return unique_role_ids


def sync_user_roles(db, user_id: int, role_ids: list[int]) -> None:
    unique_role_ids = validate_role_ids(db, role_ids)
    db.query(UserRoleModel).filter(UserRoleModel.user_id == user_id).delete()
    if unique_role_ids:
        db.add_all(UserRoleModel(user_id=user_id, role_id=role_id) for role_id in unique_role_ids)


def validate_permission_ids(db, permission_ids: list[int]) -> list[int]:
    unique_permission_ids = list(dict.fromkeys(permission_ids))
    if not unique_permission_ids:
        return []
    permissions = db.query(PermissionModel).filter(PermissionModel.id.in_(unique_permission_ids)).all()
    found_ids = {permission.id for permission in permissions}
    missing_permission_ids = [permission_id for permission_id in unique_permission_ids if permission_id not in found_ids]
    if missing_permission_ids:
        raise HTTPException(status_code=404, detail="One or more permissions were not found")
    return unique_permission_ids


def sync_user_permissions(db, user_id: int, permission_ids: list[int]) -> None:
    unique_permission_ids = validate_permission_ids(db, permission_ids)
    db.query(UserPermissionModel).filter(UserPermissionModel.user_id == user_id).delete()
    if unique_permission_ids:
        db.add_all(
            UserPermissionModel(user_id=user_id, permission_id=permission_id)
            for permission_id in unique_permission_ids
        )


def build_user_public(db, user: UserModel) -> dict:
    roles = get_user_roles(db, user.id)
    permissions = (
        db.query(PermissionModel)
        .join(UserPermissionModel, UserPermissionModel.permission_id == PermissionModel.id)
        .filter(UserPermissionModel.user_id == user.id)
        .order_by(PermissionModel.name.asc())
        .all()
    )
    return {
        "id": user.id,
        "person_id": user.person_id,
        "username": user.username,
        "email": user.email,
        "active": user.active,
        "roles": roles,
        "permissions": permissions,
    }


class UserCreate(BaseModel):
    person_id: Optional[int] = None
    username: str
    email: str
    password: str
    active: bool = True
    role_ids: list[int] = Field(default_factory=list)
    permission_ids: list[int] = Field(default_factory=list)


class UserUpdate(BaseModel):
    person_id: Optional[int] = None
    username: str
    email: str
    password: Optional[str] = None
    active: bool = True
    role_ids: list[int] = Field(default_factory=list)
    permission_ids: list[int] = Field(default_factory=list)


class User(UserCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class UserPublic(BaseModel):
    id: int
    person_id: Optional[int] = None
    username: str
    email: str
    active: bool
    roles: list["Role"] = Field(default_factory=list)
    permissions: list["Permission"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    identifier: str
    password: str


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Role(RoleCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PermissionCreate(BaseModel):
    name: str
    description: Optional[str] = None


class Permission(PermissionCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "security"}


@app.get("/users", response_model=list[UserPublic])
def list_users(current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        users = db.query(UserModel).order_by(UserModel.username.asc()).all()
        return [build_user_public(db, user) for user in users]


@app.post("/users", response_model=UserPublic)
def create_user(payload: UserCreate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        if get_user_by_username(db, payload.username) or get_user_by_email(db, payload.email):
            raise HTTPException(status_code=400, detail="User already exists")
        validate_password(payload.password)
        validate_role_ids(db, payload.role_ids)
        validate_permission_ids(db, payload.permission_ids)
        user = UserModel(
            person_id=payload.person_id,
            username=payload.username,
            email=payload.email,
            password_hash=hash_password(payload.password),
            active=payload.active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        sync_user_roles(db, user.id, payload.role_ids)
        sync_user_permissions(db, user.id, payload.permission_ids)
        db.commit()
        return build_user_public(db, user)


@app.get("/users/{user_id}", response_model=UserPublic)
def get_user(user_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return build_user_public(db, user)


@app.put("/users/{user_id}", response_model=UserPublic)
def update_user(user_id: int, payload: UserUpdate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        validate_role_ids(db, payload.role_ids)
        validate_permission_ids(db, payload.permission_ids)
        existing_username = (
            db.query(UserModel)
            .filter(func.lower(UserModel.username) == payload.username.lower())
            .first()
        )
        if existing_username and existing_username.id != user_id:
            raise HTTPException(status_code=400, detail="Username already exists")
        existing_email = (
            db.query(UserModel)
            .filter(func.lower(UserModel.email) == payload.email.lower())
            .first()
        )
        if existing_email and existing_email.id != user_id:
            raise HTTPException(status_code=400, detail="Email already exists")
        if payload.password:
            validate_password(payload.password)
            user.password_hash = hash_password(payload.password)
        user.person_id = payload.person_id
        user.username = payload.username
        user.email = payload.email
        user.active = payload.active
        sync_user_roles(db, user_id, payload.role_ids)
        sync_user_permissions(db, user_id, payload.permission_ids)
        db.commit()
        db.refresh(user)
        return build_user_public(db, user)


@app.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.delete(user)
        db.commit()
        return {"deleted": True, "id": user_id}


@app.get("/roles")
def list_roles(current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        return db.query(RoleModel).order_by(RoleModel.name.asc()).all()


@app.post("/roles", response_model=Role)
def create_role(payload: RoleCreate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        role = RoleModel(**payload.dict())
        db.add(role)
        db.commit()
        db.refresh(role)
        return role


@app.get("/roles/{role_id}", response_model=Role)
def get_role(role_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role


@app.put("/roles/{role_id}", response_model=Role)
def update_role(role_id: int, payload: RoleCreate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        for key, value in payload.dict().items():
            setattr(role, key, value)
        db.commit()
        db.refresh(role)
        return role


@app.delete("/roles/{role_id}")
def delete_role(role_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        db.delete(role)
        db.commit()
        return {"deleted": True, "id": role_id}


@app.get("/permissions")
def list_permissions(current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        return db.query(PermissionModel).order_by(PermissionModel.name.asc()).all()


@app.post("/permissions", response_model=Permission)
def create_permission(payload: PermissionCreate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        permission = PermissionModel(**payload.dict())
        db.add(permission)
        db.commit()
        db.refresh(permission)
        return permission


@app.get("/permissions/{permission_id}", response_model=Permission)
def get_permission(permission_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        permission = db.get(PermissionModel, permission_id)
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        return permission


@app.put("/permissions/{permission_id}", response_model=Permission)
def update_permission(permission_id: int, payload: PermissionCreate, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        permission = db.get(PermissionModel, permission_id)
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        for key, value in payload.dict().items():
            setattr(permission, key, value)
        db.commit()
        db.refresh(permission)
        return permission


@app.delete("/permissions/{permission_id}")
def delete_permission(permission_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        permission = db.get(PermissionModel, permission_id)
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        db.delete(permission)
        db.commit()
        return {"deleted": True, "id": permission_id}


@app.post("/users/{user_id}/roles/{role_id}")
def add_user_role(user_id: int, role_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        role = db.get(RoleModel, role_id)
        if not user or not role:
            raise HTTPException(status_code=404, detail="User or role not found")
        existing = db.query(UserRoleModel).filter_by(user_id=user_id, role_id=role_id).first()
        if existing:
            return {"added": True, "user_id": user_id, "role_id": role_id}
        link = UserRoleModel(user_id=user_id, role_id=role_id)
        db.add(link)
        db.commit()
        return {"added": True, "user_id": user_id, "role_id": role_id}


@app.delete("/users/{user_id}/roles/{role_id}")
def remove_user_role(user_id: int, role_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        link = db.query(UserRoleModel).filter_by(user_id=user_id, role_id=role_id).first()
        if link:
            db.delete(link)
            db.commit()
        return {"deleted": True, "user_id": user_id, "role_id": role_id}


@app.post("/roles/{role_id}/permissions/{permission_id}")
def add_role_permission(role_id: int, permission_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        permission = db.get(PermissionModel, permission_id)
        if not role or not permission:
            raise HTTPException(status_code=404, detail="Role or permission not found")
        link = RolePermissionModel(role_id=role_id, permission_id=permission_id)
        db.add(link)
        db.commit()
        return {"added": True, "role_id": role_id, "permission_id": permission_id}


@app.delete("/roles/{role_id}/permissions/{permission_id}")
def remove_role_permission(role_id: int, permission_id: int, current_user: UserModel = Depends(get_admin_user)):
    with SessionLocal() as db:
        link = db.query(RolePermissionModel).filter_by(role_id=role_id, permission_id=permission_id).first()
        if link:
            db.delete(link)
            db.commit()
        return {"deleted": True, "role_id": role_id, "permission_id": permission_id}


@app.post("/auth/register", response_model=UserPublic)
def register(payload: UserCreate):
    with SessionLocal() as db:
        if get_user_by_username(db, payload.username) or get_user_by_email(db, payload.email):
            raise HTTPException(status_code=400, detail="User already exists")
        validate_password(payload.password)
        user = UserModel(
            person_id=payload.person_id,
            username=payload.username,
            email=payload.email,
            password_hash=hash_password(payload.password),
            active=payload.active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return build_user_public(db, user)


@app.post("/auth/login", response_model=Token)
def login(payload: LoginRequest):
    with SessionLocal() as db:
        identifier = payload.identifier.strip()
        user = get_user_by_username(db, identifier) or get_user_by_email(db, identifier)
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.active:
            raise HTTPException(status_code=403, detail="User inactive")
        token = create_access_token({"sub": str(user.id)})
        return Token(access_token=token)


@app.get("/auth/me", response_model=UserPublic)
def me(current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, current_user.id)
        return build_user_public(db, user)
