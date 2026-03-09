from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Boolean, func
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta

app = FastAPI(title="Security Service", version="0.1.0")

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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


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


class UserCreate(BaseModel):
    person_id: Optional[int] = None
    username: str
    email: str
    password: str
    active: bool = True


class User(UserCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class UserPublic(BaseModel):
    id: int
    person_id: Optional[int] = None
    username: str
    email: str
    active: bool

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


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
def list_users(current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        return db.query(UserModel).all()


@app.post("/users", response_model=UserPublic)
def create_user(payload: UserCreate, current_user: UserModel = Depends(get_current_user)):
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
        return user


@app.get("/users/{user_id}", response_model=UserPublic)
def get_user(user_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user


@app.put("/users/{user_id}", response_model=UserPublic)
def update_user(user_id: int, payload: UserCreate, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
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
        validate_password(payload.password)
        user.person_id = payload.person_id
        user.username = payload.username
        user.email = payload.email
        user.password_hash = hash_password(payload.password)
        user.active = payload.active
        db.commit()
        db.refresh(user)
        return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.delete(user)
        db.commit()
        return {"deleted": True, "id": user_id}


@app.get("/roles")
def list_roles(current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        return db.query(RoleModel).all()


@app.post("/roles", response_model=Role)
def create_role(payload: RoleCreate, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        role = RoleModel(**payload.dict())
        db.add(role)
        db.commit()
        db.refresh(role)
        return role


@app.get("/roles/{role_id}", response_model=Role)
def get_role(role_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role


@app.put("/roles/{role_id}", response_model=Role)
def update_role(role_id: int, payload: RoleCreate, current_user: UserModel = Depends(get_current_user)):
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
def delete_role(role_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        role = db.get(RoleModel, role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        db.delete(role)
        db.commit()
        return {"deleted": True, "id": role_id}


@app.get("/permissions")
def list_permissions(current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        return db.query(PermissionModel).all()


@app.post("/permissions", response_model=Permission)
def create_permission(payload: PermissionCreate, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        permission = PermissionModel(**payload.dict())
        db.add(permission)
        db.commit()
        db.refresh(permission)
        return permission


@app.get("/permissions/{permission_id}", response_model=Permission)
def get_permission(permission_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        permission = db.get(PermissionModel, permission_id)
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        return permission


@app.put("/permissions/{permission_id}", response_model=Permission)
def update_permission(permission_id: int, payload: PermissionCreate, current_user: UserModel = Depends(get_current_user)):
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
def delete_permission(permission_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        permission = db.get(PermissionModel, permission_id)
        if not permission:
            raise HTTPException(status_code=404, detail="Permission not found")
        db.delete(permission)
        db.commit()
        return {"deleted": True, "id": permission_id}


@app.post("/users/{user_id}/roles/{role_id}")
def add_user_role(user_id: int, role_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        user = db.get(UserModel, user_id)
        role = db.get(RoleModel, role_id)
        if not user or not role:
            raise HTTPException(status_code=404, detail="User or role not found")
        link = UserRoleModel(user_id=user_id, role_id=role_id)
        db.add(link)
        db.commit()
        return {"added": True, "user_id": user_id, "role_id": role_id}


@app.delete("/users/{user_id}/roles/{role_id}")
def remove_user_role(user_id: int, role_id: int, current_user: UserModel = Depends(get_current_user)):
    with SessionLocal() as db:
        link = db.query(UserRoleModel).filter_by(user_id=user_id, role_id=role_id).first()
        if link:
            db.delete(link)
            db.commit()
        return {"deleted": True, "user_id": user_id, "role_id": role_id}


@app.post("/roles/{role_id}/permissions/{permission_id}")
def add_role_permission(role_id: int, permission_id: int, current_user: UserModel = Depends(get_current_user)):
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
def remove_role_permission(role_id: int, permission_id: int, current_user: UserModel = Depends(get_current_user)):
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
        return user


@app.post("/auth/login", response_model=Token)
def login(payload: UserCreate):
    with SessionLocal() as db:
        user = get_user_by_username(db, payload.username) or get_user_by_email(db, payload.email)
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.active:
            raise HTTPException(status_code=403, detail="User inactive")
        token = create_access_token({"sub": str(user.id)})
        return Token(access_token=token)


@app.get("/auth/me", response_model=UserPublic)
def me(current_user: UserModel = Depends(get_current_user)):
    return current_user
