/* ============================================================
   dashboard.js — Dashboard Overview Page
   PT PLN Indonesia Power UBP Jeranjang
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   KPI COUNTER ANIMATION
══════════════════════════════════════════════ */
function animateCounter(el, target, duration, suffix) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current.toLocaleString('id-ID') + (suffix || '');
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/* ══════════════════════════════════════════════
   INIT KPI COUNTERS
══════════════════════════════════════════════ */
(function initKpiCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = 'true';
        const target = parseFloat(entry.target.dataset.counter);
        const suffix = entry.target.dataset.suffix || '';
        const duration = parseInt(entry.target.dataset.duration || '1200', 10);
        animateCounter(entry.target, target, duration, suffix);
      }
    });
  }, { threshold: 0.2 });

  counters.forEach(el => observer.observe(el));
})();

/* ══════════════════════════════════════════════
   MINI SPARKLINE BARS ANIMATION
══════════════════════════════════════════════ */
(function initSparklines() {
  const bars = document.querySelectorAll('.kpi-mini-bar__seg');
  bars.forEach((bar, i) => {
    bar.style.height = '4px';
    setTimeout(() => {
      const h = parseInt(bar.dataset.h || '50', 10);
      bar.style.transition = 'height 0.5s ease-out';
      bar.style.height = h + '%';
    }, 100 + i * 40);
  });
})();

/* ══════════════════════════════════════════════
   PROGRESS BARS ANIMATION
══════════════════════════════════════════════ */
(function initProgressBars() {
  const bars = document.querySelectorAll('.progress-bar__fill[data-width]');
  if (!bars.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = 'true';
        const w = entry.target.dataset.width;
        setTimeout(() => {
          entry.target.style.width = w + '%';
        }, 150);
      }
    });
  }, { threshold: 0.2 });

  bars.forEach(el => {
    el.style.width = '0%';
    el.style.transition = 'width 0.8s ease-out';
    observer.observe(el);
  });
})();
