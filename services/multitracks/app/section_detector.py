import re
import unicodedata
from typing import TypedDict

from .time_formatter import format_seconds_to_timestamp

SECTION_NORMALIZATION = {
        "pero": "verso",
        "¿pero": "verso",
        "¿pero?": "verso",
        "peros": "verso",
        "persodos": "verso",
    "intro": "intro",
    "introduccion": "intro",
    "introduction": "intro",
    "verse": "verso",
    "verses": "verso",
    "verso": "verso",
    "estrofa": "verso",
    "stanza": "verso",
    "berso": "verso",
    "berzo": "verso",
    "perso": "verso",
    "pérsodo": "verso",
    "persodo": "verso",
    "perzo": "verso",
    "verzo": "verso",
    "versodo": "verso",
    "versodos": "verso",
    "versos": "verso",
    "versodo": "verso",
    "versodo": "verso",
    "prechorus": "pre-coro",
    "prechrous": "pre-coro",
    "prechourus": "pre-coro",
    "precoro": "pre-coro",
    "preestribillo": "pre-coro",
    "chorus": "coro",
    "chrous": "coro",
    "chores": "coro",
    "refrain": "refrain",
    "estribillo": "coro",
    "corusc": "coro",
    "corris": "coro",
    "corus": "coro",
    "choros": "coro",
    "coro": "coro",
    "bridge": "puente",
    "bridges": "puente",
    "puent": "puente",
    "puente": "puente",
    "instrumental": "instrumental",
    "instrumetal": "instrumental",
    "instrument": "instrumental",
    "solo": "instrumental",
    "intermedio": "interludio",
    "interlude": "interludio",
    "interlud": "interludio",
    "interlood": "interludio",
    "enterlude": "interludio",
    "interludee": "interludio",
    "interludio": "interludio",
    "outro": "salida",
    "outros": "salida",
    "ending": "salida",
    "end": "salida",
    "finale": "salida",
    "fin": "salida",
    "saida": "salida",
    "final": "salida",
}

IGNORED_COUNT_WORDS = {
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
}

MIN_WORD_CONFIDENCE = 0.3
MIN_SECTION_GAP_SECONDS = 1.2
MIN_REPEAT_SECTION_GAP_SECONDS = 9.0
REPEAT_SECTION_GAP_BY_SECTION = {
    "coro": 42.0,
    "refrain": 42.0,
}
SECTION_WINDOW_SECONDS = 1.7
MIN_GROUP_SCORE = 0.5
MIN_SEGMENT_ONLY_SCORE = 1.0
MIN_SEGMENT_ONLY_COUNT = 2
MISSING_VERSE_INFERENCE_GAP_SECONDS = 44.0

SECTION_CODE_BY_CANONICAL = {
    "intro": "I",
    "verso": "V",
    "pre-coro": "PC",
    "coro": "C",
    "refrain": "RF",
    "interludio": "It",
    "puente": "P",
    "instrumental": "In",
    "salida": "O",
}

# Allow known ASR distortions of section words with lower confidence.
TOKEN_MIN_CONFIDENCE_OVERRIDES = {
    "corris": 0.15,
    "corusc": 0.15,
    "corus": 0.18,
    "choros": 0.18,
    "chrous": 0.2,
    "chores": 0.2,
    "interlud": 0.2,
    "interlood": 0.2,
    "enterlude": 0.2,
    "bridges": 0.25,
    "puent": 0.25,
    "refrain": 0.18,
}


class SectionCandidate(TypedDict):
    section: str
    start_seconds: float
    confidence: float
    source: str


def normalize_token(value: str) -> str:
    lowered = value.lower().strip()
    normalized = unicodedata.normalize("NFKD", lowered)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z]+", "", without_accents)


def map_tokens_to_section(current: str, next_token: str | None = None) -> tuple[str | None, int]:
    if not current:
        return None, 1
    if current in IGNORED_COUNT_WORDS:
        return None, 1

    if current in {"pre", "before"} and next_token in {"chorus", "chrous", "coro", "estribillo", "corus", "corusc", "corris"}:
        return "pre-coro", 2

    if current in {"enter", "inter"} and next_token in {"lude", "lud", "ludio", "medio"}:
        return "interludio", 2

    normalized = SECTION_NORMALIZATION.get(current)
    return normalized, 1


def can_append_section(section: str, start_seconds: float, last_section: str | None, last_seconds: float | None) -> bool:
    if last_seconds is not None and (start_seconds - last_seconds) < MIN_SECTION_GAP_SECONDS:
        return False
    if section == last_section and last_seconds is not None:
        repeat_gap = REPEAT_SECTION_GAP_BY_SECTION.get(section, MIN_REPEAT_SECTION_GAP_SECONDS)
        if (start_seconds - last_seconds) < repeat_gap:
            return False
    return True


def to_compact_section_code(section: str, section_counts: dict[str, int]) -> str:
    base_code = SECTION_CODE_BY_CANONICAL.get(section)
    if not base_code:
        return section

    count = section_counts.get(section, 0) + 1
    section_counts[section] = count

    if section == "verso":
        return f"{base_code}{count}"
    return base_code


def enrich_canonical_structure(canonical_structure: list[tuple[float, str]]) -> list[tuple[float, str]]:
    if len(canonical_structure) < 3:
        return canonical_structure

    result: list[tuple[float, str]] = []

    for index, (seconds, section) in enumerate(canonical_structure):
        result.append((seconds, section))

        if section != "coro":
            continue
        if index + 2 >= len(canonical_structure):
            continue

        next_seconds, next_section = canonical_structure[index + 1]
        _after_next_seconds, after_next_section = canonical_structure[index + 2]

        if next_section != "coro" or after_next_section != "interludio":
            continue

        gap_to_next_coro = next_seconds - seconds
        if gap_to_next_coro < MISSING_VERSE_INFERENCE_GAP_SECONDS:
            continue

        inferred_seconds = seconds + (gap_to_next_coro * 0.52)
        if inferred_seconds >= next_seconds:
            continue

        result.append((inferred_seconds, "verso"))

    result.sort(key=lambda item: item[0])
    return result


def collect_candidates_from_words(words: list[dict]) -> list[SectionCandidate]:
    resolved_words: list[tuple[str, float, float, str]] = []
    for word in words:
        text = str(word.get("word", ""))
        token = normalize_token(text)
        if not token:
            continue

        start = float(word.get("start", 0.0))
        confidence = word.get("score")
        if not isinstance(confidence, (int, float)):
            confidence = word.get("probability")
        score = float(confidence) if isinstance(confidence, (int, float)) else 0.0
        source = "word"
        resolved_words.append((token, start, score, source))

    candidates: list[SectionCandidate] = []
    index = 0
    while index < len(resolved_words):
        token, start, score, source = resolved_words[index]
        next_token = resolved_words[index + 1][0] if index + 1 < len(resolved_words) else None

        section, consumed = map_tokens_to_section(token, next_token)
        if section:
            min_confidence = TOKEN_MIN_CONFIDENCE_OVERRIDES.get(token, MIN_WORD_CONFIDENCE)
            if source == "word" and score < min_confidence:
                index += consumed
                continue

            candidates.append(
                {
                    "section": section,
                    "start_seconds": start,
                    "confidence": max(score, 0.52),
                    "source": source,
                }
            )

        index += consumed

    return candidates


def reduce_candidates_to_structure(candidates: list[SectionCandidate]) -> list[dict[str, str]]:
    if not candidates:
        return []

    sorted_candidates = sorted(candidates, key=lambda item: item["start_seconds"])
    grouped: list[list[SectionCandidate]] = []
    current_group: list[SectionCandidate] = []
    window_anchor = sorted_candidates[0]["start_seconds"]

    for candidate in sorted_candidates:
        if (candidate["start_seconds"] - window_anchor) <= SECTION_WINDOW_SECONDS:
            current_group.append(candidate)
            continue
        grouped.append(current_group)
        current_group = [candidate]
        window_anchor = candidate["start_seconds"]

    if current_group:
        grouped.append(current_group)

    canonical_structure: list[tuple[float, str]] = []
    last_section: str | None = None
    last_seconds: float | None = None

    for group in grouped:
        score_by_section: dict[str, float] = {}
        first_time_by_section: dict[str, float] = {}
        count_by_section: dict[str, int] = {}
        word_count_by_section: dict[str, int] = {}

        for candidate in group:
            section = candidate["section"]
            score_by_section[section] = score_by_section.get(section, 0.0) + candidate["confidence"]
            count_by_section[section] = count_by_section.get(section, 0) + 1
            if candidate["source"] == "word":
                word_count_by_section[section] = word_count_by_section.get(section, 0) + 1
            if section not in first_time_by_section:
                first_time_by_section[section] = candidate["start_seconds"]

        selected_section = max(score_by_section.items(), key=lambda item: item[1])[0]
        selected_seconds = first_time_by_section[selected_section]
        selected_score = score_by_section.get(selected_section, 0.0)
        selected_count = count_by_section.get(selected_section, 0)
        selected_word_count = word_count_by_section.get(selected_section, 0)

        if selected_word_count > 0:
            if selected_score < MIN_GROUP_SCORE:
                continue
        else:
            if selected_score < MIN_SEGMENT_ONLY_SCORE or selected_count < MIN_SEGMENT_ONLY_COUNT:
                continue

        if not can_append_section(selected_section, selected_seconds, last_section, last_seconds):
            continue

        canonical_structure.append((selected_seconds, selected_section))
        last_section = selected_section
        last_seconds = selected_seconds

    canonical_structure = enrich_canonical_structure(canonical_structure)

    structure: list[dict[str, str]] = []
    section_counts: dict[str, int] = {}
    last_compact_section: str | None = None
    for seconds, canonical_section in canonical_structure:
        if canonical_section == last_compact_section:
            continue

        structure.append(
            {
                "time": format_seconds_to_timestamp(seconds),
                "section": to_compact_section_code(canonical_section, section_counts),
            }
        )
        last_compact_section = canonical_section

    return structure
