from pathlib import Path
import unicodedata

GUIDE_FILENAMES = {
    "guide.mp3",
    "guide.wav",
    "guides.mp3",
    "guides.wav",
    "guia.mp3",
    "guia.wav",
    "guias.mp3",
    "guias.wav",
    "cue.mp3",
    "cue.wav",
    "cues.mp3",
    "cues.wav",
}


def normalize_filename(filename: str) -> str:
    lowered = filename.lower().strip()
    normalized = unicodedata.normalize("NFKD", lowered)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def find_guide_audio_file(audio_files: list[Path]) -> Path | None:
    for path in sorted(audio_files, key=lambda item: item.name.lower()):
        if normalize_filename(path.name) in GUIDE_FILENAMES:
            return path
    return None


def filter_stem_audio_files(audio_files: list[Path], guide_audio_file: Path | None) -> list[Path]:
    if guide_audio_file is None:
        return audio_files
    guide_resolved = guide_audio_file.resolve()
    return [path for path in audio_files if path.resolve() != guide_resolved]
