"""
Multilingual processing module for SATRA AI Assistant.
Supports language detection, query normalization for RAG/vector retrieval,
and response localization across English, Tamil (தமிழ்), Tanglish, and Hindi (हिन्दी).
"""

import re
from typing import Dict, Any, Optional

# Unicode Ranges
TAMIL_PATTERN = re.compile(r'[\u0B80-\u0BFF]')
HINDI_PATTERN = re.compile(r'[\u0900-\u097F]')

# Phonetic / Colloquial Lexical Patterns for Romanized Text
TANGLISH_MARKERS = [
    r'\bna enna\b', r'\benna\b', r'\bepdi\b', r'\beppadi\b', r'\birukku\b',
    r'\billai\b', r'\bsolla\b', r'\btheriyuma\b', r'\bthee\b', r'\bkaatu\b',
    r'\baagum\b', r'\bpannum\b', r'\bpannuthu\b', r'\bkandupidikkuthu\b',
    r'\bsolvathu\b', r'\benakku\b', r'\bungalukku\b', r'\bsolunga\b',
    r'\bnaalu\b', r'\bvagaipaadu\b', r'\bperum\b', r'\binnaiku\b', r'\bkaatunga\b',
]

HINGLISH_MARKERS = [
    r'\bkya hai\b', r'\bkaise\b', r'\bbatao\b', r'\bhota hai\b', r'\bhoti hai\b',
    r'\bpehechan\b', r'\bkahan\b', r'\bkyun\b', r'\bkaisi\b', r'\bkaun sa\b',
    r'\bkaun si\b', r'\baag\b', r'\bdikhao\b', r'\baaj\b', r'\bchaar\b',
    r'\bkarega\b', r'\bkarta hai\b',
]


def detect_language(text: str) -> str:
    """
    Detects the language of user input.
    Returns: 'ta' (Tamil), 'hi' (Hindi), 'tanglish' (Tamil in Latin script), or 'en' (English).
    """
    if not text or not text.strip():
        return "en"

    clean_text = text.strip()

    # 1. Native script detection (Highest confidence)
    if TAMIL_PATTERN.search(clean_text):
        return "ta"
    if HINDI_PATTERN.search(clean_text):
        return "hi"

    # 2. Romanized / Phonetic detection
    clean_lower = clean_text.lower()
    for marker in TANGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "tanglish"

    for marker in HINGLISH_MARKERS:
        if re.search(marker, clean_lower):
            return "hi"

    return "en"


# Semantic mapping dictionary to translate multilingual user intent into English technical search concepts
MULTILINGUAL_QUERY_MAP = [
    # 1. NASA FIRMS
    (
        [
            "nasa firms என்றால் என்ன", "nasa firms என்ன", "nasa firms பற்றி",
            "nasa firms na enna", "firms na enna", "nasa firms enna",
            "nasa firms क्या है", "nasa firms kya hai", "firms kya hai",
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
        ],
        "How does SATRA identify the exact location of a detection coordinates latitude longitude GIS buffer?"
    ),
    # 6. RAG (Retrieval-Augmented Generation)
    (
        [
            "rag என்றால் என்ன", "rag என்ன", "rag பற்றி சொல்லுங்கள்",
            "rag na enna", "rag enna", "rag pathi sollu",
            "rag क्या है", "rag kya hai", "rag ke baare mein batao",
        ],
        "What is RAG Retrieval-Augmented Generation architecture vector search FAISS?"
    ),
    # 7. Today's fire detections
    (
        [
            "இன்றைய தீ கண்டறிதல்களைக் காட்டு", "இன்றைய தீ", "இன்று எத்தனை தீ",
            "innaiku fire detections kaatu", "innaiku ethana fire", "today fires enna",
            "आज के आग के मामलों को दिखाओ", "आज कितनी आग लगी", "aaj kitne fire hue",
        ],
        "Show today's fire detections how many fires detected today"
    ),
    # 8. Recent Alerts
    (
        [
            "சமீபத்திய விழிப்பூட்டல்கள்", "விழிப்பூட்டல்களைக் காட்டு",
            "recent alerts kaatu", "alerts kaatu", "recent alerts enna",
            "हालिया अलर्ट दिखाएं", "अलर्ट दिखाओ", "recent alerts kya hain",
        ],
        "Show recent fire alerts unresolved critical high alerts"
    ),
    # 9. Persistent Thermal Source
    (
        [
            "தொடர்ச்சியான வெப்ப ஆதாரம் என்றால் என்ன", "தொடர்ச்சியான வெப்பம்",
            "persistent thermal source na enna", "persistent source na enna",
            "लगातार थर्मल स्रोत क्या है", "persistent thermal source kya hai",
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
    }

    normalized = q_lower
    for src, tgt in word_subs.items():
        normalized = normalized.replace(src, tgt)

    return normalized.strip() or query


# ==============================================================================
# Domain-Specific Localized Response Synthesis
# ==============================================================================

def localize_response(english_response: str, target_lang: str, original_query: str = "") -> str:
    """
    Localizes a grounded English response into the requested language (Tamil, Tanglish, Hindi, or English).
    Preserves all technical keywords (NASA FIRMS, VIIRS, MODIS, FRP, RAG, GIS, Random Forest, etc.)
    """
    if target_lang == "en" or not target_lang:
        return english_response

    # Scope / Unrelated response
    if "specialized in industrial fire detection" in english_response.lower():
        if target_lang == "ta":
            return (
                "நான் SATRA AI உதவியாளர். நான் தொழில்துறை தீ கண்டறிதல், வெப்ப முரண்பாடுகள், "
                "செயற்கைக்கோள் தரவு, தீ வகைப்பாடு, விழிப்பூட்டல்கள், GIS பகுப்பாய்வு மற்றும் "
                "SATRA அமைப்பு தகவல்களில் மட்டுமே பதிலளிக்க பிரத்யேகமாக வடிவமைக்கப்பட்டுள்ளேன்."
            )
        elif target_lang == "tanglish":
            return (
                "Naan SATRA AI Assistant. Naan industrial fire detection, thermal anomalies, "
                "satellite data, fire classification, alerts, GIS analysis, matrum "
                "SATRA system information-la mattumae answer panna train aagirukken."
            )
        elif target_lang == "hi":
            return (
                "मैं SATRA AI सहायक हूँ। मैं विशेष रूप से औद्योगिक आग का पता लगाने, थर्मल विसंगतियों, "
                "उपग्रह डेटा, अग्नि वर्गीकरण, अलर्ट, जीआईएस विश्लेषण और SATRA सिस्टम की जानकारी के लिए प्रशिक्षित हूँ।"
            )

    # Greeting response
    if "hello! i am the **satra domain ai assistant**" in english_response.lower():
        if target_lang == "ta":
            return (
                "வணக்கம்! நான் **தொழில்துறை தீ கண்டறிதல் மற்றும் தொடர்ச்சியான வெப்ப மூல கண்காணிப்பு தளத்திற்கான (SATRA)** "
                "பிரத்யேக AI உதவியாளர்.\n\n"
                "### நான் உங்களுக்கு பின்வருவனவற்றில் உதவ முடியும்:\n"
                "- **நேரடி அவதானிப்புகள் & விழிப்பூட்டல்கள்**: \"*இன்றைய தீ கண்டறிதல்களைக் காட்டு*\", \"*சமீபத்திய விழிப்பூட்டல்கள்*\"\n"
                "- **குறிப்பிட்ட ஹாட்ஸ்பாட் விளக்கம்**: \"*இந்த கண்டறிதல் ஏன் தொழில்துறை தீ என வகைப்படுத்தப்பட்டது?*\"\n"
                "- **NASA FIRMS தரவுகள்**: \"*NASA FIRMS என்றால் என்ன?*\", \"*VIIRS vs MODIS வேறுபாடு என்ன?*\", \"*FRP என்றால் என்ன?*\"\n"
                "- **மெஷின் லேர்னிங்**: \"*SATRA என்ன AI மாதிரியைப் பயன்படுத்துகிறது?*\", \"*நான்கு வகைப்பாடுகள் என்ன?*\"\n"
                "- **GIS & இருப்பிடம்**: \"*SATRA ஒரு கண்டறிதலின் சரியான இடத்தை எவ்வாறு அடையாளம் காண்கிறது?*\"\n\n"
                "உங்களின் கேள்வியை தட்டச்சு செய்யவும் அல்லது மைக்ரோஃபோன் மூலம் பேசவும்."
            )
        elif target_lang == "tanglish":
            return (
                "Vanakkam! Naan industrial fire detection matrum persistent thermal source monitoring platform-kaga create panna **SATRA Domain AI Assistant**.\n\n"
                "### Ennala ungalukku ithilam assist panna mudiyum:\n"
                "- **Live Telemetry & Data**: \"*Innaiku ethana fire detect aachu?*\", \"*Recent fire alerts kaatu*\"\n"
                "- **Hotspot Explanations**: \"*Intha detection-ah yen industrial fire-nu classify pannuchu?*\"\n"
                "- **NASA FIRMS Telemetry**: \"*NASA FIRMS na enna?*\", \"*VIIRS vs MODIS difference enna?*\", \"*FRP na enna?*\"\n"
                "- **Machine Learning**: \"*SATRA enna AI model use pannuthu?*\", \"*Naalu classification classes enna?*\"\n"
                "- **GIS & Location**: \"*SATRA epdi exact location kandupidikkuthu?*\"\n\n"
                "Suggested questions-la select pannunga illana mic button use panni pesalam."
            )
        elif target_lang == "hi":
            return (
                "नमस्ते! मैं औद्योगिक आग का पता लगाने और लगातार थर्मल स्रोत निगरानी मंच के लिए **SATRA AI सहायक** हूँ।\n\n"
                "### मैं निम्नलिखित में आपकी सहायता कर सकता हूँ:\n"
                "- **लाइव टेलीमेट्री और डेटा**: \"*आज के आग के मामलों को दिखाओ*\", \"*हालिया अलर्ट दिखाएं*\"\n"
                "- **विशिष्ट हॉटस्पॉट विश्लेषण**: \"*इस डिटेक्शन को औद्योगिक आग के रूप में क्यों वर्गीकृत किया गया?*\"\n"
                "- **NASA FIRMS टेलीमेट्री**: \"*NASA FIRMS क्या है?*\", \"*VIIRS और MODIS में क्या अंतर है?*\", \"*FRP क्या है?*\"\n"
                "- **मशीन लर्निंग मॉडल**: \"*सैट्रा कौन सा एआई मॉडल उपयोग करता है?*\", \"*चार वर्गीकरण श्रेणियां क्या हैं?*\"\n"
                "- **जीआईएस और स्थान**: \"*सैट्रा किसी पहचान के सटीक स्थान की पहचान कैसे करता है?*\"\n\n"
                "एक प्रश्न टाइप करें या माइक्रोफ़ोन बटन दबाकर बोलें।"
            )

    q_norm = normalize_multilingual_query(original_query).lower()

    # Topic 1: NASA FIRMS
    if "nasa firms" in q_norm or "firms" in q_norm:
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

    # Topic 2: FRP (Fire Radiative Power)
    if "frp" in q_norm or "radiative power" in q_norm:
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

    # Topic 3: AI Model / Machine Learning Ensemble
    if "ai model" in q_norm or "machine learning" in q_norm or "ensemble" in q_norm:
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

    # Topic 6: RAG (Retrieval-Augmented Generation)
    if "rag" in q_norm or "retrieval-augmented" in q_norm:
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

    # General Localized Fallback wrapper preserving technical details
    if target_lang == "ta":
        prefix = "**SATRA AI உதவியாளர் (தமிழ்):**\n\n"
        return f"{prefix}{english_response}"
    elif target_lang == "tanglish":
        prefix = "**SATRA AI Assistant (Tanglish):**\n\n"
        return f"{prefix}{english_response}"
    elif target_lang == "hi":
        prefix = "**SATRA AI सहायक (हिन्दी):**\n\n"
        return f"{prefix}{english_response}"

    return english_response
