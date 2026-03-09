from pathlib import Path
import unicodedata

PRIMARY_GUIDE_FILENAMES = {
    "guide.mp3",
    "guide.wav",
    "guia.mp3",
    "guia.wav",
    "cue.mp3",
    "cue.wav",
    "cues.mp3",
    "cues.wav",
}

FALLBACK_GUIDE_FILENAMES = {
    "ag.mp3",
    "ag.wav",
}


def normalize_filename(filename: str) -> str:
    lowered = filename.lower().strip()
    normalized = unicodedata.normalize("NFKD", lowered)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def detect_guide_audio_file(audio_files: list[Path]) -> Path | None:
    ordered = sorted(audio_files, key=lambda item: item.name.lower())

    for path in ordered:
        if normalize_filename(path.name) in PRIMARY_GUIDE_FILENAMES:
            return path

    for path in ordered:
        if normalize_filename(path.name) in FALLBACK_GUIDE_FILENAMES:
            return path

    return None


def filter_stem_audio_files(audio_files: list[Path], guide_audio_file: Path | None) -> list[Path]:
    if guide_audio_file is None:
        return audio_files
    guide_resolved = guide_audio_file.resolve()
    return [path for path in audio_files if path.resolve() != guide_resolved]
