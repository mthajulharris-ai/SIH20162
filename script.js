// ---------------------------------------------
// AuraPulse Client-Side JavaScript Logic
// ---------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initCounter();
  initAccentSwitcher();
  initNavigationActions();
  initStatsAnimation();
});

/* ---------------------------------------------
   Theme Toggle (Dark / Light Mode)
--------------------------------------------- */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');

  // Check saved preference or default to dark
  const savedTheme = localStorage.getItem('aurapulse-theme') || 'dark';
  applyTheme(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('aurapulse-theme', newTheme);
  });

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      themeIcon.textContent = '☀️';
      themeToggleBtn.setAttribute('aria-label', 'Switch to dark theme');
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeIcon.textContent = '🌙';
      themeToggleBtn.setAttribute('aria-label', 'Switch to light theme');
    }
  }
}

/* ---------------------------------------------
   Interactive Counter Component
--------------------------------------------- */
function initCounter() {
  const counterVal = document.getElementById('counter-value');
  const totalClicksEl = document.getElementById('total-clicks');
  const btnIncrement = document.getElementById('btn-increment');
  const btnDecrement = document.getElementById('btn-decrement');
  const btnReset = document.getElementById('btn-reset');

  let count = 0;
  let totalClicks = 0;

  function updateCounter(animationClass) {
    counterVal.textContent = count;
    totalClicksEl.textContent = totalClicks;

    // Micro-scale bounce effect
    counterVal.style.transform = 'scale(1.2)';
    setTimeout(() => {
      counterVal.style.transform = 'scale(1)';
    }, 120);
  }

  btnIncrement.addEventListener('click', () => {
    count++;
    totalClicks++;
    updateCounter();
  });

  btnDecrement.addEventListener('click', () => {
    count--;
    totalClicks++;
    updateCounter();
  });

  btnReset.addEventListener('click', () => {
    count = 0;
    totalClicks++;
    updateCounter();
  });
}

/* ---------------------------------------------
   Live Accent Color Switcher
--------------------------------------------- */
function initAccentSwitcher() {
  const chips = document.querySelectorAll('.mood-chip');
  const activeColorCode = document.getElementById('active-color-code');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      // Remove active class from all
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const color = chip.getAttribute('data-color');
      activeColorCode.textContent = color;

      // Update root CSS custom properties
      document.documentElement.style.setProperty('--primary-color', color);
      document.documentElement.style.setProperty('--primary-glow', `${color}55`);
      document.documentElement.style.setProperty('--primary-subtle', `${color}22`);
    });
  });
}

/* ---------------------------------------------
   Smooth Navigation & CTA Handlers
--------------------------------------------- */
function initNavigationActions() {
  const exploreBtn = document.getElementById('explore-btn');
  const previewCodeBtn = document.getElementById('preview-code-btn');

  exploreBtn?.addEventListener('click', () => {
    const target = document.getElementById('features');
    target?.scrollIntoView({ behavior: 'smooth' });
  });

  previewCodeBtn?.addEventListener('click', () => {
    const target = document.getElementById('interactive-demo');
    target?.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ---------------------------------------------
   Stats Number Ticker Animation
--------------------------------------------- */
function initStatsAnimation() {
  const stats = [
    { elementId: 'stat-speed', target: 100 },
    { elementId: 'stat-responsive', target: 100 }
  ];

  stats.forEach(stat => {
    const el = document.getElementById(stat.elementId);
    if (!el) return;

    let current = 0;
    const increment = Math.ceil(stat.target / 30);
    const interval = setInterval(() => {
      current += increment;
      if (current >= stat.target) {
        current = stat.target;
        clearInterval(interval);
      }
      el.textContent = current;
    }, 25);
  });
}
