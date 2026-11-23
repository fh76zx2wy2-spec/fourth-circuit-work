const revision = '8';
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
  const {id, taskId, sender, testId, eventId, title: richTitle, body: richBody} = payload;
  const task = validId(taskId);
  const assigned = typeof sender === 'string' ? /^assigned:(ziyad|yahya|abdulrahman|unknown):(case|email|ticket|followup|general)$/.exec(sender) : null;
  const senderNames = {ziyad:'زياد البابطين',yahya:'يحيى بكري',abdulrahman:'عبد الرحمن الشريف'};
  const categories = {case:'قضية',email:'بريد',ticket:'تذكرة',followup:'متابعة',general:'عامة'};
  const senderName = assigned ? senderNames[assigned[1]] : null;
  const execution = typeof sender === 'string' ? /^executed:(yahya|abdulrahman|unknown):(case|email|ticket|followup|general)$/.exec(sender) : null;
  const executor = execution ? senderNames[execution[1]] : null;
  const taskMessage = execution ? `تم تنفيذ مهمة${executor?' بواسطة '+executor:''} · ${categories[execution[2]]}. بانتظار تأكيدك.` :
    sender?.startsWith?.('executed:') ? 'تم تنفيذ مهمة. بانتظار تأكيدك.' :
    sender?.startsWith?.('returned:') ? 'أُعيدت إليك مهمة. افتح الموقع للاطلاع عليها.' :
    assigned ? `مهمة جديدة${senderName?' من '+senderName:''} · ${categories[assigned[2]]}. اضغط للاطلاع عليها.` :
    'لديك مهمة جديدة. افتح الموقع للاطلاع عليها.';
  const test = validId(testId);
  if (test) receipt.testId = testId;
  if (!test && !task && !validId(id)) receipt.payloadError = true;

  try {
    const rich = task && typeof richTitle === 'string' && richTitle.trim();
    await self.registration.showNotification(rich ? richTitle.slice(0, 80) : 'المُــنـظِّـم', {
      body: test ? 'إشعار تجريبي — إشعارات الدائرة الرابعة تعمل بنجاح' : rich ? String(richBody || '').slice(0, 300) : task ? taskMessage : 'لديك إشعار جديد. افتح الموقع للاطلاع عليه.',
      lang: 'ar', dir: 'rtl',
      tag: test ? 'push-test-' + testId : task ? 'task-' + (validId(eventId) ? eventId : taskId) : validId(id) ? 'case-submission-' + id : undefined,
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
