from pathlib import Path
import subprocess


def run_ffmpeg(ffmpeg_bin: str, args: list[str], detail: str) -> None:
    command = [ffmpeg_bin, *args]
    try:
        subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg no está instalado en el contenedor") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"{detail}: {exc.stderr.strip() or 'error de ffmpeg'}") from exc


def extract_guide_master_wav(source_path: Path, target_master_path: Path, ffmpeg_bin: str = "ffmpeg") -> Path:
    target_master_path.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        ffmpeg_bin,
        [
            "-y",
            "-i",
            str(source_path),
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(target_master_path),
        ],
        "No se pudo extraer/normalizar audio guía",
    )
    return target_master_path
