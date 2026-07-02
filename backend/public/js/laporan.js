/* ============================================================
   laporan.js — Laporan Page
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   LAPORAN CARD SELECTION
══════════════════════════════════════════════ */
(function initLaporanCards() {
  const cards = document.querySelectorAll('.laporan-card[data-selectable]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
    });
  });
})();

/* ══════════════════════════════════════════════
   PERIOD FORM VALIDATION (dummy)
══════════════════════════════════════════════ */
(function initPeriodForm() {
  const generateBtn = document.getElementById('js-generate-laporan');
  if (!generateBtn) return;

  generateBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const monthEl = document.getElementById('js-period-month');
    const yearEl  = document.getElementById('js-period-year');

    if (!monthEl || !yearEl) return;

    // Simulate loading state
    generateBtn.disabled = true;
    generateBtn.textContent = 'Memproses...';

    setTimeout(() => {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Generate Laporan
      `;
    }, 1500);
  });
})();
