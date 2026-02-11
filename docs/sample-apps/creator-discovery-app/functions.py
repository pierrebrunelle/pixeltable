"""
Custom UDFs
===========
Application-specific Pixeltable UDFs.
Kept in a separate module so they can be imported by setup_pixeltable.py
(for computed columns) and app.py (for queries).

- parse_brand_mentions: parses the JSON string from any vision model
- gemini_analyze_frame: alternative to openai.vision for Gemini users
"""

import json

import PIL.Image

import pixeltable as pxt


@pxt.udf
def parse_brand_mentions(vision_response: str) -> dict:
    """
    Parse the JSON string returned by a vision model into a structured dict.

    Works with both OpenAI vision and Gemini generate_content output.

    Expected output shape:
        {
            "brands": ["Nike", "Adidas"],
            "description": "...",
            "prominence": "high" | "medium" | "low" | "none"
        }
    """
    try:
        parsed = json.loads(vision_response)
        return {
            'brands': parsed.get('brands', []),
            'description': parsed.get('description', ''),
            'prominence': parsed.get('prominence', 'none'),
        }
    except (json.JSONDecodeError, TypeError):
        return {'brands': [], 'description': '', 'prominence': 'none'}


@pxt.udf
async def gemini_analyze_frame(
    prompt: str, image: PIL.Image.Image, *, model: str
) -> str:
    """
    Analyze an image using Google Gemini's multimodal capability.

    This is a thin wrapper that mirrors the signature of openai.vision
    (prompt, image, *, model) → str, so it can be used as a drop-in
    replacement in computed columns.

    The built-in gemini.generate_content UDF types its ``contents``
    parameter as pxt.Json, which cannot hold PIL images in a computed
    column.  This UDF accepts the image directly instead.

    __Requirements:__

    - ``pip install google-genai``
    - ``GEMINI_API_KEY`` environment variable set

    Args:
        prompt: The analysis prompt.
        image: The image to analyze.
        model: Gemini model name (e.g. ``gemini-2.0-flash``).

    Returns:
        The model's text response.
    """
    from pixeltable import env

    env.Env.get().require_package('google.genai')
    client = env.Env.get().get_client('gemini')
    response = await client.aio.models.generate_content(
        model=model,
        contents=[prompt, image],
    )
    return response.text
