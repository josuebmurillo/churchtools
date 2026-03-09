from pathlib import Path
import os


def detect_default_device() -> str:
    forced = os.getenv("MULTITRACKS_WHISPERX_DEVICE", "").strip().lower()
    if forced in {"cpu", "cuda"}:
        return forced

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def align_words_with_whisperx(audio_path: Path, whisper_result: dict) -> list[dict]:
    enabled = os.getenv("MULTITRACKS_WHISPERX_ENABLED", "").strip().lower()
    force_enabled = enabled in {"1", "true", "yes", "on"}

    if not force_enabled and detect_default_device() != "cuda":
        raise RuntimeError("whisperx deshabilitado en CPU para priorizar estabilidad")

    try:
        import whisperx
    except Exception as exc:
        raise RuntimeError("whisperx no está disponible") from exc

    segments = whisper_result.get("segments") or []
    if not segments:
        return []

    language_code = whisper_result.get("language") or "es"
    device = detect_default_device()

    model_a, metadata = whisperx.load_align_model(language_code=language_code, device=device)
    aligned = whisperx.align(
        segments,
        model_a,
        metadata,
        str(audio_path),
        device,
        return_char_alignments=False,
    )

    words = aligned.get("word_segments")
    if isinstance(words, list):
        return words

    resolved: list[dict] = []
    for segment in aligned.get("segments", []):
        for word in segment.get("words", []) or []:
            resolved.append(word)
    return resolved
