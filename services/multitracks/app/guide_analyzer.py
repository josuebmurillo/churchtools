from pathlib import Path
import logging

from .section_detector import collect_candidates_from_words, reduce_candidates_to_structure
from .whisper_transcriber import transcribe_with_whisper
from .whisperx_aligner import align_words_with_whisperx

logger = logging.getLogger(__name__)


def analyze_guide_audio(guide_audio_path: Path, model_name: str = "tiny", song_id: int | None = None) -> list[dict[str, str]]:
    import json
    import os
    result = transcribe_with_whisper(guide_audio_path, model_name=model_name)

    # Guardar transcript.json SIEMPRE en la carpeta persistente por song_id si está disponible
    if song_id is not None:
        storage_dir = os.getenv("MULTITRACKS_STORAGE_DIR", "/data/multitracks")
        transcript_path = Path(storage_dir) / f"song_{song_id}" / "transcript.json"
        try:
            transcript_path.parent.mkdir(parents=True, exist_ok=True)
            with open(transcript_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
        except Exception as exc:
            logger.warning("No se pudo guardar transcript.json: %s", exc)

    words: list[dict] = []
    try:
        words = align_words_with_whisperx(guide_audio_path, result)
        logger.info("WhisperX alignment aplicado para %s (%s palabras)", guide_audio_path.name, len(words))
    except Exception as exc:  # noqa: BLE001
        logger.warning("WhisperX alignment no disponible para %s: %s", guide_audio_path.name, exc)
        for segment in result.get("segments", []):
            for word in segment.get("words", []) or []:
                words.append(word)

    candidates = collect_candidates_from_words(words)
    return reduce_candidates_to_structure(candidates)
