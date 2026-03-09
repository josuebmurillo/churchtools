from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os
import uuid
import shutil

app = FastAPI(title="PDFs Service", version="0.1.0")

DATABASE_URL = os.getenv("PDFS_DATABASE_URL", "sqlite:///./pdfs.db")
STORAGE_DIR = os.getenv("PDFS_STORAGE_DIR", "/data/pdfs")
PUBLIC_BASE_PATH = os.getenv("PDFS_PUBLIC_BASE_PATH", "/pdfs")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class PdfModel(Base):
    __tablename__ = "pdfs"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    storage_path = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


@app.on_event("startup")
def on_startup():
    os.makedirs(STORAGE_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)


class PdfCreateResponse(BaseModel):
    id: int
    filename: str
    content_type: str | None = None
    url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PdfPublic(BaseModel):
    id: int
    filename: str
    content_type: str | None = None
    url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def build_file_url(pdf_id: int) -> str:
    base = PUBLIC_BASE_PATH.rstrip("/")
    if not base:
        return f"/pdfs/{pdf_id}/file"
    return f"{base}/pdfs/{pdf_id}/file"


@app.get("/health")
def health():
    return {"status": "ok", "service": "pdfs"}


@app.get("/pdfs", response_model=list[PdfPublic])
def list_pdfs():
    with SessionLocal() as db:
        items = db.query(PdfModel).order_by(PdfModel.id.desc()).all()
        return [
            PdfPublic(
                id=item.id,
                filename=item.filename,
                content_type=item.content_type,
                url=build_file_url(item.id),
                created_at=item.created_at,
            )
            for item in items
        ]


@app.post("/pdfs", response_model=PdfCreateResponse)
def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_id = uuid.uuid4().hex
    safe_name = f"{file_id}.pdf"
    storage_path = os.path.join(STORAGE_DIR, safe_name)

    with open(storage_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    with SessionLocal() as db:
        pdf = PdfModel(
            filename=file.filename,
            content_type=file.content_type,
            storage_path=storage_path,
        )
        db.add(pdf)
        db.commit()
        db.refresh(pdf)
        return PdfCreateResponse(
            id=pdf.id,
            filename=pdf.filename,
            content_type=pdf.content_type,
            url=build_file_url(pdf.id),
            created_at=pdf.created_at,
        )


@app.get("/pdfs/{pdf_id}", response_model=PdfPublic)
def get_pdf(pdf_id: int):
    with SessionLocal() as db:
        pdf = db.get(PdfModel, pdf_id)
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")
        return PdfPublic(
            id=pdf.id,
            filename=pdf.filename,
            content_type=pdf.content_type,
            url=build_file_url(pdf.id),
            created_at=pdf.created_at,
        )


@app.get("/pdfs/{pdf_id}/file")
def download_pdf(pdf_id: int):
    with SessionLocal() as db:
        pdf = db.get(PdfModel, pdf_id)
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")
        if not os.path.exists(pdf.storage_path):
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(
            pdf.storage_path,
            media_type=pdf.content_type or "application/pdf",
            headers={"Content-Disposition": f'inline; filename="{pdf.filename}"'},
        )


@app.delete("/pdfs/{pdf_id}")
def delete_pdf(pdf_id: int):
    with SessionLocal() as db:
        pdf = db.get(PdfModel, pdf_id)
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")
        if os.path.exists(pdf.storage_path):
            os.remove(pdf.storage_path)
        db.delete(pdf)
        db.commit()
        return {"deleted": True, "id": pdf_id}
