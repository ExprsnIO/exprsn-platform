/* Exprsn.io — shared site behavior (no build step, no frameworks). */
(function () {
  'use strict';

  /* ---- Theme (light/dark), persisted like the app's own theme store ---- */
  function getStoredTheme() {
    try {
      var m = localStorage.getItem('exprsn-theme');
      if (m === 'light' || m === 'dark') return m;
    } catch (e) { /* private mode / disabled storage */ }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    var fab = document.querySelector('[data-theme-fab]');
    if (fab) fab.textContent = mode === 'dark' ? '☀' : '◐';
    try { localStorage.setItem('exprsn-theme', mode); } catch (e) {}
  }

  applyTheme(getStoredTheme());

  document.addEventListener('click', function (e) {
    var fab = e.target.closest('[data-theme-fab]');
    if (!fab) return;
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ---- Mobile nav toggle ---- */
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-nav-toggle]');
    if (toggle) {
      document.querySelector('.site-header').classList.toggle('nav-open');
      return;
    }
    var link = e.target.closest('.site-nav a');
    if (link) document.querySelector('.site-header').classList.remove('nav-open');
  });

  /* ---- Active nav link based on current page ---- */
  (function highlightActiveNav() {
    var path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav a[data-page]').forEach(function (a) {
      if (a.getAttribute('data-page') === path) a.classList.add('active');
    });
  })();

  /* ---- Home hero: consumer / developer audience toggle ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-audience]');
    if (!btn) return;
    var audience = btn.getAttribute('data-audience');
    document.querySelectorAll('[data-audience]').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    document.querySelectorAll('[data-audience-panel]').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-audience-panel') === audience);
    });
  });

  /* ---- Contact form: static site, no backend — acknowledge locally ---- */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('#contact-form');
    if (!form) return;
    e.preventDefault();
    var status = document.getElementById('contact-status');
    if (!status) return;
    status.className = 'alert alert-success show';
    status.innerHTML = '<div class="alert-content"><div class="alert-title">Message received</div>' +
      '<div class="alert-message">Thanks — we read every note and reply from hello@exprsn.io.</div></div>';
    form.reset();
  });

  /* ---- Smooth scroll for same-page anchor links ---- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    var target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---- Footer year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
