// يمنع عرض المنظم داخل صفحة موقع آخر (حماية من الخداع بالنقر). GitHub Pages لا يسمح بترويسة frame-ancestors.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location.replace(window.self.location.href); } catch { /* الصفحة الأم تمنع الانتقال: تبقى مخفية */ }
}
