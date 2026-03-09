def format_seconds_to_timestamp(seconds: float) -> str:
    safe_seconds = max(0.0, float(seconds))
    minutes = int(safe_seconds // 60)
    secs = safe_seconds - (minutes * 60)
    return f"{minutes:02d}:{secs:06.3f}"
