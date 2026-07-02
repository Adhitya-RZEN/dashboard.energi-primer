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

/* ----------------------------------------------
   CHART.JS INITIALIZATION
---------------------------------------------- */
(function initCharts() {
  if (typeof Chart === 'undefined' || !window.chartData) return;

  const styleStyle = getComputedStyle(document.documentElement);
  const primary = styleStyle.getPropertyValue('--primary').trim();
  const primaryLight = styleStyle.getPropertyValue('--primary-light').trim();
  const success = styleStyle.getPropertyValue('--success').trim();
  const warning = styleStyle.getPropertyValue('--warning').trim();
  const danger = styleStyle.getPropertyValue('--danger').trim();

  // Common defaults
  Chart.defaults.font.family = 'Poppins, sans-serif';
  Chart.defaults.color = '#6B7280';
  Chart.defaults.plugins.tooltip.backgroundColor = '#1F2937';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;

  // 1. Line Chart
  const lineCtx = document.getElementById('lineChart');
  if (lineCtx) {
    const colors = [primary, warning, success, danger];
    const datasets = window.chartData.line.datasets.map((ds, i) => {
      const color = colors[i % colors.length];
      return {
        label: ds.label,
        data: ds.data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.3
      };
    });

    new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: window.chartData.line.labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: { boxWidth: 12, usePointStyle: true } }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: { borderDash: [4, 4], color: '#E5E7EB', drawBorder: false }
          },
          x: {
            grid: { display: false, drawBorder: false }
          }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  }

  // 2. Pie (Doughnut) Chart
  const pieCtx = document.getElementById('pieChart');
  if (pieCtx) {
    new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['On Spec (>= 4700)', 'Perhatian (4500-4699)', 'Off Spec (< 4500)'],
        datasets: [{
          data: window.chartData.pie.data,
          backgroundColor: [success, warning, danger],
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } }
        }
      }
    });
  }
})();

