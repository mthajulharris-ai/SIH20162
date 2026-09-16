import React from 'react';
import { Bot } from 'lucide-react';

/**
 * PERSISTENT FLOATING AI ASSISTANT BUTTON ("Ask SATRA")
 *
 * - Fixed to the viewport at bottom: 24px / right: 24px (never scrolls with content)
 * - The SINGLE AI Assistant entry point of the dashboard (no duplicate chatbot cards)
 * - Command-center styling: circular AI icon with cyan/blue glow + SATRA label
 */
export function FloatingAiButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Open SATRA AI Assistant"
      aria-label="Open SATRA AI Assistant"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '7px 18px 7px 7px',
        borderRadius: '999px',
        background: 'linear-gradient(135deg, rgba(11, 23, 38, 0.96) 0%, rgba(15, 32, 50, 0.96) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.45)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55), 0 0 20px rgba(56, 189, 248, 0.22)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.85)';
        e.currentTarget.style.boxShadow = '0 12px 34px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.4)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.45)';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.55), 0 0 20px rgba(56, 189, 248, 0.22)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Circular AI icon with cyan/blue command-center glow */}
      <span
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)',
          border: '1px solid rgba(125, 211, 252, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(56, 189, 248, 0.45), inset 0 0 8px rgba(255, 255, 255, 0.15)',
          flexShrink: 0,
        }}
      >
        <Bot size={21} color="#FFFFFF" strokeWidth={2.1} />
      </span>

      {/* Compact two-line SATRA label */}
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
          Ask SATRA
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#7DD3FC', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          AI Assistant
        </span>
      </span>
    </button>
  );
}

export default FloatingAiButton;
