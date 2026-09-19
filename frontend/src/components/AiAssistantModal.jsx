import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Trash2,
  X,
  Sparkles,
  HelpCircle,
  Database,
  Radio,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Check,
  Search,
  RefreshCw,
  Cpu,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldAlert,
} from 'lucide-react';
import { sendChatMessage } from '../services/api';
import {
  LANGUAGE_OPTIONS,
  MULTILINGUAL_SUGGESTED_QUESTIONS,
  startVoiceRecognition,
  speakText,
  stopSpeaking,
} from '../services/speech';

export const GREETINGS_BY_LANG = {
  en: "Hello! 👋\n\nI am SATRA AI Assistant — your Satellite Intelligence Copilot.\n\nHow would you like to interact with me?",
  ta: "வணக்கம்! 👋\n\nநான் SATRA AI Assistant — உங்கள் Satellite Intelligence Copilot.\n\nநான் உங்களுக்கு எப்படி உதவலாம்?",
  tanglish: "Vanakkam! 👋\n\nNaan SATRA AI Assistant — ungaloda Satellite Intelligence Copilot.\n\nUngalukku naan epdi help pannanum?",
  hi: "नमस्ते! 👋\n\nमैं SATRA AI Assistant — आपका Satellite Intelligence Copilot हूँ।\n\nमैं आपकी कैसे सहायता कर सकता हूँ?",
  te: "నమస్కారం! 👋\n\nనేను SATRA AI Assistant — మీ Satellite Intelligence Copilot.\n\nనేను మీకు ఎలా సహాయం చేయగలను?",
  kn: "ನಮಸ್ಕಾರ! 👋\n\nನಾನು SATRA AI Assistant — ನಿಮ್ಮ Satellite Intelligence Copilot.\n\nನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
  ml: "നമസ്കാരം! 👋\n\nഞാൻ SATRA AI Assistant — നിങ്ങളുടെ Satellite Intelligence Copilot.\n\nഎനിക്ക് നിങ്ങളെ എങ്ങനെ സഹായിക്കാനാകും?",
  mr: "नमस्कार! 👋\n\nमी SATRA AI Assistant — तुमचा Satellite Intelligence Copilot आहे।\n\nमी तुम्हाला कशी मदत करू शकतो?",
  gu: "નમસ્તે! 👋\n\nહું SATRA AI Assistant — તમારો Satellite Intelligence Copilot છું.\n\nહું તમને કેવી રીતે મદદ કરી શકું?",
  bn: "নমস্কার! 👋\n\nআমি SATRA AI Assistant — আপনার Satellite Intelligence Copilot।\n\nআমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! 👋\n\nਮੈਂ SATRA AI Assistant ਹਾਂ — ਤੁਹਾਡਾ Satellite Intelligence Copilot।\n\nਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
  or: "ନମସ୍କାର! 👋\n\nମୁଁ SATRA AI Assistant — ଆପଣଙ୍କ Satellite Intelligence Copilot।\n\nମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
  as: "নমস্কাৰ! 👋\n\nমই SATRA AI Assistant — আপোনাৰ Satellite Intelligence Copilot।\n\nমই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ?",
  ur: "سلام! 👋\n\nمیں SATRA AI Assistant ہوں — آپ کا Satellite Intelligence Copilot۔\n\nمیں آپ کی کیا مدد کر سکتا ہوں؟",
  raj: "खम्मा घणी! 👋\n\nम्हे SATRA AI Assistant हाँ — आपरो Satellite Intelligence Copilot।\n\nम्हे आपरी काईं मदद कर सकाँ?",
  auto: "Hello! 👋\n\nI am SATRA AI Assistant — your Satellite Intelligence Copilot.\n\nHow would you like to interact with me?",
};

export function PreferredLanguageSelector({
  preferredLanguage,
  onSelectLanguage,
  isOpen,
  onToggle,
  onClose,
}) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const activeOption =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];
  const activeLabel =
    activeOption.native && activeOption.native !== activeOption.label
      ? `${activeOption.native} (${activeOption.label})`
      : activeOption.label;

  const filtered = LANGUAGE_OPTIONS.filter((lang) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      lang.label.toLowerCase().includes(q) ||
      (lang.native && lang.native.toLowerCase().includes(q)) ||
      lang.id.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', marginTop: '12px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          marginBottom: '6px',
          letterSpacing: '0.04em',
        }}
      >
        Preferred Language
      </div>

      {/* Single clickable dropdown field */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Select preferred language"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          borderRadius: '8px',
          background: 'rgba(11, 23, 38, 0.85)',
          border: isOpen
            ? '1px solid var(--primary-cyan)'
            : '1px solid rgba(69, 200, 245, 0.35)',
          boxShadow: isOpen
            ? '0 0 12px rgba(69, 200, 245, 0.25)'
            : '0 2px 6px rgba(0, 0, 0, 0.2)',
          color: 'var(--text-heading)',
          fontSize: '12.5px',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary-cyan)';
          e.currentTarget.style.boxShadow = '0 0 10px rgba(69, 200, 245, 0.25)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'rgba(69, 200, 245, 0.35)';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>{activeOption.flag || '🌐'}</span>
          <span style={{ fontWeight: 600 }}>{activeLabel}</span>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: 'var(--primary-cyan)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Floating Popover / Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: '260px',
            background: '#0B1726',
            border: '1px solid rgba(69, 200, 245, 0.45)',
            borderRadius: '10px',
            boxShadow: '0 14px 36px rgba(0, 0, 0, 0.85), 0 0 18px rgba(69, 200, 245, 0.22)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {/* Search Field */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid rgba(69, 200, 245, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.7)',
            }}
          >
            <Search size={13} style={{ color: 'var(--primary-cyan)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search language..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '12px',
                color: '#FFFFFF',
              }}
            />
          </div>

          {/* Scrollable Language List */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: '4px',
              maxHeight: '210px',
            }}
          >
            {filtered.map((lang) => {
              const isSelected = lang.id === preferredLanguage;
              const display =
                lang.native && lang.native !== lang.label
                  ? `${lang.native} (${lang.label})`
                  : lang.label;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => {
                    onSelectLanguage(lang.id);
                    setSearch('');
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? 'rgba(69, 200, 245, 0.18)' : 'transparent',
                    color: isSelected ? 'var(--primary-cyan)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.color = '#FFFFFF';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px' }}>{lang.flag || '🌐'}</span>
                    <span>{display}</span>
                  </div>
                  {isSelected && <Check size={13} style={{ color: 'var(--primary-cyan)' }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                }}
              >
                No matching languages
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AiAssistantModal({ isOpen, onClose, onClearHistory }) {
  const [preferredLanguage, setPreferredLanguage] = useState(() => {
    try {
      return localStorage.getItem('satra_preferred_language') || 'en';
    } catch {
      return 'en';
    }
  });
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('satra_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Unable to load chat history:', e);
    }
    const initialLang = localStorage.getItem('satra_preferred_language') || 'en';
    return [
      {
        id: 'welcome',
        role: 'assistant',
        isWelcome: true,
        content: GREETINGS_BY_LANG[initialLang] || GREETINGS_BY_LANG.en,
        sources: ['SATRA Operational Guidelines'],
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('auto');
  const [isListening, setIsListening] = useState(false);
  const [listeningStatus, setListeningStatus] = useState('');
  const [activeSpeechId, setActiveSpeechId] = useState(null);
  const [speechError, setSpeechError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceTranscriptRef = useRef('');
  const voiceInterimRef = useRef('');
  const isVoiceSubmittingRef = useRef(false);

  // When user selects a preferred language
  const handleSelectLanguage = (langId) => {
    setPreferredLanguage(langId);
    try {
      localStorage.setItem('satra_preferred_language', langId);
    } catch (e) {
      console.warn('Unable to save preferred language:', e);
    }
    setIsLangDropdownOpen(false);

    // If chat has only the welcome greeting, update its text naturally to the selected language
    if (messages.length <= 1) {
      setMessages([
        {
          id: 'welcome_' + Date.now(),
          role: 'assistant',
          isWelcome: true,
          content: GREETINGS_BY_LANG[langId] || GREETINGS_BY_LANG.en,
          sources: ['SATRA Operational Guidelines'],
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem('satra_chat_history', JSON.stringify(messages));
    } catch (e) {
      console.warn('Unable to save chat history:', e);
    }
  }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Auto focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Stop speech synthesis and voice recognition when modal closes or unmounts
  useEffect(() => {
    return () => {
      stopSpeaking();
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // no-op
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend) => {
    const query = (typeof textToSend === 'string' ? textToSend : inputMessage).trim();
    if (!query || isLoading) {
      isVoiceSubmittingRef.current = false;
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
      setIsListening(false);
      setListeningStatus('');
    }
    voiceTranscriptRef.current = '';
    voiceInterimRef.current = '';
    isVoiceSubmittingRef.current = false;

    const userMsgId = 'user_' + Date.now();
    const newUserMsg = {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Build lightweight conversational history
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Pass user's preferredLanguage as default/preference;
      // the backend RAG pipeline strictly prioritizes current user message language
      const res = await sendChatMessage(query, historyPayload, preferredLanguage || 'auto');
      if (res.language) {
        setDetectedLanguage(res.language);
      }
      const assistantMsg = {
        id: 'ai_' + Date.now(),
        role: 'assistant',
        content: res.response || "No response received from SATRA AI service.",
        sources: res.sources || ['SATRA Domain Engine'],
        data_used: res.data_used || { rag: true, live_data: false },
        language: res.language || 'auto',
        timestamp: res.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = {
        id: 'ai_err_' + Date.now(),
        role: 'assistant',
        content:
          "**Connection Alert**: Unable to connect to the SATRA AI service. Please verify that the FastAPI backend server is online at `http://127.0.0.1:8000`.",
        sources: ['System Diagnostic'],
        isError: true,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      isVoiceSubmittingRef.current = false;
    }
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      setIsListening(false);
      setListeningStatus('');
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
      return;
    }

    // Reset voice transcript accumulator before starting a new recording
    voiceTranscriptRef.current = '';
    isVoiceSubmittingRef.current = false;
    setSpeechError(null);
    setIsListening(true);
    setListeningStatus('Listening...');
    setInputMessage('');

    // Dynamic recognition language selection
    const activeSpeechLang =
      preferredLanguage && preferredLanguage !== 'auto'
        ? preferredLanguage
        : (detectedLanguage && detectedLanguage !== 'auto' ? detectedLanguage : 'en');

    recognitionRef.current = startVoiceRecognition({
      language: activeSpeechLang,
      onStart: () => {
        setListeningStatus('Recording...');
      },
      onResult: ({ finalTranscript, interimTranscript, currentDisplayTranscript }) => {
        // Always store latest available complete transcript
        const latest = (finalTranscript || currentDisplayTranscript || '').trim();
        if (latest) {
          voiceTranscriptRef.current = latest;
        }

        // Live visual display in input box (do NOT submit yet)
        if (currentDisplayTranscript) {
          setInputMessage(currentDisplayTranscript);
          setListeningStatus(interimTranscript ? 'Listening...' : 'Processing voice...');
        }
      },
      onError: (err) => {
        setIsListening(false);
        setListeningStatus('');
        voiceTranscriptRef.current = '';
        isVoiceSubmittingRef.current = false;
        if (err.error === 'not-allowed') {
          setSpeechError('Microphone permission denied. Please allow microphone access in your browser.');
        } else if (err.error === 'no-speech') {
          setSpeechError('No speech detected. Please try speaking again.');
        } else if (err.error === 'not-supported') {
          setSpeechError('Speech recognition is not supported in this browser. Please type your query.');
        } else {
          setSpeechError(`Voice input issue: ${err.message || err.error}`);
        }
        setTimeout(() => setSpeechError(null), 6000);
      },
      onEnd: ({ finalTranscript: engineFinal } = {}) => {
        setIsListening(false);
        setListeningStatus('');

        // ALWAYS compute the latest local transcript synchronously
        const latestTranscript = (engineFinal || voiceTranscriptRef.current || '').trim();

        // Clear voice transcript ref immediately so it CANNOT be reused by the next recording
        voiceTranscriptRef.current = '';

        // Submit exactly ONCE if non-empty
        if (latestTranscript && !isVoiceSubmittingRef.current) {
          isVoiceSubmittingRef.current = true;
          setInputMessage(latestTranscript);
          handleSendMessage(latestTranscript);
        }
      },
    });
  };

  const handleToggleSpeak = (msgId, text, msgLang) => {
    if (activeSpeechId === msgId) {
      stopSpeaking();
      setActiveSpeechId(null);
      return;
    }

    stopSpeaking();
    setActiveSpeechId(msgId);
    speakText(
      text,
      msgLang || detectedLanguage || 'en',
      () => setActiveSpeechId(msgId),
      () => setActiveSpeechId(null),
      () => setActiveSpeechId(null)
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    const welcome = {
      id: 'welcome_' + Date.now(),
      role: 'assistant',
      isWelcome: true,
      content: GREETINGS_BY_LANG[preferredLanguage] || GREETINGS_BY_LANG.en,
      sources: ['SATRA Operational Guidelines'],
      timestamp: new Date().toISOString(),
    };
    setMessages([welcome]);
    setDetectedLanguage('auto');
    try {
      localStorage.removeItem('satra_chat_history');
    } catch (e) {
      console.warn('Unable to clear local storage:', e);
    }
    if (onClearHistory) onClearHistory();
  };

  // Helper to format basic markdown-style text into clean HTML elements
  const renderFormattedContent = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <h4
            key={idx}
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--primary-cyan)',
              margin: '10px 0 4px 0',
              letterSpacing: '0.02em',
            }}
          >
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3
            key={idx}
            style={{
              fontSize: '14.5px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              margin: '12px 0 6px 0',
            }}
          >
            {line.replace('## ', '')}
          </h3>
        );
      }

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().substring(2);
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '12.5px',
              lineHeight: '1.5',
              margin: '3px 0',
              paddingLeft: '6px',
            }}
          >
            <span style={{ color: 'var(--primary-cyan)', fontWeight: 700 }}>•</span>
            <span dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(bulletText) }} />
          </div>
        );
      }

      // Numbered lists
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '12.5px',
              lineHeight: '1.5',
              margin: '3px 0',
              paddingLeft: '6px',
            }}
          >
            <span
              style={{
                color: 'var(--primary-cyan)',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                minWidth: '16px',
              }}
            >
              {numMatch[1]}.
            </span>
            <span dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(numMatch[2]) }} />
          </div>
        );
      }

      // Empty lines
      if (!line.trim()) {
        return <div key={idx} style={{ height: '6px' }} />;
      }

      // Normal paragraph lines
      return (
        <p
          key={idx}
          style={{
            fontSize: '12.5px',
            lineHeight: '1.55',
            margin: '3px 0',
          }}
          dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(line) }}
        />
      );
    });
  };

  const parseInlineMarkdown = (raw) => {
    if (!raw) return '';
    let parsed = raw
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Inline code
      .replace(/`(.*?)`/g, '<code style="background: rgba(69,200,245,0.12); color: var(--primary-cyan); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; font-family: var(--font-mono);">$1</code>')
      // Italics
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    return parsed;
  };
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9500,
        pointerEvents: 'none',
      }}
    >
      {/* Dim backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(2, 6, 15, 0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          pointerEvents: 'auto',
        }}
      />
      {/* Right-side SATRA AI Assistant slide-over panel */}
      <div
        className="satra-ai-panel"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(88vw, 420px)',
          height: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-color)',
          borderRadius: 0,
          boxShadow: '-18px 0 44px rgba(0, 0, 0, 0.55), -4px 0 18px rgba(69, 200, 245, 0.12)',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
          pointerEvents: 'auto',
          transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Assistant Header - Section 1: Compact, Clean, Professional */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--panel-header-bg)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(69, 200, 245, 0.2) 0%, rgba(2, 132, 199, 0.3) 100%)',
                border: '1px solid var(--primary-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-cyan)',
                flexShrink: 0,
              }}
            >
              <Bot size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.02em' }}>
                  SATRA AI Assistant
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    padding: '1.5px 6px',
                    borderRadius: '4px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                  }}
                >
                  ONLINE
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.01em' }}>
                Satellite Intelligence Copilot
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handleClearChat}
              className="satra-icon-btn"
              title="Clear Conversation History"
              style={{ padding: '6px' }}
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="satra-icon-btn"
              title="Close AI Assistant"
              style={{ padding: '6px' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Message Feed Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: 'var(--bg-primary)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    padding: '0 4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isUser ? 'var(--ice-blue)' : 'var(--primary-cyan)',
                    }}
                  >
                    {isUser ? 'OPERATOR' : 'SATRA AI'}
                  </span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!isUser && (
                    <button
                      onClick={() => handleToggleSpeak(m.id, m.content, m.language)}
                      className="satra-icon-btn"
                      style={{
                        padding: '1px 5px',
                        background: activeSpeechId === m.id ? 'rgba(69, 200, 245, 0.2)' : 'transparent',
                        color: activeSpeechId === m.id ? 'var(--primary-cyan)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '9.5px',
                        marginLeft: '3px',
                      }}
                      title={activeSpeechId === m.id ? 'Stop speaking' : 'Read response aloud'}
                    >
                      {activeSpeechId === m.id ? (
                        <VolumeX size={11} style={{ color: 'var(--primary-cyan)' }} />
                      ) : (
                        <Volume2 size={11} />
                      )}
                      <span>{activeSpeechId === m.id ? 'Stop' : 'Listen'}</span>
                    </button>
                  )}
                </div>

                <div
                  style={{
                    maxWidth: isUser ? '85%' : '92%',
                    padding: '12px 16px',
                    borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isUser
                      ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)'
                      : 'var(--panel-secondary)',
                    color: isUser ? '#FFFFFF' : 'var(--text-primary)',
                    border: isUser
                      ? '1px solid rgba(69, 200, 245, 0.35)'
                      : '1px solid var(--border-color)',
                    boxShadow: isUser
                      ? '0 2px 8px rgba(2, 132, 199, 0.25)'
                      : '0 1px 4px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  {isUser ? (
                    <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </div>
                  ) : (
                    <div>
                      {/* Data Provenance Flags */}
                      {m.data_used && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          {m.data_used.live_data && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '9.5px',
                                fontWeight: 600,
                                padding: '1px 7px',
                                borderRadius: '10px',
                                background: 'rgba(34, 197, 94, 0.12)',
                                color: '#22c55e',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                              Based on current SATRA data
                            </span>
                          )}
                          {m.data_used.rag && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '9.5px',
                                fontWeight: 600,
                                padding: '1px 7px',
                                borderRadius: '10px',
                                background: 'rgba(69, 200, 245, 0.12)',
                                color: 'var(--primary-cyan)',
                                border: '1px solid rgba(69, 200, 245, 0.3)',
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary-cyan)' }} />
                              Based on SATRA knowledge base
                            </span>
                          )}
                        </div>
                      )}

                      {renderFormattedContent(m.content)}

                      {/* Initial Greeting & Preferred Language UI (Sections 2, 3, 22, 24, 25) */}
                      {(m.isWelcome || messages[0]?.id === m.id) && (
                        <PreferredLanguageSelector
                          preferredLanguage={preferredLanguage}
                          onSelectLanguage={handleSelectLanguage}
                          isOpen={isLangDropdownOpen}
                          onToggle={() => setIsLangDropdownOpen((prev) => !prev)}
                          onClose={() => setIsLangDropdownOpen(false)}
                        />
                      )}

                      {/* Sources Section - only for subsequent responses with sources */}
                      {!m.isWelcome && messages[0]?.id !== m.id && m.sources && m.sources.length > 0 && (
                        <div
                          style={{
                            marginTop: '10px',
                            paddingTop: '6px',
                            borderTop: '1px solid var(--border-subtle)',
                            fontSize: '10.5px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              marginBottom: '4px',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Database size={10} style={{ color: 'var(--primary-cyan)' }} />
                            <span>Sources:</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '4px' }}>
                            {m.sources.map((src, sIdx) => {
                              const title = typeof src === 'object' && src !== null
                                ? `${src.document || 'SATRA Knowledge Base'}${src.section ? ` — ${src.section}` : ''}`
                                : String(src);
                              return (
                                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ color: 'var(--primary-cyan)' }}>•</span>
                                  <span
                                    style={{
                                      color: 'var(--ice-blue)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '10px',
                                    }}
                                  >
                                    {title}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: 'rgba(69, 200, 245, 0.12)',
                  border: '1px solid var(--primary-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-cyan)',
                }}
              >
                <Bot size={13} />
              </div>
              <div
                style={{
                  padding: '8px 14px',
                  borderRadius: '12px',
                  background: 'var(--panel-secondary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Analyzing telemetry & querying domain models...
                </span>
                <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--primary-cyan)' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Questions Chips */}
        {messages.length <= 3 && (
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {/* Subtle compact preference indicator when conversation is active (Section 22) */}
            {messages.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '4px',
                  marginBottom: '2px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Preferred:</span>
                  <span style={{ color: 'var(--primary-cyan)', fontWeight: 600 }}>
                    {(() => {
                      const opt =
                        LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) ||
                        LANGUAGE_OPTIONS[0];
                      return `${opt.flag || '🌐'} ${
                        opt.native && opt.native !== opt.label
                          ? `${opt.native} (${opt.label})`
                          : opt.label
                      }`;
                    })()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-cyan)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Change
                </button>
              </div>
            )}
            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles size={11} style={{ color: 'var(--primary-cyan)' }} />
              Suggested SATRA Queries
            </div>
            <div
              style={{
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                paddingBottom: '4px',
                scrollbarWidth: 'none',
              }}
            >
              {(
                MULTILINGUAL_SUGGESTED_QUESTIONS[detectedLanguage] ||
                MULTILINGUAL_SUGGESTED_QUESTIONS[preferredLanguage] ||
                MULTILINGUAL_SUGGESTED_QUESTIONS.en
              )
                .slice(0, 5)
                .map((q, qIdx) => (
                <button
                  key={qIdx}
                  onClick={() => handleSendMessage(q)}
                  disabled={isLoading}
                  style={{
                    flexShrink: 0,
                    padding: '5px 10px',
                    borderRadius: '16px',
                    background: 'var(--panel-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary-cyan)';
                    e.currentTarget.style.color = 'var(--text-heading)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice recording status or error feedback */}
        {(isListening || listeningStatus || speechError) && (
          <div
            style={{
              padding: '6px 16px',
              background: speechError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(69, 200, 245, 0.1)',
              borderTop: speechError ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(69, 200, 245, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: speechError ? '#ef4444' : 'var(--primary-cyan)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {speechError ? (
                <ShieldAlert size={13} />
              ) : (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--primary-cyan)',
                    display: 'inline-block',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
              )}
              <span>{speechError || listeningStatus || 'Listening for speech...'}</span>
            </div>
            {isListening && (
              <button
                onClick={toggleVoiceRecognition}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '10.5px',
                  textDecoration: 'underline',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Bottom Input Box */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--panel-header-bg)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={toggleVoiceRecognition}
            className="satra-icon-btn"
            disabled={isLoading}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: isListening ? '1px solid #ef4444' : '1px solid var(--border-color)',
              background: isListening ? 'rgba(239, 68, 68, 0.18)' : 'var(--panel-secondary)',
              color: isListening ? '#ef4444' : 'var(--primary-cyan)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            title={isListening ? 'Stop recording voice' : 'Voice Input (Speak question)'}
          >
            {isListening ? <MicOff size={15} className="animate-pulse" /> : <Mic size={15} />}
          </button>

          <input
            ref={inputRef}
            type="text"
            className="satra-search-input"
            placeholder={(() => {
              const lang =
                detectedLanguage && detectedLanguage !== 'auto'
                  ? detectedLanguage
                  : preferredLanguage;
              if (lang === 'ta') return 'SATRA AI-யிடம் கேளுங்கள்...';
              if (lang === 'tanglish') return 'SATRA AI kitta kelunga...';
              if (lang === 'hi') return 'SATRA AI से पूछें...';
              if (lang === 'te') return 'SATRA AI ని అడగండి...';
              if (lang === 'kn') return 'SATRA AI ಅನ್ನು ಕೇಳಿ...';
              if (lang === 'ml') return 'SATRA AI-യോട് ചോദിക്കൂ...';
              if (lang === 'mr') return 'SATRA AI ला विचारा...';
              if (lang === 'gu') return 'SATRA AI ને પૂછો...';
              if (lang === 'bn') return 'SATRA AI কে জিজ্ঞাসা করুন...';
              if (lang === 'pa') return 'SATRA AI ਨੂੰ ਪੁੱਛੋ...';
              if (lang === 'ur') return 'SATRA AI سے پوچھیں...';
              return 'Ask SATRA anything...';
            })()}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg, var(--bg-primary))',
              color: 'var(--text-heading)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || isLoading}
            className="btn-primary"
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: !inputMessage.trim() || isLoading ? 'not-allowed' : 'pointer',
              opacity: !inputMessage.trim() || isLoading ? 0.5 : 1,
            }}
          >
            <span>Send</span>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

