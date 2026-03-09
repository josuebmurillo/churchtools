import json
from pathlib import Path


def export_structure_json(song_filename: str, structure: list[dict[str, str]], output_path: Path) -> None:
    payload = {
        "song": song_filename,
        "structure": structure,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
