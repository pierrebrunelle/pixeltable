"""Shared helpers and custom UDFs for the SiteWatch surveillance platform."""
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
