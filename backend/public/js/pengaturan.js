/* ============================================================
   pengaturan.js — Pengaturan Page
============================================================ */

'use strict';

/* ══════════════════════════════════════════════
   SETTINGS NAV TABS
══════════════════════════════════════════════ */
(function initSettingsTabs() {
  const navItems = document.querySelectorAll('.settings-nav__item[data-panel]');
  const panels   = document.querySelectorAll('.settings-panel[data-panel-id]');

  if (!navItems.length) return;

  function activatePanel(panelId) {
    navItems.forEach(item => {
      item.classList.toggle('is-active', item.dataset.panel === panelId);
    });
    panels.forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.panelId === panelId);
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      activatePanel(item.dataset.panel);
    });
  });

  // Activate first by default
  if (navItems.length > 0) {
    activatePanel(navItems[0].dataset.panel);
  }
})();

/* ══════════════════════════════════════════════
   FORM SAVE SIMULATION
══════════════════════════════════════════════ */
(function initFormSave() {
  const saveBtn = document.getElementById('js-save-profile');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';

    setTimeout(() => {
      saveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Tersimpan!
      `;
      saveBtn.style.background = 'var(--success)';

      setTimeout(() => {
        saveBtn.innerHTML = originalText;
        saveBtn.style.background = '';
        saveBtn.disabled = false;
      }, 2000);
    }, 1000);
  });
})();

/* ══════════════════════════════════════════════
   TOGGLE SWITCHES
══════════════════════════════════════════════ */
(function initToggles() {
  document.querySelectorAll('.toggle-switch input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      // Dummy: just toggle — no backend action
    });
  });
})();
