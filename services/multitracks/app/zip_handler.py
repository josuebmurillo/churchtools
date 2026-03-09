from pathlib import Path
import zipfile


def extract_zip_archive(zip_path: Path, destination_dir: Path) -> None:
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(destination_dir)


def list_audio_files_in_directory(directory: Path) -> list[Path]:
    audio_files: list[Path] = []
    for path in directory.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".mp3", ".wav"}:
            continue
        audio_files.append(path)
    return sorted(audio_files, key=lambda item: item.name.lower())
