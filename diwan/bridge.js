(() => {
  if (parent === window) return;
  const organizer = location.origin;
  const waiting = new Map();
  let sequence = 0;
  let writeVersion = 0;
  let pendingWrites = 0;
  let previousSnapshot;
  let refreshing = false;

  function call(operation, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(Error('انتهت مهلة الاتصال بالمنظّم.'));
      }, 45000);
      waiting.set(id, {resolve, reject, timer});
      parent.postMessage({diwan: 'request', id, operation, payload}, organizer);
    });
  }

  addEventListener('message', event => {
    if (event.source !== parent || event.origin !== organizer || event.data?.diwan !== 'response') return;
    const item = waiting.get(event.data.id);
    if (!item) return;
    waiting.delete(event.data.id);
    clearTimeout(item.timer);
    if (event.data.error) item.reject(Error(event.data.error));
    else item.resolve(event.data.value);
  });

  function replace(list, values) { list.splice(0, list.length, ...values); }

  function applySnapshot(snapshot) {
    const items = snapshot.cases;
    replace(records, items);
    customCategories.forEach(category => removeCustomCategoryRuntime(category.id));
    replace(customCategories, snapshot.settings.customCategories ?? []);
    customCategories.forEach(addCustomCategoryRuntime);
    replace(classificationAliases, snapshot.settings.classificationAliases ?? []);
    replace(auditLogCache, snapshot.audit);
    scheduleActivePageRender();
  }

  async function write(operation, payload) {
    writeVersion++;
    pendingWrites++;
    try { return await call(operation,payload); }
    finally { pendingWrites--; }
  }

  async function saveCase(caseNumber, patch, create) {
    const document = await write('save', {caseNumber, patch, create});
    const index = records.findIndex(item => String(item.caseNumber) === String(caseNumber));
    if (index < 0) records.push(document);
    else records[index] = document;
    scheduleActivePageRender();
  }

  window.__cloudSetCase = item => saveCase(String(item.caseNumber), item, true);
  window.__cloudUpdateCase = (caseNumber, patch) => saveCase(String(caseNumber), patch, false);
  window.__cloudAddAuditLog = entry => write('audit', {entry});
  window.__cloudSaveCustomCategories = list => write('setting', {name: 'customCategories', list}).catch(error => alert(error.message));
  window.__cloudSaveAlias = () => write('setting', {name: 'classificationAliases', list: classificationAliases.slice()}).catch(error => alert(error.message));

  const navigation = document.getElementById('mobile');
  navigation.className = 'diwan-nav';
  navigation.setAttribute('aria-label', 'أقسام ديوان القضايا');
  document.querySelector('.main').prepend(navigation);

  window.__saveDiwanTheme = key => call('theme',{key}).catch(() => {});
  call('theme').then(key => applyTheme(key,true)).catch(() => {});
  async function refresh() {
    if (refreshing || pendingWrites || document.hidden) return;
    refreshing = true;
    const version = writeVersion;
    try {
      const snapshot = await call('load');
      if (version !== writeVersion || pendingWrites) return;
      const content = JSON.stringify(snapshot);
      if (previousSnapshot !== content) {
        applySnapshot(snapshot);
        previousSnapshot = content;
      }
      window.__authUid = 'organizer-session';
      const line = document.getElementById('storageLine');
      if (line) line.textContent = 'الحفظ في قاعدة ديوان القضايا';
      setSync('متصل بالمنظّم');
    } catch (error) {
      setSync(error.message);
    } finally {
      refreshing = false;
    }
  }
  void refresh();
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,60000);
})();
