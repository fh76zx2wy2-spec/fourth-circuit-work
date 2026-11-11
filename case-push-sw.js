self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

self.addEventListener('push', event => {
  const {id, taskId, sender} = event.data?.json() || {};
  const task = validId(taskId) && ['يحيى', 'عبد الرحمن'].includes(sender);
  if (!task && !validId(id)) return;
  event.waitUntil(self.registration.showNotification('منظم أعمال الدائرة الرابعة', {
    body: task ? `لديك مهمة جديدة من ${sender}، اضغط للاطلاع عليها` : 'لديك إشعار جديد. افتح الموقع للاطلاع عليه.',
    tag: task ? 'new-task-' + taskId : 'case-submission-' + id,
    renotify: false,
    data: task ? {taskId} : {id},
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const {taskId, id} = event.notification.data || {};
  const url = new URL('./', self.registration.scope);
  if (validId(taskId)) url.hash = 'task=' + taskId;
  else if (validId(id)) url.hash = 'submission=' + id;
  else return;
  event.waitUntil(clients.openWindow(url.href));
});
