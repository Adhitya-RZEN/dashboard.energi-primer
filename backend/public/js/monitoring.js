/* ============================================================
   monitoring.js — Monitoring Real-time Page
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   SHIFT SELECTOR
══════════════════════════════════════════════ */
(function initShiftSelector() {
  const btns = document.querySelectorAll('.shift-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });
})();

/* ══════════════════════════════════════════════
   TABLE ROW HOVER HIGHLIGHT
══════════════════════════════════════════════ */
(function initTableHighlight() {
  document.querySelectorAll('.table tbody tr').forEach(row => {
    row.addEventListener('mouseenter', () => {
      row.style.cursor = 'pointer';
    });
  });
})();

/* ══════════════════════════════════════════════
   TABLE SORT (dummy simulation)
══════════════════════════════════════════════ */
(function initTableSort() {
  const headers = document.querySelectorAll('.table thead th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      headers.forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      if (th.dataset.sort === 'asc') {
        th.dataset.sort = 'desc';
        th.classList.add('sort-desc');
      } else {
        th.dataset.sort = 'asc';
        th.classList.add('sort-asc');
      }
    });
  });
})();

/* ══════════════════════════════════════════════
   FILTER FORM (dummy reset)
══════════════════════════════════════════════ */
(function initFilterReset() {
  const resetBtn = document.getElementById('js-filter-reset');
  if (!resetBtn) return;

  resetBtn.addEventListener('click', () => {
    document.querySelectorAll('.filter-select, .filter-input').forEach(el => {
      el.value = '';
    });
  });
})();
