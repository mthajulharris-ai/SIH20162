/**
 * SATRA Multilingual Speech & Voice Integration Service
 * Provides SpeechRecognition (voice-to-text) and SpeechSynthesis (text-to-speech)
 * with support for English, Tamil (தமிழ்), Tanglish, and Hindi (हिन्दी).
 */

export const LANGUAGE_OPTIONS = [
  { id: 'auto', label: 'Auto Detect', code: 'auto' },
  { id: 'en', label: 'English', code: 'en-US' },
  { id: 'ta', label: 'Tamil (தமிழ்)', code: 'ta-IN' },
  { id: 'tanglish', label: 'Tanglish', code: 'ta-IN' },
  { id: 'hi', label: 'Hindi (हिन्दी)', code: 'hi-IN' },
];

export const MULTILINGUAL_SUGGESTED_QUESTIONS = {
  auto: [
    'Explain NASA FIRMS',
    'How does SATRA classify fires?',
    "Show today's fire detections",
    'What is a persistent thermal source?',
    'Explain this detection',
    'Why is FRP used in fire detection?',
    'What does the confidence score mean?',
    'Show recent fire alerts',
  ],
  en: [
    'Explain NASA FIRMS',
    'How does SATRA classify fires?',
    "Show today's fire detections",
    'What is a persistent thermal source?',
    'Explain this detection',
    'Why is FRP used in fire detection?',
    'What does the confidence score mean?',
    'Show recent fire alerts',
  ],
  ta: [
    'NASA FIRMS என்றால் என்ன?',
    'SATRA என்ன AI மாதிரியைப் பயன்படுத்துகிறது?',
    'இன்றைய தீ கண்டறிதல்களைக் காட்டு',
    'FRP என்றால் என்ன?',
    'நான்கு வகைப்பாடுகள் என்ன?',
    'SATRA ஒரு கண்டறிதலின் சரியான இடத்தை எவ்வாறு அடையாளம் காண்கிறது?',
    'RAG என்றால் என்ன?',
    'சமீபத்திய விழிப்பூட்டல்கள்',
  ],
  tanglish: [
    'NASA FIRMS na enna?',
    'SATRA enna AI model use pannuthu?',
    'Innaiku ethana fire?',
    'FRP na enna?',
    'Naalu classification classes enna?',
    'SATRA epdi exact location kandupidikkuthu?',
    'RAG na enna?',
    'Recent fire alerts kaatu',
  ],
  hi: [
    'NASA FIRMS क्या है?',
    'सैट्रा कौन सा एआई मॉडल उपयोग करता है?',
    'आज के आग के मामलों को दिखाओ',
    'FRP क्या है?',
    'चार वर्गीकरण श्रेणियां क्या हैं?',
    'सैट्रा किसी पहचान के सटीक स्थान की पहचान कैसे करता है?',
    'RAG क्या है?',
    'हालिया अलर्ट दिखाएं',
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

  // Language mapping
  if (language === 'ta') {
    recognition.lang = 'ta-IN';
  } else if (language === 'hi') {
    recognition.lang = 'hi-IN';
  } else if (language === 'tanglish') {
    recognition.lang = 'ta-IN';
  } else if (language === 'en') {
    recognition.lang = 'en-US';
  } else {
    recognition.lang = navigator.language || 'en-US';
  }

  recognition.onstart = () => {
    onStart && onStart();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const trans = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += trans;
      } else {
        interimTranscript += trans;
      }
    }
    onResult && onResult({ finalTranscript, interimTranscript });
  };

  recognition.onerror = (event) => {
    console.warn('[SATRA SpeechRecognition Error]', event.error);
    onError && onError(event);
  };

  recognition.onend = () => {
    onEnd && onEnd();
  };

  try {
    recognition.start();
    return recognition;
  } catch (err) {
    console.error('[SATRA SpeechRecognition Start Failed]', err);
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
