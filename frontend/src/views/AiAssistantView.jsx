import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  RefreshCw,
  Database,
  ShieldAlert,
  Flame,
  Info,
  Layers,
  Cpu,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { sendChatMessage } from '../services/api';
import {
  LANGUAGE_OPTIONS,
  MULTILINGUAL_SUGGESTED_QUESTIONS,
  CHATBOT_UI_TRANSLATIONS,
  startVoiceRecognition,
  speakText,
  stopSpeaking,
} from '../services/speech';
import {
  PreferredLanguageSelector,
  GREETINGS_BY_LANG,
} from '../components/AiAssistantModal';

export function AiAssistantView({ detections = [] }) {
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

  // Dynamic active language for UI labels, placeholder, and suggested questions
  const activeUiLang =
    preferredLanguage && preferredLanguage !== 'auto'
      ? preferredLanguage
      : (detectedLanguage && detectedLanguage !== 'auto' ? detectedLanguage : 'en');
  const t = CHATBOT_UI_TRANSLATIONS[activeUiLang] || CHATBOT_UI_TRANSLATIONS.en;

  const handleSelectLanguage = (langId) => {
    setPreferredLanguage(langId);
    try {
      localStorage.setItem('satra_preferred_language', langId);
    } catch (e) {
      console.warn('Unable to save preferred language:', e);
    }
    setIsLangDropdownOpen(false);

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

  useEffect(() => {
    try {
      localStorage.setItem('satra_chat_history', JSON.stringify(messages));
    } catch (e) {
      console.warn('Unable to save chat history:', e);
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // no-op
      }
    };
  }, []);

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
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

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
  };

  const renderFormattedContent = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4
            key={idx}
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--primary-cyan)',
              margin: '12px 0 6px 0',
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
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              margin: '14px 0 8px 0',
            }}
          >
            {line.replace('## ', '')}
          </h3>
        );
      }

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().substring(2);
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '13px',
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

      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: '13px',
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

      if (!line.trim()) {
        return <div key={idx} style={{ height: '6px' }} />;
      }

      return (
        <p
          key={idx}
          style={{
            fontSize: '13px',
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
    return raw
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code style="background: rgba(69,200,245,0.12); color: var(--primary-cyan); padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: var(--font-mono);">$1</code>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '16px', maxWidth: '1100px' }}>
      {/* Top Header Card */}
      <div
        className="card-panel"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 0,
          background: 'var(--panel-header-bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(69, 200, 245, 0.2) 0%, rgba(2, 132, 199, 0.35) 100%)',
              border: '1px solid var(--primary-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-cyan)',
            }}
          >
            <Bot size={22} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '0.02em' }}>
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

        <button
          onClick={handleClearChat}
          className="btn-secondary"
          style={{ gap: '6px', padding: '6px 12px', fontSize: '12px' }}
          title="Clear Conversation History"
        >
          <Trash2 size={13} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Main Chat Feed Container */}
      <div
        className="card-panel"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          marginBottom: 0,
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}
      >
        {/* Messages Scroll Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
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
                      fontSize: '10.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isUser ? 'var(--ice-blue)' : 'var(--primary-cyan)',
                    }}
                  >
                    {isUser ? 'OPERATOR' : 'SATRA AI'}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!isUser && (
                    <button
                      onClick={() => handleToggleSpeak(m.id, m.content, m.language)}
                      className="satra-icon-btn"
                      style={{
                        padding: '2px 6px',
                        background: activeSpeechId === m.id ? 'rgba(69, 200, 245, 0.2)' : 'transparent',
                        color: activeSpeechId === m.id ? 'var(--primary-cyan)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        marginLeft: '4px',
                      }}
                      title={activeSpeechId === m.id ? 'Stop speaking' : 'Read response aloud'}
                    >
                      {activeSpeechId === m.id ? (
                        <VolumeX size={12} style={{ color: 'var(--primary-cyan)' }} />
                      ) : (
                        <Volume2 size={12} />
                      )}
                      <span>{activeSpeechId === m.id ? 'Stop' : 'Listen'}</span>
                    </button>
                  )}
                </div>

                <div
                  style={{
                    maxWidth: isUser ? '80%' : '90%',
                    padding: '14px 18px',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: isUser
                      ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)'
                      : 'var(--panel-secondary)',
                    color: isUser ? '#FFFFFF' : 'var(--text-primary)',
                    border: isUser
                      ? '1px solid rgba(69, 200, 245, 0.35)'
                      : '1px solid var(--border-color)',
                    boxShadow: isUser
                      ? '0 2px 8px rgba(2, 132, 199, 0.25)'
                      : '0 1px 4px rgba(0, 0, 0, 0.08)',
                  }}
                >
                  {isUser ? (
                    <div style={{ fontSize: '13.5px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </div>
                  ) : (
                    <div>
                      {/* Data Provenance Flags */}
                      {m.data_used && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          {m.data_used.live_data && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(34, 197, 94, 0.12)',
                                color: '#22c55e',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                              Based on current SATRA data
                            </span>
                          )}
                          {m.data_used.rag && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(69, 200, 245, 0.12)',
                                color: 'var(--primary-cyan)',
                                border: '1px solid rgba(69, 200, 245, 0.3)',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-cyan)' }} />
                              Based on SATRA knowledge base
                            </span>
                          )}
                        </div>
                      )}

                      {renderFormattedContent(m.content)}

                      {/* Initial Greeting & Preferred Language UI */}
                      {(m.isWelcome || messages[0]?.id === m.id) && (
                        <PreferredLanguageSelector
                          preferredLanguage={preferredLanguage}
                          onSelectLanguage={handleSelectLanguage}
                          isOpen={isLangDropdownOpen}
                          onToggle={() => setIsLangDropdownOpen((prev) => !prev)}
                          onClose={() => setIsLangDropdownOpen(false)}
                          translations={t}
                        />
                      )}

                      {/* Sources Metadata Citation Deck - only for subsequent responses */}
                      {!m.isWelcome && messages[0]?.id !== m.id && m.sources && m.sources.length > 0 && (
                        <div
                          style={{
                            marginTop: '12px',
                            paddingTop: '8px',
                            borderTop: '1px solid var(--border-subtle)',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              marginBottom: '5px',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            <Database size={11} style={{ color: 'var(--primary-cyan)' }} />
                            <span>Sources:</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '4px' }}>
                            {m.sources.map((src, sIdx) => {
                              const title = typeof src === 'object' && src !== null
                                ? `${src.document || 'SATRA Knowledge Base'}${src.section ? ` — ${src.section}` : ''}`
                                : String(src);
                              return (
                                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: 'var(--primary-cyan)' }}>•</span>
                                  <span
                                    style={{
                                      color: 'var(--ice-blue)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '10.5px',
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

          {/* Loading Indicator */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '8px',
                  background: 'rgba(69, 200, 245, 0.12)',
                  border: '1px solid var(--primary-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-cyan)',
                }}
              >
                <Bot size={15} />
              </div>
              <div
                style={{
                  padding: '9px 16px',
                  borderRadius: '12px',
                  background: 'var(--panel-secondary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Analyzing telemetry & querying domain models...
                </span>
                <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--primary-cyan)' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Questions Chips */}
        {messages.length <= 4 && (
          <div
            style={{
              padding: '10px 20px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* Subtle compact preference indicator when conversation is active */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{t.preferredPrefix}</span>
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
                  {t.change}
                </button>
              </div>
            )}
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles size={12} style={{ color: 'var(--primary-cyan)' }} />
              {t.suggestedQueries}
            </div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px',
                scrollbarWidth: 'none',
              }}
            >
              {(
                MULTILINGUAL_SUGGESTED_QUESTIONS[activeUiLang] ||
                MULTILINGUAL_SUGGESTED_QUESTIONS.en
              ).map((q, qIdx) => (
                <button
                  key={qIdx}
                  onClick={() => handleSendMessage(q)}
                  disabled={isLoading}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: '16px',
                    background: 'var(--panel-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontSize: '11.5px',
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
              padding: '7px 18px',
              background: speechError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(69, 200, 245, 0.1)',
              borderTop: speechError ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(69, 200, 245, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
              color: speechError ? '#ef4444' : 'var(--primary-cyan)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {speechError ? (
                <ShieldAlert size={14} />
              ) : (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--primary-cyan)',
                    display: 'inline-block',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
              )}
              <span>{speechError || listeningStatus || t.listeningForSpeech || 'Listening for speech...'}</span>
            </div>
            {isListening && (
              <button
                onClick={toggleVoiceRecognition}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textDecoration: 'underline',
                }}
              >
                {t.cancel}
              </button>
            )}
          </div>
        )}

        {/* Bottom Input Box */}
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--panel-header-bg)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <button
            onClick={toggleVoiceRecognition}
            className="satra-icon-btn"
            disabled={isLoading}
            style={{
              padding: '10px',
              borderRadius: '8px',
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
            {isListening ? <MicOff size={16} className="animate-pulse" /> : <Mic size={16} />}
          </button>

          <input
            ref={inputRef}
            type="text"
            className="satra-search-input"
            placeholder={t.inputPlaceholder}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '11px 16px',
              fontSize: '13.5px',
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
              padding: '11px 20px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: !inputMessage.trim() || isLoading ? 'not-allowed' : 'pointer',
              opacity: !inputMessage.trim() || isLoading ? 0.5 : 1,
            }}
          >
            <span>{t.send}</span>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

