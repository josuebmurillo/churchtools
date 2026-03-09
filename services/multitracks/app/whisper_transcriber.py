from functools import lru_cache
from pathlib import Path
import os

import whisper


def detect_default_device() -> str:
    forced = os.getenv("MULTITRACKS_WHISPER_DEVICE", "").strip().lower()
    if forced in {"cpu", "cuda"}:
        return forced

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


@lru_cache(maxsize=4)
def get_whisper_model(model_name: str, device: str):
    return whisper.load_model(model_name, device=device)


def transcribe_with_whisper(guide_audio_path: Path, model_name: str = "tiny") -> dict:
    device = detect_default_device()
    model = get_whisper_model(model_name, device)

    return model.transcribe(
        str(guide_audio_path),
        word_timestamps=True,
        fp16=False,
        task="transcribe",
        condition_on_previous_text=False,
        temperature=0,
    )
