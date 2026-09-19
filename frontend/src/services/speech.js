/**
 * SATRA Multilingual Speech & Voice Integration Service
 * Provides SpeechRecognition (voice-to-text) and SpeechSynthesis (text-to-speech)
 * with support for English, Tamil (தமிழ்), Tanglish, and Hindi (हिन्दी).
 */

export const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English', native: 'English', code: 'en-IN', flag: '🌐' },
  { id: 'ta', label: 'Tamil', native: 'தமிழ்', code: 'ta-IN', flag: '🇮🇳' },
  { id: 'te', label: 'Telugu', native: 'తెలుగు', code: 'te-IN', flag: '🇮🇳' },
  { id: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn-IN', flag: '🇮🇳' },
  { id: 'ml', label: 'Malayalam', native: 'മലയാളം', code: 'ml-IN', flag: '🇮🇳' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी', code: 'hi-IN', flag: '🇮🇳' },
  { id: 'mr', label: 'Marathi', native: 'मराठी', code: 'mr-IN', flag: '🇮🇳' },
  { id: 'gu', label: 'Gujarati', native: 'ગુજરાતી', code: 'gu-IN', flag: '🇮🇳' },
  { id: 'bn', label: 'Bengali', native: 'বাংলা', code: 'bn-IN', flag: '🇮🇳' },
  { id: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pa-IN', flag: '🇮🇳' },
  { id: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', code: 'or-IN', flag: '🇮🇳' },
  { id: 'as', label: 'Assamese', native: 'অসমীয়া', code: 'as-IN', flag: '🇮🇳' },
  { id: 'ur', label: 'Urdu', native: 'اردو', code: 'ur-IN', flag: '🇮🇳' },
  { id: 'raj', label: 'Rajasthani', native: 'राजस्थानी', code: 'hi-IN', flag: '🇮🇳' },
  { id: 'tanglish', label: 'Tanglish', native: 'Tamil (Latin)', code: 'ta-IN', flag: '🇮🇳' },
  { id: 'auto', label: 'Auto Detect', native: 'Auto Detect', code: 'auto', flag: '🌐' },
];

export const MULTILINGUAL_SUGGESTED_QUESTIONS = {
  auto: [
    'What is NASA FIRMS?',
    'How does SATRA classify fires?',
    'What is FRP?',
    "Show today's fire detections",
    'What is a persistent thermal source?',
    'What does the confidence score mean?',
  ],
  en: [
    'What is NASA FIRMS?',
    'How does SATRA classify fires?',
    'What is FRP?',
    "Show today's fire detections",
    'What is a persistent thermal source?',
    'What does the confidence score mean?',
  ],
  ta: [
    'NASA FIRMS என்றால் என்ன?',
    'SATRA தீயை எப்படி வகைப்படுத்துகிறது?',
    'FRP என்றால் என்ன?',
    'இன்றைய தீ கண்டறிதல்களைக் காட்டு',
    'நான்கு வகைப்பாடுகள் என்ன?',
    'தொடர்ச்சியான வெப்ப ஆதாரம் என்றால் என்ன?',
  ],
  tanglish: [
    'NASA FIRMS na enna?',
    'SATRA epdi fires classify pannuthu?',
    'FRP na enna?',
    'Innaiku ethana fire?',
    'Naalu classification classes enna?',
    'Recent fire alerts kaatu',
  ],
  hi: [
    'NASA FIRMS क्या है?',
    'SATRA आग को कैसे वर्गीकृत करता है?',
    'FRP क्या है?',
    'आज के आग के मामलों को दिखाओ',
    'चार वर्गीकरण श्रेणियां क्या हैं?',
    'सैट्रा कौन सा एआई मॉडल उपयोग करता है?',
  ],
  te: [
    'NASA FIRMS అంటే ఏమిటి?',
    'SATRA మంటలను ఎలా వర్గీకరిస్తుంది?',
    'FRP అంటే ఏమిటి?',
    'ఈరోజు మంటలను చూపించు',
    'నాలుగు వర్గీకరణలు ఏమిటి?',
    'నిరంతర థర్మల్ మూలం అంటే ఏమిటి?',
  ],
  kn: [
    'NASA FIRMS ಎಂದರೇನು?',
    'SATRA ಬೆಂಕಿಯನ್ನು ಹೇಗೆ ವರ್ಗೀಕರಿಸುತ್ತದೆ?',
    'FRP ಎಂದರೇನು?',
    'ಇಂದಿನ ಬೆಂಕಿ ಪತ್ತೆಗಳನ್ನು ತೋರಿಸಿ',
    'ನಾಲ್ಕು ವರ್ಗೀಕರಣಗಳು ಯಾವುವು?',
  ],
  ml: [
    'NASA FIRMS എന്താണ്?',
    'SATRA തീപിടുത്തങ്ങളെ എങ്ങനെ തരംതിരിക്കുന്നു?',
    'FRP എന്താണ്?',
    'ഇന്നത്തെ തീപിടുത്തങ്ങൾ കാണിക്കുക',
    'നാല് വർഗ്ഗീകരണങ്ങൾ ഏവ?',
  ],
  mr: [
    'NASA FIRMS म्हणजे काय?',
    'SATRA आगीचे वर्गीकरण कसे करते?',
    'FRP म्हणजे काय?',
    'आजच्या आगी दाखवा',
    'चार वर्गीकरण वर्ग कोणते आहेत?',
  ],
  gu: [
    'NASA FIRMS શું છે?',
    'SATRA આગનું વર્ગીકરણ કેવી રીતે કરે છે?',
    'FRP શું છે?',
    'આજની આગ બતાવો',
    'ચાર વર્ગીકરણ શ્રેણીઓ કઈ છે?',
  ],
  bn: [
    'NASA FIRMS কী?',
    'SATRA কীভাবে আগুন শ্রেণিবদ্ধ করে?',
    'FRP কী?',
    'আজকের আগুন সনাক্তকরণ দেখাও',
    'চারটি শ্রেণিবিভাগ কী কী?',
  ],
  pa: [
    'NASA FIRMS ਕੀ ਹੈ?',
    'SATRA ਅੱਗ ਨੂੰ ਕਿਵੇਂ ਸ਼੍ਰੇਣੀਬੱਧ ਕਰਦਾ ਹੈ?',
    'FRP ਕੀ ਹੈ?',
    'ਅੱਜ ਦੀਆਂ ਅੱਗਾਂ ਦਿਖਾਓ',
    'ਚਾਰ ਵਰਗੀਕਰਨ ਸ਼੍ਰੇਣੀਆਂ ਕੀ ਹਨ?',
  ],
  or: [
    'NASA FIRMS କଣ?',
    'SATRA ଅଗ୍ନିକୁ କିପରି ବର୍ଗୀକରଣ କରେ?',
    'FRP କଣ?',
    'ଆଜିର ଅଗ୍ନିକାଣ୍ଡ ଦେଖାନ୍ତୁ',
  ],
  ur: [
    'NASA FIRMS کیا ہے؟',
    'SATRA آگ کی درجہ بندی کیسے کرتا ہے؟',
    'FRP کیا ہے؟',
    'آج کی آگ کی نشاندہی دکھائیں',
  ],
  raj: [
    'NASA FIRMS कांई है?',
    'SATRA आग नै कियां छांटै है?',
    'FRP कांई है?',
    'आज री आग दिखावो',
  ],
};

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stripMarkdownForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/#{1,6}\s+/g, '') // headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // code inline
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[-*+]\s+/g, '') // list bullets
    .replace(/>\s+/g, '') // blockquotes
    .replace(/\n+/g, '. ') // line breaks into pauses
    .trim();
}

// Standard Indic SpeechRecognition Language Mapping
export const SPEECH_LANG_MAP = {
  en: 'en-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  bn: 'bn-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  as: 'as-IN',
  ur: 'ur-IN',
  raj: 'hi-IN',
  tanglish: 'ta-IN',
};

/**
 * Creates and starts a browser SpeechRecognition session.
 */
export function startVoiceRecognition({
  language = 'auto',
  onStart,
  onResult,
  onError,
  onEnd,
}) {
  if (!isSpeechRecognitionSupported()) {
    onError && onError({ error: 'not-supported', message: 'Speech recognition is not supported in this browser.' });
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Dynamic language mapping
  const langKey = (language || '').toLowerCase().trim();
  let targetLangCode = SPEECH_LANG_MAP[langKey];

  if (!targetLangCode) {
    const matchedOpt = LANGUAGE_OPTIONS.find(
      (opt) => opt.id === langKey || (opt.code && opt.code.toLowerCase() === langKey)
    );
    if (matchedOpt && matchedOpt.code && matchedOpt.code !== 'auto') {
      targetLangCode = matchedOpt.code;
    } else if (langKey && langKey !== 'auto' && /^[a-z]{2,3}(-[A-Z]{2,4})?$/i.test(langKey)) {
      targetLangCode = langKey;
    } else {
      targetLangCode = navigator.language || 'en-IN';
    }
  }

  // Gracefully assign language code with fallback
  try {
    recognition.lang = targetLangCode;
  } catch (err) {
    console.warn('[SATRA SpeechRecognition] Could not assign recognition.lang =', targetLangCode, err);
    recognition.lang = 'en-IN';
  }

  let finalTranscript = '';
  let lastInterim = '';

  recognition.onstart = () => {
    finalTranscript = '';
    lastInterim = '';
    onStart && onStart();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        finalTranscript += text + ' ';
      } else {
        interimTranscript += text;
      }
    }

    lastInterim = interimTranscript;
    const currentDisplayTranscript = (finalTranscript + interimTranscript).trim();

    onResult && onResult({
      finalTranscript: finalTranscript.trim(),
      interimTranscript: interimTranscript.trim(),
      currentDisplayTranscript,
    });
  };

  recognition.onerror = (event) => {
    console.warn('[SATRA SpeechRecognition Error]', event.error);
    onError && onError(event);
  };

  recognition.onend = () => {
    let latestTranscript = finalTranscript.trim();
    if (!latestTranscript && lastInterim.trim()) {
      latestTranscript = lastInterim.trim();
    }
    onEnd && onEnd({ finalTranscript: latestTranscript });
  };

  try {
    recognition.start();
    return recognition;
  } catch (err) {
    console.error('[SATRA SpeechRecognition Start Failed]', err);
    // If it failed because of an unsupported language, retry once with en-IN fallback
    if (recognition.lang !== 'en-IN') {
      try {
        console.warn('[SATRA SpeechRecognition] Retrying with en-IN fallback');
        recognition.lang = 'en-IN';
        recognition.start();
        return recognition;
      } catch (retryErr) {
        onError && onError({ error: 'start-failed', message: retryErr.message });
        return null;
      }
    }
    onError && onError({ error: 'start-failed', message: err.message });
    return null;
  }
}

/**
 * Speaks text using Web Speech API SpeechSynthesis.
 */
export function speakText(text, lang = 'en', onStart, onEnd, onError) {
  if (!isSpeechSynthesisSupported()) {
    onError && onError({ error: 'not-supported' });
    return false;
  }

  window.speechSynthesis.cancel();
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return false;

  const utterance = new SpeechSynthesisUtterance(clean);

  // Auto-detect script if language is auto or generic
  const isTamil = /[\u0B80-\u0BFF]/.test(clean) || lang === 'ta';
  const isHindi = /[\u0900-\u097F]/.test(clean) || lang === 'hi';

  if (isTamil) {
    utterance.lang = 'ta-IN';
  } else if (isHindi) {
    utterance.lang = 'hi-IN';
  } else {
    utterance.lang = 'en-US';
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    const targetPrefix = utterance.lang.slice(0, 2).toLowerCase();
    const matchedVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(targetPrefix));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
  }

  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  utterance.onstart = () => onStart && onStart();
  utterance.onend = () => onEnd && onEnd();
  utterance.onerror = (e) => onError && onError(e);

  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Stops any active speech synthesis output.
 */
export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}
