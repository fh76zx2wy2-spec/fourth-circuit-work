/* تنظيم أعمال الدائرة الرابعة: GitHub Pages frontend + restricted Supabase backend */
const CONFIG = window.APP_CONFIG || {};
const DEMO = !CONFIG.supabaseUrl || !CONFIG.supabasePublishableKey;
const APP_NAME = 'منظم أعمال الدائرة الرابعة بمحكمة أبي عريش';
const KSA = 'Asia/Riyadh';
const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KSA, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
});
function riyadhClock(now = new Date()) {
  const {hour, minute, second, dayPeriod} = Object.fromEntries(clockFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${hour}:${minute}:${second} ${dayPeriod === 'AM' ? 'ص' : 'م'}`;
}
function updateClock(){
  const clock=document.querySelector('[data-riyadh-clock]');
  if(clock)clock.textContent=riyadhClock();
}
const $ = (s) => document.querySelector(s);
const latinDigits=(value='')=>String(value??'').replace(/[٠-٩۰-۹]/g,digit=>
 String(digit.charCodeAt(0)-(digit<='٩'?0x660:0x6f0)));
function normalizeNumberInput(input){
 if(!input.matches('input[type="text"],input[type="search"],input:not([type]),input#account-password,textarea'))return;
 const value=latinDigits(input.value);
 if(value===input.value)return;
 const {selectionStart,selectionEnd,selectionDirection}=input;
 input.value=value;
 if(selectionStart!==null)input.setSelectionRange(selectionStart,selectionEnd,selectionDirection);
}
function caseNumberButton(value){
 return `<button type="button" class="copy-case-number" data-copy-case-number="${esc(value)}" title="نسخ رقم القضية" aria-label="نسخ رقم القضية ${esc(value)}"><bdi>${esc(value)}</bdi></button>`;
}
const copyCaseFieldButton='<button type="button" class="copy-case-number" data-copy-case-field aria-label="نسخ رقم القضية" title="نسخ رقم القضية">نسخ</button>';
async function copyCaseNumber(button){
 const value=latinDigits(button.dataset.copyCaseNumber??button.parentElement.querySelector('input')?.value).trim();
 if(!value)return;
 try{
  await navigator.clipboard.writeText(value);
  notify('تم نسخ رقم القضية','success');
 }catch{
  notify('تعذّر نسخ رقم القضية.','error');
 }
}
function savedText(value,original){
 const text=String(value??'');
 return typeof original==='string'&&text===original?original:latinDigits(text).trim();
}
const esc = (v = '') => latinDigits(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayRiyadh = () => {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:KSA,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return `${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}-${parts.find(x=>x.type==='day').value}`;
};
const addDays = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
const tomorrow = () => addDays(todayRiyadh(), 1);
const nextWorkday = () => {let d=todayRiyadh();do{d=addDays(d,1);}while([5,6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));return d;};
const hijri = (d) => {try{return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{numberingSystem:'latn',day:'numeric',month:'long',year:'numeric',timeZone:KSA}).format(new Date(`${d}T12:00:00Z`));}catch{return d;}};
const gregorian = (d) => {try{return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{numberingSystem:'latn',weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:KSA}).format(new Date(`${d}T12:00:00Z`));}catch{return d;}};
// جميع التواريخ المعروضة هجرية بأم القرى، وتُحفظ بصيغة ISO داخل القاعدة للفرز فقط.
const hijriLong=(iso)=>{try{return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{numberingSystem:'latn',weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${iso}T12:00:00Z`));}catch{return iso||'—';}};
const fiveWorkdays=()=>{const out=[];let day=todayRiyadh();while(out.length<5){day=addDays(day,1);if(![5,6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))out.push(day);}return out;};
const dayWithinWindow=(day)=>fiveWorkdays().includes(day);
function workdaySelect(value,attr,label='اختر يوم الجلسات'){
  const days=fiveWorkdays(),opts=days.map((day)=>`<option value="${day}" ${day===value?'selected':''}>${esc(hijriLong(day))}</option>`).join('');
  const outside=value&&!days.includes(value)?`<option selected disabled value="${esc(value)}">تاريخ قديم خارج الأيام الخمسة — اختر يومًا جديدًا</option>`:'';
  return `<select class="field workday-select" ${attr} aria-label="${esc(label)}">${outside}${opts}</select>`;
}
function dayTabs(){return `<div class="workday-tabs" role="group" aria-label="اختيار يوم العمل">${fiveWorkdays().map(day=>{const weekday=new Intl.DateTimeFormat('ar-SA',{numberingSystem:'latn',weekday:'long',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));const parts=hijriParts(day);const label=HIJRI_MONTHS[parts.month-1];const count=state.cases.filter(c=>c.session_date===day).length;return `<button type="button" data-day-tab="${day}" aria-pressed="${day===state.filterDate}" class="workday-tab ${day===state.filterDate?'active':''}"><b>${weekday}</b><span>${parts.day} ${label}</span><small>${count} ${count===1?'قضية':'قضايا'}</small></button>`;}).join('')}</div>`;}
const HIJRI_MONTHS=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const hPartsFormatter=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
function hijriParts(iso){if(!iso)return null;const x=Object.fromEntries(hPartsFormatter.formatToParts(new Date(`${iso}T12:00:00Z`)).map(p=>[p.type,p.value]));return {year:Number(x.year),month:Number(x.month),day:Number(x.day)};}
function fromHijri(year,month,day){
  if(!year||!month||!day||month>12||day>30)return null;
  // قلب التاريخ الهجري إلى قيمة ميلادية داخلية للحفظ، من غير عرضه للمستخدم.
  const cur=todayRiyadh(),cp=hijriParts(cur),monthDelta=(year-cp.year)*12+(month-cp.month);
  const estimate=Date.parse(`${cur}T12:00:00Z`)+Math.round(monthDelta*29.53059+day-cp.day)*86400000;
  for(let diff=0;diff<=24;diff++)for(const sign of diff===0?[0]:[-1,1]){
    const iso=new Date(estimate+sign*diff*86400000).toISOString().slice(0,10),p=hijriParts(iso);
    if(p.year===year&&p.month===month&&p.day===day)return iso;
  }
  return null;
}
function hijriPicker(field,iso,label,{past=10,future=3,minYear,numberedMonths=false,mandatory=false,parts:chosenParts}={}){
  const parts=chosenParts||hijriParts(iso),year=hijriParts(todayRiyadh()).year;
  const attrs=`data-hijri-field="${field}"`;
  const picker=(part,items,placeholder)=>`<select class="input hijri-date-part" ${attrs} data-hijri-part="${part}" aria-label="${label} - ${placeholder}" ${mandatory?'required':''}><option value="">${placeholder}</option>${items.map(([v,l])=>`<option value="${v}" ${parts?.[part]===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const days=Array.from({length:30},(_,i)=>[i+1,String(i+1)]),months=HIJRI_MONTHS.map((v,i)=>[i+1,numberedMonths?`${i+1} - ${v}`:v]);
  const yearValues=minYear===undefined
    ?Array.from({length:past+future+1},(_,i)=>year+future-i)
    :Array.from({length:year+future-minYear+1},(_,i)=>year+future-i);
  const years=yearValues.map(v=>[v,String(v)+' هـ']);
  return `<div class="form-group hijri-field ${mandatory?'mandatory':''}"><label class="form-label">${label}${mandatory?CASE_STAR:''}</label><div class="hijri-parts" role="group" aria-label="${label}">${picker('day',days,'اليوم')}${picker('month',months,'الشهر')}${picker('year',years,'السنة')}</div><small class="hijri-help">التاريخ الهجري وفق تقويم أم القرى${!mandatory?' — اتركه فارغًا إذا لم يوجد':''}</small></div>`;
}
function readHijriPicker(field,required=false){
 const arr=[...document.querySelectorAll(`[data-hijri-field="${field}"]`)];if(!arr.length)return {ok:true,value:''};
 const vals=Object.fromEntries(arr.map(el=>[el.dataset.hijriPart,Number(el.value)||0]));
 const any=Object.values(vals).some(Boolean),all=Object.values(vals).every(Boolean);
 if(!any&&!required)return {ok:true,value:''};
 if(!all)return {ok:false,message:'أكمل اليوم والشهر والسنة بالتاريخ الهجري.'};
 const iso=fromHijri(vals.year,vals.month,vals.day);
 return iso?{ok:true,value:iso}:{ok:false,message:'التاريخ الهجري غير صحيح؛ قد يكون الشهر 29 يومًا فقط.'};
}
function minutesExtract(caseItem){
  if(caseItem.stage==='first')return {overview:'جلسة تحضيرية أولى، لا يوجد ضبط جلسة سابقة.',evidence:''};
  const original=String(caseItem.previous_minutes||'').trim();
  if(!original)return {overview:'لم يُدخل ضبط الجلسة السابقة بعد.',evidence:''};
  const segments=original.replace(/\r/g,'').split(/(?<=[.؛؟\n])\s*|(?=وقررت\s+الدائرة)|(?=ثم\s+قررت\s+الدائرة)/).map(x=>x.trim()).filter(Boolean);
  const highlights=segments.filter(t=>/حضر|قدم|قرر|أفاد|طلب|جواب|مذكرة|جلسة|بينه|بينة|خبير|محضر|حكم|اليمين|الرد/.test(t));
  const overview=short((highlights.length?highlights.slice(0,3):segments.slice(0,2)).join(' '),500);
  const evidence=segments.find(x=>/رفعت\s+الجلسة|أجلت\s+الجلسة|تأجيل\s+الجلسة|لذلك\s+رفعت/.test(x))||'';
  return {overview,evidence:short(evidence,450)};
}
const stamp = (v) => v ? new Intl.DateTimeFormat('ar-SA',{numberingSystem:'latn',timeZone:KSA,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)) : '—';
const tm = (value) => {if(!value)return 'غير محدد';const [h,m]=value.split(':').map(Number);return `${h>12?h-12:h||12}:${String(m).padStart(2,'0')} ${h>=12?'م':'ص'}`;};
const short = (v,len=90) => String(v||'').length>len?String(v).slice(0,len)+'…':String(v||'');
const uid = () => crypto.randomUUID?.() || String(Date.now());
const STAFF = [
  {id:'judge-ziyad',display_name:'زياد محمد البابطين',role:'judge'},
  {id:'secretary-yahya',display_name:'يحيى محمد إبراهيم بكري',role:'secretary'},
  {id:'secretary-abdulrahman',display_name:'عبد الرحمن يحيى علي الشريف',role:'secretary'},
];
// لا توجد قضايا أو مهام افتراضية في النسخة الجديدة.
const DEMO_TASKS = [];
const DEMO_CASES = [];
const DEMO_STORE = 'fourth-circuit-demo-v3-clean';
const app = $('#app');
const state = {client:null,user:null,profile:null,cases:DEMO?[...DEMO_CASES]:[],tasks:DEMO?[...DEMO_TASKS]:[],reportApprovals:[],notifications:[],profiles:DEMO?STAFF:[],taskEditorId:null,taskForm:null,taskFilter:'open',taskSearch:'',selectedPerson:null,loginSent:false,authEmail:'',screen:'dashboard',filterDate:nextWorkday(),search:'',stageFilter:'all',detailId:null,editorId:null,form:null,showSource:false,showNotifs:false,authMode:'login',authBusy:false,loading:false,posterApprovedOnly:false,exporting:false,sub:null,initialNotifLoad:true};
const icons = {dashboard:'⌂',cases:'▤',tasks:'☷',poster:'▧',bell:'◌',plus:'＋',refresh:'↻',check:'✓',edit:'✎',eye:'◉',close:'✕',download:'↓',logout:'↪',shield:'◇',calendar:'▦'};
const actorId=()=>state.user?.id||state.profile?.id||'';
const isJudge=()=>state.profile?.role==='judge';
const roleTitle=(role)=>({judge:'القاضي',writer:'كاتب الضبط',secretary:'أمين السر'}[role]||'مستخدم');
const safeStored=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
function persistDemo(){if(!DEMO)return;localStorage.setItem(DEMO_STORE,JSON.stringify({cases:state.cases,tasks:state.tasks,notifications:state.notifications,reportApprovals:state.reportApprovals}));}
function demoEvent(message){state.notifications.unshift({id:uid(),message,created_at:new Date().toISOString(),read_at:null,recipient_id:'all',actor_id:actorId()});persistDemo();}
const taskCategories={case:'قضية',email:'بريد',ticket:'تذكرة',followup:'متابعة',general:'أخرى'};
const priorityNames={urgent:'عاجلة',normal:'عادية',low:'منخفضة'};
function notify(message,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=latinDigits(message);$('#toast-root').append(el);setTimeout(()=>el.remove(),4700);}
function initialForm(date=state.filterDate){return {case_number:'',session_date:date,session_time:'08:00',plaintiffs:'',defendants:'',case_type:'',claim_summary:'',stage:'first',previous_date:'',previous_minutes:'',status:'draft'};}
const statusTitle = (v)=>({draft:'مسودة',ready:'بانتظار الاعتماد',approved:'معتمدة'}[v]||'مسودة');
const sessionOrdinals=['','الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة','التاسعة','العاشرة'];
function caseStageTitle(c){
 if(c.stage==='first')return 'جلسة تحضيرية (أولى)';
 const n=Number(c.session_number);
 if(!Number.isInteger(n)||n<2||n>100)return 'جلسة لاحقة · رقم الجلسة غير مسجل';
 return sessionOrdinals[n]?`الجلسة ${sessionOrdinals[n]} (${n})`:`الجلسة رقم ${n}`;
}

const listForDate=()=>state.cases.filter(c=>c.session_date===state.filterDate).sort((a,b)=>String(a.session_time).localeCompare(String(b.session_time)));
const filteredCases=()=>listForDate().filter(c=>(state.stageFilter==='all'||c.status===state.stageFilter)&&[c.case_number,c.plaintiffs,c.defendants,c.case_type,c.claim_summary].some(v=>latinDigits(v).includes(state.search)));
const profileName=(id)=>state.profiles.find(p=>p.id===id)?.display_name||'الاسم غير متاح';
function navigate(screen,taskId=null){state.screen=screen;state.focusedTaskId=taskId;if(screen!=='submission')state.submission=null;state.showNotifs=false;render();window.scrollTo({top:0,behavior:'smooth'});}
function shell(){
 const n=state.notifications.filter(x=>!x.read_at).length;
 const nav=[['dashboard','الرئيسية',icons.dashboard],['cases','الجلسات',icons.cases],['tasks','المهام والمتابعة',icons.tasks],['hearings','توزيع الجلسات',icons.calendar]];
 const currentSection=state.screen==='poster'?'cases':state.screen;
 const navCurrent=key=>currentSection===key?' aria-current="page"':'';
 const taskCount=state.tasks.filter(t=>t.status==='open'&&!t.deleted_at).length;
 return `<div class="app circuit-app"><aside class="sidebar">
   <div class="brand"><div class="brand-symbol" aria-hidden="true">▦</div><div><b>${APP_NAME}</b><small>مساحة العمل المشتركة</small></div></div>
   <div class="sidebar-caption">القائمة الرئيسية</div><nav class="nav" aria-label="القائمة الرئيسية">${nav.map(([key,label,icon])=>`<button data-nav="${key}"${navCurrent(key)} class="${currentSection===key?'active':''}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${key==='tasks'&&taskCount?`<span class="nav-count" aria-hidden="true">${taskCount}</span>`:''}</button>`).join('')}</nav>
   <div class="sidebar-bottom"><div class="profile-mini"><span class="avatar">${esc((state.profile?.display_name||'ت')[0])}</span><div><b>${esc(state.profile?.display_name||'النسخة التجريبية')}</b><small>${roleTitle(state.profile?.role)}</small></div></div><button class="side-switch" data-action="logout">↩ ${DEMO?'تبديل المستخدم':'تسجيل الخروج'}</button></div>
  </aside><main class="main"><header class="topbar ministry-top"><div class="topbar-heading"><div class="topbar-title">${APP_NAME}</div><div class="topbar-date">${hijri(todayRiyadh())} <span>·</span> ${gregorian(todayRiyadh())} <span>·</span> <time class="topbar-clock" data-riyadh-clock dir="ltr" title="توقيت الرياض">${riyadhClock()}</time></div></div><div class="toolbar"><span class="header-profile">${esc(state.profile?.display_name||'')}</span><button class="icon-button mobile-logout" data-action="logout" title="${DEMO?'تبديل الاسم':'تسجيل خروج'}">⇄</button><button class="icon-button" data-action="refresh" title="تحديث البيانات">↻</button><button class="icon-button notification-bell" data-action="toggle-notifs" title="الإشعارات">◌ ${n?`<span class="notif-count">${n}</span>`:''}</button></div>${state.showNotifs?renderNotifPopup():''}</header>
  <div class="content"><nav class="service-tiles" aria-label="أقسام الدائرة">
   ${nav.map(([key,label,icon])=>`<button class="service-tile ${currentSection===key?'active':''}" data-nav="${key}"${navCurrent(key)}><span class="tile-symbol" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}
  </nav>${DEMO?`<div class="banner"><strong>واجهة تجريبية فارغة — الحفظ محلي حاليًا</strong>لا يوجد اتصال بقاعدة بيانات مشتركة بعد؛ ما يُحفظ هنا يبقى على هذا الجهاز فقط. يرجى عدم إدخال محاضر أو بيانات قضايا حقيقية حتى اكتمال الربط الآمن.</div>`:''}
  ${state.screen==='submission'?submissionPage():state.screen==='dashboard'?dashboard():state.screen==='tasks'?tasksPage():state.screen==='hearings'?'<div id="hearings-slot"></div>':sessionsPage()}</div></main></div>${state.editorId!==null?editorModal():''}${state.detailId!==null?detailModal():''}${state.taskEditorId!==null?taskEditor():''}${bulkEntry?bulkEditor():''}`;
}
const senderNames=new Set(['يحيى محمد إبراهيم بكري','عبد الرحمن يحيى علي الشريف']);
const isSubmissionSender=()=>!DEMO&&state.profile?.role==='secretary'&&senderNames.has(state.profile.display_name);
const isSubmissionRecipient=()=>!DEMO&&isJudge()&&state.profile?.display_name==='زياد محمد البابطين';
function notificationItem(n){
 const caseNotice=n.case_id&&['created','updated','approved','removed'].includes(n.kind)
  ? /^(.* (?:أضاف|اعتمد|أزال|حدّث) القضية )(.+)$/.exec(n.message)
  : null;
 const message=caseNotice?esc(caseNotice[1])+caseNumberButton(caseNotice[2]):esc(n.message);
 const content=`${message}<small>${stamp(n.created_at)}</small>`;
 if(n.task_id&&n.kind==='task_created')return `<button type="button" class="notice-item ${n.read_at?'':'unread'}" data-open-task="${esc(n.task_id)}">${content}</button>`;
 return n.submission_id
  ?`<button type="button" class="notice-item ${n.read_at?'':'unread'}" data-open-submission="${esc(n.submission_id)}">${content}</button>`
  :`<div class="notice-item ${n.read_at?'':'unread'}">${content}</div>`;
}
async function openSubmission(id){
 if(!isSubmissionRecipient()||!/^[0-9a-f-]{36}$/i.test(id))return;
 const actor=actorId();
 try{
  const {data,error}=await state.client.from('case_submissions').select('*').eq('id',id).single();
  if(error)throw error;
  if(actorId()!==actor)return;
  await state.client.from('notifications').update({read_at:new Date().toISOString()})
   .eq('submission_id',id).is('read_at',null);
  if(actorId()!==actor)return;
  state.submission=data;
  navigate('submission');
  void loadAll({background:true});
 }catch{notify('تعذّر فتح القضايا المرسلة.','error');}
}
function submissionPage(){
 const batch=state.submission;
 if(!batch||!isSubmissionRecipient())return '';
 const cases=state.cases.filter(c=>batch.case_ids.includes(c.id))
  .sort((a,b)=>a.session_time.localeCompare(b.session_time));
 return `<h1 class="heading">القضايا المتعلقة بالإرسال</h1>
  <p class="subheading">${esc(batch.actor_name)} · ${hijriLong(batch.session_date)} · ${stamp(batch.sent_at)}</p>
  <div class="cases-list">${cases.map(caseRow).join('')||'<p class="hint">لا توجد قضايا نشطة من هذا الإرسال.</p>'}</div>`;
}
async function openTaskNotification(id){
 if(!isSubmissionRecipient()||!/^[0-9a-f-]{36}$/i.test(id))return;
 const actor=actorId();
 try{
  const {data,error}=await state.client.from('tasks').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
  if(error)throw error;
  if(actorId()!==actor)return;
  if(!data){notify('هذه المهمة غير متاحة.');return;}
  await state.client.from('notifications').update({read_at:new Date().toISOString()})
   .eq('task_id',id).eq('kind','task_created').is('read_at',null);
  if(actorId()!==actor)return;
  state.tasks=[...state.tasks.filter(task=>task.id!==id),data];
  closeModal(false);
  state.taskEditorId=null;
  state.taskForm=null;
  navigate('tasks',id);
  void loadAll({background:true});
 }catch{notify('تعذّر فتح المهمة.','error');}
}
function openNotificationLink(){
 const params=new URLSearchParams(location.hash.slice(1));
 const task=params.get('task'),submission=params.get('submission');
 if((task||submission)&&isSubmissionRecipient()){
  history.replaceState(null,'',location.pathname+location.search);
  if(task)void openTaskNotification(task);
  else void openSubmission(submission);
 }
}
const casePushKey='BND6akMpzQ92HuUYHN47pGm2rhVJrbEqv1Yv0YM3g7doSzBjVcHl43zcVnKK1C11SPjxPz0IRzhipXFLSbH25-c';
function registerPushWorker(){
 if(isSubmissionRecipient()&&'serviceWorker' in navigator&&'PushManager' in window){
  void navigator.serviceWorker.register('./case-push-sw.js').catch(()=>{});
 }
}
async function enableCasePush(renew=false){
 if(!isSubmissionRecipient())return;
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
  notify('لتفعيل الإشعارات على الآيفون، أضف الموقع إلى الشاشة الرئيسية وافتحه من أيقونته.','error');
  return;
 }
 const actor=actorId();
 try{
  if(await Notification.requestPermission()!=='granted'){
   notify('يلزم السماح بالإشعارات في إعدادات الجهاز.','error');
   return;
  }
  await navigator.serviceWorker.register('./case-push-sw.js');
  const registration=await navigator.serviceWorker.ready;
  const existing=await registration.pushManager.getSubscription();
  if(renew&&existing&&!(await existing.unsubscribe()))throw new Error('unsubscribe_failed');
  const subscription=(!renew&&existing)||
   await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:casePushKey});
  if(actorId()!==actor)return;
  const {error}=await state.client.rpc('register_judge_push',{subscription:subscription.toJSON()});
  if(error)throw error;
  if(renew&&existing&&existing.endpoint!==subscription.endpoint){
   await state.client.rpc('unregister_judge_push',{destination:existing.endpoint});
  }
  notify('فُعّلت إشعارات الإرسال على هذا الجهاز.','success');
  if(renew)void inspectPushDevice();
 }catch{
  notify('تعذّر تفعيل إشعارات الإرسال على هذا الجهاز.','error');
 }
}
async function signOutAccount(){
 if(isSubmissionRecipient()&&'serviceWorker' in navigator){
  try{
   const registration=await navigator.serviceWorker.getRegistration();
   const subscription=await registration?.pushManager?.getSubscription();
   if(subscription){
    await Promise.allSettled([
     state.client.rpc('unregister_judge_push',{destination:subscription.endpoint}),
     subscription.unsubscribe(),
    ]);
   }
  }catch{}
 }
 await state.client?.auth.signOut({scope:'local'});
}
let pushDiagnostics=null;

function workerRevision(worker){
 if(!worker)return Promise.resolve(null);
 return new Promise(resolve=>{
  const channel=new MessageChannel();
  const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
  const timer=setTimeout(()=>finish(null),1500);
  channel.port1.onmessage=event=>finish(event.data?.revision||null);
  worker.postMessage('push-diagnostics',[channel.port2]);
 });
}

async function inspectPushDevice(){
 if(!isSubmissionRecipient())return;
 const actor=actorId();
 const lines=[];
 try{
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  lines.push(standalone?'التشغيل: من أيقونة التطبيق.':'التشغيل: داخل المتصفح.');
  lines.push('إذن الإشعارات: '+({granted:'مسموح',denied:'مرفوض',default:'بانتظار السماح'}[window.Notification?.permission]||'غير متاح'));
  const registration=await navigator.serviceWorker?.getRegistration();
  await registration?.update().catch(()=>{});
  const revision=await workerRevision(registration?.active);
  lines.push(revision?`Service Worker نشط — الإصدار ${revision}.`:registration?.active?'Service Worker نشط — لم يرد على فحص الإصدار.':'لا يوجد Service Worker نشط.');
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){
   const {data,error}=await state.client.rpc('check_judge_push_subscription',{browser_subscription:subscription.toJSON()});
   lines.push(error?'اشتراك الجهاز موجود، وتعذّر التحقق منه على الخادم.':data?'اشتراك الجهاز مطابق للسجل على الخادم.':'اشتراك الجهاز غير مطابق للسجل على الخادم. اضغط تفعيل الإشعارات لمزامنته.');
  }else lines.push('لا يوجد اشتراك Web Push لهذا الجهاز.');
  const cache=await caches.open('fourth-circuit-push-diagnostics');
  const lastTest=pushTestResult?.actor===actorId()?pushTestResult:null;
  const match=lastTest?.workerOnly&&lastTest.testId
   ?await cache.match(new URL('test-'+lastTest.testId+'.json',location.href))
   :await cache.match(new URL('last-receipt.json',location.href));
  if(!match)lines.push(lastTest?.workerOnly?'لم يسجّل Service Worker استلام هذا الاختبار بعد.':'لم يسجّل Service Worker أي استلام بعد.');
  else {
   const receipt=await match.json();
   lines.push(`آخر استلام سجّله Service Worker: ${stamp(receipt.at)}${receipt.testId?' · اختبار '+receipt.testId.slice(0,8):''}.`);
   lines.push(receipt.status==='shown'?'قبِل نظام الجهاز طلب عرض الإشعار.':`فشل طلب العرض (${receipt.error}).`);
   if(receipt.payloadError)lines.push('تعذّرت قراءة بيانات الإشعار، فاستُخدمت رسالة عامة.');
  }
 }catch{
  lines.push('لا توجد قراءة تشخيصية إضافية متاحة على هذا الجهاز.');
 }
 if(actorId()===actor){pushDiagnostics={actor,lines};render();}
}

async function testLocalPushDisplay(){
 if(!isSubmissionRecipient())return;
 try{
  const registration=await navigator.serviceWorker?.getRegistration();
  if(!registration?.active)throw new Error('Service Worker');
  await registration.showNotification('منظم أعمال الدائرة الرابعة',{body:'اختبار العرض على هذا الجهاز'});
  notify('قبِل النظام طلب العرض المحلي. تحقق من مركز الإشعارات.');
 }catch(error){
  notify('تعذّر العرض المحلي ('+error.name+').','error');
 }
}

let pushTestRunning=false;
let pushTestResult=null;

function renderPushTest(){
 const result=pushTestResult?.actor===actorId()?pushTestResult:null;
 const rows=result?.devices?.map(row=>`<li>${esc(row.device)}${result.devices.filter(device=>device.device===row.device).length>1?` (${row.number})`:''} — ${row.ok?'قبلت خدمة الدفع الطلب، والاستلام غير مؤكد':`فشل الإرسال — ${esc(row.reason)}`}</li>`).join('');
 return `<button type="button" class="btn btn-soft" data-action="test-case-push" ${pushTestRunning?'disabled':''}>إرسال إشعار تجريبي</button>
<div role="status" class="hint">${pushTestRunning?'جارٍ إرسال الإشعار…':rows?`<ul>${rows}</ul>${result.testId?`رمز الاختبار: ${esc(result.testId.slice(0,8))}`:''}`:esc(result?.message||'')}</div>
<button type="button" class="btn btn-small" data-action="inspect-push">فحص إشعارات هذا الجهاز</button>
${pushDiagnostics?.actor===actorId()?`<ul class="hint">${pushDiagnostics.lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>
 <button type="button" class="btn btn-small" data-action="local-push-display">اختبار العرض على هذا الجهاز</button>
 <button type="button" class="btn btn-small" data-action="test-push-worker" ${pushTestRunning?'disabled':''}>اختبار الاستلام عبر Service Worker</button>
 <button type="button" class="btn btn-small" data-action="renew-case-push">تجديد اشتراك هذا الجهاز</button>`:''}`;
}

async function testCasePush(workerOnly=false){
 if(!isSubmissionRecipient()||pushTestRunning)return;
 const actor=actorId();
 pushTestRunning=true;
 pushTestResult=null;
 render();
 try{
  const registration=await navigator.serviceWorker?.getRegistration();
  await registration?.update().catch(()=>{});
  const {data,error}=await state.client.functions.invoke('case-submission-push',{body:{test:true,workerOnly}});
  if(error)throw error;
  if(actorId()===actor)pushTestResult={actor,devices:data.results,testId:data.testId,workerOnly,message:'لا توجد أجهزة مسجلة لإشعارات Web Push.'};
 }catch(error){
  if(actorId()===actor)pushTestResult={actor,message:error.context?.status===429?'انتظر 15 ثانية بين كل اختبار وآخر.':'تعذّر إجراء اختبار الإشعارات.'};
 }finally{
  pushTestRunning=false;
  render();
 }
}

function renderNotifPopup(){return `<div class="notif-pop"><div class="status-line"><h3>التنبيهات</h3><button class="btn btn-small" data-action="mark-read">تحديد الكل كمقروء</button></div>${state.notifications.length?`<div class="notice-list">${state.notifications.slice(0,15).map(notificationItem).join('')}</div>`:'<div class="empty" style="padding:20px">لا توجد تنبيهات بعد</div>'}<button class="text-button" data-action="enable-notifs">تفعيل تنبيه المتصفح أثناء فتح الموقع</button>${isSubmissionRecipient()?'<button class="btn btn-soft" data-action="enable-case-push">تفعيل إشعارات الإرسال على هذا الجهاز</button>'+renderPushTest():''}</div>`;}
function stat(label,value,note,icon){return `<div class="stat"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-number">${value}</div><div class="stat-note">${note}</div></div>`;}
function dashboard(){
 const all=listForDate(),approved=all.filter(c=>c.status==='approved').length,ready=all.filter(c=>c.status==='ready').length;
 const pending=state.tasks.filter(t=>!t.deleted_at&&t.status==='open');
 const urgent=pending.filter(t=>t.priority==='urgent');
 return `<div class="welcome-banner"><div><span class="hero-kicker">لوحة تنظيم العمل</span><h1>كل أعمال الدائرة في مكان واحد</h1><p>قضايا الجلسات، ومحاضرها، والمهام الواردة من الكتّاب وأمناء السر؛ تُراجع وتُنجز من لوحة واحدة.</p><div class="hero-date">◷ ${hijriLong(state.filterDate)}</div></div><div class="hero-deco" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div>
 <div class="stats">${stat('قضايا اليوم المحدد',all.length,'بحسب جدول الجلسات','▤')}${stat('قضايا معتمدة',approved,'راجعتها الدائرة','✓')}${stat('بانتظار الاعتماد',ready,'تحتاج مراجعة','◷')}${stat('مهام قيد الإنجاز',pending.length,urgent.length+' منها عاجلة','☷')}</div>
 <div class="dashboard-columns"><section class="dashboard-main"><div class="section-head"><div><span class="section-eyebrow">جلسات الدائرة</span><h2>قضايا اليوم المختار</h2></div><div class="section-actions"><span class="date-heading">اليوم الهجري:</span>${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button></div></div></div>
 ${dayTabs()}<div class="cases-list">${all.length?all.map(c=>caseRow(c)).join(''):emptyState()}</div><div class="compact-actions"><button class="btn btn-soft" data-nav="cases">عرض جميع القضايا ←</button><button class="btn btn-soft" data-nav="poster">حفظ تقرير الجلسات كصورة ↓</button></div></section>
 <aside class="dashboard-side"><div class="card aside-card"><div class="side-card-title"><div><span class="section-eyebrow">مهام ومتابعة</span><h3>المطلوب إنجازه</h3></div><button class="btn btn-primary add-task-button" type="button" data-action="new-task">＋ إضافة مهمة</button></div>${pending.length?pending.slice(0,5).map(taskCardMini).join(''):'<div class="mini-empty">لا توجد مهام معلّقة حاليًا.</div>'}<button class="text-button side-more" data-nav="tasks">فتح قائمة المتابعة ←</button></div>
 <div class="card aside-card"><div class="side-card-title"><h3>آخر الإضافات والتحديثات</h3></div>${state.notifications.length?`<div class="notice-list">${state.notifications.slice(0,4).map(notificationItem).join('')}</div>`:'<p class="hint">تظهر هنا إشعارات من أضاف قضية أو مهمة أو أنجزها.</p>'}</div></aside></div><p class="footer-note">التقرير يستند إلى ما أدخله أمناء السر من تقاضي؛ والمقتطف آلي أولي، ولا يغني عن الضبط الأصلي.</p>`;
}
const hearingsGateway='https://gdqktrvhnnibimgyjncn.supabase.co/functions/v1/hearings-gateway';
const assignmentDays=new Map();
let assignmentActor=null;
let assignmentRefreshRunning=false;

function sessionNumberBadge(item){
 const number=item.stage==='first'?1:Number(item.session_number);
 if(!Number.isInteger(number)||number<1||number>100)return esc(caseStageTitle(item));
 const color=number<=3?'early':number<=6?'middle':number<=10?'late':'extended';
 return `<span class="session-number session-number-${color}"><i aria-hidden="true"></i>الجلسة ${number}</span>`;
}
function sessionTimeKey(value){
 const match=/^(\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?$/.exec(value||'');
 if(!match)return null;
 return match[1]+':'+(match[2]||'00')+(match[3]&&Number(match[3])?match[3].replace(/0+$/,''):'');
}
function savedAssignee(item,rows,cases){
 const time=sessionTimeKey(item.session_time);
 if(!time||cases.filter(other=>!other.deleted_at&&other.session_date===item.session_date&&sessionTimeKey(other.session_time)===time).length!==1)return null;
 const matches=rows.filter(row=>sessionTimeKey(row.starts_at)===time);
 if(matches.length!==1||matches[0].status!=='scheduled')return null;
 return matches[0].actual?.name||null;
}
function assigneeLabel(item){
 const day=assignmentActor===actorId()?assignmentDays.get(item.session_date):null;
 if(day?.unavailable)return 'تعذّر التحقق من التكليف';
 if(!day&&!DEMO)return 'جارٍ التحقق من التكليف…';
 return savedAssignee(item,day?.rows||[],state.cases)||'لم يُحدد المكلف بعد';
}
async function refreshCaseAssignments(){
 if(DEMO||assignmentRefreshRunning||!state.client||!state.profile?.is_active||document.visibilityState==='hidden')return;
 const actor=actorId();
 if(assignmentActor!==actor){assignmentDays.clear();assignmentActor=actor;}
 const items=new Map(state.cases.map(item=>[item.id,item]));
 const dates=[...new Set([...document.querySelectorAll('[data-case-assignee]')]
  .map(node=>items.get(node.dataset.caseAssignee)?.session_date)
  .filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')))];
 const due=dates.filter(date=>Date.now()-(assignmentDays.get(date)?.checkedAt||0)>10000);
 if(!due.length)return;
 assignmentRefreshRunning=true;
 try{
  const {data:{session}}=await state.client.auth.getSession();
  if(!session||actorId()!==actor)return;
  const query=new URLSearchParams({
   select:'hearing_date,hearings(position,starts_at,status,actual:employees!hearings_actual_assignee_id_fkey(name))',
   hearing_date:`in.(${due.join(',')})`,
  });
  const response=await fetch(hearingsGateway,{
   method:'POST',
   headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
   body:JSON.stringify({resource:'hearing_days',method:'GET',query:'?'+query}),
  });
  if(!response.ok)throw new Error('assignments_unavailable');
  const rows=new Map((await response.json()).map(day=>[day.hearing_date,day.hearings]));
  if(actorId()===actor)for(const date of due)assignmentDays.set(date,{rows:rows.get(date)||[],checkedAt:Date.now()});
 }catch{
  if(actorId()===actor)for(const date of due)assignmentDays.set(date,{unavailable:true,checkedAt:Date.now()});
 }finally{
  assignmentRefreshRunning=false;
  if(actorId()===actor){
   const latest=new Map(state.cases.map(item=>[item.id,item]));
   for(const node of document.querySelectorAll('[data-case-assignee]')){
    const item=latest.get(node.dataset.caseAssignee);
    if(item)node.textContent=latinDigits(assigneeLabel(item));
   }
  }
 }
}
let sessionOutcomes=new Map();
function outcomeKey(caseNumber,date){return JSON.stringify([latinDigits(String(caseNumber??'').trim()),date]);}
function priorOutcome(c){
 if(c.stage!=='followup'||!c.previous_date||c.previous_date>=c.session_date)return null;
 return sessionOutcomes.get(outcomeKey(c.case_number,c.previous_date))??null;
}
function outcomeLabel(item){return item.is_result?'نتيجة الجلسة السابقة':'سبب رفع الجلسة السابقة';}
function outcomeEditor(c){
 if(c.stage!=='followup'||!c.previous_date||c.previous_date>=c.session_date||!c.previous_minutes?.trim()||DEMO)return '';
 const item=priorOutcome(c);
 return `<form id="session-outcome-form" class="detail-field detail-wide">
  <label for="session-outcome-text">${item?outcomeLabel(item):'سبب الرفع أو نتيجة الجلسة السابقة'}</label>
  ${item?.evidence?`<p class="quote-text"><small>قرينة من ضبط الجلسة</small><br>${esc(item.evidence)}</p>`:''}
  <input id="session-outcome-text" name="outcome" maxlength="180" value="${esc(item?.outcome??'')}" placeholder="أدخل السبب إذا لم يتضح من الضبط">
  <label><input type="checkbox" name="isResult" ${item?.is_result?'checked':''}> نتيجة قضائية (مثل الحكم أو الشطب)</label>
  <button class="btn btn-small btn-soft" type="submit">حفظ سبب الرفع أو النتيجة</button>
 </form>`;
}
async function saveSessionOutcome(form){
 const id=state.detailId;
 const submit=form.querySelector('button[type=submit]');
 if(!id||submit.disabled)return;
 submit.disabled=true;
 try{
  const {error}=await state.client.rpc('set_session_outcome',{p_case_id:id,p_outcome:latinDigits(form.elements.outcome.value),p_is_result:form.elements.isResult.checked});
  if(error)throw error;
  await loadAll();
  notify('حُفظت نتيجة الجلسة السابقة.','success');
 }catch{notify('تعذّر حفظ نتيجة الجلسة السابقة.','error');}
 finally{submit.disabled=false;}
}
function caseRow(c,selectable=false){const item=priorOutcome(c);return `<article class="case-row"><div class="case-time-slot"><div class="time-pill">${esc(tm(c.session_time))}</div>${selectable&&c.status!=='approved'?`<input type="checkbox" data-approval-case="${esc(c.id)}" aria-label="تحديد القضية ${esc(c.case_number)}" ${approvalSelection.has(c.id)?'checked':''} ${batchApproving?'disabled':''}>`:''}</div><div class="case-content"><div class="case-title">${esc(c.case_type||'قضية دون تصنيف')} <span class="badge ${esc(c.status)}">${c.status==='approved'?'✓ ':''}${statusTitle(c.status)}</span></div><div class="case-sub"><span>رقم ${caseNumberButton(c.case_number)}</span><span>${esc(short(c.plaintiffs,34))} × ${esc(short(c.defendants,34))}</span>${sessionNumberBadge(c)}<span class="byline">أدخله: ${esc(profileName(c.created_by))}</span></div><div class="case-assignee"><span aria-hidden="true">👤</span> <span data-case-assignee="${esc(c.id)}">${esc(assigneeLabel(c))}</span></div>${item?.outcome?`<div class="case-assignee">${outcomeLabel(item)}: ${esc(item.outcome)}</div>`:''}</div><div class="case-row-actions"><button class="btn btn-small" data-detail="${esc(c.id)}">عرض</button><button class="btn btn-small btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button></div></article>`;}
function emptyState(){return `<div class="card empty"><span class="empty-icon">▤</span><b>لا توجد قضايا في هذا التاريخ</b><p>يمكن إضافة القضايا وتعديلها في أي وقت خلال الأيام الخمسة القادمة.</p></div>`;}
function sessionsPage(){
 const report=state.screen==='poster';
 return `<div class="seg sessions-nav" role="group" aria-label="خيارات الجلسات">
  <button type="button" data-nav="cases" class="${report?'':'active'}" aria-pressed="${!report}">جدول الجلسات</button>
  <button type="button" data-nav="poster" class="${report?'active':''}" aria-pressed="${report}">تصميم التقرير</button>
 </div>${report?posterPage():casesPage()}`;
}
const approvalSelection=new Set();
let approvalActor=null;
let batchApproving=false;
let approvalResult=null;
const approvalCandidates=()=>filteredCases().filter(c=>c.status!=='approved');
const approvalReasons={
 not_sent:'لم تُرسل للقاضي بعد',
 already_approved:'معتمدة بالفعل',
 unavailable:'لم تعد ضمن جلسات اليوم',
 required_fields:'بيانات القضية الإلزامية ناقصة',
 previous_session:'تاريخ الجلسة السابقة أو ضبطها ناقص',
 session_number:'رقم الجلسة غير مسجل',
 invalid_case:'تحتاج مراجعة بيانات القضية',
};
function approvalToolbar(){
 if(approvalActor!==actorId()){approvalActor=actorId();approvalSelection.clear();}
 const candidates=approvalCandidates();
 const visible=new Set(candidates.map(c=>c.id));
 for(const id of approvalSelection)if(!visible.has(id))approvalSelection.delete(id);
 const selected=approvalSelection.size;
 const result=approvalResult?.day===state.filterDate&&approvalResult.actor===actorId()?approvalResult:null;
 if(!candidates.length&&!result)return '';
 return `<div class="case-approval" aria-label="اعتماد القضايا">
  ${candidates.length?`<div class="case-approval-actions">
   <label><input type="checkbox" data-approval-all ${selected===candidates.length?'checked':''} ${batchApproving?'disabled':''}> تحديد الكل</label>
   <button type="button" class="btn btn-primary" data-action="approve-selected" ${!selected||batchApproving?'disabled':''}>اعتماد المحدد (${selected})</button>
   <button type="button" class="btn btn-soft" data-action="approve-all-cases" ${batchApproving?'disabled':''}>اعتماد الكل (${candidates.length})</button>
  </div>`:''}
  ${result?`<div class="hint" role="status">${esc(result.message)}${result.skipped.length?`<ul>${result.skipped.map(row=>`<li>القضية ${esc(row.number)} — ${esc(row.reason)}</li>`).join('')}</ul>`:''}</div>`:''}
 </div>`;
}
function changeApprovalSelection(input){
 if(!isJudge()||batchApproving)return;
 if(input.matches('[data-approval-all]')){
  for(const c of approvalCandidates()){
   if(input.checked)approvalSelection.add(c.id);else approvalSelection.delete(c.id);
  }
  for(const box of document.querySelectorAll('[data-approval-case]'))box.checked=input.checked;
 }else if(input.checked)approvalSelection.add(input.dataset.approvalCase);
 else approvalSelection.delete(input.dataset.approvalCase);
 const selected=approvalSelection.size;
 const all=$('[data-approval-all]');
 all.checked=selected===approvalCandidates().length;
 all.indeterminate=selected>0&&!all.checked;
 const button=$('[data-action="approve-selected"]');
 button.disabled=!selected;
 button.textContent=`اعتماد المحدد (${selected})`;
}
async function approveDisplayedCases(all){
 if(!isJudge()||batchApproving)return;
 const candidates=approvalCandidates().filter(c=>all||approvalSelection.has(c.id));
 if(!candidates.length||!confirm(`هل تريد اعتماد القضايا المستوفية من أصل ${candidates.length} قضية؟`))return;
 const day=state.filterDate, actor=actorId();
 batchApproving=true;
 approvalResult=null;
 render();
 try{
  let rows;
  if(DEMO){
   rows=candidates.map(c=>{
    if(c.status!=='ready')return {case_id:c.id,reason:'not_sent'};
    if(Object.keys(caseErrors(c,c.id,{checkDuplicate:false,checkWindow:false})).length)return {case_id:c.id,reason:'invalid_case'};
    c.status='approved';
    state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==day);
    return {case_id:c.id,reason:'approved'};
   });
   persistDemo();
  }else{
   const {data,error}=await state.client.rpc('approve_session_cases',{session_day:day,case_ids:candidates.map(c=>c.id)});
   if(error)throw error;
   rows=data;
  }
  if(actorId()!==actor)return;
  const numbers=new Map(candidates.map(c=>[c.id,c.case_number]));
  const skipped=rows.filter(row=>row.reason!=='approved').map(row=>({number:numbers.get(row.case_id),reason:approvalReasons[row.reason]||approvalReasons.invalid_case}));
  const approved=rows.length-skipped.length;
  approvalResult={day,actor,skipped,message:`تم اعتماد ${approved} من أصل ${candidates.length}.`};
  approvalSelection.clear();
  await loadAll();
 }catch{
  if(actorId()===actor)approvalResult={day,actor,skipped:[],message:'تعذّر تأكيد الاعتماد. حدّث الجدول للتحقق من حالة القضايا.'};
 }finally{
  batchApproving=false;
  render();
 }
}
function casesPage(){return `<div class="eyebrow">السجل المشترك للقضايا</div><h1 class="heading">جدول القضايا والجلسات</h1><p class="subheading">إضافة وتعديل وحفظ بيانات الجلسات مع الاحتفاظ بسجل التعديلات.</p><div class="filters">${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<input type="search" class="search" data-search placeholder="ابحث برقم القضية أو بأحد أطرافها..." value="${esc(state.search)}"/><div class="seg">${[['all','الكل'],['draft','مسودة'],['ready','قيد المراجعة'],['approved','معتمدة']].map(([v,t])=>`<button data-stage="${v}" class="${state.stageFilter===v?'active':''}">${t}</button>`).join('')}</div><div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button></div></div>${dayTabs()}${isJudge()?approvalToolbar():''}<div class="cases-list">${filteredCases().length?filteredCases().map(c=>caseRow(c,isJudge())).join(''):emptyState()}</div>`;}
function posterPage(){
 const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');
 return `<div class="eyebrow">تقرير جاهز للمشاركة</div><h1 class="heading">تصميم تقرير الجلسات</h1><p class="subheading">اختر أحد أيام العمل الخمسة، وصدّر تقرير ذلك اليوم كصورة.</p><div class="poster-controls">${workdaySelect(state.filterDate,'data-filter-date','اختيار يوم التقرير')}<label class="pill"><input type="checkbox" data-approved-only ${state.posterApprovedOnly?'checked':''} /> المعتمدة فقط</label>${isJudge()?`<button class="btn btn-accent" data-action="approve-report" ${!cases.length||listForDate().some(c=>c.status!=='approved')?'disabled':''}>✓ ${isReportApproved()?'التقرير معتمد':'اعتماد التقرير'}</button>`:''}<button class="btn btn-primary" data-action="export-png" ${!cases.length?'disabled':''}>↓ حفظ التصميم كصورة PNG</button><button class="btn" data-action="share-png" ${!cases.length?'disabled':''}>↗ مشاركة الصورة</button></div><div class="report-status">${isReportApproved()?'✓ التقرير معتمد':'◇ التقرير بانتظار الاعتماد'} · ${esc(state.profile?.display_name||'')}</div><div class="poster-page"><div class="poster-head"><div><h2>تنظيم أعمال الدائرة الرابعة</h2><p>تقرير القضايا حسب يوم العمل</p></div><div style="font-size:31px;color:var(--brown)">▦</div></div><div class="poster-banner"><span>${hijriLong(state.filterDate)}</span><span>${cases.length} قضايا</span></div>${cases.length?cases.map((c,i)=>{const m=minutesExtract(c);return `<div class="poster-row"><div class="status-line"><h3>${i+1}. ${esc(c.case_type||'قضية')} — ${esc(tm(c.session_time))}</h3><span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span></div><p class="poster-info">رقم القضية ${caseNumberButton(c.case_number)} | ${caseStageTitle(c)} | ${esc(short(c.plaintiffs,45))} × ${esc(short(c.defendants,45))} | أدخلها: ${esc(profileName(c.created_by))}</p><div class="poster-line"><strong>موضوع الدعوى:</strong> ${esc(c.claim_summary||'غير مدخل')}</div><div class="poster-line"><strong>مقتطف من الضبط السابق:</strong> ${esc(m.overview)}</div>${m.evidence?`<div class="poster-line"><strong>العبارة المتعلقة برفع الجلسة:</strong> ${esc(m.evidence)}</div>`:''}</div>`;}).join(''):'<p class="hint">لا توجد قضايا للعرض في اليوم المختار.</p>'}<div class="poster-footer">المقتطف مستخرج آليًا للمراجعة من النص الأصلي، ولا يغني عنه.</div></div><p class="footer-note">تحتوي الصورة على بيانات القضايا؛ لا تُشارك إلا بالطرق المصرح بها.</p>`;
}
const CASE_FIELDS = [
 ['session_date','تاريخ الجلسة القادمة'],
 ['case_number','رقم القضية'],
 ['session_time','وقت الجلسة'],
 ['plaintiffs','المدعي / المدعون'],
 ['defendants','المدعى عليه / عليهم'],
 ['case_type','نوع الدعوى'],
 ['stage','مرحلة القضية'],
 ['session_number','رقم الجلسة'],
 ['claim_summary','موضوع الدعوى'],
 ['previous_date','تاريخ الجلسة السابقة'],
 ['previous_minutes','ضبط الجلسة السابقة الأصلي'],
];
const CASE_LABELS=Object.fromEntries(CASE_FIELDS);
const CASE_STAR='<span class="case-required" aria-hidden="true"> *</span>';
const caseDrafts=new Map();
let bulkEntry=null;
let caseSaving=false;

function draftKey(editor){
 return 'fourth-circuit-case-entry-v1:'+actorId()+':'+editor;
}
function canStoreCaseDrafts(){
 return DEMO||CONFIG.caseDraftStorageApproved===true;
}
function getCaseDraft(editor){
 const key=draftKey(editor);
 return caseDrafts.get(key)||(canStoreCaseDrafts()?safeStored(key):null);
}
function storeCaseDraft(editor,value){
 const key=draftKey(editor);
 if(value===null)caseDrafts.delete(key);
 else caseDrafts.set(key,value);
 if(!canStoreCaseDrafts())return;
 try{
  if(value===null)localStorage.removeItem(key);
  else localStorage.setItem(key,JSON.stringify(value));
 }catch{
  if(!storeCaseDraft.warned){notify('تعذّر حفظ المسودة في المتصفح؛ ستبقى في الصفحة الحالية.','error');storeCaseDraft.warned=true;}
 }
}
function resetCaseEntry(){
 bulkEntry=null;
 state.editorId=null;
 state.form=null;
}
function rememberCaseEntry(){
 if(bulkEntry)storeCaseDraft('bulk',bulkEntry);
 else if(state.form)storeCaseDraft('single:'+state.editorId,state.form);
}
function draftHint(){
 return canStoreCaseDrafts()
  ?'تُحفظ المسودة على هذا المتصفح لحسابك حتى ينجح الحفظ أو تحذفها.'
  :'تُحفظ المسودة أثناء فتح الصفحة فقط. التخزين بعد التحديث يتطلب اعتماد الجهة المختصة.';
}
function caseField(name,label,control,{wide=false}={}){
 return `<div class="form-group case-field ${wide?'wide':''}" data-case-control="${name}">${label}${control}<small class="case-error" hidden></small></div>`;
}
function caseInput(form,name,id,type='text'){
 return caseField(name,`<label class="form-label" for="${id}">${CASE_LABELS[name]}${CASE_STAR}</label>`,
  `<input id="${id}" class="input" data-form-field="${name}" type="${type}" value="${esc(form[name]||'')}" required ${name==='case_number'?'maxlength="60"':''}>${name==='case_number'?copyCaseFieldButton:''}`);
}
const officeMinutes=Array.from({length:12},(_,i)=>String(i*5).padStart(2,'0'));
function caseTime(form,id){
 const [storedHour,storedMinute]=String(form.session_time||'').split(':');
 const currentTime=/^(0[89]|1[0-3]):[0-5][05](?::00(?:\.0+)?)?$|^14:00(?::00(?:\.0+)?)?$/.test(form.session_time||'');
 const [hour,minute]=form.office_time_parts||(currentTime?[storedHour,storedMinute]:[]);
 const hours=Array.from({length:7},(_,i)=>{
  const h=i+8;
  return [String(h).padStart(2,'0'),h<12?h+' صباحًا':(h===12?12:h-12)+' مساءً'];
 });
 const selects=[['الساعة',hours,hour],['الدقيقة',officeMinutes.map(m=>[m,m]),minute]];
 const controls=selects.map(([label,options,selected],index)=>`<select id="${id}-${index}" class="input" data-case-time-part aria-label="${CASE_LABELS.session_time} — ${label}" required>
  <option value="">${label}</option>${options.map(([value,caption])=>`<option value="${value}"${value===selected?' selected':''}${index===1&&hour==='14'&&value!=='00'?' disabled hidden':''}>${caption}</option>`).join('')}
 </select>`).join('');
 const legacy=form.session_time&&!currentTime?`<small class="hint">الوقت المحفوظ: ${esc(tm(form.session_time))}</small>`:'';
 return caseField('session_time',`<span id="${id}-label" class="form-label">${CASE_LABELS.session_time}${CASE_STAR}</span>`,
  `<div class="case-time" role="group" aria-labelledby="${id}-label">${controls}</div>${legacy}`);
}
function updateCaseTime(target){
 const form=bulkRowFor(target)||state.form;
 if(!form)return;
 const group=target.closest('[data-case-control]');
 const [hourSelect,minuteSelect]=group.querySelectorAll('[data-case-time-part]');
 const hour=hourSelect.value;
 for(const option of minuteSelect.options){
  option.disabled=option.hidden=hour==='14'&&Boolean(option.value)&&option.value!=='00';
 }
 if(hour==='14')minuteSelect.value='00';
 const minute=minuteSelect.value;
 form.session_time=hour&&minute?`${hour}:${minute}`:'';
 form.office_time_parts=[hour,minute];
 group.querySelector('.hint')?.remove();
 rememberCaseEntry();
 if(form.session_time)markCaseError(group,'');
}
function caseArea(form,name,id,rows){
 return caseField(name,`<label class="form-label" for="${id}">${CASE_LABELS[name]}${CASE_STAR}</label>`,
  `<textarea id="${id}" class="input" data-form-field="${name}" rows="${rows}" required>${esc(form[name]||'')}</textarea>`,{wide:true});
}
function caseStage(form,id){
 return caseField('stage',`<label class="form-label" for="${id}">${CASE_LABELS.stage}${CASE_STAR}</label>`,
  `<select id="${id}" class="input" data-form-field="stage" required><option value="first" ${form.stage==='first'?'selected':''}>جلسة تحضيرية (أولى)</option><option value="followup" ${form.stage==='followup'?'selected':''}>جلسة لاحقة</option></select>`);
}
function caseSessionNumber(form,id){
 const options=Array.from({length:99},(_,i)=>i+2).map(n=>
  `<option value="${n}"${Number(form.session_number)===n?' selected':''}>الجلسة ${n}</option>`).join('');
 return caseField('session_number',`<label class="form-label" for="${id}">رقم الجلسة${CASE_STAR}</label>`,
  `<select id="${id}" class="input" data-form-field="session_number" required><option value="">اختر رقم الجلسة</option>${options}</select>`);
}
function caseDate(form,id,options={}){
 const label=options.label||CASE_LABELS.session_date;
const control=workdaySelect(form.session_date,`id="${id}" data-form-field="session_date" required${options.disabled?' disabled':''}`,label);
return caseField('session_date',`<label class="form-label" for="${id}">${label}${CASE_STAR}</label>`,control);
}
const MIN_PREVIOUS_SESSION_YEAR=1430;
function casePreviousDate(form){
 return caseField('previous_date','',hijriPicker('previous_date',form.previous_date,'تاريخ الجلسة السابقة (هجري)',{minYear:MIN_PREVIOUS_SESSION_YEAR,future:0,numberedMonths:true,mandatory:true,parts:form.previous_parts}),{wide:true});
}
function caseDateResult(form){
 if(form.previous_parts){
  const {day,month,year}=form.previous_parts;
  if(!day||!month||!year)return {error:'أكمل اليوم والشهر والسنة بالتاريخ الهجري.'};
  if(year<MIN_PREVIOUS_SESSION_YEAR||year>hijriParts(todayRiyadh()).year)return {error:'اختر سنة من 1430 هـ إلى السنة الهجرية الحالية.'};
  const value=fromHijri(year,month,day);
  return value?{value}:{error:'التاريخ الهجري غير صحيح.'};
 }
 return form.previous_date?{value:form.previous_date}:{error:'أدخل تاريخ الجلسة السابقة.'};
}
function caseErrors(form,id,{defaultDate,checkDuplicate=true,checkWindow=true}={}){
 const errors={};
 for(const name of ['case_number','session_time','plaintiffs','defendants','case_type','claim_summary']){
  if(!String(form[name]??'').trim())errors[name]=`أدخل ${CASE_LABELS[name]}.`;
 }
 const caseNumber=latinDigits(form.case_number).trim();
 if(caseNumber&&(caseNumber.length<2||caseNumber.length>60))errors.case_number='رقم القضية يجب أن يتكون من حرفين إلى 60 حرفًا.';
 const date=defaultDate??form.session_date;
 if(!date||(checkWindow&&!dayWithinWindow(date)))errors.session_date='اختر تاريخًا من أيام العمل الخمسة القادمة.';
 if(!['first','followup'].includes(form.stage))errors.stage='اختر مرحلة القضية.';
 if(form.stage==='followup'){
  if(!Number.isInteger(Number(form.session_number))||Number(form.session_number)<2||Number(form.session_number)>100)errors.session_number='اختر رقم الجلسة من 2 إلى 100.';
  const previous=caseDateResult(form);
  if(previous.error)errors.previous_date=previous.error;
  if(!String(form.previous_minutes??'').trim())errors.previous_minutes='أدخل ضبط الجلسة السابقة كاملًا.';
 }
 if(checkDuplicate&&caseNumber&&state.cases.some(c=>c.id!==id&&latinDigits(c.case_number)===caseNumber&&c.session_date===date)){
  errors.case_number='رقم القضية مسجل في هذا التاريخ.';
 }
 return errors;
}
function markCaseError(group,message){
 if(!group)return;
 group.classList.toggle('case-invalid',Boolean(message));
 const error=group.querySelector('.case-error');
 if(error){
  error.id||=(group.querySelector('[id]')?.id||'case-feedback-'+uid())+'-error';
  error.hidden=!message;error.textContent=message||'';
 }
 for(const input of group.querySelectorAll('input,select,textarea')){
  if(message){input.setAttribute('aria-invalid','true');if(error)input.setAttribute('aria-describedby',error.id);}
  else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');}
 }
}
function showCaseErrors(container,errors){
 let first=null;
 for(const group of container.querySelectorAll('[data-case-control]')){
  const message=errors[group.dataset.caseControl];
  markCaseError(group,message);
  if(message&&!first)first=group.querySelector('[data-case-time-part]:invalid')||group.querySelector('input,select,textarea');
 }
 return first;
}
function focusCaseField(field){
 if(!field)return;
 field.focus({preventScroll:true});
 field.scrollIntoView({block:'center',inline:'nearest'});
}
function casePayload(form,defaultDate,original){
 const payload=Object.fromEntries(CASE_FIELDS.map(([key])=>[key,typeof form[key]==='string'?savedText(form[key],original?.[key]):form[key]]));
 payload.session_date=defaultDate??form.session_date;
 payload.session_number=form.stage==='followup'?Number(form.session_number):null;
 payload.previous_date=form.stage==='followup'?caseDateResult(form).value:null;
 payload.previous_minutes=form.stage==='followup'?savedText(form.previous_minutes,original?.previous_minutes):'';
 return payload;
}
function updateCaseDatePart(form,target){
 form.previous_parts??=hijriParts(form.previous_date)||{};
 form.previous_parts[target.dataset.hijriPart]=Number(target.value)||0;
 rememberCaseEntry();
 markCaseError(target.closest('[data-case-control]'),'');
}
function applyCaseStage(form,select){
 if(select.value===form.stage)return false;
 const hasPrevious=form.previous_date||form.previous_minutes||Object.values(form.previous_parts||{}).some(Boolean);
 if(select.value==='first'&&hasPrevious&&!confirm('سيُمسح تاريخ الجلسة السابقة وضبطها من المسودة. هل تريد التحويل إلى جلسة أولى؟')){
  select.value=form.stage;
  return false;
 }
 clearPreviousSession(form);
 form.previousSessionDiscarded=true;
 form.stage=select.value;
 rememberCaseEntry();
 return true;
}

function newBulkRow(){
 return {...initialForm(),id:crypto.randomUUID(),session_date:'',session_time:'',expanded:false,saved:false};
}
function openBulkEntry(shouldRender=true){
 if(caseSaving)return;
 closeModal(false);
 const saved=getCaseDraft('bulk');
 bulkEntry=Array.isArray(saved?.rows)&&saved.rows.length&&saved.rows.every(row=>/^[0-9a-f-]{36}$/i.test(row.id))?saved:{date:state.filterDate,rows:[newBulkRow()]};
 sortBulkRows();
 if(!bulkEntry.rows.some(row=>row.saved||row.attempted)&&!dayWithinWindow(bulkEntry.date))bulkEntry.date=state.filterDate;
 if(shouldRender)render();
}
function sortBulkRows(){
 bulkEntry.rows.sort((a,b)=>(a.session_time||'99:99').localeCompare(b.session_time||'99:99'));
}
function caseEntryModes(active){
 return `<div class="case-entry-modes" role="group" aria-label="طريقة إضافة القضايا">
  ${[['single','قضية واحدة'],['bulk','عدة قضايا']].map(([mode,label])=>`<button type="button" class="btn ${active===mode?'btn-primary':''}" data-action="case-entry-mode" data-entry-mode="${mode}" aria-pressed="${active===mode}">${label}</button>`).join('')}
 </div>`;
}
function switchCaseEntry(mode){
 const dialog=$('#case-entry-dialog');
 if(caseSaving||!dialog||state.editorId&&state.editorId!=='new'||mode===(bulkEntry?'bulk':'single'))return;
 if(mode==='bulk')openBulkEntry(false);
 else openEditor('new',false);
 const template=document.createElement('template');
 template.innerHTML=bulkEntry?bulkEditor():editorModal();
 const backdrop=template.content.firstElementChild;
 const updatedDialog=backdrop.firstElementChild;
 dialog.parentElement.id=backdrop.id;
 dialog.className=updatedDialog.className;
 dialog.replaceChildren(...updatedDialog.childNodes);
 dialog.querySelector('[data-entry-mode][aria-pressed=true]')?.focus({preventScroll:true});
}
function bulkEditor(){
 const {date,rows}=bulkEntry;
 return `<div class="modal-backdrop" id="bulk-backdrop"><div id="case-entry-dialog" class="modal bulk-modal" role="dialog" aria-modal="true" aria-labelledby="case-entry-title">
  <div class="modal-head"><div><h2 id="case-entry-title">إضافة القضايا</h2><small>${draftHint()}</small></div><button class="icon-button" type="button" data-action="close-bulk" aria-label="إغلاق">✕</button></div>
  ${caseEntryModes('bulk')}
  <form id="bulk-case-form" novalidate><div class="modal-body">
   <div class="bulk-date">${caseDate({session_date:date},'bulk-default-date',{label:'تاريخ الجلسات المشترك (هجري)',disabled:rows.some(row=>row.saved||row.attempted)})}</div>
   <p id="bulk-case-errors" class="case-error" role="alert" hidden></p>
   <div class="bulk-head bulk-grid" aria-hidden="true">${['case_number','session_time','plaintiffs','defendants','case_type','stage'].map(name=>`<span>${CASE_LABELS[name]}${CASE_STAR}</span>`).join('')}<span>خيارات القضية</span></div>
   <div id="bulk-case-rows">${rows.map(bulkRow).join('')}</div>
   <button type="button" class="btn btn-soft" data-action="add-bulk-row">＋ إضافة قضية أخرى</button>
  </div><div class="modal-foot"><button type="button" class="btn btn-danger" data-action="discard-bulk">حذف المسودة</button><button type="button" class="btn" data-action="close-bulk">إغلاق</button><button type="submit" class="btn btn-primary" ${caseSaving?'disabled':''}>${caseSaving?'جارٍ الحفظ…':'حفظ جميع القضايا'}</button></div></form>
 </div></div>`;
}
function bulkRow(row,index){
 const id=name=>`bulk-${row.id}-${name}`;
 const rowLabel=`القضية ${index+1}`;
 return `<article class="bulk-row" data-bulk-row="${row.id}">
  <div class="bulk-row-label" data-bulk-index>${rowLabel}${row.saved?' · حُفظت':row.attempted?' · بانتظار تأكيد الحفظ':''}</div>
  ${row.saved||row.attempted?`<p class="hint">${caseNumberButton(row.case_number)} · ${esc(tm(row.session_time))}</p>`:`<div class="bulk-grid">
   ${caseInput(row,'case_number',id('number'))}${caseTime(row,id('time'))}
   ${caseInput(row,'plaintiffs',id('plaintiffs'))}${caseInput(row,'defendants',id('defendants'))}
   ${caseInput(row,'case_type',id('type'))}${caseStage(row,id('stage'))}
   <div class="bulk-row-actions"><button type="button" class="btn btn-small" data-action="bulk-details" aria-expanded="${row.expanded}">التفاصيل</button><button type="button" class="btn btn-small btn-danger" data-action="remove-bulk-row" aria-label="حذف ${rowLabel}">حذف</button></div>
  </div>${row.expanded?`<div class="form-grid bulk-details">
   ${caseArea(row,'claim_summary',id('summary'),3)}
   ${row.stage==='followup'?caseSessionNumber(row,id('session-number'))+casePreviousDate(row)+caseArea(row,'previous_minutes',id('minutes'),7):''}
  </div>`:''}`}
 </article>`;
}
function bulkRowFor(element){
 const id=element.closest('[data-bulk-row]')?.dataset.bulkRow;
 return bulkEntry?.rows.find(row=>row.id===id);
}
function redrawBulkRows(){
 const root=$('#bulk-case-rows');
 if(root)root.innerHTML=bulkEntry.rows.map(bulkRow).join('');
}
function reorderBulkRows(){
 if(!bulkEntry||caseSaving)return;
 const root=$('#bulk-case-rows');
 if(!root)return;
 const before=bulkEntry.rows.map(row=>row.id).join();
 sortBulkRows();
 if(before===bulkEntry.rows.map(row=>row.id).join())return;
 const focused=document.activeElement?.id;
 redrawBulkRows();
 document.getElementById(focused)?.focus({preventScroll:true});
 rememberCaseEntry();
}
function bulkAction(action,target){
 if(caseSaving)return;
 const row=bulkRowFor(target);
 if(action==='close-bulk'){rememberCaseEntry();bulkEntry=null;render();return;}
 if(action==='discard-bulk'){
  if(!confirm('حذف مسودة الإدخال المتعدد؟'))return;
  storeCaseDraft('bulk',null);bulkEntry=null;render();return;
 }
 if(action==='add-bulk-row'){bulkEntry.rows.push(newBulkRow());}
 if(action==='bulk-details'&&row){row.expanded=!row.expanded;}
 if(action==='remove-bulk-row'&&row){
  bulkEntry.rows=bulkEntry.rows.filter(item=>item!==row);
  if(!bulkEntry.rows.length)bulkEntry.rows.push(newBulkRow());
 }
 rememberCaseEntry();
 redrawBulkRows();
 if(action==='add-bulk-row')focusCaseField($('#bulk-case-rows article:last-child [data-form-field="case_number"]'));
}
async function markSavedRows(entry,rows,author){
 for(let i=0;i<rows.length;i+=50){
  const chunk=rows.slice(i,i+50);
  const {data,error}=await state.client.from('cases').select('id').in('id',chunk.map(row=>row.id)).eq('created_by',author);
  if(error)throw error;
  const saved=new Set(data.map(row=>row.id));
  for(const row of chunk){row.saved=saved.has(row.id);row.attempted=false;}
  if(bulkEntry===entry)rememberCaseEntry();
 }
}
async function saveAndSubmitCases(requestId,records,editExisting=false){
 const {error}=await state.client.rpc('save_and_submit_cases',{request_id:requestId,records,edit_existing:editExisting});
 if(error?.message==='case_submission_already_saved')throw new Error('سبق حفظ هذه المحاولة. حدّث قائمة الجلسات وافتح القضية المحفوظة لتعديلها.');
 if(error)throw error;
}
async function saveBulkEntry(){
 if(caseSaving||!bulkEntry)return;
 const entry=bulkEntry,author=actorId();
 const form=$('#bulk-case-form');
 caseSaving=true;
 const submit=form.querySelector('button[type=submit]');
 submit.disabled=true;
 const summary=$('#bulk-case-errors');
 summary.hidden=true;
 form.inert=true;
 try{
  if(!DEMO&&entry.rows.some(row=>row.attempted&&!row.saved))await markSavedRows(entry,entry.rows.filter(row=>row.attempted&&!row.saved),author);
  if(bulkEntry!==entry||actorId()!==author)return;
  sortBulkRows();
  const rows=entry.rows.filter(row=>!row.saved);
  const errors=new Map();
  const numbers=new Set();
  const defaultError=dayWithinWindow(entry.date)?'':'اختر تاريخًا من أيام العمل الخمسة القادمة.';
  for(const row of rows){
   const rowErrors=caseErrors(row,row.id,{defaultDate:entry.date});
   const key=JSON.stringify([latinDigits(row.case_number).trim(),entry.date]);
   if(numbers.has(key))rowErrors.case_number='رقم القضية مكرر في القائمة لهذا التاريخ.';
   numbers.add(key);
   if(Object.keys(rowErrors).length){row.expanded=true;errors.set(row.id,rowErrors);}
  }
  redrawBulkRows();
  const defaultField=$('.bulk-date [data-case-control]');
  markCaseError(defaultField,defaultError);
  for(const [id,rowErrors] of errors)showCaseErrors(form.querySelector(`[data-bulk-row="${id}"]`),rowErrors);
  if(defaultError||errors.size){
   summary.hidden=false;
   summary.textContent=entry.rows.flatMap((row,index)=>errors.has(row.id)?[`الصف ${index+1}: ${Object.keys(errors.get(row.id)).map(key=>CASE_LABELS[key]).join('، ')}`]:[]).join(' | ')||defaultError;
   form.inert=false;
   focusCaseField(form.querySelector('[aria-invalid=true]'));
   rememberCaseEntry();
   return;
  }
  if(isSubmissionSender()){
   entry.submissionRequestId??=crypto.randomUUID();
   rememberCaseEntry();
   await saveAndSubmitCases(entry.submissionRequestId,entry.rows.map(row=>({...casePayload(row,entry.date),id:row.id})));
  }else for(let offset=0;offset<rows.length;offset+=50){
   if(bulkEntry!==entry||actorId()!==author)return;
   const chunk=rows.slice(offset,offset+50);
   const payloads=chunk.map(row=>({...casePayload(row,entry.date),id:row.id,created_by:author,updated_by:author,status:isSubmissionSender()?'draft':'ready'}));
   for(const row of chunk)row.attempted=true;
   rememberCaseEntry();
   if(DEMO){
    const stamp=new Date().toISOString();
    state.cases.push(...payloads.filter(p=>!state.cases.some(c=>c.id===p.id)).map(p=>({...p,created_at:stamp,updated_at:stamp})));
    for(const row of chunk)row.saved=true;
    demoEvent(`حُفظت ${chunk.length} قضايا تجريبية.`);
   }else{
    const {error}=await state.client.from('cases').upsert(payloads,{onConflict:'id',ignoreDuplicates:true});
    if(error){
     if(/^(22|23|42)/.test(error.code||''))for(const row of chunk)row.attempted=false;
     rememberCaseEntry();
     throw error;
    }
    await markSavedRows(entry,chunk,author);
    if(chunk.some(row=>!row.saved))throw new Error('لم يتأكد حفظ كل القضايا.');
   }
   if(bulkEntry===entry)rememberCaseEntry();
  }
  if(bulkEntry!==entry||actorId()!==author)return;
  storeCaseDraft('bulk',null);
  bulkEntry=null;
  state.filterDate=entry.date;
  render();
  notify(isSubmissionSender()?'حُفظت القضايا وأُرسلت للقاضي.':'تم حفظ جميع القضايا.','success');
  await loadAll();
 }catch(error){
  if(bulkEntry!==entry||actorId()!==author)return;
  redrawBulkRows();
  summary.hidden=false;
  summary.textContent=error.message?.startsWith('سبق حفظ')?error.message:'تعذّر إكمال الحفظ. بقيت المسودة ويمكنك إعادة المحاولة دون تكرار القضايا المحفوظة.';
  if(error.code==='23505')summary.textContent+=' يوجد رقم قضية مسجل بالفعل في التاريخ نفسه.';
 }finally{
  caseSaving=false;
  if(form.isConnected){form.inert=false;submit.disabled=false;}
 }
}

function editorModal(){
 const f=state.form,id=state.editorId,canApprove=isJudge()&&id!=='new';
 const sessionSelect=caseDate(f,'f_session_date',{label:'تاريخ الجلسة القادمة (هجري)'});
 return `<div class="modal-backdrop" id="editor-backdrop"><div id="case-entry-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="case-entry-title"><div class="modal-head"><div><h2 id="case-entry-title">${id==='new'?'إضافة القضايا':'تعديل بيانات القضية'}</h2><small>${draftHint()}</small></div><button class="icon-button" data-action="close-editor" aria-label="إغلاق">✕</button></div>${id==='new'?caseEntryModes('single'):''}<form id="case-form" novalidate><div class="modal-body"><div class="form-grid">${caseInput(f,'case_number','f_case_number','text')}${sessionSelect}${caseTime(f,'f_session_time')}${caseInput(f,'plaintiffs','f_plaintiffs','text')}${caseInput(f,'defendants','f_defendants','text')}${caseInput(f,'case_type','f_case_type','text')}${caseStage(f,'f_stage')}${f.stage==='followup'?caseSessionNumber(f,'f_session_number')+casePreviousDate(f):''}</div><div class="form-grid">${caseArea(f,'claim_summary','f_claim_summary',4)}</div>${f.stage==='followup'?`<div class="divider-label">الضبط الأصلي للجلسة السابقة</div><p class="hint">الصق ضبط الجلسة السابقة كاملًا كما هو في تقاضي، دون اختصار. يُعرض للقاضي مقتطف تحضيري تلقائيًا مع إمكانية فتح الأصل كاملًا.</p><div class="form-grid">${caseArea(f,'previous_minutes','f_previous_minutes',12)}</div>`:''}</div><div class="modal-foot">${id!=='new'?'<button type="button" class="btn btn-danger" data-action="delete-case">حذف من الجدول</button>':''}<button type="button" class="btn" data-action="close-editor">إلغاء</button><button type="button" class="btn btn-soft" data-save="draft">حفظ مسودة محليًا</button><button type="button" class="btn" data-action="discard-case-draft">حذف المسودة</button><button type="button" class="btn btn-primary" data-save="ready">${isSubmissionSender()?'حفظ القضية':'حفظ وإرسال للمراجعة'}</button>${canApprove?'<button type="button" class="btn btn-primary" data-action="approve-from-editor">✓ حفظ واعتماد</button>':''}</div></form></div></div>`;
}
const expectedOutcomes=[
 ['judgment','الحكم في الدعوى'],
 ['reserve_judgment','حجز القضية للحكم'],
 ['close_pleadings','قفل باب المرافعة'],
 ['study','التأجيل للدراسة'],
 ['reply','التأجيل للرد على مذكرة'],
 ['evidence','التأجيل لاستكمال البينة'],
 ['expert','التأجيل لانتظار تقرير خبير'],
 ['authority','التأجيل لانتظار إفادة جهة'],
 ['notification','التأجيل لانتظار التبليغ'],
 ['witnesses','التأجيل لسماع الشهود'],
 ['oath','التأجيل لأداء اليمين'],
 ['settlement','التأجيل لإجراء الصلح'],
 ['stay','وقف السير في الدعوى'],
 ['strike','شطب الدعوى'],
 ['inadmissible','عدم قبول الدعوى'],
 ['other','أخرى'],
];
let casePreparation=null;

function preparationPanel(){
 const preparation=casePreparation;
 if(!preparation||preparation.caseId!==state.detailId||preparation.actor!==actorId())return '';
 if(preparation.loading)return '<div id="judge-preparation" class="detail-wide hint" role="status">جارٍ تحميل تحضير القاضي…</div>';
 if(preparation.loadFailed)return '<div id="judge-preparation" class="detail-wide"><p class="hint" role="alert">تعذّر تحميل تحضير القاضي.</p><button type="button" class="btn btn-soft" data-action="reload-preparation">إعادة المحاولة</button></div>';
 const {expected_outcome,custom_outcome,judge_notes}=preparation.fields;
 return `<form id="judge-preparation" class="detail-wide soft-box">
  <fieldset ${preparation.saving?'disabled':''} style="border:0;padding:0;margin:0;min-width:0">
   <label class="form-label" for="expected-outcome">النتيجة المتوقعة للجلسة</label>
   <select id="expected-outcome" class="input" name="expected_outcome">
    <option value="">بدون نتيجة</option>
    ${expectedOutcomes.map(([value,label])=>`<option value="${value}" ${expected_outcome===value?'selected':''}>${label}</option>`).join('')}
   </select>
   <div id="custom-outcome-field" ${expected_outcome==='other'?'':'hidden'}>
    <label class="form-label" for="custom-outcome">النتيجة المخصصة</label>
    <input id="custom-outcome" class="input" name="custom_outcome" value="${esc(custom_outcome||'')}" ${expected_outcome==='other'?'required':''}>
   </div>
   <label class="form-label" for="judge-notes">ملاحظات القاضي الخاصة</label>
   <textarea id="judge-notes" class="input" name="judge_notes" rows="4">${esc(judge_notes||'')}</textarea>
   <div class="case-entry-actions" style="margin-top:10px">
    <button type="submit" class="btn btn-soft">حفظ تحضير الجلسة</button>
   </div>
  </fieldset>
  <p class="hint" role="status">${esc(preparation.message)}</p>
 </form>`;
}
function refreshPreparationPanel(){
 const panel=$('#judge-preparation');
 if(panel&&isJudge())panel.outerHTML=preparationPanel();
}
async function openCaseDetail(caseId){
 state.detailId=caseId;
 state.showSource=false;
 casePreparation=null;
 if(!isJudge()||!state.client){render();return;}
 const preparation={caseId,actor:actorId(),fields:{},loading:true,message:''};
 casePreparation=preparation;
 render();
 try{
  const {data,error}=await state.client.from('judge_case_preparation')
   .select('expected_outcome,custom_outcome,judge_notes').eq('case_id',caseId).maybeSingle();
  if(error)throw error;
  preparation.fields=data||{};
 }catch{
  preparation.loadFailed=true;
 }finally{
  preparation.loading=false;
  if(casePreparation===preparation)refreshPreparationPanel();
 }
}
function updatePreparationField(input){
 const preparation=casePreparation;
 if(!preparation||!isJudge())return;
 preparation.fields[input.name]=input.value;
 if(input.name==='expected_outcome'){
  const custom=$('#custom-outcome');
  const isOther=input.value==='other';
  $('#custom-outcome-field').hidden=!isOther;
  custom.required=isOther;
 }
}
async function saveCasePreparation(){
 const preparation=casePreparation;
 if(!isJudge()||!preparation||preparation.caseId!==state.detailId||preparation.actor!==actorId()||preparation.loading||preparation.loadFailed||preparation.saving)return;
 const {expected_outcome,custom_outcome,judge_notes}=preparation.fields;
 const outcome=expected_outcome||null;
 const custom=outcome==='other'?custom_outcome?.trim()||null:null;
 const notes=judge_notes?.trim()?judge_notes:null;
 if(outcome==='other'&&!custom){
  preparation.message='اكتب النتيجة المخصصة أو اختر نتيجة أخرى.';
  refreshPreparationPanel();
  $('#custom-outcome')?.focus();
  return;
 }
 preparation.saving=true;
 preparation.message='جارٍ الحفظ…';
 refreshPreparationPanel();
 try{
  const table=state.client.from('judge_case_preparation');
  const {error}=outcome||notes
   ?await table.upsert({case_id:preparation.caseId,expected_outcome:outcome,custom_outcome:custom,judge_notes:notes})
   :await table.delete().eq('case_id',preparation.caseId);
  if(error)throw error;
  preparation.fields={expected_outcome:outcome,custom_outcome:custom,judge_notes:notes};
  preparation.message='تم حفظ تحضير الجلسة.';
 }catch{
  preparation.message='تعذّر الحفظ. حاول مرة أخرى.';
 }finally{
  preparation.saving=false;
  if(casePreparation===preparation)refreshPreparationPanel();
 }
}

function detailModal(){
 const c=state.cases.find(x=>x.id===state.detailId);if(!c)return '';
 const info=(title,value,wide=false)=>`<div class="detail-field ${wide?'detail-wide':''}"><small>${title}</small><p>${esc(value||'غير مدخل')}</p></div>`;
 const m=minutesExtract(c),judge=isJudge();
 return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>القضية رقم ${caseNumberButton(c.case_number)}</h2><small>${esc(c.case_type)} • ${hijriLong(c.session_date)} • ${tm(c.session_time)}</small></div><button class="icon-button" data-action="close-detail">✕</button></div><div class="modal-body"><div class="status-line"><span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span><span class="pill">${sessionNumberBadge(c)}</span></div><div class="detail-grid" style="margin-top:24px">${info('المدعي',c.plaintiffs)}${info('المدعى عليه',c.defendants)}${info('موضوع الدعوى',c.claim_summary,true)}${info('مُدخل القضية',profileName(c.created_by))}${c.previous_date?info('تاريخ الجلسة الأخيرة',hijriLong(c.previous_date),true):''}${judge?`<div class="detail-field detail-wide summary-card"><small>معاينة مختصرة آلية من الضبط الأصلي</small><p>${esc(m.overview)}</p>${m.evidence?`<small class="summary-label">عبارة ورود رفع الجلسة في المحضر</small><p class="quote-text">${esc(m.evidence)}</p>`:''}<small class="summary-note">هذا استخراج نصي أولي غير معتمد، وقد لا يوضح سبب الرفع بدقة. راجع الأصل دائمًا.</small></div><div class="detail-field detail-wide"><button class="btn btn-soft" data-action="toggle-source">${state.showSource?'إخفاء':'عرض'} ضبط الجلسة السابقة كاملًا</button>${state.showSource?`<div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div>`:''}</div>`:`<div class="detail-field detail-wide"><small>الضبط الأصلي كاملًا</small><div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div></div>`}${outcomeEditor(c)}${judge?preparationPanel():''}<div class="detail-field detail-wide"><small>آخر تحديث</small><p>${stamp(c.updated_at)} • ${esc(profileName(c.updated_by||c.created_by))}</p></div></div></div><div class="modal-foot"><button class="btn" data-action="close-detail">إغلاق</button><button class="btn btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button>${isJudge()&&c.status!=='approved'?`<button class="btn btn-primary" data-approve="${esc(c.id)}">✓ اعتماد البيانات</button>`:''}</div></div></div>`;
}
function initialTask(){return {title:'',category:'case',case_number:'',details:'',proposed_action:'',due_date:'',priority:'normal',status:'open'};}
function taskCardMini(t){return `<div class="mini-task"><span class="priority-dot ${esc(t.priority)}"></span><div><b>${esc(short(t.title,62))}</b><small>${esc(taskCategories[t.category]||'أخرى')} ${t.case_number?' · '+esc(t.case_number):''} · بواسطة ${esc(profileName(t.created_by))}</small></div>${isJudge()?`<button class="mini-check" title="تم الإنجاز" data-task-toggle="${esc(t.id)}">✓</button>`:''}</div>`;}
function tasksPage(){
 if(state.focusedTaskId){
  const task=state.tasks.find(t=>t.id===state.focusedTaskId&&!t.deleted_at);
  return `<h1 class="heading">المهمة</h1><button type="button" class="btn btn-soft" data-nav="tasks">عرض جميع المهام</button><div class="tasks-list">${task?taskRow(task,true):'<p class="hint">هذه المهمة غير متاحة.</p>'}</div>`;
 }
 const visible=state.tasks.filter(t=>!t.deleted_at&& (state.taskFilter==='all'||t.status===state.taskFilter) && latinDigits([t.title,t.details,t.case_number,profileName(t.created_by)].join(' ')).includes(state.taskSearch));
 const pending=state.tasks.filter(x=>!x.deleted_at&&x.status==='open'),done=state.tasks.filter(x=>!x.deleted_at&&x.status==='done');
 return `<div class="eyebrow">تنظيم العمل والمتابعة</div><h1 class="heading">المهام والتذكيرات</h1><p class="subheading">أمناء السر يضيفون الأعمال المطلوب متابعتها، وتظهر للقاضي مع اسم من أضافها. وعند الإنجاز يضع القاضي علامة ✓.</p>
 <div class="task-stats">${stat('تحتاج إلى إجراء',pending.length,'لم يتم إنجازها بعد','☷')}${stat('مهام عاجلة',pending.filter(x=>x.priority==='urgent').length,'الأولى بالمتابعة','!')}${stat('تم إنجازها',done.length,'محفوظة في السجل','✓')}</div>
 <div class="section-head"><div><span class="section-eyebrow">سجل الأعمال</span><h2>قائمة المتابعة</h2></div><div class="section-actions"><button class="btn btn-soft" data-action="export-tasks">↓ حفظ المهام كصورة</button><button class="btn btn-primary" data-action="new-task">＋ إضافة مهمة جديدة</button></div></div>
 <div class="filters"><input type="search" class="search" data-task-search placeholder="ابحث عن بريد أو قضية أو رقم تذكرة..." value="${esc(state.taskSearch)}"/><div class="seg">${[['open','قيد الإنجاز'],['done','المنجزة'],['all','الجميع']].map(([v,n])=>`<button data-task-filter="${v}" class="${state.taskFilter===v?'active':''}">${n}</button>`).join('')}</div></div>
 <div class="tasks-list">${visible.length?visible.sort((a,b)=>(a.status==='done')-(b.status==='done')||({urgent:0,normal:1,low:2}[a.priority]-({urgent:0,normal:1,low:2}[b.priority]))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).map(task=>taskRow(task)).join(''):`<div class="card empty"><b>لا توجد مهام في هذا العرض</b><p>يمكن إضافة مهمة خاصة بالبريد، أو قضية تحتاج إلى تصحيح، أو تذكرة، أو أي عمل آخر.</p></div>`}</div>`;
}
function taskRow(t,expanded=false){return `<article class="task-row ${t.status==='done'?'task-done':''}"><div class="task-check-wrap">${isJudge()?`<button class="task-check" title="${t.status==='done'?'إعادة فتح المهمة':'تحديد أنها أُنجزت'}" data-task-toggle="${esc(t.id)}">${t.status==='done'?'✓':'○'}</button>`:`<span class="task-check readonly">${t.status==='done'?'✓':'○'}</span>`}</div><div class="task-info"><div class="task-title">${esc(t.title)} <span class="badge ${t.priority==='urgent'?'priority-urgent':'priority-normal'}">${priorityNames[t.priority]||'عادية'}</span></div><div class="task-details">${esc(expanded?t.details:short(t.details,240))}</div>${t.proposed_action?.trim()?`<div class="task-details"><strong>الإجراء المقترح:</strong> ${esc(t.proposed_action)}</div>`:''}<div class="task-meta"><span>${esc(taskCategories[t.category]||'أخرى')}</span>${t.case_number?`<span>رقم القضية: ${caseNumberButton(t.case_number)}</span>`:''}${t.due_date?`<span>الموعد: ${hijri(t.due_date)}</span>`:''}<span>أضافها: ${esc(profileName(t.created_by))}</span><span>${stamp(t.created_at)}</span><span>${esc(profileName(t.updated_by||t.created_by))}</span>${t.status==='done'?`<span class="done-info">أُنجزت بواسطة: ${esc(profileName(t.completed_by))}</span>`:''}</div></div><div class="task-actions"><span class="badge ${t.status==='done'?'approved':'ready'}">${t.status==='done'?'منجزة':'قيد الإنجاز'}</span><button class="btn btn-small btn-soft" data-task-edit="${esc(t.id)}">✎ تعديل</button></div></article>`;}
function taskEditor(){const f=state.taskForm,id=state.taskEditorId;const fld=(name,label,type='text')=>`<div class="form-group"><label class="form-label">${label}</label><input class="input" type="${type}" data-task-field="${name}" value="${esc(f[name]||'')}" />${name==='case_number'?copyCaseFieldButton:''}</div>`;
 return `<div class="modal-backdrop"><div class="modal task-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${id==='new'?'إضافة مهمة أو تذكير':'تعديل المهمة'}</h2><small>يُحفظ اسم من أضاف المهمة ومن أنجزها.</small></div><button class="icon-button" data-action="close-task-editor">✕</button></div><form id="task-form"><div class="modal-body"><div class="form-grid two"><div class="form-group wide"><label class="form-label">عنوان المهمة *</label><input class="input" data-task-field="title" maxlength="220" required placeholder="مثل: الرد على البريد بخصوص القضية ..." value="${esc(f.title||'')}" /></div><div class="form-group"><label class="form-label">نوع المهمة</label><select class="input" data-task-field="category">${Object.entries(taskCategories).map(([k,v])=>`<option value="${k}" ${f.category===k?'selected':''}>${v}</option>`).join('')}</select></div>${fld('case_number','رقم القضية أو التذكرة (اختياري)')}<div class="form-group"><label class="form-label">الأولوية</label><select class="input" data-task-field="priority">${Object.entries(priorityNames).map(([k,v])=>`<option value="${k}" ${f.priority===k?'selected':''}>${v}</option>`).join('')}</select></div>${hijriPicker('due_date',f.due_date,'التاريخ المطلوب (هجري)',{past:5,future:10})}<div class="form-group wide"><label class="form-label">تفاصيل المطلوب</label><textarea class="input" rows="4" data-task-field="details" placeholder="اذكر مضمون الطلب أو الرسالة والمستند الذي يُرجع إليه.">${esc(f.details||'')}</textarea></div><div class="form-group wide"><label class="form-label" for="task-proposed-action">الإجراء المقترح <span class="case-required" aria-hidden="true">*</span></label><textarea id="task-proposed-action" class="input" rows="2" data-task-field="proposed_action" aria-describedby="task-proposal-hint" required placeholder="مثل: إعداد الإفادة المطلوبة والرفع بها للمحكمة">${esc(f.proposed_action||'')}</textarea><small id="task-proposal-hint" class="hint">توصية للعرض على القاضي.</small></div></div></div><div class="modal-foot">${id!=='new'?'<button type="button" class="btn btn-danger" data-action="delete-task">إزالة المهمة</button>':''}<button type="button" class="btn" data-action="close-task-editor">إلغاء</button><button type="submit" class="btn btn-primary">✓ حفظ المهمة</button></div></form></div></div>`;}
function openTaskEditor(id='new'){state.editorId=null;state.detailId=null;state.taskEditorId=id;state.taskForm=id==='new'?initialTask():{...state.tasks.find(t=>t.id===id)};render();}
function closeTaskEditor(){state.taskEditorId=null;state.taskForm=null;render();}
const savingTaskForms=new WeakSet();
async function saveTask(){const f=state.taskForm;if(f&&savingTaskForms.has(f))return;if(!f||!f.title?.trim()||f.title.trim().length<3)return notify('اكتب عنوان المهمة على الأقل.','error');if(!f.proposed_action?.trim()){ $('#task-proposed-action')?.focus();return notify('أدخل الإجراء المقترح للمهمة.','error');}const due=readHijriPicker('due_date');if(!due.ok)return notify(due.message,'error');f.due_date=due.value;const fields=['title','category','case_number','details','proposed_action','due_date','priority'];const original=state.tasks.find(task=>task.id===state.taskEditorId);const payload=Object.fromEntries(fields.map(k=>[k,savedText(f[k],original?.[k])]));payload.due_date=payload.due_date||null;const editorId=state.taskEditorId,author=actorId(),isNew=editorId==='new';
 savingTaskForms.add(f);
 try{if(DEMO){const old=state.tasks.find(x=>x.id===state.taskEditorId),v={...old,...payload,id:isNew?uid():old.id,status:old?.status||'open',created_by:old?.created_by||actorId(),updated_by:actorId(),created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};state.tasks=isNew?[v,...state.tasks]:state.tasks.map(x=>x.id===v.id?v:x);demoEvent(`${state.profile.display_name} ${isNew?'أضاف':'عدّل'} مهمة: ${v.title}`);closeTaskEditor();notify('تم حفظ المهمة في المعاينة.','success');return;}
const table=state.client.from('tasks');
  if(isNew)f.id??=crypto.randomUUID();
  const res=isNew
   ?await table.upsert({...payload,id:f.id,created_by:author},{onConflict:'id',ignoreDuplicates:true})
   :await table.update(payload).eq('id',editorId);
  if(res.error)throw res.error;
  if(actorId()!==author||state.taskForm!==f)return;
  closeTaskEditor();
  await loadAll();
  notify('تم حفظ المهمة وظهرت في الحسابات المشتركة.','success');
 }catch(e){
  if(actorId()===author&&state.taskForm===f)notify('تعذّر حفظ المهمة: '+e.message,'error');
 }finally{savingTaskForms.delete(f);}
}
async function toggleTask(id){if(!isJudge())return notify('الإنجاز يُعتمد من حساب القاضي.','error');const t=state.tasks.find(x=>x.id===id);if(!t)return;const done=t.status!=='done';try{if(DEMO){t.status=done?'done':'open';t.completed_by=done?actorId():null;t.completed_at=done?new Date().toISOString():null;t.updated_by=actorId();t.updated_at=new Date().toISOString();demoEvent(`${state.profile.display_name} ${done?'أنجز':'أعاد فتح'} مهمة: ${t.title}`);render();return;}const {error}=await state.client.from('tasks').update({status:done?'done':'open'}).eq('id',id);if(error)throw error;await loadAll();notify(done?'تم إنجاز المهمة.':'أُعيد فتح المهمة.','success');}catch(e){notify('تعذّر تحديث المهمة: '+e.message,'error');}}
async function deleteTask(){const id=state.taskEditorId;const t=state.tasks.find(x=>x.id===id);if(!t||!confirm('إزالة هذه المهمة من القائمة؟'))return;try{if(DEMO){state.tasks=state.tasks.filter(x=>x.id!==id);demoEvent(`${state.profile.display_name} أزال مهمة: ${t.title}`);closeTaskEditor();return;}const {error}=await state.client.from('tasks').update({deleted_at:new Date().toISOString()}).eq('id',id);if(error)throw error;closeTaskEditor();await loadAll();}catch(e){notify('تعذّرت إزالة المهمة: '+e.message,'error');}}
function exportTasksPng(){
 const tasks=state.tasks.filter(t=>!t.deleted_at&&t.status==='open').slice(0,65);
 if(!tasks.length)return notify('لا توجد مهام مفتوحة لتصدير صورتها.','error');
 try{
  const w=1100,h=320+tasks.length*250,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.direction='rtl';
  ctx.fillStyle='#f2f7f5';ctx.fillRect(0,0,w,h);ctx.fillStyle='#087967';ctx.fillRect(0,0,w,15);ctx.textAlign='right';ctx.font='bold 43px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('تنظيم أعمال الدائرة الرابعة',w-65,91);ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillStyle='#59796c';ctx.fillText('قائمة المتابعة • المهام غير المنجزة',w-65,136);
  roundRect(ctx,65,168,w-130,70,8,'#087967');ctx.fillStyle='#fff';ctx.font='bold 26px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`${tasks.length} مهام تحتاج متابعة`),w-90,212);
  let y=258;for(const [i,t] of tasks.entries()){
   roundRect(ctx,65,y,w-130,224,9,'#fff');ctx.strokeStyle='#dcebe5';ctx.lineWidth=1;ctx.strokeRect(65,y,w-130,224);ctx.fillStyle='#087967';ctx.font='bold 25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`${i+1}. ${short(t.title,68)}`),w-88,y+41);
   ctx.fillStyle='#718b81';ctx.font='20px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`النوع: ${taskCategories[t.category]||'متابعة'} | الأولوية: ${priorityNames[t.priority]||'عادية'}${t.case_number?' | رقم القضية: '+short(t.case_number,20):''}`),w-88,y+80);
   ctx.fillStyle='#325e52';drawWrapped(ctx,short(t.details||'لا توجد تفاصيل إضافية',240),w-88,y+119,w-185,28,{size:19,max:2});
   ctx.fillStyle='#7d988e';ctx.font='19px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`أضافها: ${short(profileName(t.created_by),34)}${t.due_date?' | المطلوب: '+hijri(t.due_date):''}`),w-88,y+190);y+=250;
  }
  ctx.fillStyle='#607d74';ctx.font='18px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.textAlign='center';ctx.fillText('قائمة متابعة داخلية — يلزم التحقق من الأعمال في نظامها الأصلي',w/2,h-30);
  canvas.toBlob(blob=>{if(!blob)return notify('تعذر إنشاء الصورة.','error');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`مهام-الدائرة-الرابعة-${todayRiyadh()}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);notify('تم تجهيز صورة قائمة المهام.','success');},'image/png');
 }catch(e){notify('تعذر إخراج الصورة: '+e.message,'error');}
}
function isReportApproved(){return !!state.reportApprovals.find(r=>r.session_date===state.filterDate&&r.approved_at);}
async function approveReport(){if(!isJudge())return notify('اعتماد التقرير متاح للقاضي فقط.','error');const all=listForDate();if(!all.length||all.some(x=>x.status!=='approved'))return notify('اعتمد جميع ملخصات القضايا أولًا.','error');if(!confirm('هل راجعت قضايا هذا التاريخ وتريد اعتماد التقرير قبل حفظ صورته؟'))return;
 try{if(DEMO){state.reportApprovals=state.reportApprovals.filter(x=>x.session_date!==state.filterDate);state.reportApprovals.push({session_date:state.filterDate,approved_at:new Date().toISOString(),approved_by:actorId(),case_count:all.length});demoEvent(`${state.profile.display_name} اعتمد تقرير جلسات ${state.filterDate}`);render();return;}const {error}=await state.client.from('report_approvals').upsert({session_date:state.filterDate,approved_at:new Date().toISOString(),case_count:all.length},{onConflict:'session_date'});if(error)throw error;await loadAll();notify('تم اعتماد التقرير ويمكن حفظ الصورة.','success');}catch(e){notify('تعذّر اعتماد التقرير: '+e.message,'error');}}
function render(){if(!dayWithinWindow(state.filterDate))state.filterDate=nextWorkday();if(!app)return;if(DEMO&&!state.profile){app.innerHTML=selectUserScreen();return;}if(!DEMO&&!state.user){app.innerHTML=authScreen();return;}if(!DEMO&&!state.profile?.is_active){app.innerHTML=unavailableAccountScreen();return;}app.innerHTML=shell();if(state.screen==='hearings'){assignmentDays.clear();showHearings();}else void refreshCaseAssignments();}
function selectUserScreen(){return `<div class="choose-screen"><div class="choose-header"><span class="choose-emblem">▦</span><span>${APP_NAME}</span></div><div class="choose-card"><div class="eyebrow">مساحة العمل</div><h1>مرحبًا بك</h1><p>اختر اسمك للدخول، وسيظهر اسمك عند إضافة القضايا والمهام وتعديلها.</p><div class="staff-grid">${STAFF.map(p=>`<button data-person="${esc(p.id)}" class="staff-choice"><span class="staff-avatar">${esc(p.display_name[0])}</span><span><b>${esc(p.display_name)}</b><small>${roleTitle(p.role)}</small></span><span class="staff-arrow">←</span></button>`).join('')}</div><div class="selector-notice">الحفظ الحالي محلي في هذا الجهاز فقط إلى أن تُفعّل قاعدة بيانات مستقلة. اختيار الاسم وحده لا يؤكد هوية الموظف. لا تُدخل معلومات قضائية حقيقية قبل تفعيل الحفظ المشترك المحمي.</div></div><div class="choose-foot">مساحة عمل مستقلة — دون شعار أو انتماء مؤسسي.</div></div>`;}
const loginChoices=[
 ['abdulrahman',STAFF[2].display_name],
 ['yahya',STAFF[1].display_name],
 ['ziyad',STAFF[0].display_name],
];
function authScreen(){
 return `<div class="choose-screen"><div class="choose-header"><span class="choose-emblem">▦</span><span>${APP_NAME}</span></div>
  <div class="choose-card account-card"><h1>تسجيل الدخول</h1>
   <form id="account-login-form">
    <label class="form-label" for="account-name">الاسم</label>
    <select class="input" name="username" id="account-name" autocomplete="username" required>
     <option value="">اختر اسمك</option>${loginChoices.map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}
    </select>
    <label class="form-label" for="account-password">كلمة المرور</label>
    <input class="input" type="password" name="password" id="account-password" inputmode="numeric" autocomplete="current-password" dir="ltr" required maxlength="128">
    <p class="case-error" role="alert" hidden></p>
    <button type="submit" class="btn btn-primary">دخول</button>
   </form>
  </div></div>`;
}
function unavailableAccountScreen(){
 return `<div class="choose-screen"><div class="choose-card account-card"><h1>الحساب غير مخوّل بالدخول</h1>
  <button type="button" class="btn btn-soft" data-action="logout">العودة إلى تسجيل الدخول</button></div></div>`;
}
async function loginAccount(form){
 if(!state.client||state.authBusy)return;
 const {username,password}=form.elements;
 const button=form.querySelector('[type="submit"]');
 const alert=form.querySelector('[role="alert"]');
 state.authBusy=true;
 button.disabled=true;
 alert.hidden=true;
 try{
  const {data,error}=await state.client.functions.invoke('account-login',{
   body:{username:username.value,password:latinDigits(password.value)},
  });
  if(error)throw error;
  const {error:sessionError}=await state.client.auth.setSession(data);
  if(sessionError)throw sessionError;
  password.value='';
 }catch(error){
  const status=error.context?.status;
  alert.textContent=status===429?'محاولات كثيرة. انتظر خمس دقائق ثم أعد المحاولة.'
   :status===401?'تحقق من الاسم وكلمة المرور.':'تعذّر تسجيل الدخول. أعد المحاولة.';
  alert.hidden=false;
  password.focus();
 }finally{
  state.authBusy=false;
  button.disabled=false;
 }
}
function clearPreviousSession(form){
 delete form.previous_parts;
 form.session_number=null;
 form.previous_date=null;
 form.previous_minutes='';
}
function openEditor(id='new',shouldRender=true){
 if(caseSaving)return;
 rememberCaseEntry();
 state.detailId=null;
 casePreparation=null;
 state.showSource=false;
 state.editorId=id;
 bulkEntry=null;
 state.form=getCaseDraft('single:'+id)||(id==='new'?initialForm():{...state.cases.find(x=>x.id===id)});
 if(state.form.stage==='first')clearPreviousSession(state.form);
 if(shouldRender)render();
}
function changeCaseStage(select){
 const row=bulkRowFor(select);
 const form=row||state.form;
 if(!form||!applyCaseStage(form,select))return;
 if(row){
  if(row.stage==='followup')row.expanded=true;
  redrawBulkRows();
 }else render();
 document.getElementById(select.id)?.focus({preventScroll:true});
}
function closeModal(shouldRender=true){
 rememberCaseEntry();
 resetCaseEntry();
 state.detailId=null;
 casePreparation=null;
 state.showSource=false;
 if(shouldRender)render();
}
function discardSingleDraft(){
 if(!state.form||caseSaving||!confirm('حذف مسودة هذه القضية؟'))return;
 storeCaseDraft('single:'+state.editorId,null);
 resetCaseEntry();
 render();
}
async function saveCase(status='ready'){
 if(caseSaving||!state.form)return;
 if(status==='draft'){
  closeModal();
  notify(canStoreCaseDrafts()?'حُفظت المسودة في هذا المتصفح.':'حُفظت المسودة في الصفحة الحالية.','success');
  return;
 }
 const editorId=state.editorId;
 const f=state.form,author=actorId(),editor=$('#case-form');
 const first=showCaseErrors(editor,caseErrors(f,editorId==='new'?(f.submissionRequestId||editorId):editorId));
 if(first){focusCaseField(first);return;}
 const originalCase=state.cases.find(c=>c.id===state.editorId);
 const payload=casePayload(f,undefined,originalCase);
 if(originalCase&&(f.previousSessionDiscarded||f.stage==='first'||originalCase.stage==='first')){
  // Legacy summaries and evidence must not refer to a discarded session.
  Object.assign(payload,{last_session_summary:'',adjournment_reason:'',reason_evidence_quote:'',next_action:'',summary_warning:''});
 }
 payload.status=isSubmissionSender()?'draft':status;payload.updated_by=actorId();if(status==='approved'){if(state.profile?.role!=='judge'){notify('الاعتماد متاح للقاضي فقط.','error');return;}if(payload.stage!=='first'&&!payload.previous_minutes){notify('لا يمكن اعتماد متابعة دون نص الضبط.','error');return;}}if(editorId==='new')payload.created_by=author;caseSaving=true;editor.inert=true;state.loading=true;try{if(DEMO){let isNew=state.editorId==='new';const old=state.cases.find(c=>c.id===state.editorId);const doc={...old,...payload,id:isNew?uid():state.editorId,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),created_by:old?.created_by||actorId()};if(old?.status==='approved'&&JSON.stringify(payload)!==JSON.stringify(Object.fromEntries(Object.keys(payload).map(k=>[k,old[k]])))&&status!=='approved')doc.status='ready';if(status==='approved')doc.approved_by=actorId();state.cases=isNew?[...state.cases,doc]:state.cases.map(x=>x.id===doc.id?doc:x);state.reportApprovals=state.reportApprovals.filter(r=>![doc.session_date,old?.session_date].includes(r.session_date));demoEvent(`${state.profile.display_name} ${isNew?'أضاف':'عدّل'} القضية ${doc.case_number}`);state.filterDate=doc.session_date;notify('تم الحفظ محليًا في هذه المعاينة.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();return;}if(isSubmissionSender()){
  f.submissionRequestId??=crypto.randomUUID();
  rememberCaseEntry();
  await saveAndSubmitCases(f.submissionRequestId,[{...payload,id:editorId==='new'?f.submissionRequestId:editorId,clear_previous:Object.hasOwn(payload,'last_session_summary')}],editorId!=='new');
 }else{
  const query=state.client.from('cases');
  const result=editorId==='new'?await query.insert(payload).select('id').single():await query.update(payload).eq('id',editorId).select('id').single();
  if(result.error)throw result.error;
 }if(actorId()!==author||state.form!==f)return;state.filterDate=payload.session_date;notify(status==='approved'?'حُفظت القضية واعتمدت.':isSubmissionSender()?'حُفظت القضية وأُرسلت للقاضي.':'حُفظت القضية وظهرت في الحسابات المشتركة.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();await loadAll();}catch(err){notify(err.message==='case_waiting_for_submission'?'القضية لم تُرسل للقاضي بعد.':'تعذّر الحفظ: '+err.message,'error');}finally{state.loading=false;caseSaving=false;if(editor.isConnected)editor.inert=false;}}
async function approveCase(id){if(!isJudge())return;const c=state.cases.find(x=>x.id===id);if(!c)return;if(Object.keys(caseErrors(c,id,{checkDuplicate:false,checkWindow:false})).length){openEditor(id);focusCaseField(showCaseErrors($('#case-form'),caseErrors(state.form,id)));return;}if(!window.confirm('هل راجعت بيانات القضية والضبط الأصلي قبل الاعتماد؟'))return;if(DEMO){c.status='approved';c.approved_by=actorId();c.updated_at=new Date().toISOString();state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==c.session_date);demoEvent(`${state.profile.display_name} اعتمد القضية ${c.case_number}`);closeModal();return;}const {error}=await state.client.from('cases').update({status:'approved',approved_by:state.user.id,updated_by:state.user.id}).eq('id',id);if(error)return notify(error.message==='case_waiting_for_submission'?'القضية لم تُرسل للقاضي بعد.':'فشل الاعتماد: '+error.message,'error');notify('تم اعتماد بيانات القضية','success');closeModal();await loadAll();}
async function softDeleteCase(){const id=state.editorId;if(id==='new')return;if(!window.confirm('هل تريد إزالة هذه القضية من الجدول؟ ستبقى نسخة في سجل المراجعات.'))return;if(DEMO){const c=state.cases.find(x=>x.id===id);state.cases=state.cases.filter(x=>x.id!==id);state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==c?.session_date);demoEvent(`${state.profile.display_name} أزال القضية ${c?.case_number||''}`);notify('أُزيلت القضية من المعاينة.','success');closeModal();return;}const {error}=await state.client.from('cases').update({deleted_at:new Date().toISOString(),updated_by:state.user.id}).eq('id',id);if(error)return notify(error.message,'error');notify('أُزيلت القضية من العرض.','success');closeModal();await loadAll();}
async function loadProfile(){const {data,error}=await state.client.from('profiles').select('*').eq('id',state.user.id).maybeSingle();if(error)throw error;state.profile=data||null;}
async function loadSessionOutcomes(){
 const rows=[];
 const pageSize=500;
 for(let start=0;;start+=pageSize){
  const {data,error}=await state.client.from('session_outcomes').select('case_key,hearing_date,outcome,is_result,evidence').order('case_key').order('hearing_date').range(start,start+pageSize-1);
  if(error){console.warn('Session outcomes:',error.code);return null;}
  rows.push(...data);
  if(data.length<pageSize)return rows;
 }
}
let lastDataSnapshot = '';
let loadSequence = 0;
async function loadAll({background=false}={}){if(DEMO){render();return;}if(!state.profile?.is_active)return;
 const userId=state.user.id;
 const sequence=++loadSequence;
 const [cases,notifications,profiles,tasks,reports,outcomes]=await Promise.all([
  state.client.from('cases').select('*').is('deleted_at',null).order('session_date',{ascending:true}),
  state.client.from('notifications').select('*').order('created_at',{ascending:false}).limit(90),
  state.client.from('profiles').select('id,display_name'),
  state.client.from('tasks').select('*').is('deleted_at',null).order('created_at',{ascending:false}),
  state.client.from('report_approvals').select('*'),loadSessionOutcomes()]);
 if(state.user?.id!==userId||sequence!==loadSequence)return;
 const snapshot=JSON.stringify([cases.data,notifications.data,profiles.data,tasks.data,reports.data,outcomes]);
 const changed=snapshot!==lastDataSnapshot;
 lastDataSnapshot=snapshot;
 if(background&&!changed)return;
 if(outcomes)sessionOutcomes=new Map(outcomes.map(item=>[outcomeKey(item.case_key,item.hearing_date),item]));
 if(cases.error)notify('تعذّر تحديث القضايا: '+cases.error.message,'error');else state.cases=cases.data||[];
 if(tasks.error)notify('تعذّر تحديث المهام: '+tasks.error.message,'error');else state.tasks=tasks.data||[];
 if(reports.error)console.warn('Report approvals:',reports.error);else state.reportApprovals=reports.data||[];
 if(notifications.error)console.warn('Notifications:',notifications.error);else {
  const oldIds=new Set(state.notifications.map(n=>n.id)),next=notifications.data||[];
  if(!state.initialNotifLoad){for(const x of next){if(x.kind!=='submitted'&&x.kind!=='task_created'&&!oldIds.has(x.id)&&!x.read_at&&'Notification' in window && Notification.permission==='granted'&&document.visibilityState==='hidden'){try{new Notification('تنظيم أعمال الدائرة الرابعة',{body:'لديك إشعار جديد. افتح الموقع للاطلاع عليه.',icon:'assets/favicon.svg'});}catch{}}}}
  state.notifications=next;state.initialNotifLoad=false;
 }
 if(!profiles.error)state.profiles=profiles.data||[];
 if(!background||(!state.form&&!bulkEntry&&!document.activeElement?.closest('#session-outcome-form')))render();
}
async function refreshProfile(){try{await loadProfile();render();if(state.profile?.is_active){await loadAll();subscribeChanges();registerPushWorker();openNotificationLink();}}catch(e){notify(e.message,'error');}}
async function init(){if(DEMO){
  // إزالة جميع بيانات المعاينة القديمة مرة واحدة بعد الترقية.
  if(!localStorage.getItem('fourth-circuit-v3-reset-done')){
    ['fourth-circuit-demo-v2','fourth-circuit-demo-v3-clean','fourth-circuit-demo-profile'].forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('fourth-circuit-v3-reset-done','1');
  }
  const d=safeStored(DEMO_STORE);
  if(d){state.cases=d.cases||[];state.tasks=d.tasks||[];state.notifications=d.notifications||[];state.reportApprovals=d.reportApprovals||[];}else persistDemo();
  const chosen=localStorage.getItem('fourth-circuit-demo-profile');
  state.profile=STAFF.find(p=>p.id===chosen)||null;render();return;}
try{const mod=await import('https://esm.sh/@supabase/supabase-js@2.119.0?bundle');state.client=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});const {data:{session},error}=await state.client.auth.getSession();if(error)throw error;if(session?.user.is_anonymous)await state.client.auth.signOut({scope:'local'});state.user=session?.user.is_anonymous?null:session?.user||null;if(state.user){await loadProfile();if(state.profile?.is_active){await loadAll();subscribeChanges();registerPushWorker();openNotificationLink();}}state.client.auth.onAuthStateChange((_ev,session)=>{const old=state.user?.id;state.user=session?.user.is_anonymous?null:session?.user||null;if(state.user?.id!==old){assignmentDays.clear();assignmentActor=null;resetCaseEntry();state.detailId=null;casePreparation=null;state.submission=null;state.focusedTaskId=null;if(state.sub){state.client.removeChannel(state.sub);state.sub=null;}state.profile=null;state.notifications=[];lastDataSnapshot='';state.initialNotifLoad=true;render();if(state.user){setTimeout(async()=>{await refreshProfile();if(state.profile?.is_active)subscribeChanges();},10);}}});render();}catch(e){app.innerHTML=`<div class="empty" style="min-height:90vh"><b>تعذّر تشغيل الموقع</b><p>${esc(e.message)}. تحقق من بيانات الاتصال بالقاعدة والاتصال بالإنترنت.</p></div>`;}}
let backgroundRefreshRunning=false;
async function refreshInBackground(){
 if(backgroundRefreshRunning||!state.profile?.is_active)return;
 backgroundRefreshRunning=true;
 try{await loadAll({background:true});}finally{backgroundRefreshRunning=false;}
}
if(!DEMO){
 window.setInterval(refreshInBackground,4000);
 window.setInterval(refreshCaseAssignments,11000);
 document.addEventListener('visibilitychange',refreshCaseAssignments);
 document.addEventListener('visibilitychange',refreshInBackground);
}
function subscribeChanges(){if(state.sub)return;state.sub=state.client.channel('case-team-sync').on('postgres_changes',{event:'*',schema:'public',table:'cases'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'tasks'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'report_approvals'},refreshInBackground).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`recipient_id=eq.${state.user.id}`},refreshInBackground).subscribe(status=>{if(status==='SUBSCRIBED')refreshInBackground();});}
async function markRead(){if(DEMO){state.notifications.forEach(x=>x.read_at=new Date().toISOString());persistDemo();render();return;}const {error}=await state.client.from('notifications').update({read_at:new Date().toISOString()}).is('read_at',null);if(error)notify(error.message,'error');await loadAll();}
async function enableNotifications(){if(!('Notification' in window))return notify('المتصفح لا يدعم إشعارات الويب بالطريقة الحالية.','error');try{const permission=await Notification.requestPermission();notify(permission==='granted'?'تم السماح بالتنبيهات أثناء عمل الصفحة.':'لم يُسمح بتنبيهات المتصفح.');}catch(e){notify(e.message,'error');}}
function roundRect(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function drawWrapped(ctx,text,x,y,maxWidth,lineH,{size=23,color='#272321',weight='400',max=100}={}){ctx.font=`${weight} ${size}px "Thmanyah Sans", Tahoma, Arial, sans-serif`;ctx.fillStyle=color;ctx.textAlign='right';ctx.direction='rtl';let parts=latinDigits(text||'—').split('\n'),lines=[];for(const part of parts){let line='';for(const word of part.split(/\s+/)){let test=(line?line+' ':'')+word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}lines.push(line||' ');}let visible=lines.slice(0,max);if(lines.length>max)visible[visible.length-1]+='…';for(let i=0;i<visible.length;i++)ctx.fillText(visible[i],x,y+i*lineH);return y+visible.length*lineH;}
function buildPosterCanvas(cases){const scale=1;const canvas=document.createElement('canvas');const w=1200,pad=73,content=w-pad*2;let y=0;const sizes=[];const meas=canvas.getContext('2d');function height(text,maxwidth,size=22,lh=38,max=100){meas.font=`400 ${size}px "Thmanyah Sans", Tahoma, Arial, sans-serif`;let lines=0;for(let p of latinDigits(text||'—').split('\n')){let line='';for(const word of p.split(/\s+/)){const test=(line?line+' ':'')+word;if(meas.measureText(test).width>maxwidth&&line){lines++;line=word;}else line=test;}lines++;}return Math.min(lines,max)*lh;}
for(const c of cases){let part=220;const m=minutesExtract(c);part+=height('موضوع الدعوى: '+short(c.claim_summary,400),content-88,23,38,5);part+=height('مقتطف من الضبط: '+m.overview,content-88,23,38,7);if(m.evidence)part+=height('عبارة الرفع: '+m.evidence,content-88,23,38,6);sizes.push(Math.max(300,part+20));}
const totalHeight=Math.min(30000,400+sizes.reduce((a,b)=>a+b+26,0)+110);canvas.width=w*scale;canvas.height=totalHeight*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#f2f7f6';ctx.fillRect(0,0,w,totalHeight);roundRect(ctx,0,0,w,21,0,'#087967');ctx.fillStyle='#087967';ctx.textAlign='right';ctx.direction='rtl';ctx.font='bold 49px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('تنظيم أعمال الدائرة الرابعة',w-pad,103);ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillStyle='#77695e';ctx.fillText('تقرير قضايا الجلسات اليومي',w-pad,153);ctx.textAlign='left';ctx.fillStyle='#087967';ctx.font='bold 66px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('▦',pad,120);ctx.fillStyle='#d9cabb';ctx.fillRect(pad,182,content,2);roundRect(ctx,pad,213,content,90,16,'#087967');ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 30px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(hijri(state.filterDate),w-pad-25,268);ctx.textAlign='left';ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(cases.length+' قضايا',pad+25,268);y=337;
for(let i=0;i<cases.length;i++){let c=cases[i],heightBox=sizes[i];if(y+heightBox>totalHeight-70)break;roundRect(ctx,pad,y,content,heightBox,17,'#ffffff');ctx.strokeStyle='#e3d9ce';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(pad,y,content,heightBox,17);ctx.stroke();ctx.textAlign='right';ctx.direction='rtl';ctx.fillStyle='#087967';ctx.font='bold 29px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`${i+1}. ${short(c.case_type||'قضية',44)} — ${tm(c.session_time)}`),w-pad-28,y+48);ctx.fillStyle='#746d66';ctx.font='20px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits(`رقم ${c.case_number}  •  ${caseStageTitle(c)}  •  ${statusTitle(c.status)}`),w-pad-30,y+90);const parties=short(`${c.plaintiffs||'—'}   ×   ${c.defendants||'—'}`,82);ctx.fillText(latinDigits(parties),w-pad-30,y+124);ctx.fillStyle='#e9e1d7';ctx.fillRect(pad+25,y+175,content-50,1);ctx.fillStyle='#746d66';ctx.fillText('أدخلها: '+profileName(c.created_by),w-pad-30,y+155);let yy=y+217;const m=minutesExtract(c);const lines=[['الموضوع',short(c.claim_summary||'غير مدخل',400),5],['مقتطف من الضبط',m.overview,7],...(m.evidence?[['عبارة الرفع',m.evidence,6]]:[])];for(const [name,value,max] of lines){yy=drawWrapped(ctx,`${name}: ${value}`,w-pad-30,yy,content-60,38,{size:23,max})+10;}y+=heightBox+26;}
ctx.fillStyle='#81766e';ctx.textAlign='center';ctx.font='21px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(latinDigits((isReportApproved()?'تقرير معتمد • ':'تقرير غير معتمد • ')+'أعده: '+short(state.profile?.display_name||'',24)+' • مستخرج نصي أولي من الضبط'),w/2,Math.min(y+29,totalHeight-45));return canvas;}
async function sharePng(){const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');if(!cases.length)return;try{const canvas=buildPosterCanvas(cases);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('تعذّر إنشاء الصورة');const file=new File([blob],`تقرير-القضايا-${state.filterDate}.png`,{type:'image/png'});if(navigator.share && navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'تقرير تنظيم أعمال الدائرة الرابعة'});}else{notify('المشاركة المباشرة غير متاحة في هذا المتصفح؛ استخدم حفظ الصورة ثم أرسلها.');exportPng();}}catch(e){if(e.name!=='AbortError')notify('تعذرت مشاركة الصورة: '+e.message,'error');}}
function exportPng(){const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');if(!cases.length)return notify('لا توجد قضايا لتصديرها.','error');try{const canvas=buildPosterCanvas(cases);canvas.toBlob(blob=>{if(!blob)return notify('لم يتمكن المتصفح من إنشاء الصورة.','error');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`تقرير-القضايا-${state.filterDate}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);notify('تم تجهيز صورة التقرير للحفظ.','success');},'image/png');}catch(e){notify('تعذر حفظ الصورة: '+e.message,'error');}}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-copy-case-number],[data-copy-case-field],[data-open-task],[data-open-submission],[data-nav],[data-action],[data-edit],[data-detail],[data-approve],[data-save],[data-stage],[data-person],[data-task-toggle],[data-task-edit],[data-task-filter],[data-day-tab]');if(!target)return;if(target.matches('[data-copy-case-number],[data-copy-case-field]')){void copyCaseNumber(target);return;}if(target.dataset.openTask){void openTaskNotification(target.dataset.openTask);return;}if(target.dataset.openSubmission){void openSubmission(target.dataset.openSubmission);return;}if(target.dataset.dayTab){if(dayWithinWindow(target.dataset.dayTab)){state.filterDate=target.dataset.dayTab;render();}return;}if(target.dataset.person){const choice=STAFF.find(x=>x.id===target.dataset.person);if(DEMO){state.profile=choice;localStorage.setItem('fourth-circuit-demo-profile',choice.id);notify(`مرحبًا ${choice.display_name}`,'success');render();}return;}if(target.dataset.taskToggle){await toggleTask(target.dataset.taskToggle);return;}if(target.dataset.taskEdit){openTaskEditor(target.dataset.taskEdit);return;}if(target.dataset.taskFilter){state.taskFilter=target.dataset.taskFilter;render();return;}if(target.dataset.nav){navigate(target.dataset.nav);return;}if(target.dataset.edit){openEditor(target.dataset.edit);return;}if(target.dataset.detail){void openCaseDetail(target.dataset.detail);return;}if(target.dataset.approve){await approveCase(target.dataset.approve);return;}if(target.dataset.save){await saveCase(target.dataset.save);return;}if(target.dataset.stage){state.stageFilter=target.dataset.stage;render();return;}const action=target.dataset.action;if(!action)return;switch(action){case 'new-case':openEditor();break;case 'case-entry-mode':switchCaseEntry(target.dataset.entryMode);break;case 'close-bulk':case 'discard-bulk':case 'add-bulk-row':case 'bulk-details':case 'remove-bulk-row':bulkAction(action,target);break;case 'discard-case-draft':discardSingleDraft();break;case 'new-task':openTaskEditor();break;case 'close-task-editor':closeTaskEditor();break;case 'delete-task':await deleteTask();break;case 'approve-report':await approveReport();break;case 'export-tasks':exportTasksPng();break;case 'reload-preparation':void openCaseDetail(state.detailId);break;case 'close-editor':case 'close-detail':if(!caseSaving)closeModal();break;case 'toggle-source':state.showSource=!state.showSource;render();break;case 'next-day':state.filterDate=nextWorkday();render();break;case 'approve-from-editor':await saveCase('approved');break;case 'delete-case':await softDeleteCase();break;case 'toggle-notifs':state.showNotifs=!state.showNotifs;render();break;case 'mark-read':await markRead();break;case 'inspect-push':await inspectPushDevice();break;case 'local-push-display':await testLocalPushDisplay();break;case 'test-push-worker':await testCasePush(true);break;case 'renew-case-push':await enableCasePush(true);break;case 'test-case-push':await testCasePush();break;case 'enable-case-push':await enableCasePush();break;case 'approve-selected':await approveDisplayedCases(false);break;case 'approve-all-cases':await approveDisplayedCases(true);break;case 'enable-notifs':await enableNotifications();break;case 'refresh':await loadAll();notify('تم تحديث البيانات من القاعدة.','success');break;case 'logout':if(DEMO){resetCaseEntry();state.profile=null;localStorage.removeItem('fourth-circuit-demo-profile');render();}else await signOutAccount();break;case 'toggle-auth':state.authMode=state.authMode==='login'?'signup':'login';render();break;case 'export-png':exportPng();break;case 'share-png':await sharePng();break;}});
document.addEventListener('input',e=>{normalizeNumberInput(e.target);if(e.target.matches('#judge-preparation [name]')){updatePreparationField(e.target);return;}if(e.target.dataset.formField&&e.target.dataset.formField!=='stage'){const row=bulkRowFor(e.target);if(row||state.form){(row||state.form)[e.target.dataset.formField]=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');}}if(e.target.dataset.taskField&&state.taskForm){state.taskForm[e.target.dataset.taskField]=e.target.value;}if(e.target.matches('[data-task-search]')){state.taskSearch=e.target.value;const list=$('.tasks-list');if(list){const temp=state.taskSearch;state.taskSearch=temp;list.innerHTML=state.tasks.filter(t=>!t.deleted_at&&(state.taskFilter==='all'||t.status===state.taskFilter)&&[t.title,t.details,t.case_number,profileName(t.created_by)].join(' ').includes(temp)).map(task=>taskRow(task)).join('')||'<div class="card empty">لا توجد نتائج</div>';}}if(e.target.matches('[data-search]')){state.search=e.target.value;const list=$('.cases-list');if(list)list.innerHTML=filteredCases().length?filteredCases().map(c=>caseRow(c,isJudge())).join(''):emptyState();void refreshCaseAssignments();}});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-case-time-part]')){updateCaseTime(e.target);return;}
 if(e.target.matches('[data-form-field="stage"]')&&(state.form||bulkEntry)){changeCaseStage(e.target);return;}
 if(e.target.id==='bulk-default-date'&&bulkEntry){bulkEntry.date=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');return;}
 if(e.target.matches('[data-approval-case],[data-approval-all]')){changeApprovalSelection(e.target);return;}
 if(e.target.matches('[data-filter-date]')){if(dayWithinWindow(e.target.value)){state.filterDate=e.target.value;render();}else notify('اختر يوم عمل من الأيام الخمسة القادمة.','error');}
 if(e.target.matches('[data-hijri-part]')){
  const fld=e.target.dataset.hijriField;
  if(fld==='previous_date'){const caseForm=bulkRowFor(e.target)||state.form;if(caseForm)updateCaseDatePart(caseForm,e.target);return;}
  const selection=readHijriPicker(fld);
  const form=fld==='previous_date'?state.form:state.taskForm;
  if(selection.ok&&form)form[fld]=selection.value;
  if(!selection.ok && [...document.querySelectorAll(`[data-hijri-field="${fld}"]`)].every(el=>el.value))notify(selection.message,'error');
 }
 if(e.target.matches('[data-approved-only]')){state.posterApprovedOnly=e.target.checked;render();}
});
document.addEventListener('focusout',e=>{
 if(!e.target.matches('[data-bulk-row] [data-case-time-part]'))return;
 const group=e.target.closest('.case-time');
 if(!group.contains(e.relatedTarget))setTimeout(()=>{
  if(group.isConnected&&!group.contains(document.activeElement))reorderBulkRows();
 },0);
});
document.addEventListener('submit',e=>{if(e.target.id==='account-login-form'){e.preventDefault();void loginAccount(e.target);return;}if(e.target.id==='session-outcome-form'){e.preventDefault();void saveSessionOutcome(e.target);return;}if(e.target.id==='judge-preparation'){e.preventDefault();void saveCasePreparation();return;}if(e.target.id==='bulk-case-form'){e.preventDefault();void saveBulkEntry();}if(e.target.id==='case-form'){e.preventDefault();saveCase('ready');}if(e.target.id==='task-form'){e.preventDefault();saveTask();}});
let hearingsContainer;
let hearingsMount;
function showHearings(){
 const slot=$('#hearings-slot');
 if(!hearingsContainer){
  hearingsContainer=document.createElement('section');
  hearingsContainer.id='hearings-root';
  hearingsContainer.setAttribute('aria-label','توزيع الجلسات');
  hearingsContainer.innerHTML='<p class="hint" role="status">جارٍ فتح توزيع الجلسات…</p>';
 }
 slot.append(hearingsContainer);
 if(hearingsMount)return;
 hearingsMount=import('./assets/hearings/main.js?v=5.0.26').then(module=>{
  module.mount(hearingsContainer,{
   getToken:async()=>state.client?(await state.client.auth.getSession()).data.session?.access_token??null:null,
   subscribe:listener=>{
    if(!state.client)return ()=>{};
    let activeDevice=state.user?.id;
    const {data:{subscription}}=state.client.auth.onAuthStateChange((event,session)=>{
     if(activeDevice===session?.user.id&&event!=='USER_UPDATED')return;
     activeDevice=session?.user.id;
     setTimeout(listener,0);
    });
    return ()=>subscription.unsubscribe();
   },
   signOut:async()=>{await state.client?.auth.signOut({scope:'local'});navigate('dashboard');}
  });
  hearingsContainer.replaceChildren();
 }).catch(()=>{
  hearingsMount=null;
  hearingsContainer.textContent='تعذّر فتح توزيع الجلسات. اختر القسم مجددًا للمحاولة.';
 });
}
window.addEventListener('hashchange',openNotificationLink);
if(location.hash==='#hearings')state.screen='hearings';
init();
window.setInterval(updateClock,1000);
