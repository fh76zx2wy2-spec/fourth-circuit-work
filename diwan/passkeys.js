function fromBase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
}

function toBase64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

async function platformAvailable() {
  try {
    return !!(window.isSecureContext && navigator.credentials && window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

// The platform passkey can sync. The separate non-extractable device key stays in this browser profile.
function deviceStore(mode, work) {
  return new Promise((resolve,reject) => {
    const open=indexedDB.open('fourth-circuit-diwan-devices',1);
    open.onblocked=()=>reject(Error('تعذّر الوصول إلى مفتاح هذا المتصفح.'));
    open.onerror=()=>reject(open.error);
    open.onupgradeneeded=()=>open.result.createObjectStore('devices');
    open.onsuccess=()=>{
      const db=open.result;
      const tx=db.transaction('devices',mode);
      const result=work(tx.objectStore('devices'));
      tx.oncomplete=()=>{db.close();resolve(result.result);};
      tx.onabort=()=>{db.close();reject(tx.error);};
    };
  });
}
const registeredDevice = owner => deviceStore('readonly',store=>store.get(owner));
const storeDevice = (owner,device) => deviceStore('readwrite',store=>store.put(device,owner));

function creationOptions(options) {
  return {
    ...options,challenge:fromBase64(options.challenge),
    user:{...options.user,id:fromBase64(options.user.id)},
    excludeCredentials:options.excludeCredentials?.map(item=>({...item,id:fromBase64(item.id)})),
  };
}
function requestOptions(options) {
  return {
    ...options,challenge:fromBase64(options.challenge),
    allowCredentials:options.allowCredentials?.map(item=>({...item,id:fromBase64(item.id)})),
  };
}
function serialize(credential,create) {
  const {response}=credential;
  const authResponse={clientDataJSON:toBase64(response.clientDataJSON)};
  if (create) {
    authResponse.attestationObject=toBase64(response.attestationObject);
    authResponse.transports=response.getTransports?.() ?? [];
  } else {
    authResponse.authenticatorData=toBase64(response.authenticatorData);
    authResponse.signature=toBase64(response.signature);
    authResponse.userHandle=response.userHandle ? toBase64(response.userHandle):null;
  }
  return {
    id:credential.id, rawId:toBase64(credential.rawId), type:credential.type, response:authResponse,
    authenticatorAttachment:credential.authenticatorAttachment,
    clientExtensionResults:credential.getClientExtensionResults(),
  };
}
async function finish(scope,kind,device,ceremony,credential,invoke) {
  if (!credential) throw Error('أُلغيت المصادقة.');
  const proof=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},device.privateKey,
    new TextEncoder().encode(`${scope}/${kind}/${ceremony.options.challenge}`));
  return invoke({action:`${kind}-verify`,challengeId:ceremony.challengeId,
    credential:serialize(credential,kind==='register'),proof:toBase64(proof)});
}

const actionButton = label => Object.assign(document.createElement('button'),{
  type:'button',className:'btn btn-primary',textContent:label,
});
const statusLine = () => {
  const line=document.createElement('p');
  line.setAttribute('role','status');
  return line;
};

export async function addPasskeyUnlock(container,owner,invoke,onSuccess,signal,scope='diwan') {
  const isOrganizer=scope==='organizer';
  if (!await platformAvailable() || signal.aborted) return;
  let device;
  try {device=await registeredDevice(owner);}
  catch {return;}
  if (!device || signal.aborted) return;
  const button=actionButton(isOrganizer?'الدخول بمفتاح المرور':'فتح بمفتاح المرور');
  const status=statusLine();
  let ceremony;
  let prompting=false;
  async function prepare() {
    button.disabled=true;
    try {
      ceremony=await invoke({action:'authenticate-options',deviceId:device.id});
      if (!signal.aborted) button.disabled=false;
    } catch {
      status.textContent=isOrganizer?'مفتاح هذا المتصفح غير متاح. استخدم كلمة المرور.':'مفتاح هذا المتصفح غير متاح. يمكنك استخدام رمز الديوان.';
    }
  }
  button.onclick=async()=>{
    if (!ceremony || signal.aborted) return;
    button.disabled=true;
    const attempt=ceremony;
    ceremony=null;
    prompting=true;
    status.textContent='';
    try {
      // Keep the browser prompt in a direct user click, including on Safari.
      const credential=await navigator.credentials.get({publicKey:requestOptions(attempt.options),signal});
      const result=await finish(scope,'authenticate',device,attempt,credential,invoke);
      if (!signal.aborted) await onSuccess(result);
    } catch {
      if (signal.aborted) return;
      status.textContent=isOrganizer?'تعذّر الدخول بمفتاح المرور. أعد المحاولة أو استخدم كلمة المرور.':'تعذّر فتح الديوان بمفتاح المرور. أعد المحاولة أو استخدم الرمز.';
      void prepare();
    } finally {prompting=false;}
  };
  const actions=document.createElement('div');
  actions.className='diwan-actions';
  actions.append(button,status);
  container.prepend(actions);
  const refresh=setInterval(()=>{if (!prompting) void prepare();},4*60*1000);
  signal.addEventListener('abort',()=>{
    clearInterval(refresh);
    actions.remove();
  },{once:true});
  await prepare();
}

export async function addPasskeySettings(container,owner,invoke,onRevoked,signal,scope='diwan') {
  const isOrganizer=scope==='organizer';
  const credentialLabel=isOrganizer?'كلمة مرور المنظّم':'رمز الديوان';
  const confirmRemoval=isOrganizer?'إلغاء اعتماد هذا المتصفح لتسجيل الدخول إلى المنظّم؟':'إلغاء اعتماد هذا المتصفح وقفل جلسات الديوان المفتوحة؟';
  if (signal.aborted) return;
  const section=document.createElement('details');
  section.className='card diwan-security';
  section.innerHTML=`
    <summary>مفاتيح المرور والأجهزة</summary>
    <p>اعتمد هذا المتصفح باستخدام ${credentialLabel} لتفعيل الدخول بمفتاح مرور. يتطلب كل متصفح اعتمادًا مستقلًا.</p>
    <div class="diwan-device-list"></div>
    <form hidden>
      <input class="input" name="deviceLabel" aria-label="اسم الجهاز أو المتصفح" placeholder="اسم الجهاز أو المتصفح" maxlength="80" required>
      <input class="input" type="password" name="diwanCode" aria-label="${credentialLabel} لاعتماد الجهاز" placeholder="${credentialLabel}" minlength="${isOrganizer?1:8}" maxlength="128" autocomplete="current-password" required>
      <button class="btn btn-soft">اعتماد هذا المتصفح</button>
    </form>`;
  const status=statusLine();
  section.append(status);
  container.append(section);
  const form=section.querySelector('form');
  const list=section.querySelector('.diwan-device-list');
  let device;
  try {device=await registeredDevice(owner);}
  catch { /* The passcode remains available if storage is blocked. */ }
  if (signal.aborted) return;

  async function loadDevices() {
    const {devices}=await invoke({action:'list'});
    if (signal.aborted) return;
    list.replaceChildren();
    const supported=await platformAvailable();
    form.hidden=devices.some(item=>item.id===device?.id) || !supported;
    if (!supported) status.textContent='مفاتيح المرور غير متاحة في هذا المتصفح أو الجهاز.';
    if (!devices.length) {
      const empty=document.createElement('p');
      empty.textContent='لا توجد أجهزة معتمدة.';
      list.append(empty);
    }
    for (const item of devices) {
      const row=document.createElement('div');
      row.className='diwan-actions';
      const label=document.createElement('span');
      label.textContent=item.name+(item.id===device?.id?' · هذا المتصفح':'');
      const remove=actionButton('إلغاء الاعتماد');
      remove.className='btn btn-soft';
      remove.setAttribute('aria-label','إلغاء اعتماد '+item.name);
      remove.onclick=async()=>{
        if (!confirm(confirmRemoval)) return;
        remove.disabled=true;
        try {
          await invoke({action:'revoke',deviceId:item.id});
          if (item.id===device?.id) {
            try {await deviceStore('readwrite',store=>store.delete(owner));} catch { /* Revoked on the server. */ }
          }
          if (isOrganizer) {if (item.id===device?.id) device=null; await loadDevices();}
          else onRevoked();
        } catch {
          status.textContent='تعذّر إلغاء الاعتماد.';
          remove.disabled=false;
        }
      };
      row.append(label,remove);
      list.append(row);
    }
  }

  const refreshDevices=()=>{
    if (section.open) void loadDevices().catch(()=>{status.textContent='تعذّر تحميل الأجهزة المعتمدة.';});
  };
  section.addEventListener('toggle',refreshDevices,{signal});
  refreshDevices();

  const button=form.querySelector('button');
  const confirmButton=actionButton('تأكيد بمفتاح المرور');
  confirmButton.hidden=true;
  section.insertBefore(confirmButton,status);
  form.onsubmit=async event=>{
    event.preventDefault();
    button.disabled=true;
    confirmButton.hidden=true;
    const code=form.elements.diwanCode.value;
    form.elements.diwanCode.value='';
    status.textContent='';
    try {
      const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
      const candidate={id:crypto.randomUUID(),privateKey:key.privateKey};
      const publicKey=await crypto.subtle.exportKey('jwk',key.publicKey);
      const ceremony=await invoke({action:'register-options',deviceId:candidate.id,
        name:form.elements.deviceLabel.value,code,publicKey});
      if (signal.aborted) return;
      confirmButton.hidden=false;
      confirmButton.disabled=false;
      status.textContent='اضغط تأكيد لإكمال الاعتماد من هذا الجهاز.';
      confirmButton.onclick=async()=>{
        confirmButton.disabled=true;
        try {
          const credential=await navigator.credentials.create({publicKey:creationOptions(ceremony.options),signal});
          if (signal.aborted) return;
          // Confirm persistence before activating the device on the server.
          await storeDevice(owner,candidate);
          await finish(scope,'register',candidate,ceremony,credential,invoke);
          device=candidate;
          form.reset();
          status.textContent='اعتمد هذا المتصفح.';
          await loadDevices();
        } catch {
          if (!signal.aborted) status.textContent='تعذّر إكمال الاعتماد. ابدأ المحاولة من جديد.';
        } finally {confirmButton.hidden=true;}
      };
      confirmButton.focus();
    } catch {
      if (!signal.aborted) status.textContent=isOrganizer?'تعذّر اعتماد الجهاز. تحقّق من كلمة مرور المنظّم وأعد المحاولة.':'تعذّر اعتماد الجهاز. تحقّق من رمز الديوان وأعد المحاولة.';
    } finally {button.disabled=false;}
  };
}
