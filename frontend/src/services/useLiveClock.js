import { useState, useEffect } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format date as "Fri, 11 Sep 2026" using system/browser local timezone.
 */
export function formatLocalDate(date = new Date()) {
  const dayName = DAYS[date.getDay()];
  const day = date.getDate();
  const monthName = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}, ${day} ${monthName} ${year}`;
}

/**
 * Format time as "08:49:51" (HH:mm:ss) using system/browser local timezone.
 */
export function formatLocalTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format UTC date if needed.
 */
export function formatUtcDate(date = new Date()) {
  const dayName = DAYS[date.getUTCDay()];
  const day = date.getUTCDate();
  const monthName = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${dayName}, ${day} ${monthName} ${year}`;
}

/**
 * Format UTC time if needed.
 */
export function formatUtcTime(date = new Date()) {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Helper to build the current clock payload.
 */
function getClockSnapshot() {
  const now = new Date();
  return {
    now,
    dateStr: formatLocalDate(now),
    timeStr: formatLocalTime(now),
    utcDateStr: formatUtcDate(now),
    utcTimeStr: formatUtcTime(now),
  };
}

// Module-level shared timer and subscribers to avoid redundant intervals
// across multiple components that consume useLiveClock().
let currentSnapshot = getClockSnapshot();
const subscribers = new Set();
let timerId = null;

function tick() {
  currentSnapshot = getClockSnapshot();
  subscribers.forEach((callback) => {
    try {
      callback(currentSnapshot);
    } catch {
      // noop
    }
  });
}

function subscribe(callback) {
  subscribers.add(callback);
  if (timerId === null) {
    timerId = setInterval(tick, 1000);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
}

/**
 * Centralized live clock hook that updates every 1000ms.
 * Shares a single timer across components to avoid unnecessary intervals,
 * and automatically cleans up on unmount to prevent memory leaks.
 */
export function useLiveClock() {
  const [clock, setClock] = useState(() => currentSnapshot);

  useEffect(() => {
    // Keep in sync on mount
    setClock(currentSnapshot);
    const unsubscribe = subscribe(setClock);
    return () => {
      unsubscribe();
    };
  }, []);

  return clock;
}
