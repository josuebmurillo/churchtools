from datetime import datetime
import json
import logging
from pathlib import Path
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import uuid
import wave
import zipfile

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .audio_extractor import extract_guide_master_wav
from .guide_analyzer import analyze_guide_audio
from .guide_detector import detect_guide_audio_file, filter_stem_audio_files
from .structure_exporter import export_structure_json
from .zip_handler import extract_zip_archive, list_audio_files_in_directory

app = FastAPI(title="Multitracks Service", version="0.1.0")

DATABASE_URL = os.getenv("MULTITRACKS_DATABASE_URL", "sqlite:///./multitracks.db")
STORAGE_DIR = os.getenv("MULTITRACKS_STORAGE_DIR", "/data/multitracks")
PUBLIC_BASE_PATH = os.getenv("MULTITRACKS_PUBLIC_BASE_PATH", "/multitracks")
FFMPEG_BIN = os.getenv("MULTITRACKS_FFMPEG_BIN", "ffmpeg")
WAVEFORM_BINS_DEFAULT = int(os.getenv("MULTITRACKS_WAVEFORM_BINS", "180"))
WHISPER_MODEL_NAME = os.getenv("MULTITRACKS_WHISPER_MODEL", "tiny")
STRUCTURE_RETRY_ATTEMPTS = int(os.getenv("MULTITRACKS_STRUCTURE_RETRY_ATTEMPTS", "4"))
STRUCTURE_RETRY_SLEEP_SECONDS = float(os.getenv("MULTITRACKS_STRUCTURE_RETRY_SLEEP_SECONDS", "4"))
ANALYSIS_PASS_1_SECONDS = int(os.getenv("MULTITRACKS_ANALYSIS_PASS_1_SECONDS", "180"))
ANALYSIS_PASS_2_SECONDS = int(os.getenv("MULTITRACKS_ANALYSIS_PASS_2_SECONDS", "360"))
STRUCTURE_FILENAME = "structure.json"
ANALYSIS_STATUS_FILENAME = "analysis_status.json"
GUIDE_MASTER_FILENAME = "guide_track.wav"
MIX_MASTER_FILENAME = "song_mix.wav"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
logger = logging.getLogger(__name__)


class StemModel(Base):
    __tablename__ = "multitrack_stems"

    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, index=True, nullable=False)
    stem_name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    format = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    storage_path = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class WaveformModel(Base):
    __tablename__ = "multitrack_waveforms"

    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, index=True, nullable=False, unique=True)
    bins_json = Column(Text, nullable=False)
    bins_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


@app.on_event("startup")
def on_startup() -> None:
    os.makedirs(STORAGE_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)


class StemPublic(BaseModel):
    id: int
    song_id: int
    stem_name: str
    filename: str
    format: str
    content_type: str | None = None
    url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WaveformPublic(BaseModel):
    song_id: int
    bins: list[float]
    bins_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StructureEntryPublic(BaseModel):
    time: str
    section: str


class SongStructurePublic(BaseModel):
    song: str
    structure: list[StructureEntryPublic]


class MultitrackUploadResponse(BaseModel):
    song_id: int
    total_stems: int
    stems: list[StemPublic]
    waveform: WaveformPublic | None = None


class GuideAudioPublic(BaseModel):
    song_id: int
    filename: str
    content_type: str
    url: str


class MixAudioPublic(BaseModel):
    song_id: int
    filename: str
    content_type: str
    url: str


class GuideAnalysisStatusPublic(BaseModel):
    song_id: int
    status: str
    sections_found: int
    attempts: int
    updated_at: str
    detail: str | None = None


def build_stem_url(stem_id: int) -> str:
    base = PUBLIC_BASE_PATH.rstrip("/")
    return f"{base}/stems/{stem_id}/file"


def build_guide_url(song_id: int) -> str:
    base = PUBLIC_BASE_PATH.rstrip("/")
    return f"{base}/songs/{song_id}/guide/file"


def build_mix_url(song_id: int) -> str:
    base = PUBLIC_BASE_PATH.rstrip("/")
    return f"{base}/songs/{song_id}/mix/file"


def normalize_stem_name(filename: str) -> str:
    base_name = Path(filename).stem
    clean = re.sub(r"[_\-.]+", " ", base_name).strip()
    lower = clean.lower()

    known = {
        "teclado": "Teclado",
        "keys": "Teclado",
        "keyboard": "Teclado",
        "guitarra": "Guitarra",
        "guitar": "Guitarra",
        "bajo": "Bajo",
        "bass": "Bajo",
        "synth bass": "Synth Bass",
        "drums": "Drums",
        "bateria": "Drums",
        "batería": "Drums",
        "click": "Click",
        "cues": "CUES",
        "cue": "CUES",
        "vox": "Voces",
        "vocals": "Voces",
    }

    for key, label in known.items():
        if key in lower:
            suffix_match = re.search(r"(\d+)$", clean)
            if suffix_match:
                return f"{label} {suffix_match.group(1)}"
            return label

    return clean.title() if clean else "Stem"


def run_ffmpeg_command(args: list[str], detail: str) -> None:
    command = [FFMPEG_BIN, *args]
    try:
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode != 0:
            raise HTTPException(status_code=500, detail=detail)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="ffmpeg no está instalado en el contenedor") from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{detail}: {exc.stderr.strip() or 'error de ffmpeg'}",
        ) from exc


def to_master_wav(source_path: Path, target_path: Path) -> None:
    run_ffmpeg_command(
        [
            "-y",
            "-i",
            str(source_path),
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(target_path),
        ],
        "No se pudo convertir stem a WAV master",
    )


def to_stream_mp3(source_wav_path: Path, target_mp3_path: Path) -> None:
    run_ffmpeg_command(
        [
            "-y",
            "-i",
            str(source_wav_path),
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "320k",
            str(target_mp3_path),
        ],
        "No se pudo generar MP3 de streaming",
    )


def to_preview_wav(source_wav_path: Path, target_preview_path: Path, max_seconds: int) -> None:
    limited_seconds = max(20, int(max_seconds))
    run_ffmpeg_command(
        [
            "-y",
            "-i",
            str(source_wav_path),
            "-t",
            str(limited_seconds),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(target_preview_path),
        ],
        "No se pudo generar preview del audio guía",
    )


def get_wav_duration_seconds(wav_path: Path) -> float:
    try:
        with wave.open(str(wav_path), "rb") as wav_file:
            frame_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            if frame_rate <= 0:
                return 0.0
            return float(frame_count) / float(frame_rate)
    except Exception:
        return 0.0


def get_stream_path_from_master(master_path: Path) -> Path:
    return master_path.with_name(f"{master_path.stem}.stream.mp3")


def get_song_dir(song_id: int) -> Path:
    return Path(STORAGE_DIR) / f"song_{song_id}"


def get_song_guide_master_path(song_id: int) -> Path:
    return get_song_dir(song_id) / GUIDE_MASTER_FILENAME


def get_song_mix_master_path(song_id: int) -> Path:
    return get_song_dir(song_id) / MIX_MASTER_FILENAME


def get_song_analysis_status_path(song_id: int) -> Path:
    return get_song_dir(song_id) / ANALYSIS_STATUS_FILENAME


def write_analysis_status(
    song_id: int,
    *,
    status: str,
    sections_found: int = 0,
    attempts: int = 0,
    detail: str | None = None,
) -> None:
    status_path = get_song_analysis_status_path(song_id)
    status_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "song_id": song_id,
        "status": status,
        "sections_found": max(0, int(sections_found)),
        "attempts": max(0, int(attempts)),
        "updated_at": datetime.utcnow().isoformat(),
        "detail": detail,
    }
    status_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")


def load_analysis_status(song_id: int) -> GuideAnalysisStatusPublic:
    status_path = get_song_analysis_status_path(song_id)
    if not status_path.exists():
        raise HTTPException(status_code=404, detail="No hay estado de análisis para esta canción")

    try:
        payload = json.loads(status_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="El archivo analysis_status.json es inválido") from exc

    return GuideAnalysisStatusPublic(
        song_id=int(payload.get("song_id") or song_id),
        status=str(payload.get("status") or "unknown"),
        sections_found=int(payload.get("sections_found") or 0),
        attempts=int(payload.get("attempts") or 0),
        updated_at=str(payload.get("updated_at") or ""),
        detail=(str(payload.get("detail")) if payload.get("detail") is not None else None),
    )


def get_song_guide_selected_path(song_id: int) -> tuple[Path, str, str] | None:
    guide_master = get_song_guide_master_path(song_id)
    if not guide_master.exists():
        return None

    guide_stream = get_stream_path_from_master(guide_master)
    if guide_stream.exists():
        return guide_stream, "audio/mpeg", "guide_track.mp3"

    return guide_master, "audio/wav", GUIDE_MASTER_FILENAME


def get_song_mix_selected_path(song_id: int) -> tuple[Path, str, str] | None:
    mix_master = get_song_mix_master_path(song_id)
    if not mix_master.exists():
        return None

    mix_stream = get_stream_path_from_master(mix_master)
    if mix_stream.exists():
        return mix_stream, "audio/mpeg", "song_mix.mp3"

    return mix_master, "audio/wav", MIX_MASTER_FILENAME


def get_song_stem_master_paths(song_id: int) -> list[Path]:
    with SessionLocal() as db:
        items = (
            db.query(StemModel)
            .filter(StemModel.song_id == song_id)
            .order_by(StemModel.id.asc())
            .all()
        )
    paths = [Path(item.storage_path) for item in items]
    return [path for path in paths if path.exists()]


def build_mixdown_wav(stem_paths: list[Path], output_path: Path) -> None:
    if not stem_paths:
        raise HTTPException(status_code=404, detail="No hay stems para generar waveform")

    args: list[str] = ["-y"]
    for path in stem_paths:
        args.extend(["-i", str(path)])

    args.extend(
        [
            "-filter_complex",
            f"amix=inputs={len(stem_paths)}:duration=longest:dropout_transition=0,aresample=12000,aformat=sample_fmts=s16:channel_layouts=mono",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )
    run_ffmpeg_command(args, "No se pudo generar mix para waveform")


def compute_waveform_bins_from_wav(wav_path: Path, bins_count: int) -> list[float]:
    safe_bins = max(24, min(1024, bins_count))
    with wave.open(str(wav_path), "rb") as wav_file:
        if wav_file.getsampwidth() != 2:
            raise HTTPException(status_code=500, detail="Formato WAV no soportado para waveform")

        frame_count = wav_file.getnframes()
        raw = wav_file.readframes(frame_count)
        if not raw:
            return [0.1] * safe_bins

    sample_count = len(raw) // 2
    if sample_count == 0:
        return [0.1] * safe_bins

    bucket_peaks: list[int] = []
    bucket_size = max(1, sample_count // safe_bins)

    for bucket in range(safe_bins):
        start_sample = bucket * bucket_size
        end_sample = min(sample_count, start_sample + bucket_size)
        if start_sample >= end_sample:
            bucket_peaks.append(0)
            continue

        sample_stride = max(1, (end_sample - start_sample) // 400)
        peak = 0
        for sample_index in range(start_sample, end_sample, sample_stride):
            offset = sample_index * 2
            value = int.from_bytes(raw[offset:offset + 2], byteorder="little", signed=True)
            absolute = abs(value)
            if absolute > peak:
                peak = absolute
        bucket_peaks.append(peak)

    max_peak = max(bucket_peaks) if bucket_peaks else 0
    if max_peak <= 0:
        return [0.1] * safe_bins

    sorted_peaks = sorted(bucket_peaks)
    percentile_index = int((len(sorted_peaks) - 1) * 0.95)
    percentile_peak = sorted_peaks[percentile_index]
    reference_peak = max(percentile_peak, int(max_peak * 0.35), 1)

    amplitudes: list[float] = []
    for peak in bucket_peaks:
        normalized = min(1.0, peak / reference_peak)
        emphasized = normalized ** 0.75
        amplitudes.append(0.08 + emphasized * 0.92)

    return amplitudes


def waveform_to_public(item: WaveformModel) -> WaveformPublic:
    try:
        bins_raw = json.loads(item.bins_json)
    except json.JSONDecodeError:
        bins_raw = []

    bins = [float(value) for value in bins_raw if isinstance(value, (int, float))]
    return WaveformPublic(
        song_id=item.song_id,
        bins=bins,
        bins_count=item.bins_count,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def load_song_structure(song_id: int) -> SongStructurePublic:
    structure_path = Path(STORAGE_DIR) / f"song_{song_id}" / STRUCTURE_FILENAME
    if not structure_path.exists():
        raise HTTPException(status_code=404, detail="No hay estructura disponible para esta canción")

    try:
        payload = json.loads(structure_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="El archivo structure.json es inválido") from exc

    song = str(payload.get("song") or "")
    raw_structure = payload.get("structure")
    if not isinstance(raw_structure, list):
        raw_structure = []

    structure: list[StructureEntryPublic] = []
    for item in raw_structure:
        if not isinstance(item, dict):
            continue
        time_value = item.get("time")
        section_value = item.get("section")
        if not isinstance(time_value, str) or not isinstance(section_value, str):
            continue
        structure.append(StructureEntryPublic(time=time_value, section=section_value))

    return SongStructurePublic(song=song, structure=structure)


def generate_and_store_song_waveform(song_id: int, bins_count: int = WAVEFORM_BINS_DEFAULT) -> WaveformPublic:
    stem_paths = get_song_stem_master_paths(song_id)
    if not stem_paths:
        raise HTTPException(status_code=404, detail="No hay stems para generar waveform")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_mix:
        temp_mix_path = Path(temp_mix.name)

    try:
        build_mixdown_wav(stem_paths, temp_mix_path)
        bins = compute_waveform_bins_from_wav(temp_mix_path, bins_count)
    finally:
        if temp_mix_path.exists():
            temp_mix_path.unlink()

    now = datetime.utcnow()
    with SessionLocal() as db:
        existing = db.query(WaveformModel).filter(WaveformModel.song_id == song_id).first()
        payload = json.dumps(bins, separators=(",", ":"))

        if existing:
            existing.bins_json = payload
            existing.bins_count = len(bins)
            existing.updated_at = now
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return waveform_to_public(existing)

        created = WaveformModel(
            song_id=song_id,
            bins_json=payload,
            bins_count=len(bins),
            created_at=now,
            updated_at=now,
        )
        db.add(created)
        db.commit()
        db.refresh(created)
        return waveform_to_public(created)


def generate_and_store_song_mix(song_id: int) -> None:
    stem_paths = get_song_stem_master_paths(song_id)
    if not stem_paths:
        raise HTTPException(status_code=404, detail="No hay stems para generar mix")

    mix_master = get_song_mix_master_path(song_id)
    mix_stream = get_stream_path_from_master(mix_master)
    mix_master.parent.mkdir(parents=True, exist_ok=True)

    build_mixdown_wav(stem_paths, mix_master)
    try:
        to_stream_mp3(mix_master, mix_stream)
    except HTTPException:
        if mix_stream.exists():
            mix_stream.unlink()


def run_priority_structure_analysis(song_id: int, guide_filename: str) -> None:
    guide_master = get_song_guide_master_path(song_id)
    if not guide_master.exists():
        write_analysis_status(
            song_id,
            status="failed",
            sections_found=0,
            attempts=0,
            detail="No existe guide_track.wav para analizar",
        )
        return

    best_structure: list[dict[str, str]] = []
    guide_duration_seconds = get_wav_duration_seconds(guide_master)
    dynamic_pass_2_seconds = max(ANALYSIS_PASS_2_SECONDS, int(guide_duration_seconds) + 2)
    pass_specs = [
        (WHISPER_MODEL_NAME, ANALYSIS_PASS_1_SECONDS),
        (WHISPER_MODEL_NAME, dynamic_pass_2_seconds),
    ]
    write_analysis_status(song_id, status="running", sections_found=0, attempts=0, detail="Iniciando analisis")

    for attempt, (model_name, max_seconds) in enumerate(pass_specs, start=1):
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_preview:
                preview_path = Path(temp_preview.name)

            try:
                to_preview_wav(guide_master, preview_path, max_seconds)
                structure = analyze_guide_audio(preview_path, model_name=model_name, song_id=song_id)
            finally:
                if preview_path.exists():
                    preview_path.unlink()

            if len(structure) > len(best_structure):
                best_structure = structure
                export_structure_json(
                    song_filename=guide_filename,
                    structure=best_structure,
                    output_path=get_song_dir(song_id) / STRUCTURE_FILENAME,
                )
            write_analysis_status(
                song_id,
                status="running",
                sections_found=len(best_structure),
                attempts=attempt,
                detail=f"Intento {attempt}/2 ({max_seconds}s)",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "No se pudo analizar audio guía para song_id=%s (attempt=%s/2): %s",
                song_id,
                attempt,
                exc,
            )
            write_analysis_status(
                song_id,
                status="running",
                sections_found=len(best_structure),
                attempts=attempt,
                detail=f"Intento {attempt}/2 fallo",
            )

    final_status = "done" if best_structure else "failed"
    final_detail = "Analisis finalizado (2 pasadas)" if best_structure else "No se detectaron secciones en 2 pasadas"
    write_analysis_status(
        song_id,
        status=final_status,
        sections_found=len(best_structure),
        attempts=2,
        detail=final_detail,
    )


def run_post_upload_tasks(song_id: int) -> None:
    try:
        generate_and_store_song_waveform(song_id, WAVEFORM_BINS_DEFAULT)
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudo generar waveform en background para song_id=%s: %s", song_id, exc)

    try:
        generate_and_store_song_mix(song_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("No se pudo generar mix en background para song_id=%s: %s", song_id, exc)


def iter_file_range(path: Path, start: int, end: int, chunk_size: int = 1024 * 1024):
    with open(path, "rb") as handle:
        handle.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = handle.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data


def parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not match:
        return None

    start_raw, end_raw = match.groups()
    if start_raw == "" and end_raw == "":
        return None

    if start_raw == "":
        suffix_length = int(end_raw)
        if suffix_length <= 0:
            return None
        start = max(0, file_size - suffix_length)
        end = file_size - 1
        return start, end

    start = int(start_raw)
    end = int(end_raw) if end_raw else file_size - 1
    if start >= file_size:
        return None
    end = min(end, file_size - 1)
    if end < start:
        return None
    return start, end


def remove_song_stems(song_id: int) -> None:
    with SessionLocal() as db:
        items = db.query(StemModel).filter(StemModel.song_id == song_id).all()
        for item in items:
            path = Path(item.storage_path)
            if path.exists():
                path.unlink()
            stream_path = get_stream_path_from_master(path)
            if stream_path.exists():
                stream_path.unlink()
            db.delete(item)

        waveform = db.query(WaveformModel).filter(WaveformModel.song_id == song_id).first()
        if waveform:
            db.delete(waveform)
        db.commit()

    structure_path = Path(STORAGE_DIR) / f"song_{song_id}" / STRUCTURE_FILENAME
    if structure_path.exists():
        structure_path.unlink()

    guide_master = get_song_guide_master_path(song_id)
    if guide_master.exists():
        guide_master.unlink()
    guide_stream = get_stream_path_from_master(guide_master)
    if guide_stream.exists():
        guide_stream.unlink()

    mix_master = get_song_mix_master_path(song_id)
    if mix_master.exists():
        mix_master.unlink()
    mix_stream = get_stream_path_from_master(mix_master)
    if mix_stream.exists():
        mix_stream.unlink()

    analysis_status_path = get_song_analysis_status_path(song_id)
    if analysis_status_path.exists():
        analysis_status_path.unlink()


def stem_to_public(item: StemModel) -> StemPublic:
    return StemPublic(
        id=item.id,
        song_id=item.song_id,
        stem_name=item.stem_name,
        filename=item.filename,
        format=item.format,
        content_type=item.content_type,
        url=build_stem_url(item.id),
        created_at=item.created_at,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "multitracks"}


@app.get("/stems", response_model=list[StemPublic])
def list_stems(song_id: int | None = None) -> list[StemPublic]:
    with SessionLocal() as db:
        query = db.query(StemModel)
        if song_id is not None:
            query = query.filter(StemModel.song_id == song_id)
        items = query.order_by(StemModel.song_id.asc(), StemModel.stem_name.asc()).all()
        return [stem_to_public(item) for item in items]


@app.get("/songs/{song_id}/stems", response_model=list[StemPublic])
def list_song_stems(song_id: int) -> list[StemPublic]:
    with SessionLocal() as db:
        items = (
            db.query(StemModel)
            .filter(StemModel.song_id == song_id)
            .order_by(StemModel.stem_name.asc())
            .all()
        )
        return [stem_to_public(item) for item in items]


@app.get("/songs/{song_id}/waveform", response_model=WaveformPublic)
def get_song_waveform(song_id: int, bins: int | None = None) -> WaveformPublic:
    requested_bins = bins if bins is not None else WAVEFORM_BINS_DEFAULT
    safe_bins = max(24, min(1024, requested_bins))

    with SessionLocal() as db:
        waveform = db.query(WaveformModel).filter(WaveformModel.song_id == song_id).first()
        if waveform and waveform.bins_count == safe_bins:
            return waveform_to_public(waveform)

    return generate_and_store_song_waveform(song_id, safe_bins)


@app.get("/songs/{song_id}/structure", response_model=SongStructurePublic)
def get_song_structure(song_id: int) -> SongStructurePublic:
    return load_song_structure(song_id)


@app.get("/songs/{song_id}/analysis-status", response_model=GuideAnalysisStatusPublic)
def get_song_analysis_status(song_id: int) -> GuideAnalysisStatusPublic:
    return load_analysis_status(song_id)


@app.get("/songs/{song_id}/guide", response_model=GuideAudioPublic)
def get_song_guide(song_id: int) -> GuideAudioPublic:
    selected = get_song_guide_selected_path(song_id)
    if not selected:
        raise HTTPException(status_code=404, detail="No hay audio guía disponible para esta canción")

    selected_path, media_type, selected_filename = selected
    return GuideAudioPublic(
        song_id=song_id,
        filename=selected_filename,
        content_type=media_type,
        url=build_guide_url(song_id),
    )


@app.get("/songs/{song_id}/mix", response_model=MixAudioPublic)
def get_song_mix(song_id: int) -> MixAudioPublic:
    selected = get_song_mix_selected_path(song_id)
    if not selected:
        raise HTTPException(status_code=404, detail="No hay mix disponible para esta canción")

    _selected_path, media_type, selected_filename = selected
    return MixAudioPublic(
        song_id=song_id,
        filename=selected_filename,
        content_type=media_type,
        url=build_mix_url(song_id),
    )


@app.post("/upload", response_model=MultitrackUploadResponse)
def upload_multitracks(
    background_tasks: BackgroundTasks,
    song_id: int = Form(...),
    archive: UploadFile = File(...),
) -> MultitrackUploadResponse:
    filename = archive.filename or ""
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are allowed")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_zip = Path(temp_dir) / f"upload-{uuid.uuid4().hex}.zip"
        with open(temp_zip, "wb") as buffer:
            shutil.copyfileobj(archive.file, buffer)

        try:
            extract_zip_archive(temp_zip, Path(temp_dir))
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Invalid ZIP file") from exc

        extracted_files = list_audio_files_in_directory(Path(temp_dir))

        if not extracted_files:
            raise HTTPException(status_code=400, detail="ZIP does not contain .mp3 or .wav files")

        remove_song_stems(song_id)

        song_dir = get_song_dir(song_id)
        song_dir.mkdir(parents=True, exist_ok=True)

        guide_audio_file = detect_guide_audio_file(extracted_files)
        stem_files = filter_stem_audio_files(extracted_files, guide_audio_file)
        guide_filename: str | None = None

        if guide_audio_file:
            try:
                guide_master = get_song_guide_master_path(song_id)
                guide_stream = get_stream_path_from_master(guide_master)
                extract_guide_master_wav(guide_audio_file, guide_master, ffmpeg_bin=FFMPEG_BIN)
                guide_filename = guide_audio_file.name
                try:
                    to_stream_mp3(guide_master, guide_stream)
                except HTTPException:
                    if guide_stream.exists():
                        guide_stream.unlink()
            except Exception as exc:
                logger.warning("No se pudo analizar audio guía para song_id=%s: %s", song_id, exc)

        if guide_filename:
            write_analysis_status(song_id, status="queued", sections_found=0, attempts=0, detail="En cola")
        else:
            write_analysis_status(
                song_id,
                status="not_applicable",
                sections_found=0,
                attempts=0,
                detail="No se detecto audio guia en el ZIP",
            )

        if not stem_files:
            raise HTTPException(status_code=400, detail="ZIP does not contain stem audio files")

        created: list[StemModel] = []
        with SessionLocal() as db:
            for source in sorted(stem_files, key=lambda item: item.name.lower()):
                safe_name = Path(source.name).name
                target_name = f"{uuid.uuid4().hex}.wav"
                master_path = song_dir / target_name
                stream_path = get_stream_path_from_master(master_path)

                to_master_wav(source, master_path)

                try:
                    to_stream_mp3(master_path, stream_path)
                except HTTPException:
                    if stream_path.exists():
                        stream_path.unlink()

                item = StemModel(
                    song_id=song_id,
                    stem_name=normalize_stem_name(safe_name),
                    filename=safe_name,
                    format="wav",
                    content_type="audio/wav",
                    storage_path=str(master_path),
                )
                db.add(item)
                created.append(item)

            db.commit()
            for item in created:
                db.refresh(item)

        if guide_filename:
            run_priority_structure_analysis(song_id, guide_filename)

        public_items = [stem_to_public(item) for item in created]
        background_tasks.add_task(run_post_upload_tasks, song_id)
        return MultitrackUploadResponse(
            song_id=song_id,
            total_stems=len(public_items),
            stems=public_items,
            waveform=None,
        )


@app.get("/stems/{stem_id}/file")
def stream_stem(stem_id: int, request: Request):
    with SessionLocal() as db:
        item = db.get(StemModel, stem_id)
        if not item:
            raise HTTPException(status_code=404, detail="Stem not found")

        file_path = Path(item.storage_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Stem file not found")

        selected_path = file_path
        selected_media_type = item.content_type or "audio/wav"
        selected_filename = item.filename

        stream_path = get_stream_path_from_master(file_path)
        if stream_path.exists():
            selected_path = stream_path
            selected_media_type = "audio/mpeg"
            selected_filename = f"{Path(item.filename).stem}.mp3"

        file_size = selected_path.stat().st_size
        range_header = request.headers.get("range")

        base_headers = {
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'inline; filename="{selected_filename}"',
        }

        if range_header:
            parsed_range = parse_range_header(range_header, file_size)
            if not parsed_range:
                raise HTTPException(status_code=416, detail="Invalid Range header")

            start, end = parsed_range
            content_length = end - start + 1
            headers = {
                **base_headers,
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
            }
            return StreamingResponse(
                iter_file_range(selected_path, start, end),
                status_code=206,
                media_type=selected_media_type,
                headers=headers,
            )

        headers = {
            **base_headers,
            "Content-Length": str(file_size),
        }
        return FileResponse(
            path=str(selected_path),
            media_type=selected_media_type,
            headers=headers,
        )


@app.get("/songs/{song_id}/guide/file")
def stream_song_guide(song_id: int, request: Request):
    selected = get_song_guide_selected_path(song_id)
    if not selected:
        raise HTTPException(status_code=404, detail="Guide file not found")

    selected_path, selected_media_type, selected_filename = selected
    file_size = selected_path.stat().st_size
    range_header = request.headers.get("range")

    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{selected_filename}"',
    }

    if range_header:
        parsed_range = parse_range_header(range_header, file_size)
        if not parsed_range:
            raise HTTPException(status_code=416, detail="Invalid Range header")

        start, end = parsed_range
        content_length = end - start + 1
        headers = {
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
        }
        return StreamingResponse(
            iter_file_range(selected_path, start, end),
            status_code=206,
            media_type=selected_media_type,
            headers=headers,
        )

    headers = {
        **base_headers,
        "Content-Length": str(file_size),
    }
    return FileResponse(
        path=str(selected_path),
        media_type=selected_media_type,
        headers=headers,
    )


@app.get("/songs/{song_id}/mix/file")
def stream_song_mix(song_id: int, request: Request):
    selected = get_song_mix_selected_path(song_id)
    if not selected:
        raise HTTPException(status_code=404, detail="Mix file not found")

    selected_path, selected_media_type, selected_filename = selected
    file_size = selected_path.stat().st_size
    range_header = request.headers.get("range")

    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{selected_filename}"',
    }

    if range_header:
        parsed_range = parse_range_header(range_header, file_size)
        if not parsed_range:
            raise HTTPException(status_code=416, detail="Invalid Range header")

        start, end = parsed_range
        content_length = end - start + 1
        headers = {
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
        }
        return StreamingResponse(
            iter_file_range(selected_path, start, end),
            status_code=206,
            media_type=selected_media_type,
            headers=headers,
        )

    headers = {
        **base_headers,
        "Content-Length": str(file_size),
    }
    return FileResponse(
        path=str(selected_path),
        media_type=selected_media_type,
        headers=headers,
    )


@app.delete("/songs/{song_id}/stems")
def delete_song_stems(song_id: int):
    remove_song_stems(song_id)
    return {"deleted": True, "song_id": song_id}
