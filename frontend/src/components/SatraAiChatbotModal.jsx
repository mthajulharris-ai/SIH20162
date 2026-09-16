import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Flame,
  Satellite,
  Radio,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Clock,
  Layers,
} from 'lucide-react';
import { askSatraAi } from '../services/api';

export function SatraAiChatbotModal({ isOpen, onClose, onFocusDetection }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Greetings. I am SATRA AI Satellite Copilot, directly connected to near-real-time NASA FIRMS observations (VIIRS NOAA-20, NOAA-21, Suomi-NPP & MODIS). How may I assist your thermal analysis?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      detections: [],
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = [
    'What are the latest detections?',
    'Show thermal detections in India',
    'What is the highest-risk detection?',
    'How many detections were recorded today?',
  ];

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (queryToSend = null) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || isLoading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await askSatraAi(q);
      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: res.answer || 'Query processed against SATRA database.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detections: res.detections || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `Error contacting SATRA intelligence backend: ${err.message || 'Service temporarily unavailable.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detections: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: '420px',
        maxWidth: 'calc(100vw - 48px)',
        height: '620px',
        maxHeight: 'calc(100vh - 48px)',
        background: 'rgba(11, 23, 38, 0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '16px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.75), 0 0 24px rgba(56, 189, 248, 0.18)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(6, 78, 119, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bot size={18} style={{ color: '#38BDF8' }} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
              SATRA AI SATELLITE COPILOT
            </div>
            <div style={{ fontSize: '10px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
              <span>NASA FIRMS Live Database Grounded</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '6px',
          }}
          title="Close AI Copilot"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Container */}
      <div
        style={{
          flex: 1,
          padding: '14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '88%',
                padding: '10px 14px',
                borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background:
                  m.sender === 'user'
                    ? 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)'
                    : 'rgba(15, 32, 50, 0.75)',
                border:
                  m.sender === 'user'
                    ? '1px solid rgba(56, 189, 248, 0.4)'
                    : '1px solid rgba(56, 189, 248, 0.2)',
                color: '#FFFFFF',
                fontSize: '12px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              {m.text}

              {/* Referenced Detections Carousel / List */}
              {m.detections && m.detections.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ice-blue)', textTransform: 'uppercase' }}>
                    Satellite Hotspots ({m.detections.length})
                  </div>
                  {m.detections.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      style={{
                        background: 'rgba(3, 7, 18, 0.6)',
                        border: '1px solid rgba(56, 189, 248, 0.15)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10.5px',
                      }}
                    >
                      <div>
                        <span style={{ color: '#EF4444', fontWeight: 700 }}>#{d.id}</span>{' '}
                        <span style={{ color: '#FFFFFF' }}>{d.predicted_class || d.classification}</span> &bull;{' '}
                        <span style={{ color: '#94A3B8' }}>{d.source || 'VIIRS'}</span>
                      </div>
                      {onFocusDetection && (
                        <button
                          onClick={() => {
                            onFocusDetection(d);
                            onClose();
                          }}
                          style={{
                            background: 'rgba(56, 189, 248, 0.2)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#38BDF8',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '9.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Focus
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px', padding: '0 4px' }}>
              {m.timestamp}
            </span>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38BDF8', fontSize: '11px', padding: '6px' }}>
            <RefreshCw size={14} className="spin" />
            <span>Querying NASA FIRMS database & SATRA AI engine...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div
        style={{
          padding: '8px 14px',
          background: 'rgba(5, 11, 20, 0.6)',
          borderTop: '1px solid rgba(56, 189, 248, 0.15)',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            onClick={() => handleSend(qp)}
            disabled={isLoading}
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '12px',
              padding: '4px 10px',
              fontSize: '10.5px',
              color: '#38BDF8',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        style={{
          padding: '12px 14px',
          background: 'rgba(3, 7, 18, 0.9)',
          borderTop: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask SATRA AI about real satellite data..."
          disabled={isLoading}
          style={{
            flex: 1,
            background: 'rgba(15, 32, 50, 0.7)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#FFFFFF',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !inputQuery.trim()}
          style={{
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '8px',
            padding: '8px 14px',
            color: '#FFFFFF',
            cursor: isLoading || !inputQuery.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !inputQuery.trim() ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
