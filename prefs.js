// إعدادات العرض على هذا الجهاز: النمط (تلقائي/فاتح/ليلي)، التصميم (زجاجي/كلاسيكي)، حجم الخط.
// تُطبَّق قبل رسم الصفحة لتفادي الوميض الأبيض في الوضع الليلي.
(() => {
  const KEY = 'fourth-circuit-display';
  const defaults = { theme: 'auto', design: 'glass', scale: 'normal' };
  const scales = { small: 0.92, normal: 1, large: 1.1 };
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function read() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
  }
  function apply(p = read()) {
    const root = document.documentElement;
    const dark = p.theme === 'dark' || (p.theme === 'auto' && !!media?.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.classList.toggle('classic', p.design === 'classic');
    root.style.setProperty('--ui-zoom', String(scales[p.scale] || 1));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0d1514' : '#087967';
  }
  function set(patch) {
    const p = { ...read(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* التخزين غير متاح: يُطبَّق للجلسة فقط */ }
    apply(p);
    return p;
  }
  media?.addEventListener?.('change', () => apply());
  window.organizerDisplay = { read, set, apply };
  apply();
})();
