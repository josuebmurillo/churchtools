from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="Comms Service", version="0.1.0")

DATABASE_URL = os.getenv("COMMS_DATABASE_URL", "sqlite:///./comms.db")
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class AnnouncementModel(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    audience = Column(String, nullable=False)
    ministry_id = Column(Integer, nullable=True)
    team_id = Column(Integer, nullable=True)
    published_at = Column(String, nullable=True)


class NotificationModel(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    audience = Column(String, nullable=False)
    ministry_id = Column(Integer, nullable=True)
    team_id = Column(Integer, nullable=True)
    sent_at = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    audience: str
    ministry_id: Optional[int] = None
    team_id: Optional[int] = None
    published_at: Optional[str] = None


class Announcement(AnnouncementCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class NotificationCreate(BaseModel):
    title: str
    content: str
    audience: str
    ministry_id: Optional[int] = None
    team_id: Optional[int] = None
    sent_at: Optional[str] = None


class Notification(NotificationCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "comms"}


@app.get("/announcements")
def list_announcements():
    with SessionLocal() as db:
        return db.query(AnnouncementModel).all()


@app.post("/announcements", response_model=Announcement)
def create_announcement(payload: AnnouncementCreate):
    with SessionLocal() as db:
        if not payload.title.strip() or not payload.content.strip():
            raise HTTPException(status_code=400, detail="Title and content are required")
        announcement = AnnouncementModel(**payload.dict())
        db.add(announcement)
        db.commit()
        db.refresh(announcement)
        return announcement


@app.get("/announcements/{announcement_id}", response_model=Announcement)
def get_announcement(announcement_id: int):
    with SessionLocal() as db:
        announcement = db.get(AnnouncementModel, announcement_id)
        if not announcement:
            raise HTTPException(status_code=404, detail="Announcement not found")
        return announcement


@app.put("/announcements/{announcement_id}", response_model=Announcement)
def update_announcement(announcement_id: int, payload: AnnouncementCreate):
    with SessionLocal() as db:
        announcement = db.get(AnnouncementModel, announcement_id)
        if not announcement:
            raise HTTPException(status_code=404, detail="Announcement not found")
        if not payload.title.strip() or not payload.content.strip():
            raise HTTPException(status_code=400, detail="Title and content are required")
        for key, value in payload.dict().items():
            setattr(announcement, key, value)
        db.commit()
        db.refresh(announcement)
        return announcement


@app.delete("/announcements/{announcement_id}")
def delete_announcement(announcement_id: int):
    with SessionLocal() as db:
        announcement = db.get(AnnouncementModel, announcement_id)
        if not announcement:
            raise HTTPException(status_code=404, detail="Announcement not found")
        db.delete(announcement)
        db.commit()
        return {"deleted": True, "id": announcement_id}


@app.get("/notifications")
def list_notifications():
    with SessionLocal() as db:
        return db.query(NotificationModel).all()


@app.post("/notifications", response_model=Notification)
def create_notification(payload: NotificationCreate):
    with SessionLocal() as db:
        if not payload.sent_at:
            raise HTTPException(status_code=400, detail="sent_at is required")
        if not payload.title.strip() or not payload.content.strip():
            raise HTTPException(status_code=400, detail="Title and content are required")
        notification = NotificationModel(**payload.dict())
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification


@app.get("/notifications/{notification_id}", response_model=Notification)
def get_notification(notification_id: int):
    with SessionLocal() as db:
        notification = db.get(NotificationModel, notification_id)
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        return notification


@app.put("/notifications/{notification_id}", response_model=Notification)
def update_notification(notification_id: int, payload: NotificationCreate):
    with SessionLocal() as db:
        notification = db.get(NotificationModel, notification_id)
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        if not payload.sent_at:
            raise HTTPException(status_code=400, detail="sent_at is required")
        if not payload.title.strip() or not payload.content.strip():
            raise HTTPException(status_code=400, detail="Title and content are required")
        for key, value in payload.dict().items():
            setattr(notification, key, value)
        db.commit()
        db.refresh(notification)
        return notification


@app.delete("/notifications/{notification_id}")
def delete_notification(notification_id: int):
    with SessionLocal() as db:
        notification = db.get(NotificationModel, notification_id)
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        db.delete(notification)
        db.commit()
        return {"deleted": True, "id": notification_id}
