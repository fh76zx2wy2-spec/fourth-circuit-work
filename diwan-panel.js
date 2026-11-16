const gateLabels = {
  locked: 'أدخل رمز ديوان القضايا.',
  setup: 'أنشئ رمزًا من 8 إلى 128 حرفًا.',
  invalid: 'الرمز غير صحيح أو لا يطابق الطول المطلوب.',
  limited: 'تجاوزت حد المحاولات. أعد المحاولة بعد 15 دقيقة.',
  forbidden: 'الحساب الحالي غير مخوّل لدخول ديوان القضايا.'
};

async function readPages(table, columns, key) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await table.select(columns).order(key).range(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

async function perform(state, operation, payload = {}) {
  const client = state.client;
  if (operation === 'gate') {
    const {data,error} = await client.rpc('diwan_gate', {action:payload.action, code:payload.code ?? null, new_code:payload.newCode ?? null});
    if (error) throw error;
    return data;
  }
  if (operation === 'load') {
    const [cases, settings, audit] = await Promise.all([
      readPages(client.from('diwan_cases'), 'document', 'case_number'),
      readPages(client.from('diwan_settings'), 'name,value', 'name'),
      readPages(client.from('diwan_classification_audit'), 'document', 'id')
    ]);
    return {cases:cases.map(r=>r.document), settings:Object.fromEntries(settings.map(r=>[r.name,r.value])), audit:audit.map(r=>r.document)};
  }
  if (operation === 'save') {
    const {caseNumber,patch,create} = payload;
    const {error} = await client.rpc('diwan_save_case', {case_key:caseNumber, patch, create_missing:create === true});
    if (error) throw error;
    const row = await client.from('diwan_cases').select('document').eq('case_number',caseNumber).single();
    if (row.error) throw row.error;
    return row.data.document;
  }
  const result = operation === 'audit'
    ? await client.from('diwan_classification_audit').insert({document:payload.entry})
    : await client.from('diwan_settings').upsert({name:payload.name,value:payload.list});
  if (result.error) throw result.error;
}

export function canShowDiwan(state) {
  return state.profile?.role === 'judge' && !!state.profile.is_active &&
    state.user?.id === state.profile.id && state.diwanOwnerUid === state.profile.id;
}

export async function loadDiwanAccess(state) {
  state.diwanOwnerUid = null;
  const id = state.user?.id;
  if (!id || !state.profile?.is_active || state.profile.role !== 'judge') return;
  try {
    const result = await perform(state,'gate',{action:'status'});
    if (state.user?.id === id && ['setup','locked','unlocked'].includes(result)) state.diwanOwnerUid = id;
  } catch { /* The standalone section can be unavailable independently of the organizer. */ }
}

export async function mountDiwan(state) {
  const root = document.getElementById('diwan-slot');
  if (!root || !canShowDiwan(state)) return;
  const actor = state.profile.id;
  const current = () => root.isConnected && state.profile?.id === actor && canShowDiwan(state);
  const request = (operation, payload) => {
    if (!current()) throw Error('جلسة الديوان غير متاحة.');
    return perform(state, operation, payload);
  };
  root.innerHTML = '<h1 class="heading">ديوان القضايا</h1><div class="card diwan-panel" aria-live="polite"></div>';
  const panel = root.querySelector('.diwan-panel');

  function showGate(status) {
    if (!current()) return;
    panel.replaceChildren();
    if (status === 'unlocked') {
      const lock = document.createElement('button');
      lock.className = 'btn btn-soft';
      lock.textContent = 'قفل الديوان';
      const frame = document.createElement('iframe');
      frame.title = 'ديوان القضايا';
      frame.sandbox = 'allow-scripts allow-downloads allow-modals';
      frame.className = 'diwan-frame';
      const methods = new Set(['load','save','setting','audit','theme']);
      const themeKey = 'fourth-circuit:diwan-theme:' + actor;
      const themes = new Set(['organizer','navy-gold','petrol-copper','burgundy-champagne','slate-gold','mint-lemon']);
      frame.src = './diwan/index.html';
      frame.addEventListener('load', () => {
        if (!current()) frame.remove();
      });
      const handle = async event => {
        if (!current() || !frame.isConnected || event.source !== frame.contentWindow || event.origin !== 'null') return;
        const data = event.data;
        if (data?.diwan !== 'request' || !Number.isSafeInteger(data.id) || !methods.has(data.operation)) return;
        const reply = {diwan:'response', id:data.id};
        try {
          if (await request('gate',{action:'status'}) !== 'unlocked') {
            showGate('locked');
            return;
          }
          if (data.operation === 'theme') {
            if (themes.has(data.payload?.key)) localStorage.setItem(themeKey,data.payload.key);
            reply.value = localStorage.getItem(themeKey);
          } else {
            reply.value = await request(data.operation,data.payload);
          }
        } catch { reply.error = 'تعذّر حفظ أو تحميل بيانات الديوان. تحقّق من الجلسة وحاول مرة أخرى.'; }
        if (current() && frame.isConnected) frame.contentWindow.postMessage(reply, '*');
      };
      const listener = new AbortController();
      addEventListener('message',handle,{signal:listener.signal});
      const checkExpiry = setInterval(async () => {
        try {
          if (await request('gate',{action:'status'}) !== 'unlocked' && frame.isConnected) showGate('locked');
        } catch { if (frame.isConnected) showGate('locked'); }
      }, 30000);
      const detached = new MutationObserver(() => {
        if (!frame.isConnected) { clearInterval(checkExpiry); listener.abort(); detached.disconnect(); }
      });
      detached.observe(root.closest('#app') ?? document.body,{childList:true,subtree:true});
      lock.onclick = async () => {
        try { showGate(await request('gate',{action:'lock'})); }
        catch { lock.textContent = 'تعذّر القفل. حاول مرة أخرى.'; }
      };
      const change = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'تغيير رمز الديوان';
      const form = document.createElement('form');
      const fields = ['الرمز الحالي','الرمز الجديد','تأكيد الرمز الجديد'].map((name,index) => {
        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'field';
        input.required = true;
        input.minLength = 8;
        input.maxLength = 128;
        input.autocomplete = index ? 'new-password' : 'current-password';
        input.placeholder = name;
        input.setAttribute('aria-label',name);
        return input;
      });
      const save = document.createElement('button');
      save.className = 'btn btn-primary';
      save.textContent = 'حفظ الرمز';
      const result = document.createElement('p');
      result.setAttribute('role','status');
      form.append(...fields,save);
      form.onsubmit = async event => {
        event.preventDefault();
        const [code,newCode,confirmation] = fields.map(field=>field.value);
        if (newCode !== confirmation) {result.textContent='الرمز الجديد وتأكيده غير متطابقين.';return;}
        save.disabled = true;
        try {
          const response = await request('gate',{action:'change',code,newCode});
          if (response === 'unlocked') {
            form.reset();
            result.textContent = 'حُفظ الرمز الجديد.';
          } else result.textContent = gateLabels[response] ?? 'تعذّر تغيير الرمز.';
        } catch {result.textContent = 'تعذّر تغيير الرمز.';}
        finally {save.disabled=false;}
      };
      change.append(summary,form,result);
      panel.append(lock,change,frame);
      return;
    }

    const label = document.createElement('p');
    label.textContent = gateLabels[status] ?? gateLabels.locked;
    panel.append(label);
    if (status === 'forbidden') return;
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'password';
    input.minLength = 8;
    input.maxLength = 128;
    input.required = true;
    input.autocomplete = status === 'setup' ? 'new-password' : 'current-password';
    input.className = 'field';
    input.setAttribute('aria-label','رمز ديوان القضايا');
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.textContent = status === 'setup' ? 'إنشاء الرمز وفتح الديوان' : 'فتح الديوان';
    form.append(input,button);
    form.onsubmit = async event => {
      event.preventDefault();
      button.disabled = true;
      const code = input.value;
      input.value = '';
      try {
        const result = await request('gate',{action:status === 'setup' ? 'setup' : 'unlock',code});
        if (['setup','locked','unlocked','forbidden'].includes(result)) showGate(result);
        else label.textContent = gateLabels[result] ?? gateLabels.invalid;
      } catch { label.textContent = 'تعذّر التحقق من الرمز.'; }
      finally { button.disabled = false; }
    };
    panel.append(form);
  }
  try { showGate(await request('gate',{action:'status'})); }
  catch { panel.textContent = 'تعذّر الاتصال بقاعدة الديوان.'; }
}
