/* ============================================================
   app.js — Global JavaScript
   Dashboard Monitoring Efisiensi Batu Bara
   PT PLN Indonesia Power UBP Jeranjang | v1.0 | 2026
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   LIVE CLOCK — WITA (Asia/Makassar)
══════════════════════════════════════════════ */
(function initClock() {
  const el = document.getElementById('js-clock');
  if (!el) return;

  function tick() {
    const now = new Date();
    const opts = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Makassar',
      hour12: false
    };
    el.textContent = now.toLocaleString('id-ID', opts) + ' WITA';
  }

  tick();
  setInterval(tick, 1000);
})();

/* ══════════════════════════════════════════════
   SIDEBAR TOGGLE — Mobile / Tablet Drawer
══════════════════════════════════════════════ */
(function initSidebar() {
  const sidebar        = document.getElementById('js-sidebar');
  const hamburger      = document.getElementById('js-hamburger');
  const overlay        = document.getElementById('js-overlay');

  if (!sidebar || !hamburger || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('is-open');
    overlay.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  // Close sidebar on mobile when a link is clicked
  sidebar.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });
})();

/* ══════════════════════════════════════════════
   ACTIVE SIDEBAR LINK — based on current URL
══════════════════════════════════════════════ */
(function initActiveLink() {
  const links = document.querySelectorAll('.sidebar__link[data-href]');
  const current = window.location.pathname;

  links.forEach(link => {
    link.classList.remove('active');
    const href = link.dataset.href;
    if (href === current || (href !== '/' && current.startsWith(href))) {
      link.classList.add('active');
    }
    if (href === '/' && current === '/') {
      link.classList.add('active');
    }
  });
})();

/* ══════════════════════════════════════════════
   TOOLTIP (simple title-based)
══════════════════════════════════════════════ */
(function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.setAttribute('title', el.dataset.tooltip);
  });
})();

/* ══════════════════════════════════════════════
   SMOOTH PAGE ENTRY ANIMATION
══════════════════════════════════════════════ */
(function initPageEntry() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;
  mainContent.style.opacity = '0';
  mainContent.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    mainContent.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
    mainContent.style.opacity = '1';
    mainContent.style.transform = 'translateY(0)';
  });
})();
