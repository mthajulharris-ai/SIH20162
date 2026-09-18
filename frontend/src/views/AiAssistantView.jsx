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
} from 'lucide-react';
import { sendChatMessage } from '../services/api';

const DEFAULT_SUGGESTED_QUESTIONS = [
  'Explain NASA FIRMS',
  'How does SATRA classify fires?',
  "Show today's fire detections",
  'What is a persistent thermal source?',
  'Explain this detection',
  'Why is FRP used in fire detection?',
  'What does the confidence score mean?',
  'What is the difference between an industrial fire and a forest fire?',
  'Show recent fire alerts',
];

export function AiAssistantView({ detections = [] }) {
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
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Welcome to the **SATRA Domain AI Assistant**.\n\nI am your specialized intelligence copilot for **Industrial Fire Detection**, **Persistent Thermal Sources**, **NASA FIRMS** satellite constellations (VIIRS 375m & MODIS 1km), and our **v2.0 Soft-Voting ML Ensemble**.\n\nAsk any question or pick one of the recommended topics below to begin.",
        sources: ['SATRA Operational Guidelines'],
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

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

      const res = await sendChatMessage(query, historyPayload);
      const assistantMsg = {
        id: 'ai_' + Date.now(),
        role: 'assistant',
        content: res.response || "No response received from SATRA AI service.",
        sources: res.sources || ['SATRA Domain Engine'],
        data_used: res.data_used || { rag: true, live_data: false },
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
    }
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
      content:
        "Conversation cleared.\n\nAsk me anything about **Industrial Fire Detection**, **NASA FIRMS**, **FRP Calculations**, **AI Classification Models**, or **Live System Telemetry**.",
      sources: ['SATRA Operational Guidelines'],
      timestamp: new Date().toISOString(),
    };
    setMessages([welcome]);
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                SATRA AI Assistant
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
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
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(69, 200, 245, 0.12)',
                  color: 'var(--primary-cyan)',
                  border: '1px solid rgba(69, 200, 245, 0.25)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                v2.0-SCI ENSEMBLE
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Domain-Specific Intelligence Copilot for Industrial Fire & Thermal Anomaly Analysis
            </div>
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

                      {/* Sources Metadata Citation Deck */}
                      {m.sources && m.sources.length > 0 && (
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
              padding: '10px 18px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
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
              Suggested SATRA Queries
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
              {DEFAULT_SUGGESTED_QUESTIONS.map((q, qIdx) => (
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

        {/* Bottom Input Box */}
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--panel-header-bg)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="satra-search-input"
            placeholder="Ask about industrial fires, NASA FIRMS, FRP, ML ensemble, or live database..."
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
            <span>Send</span>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

