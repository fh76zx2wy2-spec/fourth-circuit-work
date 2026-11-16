import {mountDiwanWorkspace} from './diwan/workspace.js?v=1';
import {addPasskeySettings,addPasskeyUnlock} from './diwan/passkeys.js?v=1';

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
  if (operation === 'access') {
    const started=Date.now();
    const monotonic=performance.now();
    const {data,error}=await client.rpc('diwan_access');
    if (error) throw error;
    const remaining=Number(data.remainingMs);
    return {...data,deadline:started+remaining,timerDeadline:monotonic+remaining};
  }
  if (operation === 'passkey') {
    const {data,error}=await client.functions.invoke('diwan-passkeys',{body:payload});
    if (error) throw error;
    return data;
  }
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
  root.innerHTML = `
    <div class="section-head diwan-header">
      <h1 class="heading">ديوان القضايا</h1>
      <button type="button" class="btn btn-soft diwan-lock" hidden>قفل الديوان الآن</button>
    </div>
    <div class="diwan-panel"></div>`;
  const panel = root.querySelector('.diwan-panel');
  const lock = root.querySelector('.diwan-lock');
  let view;
  const detached=new MutationObserver(()=>{
    if (!current()) {
      view?.abort();
      detached.disconnect();
    }
  });
  detached.observe(root.closest('#app') ?? document.body,{childList:true,subtree:true});

  function showGate(access) {
    if (!current()) return;
    view?.abort();
    view=new AbortController();
    const {signal}=view;
    const status=expiredAccess(access) ? 'locked' : access.status;
    panel.replaceChildren();
    panel.classList.toggle('card',status !== 'unlocked');
    lock.hidden=status!=='unlocked';
    if (status === 'unlocked') {
      let refreshing=false;
      const enforce=()=>{
        if (!signal.aborted && expiredAccess(access)) showGate({status:'locked'});
        return !signal.aborted;
      };
      const guarded=async(operation,payload)=>{
        if (!enforce()) throw Error('أُغلق ديوان القضايا.');
        const status=await request('gate',{action:'status'});
        if (!enforce()) throw Error('أُغلق ديوان القضايا.');
        if (status!=='unlocked') {
          showGate({status});
          throw Error('انتهت صلاحية فتح الديوان.');
        }
        return request(operation,payload);
      };
      const verify=async()=>{
        if (!enforce() || refreshing) return;
        refreshing=true;
        try {
          const latest=await request('access');
          if (!signal.aborted && (latest.status!=='unlocked' || expiredAccess(latest))) showGate(latest);
        } catch {if (!signal.aborted) showGate({status:'locked'});}
        finally {refreshing=false;}
      };
      let enforceTimer;
      function scheduleExpiry() {
        if (enforce()) enforceTimer=setTimeout(scheduleExpiry,
          Math.max(1,Math.ceil(Math.min(access.timerDeadline-performance.now(),access.deadline-Date.now()))));
      }
      scheduleExpiry();
      const refreshTimer=setInterval(verify,30000);
      const onVisible=()=>{if (!document.hidden) void verify();};
      document.addEventListener('visibilitychange',onVisible,{signal});
      window.addEventListener('pageshow',onVisible,{signal});
      signal.addEventListener('abort',()=>{
        clearTimeout(enforceTimer);
        clearInterval(refreshTimer);
      },{once:true});
      lock.onclick=()=>{
        showGate({status:'locking'});
        void lockServer();
      };
      try { mountDiwanWorkspace(panel,guarded,signal); }
      catch (error) {
        view.abort();
        lock.hidden = true;
        panel.textContent = 'تعذّر فتح واجهة ديوان القضايا. أعد تحميل الصفحة.';
        console.error('Diwan workspace initialization failed',error);
        return;
      }
      const change = document.createElement('details');
      change.className = 'card diwan-security';
      const summary = document.createElement('summary');
      summary.textContent = 'تغيير رمز الديوان';
      const form = document.createElement('form');
      const fields = ['الرمز الحالي','الرمز الجديد','تأكيد الرمز الجديد'].map((name,index) => {
        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'input';
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
      const security=panel.querySelector('#diwan-security-settings');
      security.replaceChildren(change);
      void addPasskeySettings(security,actor,payload=>guarded('passkey',payload),
        ()=>showGate({status:'locked'}),signal);
      return;
    }

    const label = document.createElement('p');
    label.setAttribute('role','status');
    label.textContent = gateLabels[status] ?? gateLabels.locked;
    panel.append(label);
    if (status === 'forbidden') return;
    if (status === 'locking') {
      label.textContent='جارٍ قفل الديوان…';
      return;
    }
    if (status === 'lock-error') {
      label.textContent='أُخفيت بيانات الديوان. تعذّر تأكيد القفل على الخادم.';
      const retry=document.createElement('button');
      retry.className='btn btn-soft';
      retry.textContent='إعادة محاولة القفل';
      retry.onclick=()=>{
        showGate({status:'locking'});
        void lockServer();
      };
      panel.append(retry);
      return;
    }
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'password';
    input.minLength = 8;
    input.maxLength = 128;
    input.required = true;
    input.autocomplete = status === 'setup' ? 'new-password' : 'current-password';
    input.className = 'input';
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
        if (result==='unlocked') await openCurrentAccess();
        else if (['setup','locked','forbidden'].includes(result)) showGate({status:result});
        else label.textContent = gateLabels[result] ?? gateLabels.invalid;
      } catch { label.textContent = 'تعذّر التحقق من الرمز.'; }
      finally { button.disabled = false; }
    };
    panel.append(form);
    if (status==='locked') void addPasskeyUnlock(panel,actor,payload=>request('passkey',payload),openCurrentAccess,signal);
  }

  function expiredAccess(access) {
    return access.status==='unlocked' &&
      (!Number.isFinite(access.deadline) || !Number.isFinite(access.timerDeadline) ||
        Date.now()>=access.deadline || performance.now()>=access.timerDeadline);
  }

  async function openCurrentAccess() {
    showGate(await request('access'));
  }

  async function lockServer() {
    try {showGate({status:await request('gate',{action:'lock'})});}
    catch {showGate({status:'lock-error'});}
  }

  try {await openCurrentAccess();}

  catch { panel.textContent = 'تعذّر الاتصال بقاعدة الديوان.'; }
}
