from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import declarative_base, sessionmaker
import os

app = FastAPI(title="People Service", version="0.1.0")

DATABASE_URL = os.getenv("PEOPLE_DATABASE_URL", "sqlite:///./people.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class PersonModel(Base):
    __tablename__ = "people"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    birth_date = Column(String, nullable=True)
    status = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    marital_status = Column(String, nullable=True)


class MembershipModel(Base):
    __tablename__ = "memberships"
    person_id = Column(Integer, ForeignKey("people.id"), primary_key=True)
    fecha_ingreso = Column(String, nullable=True)
    estado = Column(String, nullable=True)


class AttendanceModel(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, nullable=False)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    visitor_id = Column(Integer, ForeignKey("visitors.id"), nullable=True)
    estado = Column(String, nullable=True)


class VisitorModel(Base):
    __tablename__ = "visitors"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    telefono = Column(String, nullable=True)
    email = Column(String, nullable=True)
    fecha_primera_visita = Column(String, nullable=True)
    notas = Column(String, nullable=True)


class VisitorFollowupModel(Base):
    __tablename__ = "visitor_followups"
    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(Integer, ForeignKey("visitors.id"), nullable=False)
    fecha = Column(String, nullable=True)
    estado = Column(String, nullable=True)
    responsable_person_id = Column(Integer, ForeignKey("people.id"), nullable=True)
    notas = Column(String, nullable=True)


class DiscipleshipCourseModel(Base):
    __tablename__ = "discipleship_courses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    level = Column(String, nullable=True)


class PersonDiscipleshipModel(Base):
    __tablename__ = "person_discipleship_records"
    __table_args__ = (UniqueConstraint("person_id", "course_id", name="uq_person_course_record"),)
    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("discipleship_courses.id"), nullable=False)
    completed_on = Column(String, nullable=True)
    status = Column(String, nullable=True)
    notes = Column(String, nullable=True)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


class PersonBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    status: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None


class PersonCreate(PersonBase):
    pass


class Person(PersonBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class MembershipCreate(BaseModel):
    person_id: int
    fecha_ingreso: Optional[str] = None
    estado: Optional[str] = None


class Membership(MembershipCreate):
    model_config = ConfigDict(from_attributes=True)


class AttendanceCreate(BaseModel):
    event_id: int
    person_id: Optional[int] = None
    visitor_id: Optional[int] = None
    estado: Optional[str] = None


class Attendance(AttendanceCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class VisitorCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    fecha_primera_visita: Optional[str] = None
    notas: Optional[str] = None


class Visitor(VisitorCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class VisitorFollowupCreate(BaseModel):
    visitor_id: int
    fecha: Optional[str] = None
    estado: Optional[str] = None
    responsable_person_id: Optional[int] = None
    notas: Optional[str] = None


class VisitorFollowup(VisitorFollowupCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DiscipleshipCourseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    level: Optional[str] = None


class DiscipleshipCourse(DiscipleshipCourseCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PersonDiscipleshipCreate(BaseModel):
    person_id: int
    course_id: int
    completed_on: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PersonDiscipleship(PersonDiscipleshipCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


ATTENDANCE_STATES = {"registrado", "asistio", "ausente"}
DISCIPLESHIP_STATES = {"en_progreso", "completado", "abandonado"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "people"}


@app.get("/people")
def list_people():
    with SessionLocal() as db:
        return db.query(PersonModel).all()


@app.post("/people", response_model=Person)
def create_person(payload: PersonCreate):
    with SessionLocal() as db:
        if payload.email:
            existing = (
                db.query(PersonModel)
                .filter(func.lower(PersonModel.email) == payload.email.lower())
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use")
        person = PersonModel(**payload.dict())
        db.add(person)
        db.commit()
        db.refresh(person)
        return person


@app.get("/people/{person_id}", response_model=Person)
def get_person(person_id: int):
    with SessionLocal() as db:
        person = db.get(PersonModel, person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        return person


@app.put("/people/{person_id}", response_model=Person)
def update_person(person_id: int, payload: PersonCreate):
    with SessionLocal() as db:
        person = db.get(PersonModel, person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        if payload.email:
            existing = (
                db.query(PersonModel)
                .filter(func.lower(PersonModel.email) == payload.email.lower())
                .first()
            )
            if existing and existing.id != person_id:
                raise HTTPException(status_code=400, detail="Email already in use")
        for key, value in payload.dict().items():
            setattr(person, key, value)
        db.commit()
        db.refresh(person)
        return person


@app.delete("/people/{person_id}")
def delete_person(person_id: int):
    with SessionLocal() as db:
        person = db.get(PersonModel, person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        membership = db.get(MembershipModel, person_id)
        attendance = db.query(AttendanceModel).filter_by(person_id=person_id).first()
        followups = db.query(VisitorFollowupModel).filter_by(responsable_person_id=person_id).first()
        discipleship_records = db.query(PersonDiscipleshipModel).filter_by(person_id=person_id).first()
        if membership or attendance or followups or discipleship_records:
            raise HTTPException(
                status_code=400,
                detail="Person has related records. Set status to inactive instead.",
            )
        db.delete(person)
        db.commit()
        return {"deleted": True, "id": person_id}


@app.get("/discipleship-courses")
def list_discipleship_courses():
    with SessionLocal() as db:
        return db.query(DiscipleshipCourseModel).all()


@app.post("/discipleship-courses", response_model=DiscipleshipCourse)
def create_discipleship_course(payload: DiscipleshipCourseCreate):
    with SessionLocal() as db:
        existing = (
            db.query(DiscipleshipCourseModel)
            .filter(func.lower(DiscipleshipCourseModel.name) == payload.name.lower())
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Course already exists")
        course = DiscipleshipCourseModel(**payload.dict())
        db.add(course)
        db.commit()
        db.refresh(course)
        return course


@app.get("/discipleship-courses/{course_id}", response_model=DiscipleshipCourse)
def get_discipleship_course(course_id: int):
    with SessionLocal() as db:
        course = db.get(DiscipleshipCourseModel, course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return course


@app.put("/discipleship-courses/{course_id}", response_model=DiscipleshipCourse)
def update_discipleship_course(course_id: int, payload: DiscipleshipCourseCreate):
    with SessionLocal() as db:
        course = db.get(DiscipleshipCourseModel, course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        existing = (
            db.query(DiscipleshipCourseModel)
            .filter(func.lower(DiscipleshipCourseModel.name) == payload.name.lower())
            .first()
        )
        if existing and existing.id != course_id:
            raise HTTPException(status_code=400, detail="Course already exists")
        for key, value in payload.dict().items():
            setattr(course, key, value)
        db.commit()
        db.refresh(course)
        return course


@app.delete("/discipleship-courses/{course_id}")
def delete_discipleship_course(course_id: int):
    with SessionLocal() as db:
        course = db.get(DiscipleshipCourseModel, course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        record = db.query(PersonDiscipleshipModel).filter_by(course_id=course_id).first()
        if record:
            raise HTTPException(status_code=400, detail="Course has person records")
        db.delete(course)
        db.commit()
        return {"deleted": True, "id": course_id}


@app.get("/discipulado")
def list_discipleship_records(person_id: Optional[int] = None, course_id: Optional[int] = None):
    with SessionLocal() as db:
        query = db.query(PersonDiscipleshipModel)
        if person_id:
            query = query.filter(PersonDiscipleshipModel.person_id == person_id)
        if course_id:
            query = query.filter(PersonDiscipleshipModel.course_id == course_id)
        return query.all()


@app.post("/discipulado", response_model=PersonDiscipleship)
def create_discipleship_record(payload: PersonDiscipleshipCreate):
    with SessionLocal() as db:
        person = db.get(PersonModel, payload.person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        course = db.get(DiscipleshipCourseModel, payload.course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        existing = (
            db.query(PersonDiscipleshipModel)
            .filter_by(person_id=payload.person_id, course_id=payload.course_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Person already has this course record")
        if payload.status and payload.status not in DISCIPLESHIP_STATES:
            raise HTTPException(status_code=400, detail="Invalid discipleship status")
        record = PersonDiscipleshipModel(**payload.dict())
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


@app.get("/discipulado/{record_id}", response_model=PersonDiscipleship)
def get_discipleship_record(record_id: int):
    with SessionLocal() as db:
        record = db.get(PersonDiscipleshipModel, record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Discipleship record not found")
        return record


@app.put("/discipulado/{record_id}", response_model=PersonDiscipleship)
def update_discipleship_record(record_id: int, payload: PersonDiscipleshipCreate):
    with SessionLocal() as db:
        record = db.get(PersonDiscipleshipModel, record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Discipleship record not found")
        person = db.get(PersonModel, payload.person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        course = db.get(DiscipleshipCourseModel, payload.course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        existing = (
            db.query(PersonDiscipleshipModel)
            .filter_by(person_id=payload.person_id, course_id=payload.course_id)
            .first()
        )
        if existing and existing.id != record_id:
            raise HTTPException(status_code=400, detail="Person already has this course record")
        if payload.status and payload.status not in DISCIPLESHIP_STATES:
            raise HTTPException(status_code=400, detail="Invalid discipleship status")
        for key, value in payload.dict().items():
            setattr(record, key, value)
        db.commit()
        db.refresh(record)
        return record


@app.delete("/discipulado/{record_id}")
def delete_discipleship_record(record_id: int):
    with SessionLocal() as db:
        record = db.get(PersonDiscipleshipModel, record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Discipleship record not found")
        db.delete(record)
        db.commit()
        return {"deleted": True, "id": record_id}


@app.get("/people/{person_id}/discipulado")
def list_person_discipleship(person_id: int):
    with SessionLocal() as db:
        person = db.get(PersonModel, person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        return db.query(PersonDiscipleshipModel).filter_by(person_id=person_id).all()


@app.get("/memberships")
def list_memberships():
    with SessionLocal() as db:
        return db.query(MembershipModel).all()


@app.post("/memberships", response_model=Membership)
def create_membership(payload: MembershipCreate):
    with SessionLocal() as db:
        person = db.get(PersonModel, payload.person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        membership = MembershipModel(**payload.dict())
        db.merge(membership)
        db.commit()
        return membership


@app.get("/memberships/{person_id}", response_model=Membership)
def get_membership(person_id: int):
    with SessionLocal() as db:
        membership = db.get(MembershipModel, person_id)
        if not membership:
            raise HTTPException(status_code=404, detail="Membership not found")
        return membership


@app.put("/memberships/{person_id}", response_model=Membership)
def update_membership(person_id: int, payload: MembershipCreate):
    with SessionLocal() as db:
        membership = db.get(MembershipModel, person_id)
        if not membership:
            raise HTTPException(status_code=404, detail="Membership not found")
        person = db.get(PersonModel, payload.person_id)
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        for key, value in payload.dict().items():
            setattr(membership, key, value)
        db.commit()
        return membership


@app.delete("/memberships/{person_id}")
def delete_membership(person_id: int):
    with SessionLocal() as db:
        membership = db.get(MembershipModel, person_id)
        if not membership:
            raise HTTPException(status_code=404, detail="Membership not found")
        db.delete(membership)
        db.commit()
        return {"deleted": True, "person_id": person_id}


@app.get("/attendance")
def list_attendance():
    with SessionLocal() as db:
        return db.query(AttendanceModel).all()


@app.post("/attendance", response_model=Attendance)
def create_attendance(payload: AttendanceCreate):
    with SessionLocal() as db:
        if bool(payload.person_id) == bool(payload.visitor_id):
            raise HTTPException(status_code=400, detail="Provide person_id or visitor_id, not both")
        if payload.person_id:
            person = db.get(PersonModel, payload.person_id)
            if not person:
                raise HTTPException(status_code=404, detail="Person not found")
            existing = (
                db.query(AttendanceModel)
                .filter_by(event_id=payload.event_id, person_id=payload.person_id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Attendance already recorded")
        if payload.visitor_id:
            visitor = db.get(VisitorModel, payload.visitor_id)
            if not visitor:
                raise HTTPException(status_code=404, detail="Visitor not found")
            existing = (
                db.query(AttendanceModel)
                .filter_by(event_id=payload.event_id, visitor_id=payload.visitor_id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Attendance already recorded")
        if payload.estado and payload.estado not in ATTENDANCE_STATES:
            raise HTTPException(status_code=400, detail="Invalid attendance status")
        attendance = AttendanceModel(**payload.dict())
        db.add(attendance)
        db.commit()
        db.refresh(attendance)
        return attendance


@app.get("/attendance/{attendance_id}", response_model=Attendance)
def get_attendance(attendance_id: int):
    with SessionLocal() as db:
        attendance = db.get(AttendanceModel, attendance_id)
        if not attendance:
            raise HTTPException(status_code=404, detail="Attendance not found")
        return attendance


@app.put("/attendance/{attendance_id}", response_model=Attendance)
def update_attendance(attendance_id: int, payload: AttendanceCreate):
    with SessionLocal() as db:
        attendance = db.get(AttendanceModel, attendance_id)
        if not attendance:
            raise HTTPException(status_code=404, detail="Attendance not found")
        if bool(payload.person_id) == bool(payload.visitor_id):
            raise HTTPException(status_code=400, detail="Provide person_id or visitor_id, not both")
        if payload.person_id:
            person = db.get(PersonModel, payload.person_id)
            if not person:
                raise HTTPException(status_code=404, detail="Person not found")
            existing = (
                db.query(AttendanceModel)
                .filter_by(event_id=payload.event_id, person_id=payload.person_id)
                .first()
            )
            if existing and existing.id != attendance_id:
                raise HTTPException(status_code=400, detail="Attendance already recorded")
        if payload.visitor_id:
            visitor = db.get(VisitorModel, payload.visitor_id)
            if not visitor:
                raise HTTPException(status_code=404, detail="Visitor not found")
            existing = (
                db.query(AttendanceModel)
                .filter_by(event_id=payload.event_id, visitor_id=payload.visitor_id)
                .first()
            )
            if existing and existing.id != attendance_id:
                raise HTTPException(status_code=400, detail="Attendance already recorded")
        if payload.estado and payload.estado not in ATTENDANCE_STATES:
            raise HTTPException(status_code=400, detail="Invalid attendance status")
        for key, value in payload.dict().items():
            setattr(attendance, key, value)
        db.commit()
        db.refresh(attendance)
        return attendance


@app.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: int):
    with SessionLocal() as db:
        attendance = db.get(AttendanceModel, attendance_id)
        if not attendance:
            raise HTTPException(status_code=404, detail="Attendance not found")
        db.delete(attendance)
        db.commit()
        return {"deleted": True, "id": attendance_id}


@app.get("/visitors")
def list_visitors():
    with SessionLocal() as db:
        return db.query(VisitorModel).all()


@app.post("/visitors", response_model=Visitor)
def create_visitor(payload: VisitorCreate):
    with SessionLocal() as db:
        visitor = VisitorModel(**payload.dict())
        db.add(visitor)
        db.commit()
        db.refresh(visitor)
        return visitor


@app.get("/visitors/{visitor_id}", response_model=Visitor)
def get_visitor(visitor_id: int):
    with SessionLocal() as db:
        visitor = db.get(VisitorModel, visitor_id)
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        return visitor


@app.put("/visitors/{visitor_id}", response_model=Visitor)
def update_visitor(visitor_id: int, payload: VisitorCreate):
    with SessionLocal() as db:
        visitor = db.get(VisitorModel, visitor_id)
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        for key, value in payload.dict().items():
            setattr(visitor, key, value)
        db.commit()
        db.refresh(visitor)
        return visitor


@app.delete("/visitors/{visitor_id}")
def delete_visitor(visitor_id: int):
    with SessionLocal() as db:
        visitor = db.get(VisitorModel, visitor_id)
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        followup = db.query(VisitorFollowupModel).filter_by(visitor_id=visitor_id).first()
        if followup:
            raise HTTPException(status_code=400, detail="Visitor has follow-ups")
        db.delete(visitor)
        db.commit()
        return {"deleted": True, "id": visitor_id}


@app.get("/visitor-followups")
def list_visitor_followups():
    with SessionLocal() as db:
        return db.query(VisitorFollowupModel).all()


@app.post("/visitor-followups", response_model=VisitorFollowup)
def create_visitor_followup(payload: VisitorFollowupCreate):
    with SessionLocal() as db:
        if not payload.fecha:
            raise HTTPException(status_code=400, detail="Follow-up date is required")
        if not payload.responsable_person_id:
            raise HTTPException(status_code=400, detail="Responsible person is required")
        visitor = db.get(VisitorModel, payload.visitor_id)
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        responsable = db.get(PersonModel, payload.responsable_person_id)
        if not responsable:
            raise HTTPException(status_code=404, detail="Responsible person not found")
        followup = VisitorFollowupModel(**payload.dict())
        db.add(followup)
        db.commit()
        db.refresh(followup)
        return followup


@app.get("/visitor-followups/{followup_id}", response_model=VisitorFollowup)
def get_visitor_followup(followup_id: int):
    with SessionLocal() as db:
        followup = db.get(VisitorFollowupModel, followup_id)
        if not followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        return followup


@app.put("/visitor-followups/{followup_id}", response_model=VisitorFollowup)
def update_visitor_followup(followup_id: int, payload: VisitorFollowupCreate):
    with SessionLocal() as db:
        followup = db.get(VisitorFollowupModel, followup_id)
        if not followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if not payload.fecha:
            raise HTTPException(status_code=400, detail="Follow-up date is required")
        if not payload.responsable_person_id:
            raise HTTPException(status_code=400, detail="Responsible person is required")
        visitor = db.get(VisitorModel, payload.visitor_id)
        if not visitor:
            raise HTTPException(status_code=404, detail="Visitor not found")
        responsable = db.get(PersonModel, payload.responsable_person_id)
        if not responsable:
            raise HTTPException(status_code=404, detail="Responsible person not found")
        for key, value in payload.dict().items():
            setattr(followup, key, value)
        db.commit()
        db.refresh(followup)
        return followup


@app.delete("/visitor-followups/{followup_id}")
def delete_visitor_followup(followup_id: int):
    with SessionLocal() as db:
        followup = db.get(VisitorFollowupModel, followup_id)
        if not followup:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        db.delete(followup)
        db.commit()
        return {"deleted": True, "id": followup_id}
