// Theme bootstrap — MUST run before first paint (blocking classic script in
// <head>, see index.html) so the design-system tokens are correct on the first
// frame (no flash of wrong theme). The app's themeMode store reconciles after.
// Kept as a static file (not inline) so the SPA CSP needs no 'unsafe-inline'
// for scripts (BUG-038).
(function () {
  try {
    var m = localStorage.getItem('exprsn-theme');
    if (m !== 'light' && m !== 'dark') {
      m = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', m);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
