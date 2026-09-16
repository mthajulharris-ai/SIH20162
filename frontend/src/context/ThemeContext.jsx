import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  effectiveTheme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('satra_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch (e) {
      console.warn('Unable to read satra_theme from localStorage:', e);
    }
    return 'dark'; // SATRA Standard Dark theme is the default
  });

  const [systemPreference, setSystemPreference] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  // Listen for OS system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      setSystemPreference(e.matches ? 'light' : 'dark');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveTheme = theme === 'system' ? systemPreference : theme;

  const setTheme = (newTheme) => {
    if (newTheme !== 'dark' && newTheme !== 'light' && newTheme !== 'system') return;
    setThemeState(newTheme);
    try {
      localStorage.setItem('satra_theme', newTheme);
    } catch (e) {
      console.warn('Unable to save satra_theme to localStorage:', e);
    }
  };

  const toggleTheme = () => {
    const nextTheme = effectiveTheme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  // Synchronize with DOM attributes and classes
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', effectiveTheme);

    if (effectiveTheme === 'light') {
      body.classList.add('theme-light');
      body.classList.remove('theme-dark');
    } else {
      body.classList.add('theme-dark');
      body.classList.remove('theme-light');
    }
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
