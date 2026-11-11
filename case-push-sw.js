self.addEventListener('push', event => {
  const {id} = event.data?.json() || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  event.waitUntil(self.registration.showNotification('منظم أعمال الدائرة الرابعة', {
    body: 'لديك إشعار جديد. افتح الموقع للاطلاع عليه.',
    tag: 'case-submission-' + id,
    renotify: false,
    data: {id},
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = event.notification.data?.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const url = new URL('./', self.registration.scope);
  url.hash = 'submission=' + id;
  event.waitUntil(clients.openWindow(url.href));
});
