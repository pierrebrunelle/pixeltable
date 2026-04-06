"""Shared helpers for the SiteWatch surveillance platform."""
from typing import Any


def gemini_text(val: dict[str, Any] | None) -> str:
    """Extract plain text from a Gemini generate_content response dict.

    Returns empty string when the value is None or cannot be parsed.
    """
    if not val:
        return ''
    try:
        return val['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError, TypeError):
        return str(val)


def parse_severity(raw: dict[str, Any] | None) -> str:
    """Normalize a Gemini severity response to 'critical', 'warning', or 'info'."""
    text = gemini_text(raw).strip().upper()
    if 'CRITICAL' in text:
        return 'critical'
    if 'WARNING' in text:
        return 'warning'
    return 'info'


def is_alert(raw: dict[str, Any] | None) -> bool:
    """True when severity is CRITICAL or WARNING."""
    return parse_severity(raw) in ('critical', 'warning')
