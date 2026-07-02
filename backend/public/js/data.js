/* ============================================================
   data.js — Data Batu Bara Page
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   SEARCH FILTER (dummy — highlight rows)
══════════════════════════════════════════════ */
(function initSearch() {
  const searchInput = document.getElementById('js-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', function () {
    const query = this.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.table--data tbody tr');

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      if (!query || text.includes(query)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });

    // Update count
    const countEl = document.getElementById('js-row-count');
    if (countEl) {
      const visible = document.querySelectorAll('.table--data tbody tr:not([style*="none"])').length;
      countEl.textContent = visible;
    }
  });
})();

/* ══════════════════════════════════════════════
   SORT TABLE (dummy)
══════════════════════════════════════════════ */
(function initTableSort() {
  const headers = document.querySelectorAll('.table thead th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
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
