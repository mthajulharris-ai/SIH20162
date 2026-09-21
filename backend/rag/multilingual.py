"""
Multilingual processing module for SATRA AI Assistant.
Supports language detection, query normalization for RAG/vector retrieval,
and response localization across English, Tamil (தமிழ்), Tanglish, and Hindi (हिन्दी).
"""

import re
from typing import Dict, Any, Optional

# Unicode Ranges for Indic and Arabic/Urdu scripts
TAMIL_PATTERN = re.compile(r'[\u0B80-\u0BFF]')
TELUGU_PATTERN = re.compile(r'[\u0C00-\u0C7F]')
KANNADA_PATTERN = re.compile(r'[\u0C80-\u0CFF]')
MALAYALAM_PATTERN = re.compile(r'[\u0D00-\u0D7F]')
DEVANAGARI_PATTERN = re.compile(r'[\u0900-\u097F]')
GUJARATI_PATTERN = re.compile(r'[\u0A80-\u0AFF]')
BENGALI_ASSAMESE_PATTERN = re.compile(r'[\u0980-\u09FF]')
GURMUKHI_PUNJABI_PATTERN = re.compile(r'[\u0A00-\u0A7F]')
ODIA_PATTERN = re.compile(r'[\u0B00-\u0B7F]')
URDU_ARABIC_PATTERN = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')

# Phonetic / Colloquial Lexical Patterns for Romanized Text
TANGLISH_MARKERS = [
    r'\bna enna\b', r'\benna\b', r'\bepdi\b', r'\beppadi\b', r'\birukku\b',
    r'\billai\b', r'\bsolla\b', r'\btheriyuma\b', r'\bthee\b', r'\bkaatu\b',
    r'\baagum\b', r'\bpannum\b', r'\bpannuthu\b', r'\bkandupidikkuthu\b',
    r'\bsolvathu\b', r'\benakku\b', r'\bungalukku\b', r'\bsolunga\b',
    r'\bnaalu\b', r'\bvagaipaadu\b', r'\bperum\b', r'\binnaiku\b', r'\bkaatunga\b',
    r'\bpannirukkinga\b', r'\baaguthu\b', r'\bkitta\b', r'\bpaththi\b', r'\bpathi\b',
    r'\btheriyum\b', r'\bkelunga\b',
]

HINGLISH_MARKERS = [
    r'\bkya hai\b', r'\bkaise\b', r'\bbatao\b', r'\bhota hai\b', r'\bhoti hai\b',
    r'\bpehechan\b', r'\bpehchan\b', r'\bkahan\b', r'\bkyun\b', r'\bkaisi\b',
    r'\bkaun sa\b', r'\bkaun si\b', r'\baag\b', r'\bdikhao\b', r'\baaj\b',
    r'\bchaar\b', r'\bkarega\b', r'\bkarta hai\b', r'\biska\b', r'\buska\b',
    r'\bkari\b', r'\bkare\b', r'\bbataiye\b', r'\bmadad\b', r'\bkuch\b',
]

ROMAN_TELUGU_MARKERS = [
    r'\bante enti\b', r'\bante emiti\b', r'\bela\b', r'\bcheppandi\b',
    r'\bunnadi\b', r'\benti\b', r'\bemiti\b', r'\bcheyali\b', r'\bchupinchandi\b',
    r'\bivvala\b', r'\benni\b', r'\bela pani\b',
]

# Specific lexical distinctions for Devanagari script languages
MARATHI_DEVANAGARI_MARKERS = [
    "आहे", "नाही", "म्हणजे", "काय", "कसे", "दाखवा", "सांगा", "करतो", "करा", "आजचे", "आगीचे"
]

RAJASTHANI_DEVANAGARI_MARKERS = [
    "कांई", "हैसी", "छै", "म्हैं", "म्हाने", "बतावो", "किया", "कियाँ", "घणी"
]

ASSAMESE_MARKERS = [
    "অসমীয়া", "কেনেকৈ", "কিদৰে", "মই", "আপোনাৰ", "কৰিব"
]


def detect_scripts(text: str):
    """
    Detects Indic/Urdu scripts in text, returning list of (lang_code, count) sorted descending.
    """
    if not text:
        return []
    counts = []
    patterns = [
        ("te", TELUGU_PATTERN),
        ("ta", TAMIL_PATTERN),
        ("kn", KANNADA_PATTERN),
        ("ml", MALAYALAM_PATTERN),
        ("gu", GUJARATI_PATTERN),
        ("pa", GURMUKHI_PUNJABI_PATTERN),
        ("or", ODIA_PATTERN),
        ("ur", URDU_ARABIC_PATTERN),
    ]
    for code, pat in patterns:
        matches = pat.findall(text)
        if matches:
            counts.append((code, len(matches)))

    if BENGALI_ASSAMESE_PATTERN.search(text):
        matches = BENGALI_ASSAMESE_PATTERN.findall(text)
        if any(marker in text for marker in ASSAMESE_MARKERS):
            counts.append(("as", len(matches)))
        else:
            counts.append(("bn", len(matches)))

    if DEVANAGARI_PATTERN.search(text):
        matches = DEVANAGARI_PATTERN.findall(text)
        if any(marker in text for marker in MARATHI_DEVANAGARI_MARKERS):
            counts.append(("mr", len(matches)))
        elif any(marker in text for marker in RAJASTHANI_DEVANAGARI_MARKERS):
            counts.append(("raj", len(matches)))
        else:
            counts.append(("hi", len(matches)))

    counts.sort(key=lambda x: x[1], reverse=True)
    return counts


def detect_language(text: str) -> str:
    """
    Detects language or style of the input text.
    Returns language codes:
    'ta', 'te', 'kn', 'ml', 'hi', 'mr', 'gu', 'bn', 'pa', 'or', 'as', 'ur', 'raj', 'tanglish', or 'en'.
    Returns 'neutral' for short technical acronyms ('RAG', 'FRP', 'NASA FIRMS'), greetings, or ambiguous text.
    """
    if not text or not text.strip():
        return "neutral"

    clean_text = text.strip()
    clean_lower = clean_text.lower()

    # 1. Native script detection (highest confidence)
    scripts = detect_scripts(clean_text)
    if scripts:
        return scripts[0][0]

    # 2. Check for explicit language name queries (e.g. "Telugu RAG", "Tamil FRP")
    explicit_lang_names = {
        "telugu": "te",
        "tamil": "ta",
        "hindi": "hi",
        "kannada": "kn",
        "malayalam": "ml",
        "marathi": "mr",
        "gujarati": "gu",
        "bengali": "bn",
        "punjabi": "pa",
        "odia": "or",
        "assamese": "as",
        "urdu": "ur",
        "tanglish": "tanglish",
    }
    for name, code in explicit_lang_names.items():
        if re.search(rf"\b{name}\b", clean_lower):
            return code

    # 3. Romanized / Transliterated text detection
    for marker in TANGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "tanglish"

    for marker in HINGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "hi"

    for marker in ROMAN_TELUGU_MARKERS:
        if re.search(marker, clean_lower):
            return "te"

    # 4. Check for clear English indicators / sentence grammar
    english_query_cues = [
        "what is", "what are", "how does", "how do", "how many", "why is", "why was",
        "tell me", "explain", "show me", "which is", "which are", "where is", "details of",
        "status of", "difference between", "can you", "could you", "today's", "todays",
        "classify", "classification", "overview", "meaning of", "define"
    ]
    if any(cue in clean_lower for cue in english_query_cues):
        return "en"

    # 5. Neutral / Acronym / Short query check
    words = re.findall(r'\b\w+\b', clean_lower)
    domain_acronyms = {
        "rag", "frp", "firms", "nasa", "viirs", "modis", "gis", "dbscan",
        "satra", "snpp", "terra", "aqua", "mwir", "i4", "i5", "m13", "rf", "xgb", "lgbm"
    }
    ambiguous_words = {"hi", "hello", "hey", "help", "ok", "yes", "no", "thanks", "test"}

    if all(w in domain_acronyms or w in ambiguous_words for w in words) or len(words) <= 2:
        return "neutral"

    # Default to English if standard ASCII with English words
    return "en"


def resolve_response_language(
    message: str,
    preferred_language: str = "auto",
    history: Optional[Any] = None,
) -> str:
    """
    Resolves response language strictly honoring the required priority:
    1. Actual current question's language/script when detectable
    2. If mixed scripts are present (e.g. "FRP అంటే என்ன?"), honor preferred_language if it matches one of the scripts
    3. Explicit language keywords in query (e.g. "Telugu RAG")
    4. Transliterated / Romanized markers (Tanglish, Hinglish, Roman Telugu)
    5. English grammatical questions ("What is NASA FIRMS?")
    6. Selected Preferred Language for neutral / acronym queries ("RAG", "FRP", "NASA FIRMS")
    7. Conversation history fallback if preferred is 'auto'
    8. Default English ('en')
    """
    clean_text = (message or "").strip()
    if not clean_text:
        pref = (preferred_language or "").strip().lower()
        return pref if pref and pref != "auto" else "en"

    pref = (preferred_language or "").strip().lower()
    valid_prefs = {
        "en", "ta", "tanglish", "te", "kn", "ml", "hi", "mr",
        "gu", "bn", "pa", "or", "as", "ur", "raj"
    }

    # 1. Native script detection
    scripts = detect_scripts(clean_text)
    if scripts:
        present_codes = [code for code, _ in scripts]
        # If preferred language is one of the scripts present, prefer it!
        if pref in present_codes:
            return pref
        # Otherwise return the script with the highest character count
        return scripts[0][0]

    # 2. Check for explicit language names in query (e.g. "Telugu RAG")
    clean_lower = clean_text.lower()
    explicit_lang_names = {
        "telugu": "te",
        "tamil": "ta",
        "hindi": "hi",
        "kannada": "kn",
        "malayalam": "ml",
        "marathi": "mr",
        "gujarati": "gu",
        "bengali": "bn",
        "punjabi": "pa",
        "odia": "or",
        "assamese": "as",
        "urdu": "ur",
        "tanglish": "tanglish",
    }
    for name, code in explicit_lang_names.items():
        if re.search(rf"\b{name}\b", clean_lower):
            return code

    # 3. Romanized / Transliterated text detection
    for marker in TANGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "tanglish"

    for marker in HINGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "hi"

    for marker in ROMAN_TELUGU_MARKERS:
        if re.search(marker, clean_lower):
            return "te"

    # 4. Clear English indicators
    english_query_cues = [
        "what is", "what are", "how does", "how do", "how many", "why is", "why was",
        "tell me", "explain", "show me", "which is", "which are", "where is", "details of",
        "status of", "difference between", "can you", "could you", "today's", "todays",
        "classify", "classification", "overview", "meaning of", "define"
    ]
    if any(cue in clean_lower for cue in english_query_cues):
        return "en"

    # 5. Neutral / Acronym queries (e.g. "RAG", "FRP", "NASA FIRMS", "hello")
    # Use Selected Preferred Language if set and not "auto"
    if pref in valid_prefs and pref != "auto":
        return pref

    # 6. Check conversation history if current message is neutral and pref is auto
    if history and isinstance(history, list) and len(history) > 0:
        for item in reversed(history):
            content = ""
            if isinstance(item, dict):
                content = item.get("content", "")
            elif hasattr(item, "content"):
                content = getattr(item, "content", "")
            if content and content.strip() != clean_text:
                hist_scripts = detect_scripts(content)
                if hist_scripts:
                    return hist_scripts[0][0]
                hist_det = detect_language(content)
                if hist_det and hist_det != "neutral":
                    return hist_det

    # 7. Default English fallback
    return "en"



# Semantic mapping dictionary to translate multilingual user intent into English technical search concepts
MULTILINGUAL_QUERY_MAP = [
    # 1. NASA FIRMS
    (
        [
            "nasa firms என்றால் என்ன", "nasa firms என்ன", "nasa firms பற்றி",
            "nasa firms na enna", "firms na enna", "nasa firms enna",
            "nasa firms क्या है", "nasa firms kya hai", "firms kya hai",
            "nasa firms అంటే ఏమిటి", "nasa firms enti", "nasa firms ante enti",
            "nasa firms ಎಂದರೇನು", "nasa firms enu",
            "nasa firms എന്താണ്", "nasa firms enthanu",
            "nasa firms म्हणजे काय", "nasa firms काय आहे",
            "nasa firms શું છે", "nasa firms shu che",
            "nasa firms কী", "nasa firms ki",
            "nasa firms ਕੀ ਹੈ", "nasa firms ki hai",
            "nasa firms କଣ", "nasa firms kana",
            "nasa firms কি", "nasa firms کیا ہے",
            "nasa firms kya hai aur iska data", "nasa firms என்ன use பண்ணுது",
            "nasa firms na enna? idhu epdi work aaguthu",
            "what is nasa firms", "what is firms", "nasa firms", "firms",
            "english nasa firms", "tamil nasa firms", "telugu nasa firms", "hindi nasa firms",
        ],
        "What is NASA FIRMS satellite constellation overview sensors VIIRS MODIS?"
    ),
    # 2. Fire Radiative Power (FRP)
    (
        [
            "frp என்றால் என்ன", "frp என்ன", "தீ கதிர்வீச்சு சக்தி என்றால் என்ன",
            "தீ கதிர்வீச்சு சக்தி", "தீ ஆற்றல்",
            "frp na enna", "frp enna", "thee kadirveechu sakthi",
            "frp क्या है", "frp kya hai", "fire radiative power kya hai", "अग्नि विकिरण शक्ति",
            "frp అంటే ఏమిటి", "frp ante enti", "frp emiti", "frp అంటే என்ன",
            "frp ಎಂದರೇನು", "frp enu",
            "frp എന്താണ്", "frp enthanu",
            "frp म्हणजे काय", "frp काय आहे",
            "frp શું છે", "frp shu che",
            "frp কী", "frp ki",
            "frp ਕੀ ਹੈ", "frp ki hai",
            "frp କଣ", "frp کیا ہے",
            "what is frp", "what is fire radiative power", "frp",
            "tamil frp", "telugu frp", "hindi frp",
        ],
        "What is Fire Radiative Power FRP thermal physics brightness temperature?"
    ),
    # 3. AI Model / Ensemble Architecture
    (
        [
            "satra என்ன ai மாதிரியைப் பயன்படுத்துகிறது", "என்ன ai மாதிரி", "ai மாதிரி",
            "satra enna ai model use pannuthu", "satra enna model use pannuthu", "ai model enna",
            "सैट्रा कौन सा एआई मॉडल उपयोग करता है", "satra kaun sa ai model use karta hai",
            "satra ka ai model kya hai", "konsa model use karta hai",
            "satra ఏ ai మోడల్ ఉపయోగిస్తుంది", "satra ela classify chestundi",
            "satra ಯಾವ ai ಮಾದರಿಯನ್ನು ಬಳಸುತ್ತದೆ",
            "satra ഏത് ai മോഡലാണ് ഉപയോഗിക്കുന്നത്",
            "satra कोणते ai मॉडेल वापरते",
            "satra કયો ai મોડેલ વાપરે છે",
            "satra কোন ai মডেল ব্যবহার করে",
            "satra ਕਿਹੜਾ ai ਮਾਡਲ ਵਰਤਦਾ ਹੈ",
            "satra କେଉଁ ai ମଡେଲ ବ୍ୟବହାର କରେ",
            "satra epdi fires classify pannuthu", "satra aag ko kaise vargikrit karta hai",
            "satra mantalanu ela vargikaristundi",
        ],
        "What AI machine learning model does SATRA use soft-voting ensemble Random Forest LightGBM XGBoost?"
    ),
    # 4. Four Classification Classes
    (
        [
            "நான்கு வகைப்பாடுகள் என்ன", "4 வகைப்பாடுகள் என்ன", "வகைப்பாடு என்ன",
            "naalu classification classes enna", "4 classification classes enna",
            "classification classes enna", "naalu classes enna",
            "चार वर्गीकरण श्रेणियां क्या हैं", "4 वर्गीकरण श्रेणियां",
            "chaar classification classes kya hain", "4 classes kya hain",
            "నాలుగు వర్గీకరణలు ఏమిటి", "4 వర్గీకరణలు ఏమిటి",
            "ನಾಲ್ಕು ವರ್ಗೀಕರಣಗಳು ಯಾವುವು",
            "നാല് വർഗ്ഗീകരണങ്ങൾ ഏവ",
            "चार वर्गीकरण वर्ग कोणते आहेत",
            "ચાર વર્ગીકરણ શ્રેણીઓ કઈ છે",
            "চারটি শ্রেণিবিভাগ কী কী",
            "ਚਾਰ ਵਰਗੀਕਰਨ ਸ਼੍ਰੇਣੀਆਂ ਕੀ ਹਨ",
            "ଚାରୋଟି ବର୍ଗୀକରଣ କଣ",
        ],
        "What are the four classification classes 0 Industrial Fire 1 Forest Fire 2 Persistent Thermal Source 3 Other taxonomy?"
    ),
    # 5. Exact Location Identification & GIS
    (
        [
            "satra ஒரு கண்டறிதலின் சரியான இடத்தை எவ்வாறு அடையாளம் காண்கிறது",
            "சரியான இடத்தை எவ்வாறு அடையாளம் காண்கிறது", "இடம் எப்படி அடையாளம்",
            "satra epdi exact location kandupidikkuthu", "satra epdi location identify pannuthu",
            "exact location epdi identify pannuthu", "location epdi kandupidikkuthu",
            "सैट्रा किसी पहचान के सटीक स्थान की पहचान कैसे करता है", "सटीक स्थान की पहचान कैसे करता है",
            "satra exact location kaise identify karta hai", "location kaise identify karta hai",
            "satra ఖచ్చితమైన స్థానాన్ని ఎలా గుర్తిస్తుంది",
            "satra ನಿಖರವಾದ ಸ್ಥಳವನ್ನು ಹೇಗೆ ಗುರುತಿಸುತ್ತದೆ",
            "satra കൃത്യമായ സ്ഥാനം എങ്ങനെ തിരിച്ചറിയുന്നു",
        ],
        "How does SATRA identify the exact location of a detection coordinates latitude longitude GIS buffer?"
    ),
    # 6. RAG (Retrieval-Augmented Generation)
    (
        [
            "rag என்றால் என்ன", "rag என்ன", "rag பற்றி சொல்லுங்கள்",
            "rag na enna", "rag enna", "rag pathi sollu",
            "rag क्या है", "rag kya hai", "rag ke baare mein batao",
            "rag అంటే ఏమిటి", "rag ante enti", "rag అంటే என்ன",
            "rag ಎಂದರೇನು",
            "rag എന്താണ്",
            "rag म्हणजे काय",
            "rag શું છે",
            "rag কী",
            "rag ਕੀ ਹੈ",
            "rag କଣ",
            "rag کیا ہے",
            "what is rag", "what is rag architecture", "rag architecture", "rag",
            "telugu rag", "tamil rag", "hindi rag",
        ],
        "What is RAG Retrieval-Augmented Generation architecture vector search FAISS?"
    ),
    # 7. Today's fire detections
    (
        [
            "இன்றைய தீ கண்டறிதல்களைக் காட்டு", "இன்றைய தீ", "இன்று எத்தனை தீ",
            "innaiku fire detections kaatu", "innaiku ethana fire", "today fires enna",
            "आज के आग के मामलों को दिखाओ", "आज कितनी आग लगी", "aaj kitne fire hue",
            "ఈరోజు మంటలను చూపించు", "ఈరోజు ఎన్ని మంటలు",
            "ಇಂದಿನ ಬೆಂಕಿಯನ್ನು ತೋರಿಸಿ",
            "ഇന്നത്തെ തീപിടുത്തങ്ങൾ കാണിക്കുക",
            "आजच्या आगी दाखवा",
            "આજની આગ બતાવો",
            "আজকের আগুন দেখাও",
            "ਅੱਜ ਦੀਆਂ ਅੱਗਾਂ ਦਿਖਾਓ",
        ],
        "Show today's fire detections how many fires detected today"
    ),
    # 8. Recent Alerts
    (
        [
            "சமீபத்திய விழிப்பூட்டல்கள்", "விழிப்பூட்டல்களைக் காட்டு",
            "recent alerts kaatu", "alerts kaatu", "recent alerts enna",
            "हालिया अलर्ट दिखाएं", "अलर्ट दिखाओ", "recent alerts kya hain",
            "ఇటీవలి హెచ్చరికలు", "హెచ్చరికలను చూపించు",
            "ಇತ್ತೀಚಿನ ಎಚ್ಚರಿಕೆಗಳು",
            "സമീപകാല മുന്നറിയിപ്പുകൾ",
            "अलीकडील अलर्ट दाखवा",
            "તાજેતરની ચેતવણીઓ",
            "সাম্প্রতিক সতর্কতা",
            "ਹਾਲੀਆ ਚਿਤਾਵਨੀਆਂ",
        ],
        "Show recent fire alerts unresolved critical high alerts"
    ),
    # 9. Persistent Thermal Source
    (
        [
            "தொடர்ச்சியான வெப்ப ஆதாரம் என்றால் என்ன", "தொடர்ச்சியான வெப்பம்",
            "persistent thermal source na enna", "persistent source na enna",
            "लगातार थर्मल स्रोत क्या है", "persistent thermal source kya hai",
            "నిరంతర థర్మల్ మూలం అంటే ఏమిటి",
            "ಸ್ಥಿರ ಉಷ್ಣ ಮೂಲ ಎಂದರೇನು",
            "സ്ഥിരമായ താപ സ്രോതസ്സ് എന്താണ്",
            "सतत थर्मल स्त्रोत म्हणजे काय",
            "સતત થર્મલ સ્ત્રોત શું છે",
            "ধারাবাহিক তাপীয় উৎস কী",
            "ਲਗਾਤਾਰ ਥਰਮਲ ਸਰੋਤ ਕੀ ਹੈ",
        ],
        "What is a persistent thermal source flare stack refinery recurrence?"
    ),
]



def normalize_multilingual_query(query: str) -> str:
    """
    Normalizes a multilingual user query (Tamil, Tanglish, Hindi) into canonical
    English domain search terms for vector embeddings and intent routing.
    """
    if not query or not query.strip():
        return ""

    q_lower = query.strip().lower()

    # Exact or substring match in multilingual map
    for triggers, english_equiv in MULTILINGUAL_QUERY_MAP:
        for t in triggers:
            if t in q_lower:
                return english_equiv

    # Vocabulary substitution for individual domain words
    word_subs = {
        # Tamil
        "தீ": "fire",
        "வெப்பம்": "thermal",
        "செயற்கைக்கோள்": "satellite",
        "விழிப்பூட்டல்": "alert",
        "மாதிரி": "model",
        "என்றால் என்ன": "what is",
        "எப்படி": "how",
        "இடம்": "location",
        "வகைப்பாடு": "classification",
        "எத்தனை": "how many",
        "இன்று": "today",
        "நேற்று": "yesterday",
        # Tanglish
        "thee": "fire",
        "veppam": "thermal",
        "satellite-la": "in satellite",
        "epdi": "how",
        "enna": "what",
        "kaatunga": "show",
        "kaatu": "show",
        "ethana": "how many",
        "innaiku": "today",
        "nerethu": "yesterday",
        # Hindi
        "आग": "fire",
        "थर्मल": "thermal",
        "उपग्रह": "satellite",
        "अलर्ट": "alert",
        "मॉडल": "model",
        "क्या है": "what is",
        "कैसे": "how",
        "स्थान": "location",
        "वर्गीकरण": "classification",
        "कितने": "how many",
        "आज": "today",
        "कल": "yesterday",
        # Telugu
        "మంటలు": "fire",
        "ఉపగ్రహం": "satellite",
        "అంటే ఏమిటి": "what is",
        "ఎలా": "how",
        "ఎన్ని": "how many",
        "ఈరోజు": "today",
        "హెచ్చరిక": "alert",
        "మోడల్": "model",
        "వర్గీకరణ": "classification",
        # Kannada
        "ಬೆಂಕಿ": "fire",
        "ಉಪಗ್ರಹ": "satellite",
        "ಎಂದರೇನು": "what is",
        "ಹೇಗೆ": "how",
        "ಎಷ್ಟು": "how many",
        "ಇಂದು": "today",
        "ಎಚ್ಚರಿಕೆ": "alert",
        "ಮಾದರಿ": "model",
        # Malayalam
        "തീ": "fire",
        "ഉപഗ്രഹം": "satellite",
        "എന്താണ്": "what is",
        "എങ്ങനെ": "how",
        "എത്ര": "how many",
        "ഇന്ന്": "today",
        "മുന്നറിയിപ്പ്": "alert",
        # Marathi
        "म्हणजे काय": "what is",
        "कसे": "how",
        "किती": "how many",
        # Gujarati
        "શું છે": "what is",
        "કેવી રીતે": "how",
        "કેટલા": "how many",
        "આજે": "today",
        # Bengali
        "কী": "what is",
        "আগুন": "fire",
        "কীভাবে": "how",
        "কত": "how many",
        # Punjabi
        "ਕੀ ਹੈ": "what is",
        "ਅੱਗ": "fire",
        "ਕਿਵੇਂ": "how",
        "ਕਿੰਨੇ": "how many",
        # Odia
        "କଣ": "what is",
        "ନିଆଁ": "fire",
        "କିପରି": "how",
        # Urdu
        "کیا ہے": "what is",
        "آگ": "fire",
        "کیسے": "how",
    }

    normalized = q_lower
    for src, tgt in word_subs.items():
        normalized = normalized.replace(src, tgt)

    return normalized.strip() or query


# ==============================================================================
# Domain-Specific Localized Response Synthesis
# ==============================================================================

# Language labels for prefix and citations
LANG_LABELS = {
    "ta": ("SATRA AI உதவியாளர் (தமிழ்)", "வணக்கம்! நான் SATRA AI Assistant — உங்கள் Satellite Intelligence Copilot."),
    "tanglish": ("SATRA AI Assistant (Tanglish)", "Vanakkam! Naan SATRA AI Assistant — ungaloda Satellite Intelligence Copilot."),
    "hi": ("SATRA AI सहायक (हिन्दी)", "नमस्ते! मैं SATRA AI Assistant — आपका Satellite Intelligence Copilot हूँ।"),
    "te": ("SATRA AI సహాయకుడు (తెలుగు)", "నమస్కారం! నేను SATRA AI Assistant — మీ Satellite Intelligence Copilot."),
    "kn": ("SATRA AI ಸಹಾಯಕ (ಕನ್ನಡ)", "ನಮಸ್ಕಾರ! ನಾನು SATRA AI Assistant — ನಿಮ್ಮ Satellite Intelligence Copilot."),
    "ml": ("SATRA AI അസിസ്റ്റന്റ് (മലയാളം)", "നമസ്കാരം! ഞാൻ SATRA AI Assistant — നിങ്ങളുടെ Satellite Intelligence Copilot."),
    "mr": ("SATRA AI सहाय्यक (मराठी)", "नमस्कार! मी SATRA AI Assistant — आपला Satellite Intelligence Copilot आहे."),
    "gu": ("SATRA AI સહાયક (ગુજરાતી)", "નમસ્તે! હું SATRA AI Assistant — આપનો Satellite Intelligence Copilot છું."),
    "bn": ("SATRA AI সহকারী (বাংলা)", "নমস্কার! আমি SATRA AI Assistant — আপনার Satellite Intelligence Copilot।"),
    "pa": ("SATRA AI ਸਹਾਇਕ (ਪੰਜਾਬੀ)", "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ SATRA AI Assistant — ਤੁਹਾਡਾ Satellite Intelligence Copilot ਹਾਂ।"),
    "or": ("SATRA AI ସହାୟକ (ଓଡ଼ିଆ)", "ନମସ୍କାର! ମୁଁ SATRA AI Assistant — ଆପଣଙ୍କ Satellite Intelligence Copilot."),
    "as": ("SATRA AI সহায়ক (অসমীয়া)", "নমস্কাৰ! মই SATRA AI Assistant — আপোনাৰ Satellite Intelligence Copilot।"),
    "ur": ("SATRA AI اسسٹنٹ (اردو)", "السلام علیکم! میں SATRA AI Assistant ہوں — آپ کا Satellite Intelligence Copilot۔"),
    "raj": ("SATRA AI सहायक (राजस्थानी)", "खम्मा घणी! म्हैं SATRA AI Assistant — आपरो Satellite Intelligence Copilot हूँ।"),
}

SCOPE_MESSAGES = {
    "ta": (
        "நான் SATRA AI உதவியாளர். நான் தொழில்துறை தீ கண்டறிதல், வெப்ப முரண்பாடுகள், "
        "செயற்கைக்கோள் தரவு, தீ வகைப்பாடு, விழிப்பூட்டல்கள், GIS பகுப்பாய்வு மற்றும் "
        "SATRA அமைப்பு தகவல்களில் மட்டுமே பதிலளிக்க பிரத்யேகமாக வடிவமைக்கப்பட்டுள்ளேன்."
    ),
    "tanglish": (
        "Naan SATRA AI Assistant. Naan industrial fire detection, thermal anomalies, "
        "satellite data, fire classification, alerts, GIS analysis, matrum "
        "SATRA system information-la mattumae answer panna train aagirukken."
    ),
    "hi": (
        "मैं SATRA AI सहायक हूँ। मैं विशेष रूप से औद्योगिक आग का पता लगाने, थर्मल विसंगतियों, "
        "उपग्रह डेटा, अग्नि वर्गीकरण, अलर्ट, जीआईएस विश्लेषण और SATRA सिस्टम की जानकारी के लिए प्रशिक्षित हूँ।"
    ),
    "te": (
        "నేను SATRA AI అసిస్టెంట్‌ని. నేను పారిశ్రామిక అగ్ని గుర్తింపు, థర్మల్ క్రమరాహిత్యాలు, "
        "శాటిలైట్ డేటా, అగ్ని వర్గీకరణ, హెచ్చరికలు, GIS విశ్లేషణ మరియు SATRA సిస్టమ్ సమాచారంలో ప్రత్యేకత కలిగి ఉన్నాను."
    ),
    "kn": (
        "ನಾನು SATRA AI ಸಹಾಯಕ. ನಾನು ಕೈಗಾರಿಕಾ ಬೆಂಕಿ ಪತ್ತೆ, ಉಷ್ಣ ವೈಪರೀತ್ಯಗಳು, "
        "ಉಪಗ್ರಹ ಡೇಟಾ, ಬೆಂಕಿ ವರ್ಗೀಕರಣ, ಎಚ್ಚರಿಕೆಗಳು, GIS ವಿಶ್ಲೇಷಣೆ ಮತ್ತು SATRA ಸಿಸ್ಟಮ್ ಮಾಹಿತಿಯಲ್ಲಿ ಪರಿಣತಿ ಹೊಂದಿದ್ದೇನೆ."
    ),
    "ml": (
        "ഞാൻ SATRA AI അസിസ്റ്റന്റാണ്. വ്യവസായ തീപിടുത്തങ്ങൾ കണ്ടെത്തൽ, താപ വ്യതിയാനങ്ങൾ, "
        "ഉപഗ്രഹ ഡാറ്റ, തീപിടുത്ത വർഗ്ഗീകരണം, അലേർട്ടുകൾ, GIS വിശകലനം, SATRA സിസ്റ്റം വിവരങ്ങൾ എന്നിവയിൽ ഞാൻ പ്രത്യേകം പരിശീലനം നേടിയിട്ടുണ്ട്."
    ),
    "mr": (
        "मी SATRA AI सहाय्यक आहे. मी औद्योगिक आग ओळखणे, थर्मल विसंगती, उपग्रह डेटा, "
        "आग वर्गीकरण, अलर्ट, GIS विश्लेषण आणि SATRA प्रणाली माहितीमध्ये विशेष प्रशिक्षित आहे."
    ),
    "gu": (
        "હું SATRA AI સહાયક છું. હું ઔદ્યોગિક આગ શોધ, થર્મલ વિસંગતતાઓ, સેટેલાઇટ ડેટા, "
        "આગ વર્ગીકરણ, ચેતવણીઓ, GIS વિશ્લેષણ અને SATRA સિસ્ટમ માહિતીમાં વિશિષ્ટ છું."
    ),
    "bn": (
        "আমি SATRA AI সহকারী। আমি শিল্প এলাকার আগুন সনাক্তকরণ, তাপীয় অসঙ্গতি, "
        "উপগ্রহ তথ্য, আগুন শ্রেণিবিন্যাস, সতর্কতা, GIS বিশ্লেষণ এবং SATRA সিস্টেম তথ্যে বিশেষজ্ঞ।"
    ),
    "pa": (
        "ਮੈਂ SATRA AI ਸਹਾਇਕ ਹਾਂ। ਮੈਂ ਉਦਯੋਗਿਕ ਅੱਗ ਦੀ ਪਛਾਣ, ਥਰਮਲ ਅਸੰਗਤੀਆਂ, ਉਪਗ੍ਰਹਿ ਡੇਟਾ, "
        "ਅੱਗ ਵਰਗੀਕਰਨ, ਚਿਤਾਵਨੀਆਂ, GIS ਵਿਸ਼ਲੇਸ਼ਣ ਅਤੇ SATRA ਸਿਸਟਮ ਜਾਣਕਾਰੀ ਵਿੱਚ ਵਿਸ਼ੇਸ਼ ਹਾਂ।"
    ),
    "or": (
        "ମୁଁ SATRA AI ସହାୟକ। ମୁଁ ଶିଳ୍ପ ଅଗ୍ନିକାଣ୍ଡ ଚିହ୍ନଟ, ଥର୍ମାଲ ବିସଙ୍ଗତି, ଉପଗ୍ରହ ଡାଟା, "
        "ଅଗ୍ନି ବର୍ଗୀକରଣ, ଆଲର୍ଟ, GIS ବିଶ୍ଳେଷଣ ଏବଂ SATRA ସିଷ୍ଟମ ସୂଚନାରେ ବିଶେଷଜ୍ଞ।"
    ),
    "as": (
        "মই SATRA AI সহায়ক। মই বিশেষভাৱে উদ্যোগিক জুই চিনাক্তকৰণ, তাপীয় অসঙ্গতি, "
        "উপগ্ৰহ তথ্য, জুই শ্ৰেণীবিভাজন, সতৰ্কবাৰ্তা, GIS বিশ্লেষণ আৰু SATRA ব্যৱস্থাৰ তথ্যৰ বাবে প্ৰশিক্ষিত।"
    ),
    "ur": (
        "میں SATRA AI اسسٹنٹ ہوں۔ میں صنعتی آگ کا پتہ لگانے، تھرمل بے ضابطگیوں، "
        "سیٹلائٹ ڈیٹا، آگ کی درجہ بندی، الرٹس، GIS تجزیہ اور SATRA سسٹم کی معلومات میں مہارت رکھتا ہوں۔"
    ),
}

GREETING_RESPONSES = {
    "as": (
        "নমস্কাৰ! 👋\n\nমই **SATRA AI Assistant** — আপোনাৰ Satellite Intelligence Copilot।\n\n"
        "মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ?\n\n"
        "### মই সহায় কৰিব পৰা বিষয়সমূহ:\n"
        "- **প্ৰত্যক্ষ তথ্য আৰু সতৰ্কবাৰ্তা**: \"*আজিৰ জুই চিনাক্তকৰণ দেখুৱাওক*\", \"*শেহতীয়া সতৰ্কবাৰ্তা*\"\n"
        "- **হটস্পট বিশ্লেষণ**: \"*এই চিনাক্তকৰণ কিয় উদ্যোগিক জুই হিচাপে শ্ৰেণীবদ্ধ কৰা হৈছে?*\"\n"
        "- **NASA FIRMS তথ্য**: \"*NASA FIRMS কি?*\", \"*FRP কি?*\"\n"
        "- **মেচিন লাৰ্নিং**: \"*SATRA কি AI মডেল ব্যৱহাৰ কৰে?*\""
    ),
    "ta": (
        "வணக்கம்! 👋\n\nநான் **SATRA AI Assistant** — உங்கள் Satellite Intelligence Copilot.\n\n"
        "நான் உங்களுக்கு எப்படி உதவலாம்?\n\n"
        "### நான் உதவக்கூடிய பகுதிகள்:\n"
        "- **நேரடி அவதானிப்புகள் & விழிப்பூட்டல்கள்**: \"*இன்றைய தீ கண்டறிதல்களைக் காட்டு*\", \"*சமீபத்திய விழிப்பூட்டல்கள்*\"\n"
        "- **குறிப்பிட்ட ஹாட்ஸ்பாட் விளக்கம்**: \"*இந்த கண்டறிதல் ஏன் தொழில்துறை தீ என வகைப்படுத்தப்பட்டது?*\"\n"
        "- **NASA FIRMS தரவுகள்**: \"*NASA FIRMS என்றால் என்ன?*\", \"*VIIRS vs MODIS வேறுபாடு என்ன?*\", \"*FRP என்றால் என்ன?*\"\n"
        "- **மெஷின் லேர்னிங்**: \"*SATRA என்ன AI மாதிரியைப் பயன்படுத்துகிறது?*\", \"*நான்கு வகைப்பாடுகள் என்ன?*\"\n"
        "- **GIS & இருப்பிடம்**: \"*SATRA ஒரு கண்டறிதலின் சரியான இடத்தை எவ்வாறு அடையாளம் காண்கிறது?*\""
    ),
    "tanglish": (
        "Vanakkam! 👋\n\nNaan **SATRA AI Assistant** — ungaloda Satellite Intelligence Copilot.\n\n"
        "Naan ungalukku epdi help panna mudiyum?\n\n"
        "### Ennala ungalukku ithilam assist panna mudiyum:\n"
        "- **Live Telemetry & Data**: \"*Innaiku ethana fire detect aachu?*\", \"*Recent fire alerts kaatu*\"\n"
        "- **Hotspot Explanations**: \"*Intha detection-ah yen industrial fire-nu classify pannuchu?*\"\n"
        "- **NASA FIRMS Telemetry**: \"*NASA FIRMS na enna?*\", \"*VIIRS vs MODIS difference enna?*\", \"*FRP na enna?*\"\n"
        "- **Machine Learning**: \"*SATRA enna AI model use pannuthu?*\", \"*Naalu classification classes enna?*\"\n"
        "- **GIS & Location**: \"*SATRA epdi exact location kandupidikkuthu?*\""
    ),
    "hi": (
        "नमस्ते! 👋\n\nमैं **SATRA AI Assistant** — आपका Satellite Intelligence Copilot हूँ।\n\n"
        "मैं आपकी कैसे सहायता कर सकता हूँ?\n\n"
        "### मैं निम्नलिखित में आपकी सहायता कर सकता हूँ:\n"
        "- **लाइव टेलीमेट्री और डेटा**: \"*आज के आग के मामलों को दिखाओ*\", \"*हालिया अलर्ट दिखाएं*\"\n"
        "- **विशिष्ट हॉटस्पॉट विश्लेषण**: \"*इस डिटेक्शन को औद्योगिक आग के रूप में क्यों वर्गीकृत किया गया?*\"\n"
        "- **NASA FIRMS टेलीमेट्री**: \"*NASA FIRMS क्या है?*\", \"*VIIRS और MODIS में क्या अंतर है?*\", \"*FRP क्या है?*\"\n"
        "- **मशीन लर्निंग मॉडल**: \"*सैट्रा कौन सा एआई मॉडल उपयोग करता है?*\", \"*चार वर्गीकरण श्रेणियां क्या हैं?*\"\n"
        "- **जीआईएस और स्थान**: \"*सैट्रा किसी पहचान के सटीक स्थान की पहचान कैसे करता है?*\""
    ),
    "te": (
        "నమస్కారం! 👋\n\nనేను **SATRA AI Assistant** — మీ Satellite Intelligence Copilot.\n\n"
        "నేను మీకు ఎలా సహాయం చేయగలను?\n\n"
        "### నేను మీకు సహాయపడే అంశాలు:\n"
        "- **లైవ్ టెలిమెట్రీ & హెచ్చరికలు**: \"*ఈరోజు గుర్తించిన మంటలను చూపించు*\", \"*ఇటీవలి హెచ్చరికలు*\"\n"
        "- **హాట్‌స్పాట్ వివరణ**: \"*ఈ డిటెక్షన్ ఎందుకు పారిశ్రామిక అగ్నిగా వర్గీకరించబడింది?*\"\n"
        "- **NASA FIRMS టెలిమెట్రీ**: \"*NASA FIRMS అంటే ఏమిటి?*\", \"*FRP అంటే ఏమిటి?*\"\n"
        "- **మెషిన్ లెర్నింగ్ మోడల్**: \"*SATRA ఏ AI మోడల్‌ను ఉపయోగిస్తుంది?*\", \"*నాలుగు వర్గీకరణలు ఏమిటి?*\""
    ),
    "kn": (
        "ನಮಸ್ಕಾರ! 👋\n\nನಾನು **SATRA AI Assistant** — ನಿಮ್ಮ Satellite Intelligence Copilot.\n\n"
        "ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?\n\n"
        "### ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಹುದಾದ ವಿಷಯಗಳು:\n"
        "- **ಲೈವ್ ಟೆಲಿಮೆಟ್ರಿ ಮತ್ತು ಎಚ್ಚರಿಕೆಗಳು**: \"*ಇಂದಿನ ಬೆಂಕಿ ಪತ್ತೆಗಳನ್ನು ತೋರಿಸಿ*\", \"*ಇತ್ತೀಚಿನ ಎಚ್ಚರಿಕೆಗಳು*\"\n"
        "- **ಹಾಟ್‌ಸ್ಪಾಟ್ ವಿವರಣೆ**: \"*ಈ ಪತ್ತೆಯನ್ನು ಕೈಗಾರಿಕಾ ಬೆಂಕಿ ಎಂದು ಏಕೆ ವರ್ಗೀಕರಿಸಲಾಗಿದೆ?*\"\n"
        "- **NASA FIRMS ಟೆಲಿಮೆಟ್ರಿ**: \"*NASA FIRMS ಎಂದರೇನು?*\", \"*FRP ಎಂದರೇನು?*\"\n"
        "- **ಮೆಷಿನ್ ಲರ್ನಿಂಗ್**: \"*SATRA ಯಾವ AI ಮಾದರಿಯನ್ನು ಬಳಸುತ್ತದೆ?*\""
    ),
    "ml": (
        "നമസ്കാരം! 👋\n\nഞാൻ **SATRA AI Assistant** — നിങ്ങളുടെ Satellite Intelligence Copilot.\n\n"
        "ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കും?\n\n"
        "### എനിക്ക് സഹായിക്കാൻ കഴിയുന്ന മേഖലകൾ:\n"
        "- **തത്സമയ ഡാറ്റയും അലേർട്ടുകളും**: \"*ഇന്നത്തെ തീപിടുത്തങ്ങൾ കാണിക്കുക*\", \"*സമീപകാല മുന്നറിയിപ്പുകൾ*\"\n"
        "- **ഹോട്ട്‌സ്‌പോട്ട് വിശകലനം**: \"*എന്തുകൊണ്ടാണ് ഇത് വ്യാവസായിക തീപിടുത്തമായി തരംതിരിച്ചത്?*\"\n"
        "- **NASA FIRMS വിവരങ്ങൾ**: \"*NASA FIRMS എന്താണ്?*\", \"*FRP എന്താണ്?*\"\n"
        "- **മെഷീൻ ലേണിംഗ്**: \"*SATRA ഏത് AI മോഡലാണ് ഉപയോഗിക്കുന്നത്?*\""
    ),
    "mr": (
        "नमस्कार! 👋\n\nमी **SATRA AI Assistant** — आपला Satellite Intelligence Copilot आहे.\n\n"
        "मी आपली काय मदत करू शकतो?\n\n"
        "### मी खालील विषयांमध्ये मदत करू शकतो:\n"
        "- **थेट टेलीमेट्री आणि अलर्ट**: \"*आजच्या आगी दाखवा*\", \"*अलीकडील अलर्ट दाखवा*\"\n"
        "- **हॉटस्पॉट विश्लेषण**: \"*या डिटेक्शनला औद्योगिक आग म्हणून का वर्गीकृत केले?*\"\n"
        "- **NASA FIRMS माहिती**: \"*NASA FIRMS म्हणजे काय?*\", \"*FRP म्हणजे काय?*\"\n"
        "- **मशीन लर्निंग**: \"*SATRA कोणते AI मॉडेल वापरते?*\""
    ),
    "gu": (
        "નમસ્તે! 👋\n\nહું **SATRA AI Assistant** — આપનો Satellite Intelligence Copilot છું.\n\n"
        "હું આપને કેવી રીતે મદદ કરી શકું?\n\n"
        "### હું નીચેના વિષયોમાં મદદ કરી શકું છું:\n"
        "- **લાઈવ ટેલિમેટ્રી અને ચેતવણીઓ**: \"*આજની આગ બતાવો*\", \"*તાજેતરની ચેતવણીઓ*\"\n"
        "- **હોટસ્પોટ વિશ્લેષણ**: \"*આ ડિટેક્શનને ઔદ્યોગિક આગ તરીકે કેમ વર્ગીકૃત કરવામાં આવી?*\"\n"
        "- **NASA FIRMS માહિતી**: \"*NASA FIRMS શું છે?*\", \"*FRP શું છે?*\""
    ),
    "bn": (
        "নমস্কার! 👋\n\nআমি **SATRA AI Assistant** — আপনার Satellite Intelligence Copilot।\n\n"
        "আমি আপনাকে কীভাবে সাহায্য করতে পারি?\n\n"
        "### আমি যে ক্ষেত্রগুলিতে সাহায্য করতে পারি:\n"
        "- **লাইভ টেলিমেট্রি এবং সতর্কতা**: \"*আজকের আগুন সনাক্তকরণ দেখাও*\", \"*সাম্প্রতিক সতর্কতা*\"\n"
        "- **হটস্পট বিশ্লেষণ**: \"*কেন এই সনাক্তকরণটিকে শিল্প আগুন হিসেবে শ্রেণীবদ্ধ করা হলো?*\"\n"
        "- **NASA FIRMS তথ্য**: \"*NASA FIRMS কী?*\", \"*FRP কী?*\""
    ),
    "pa": (
        "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! 👋\n\nਮੈਂ **SATRA AI Assistant** — ਤੁਹਾਡਾ Satellite Intelligence Copilot ਹਾਂ।\n\n"
        "ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?\n\n"
        "### ਮੈਂ ਹੇਠ ਲਿਖੇ ਵਿਸ਼ਿਆਂ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ:\n"
        "- **ਲਾਈਵ ਟੈਲੀਮੈਟਰੀ ਅਤੇ ਚਿਤਾਵਨੀਆਂ**: \"*ਅੱਜ ਦੀਆਂ ਅੱਗਾਂ ਦਿਖਾਓ*\", \"*ਹਾਲੀਆ ਚਿਤਾਵਨੀਆਂ*\"\n"
        "- **ਹੌਟਸਪੌਟ ਵਿਸ਼ਲੇਸ਼ਣ**: \"*ਇਸ ਖੋਜ ਨੂੰ ਉਦਯੋਗਿਕ ਅੱਗ ਵਜੋਂ ਕਿਉਂ ਸ਼੍ਰੇਣੀਬੱਧ ਕੀਤਾ ਗਿਆ?*\"\n"
        "- **NASA FIRMS ਜਾਣਕਾਰੀ**: \"*NASA FIRMS ਕੀ ਹੈ?*\", \"*FRP ਕੀ ਹੈ?*\""
    ),
    "ur": (
        "السلام علیکم! 👋\n\nمیں **SATRA AI Assistant** ہوں — آپ کا Satellite Intelligence Copilot۔\n\n"
        "میں آپ کی کس طرح مدد کر سکتا ہوں؟\n\n"
        "### میں درج ذیل میں آپ کی مدد کر سکتا ہوں:\n"
        "- **لائیو ٹیلی میٹری اور الرٹس**: \"*آج کی آگ کی نشاندہی دکھائیں*\", \"*حالیہ الرٹس*\"\n"
        "- **ہاٹ سپاٹ تجزیہ**: \"*اس کھوج کو صنعتی آگ کے طور پر کیوں درجہ بند کیا گیا؟*\"\n"
        "- **NASA FIRMS معلومات**: \"*NASA FIRMS کیا ہے؟*\", \"*FRP کیا ہے؟*\""
    ),
}


def localize_response(english_response: str, target_lang: str, original_query: str = "") -> str:
    """
    Localizes a grounded English response into the requested language.
    Preserves all technical keywords (NASA FIRMS, VIIRS, MODIS, FRP, RAG, GIS, Random Forest, LightGBM, XGBoost, etc.)
    """
    if target_lang == "en" or not target_lang or target_lang == "neutral":
        return english_response

    # Scope / Unrelated response
    if "specialized in industrial fire detection" in english_response.lower():
        if target_lang in SCOPE_MESSAGES:
            return SCOPE_MESSAGES[target_lang]

    # Greeting response
    if "hello! i am the **satra domain ai assistant**" in english_response.lower() or "how would you like to interact with me" in english_response.lower():
        if target_lang in GREETING_RESPONSES:
            return GREETING_RESPONSES[target_lang]

    q_norm = normalize_multilingual_query(original_query).lower()
    q_raw_lower = original_query.lower()

    # Topic 1: NASA FIRMS
    if "nasa firms" in q_norm or "firms" in q_norm or "nasa firms" in q_raw_lower or "firms" in q_raw_lower:
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (NASA FIRMS கண்ணோட்டம்):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** என்பது செயற்கைக்கோள் "
                "தரவுகள் மூலம் உலகளாவிய தீவிர தீ மற்றும் வெப்ப முரண்பாடுகளை (thermal anomalies) கண்டறிந்து, "
                "செயற்கைக்கோள் கடந்து சென்ற 3 மணி நேரத்திற்குள் Near Real-Time (NRT) தரவுகளை வழங்கும் அமைப்பாகும்.\n\n"
                "### SATRA-வில் பயன்படுத்தப்படும் சென்சார்கள்:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** (S-NPP, NOAA-20, NOAA-21 செயற்கைக்கோள்களில்):\n"
                "  - **Spatial Resolution**: 375m பிக்சல் தெளிவுத்திறன். தொழிற்சாலை எரிப்பு புள்ளிகள், Flare Stacks மற்றும் ஆரம்ப கட்ட தீ விபத்துகளை துல்லியமாகக் கண்டறியும்.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** (Terra மற்றும் Aqua செயற்கைக்கோள்களில்):\n"
                "  - **Spatial Resolution**: 1 km தெளிவுத்திறன். 20 ஆண்டுகளுக்கும் மேலான தொடர்ச்சியான தரவுத்தளம் மூலம் நீண்ட கால Persistent Thermal Sources-ஐ கண்காணிக்க உதவுகிறது.\n\n"
                "### பகல் மற்றும் இரவு நேர அவதானிப்புகள்:\n"
                "இரவு நேர கண்காணிப்பில் (Night Passes) சூரிய ஒளி பிரதிபலிப்பு இல்லாததால், தொழிற்சாலை உலைகள் மற்றும் Flare Stacks அதிக துல்லியத்துடன் அடையாளம் காணப்படுகின்றன."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (NASA FIRMS Overview):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** enbathu satellite moolama "
                "active fire matrum thermal anomalies-ah Near Real-Time (NRT)-la satellite pass aana 3 hours-kulla "
                "telemetry data-va provide pandra system.\n\n"
                "### SATRA-la use pandra Sensors:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** (S-NPP, NOAA-20, NOAA-21 satellites-la):\n"
                "  - **Spatial Resolution**: 375m per pixel. Small industrial flare stacks matrum factories-la varra sudden fires-ah sub-pixel sensitivity-la capture pannum.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** (Terra matrum Aqua satellites-la):\n"
                "  - **Spatial Resolution**: 1 km nominal channels. 20+ years baseline historical data vachu persistent thermal sources-ah track panna use aaguthu.\n\n"
                "### Day vs Night Passes:\n"
                "Night-time passes-la solar background reflection illathathaala flare stacks matrum blast furnaces signal-to-noise ratio romba clean-ah irukkum."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (NASA FIRMS अवलोकन):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** उपग्रहों के माध्यम से सक्रिय आग "
                "और थर्मल विसंगतियों (thermal anomalies) की निगरानी करता है तथा सैटेलाइट ओवरपास के 3 घंटे के भीतर "
                "Near Real-Time (NRT) डेटा वितरित करता है।\n\n"
                "### SATRA में उपयोग किए जाने वाले उपग्रह सेंसर:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** (S-NPP, NOAA-20, NOAA-21 पर):\n"
                "  - **Spatial Resolution**: 375 मीटर प्रति पिक्सेल। यह उच्च रिज़ॉल्यूशन औद्योगिक दहन बिंदुओं, गैस फ्लेयर्स और फैक्ट्री आग को तुरंत पकड़ता है।\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** (Terra और Aqua पर):\n"
                "  - **Spatial Resolution**: 1 किमी पिक्सेल। 20 से अधिक वर्षों का ऐतिहासिक रिकॉर्ड Persistent Thermal Sources को ट्रैक करने में मदद करता है।\n\n"
                "### दिन बनाम रात के अवलोकन:\n"
                "रात के समय सौर विकिरण न होने के कारण औद्योगिक भट्टियों और फ्लेयर स्टैक की पहचान अधिक स्पष्टता से होती है।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (NASA FIRMS అవలోకనం):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ఉపగ్రహాల ద్వారా చురుకైన అగ్ని మరియు "
                "థర్మల్ క్రమరాహిత్యాలను (thermal anomalies) పర్యవేక్షిస్తుంది మరియు ఉపగ్రహం దాటిన 3 గంటలలోపు Near Real-Time (NRT) డేటాను అందిస్తుంది.\n\n"
                "### SATRA లో ఉపయోగించే సెన్సార్లు:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** (S-NPP, NOAA-20, NOAA-21 పై):\n"
                "  - **Spatial Resolution**: 375 మీటర్ల పిక్సెల్ రిజల్యూషన్. చిన్న పారిశ్రామిక ఫ్లేర్ స్టాక్స్ మరియు ఫ్యాక్టరీ మంటలను గుర్తిస్తుంది.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** (Terra మరియు Aqua పై):\n"
                "  - **Spatial Resolution**: 1 కి.మీ నామినల్ ఛానెల్‌లు. 20 సంవత్సరాలకు పైగా చారిత్రక డేటా ఆధారంగా దీర్ఘకాలిక Persistent Thermal Sources ను ట్రాక్ చేస్తుంది.\n\n"
                "### పగలు మరియు రాత్రి పరిశీలనలు:\n"
                "రాత్రి సమయ పరిశీలనలలో (Night Passes) సౌర పరావర్తనం లేకపోవడం వల్ల ఫ్లేర్ స్టాక్‌లు మరియు బ్లాస్ట్ ఫర్నేస్‌లను మరింత స్పష్టంగా గుర్తించవచ్చు."
            )
        elif target_lang == "kn":
            return (
                "**SATRA ಜ್ಞಾನ ತಳಹದಿಯಿಂದ (NASA FIRMS ವಿವರಣೆ):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ಉಪಗ್ರಹಗಳ ಮೂಲಕ ಸಕ್ರಿಯ ಬೆಂಕಿ ಮತ್ತು "
                "ಉಷ್ಣ ವೈಪರೀತ್ಯಗಳನ್ನು (thermal anomalies) ಪತ್ತೆಹಚ್ಚುತ್ತದೆ ಮತ್ತು 3 ಗಂಟೆಗಳ ಒಳಗೆ Near Real-Time (NRT) ಡೇಟಾವನ್ನು ಒದಗಿಸುತ್ತದೆ.\n\n"
                "### SATRA ನಲ್ಲಿ ಬಳಸಲಾಗುವ ಸೆನ್ಸರ್‌ಗಳು:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** (S-NPP, NOAA-20, NOAA-21 ಉಪಗ್ರಹಗಳಲ್ಲಿ): 375m ರೆಸಲ್ಯೂಶನ್.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** (Terra ಮತ್ತು Aqua ಉಪಗ್ರಹಗಳಲ್ಲಿ): 1 km ರೆಸಲ್ಯೂಶನ್, 20+ ವರ್ಷಗಳ ಐತಿಹಾಸಿಕ ದಾಖಲೆ."
            )
        elif target_lang == "ml":
            return (
                "**SATRA നോളജ് ബേസിൽ നിന്ന് (NASA FIRMS അവലോകനം):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ഉപഗ്രഹങ്ങൾ വഴി സജീവമായ തീപിടുത്തങ്ങളും "
                "താപ വ്യതിയാനങ്ങളും (thermal anomalies) നിരീക്ഷിച്ച് 3 മണിക്കൂറിനുള്ളിൽ Near Real-Time (NRT) ഡാറ്റ നൽകുന്നു.\n\n"
                "### SATRA ഉപയോഗിക്കുന്ന സെൻസറുകൾ:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)**: 375 മീറ്റർ സ്പേഷ്യൽ റെസല്യൂഷൻ.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)**: 1 കി.മീ റെസല്യൂഷൻ, 20 വർഷത്തെ ഹിസ്റ്റോറിക്കൽ ഡാറ്റ."
            )
        elif target_lang == "mr":
            return (
                "**SATRA नॉलेज बेसमधून (NASA FIRMS विहंगावलोकन):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** उपग्रहांद्वारे सक्रिय आग आणि "
                "थर्मल विसंगतींचे (thermal anomalies) निरीक्षण करते आणि उपग्रह ओव्हरपासच्या 3 तासांच्या आत Near Real-Time (NRT) डेटा प्रदान करते.\n\n"
                "### SATRA मधील सेन्सर्स:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)**: 375m पिक्सेल रिझोल्यूशन (S-NPP, NOAA-20, NOAA-21).\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)**: 1 km पिक्सेल, 20+ वर्षांचा ऐतिहासिक डेटा."
            )
        elif target_lang == "gu":
            return (
                "**SATRA નોલેજ બેઝમાંથી (NASA FIRMS વિહંગાવલોકન):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ઉપગ્રહો દ્વારા સક્રિય આગ અને "
                "થર્મલ વિસંગતતાઓનું (thermal anomalies) નિરીક્ષણ કરે છે અને સેટેલાઇટ પાસ થયાના 3 કલાકની અંદર Near Real-Time (NRT) ડેટા પૂરો પાડે છે.\n\n"
                "### SATRA માં વપરાતા સેન્સર્સ:\n"
                "- **VIIRS (Visible Infrared Imaging Radiometer Suite)**: 375m પિક્સેલ રિઝોલ્યુશન.\n"
                "- **MODIS (Moderate Resolution Imaging Spectroradiometer)**: 1 km રિઝોલ્યુશન, 20+ વર્ષનો ઐતિહાસિક ડેટા."
            )
        elif target_lang == "bn":
            return (
                "**SATRA নলেজ বেস থেকে (NASA FIRMS পর্যালোচনা):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** উপগ্রহের মাধ্যমে সক্রিয় আগুন এবং "
                "তাপীয় অসঙ্গতি (thermal anomalies) পর্যবেক্ষণ করে এবং ৩ ঘণ্টার মধ্যে Near Real-Time (NRT) ডেটা প্রদান করে।\n\n"
                "### SATRA-তে ব্যবহৃত সেন্সর:\n"
                "- **VIIRS**: 375m পিক্সেল রেজোলিউশন (S-NPP, NOAA-20, NOAA-21).\n"
                "- **MODIS**: 1 km রেজোলিউশন, ২০+ বছরের ঐতিহাসিক রেকর্ড।"
            )
        elif target_lang == "pa":
            return (
                "**SATRA ਨਾਲੇਜ ਬੇਸ ਤੋਂ (NASA FIRMS ਸੰਖੇਪ ਜਾਣਕਾਰੀ):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ਉਪਗ੍ਰਹਿਆਂ ਰਾਹੀਂ ਸਰਗਰਮ ਅੱਗ ਅਤੇ "
                "ਥਰਮਲ ਅਸੰਗਤੀਆਂ (thermal anomalies) ਦੀ ਨਿਗਰਾਨੀ ਕਰਦਾ ਹੈ ਅਤੇ 3 ਘੰਟਿਆਂ ਦੇ ਅੰਦਰ Near Real-Time (NRT) ਡੇਟਾ ਪ੍ਰਦਾਨ ਕਰਦਾ ਹੈ।\n\n"
                "### SATRA ਵਿੱਚ ਵਰਤੇ ਜਾਂਦੇ ਸੈਂਸਰ:\n"
                "- **VIIRS**: 375m ਪਿਕਸਲ ਰੈਜ਼ੋਲੂਸ਼ਨ (S-NPP, NOAA-20, NOAA-21).\n"
                "- **MODIS**: 1 km ਰੈਜ਼ੋਲੂਸ਼ਨ, 20+ ਸਾਲਾਂ ਦਾ ਇਤਿਹਾਸਕ ਰਿਕਾਰਡ।"
            )
        elif target_lang == "or":
            return (
                "**SATRA ଜ୍ଞାନ ଆଧାରରୁ (NASA FIRMS ସମୀକ୍ଷା):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** ଉପଗ୍ରହ ମାଧ୍ୟମରେ ସକ୍ରିୟ ଅଗ୍ନିକାଣ୍ଡ ଏବଂ "
                "ଥର୍ମାଲ ବିସଙ୍ଗତି (thermal anomalies) ନିରୀକ୍ଷଣ କରେ ଏବଂ ଉପଗ୍ରହ ପାସ୍ ହେବାର ୩ ଘଣ୍ଟା ମଧ୍ୟରେ Near Real-Time (NRT) ତଥ୍ୟ ପ୍ରଦାନ କରେ।\n\n"
                "### SATRA ରେ ବ୍ୟବହୃତ ସେନ୍ସର:\n"
                "- **VIIRS**: 375 ମିଟର ପିକ୍ସେଲ ରିଜୋଲ୍ୟୁସନ (ଶିଳ୍ପ ଫ୍ଲେୟାର ଏବଂ କାରଖାନା ନିଆଁର ସଠିକ ଚିହ୍ନଟ)।\n"
                "- **MODIS**: 1 କିମି ପିକ୍ସେଲ ରିଜୋଲ୍ୟୁସନ (୨୦ ବର୍ଷରୁ ଅଧିକ ଐତିହାସିକ ରେକର୍ଡ)।"
            )
        elif target_lang == "as":
            return (
                "**SATRA জ্ঞান আধাৰৰ পৰা (NASA FIRMS সমীক্ষা):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** উপগ্ৰহৰ জৰিয়তে সক্ৰিয় জুই আৰু "
                "তাপীয় অসঙ্গতি (thermal anomalies) নিৰীক্ষণ কৰে আৰু উপগ্ৰহ পাৰ হোৱাৰ ৩ ঘণ্টাৰ ভিতৰত Near Real-Time (NRT) তথ্য প্ৰদান কৰে।\n\n"
                "### SATRA ত ব্যৱহৃত চেন্সৰ:\n"
                "- **VIIRS**: 375m পিক্সেল ৰিজলিউচন (উদ্যোগিক ফ্লেয়াৰ আৰু কাৰখানাৰ জুইৰ তাৎক্ষণিক চিনাক্তকৰণ)।\n"
                "- **MODIS**: 1 km পিক্সেল ৰিজলিউচন (২০ বছৰতকৈ অধিক ঐতিহাসিক তথ্য)।"
            )
        elif target_lang == "ur":
            return (
                "**SATRA نالج بیس سے (NASA FIRMS جائزہ):**\n\n"
                "**NASA FIRMS (Fire Information for Resource Management System)** سیٹلائٹ کے ذریعے فعال آگ اور "
                "تھرمل بے ضابطگیوں کی نگرانی کرتا ہے اور سیٹلائٹ اوور پاس کے 3 گھنٹوں کے اندر Near Real-Time (NRT) ڈیٹا فراہم کرتا ہے۔\n\n"
                "### SATRA میں استعمال ہونے والے سینسرز:\n"
                "- **VIIRS**: 375m پکسل ریزولوشن (صنعتی فلیئرز اور فیکٹری آگ کی فوری شناخت).\n"
                "- **MODIS**: 1 km پکسل ریزولوشن (20 سال سے زیادہ کا تاریخی ریکارڈ)."
            )

    # Topic 2: FRP (Fire Radiative Power)
    if "frp" in q_norm or "radiative power" in q_norm or "frp" in q_raw_lower or re.search(r'\bfrp\b', q_raw_lower):
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** என்பது மெகாவாட்களில் (Megawatts - MW) அளவிடப்படும் வெப்பக் கதிர்வீச்சு ஆற்றலாகும். "
                "இது ஒரு குறிப்பிட்ட வெப்ப மூலத்திலிருந்து ஒரு நொடியில் வெளியேறும் வெப்ப ஆற்றலைக் குறிக்கிறது.\n\n"
                "### அறிவியல் கோட்பாடுகள்:\n"
                "- இது **Planck's radiation law** மற்றும் **Stefan-Boltzmann $T^4$ விதி** அடிப்படையில் Mid-Wave Infrared (MWIR ~3.9 µm) அலைநீளத்தில் கணக்கிடப்படுகிறது.\n"
                "- FRP எரிக்கப்படும் எரிபொருளின் அளவோடு (Fuel Consumption Rate) நேரடி தொடர்பு கொண்டது.\n\n"
                "### பிரகாச வெப்பநிலை (Brightness Temperature):\n"
                "- கெல்வின் (Kelvin - K) அலகில் கணக்கிடப்படுகிறது. இயல்பான சூழல் வெப்பநிலை ~290–300 K ஆக இருக்கும்போது, தீவிர தொழிற்துறை தீ விபத்துகளில் இது 340–400+ K வரை உயர்கிறது."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** enbathu Megawatts (MW)-la measure pannapadura radiant heat energy output. "
                "Oru thermal anomaly evvalavu intense-ah heat release pannuthu-nu ithu kaatum.\n\n"
                "### Physics & Principles:\n"
                "- **Planck's radiation law** matrum **Stefan-Boltzmann $T^4$ relation** moolama Mid-Wave Infrared (~3.9 µm) window-la derive pannapaduthu.\n"
                "- FRP athigama iruntha combustion rate matrum fuel burn rate romba high-ah irukku-nu artham.\n\n"
                "### Brightness Temperature ($T_b$):\n"
                "- **Kelvin (K)** unit-la express pannuvom. Normal ambient temperature ~290–300 K irukkum, but active industrial fire-la 340–400+ K varaikum pogum."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** मेगावाट (MW) में मापी जाने वाली विकिरणी ऊष्मा ऊर्जा (radiant heat energy) है, "
                "जो थर्मल विसंगति से निकलने वाली ऊष्मा की दर को दर्शाती है।\n\n"
                "### भौतिक सिद्धांत:\n"
                "- यह **Planck's radiation law** और **Stefan-Boltzmann $T^4$ संबंध** पर आधारित है, जिसे मिड-वेव इन्फ्रारेड (~3.9 µm) चैनल से निकाला जाता है।\n"
                "- FRP सीधे तौर पर ईंधन जलने की दर (fuel combustion rate) के समानुपाती होता है।\n\n"
                "### ब्राइटनेस तापमान (Brightness Temperature):\n"
                "- केल्विन (K) में मापा जाता है। सामान्य परिवेश का तापमान ~290–300 K होता है, जबकि औद्योगिक आग में यह 340–400+ K से अधिक हो जाता है।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** అనేది మెగావాట్లలో (Megawatts - MW) కొలవబడే థర్మల్ రేడియంట్ హీట్ ఎనర్జీ అవుట్‌పుట్. "
                "ఇది ఒక థర్మల్ అనోమలీ నుండి యూనిట్ సమయానికి వెలువడే వేడిని సూచిస్తుంది.\n\n"
                "### భౌతిక సూత్రాలు:\n"
                "- ఇది **Planck's radiation law** మరియు **Stefan-Boltzmann $T^4$ సమీకరణం** ఆధారంగా మిడ్-వేవ్ ఇన్‌ఫ్రారెడ్ (~3.9 µm) లో లెక్కించబడుతుంది.\n"
                "- FRP నేరుగా ఇంధన దహన రేటుకు (fuel combustion rate) అనులోమానుపాతంలో ఉంటుంది.\n\n"
                "### బ్రైట్‌నెస్ ఉష్ణోగ్రత (Brightness Temperature):\n"
                "- కెల్విన్ (Kelvin - K) లో కొలుస్తారు. సాధారణ పరిసర ఉష్ణోగ్రత ~290–300 K ఉండగా, క్రియాశీల పారిశ్రామిక అగ్నిప్రమాదాల్లో ఇది 340–400+ K కంటే ఎక్కువగా ఉంటుంది."
            )
        elif target_lang == "kn":
            return (
                "**SATRA ಜ್ಞಾನ ತಳಹದಿಯಿಂದ (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** ಅನ್ನು ಮೆಗಾವ್ಯಾಟ್‌ಗಳಲ್ಲಿ (Megawatts - MW) ಅಳೆಯಲಾಗುತ್ತದೆ. "
                "ಇದು ಥರ್ಮಲ್ ಮೂಲದಿಂದ ಹೊರಸೂಸುವ ವಿಕಿರಣ ಶಾಖ ಶಕ್ತಿಯ ದರವಾಗಿದೆ.\n\n"
                "- **Planck's radiation law** ಮತ್ತು **Stefan-Boltzmann $T^4$ ಸೂತ್ರ** ದ ಮೇಲೆ ಲೆಕ್ಕಹಾಕಲಾಗುತ್ತದೆ.\n"
                "- ಬ್ರೈಟ್‌ನೆಸ್ ತಾಪಮಾನವನ್ನು ಕೆಲ್ವಿನ್ (Kelvin - K) ನಲ್ಲಿ ವ್ಯಕ್ತಪಡಿಸಲಾಗುತ್ತದೆ (ಸಾಮಾನ್ಯ: 290–300 K, ಕೈಗಾರಿಕಾ ಬೆಂಕಿ: 340–400+ K)."
            )
        elif target_lang == "ml":
            return (
                "**SATRA നോളജ് ബേസിൽ നിന്ന് (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** എന്നത് മെഗാവാട്ടിൽ (Megawatts - MW) അളക്കുന്ന തെർമൽ റേഡിയേഷൻ ഔട്ട്പുട്ടാണ്. "
                "തീപിടുത്തത്തിന്റെ വ്യാപ്തിയും ഇന്ധനം കത്തുന്ന നിരക്കും മനസ്സിലാക്കാൻ ഇത് സഹായിക്കുന്നു.\n\n"
                "- **Planck's radiation law** അടിസ്ഥാനമാക്കി മിഡ്-വേവ് ഇൻഫ്രാറെഡ് (~3.9 µm) വഴിയാണ് കണക്കാക്കുന്നത്.\n"
                "- ബ്രൈറ്റ്നസ്സ് താപനില കെൽവിനിൽ (Kelvin - K) അളക്കുന്നു (സാധാരണ അന്തരീക്ഷം ~290–300 K, വ്യാവസായിക തീപിടുത്തം >340–400+ K)."
            )
        elif target_lang == "mr":
            return (
                "**SATRA नॉलेज बेसमधून (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** हे मेगाव्हॉट (Megawatts - MW) मध्ये मोजले जाणारे रेडियंट हीट आउटपुट आहे. "
                "हे थर्मल विसंगतीमधून बाहेर पडणाऱ्या उष्णतेचे प्रमाण दर्शवते.\n\n"
                "- **Planck's radiation law** आणि **Stefan-Boltzmann $T^4$ संबंधावर** आधारित आहे.\n"
                "- ब्राइटनेस तापमान केल्विन (Kelvin - K) मध्ये मोजले जाते (औद्योगिक आगीत 340–400+ K)."
            )
        elif target_lang == "gu":
            return (
                "**SATRA નોલેજ બેઝમાંથી (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** એ મેગાવોટ (Megawatts - MW) માં માપવામાં આવતી હીટ એનર્જી આઉટપુટ છે. "
                "તે દર્શાવે છે કે થર્મલ વિસંગતતામાંથી કેટલી ઝડપથી ગરમી ઉત્સર્જિત થઈ રહી છે.\n\n"
                "- **Planck's radiation law** પર આધારિત છે.\n"
                "- બ્રાઇટનેસ તાપમાન કેલ્વિન (Kelvin - K) માં મપાય છે."
            )
        elif target_lang == "bn":
            return (
                "**SATRA নলেজ বেস থেকে (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** মেগাওয়াটে (Megawatts - MW) পরিমাপ করা তেজস্ক্রিয় তাপ শক্তি। "
                "এটি থার্মাল অ্যানোমালি থেকে তাপ নির্গমনের হার নির্দেশ করে।\n\n"
                "- **Planck's radiation law** অনুসারে মিড-ওয়েভ ইনফ্রারেড থেকে প্রাপ্ত।\n"
                "- ব্রাইটনেস তাপমাত্রা কেলভিনে (Kelvin - K) প্রকাশ করা হয় (শিল্প আগুনে ৩৪০-৪০০+ K)।"
            )
        elif target_lang == "pa":
            return (
                "**SATRA ਨਾਲੇਜ ਬੇਸ ਤੋਂ (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** ਮੈਗਾਵਾਟ (Megawatts - MW) ਵਿੱਚ ਮਾਪੀ ਜਾਣ ਵਾਲੀ ਰੇਡੀਐਂਟ ਹੀਟ ਐਨਰਜੀ ਹੈ। "
                "ਇਹ ਥਰਮਲ ਅਸੰਗਤੀ ਤੋਂ ਗਰਮੀ ਨਿਕਲਣ ਦੀ ਦਰ ਨੂੰ ਦਰਸਾਉਂਦਾ ਹੈ।\n\n"
                "- ਬ੍ਰਾਈਟਨੈੱਸ ਤਾਪਮਾਨ ਕੈਲਵਿਨ (Kelvin - K) ਵਿੱਚ ਮਾਪਿਆ ਜਾਂਦਾ ਹੈ।"
            )
        elif target_lang == "or":
            return (
                "**SATRA ଜ୍ଞାନ ଆଧାରରୁ (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** ହେଉଛି ମେଗାୱାଟ (Megawatts - MW) ରେ ମାପ କରାଯାଉଥିବା ଥର୍ମାଲ ରେଡିଆଣ୍ଟ ଉତ୍ତାପ ଶକ୍ତି। "
                "ଏହା ନିଆଁର ତୀବ୍ରତା ଏବଂ ଇନ୍ଧନ ଜଳିବା ହାରକୁ ସୂଚିତ କରେ।\n\n"
                "- **Planck's radiation law** ଏବଂ **Stefan-Boltzmann $T^4$ ନିୟମ** ଉପରେ ଆଧାରିତ।\n"
                "- ବ୍ରାଇଟନେସ ତାପମାତ୍ରା କେଲଭିନ (Kelvin - K) ରେ ମାପ କରାଯାଏ (ଶିଳ୍ପ ଅଗ୍ନିକାଣ୍ଡରେ 340–400+ K)।"
            )
        elif target_lang == "as":
            return (
                "**SATRA ज्ञान আধাৰৰ পৰা (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** মেগাৱাটত (Megawatts - MW) জোখা বিকিৰণশীল তাপ শক্তিৰ পৰিমাণ। "
                "ই তাপীয় অসঙ্গতিৰ পৰা নিৰ্গত হোৱা তাপৰ হাৰ সূচায়।\n\n"
                "- **Planck's radiation law** আৰু **Stefan-Boltzmann $T^4$ সূত্ৰ** ৰ ওপৰত আধাৰিত।\n"
                "- উজ্জ্বলতা উষ্ণতা কেলভিনত (Kelvin - K) জোখা হয়।"
            )
        elif target_lang == "ur":
            return (
                "**SATRA نالج بیس سے (Fire Radiative Power - FRP):**\n\n"
                "**Fire Radiative Power (FRP)** میگاواٹ (Megawatts - MW) میں ماپی جانے والی تابکار حرارتی توانائی ہے، "
                "جو کسی تھرمل بے ضابطگی سے خارج ہونے والی حرارت کی شرح کو ظاہر کرتی ہے۔\n\n"
                "- یہ **Planck's radiation law** اور **Stefan-Boltzmann $T^4$** اصول پر مبنی ہے۔\n"
                "- برائٹنس کا درجہ حرارت کیلون (Kelvin - K) میں ماپا جاتا ہے۔"
            )

    # Topic 3: AI Model / Machine Learning Ensemble
    if "ai model" in q_norm or "machine learning" in q_norm or "ensemble" in q_norm or "classify" in q_norm:
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (AI மாதிரி கட்டமைப்பு):**\n\n"
                "SATRA அமைப்பு **Soft-Voting Ensemble Classifier** என்ற மேம்பட்ட இயந்திரக் கற்றல் (Machine Learning) கட்டமைப்பைப் பயன்படுத்துகிறது. "
                "இதில் மூன்று முக்கிய மாதிரிகள் இணைந்து செயல்படுகின்றன:\n\n"
                "1. **Random Forest (100 Decision Trees)**: மாறுபாடுகளைக் குறைத்து சென்சார் சத்தத்தைத் தடுக்கிறது.\n"
                "2. **LightGBM**: வேகமான gradient boosting மூலம் தொடர்ச்சியான அலைவரிசைகளின் தொடர்புகளைக் கணக்கிடுகிறது.\n"
                "3. **XGBoost**: சீரான ஆழம் கொண்ட gradient boosting மூலம் வகுப்புகளுக்கிடையேயான சமநிலையின்மையை சரிசெய்கிறது.\n\n"
                "### அம்ச திசையன் (Feature Vector - 28 Features):\n"
                "- சென்சார் அளவீடுகள்: `brightness`, `bright_t31`, `frp`, `scan`, `track`, `daynight`.\n"
                "- கணக்கிடப்பட்ட அளவீடுகள்: வெப்பநிலை வேறுபாடு $\\Delta T = T_{I4} - T_{I5}$, உள்ளூர் நேரம் மற்றும் மாதம்.\n"
                "- இடஞ்சார்ந்த சூழல்: 1 கி.மீ சுற்றளவுக்குள் வரலாற்று மறுநிகழ்வு மற்றும் தொழில்துறை மண்டல அருகாமை."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (AI Model Architecture):**\n\n"
                "SATRA platform **Soft-Voting Ensemble Classifier** ML architecture-ah use pannuthu. "
                "Ithula 3 high-performance complementary models combine aagi irukku:\n\n"
                "1. **Random Forest (100 Trees)**: Sensor noise-ah resist panni prediction variance-ah reduce pannum.\n"
                "2. **LightGBM**: Fast histogram-based gradient boosting non-linear satellite bands interaction-ah capture pannum.\n"
                "3. **XGBoost**: Regularized depth-wise gradient boosting imbalanced classes-la high accuracy tharum.\n\n"
                "### Feature Vector (28 Features):\n"
                "- Radiometry: `brightness`, `bright_t31`, `frp`, `scan`, `track`, `daynight`.\n"
                "- Derived metrics: Temperature difference $\\Delta T$, local solar time, recurrence count.\n"
                "- Geospatial context: 1 km radius historical persistence matrum industrial polygon buffer distance."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (AI मॉडल आर्किटेक्चर):**\n\n"
                "SATRA प्लेटफॉर्म एक **Soft-Voting Ensemble Classifier** का उपयोग करता है जो तीन उन्नत मशीन लर्निंग मॉडलों को जोड़ता है:\n\n"
                "1. **Random Forest (100 Decision Trees)**: विसंगतियों को नियंत्रित करता है और सेंसर शोर को रोकता है।\n"
                "2. **LightGBM**: फास्ट हिस्टोग्राम ग्रेडिएंट बूस्टिंग जो जटिल उपग्रह डेटा को तेजी से प्रोसेस करता है।\n"
                "3. **XGBoost**: नियमित ग्रेडिएंट बूस्टिंग जो असंतुलित वर्गों पर उच्च सटीकता प्रदान करता है।\n\n"
                "### 28 फीचर्स का विश्लेषण:\n"
                "- उपग्रह रेडियोमेट्री: `brightness`, `bright_t31`, `frp`, `scan`, `track`, `daynight`.\n"
                "- तापमान अंतर: $\\Delta T = T_{I4} - T_{I5}$, स्थानीय सौर समय और माह।\n"
                "- भू-स्थानिक संदर्भ: 1 किमी के भीतर ऐतिहासिक पुनरावृत्ति और औद्योगिक क्षेत्रों से दूरी।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (AI మోడల్ ఆర్కిటెక్చర్):**\n\n"
                "SATRA ప్లాట్‌ఫారమ్ అధునాతన **Soft-Voting Ensemble Classifier** మెషిన్ లెర్నింగ్ మోడల్‌ను ఉపయోగిస్తుంది. "
                "ఇందులో మూడు ప్రముఖ మోడల్స్ కలిసి పనిచేస్తాయి:\n\n"
                "1. **Random Forest (100 Decision Trees)**: సెన్సార్ నాయిస్‌ను నిరోధించి వేరియన్స్‌ను తగ్గిస్తుంది.\n"
                "2. **LightGBM**: శాటిలైట్ బ్యాండ్‌ల మధ్య సంక్లిష్ట నాన్-లీనియర్ ఇంటరాక్షన్‌లను వేగంగా గుర్తిస్తుంది.\n"
                "3. **XGBoost**: అసమతుల్య తరగతులపై అధిక ఖచ్చితత్వాన్ని నిర్ధారిస్తుంది.\n\n"
                "### ఫీచర్ వెక్టర్ (28 Features):\n"
                "- రేడియోమెట్రీ: `brightness`, `bright_t31`, `frp`, `scan`, `track`, `daynight`.\n"
                "- ఉష్ణోగ్రత వ్యత్యాసం $\\Delta T = T_{I4} - T_{I5}$, స్థానిక సమయం మరియు చారిత్రక పునరావృత ఫ్రీక్వెన్సీ."
            )
        elif target_lang in ["kn", "ml", "mr", "gu", "bn", "pa", "ur"]:
            label = LANG_LABELS.get(target_lang, ("SATRA AI", ""))[0]
            return (
                f"**{label}:**\n\n"
                "SATRA utilizes a high-accuracy **Soft-Voting Ensemble Classifier** combining:\n"
                "1. **Random Forest** (100 decision trees resisting sensor noise)\n"
                "2. **LightGBM** (fast gradient boosting on continuous satellite channels)\n"
                "3. **XGBoost** (regularized boosting for imbalanced class stability)\n\n"
                "**Feature Vector (28 parameters)** includes satellite radiometry (`brightness`, `bright_t31`, `frp`), "
                "temperature difference ($\\Delta T$), local solar hour, and geospatial proximity to industrial infrastructure polygons."
            )

    # Topic 4: Four Classification Classes
    if "four classification" in q_norm or "classes" in q_norm or "taxonomy" in q_norm:
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (நான்கு வகைப்பாடுகள்):**\n\n"
                "SATRA கண்டறியப்படும் அனைத்து வெப்ப முரண்பாடுகளையும் 4 நிலையான செயல்பாட்டு வகுப்புகளாக வகைப்படுத்துகிறது:\n\n"
                "- **`0 = Industrial Fire` (தொழிற்சாலை தீ)**: சுத்திகரிப்பு நிலையங்கள், இரசாயன ஆலைகள் அல்லது கிடங்குகளில் ஏற்படும் திட்டமிடப்படாத, அபாயகரமான தீ விபத்துகள்.\n"
                "- **`1 = Forest Fire` (காட்டுத்தீ)**: காடுகள், புல்வெளிகள் அல்லது திறந்தவெளி தாவரங்களில் வேகமாக பரவும் பெரிய அளவிலான தீ.\n"
                "- **`2 = Persistent Thermal Source` (தொடர்ச்சியான வெப்ப ஆதாரம்)**: அங்கீகரிக்கப்பட்ட நிலையான தொழில்துறை உலைகள், Flare Stacks, சிமென்ட் உலைகள் போன்ற வரலாற்று ரீதியாக தொடர்ந்து இயங்கும் வெப்ப மூலங்கள்.\n"
                "- **`3 = Other` (பிற)**: விவசாயக் கழிவு எரிப்பு, நகர்ப்புற பின்னணி வெப்பம் அல்லது சூரிய ஒளி பிரதிபலிப்பால் ஏற்படும் தவறான எச்சரிக்கைகள்."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (4 Classification Classes):**\n\n"
                "SATRA ella satellite thermal anomalies-aiyum 4 standardized operational classes-ah classify pannuthu:\n\n"
                "- **`0 = Industrial Fire`**: Refineries, chemical plants, factories-la nadakkura unplanned, hazardous structural fire accidents.\n"
                "- **`1 = Forest Fire`**: Kaadugal, open vegetation matrum grasslands-la perusa spread aagura wildfires.\n"
                "- **`2 = Persistent Thermal Source`**: Refinery flare stacks, blast furnaces, cement kilns maathiri authorized, recurring industrial heat sources.\n"
                "- **`3 = Other`**: Agricultural stubble burning, urban background heat, illana solar glint false alarms."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (चार वर्गीकरण श्रेणियां):**\n\n"
                "SATRA सभी थर्मल डिटेक्शन को 4 मानक श्रेणियों में वर्गीकृत करता है:\n\n"
                "- **`0 = Industrial Fire` (औद्योगिक आग)**: रिफाइनरियों, रासायनिक संयंत्रों, कारखानों या गोदामों में होने वाली अनियोजित, खतरनाक आग।\n"
                "- **`1 = Forest Fire` (जंगल की आग)**: जंगलों, घास के मैदानों या वनस्पतियों में तेजी से फैलने वाली आग।\n"
                "- **`2 = Persistent Thermal Source` (लगातार थर्मल स्रोत)**: अधिकृत औद्योगिक फ्लेयर स्टैक, ब्लास्ट फर्नेस, स्मेल्टर या भट्टियां जो लगातार उच्च तापमान उत्सर्जित करती हैं।\n"
                "- **`3 = Other` (अन्य)**: पराली जलाना, शहरी पृष्ठभूमि की गर्मी या सौर परावर्तन से उत्पन्न होने वाले फॉल्स अलार्म।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (నాలుగు వర్గీకరణ విభాగాలు):**\n\n"
                "SATRA అన్ని ఉపగ్రహ థర్మల్ డిటెక్షన్లను 4 ప్రామాణిక ఆపరేషనల్ కేటగిరీలుగా వర్గీకరిస్తుంది:\n\n"
                "- **`0 = Industrial Fire` (పారిశ్రామిక అగ్ని)**: రిఫైనరీలు, రసాయన కర్మాగారాలు లేదా గోదాములలో జరిగే ప్రమాదకర అగ్ని ప్రమాదాలు.\n"
                "- **`1 = Forest Fire` (అటవీ అగ్ని)**: అడవులు, గడ్డి భూములు లేదా బహిరంగ వృక్షసంపదలో వ్యాపించే పెద్ద మంటలు.\n"
                "- **`2 = Persistent Thermal Source` (నిరంతర థర్మల్ మూలం)**: ఫ్లేర్ స్టాక్స్, బ్లాస్ట్ ఫర్నేస్‌లు మరియు సిమెంట్ బట్టీల వంటి స్థిరమైన అధిక-ఉష్ణోగ్రత మూలాలు.\n"
                "- **`3 = Other` (ఇతర)**: పంట వ్యర్థాల దహనం లేదా అర్బన్ హీటింగ్ వల్ల వచ్చే తప్పుడు అలారాలు."
            )
        elif target_lang in ["kn", "ml", "mr", "gu", "bn", "pa", "ur"]:
            label = LANG_LABELS.get(target_lang, ("SATRA AI", ""))[0]
            return (
                f"**{label} (4 Classification Classes):**\n\n"
                "- **`0 = Industrial Fire`**: Unplanned, hazardous fires in petrochemical plants, refineries, chemical factories, and fuel storage depots.\n"
                "- **`1 = Forest Fire`**: Expanding vegetation and wildfire perimeters over forests and brushlands.\n"
                "- **`2 = Persistent Thermal Source`**: Stationary, authorized high-temperature industrial infrastructure (flare stacks, blast furnaces, kilns).\n"
                "- **`3 = Other`**: Agricultural stubble burns, urban heat, and solar false alarms."
            )

    # Topic 5: Exact Location Identification
    if "exact location" in q_norm or "identify" in q_norm or "location" in q_norm:
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (துல்லியமான இடத்தைக் கண்டறிதல்):**\n\n"
                "SATRA ஒரு வெப்ப முரண்பாட்டின் சரியான இடத்தை பின்வரும் பல அடுக்கு புவிசார் முறைகள் மூலம் துல்லியமாக அடையாளம் காண்கிறது:\n\n"
                "1. **Satellite Geolocation Telemetry**: VIIRS 375m மற்றும் MODIS சென்சார்களின் WGS84 (EPSG:4326) அட்சரேகை மற்றும் தீர்க்கரேகை (Latitude/Longitude) ஒருங்கிணைப்புகள்.\n"
                "2. **Spatial Pixel Geometry**: Scan கோணம் மற்றும் Track படகு அளவைக் கொண்டு பிக்சல் சிதைவை சரிசெய்தல்.\n"
                "3. **Industrial Polygon Buffer Matching**: பதிவுசெய்யப்பட்ட தொழில்துறை வளாகங்கள், பெட்ரோகெமிக்கல் மண்டலங்கள் மற்றும் சிறப்பு பொருளாதார மண்டலங்களின் (SEZ) GIS எல்லைகளுடன் 500m முதல் 1 km சுற்றளவுக்குள் மேப்பிங் செய்தல்.\n"
                "4. **Persistent Spatial Clustering (DBSCAN)**: தொடர்ச்சியான வரலாற்று அவதானிப்புகளை ஒரே இடப் புள்ளியுடன் இணைத்து உலைகள் மற்றும் தொழில்துறை அடுக்குகளை உறுதிப்படுத்துதல்."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (Exact Location Identification):**\n\n"
                "SATRA oru hotspot-oda exact location-ah multi-layered geospatial techniques moolama identify pannuthu:\n\n"
                "1. **Satellite Geolocation Telemetry**: VIIRS 375m matrum MODIS sensor-la irunthu kidaikkura precise WGS84 Latitude matrum Longitude coordinates.\n"
                "2. **Pixel Distortion Correction**: Scan angle matrum track telemetry vachu satellite sensor pixel footprint-ah calibrate pannum.\n"
                "3. **Industrial Polygon GIS Buffering**: Registered industrial zones, refineries matrum chemical parks-oda GIS boundaries-oda 500m-1km buffer-la spatial cross-matching nadakkum.\n"
                "4. **DBSCAN Spatial Clustering**: Historical passes-la athe coordinate-la thermal hits repeat aagutha-nu cluster panni industrial flare stacks-ah confirm pannum."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (सटीक स्थान की पहचान):**\n\n"
                "SATRA किसी थर्मल डिटेक्शन के सटीक स्थान की पहचान बहुस्तरीय भू-स्थानिक विश्लेषण के माध्यम से करता है:\n\n"
                "1. **उपग्रह भू-स्थानिक टेलीमेट्री**: VIIRS 375m और MODIS सेंसर से प्राप्त WGS84 अक्षांश और देशांतर (Latitude/Longitude) निर्देशांक।\n"
                "2. **पिक्सेल ज्यामिति सुधार**: स्कैन और ट्रैक कोण के आधार पर उपग्रह पिक्सेल विरूपण को ठीक किया जाता है।\n"
                "3. **औद्योगिक पॉलीगॉन GIS बफरिंग**: पंजीकृत औद्योगिक परिसरों और रिफाइनरी सीमाओं के 500 मीटर से 1 किमी बफर के साथ स्थानिक मिलान।\n"
                "4. **DBSCAN स्थानिक क्लस्टरिंग**: कई सैटेलाइट पासों में एक ही स्थान पर दोहराए जाने वाले हीट सिग्नेचर की पुष्टि करता है।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (ఖచ్చితమైన స్థాన గుర్తింపు):**\n\n"
                "SATRA థర్మల్ అనోమలీ యొక్క ఖచ్చితమైన స్థానాన్ని బహుళ-స్థాయి జియోస్పేషియల్ విశ్లేషణ ద్వారా గుర్తిస్తుంది:\n\n"
                "1. **ఉపగ్రహ జియోలొకేషన్ టెలిమెట్రీ**: VIIRS 375m మరియు MODIS సెన్సార్ల నుండి WGS84 అక్షాంశం మరియు రేఖాంశం (Latitude/Longitude).\n"
                "2. **పిక్సెల్ జ్యామితి దిద్దుబాటు**: స్కాన్ కోణం ఆధారంగా పిక్సెల్ విస్తరణను కాలిబ్రేట్ చేస్తుంది.\n"
                "3. **ఇండస్ట్రియల్ పాలిగాన్ GIS బఫరింగ్**: రిఫైనరీలు మరియు పారిశ్రామిక మండలాల GIS సరిహద్దులతో 500m నుండి 1 కి.మీ బఫర్‌లో సరిపోల్చుతుంది.\n"
                "4. **DBSCAN స్పేషియల్ క్లస్టరింగ్**: చారిత్రక రికార్డులలో అదే స్థానంలో పునరావృతమయ్యే హీట్ సిగ్నేచర్‌లను స్థిరపరుస్తుంది."
            )

    # Topic 6: RAG (Retrieval-Augmented Generation)
    if "rag" in q_norm or "retrieval-augmented" in q_norm or "rag" in q_raw_lower or re.search(r'\brag\b', q_raw_lower):
        if target_lang == "ta":
            return (
                "**SATRA அறிவுத் தளத்திலிருந்து (RAG கட்டமைப்பு):**\n\n"
                "**RAG (Retrieval-Augmented Generation)** என்பது SATRA AI Assistant-ஐ சரிபார்க்கப்பட்ட தொழில்நுட்ப ஆவணங்கள் மற்றும் "
                "நேரடி தரவுத்தள அவதானிப்புகளுடன் இணைக்கும் ஒரு அறிவார்ந்த தகவல் மீட்டெடுப்பு கட்டமைப்பாகும்.\n\n"
                "### RAG எவ்வாறு செயல்படுகிறது:\n"
                "1. **Document Ingestion & Semantic Chunking**: SATRA-வின் விண்வெளி சென்சார்கள், இயற்பியல், ML மாதிரிகள் மற்றும் எச்சரிக்கைகள் குறித்த ஆவணங்கள் துண்டுகளாகப் பிரிக்கப்படுகின்றன.\n"
                "2. **Dense Vector Embeddings & FAISS**: இந்த ஆவணத் துண்டுகள் அடர்த்தியான திசையன்களாக மாற்றப்பட்டு FAISS Vector Index-ல் சேமிக்கப்படுகின்றன.\n"
                "3. **Query Retrieval**: பயனர் தமிழ், ஆங்கிலம், Tanglish அல்லது இந்தியில் கேள்வி கேட்கும்போது, FAISS Cosine Similarity மூலம் மிகவும் தொடர்புடைய அறிவுப் பகுதிகள் உடனடியாக மீட்டெடுக்கப்படுகின்றன.\n"
                "4. **Grounded Synthesis**: போலித் தகவல்கள் அல்லது தவறான யூகங்களைத் (hallucination) தவிர்த்து, துல்லியமான மூல ஆவணங்களின் குறிப்புகளுடன் நம்பகமான பதில்கள் உருவாக்கப்படுகின்றன."
            )
        elif target_lang == "tanglish":
            return (
                "**SATRA Knowledge Base-la irunthu (RAG Architecture):**\n\n"
                "**RAG (Retrieval-Augmented Generation)** enbathu SATRA AI Assistant-ah verified project documentation "
                "matrum live database telemetry-oda connect panni accurate answers tharra intelligent architecture.\n\n"
                "### RAG epdi work aaguthu:\n"
                "1. **Document Ingestion**: Technical documents (sensors, ML models, GIS, physics) semantic chunks-ah divide aagum.\n"
                "2. **Dense Embeddings & FAISS Vector Index**: Chunks vector embeddings-ah convert aagi FAISS vector store-la index aagum.\n"
                "3. **Query Normalization & Retrieval**: User English, Tamil, Tanglish, illana Hindi-la question ketaalum, FAISS cosine similarity moolama relevant technical chunks retrieve aagum.\n"
                "4. **Grounded Generation**: AI hallucination illama, exact source citations matrum live database proof-oda verified answer generate aagum."
            )
        elif target_lang == "hi":
            return (
                "**SATRA नॉलेज बेस से (RAG आर्किटेक्चर):**\n\n"
                "**RAG (Retrieval-Augmented Generation)** एक उन्नत AI आर्किटेक्चर है जो SATRA AI सहायक को सत्यापित तकनीकी "
                "दस्तावेज़ों और लाइव डेटाबेस अवलोकनों से जोड़कर तथ्यात्मक उत्तर प्रदान करता है।\n\n"
                "### SATRA में RAG की कार्यप्रणाली:\n"
                "1. **दस्तावेज़ चंकिंग**: उपग्रह सेंसर, भौतिकी और ML मॉडल से संबंधित दस्तावेज़ों को संरचित भागों में विभाजित किया जाता है।\n"
                "2. **वेक्टर एम्बेडिंग और FAISS**: इन भागों को डेंस वेक्टर में बदलकर FAISS इंडेक्स में अनुक्रमित किया जाता है।\n"
                "3. **क्वेरी रिट्रीवल**: जब उपयोगकर्ता हिंदी, तमिल, तंग्लिश या अंग्रेजी में प्रश्न पूछता है, तो FAISS कोसाइन समानता के आधार पर सबसे प्रासंगिक जानकारी तुरंत प्राप्त होती है।\n"
                "4. **सत्यापित उत्तर उत्पादन**: यह AI मतिभ्रम (hallucination) को पूरी तरह रोकता है और सटीक संदर्भ उद्धरणों (citations) के साथ विश्वसनीय उत्तर देता है।"
            )
        elif target_lang == "te":
            return (
                "**SATRA నాలెడ్జ్ బేస్ నుండి (RAG ఆర్కిటెక్చర్):**\n\n"
                "**RAG (Retrieval-Augmented Generation)** అనేది SATRA AI అసిస్టెంట్‌ను ప్రామాణిక ప్రాజెక్ట్ డాక్యుమెంట్లు మరియు "
                "లైవ్ డేటాబేస్ పరిశీలనలతో అనుసంధానించే తెలివైన ఆర్కిటెక్చర్.\n\n"
                "### RAG ఎలా పనిచేస్తుంది:\n"
                "1. **డాక్యుమెంట్ చంకింగ్**: సెన్సార్లు, భౌతిక శాస్త్రం మరియు ML మోడల్స్ సమాచారం నిర్మాణాత్మక భాగాలుగా విభజించబడుతుంది.\n"
                "2. **FAISS వెక్టర్ ఇండెక్స్**: ఈ భాగాలు డెన్స్ వెక్టర్స్‌గా మార్చబడి నిల్వ చేయబడతాయి.\n"
                "3. **రిట్రీవల్ & ధృవీకరించిన సమాధానం**: వినియోగదారుడు ఏ భాషలో అడిగినా ఖచ్చితమైన మూల డాక్యుమెంట్ల ఆధారంగా నమ్మకమైన సమాధానాలు ఉత్పత్తి చేయబడతాయి."
            )

    # General Localized Fallback wrapper preserving technical details
    prefix_info = LANG_LABELS.get(target_lang)
    if prefix_info:
        prefix = f"**{prefix_info[0]}:**\n\n"
        return f"{prefix}{english_response}"

    return english_response

