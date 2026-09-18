"""
Unit tests for SATRA Multilingual AI Assistant.
Tests language detection, query normalization, RAG retrieval for multilingual queries,
and response localization across English, Tamil, Tanglish, and Hindi.
"""

import pytest
from backend.rag.multilingual import (
    detect_language,
    normalize_multilingual_query,
    localize_response,
)
from backend.services.chat_service import generate_chat_response


def test_detect_language():
    # Native Tamil script
    assert detect_language("NASA FIRMS என்றால் என்ன?") == "ta"
    assert detect_language("இன்றைய தீ கண்டறிதல்களைக் காட்டு") == "ta"

    # Native Hindi script
    assert detect_language("NASA FIRMS क्या है?") == "hi"
    assert detect_language("आज के आग के मामलों को दिखाओ") == "hi"

    # Tanglish (Romanized Tamil)
    assert detect_language("NASA FIRMS na enna?") == "tanglish"
    assert detect_language("satra enna ai model use pannuthu?") == "tanglish"
    assert detect_language("innaiku ethana fire?") == "tanglish"

    # English
    assert detect_language("What is NASA FIRMS?") == "en"
    assert detect_language("Show recent alerts") == "en"


def test_normalize_multilingual_query():
    # Tamil queries normalize to English search terms
    ta_norm = normalize_multilingual_query("NASA FIRMS என்றால் என்ன?")
    assert "NASA FIRMS" in ta_norm
    assert "sensors" in ta_norm or "VIIRS" in ta_norm

    # Tanglish queries normalize to English search terms
    tang_norm = normalize_multilingual_query("frp na enna?")
    assert "Fire Radiative Power" in tang_norm or "FRP" in tang_norm

    # Hindi queries normalize to English search terms
    hi_norm = normalize_multilingual_query("NASA FIRMS क्या है?")
    assert "NASA FIRMS" in hi_norm


def test_generate_chat_response_english():
    res = generate_chat_response("What is NASA FIRMS?", language="en")
    assert "response" in res
    assert "NASA FIRMS" in res["response"]
    assert res.get("language") == "en"


def test_generate_chat_response_tamil():
    # Tamil query with auto detection
    res = generate_chat_response("NASA FIRMS என்றால் என்ன?", language="auto")
    assert "response" in res
    assert res.get("language") == "ta"
    # Contains Tamil explanation with preserved technical terms
    assert "செயற்கைக்கோள்" in res["response"] or "அறிவுத் தளத்திலிருந்து" in res["response"]
    assert "VIIRS" in res["response"] or "MODIS" in res["response"]


def test_generate_chat_response_tanglish():
    # Tanglish query with auto detection
    res = generate_chat_response("NASA FIRMS na enna?", language="auto")
    assert "response" in res
    assert res.get("language") == "tanglish"
    assert "satellite" in res["response"] or "Knowledge Base" in res["response"]
    assert "VIIRS" in res["response"]


def test_generate_chat_response_hindi():
    # Hindi query with auto detection
    res = generate_chat_response("NASA FIRMS क्या है?", language="auto")
    assert "response" in res
    assert res.get("language") == "hi"
    assert "सेंसर" in res["response"] or "उपग्रह" in res["response"] or "नॉलेज बेस" in res["response"]
    assert "VIIRS" in res["response"]


def test_out_of_scope_multilingual():
    # English
    res_en = generate_chat_response("How to make chocolate cake?", language="en")
    assert "specialized in industrial fire detection" in res_en["response"]

    # Tamil
    res_ta = generate_chat_response("சாக்லேட் கேக் செய்வது எப்படி?", language="auto")
    assert "தொழில்துறை தீ கண்டறிதல்" in res_ta["response"]

    # Tanglish
    res_tang = generate_chat_response("chocolate cake recipe sollu", language="auto")
    assert "industrial fire detection" in res_tang["response"]
