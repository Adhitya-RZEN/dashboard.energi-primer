/* ============================================================
   dashboard.js
   PT PLN Indonesia Power UBP Jeranjang
   Dashboard Monitoring Efisiensi Batu Bara — v0.1
============================================================ */

/* ════════════ Live Clock ════════════ */
function updateClock() {
  const el = document.getElementById('currentTime');
  if (!el) return;
  const now = new Date();
  const opts = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Makassar', hour12: false
  };
  el.textContent = now.toLocaleString('id-ID', opts) + ' WITA';
}
updateClock();
setInterval(updateClock, 1000);

/* ════════════ Sidebar Toggle (Mobile / Tablet) ════════════ */
const sidebar        = document.getElementById('sidebar');
const hamburgerBtn   = document.getElementById('hamburgerBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener('click', closeSidebar);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

/* ════════════ Sidebar Active Link ════════════ */
document.querySelectorAll('.sidebar__link').forEach(link => {
  link.addEventListener('click', function () {
    // Skip logout — tidak ubah active state
    if (this.textContent.trim().startsWith('Logout')) return;
    document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('active'));
    this.classList.add('active');
    // Tutup sidebar di mobile setelah pilih menu
    if (window.innerWidth <= 900) closeSidebar();
  });
});
