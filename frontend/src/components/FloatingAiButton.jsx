import React, { useRef, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

/**
 * Global position store to keep the dragged position persistent across
 * component mounts/unmounts during the user's dashboard session.
 */
let globalFloatingButtonPos = null;

/**
 * PERSISTENT FLOATING AI ASSISTANT BUTTON ("Ask SATRA")
 *
 * - Draggable/movable anywhere within the visible viewport using pointer events.
 * - Smooth drag without jumping; clamps safely inside viewport boundaries.
 * - Single click opens SATRA AI Assistant without accidental triggers during drag.
 * - Position is maintained across opens/closes of the AI Assistant modal.
 */
export function FloatingAiButton({ onClick }) {
  const buttonRef = useRef(null);
  const [pos, setPos] = useState(globalFloatingButtonPos);
  const [isDraggingState, setIsDraggingState] = useState(false);

  const dragInfoRef = useRef({
    isDragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    initLeft: 0,
    initTop: 0,
    pointerId: null,
  });

  // Clamp position within viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!buttonRef.current || !globalFloatingButtonPos) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - rect.width);
      const maxY = Math.max(0, window.innerHeight - rect.height);
      const clampedX = Math.max(0, Math.min(globalFloatingButtonPos.x, maxX));
      const clampedY = Math.max(0, Math.min(globalFloatingButtonPos.y, maxY));
      globalFloatingButtonPos = { x: clampedX, y: clampedY };
      setPos({ x: clampedX, y: clampedY });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e) => {
    // Only primary button
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    dragInfoRef.current = {
      isDragging: true,
      hasMoved: false,
      startX: e.clientX,
      startY: e.clientY,
      initLeft: rect.left,
      initTop: rect.top,
      pointerId: e.pointerId,
    };

    try {
      buttonRef.current.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
  };

  const handlePointerMove = (e) => {
    const info = dragInfoRef.current;
    if (!info.isDragging) return;

    const deltaX = e.clientX - info.startX;
    const deltaY = e.clientY - info.startY;

    // Movement threshold before classifying as a drag
    if (!info.hasMoved && Math.hypot(deltaX, deltaY) > 4) {
      info.hasMoved = true;
      setIsDraggingState(true);
    }

    if (!info.hasMoved) return;

    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const rawX = info.initLeft + deltaX;
    const rawY = info.initTop + deltaY;

    // Viewport clamping
    const minX = 0;
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const minY = 0;
    const maxY = Math.max(0, window.innerHeight - rect.height);

    const clampedX = Math.max(minX, Math.min(rawX, maxX));
    const clampedY = Math.max(minY, Math.min(rawY, maxY));

    // Direct style update for high performance without react re-renders during movement
    btn.style.left = `${clampedX}px`;
    btn.style.top = `${clampedY}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  };

  const handlePointerUp = (e) => {
    const info = dragInfoRef.current;
    if (!info.isDragging) return;

    info.isDragging = false;
    setIsDraggingState(false);

    try {
      if (info.pointerId !== null && buttonRef.current) {
        buttonRef.current.releasePointerCapture(info.pointerId);
      }
    } catch {
      // Ignore
    }

    if (info.hasMoved && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const newPos = { x: rect.left, y: rect.top };
      globalFloatingButtonPos = newPos;
      setPos(newPos);
    } else if (!info.hasMoved) {
      // Normal click / tap without dragging -> trigger existing open behavior
      if (onClick) onClick(e);
    }
  };

  const handlePointerCancel = () => {
    dragInfoRef.current.isDragging = false;
    setIsDraggingState(false);
  };

  return (
    <>
      <style>{`
        @keyframes satraFloatingBtnEntrance {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title="Ask SATRA AI Assistant (Drag to move)"
        aria-label="Open SATRA AI Assistant"
        style={{
          position: 'fixed',
          left: pos ? `${pos.x}px` : 'auto',
          top: pos ? `${pos.y}px` : 'auto',
          bottom: pos ? 'auto' : '24px',
          right: pos ? 'auto' : '24px',
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
          cursor: isDraggingState ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          transition: isDraggingState ? 'none' : 'border-color 0.2s ease, box-shadow 0.2s ease',
          animation: pos ? 'none' : 'satraFloatingBtnEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          if (!isDraggingState) {
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.85)';
            e.currentTarget.style.boxShadow = '0 12px 34px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isDraggingState) {
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.45)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.55), 0 0 20px rgba(56, 189, 248, 0.22)';
          }
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
            pointerEvents: 'none',
          }}
        >
          <Bot size={21} color="#FFFFFF" strokeWidth={2.1} />
        </span>

        {/* Compact two-line SATRA label */}
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            lineHeight: 1.25,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
            Ask SATRA
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#7DD3FC', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            AI Assistant
          </span>
        </span>
      </button>
    </>
  );
}

export default FloatingAiButton;
