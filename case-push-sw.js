const revision = '3';
const diagnosticsCache = 'fourth-circuit-push-diagnostics';
const diagnosticsUrl = new URL('last-receipt.json', self.registration.scope).href;
const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data === 'push-diagnostics') event.ports[0]?.postMessage({revision});
});

async function showPush(event) {
  const receipt = {at: new Date().toISOString(), status: 'shown'};
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    receipt.payloadError = true;
  }
  const {id, taskId, sender, testId, added, edited} = payload;
  const task = validId(taskId) && ['يحيى', 'عبد الرحمن'].includes(sender);
  const test = validId(testId);
  const caseBatch = validId(id) && ['يحيى', 'عبد الرحمن'].includes(sender) &&
    Number.isSafeInteger(added) && Number.isSafeInteger(edited) && added >= 0 && edited >= 0;
  const caseMessage = caseBatch
    ? added > 0
      ? `أرسل ${sender} قضايا جديدة للمراجعة (العدد: ${added}).`
      : `حفظ ${sender} تعديلات على القضايا (العدد: ${edited}).`
    : 'لديك إشعار جديد. افتح الموقع للاطلاع عليه.';
  if (test) receipt.testId = testId;
  if (!test && !task && !validId(id)) receipt.payloadError = true;

  try {
    await self.registration.showNotification('منظم أعمال الدائرة الرابعة', {
      body: test ? 'إشعار تجريبي — إشعارات الدائرة الرابعة تعمل بنجاح' : task ? `لديك مهمة جديدة من ${sender}، اضغط للاطلاع عليها` : caseMessage,
      tag: test ? 'push-test-' + testId : task ? 'new-task-' + taskId : validId(id) ? 'case-submission-' + id : undefined,
      renotify: false,
      data: test ? {testId} : task ? {taskId} : validId(id) ? {id} : {},
    });
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error?.name || 'Error';
  }

  try {
    const cache = await caches.open(diagnosticsCache);
    const key = test ? new URL('test-' + testId + '.json', self.registration.scope).href : diagnosticsUrl;
    await cache.put(diagnosticsUrl, Response.json(receipt));
    if (test) {
      await cache.put(key, Response.json(receipt));
      const keys = (await cache.keys()).filter(request => request.url !== diagnosticsUrl);
      await Promise.all(keys.slice(0, -10).map(request => cache.delete(request)));
    }
  } catch {
    // Display does not depend on diagnostic storage.
  }
}

self.addEventListener('push', event => event.waitUntil(showPush(event)));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const {taskId, id} = event.notification.data || {};
  const url = new URL('./', self.registration.scope);
  if (validId(taskId)) url.hash = 'task=' + taskId;
  else if (validId(id)) url.hash = 'submission=' + id;
  event.waitUntil(clients.openWindow(url.href));
});
