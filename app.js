import {addPasskeySettings,addPasskeyUnlock} from './diwan/passkeys.js?v=2';
import {canShowDiwan, loadDiwanAccess, mountDiwan} from './diwan-panel.js?v=5.0.40';
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
  const now=new Date();
  const clock=document.querySelector('[data-riyadh-clock]');
  if(clock)clock.textContent=riyadhClock(now);
  updateCurrentSessionHighlight(now);
}
const $ = (s) => document.querySelector(s);
const latinDigits=(value='')=>String(value??'').replace(/[٠-٩۰-۹]/g,digit=>
 String(digit.charCodeAt(0)-(digit<='٩'?0x660:0x6f0)));
function normalizeNumberInput(input){
 if(input.closest('#diwan-slot'))return;
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
const riyadhDateFormatter = new Intl.DateTimeFormat('en-US',{timeZone:KSA,year:'numeric',month:'2-digit',day:'2-digit'});
const todayRiyadh = (now=new Date()) => {
  const parts = riyadhDateFormatter.formatToParts(now);
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
function displayWorkday(now=new Date()){
 // Saudi Arabia is UTC+3. Subtracting five local hours moves the civil boundary to 05:00.
 let day=new Date(now.getTime()-2*3600000).toISOString().slice(0,10);
 // الجمعة والسبت: يبدأ عرض يوم الأحد، واليوم المنتهي ينتقل إلى «الجلسات السابقة».
 while([5,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))day=addDays(day,1);
 return day;
}
let displayedWorkday=displayWorkday();
function refreshDisplayWorkday(){
 const day=displayWorkday();
 if(day===displayedWorkday)return;
 displayedWorkday=day;
 if(!state.historyDate)state.filterDate=day;
 if(!state.form&&!bulkEntry&&!state.taskForm&&['dashboard','cases','poster'].includes(state.screen))render();
}
const displayDays=()=>[...new Set([displayedWorkday,todayRiyadh(),...fiveWorkdays()])].filter(day=>![5,6].includes(new Date(day+'T12:00:00Z').getUTCDay()));
function previousSessionsPicker(){
 const days=[...new Set(state.cases.map(c=>c.session_date).filter(date=>date<displayedWorkday))].sort().reverse();
 return `<select class="field workday-select" data-previous-sessions aria-label="عرض الجلسات السابقة"><option value="">عرض الجلسات السابقة</option>${days.map(date=>`<option value="${esc(date)}" ${state.historyDate===date?'selected':''}>${esc(hijriLong(date))}</option>`).join('')}</select>`;
}
const dayWithinWindow=(day)=>fiveWorkdays().includes(day);
function workdaySelect(value,attr,label='اختر يوم الجلسات'){
  const days=attr==='data-filter-date'?displayDays():fiveWorkdays(),opts=days.map((day)=>`<option value="${day}" ${day===value?'selected':''}>${esc(hijriLong(day))}</option>`).join('');
  const outside=value&&!days.includes(value)?`<option selected disabled value="${esc(value)}">${attr==='data-filter-date'?esc(hijriLong(value)):'تاريخ قديم خارج الأيام الخمسة — اختر يومًا جديدًا'}</option>`:'';
  return `<select class="field workday-select" ${attr} aria-label="${esc(label)}">${outside}${opts}</select>`;
}
function dayTabs(){return `<div class="workday-tabs" role="group" aria-label="اختيار يوم العمل">${displayDays().map(day=>{const weekday=new Intl.DateTimeFormat('ar-SA',{numberingSystem:'latn',weekday:'long',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));const parts=hijriParts(day);const label=HIJRI_MONTHS[parts.month-1];const count=state.cases.filter(c=>c.session_date===day).length;return `<button type="button" data-day-tab="${day}" aria-pressed="${day===state.filterDate}" class="workday-tab ${day===state.filterDate?'active':''}"><b>${weekday}</b><span>${parts.day} ${label}</span><small>${count} ${count===1?'قضية':'قضايا'}</small></button>`;}).join('')}</div>`;}
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
const state = {client:null,user:null,profile:null,cases:DEMO?[...DEMO_CASES]:[],tasks:DEMO?[...DEMO_TASKS]:[],reportApprovals:[],notifications:[],profiles:DEMO?STAFF:[],taskEditorId:null,taskForm:null,taskFilter:'mine',taskSearch:'',selectedPerson:null,loginSent:false,authEmail:'',screen:'dashboard',filterDate:displayedWorkday,historyDate:null,search:'',stageFilter:'all',detailId:null,editorId:null,form:null,showSource:false,showNotifs:false,authMode:'login',authBusy:false,loading:false,posterApprovedOnly:false,exporting:false,sub:null,initialNotifLoad:true,followups:new Map()};
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
function initialForm(date=dayWithinWindow(state.filterDate)?state.filterDate:nextWorkday()){return {case_number:'',session_date:date,session_time:'08:00',plaintiffs:'',defendants:'',case_type:'',claim_summary:'',stage:'first',previous_date:'',previous_minutes:'',status:'draft'};}
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
function navigate(screen,taskId=null){if(screen==='diwan'&&!canShowDiwan(state))return;if(screen==='review')loadReview();state.screen=screen;state.focusedTaskId=taskId;if(screen!=='submission')state.submission=null;state.showNotifs=false;render();window.scrollTo({top:0,behavior:'smooth'});}
const organizerPasskeyButton='<button type="button" class="icon-button" aria-label="مفتاح مرور المنظّم" title="مفتاح مرور المنظّم" data-action="organizer-passkey-settings">🔑</button>';
let shellEntered=false,dataRevealed=false;
function bootSkeleton(){return `<div class="boot-skeleton" aria-busy="true" aria-label="جارٍ تحميل البيانات">${'<div class="sk-card"><span></span><span></span><span></span></div>'.repeat(4)}</div>`;}
function shell(){
 const n=state.unreadCount??0;
 const nav=[['dashboard','الرئيسية',icons.dashboard],['cases','الجلسات',icons.cases],['review','مراجعة جلسات اليوم',icons.check],['tasks','المهام والمتابعة',icons.tasks],['hearings','توزيع الجلسات',icons.calendar]];
 const diwanAccess=canShowDiwan(state);
 if(diwanAccess)nav.push(['diwan','ديوان القضايا',icons.cases]);
 const inDiwan=state.screen==='diwan'&&diwanAccess;
 const currentSection=state.screen==='poster'?'cases':state.screen;
 const navCurrent=key=>currentSection===key?' aria-current="page"':'';
 const taskCount=state.tasks.filter(t=>myAssignment(t)&&!myAssignment(t).executed_at).length;
 const enter=!shellEntered;shellEntered=true;const reveal=!state.booting&&!dataRevealed;if(reveal)dataRevealed=true;
 return `<div class="app circuit-app${enter?' app-enter':''}${reveal?' data-reveal':''}"><aside class="sidebar">
   <div class="brand"><div class="brand-symbol" aria-hidden="true">▦</div><div><b>${APP_NAME}</b><small>مساحة العمل المشتركة</small></div></div>
   <div class="sidebar-caption">القائمة الرئيسية</div><nav class="nav" aria-label="القائمة الرئيسية">${nav.map(([key,label,icon])=>`<button data-nav="${key}"${navCurrent(key)} class="${currentSection===key?'active':''}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${key==='tasks'&&taskCount?`<span class="nav-count" aria-hidden="true">${taskCount}</span>`:''}</button>`).join('')}</nav>
   <div class="sidebar-bottom"><div class="profile-mini"><span class="avatar">${esc((state.profile?.display_name||'ت')[0])}</span><div><b>${esc(state.profile?.display_name||'النسخة التجريبية')}</b><small>${roleTitle(state.profile?.role)}</small></div></div><button class="side-switch" data-action="logout">↩ ${DEMO?'تبديل المستخدم':'تسجيل الخروج'}</button></div>
  </aside><main class="main"><header class="topbar ministry-top"><div class="topbar-heading"><div class="topbar-title">${APP_NAME}</div><div class="topbar-date">${hijri(todayRiyadh())} <span>·</span> ${gregorian(todayRiyadh())} <span>·</span> <time class="topbar-clock" data-riyadh-clock dir="ltr" title="توقيت الرياض">${riyadhClock()}</time></div></div><div class="toolbar">${state.organizerPasskeyOwnerUid===state.user?.id&&state.user?.id?organizerPasskeyButton:''}<span class="header-profile">${esc(state.profile?.display_name||'')}</span><button class="icon-button mobile-logout" data-action="logout" title="${DEMO?'تبديل الاسم':'تسجيل خروج'}">⇄</button><button class="icon-button" data-action="refresh" title="تحديث البيانات">↻</button><button class="icon-button notification-bell" data-action="toggle-notifs" title="الإشعارات">◌ ${n?`<span class="notif-count">${n}</span>`:''}</button></div>${state.showNotifs?renderNotifPopup():''}</header>
  <div class="content">${inDiwan?'':`<nav class="service-tiles" aria-label="أقسام الدائرة">
   ${nav.map(([key,label,icon])=>`<button class="service-tile ${currentSection===key?'active':''}" data-nav="${key}"${navCurrent(key)}><span class="tile-symbol" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('')}
  </nav>`}${DEMO?`<div class="banner"><strong>واجهة تجريبية فارغة — الحفظ محلي حاليًا</strong>لا يوجد اتصال بقاعدة بيانات مشتركة بعد؛ ما يُحفظ هنا يبقى على هذا الجهاز فقط. يرجى عدم إدخال محاضر أو بيانات قضايا حقيقية حتى اكتمال الربط الآمن.</div>`:''}
  ${state.booting?bootSkeleton():state.screen==='submission'?submissionPage():state.screen==='dashboard'?dashboard():state.screen==='tasks'?tasksPage():state.screen==='review'?reviewPage():state.screen==='hearings'?'<div id="hearings-slot"></div>':inDiwan?'<section id="diwan-slot" aria-label="ديوان القضايا"></section>':sessionsPage()}</div></main></div>${state.editorId!==null?editorModal():''}${state.detailId!==null?detailModal():''}${state.taskEditorId!==null?taskEditor():''}${bulkEntry?bulkEditor():''}`;
}
const senderNames=new Set(['يحيى محمد إبراهيم بكري','عبد الرحمن يحيى علي الشريف']);
const isSubmissionSender=()=>!DEMO&&state.profile?.role==='secretary'&&senderNames.has(state.profile.display_name);
const isSubmissionRecipient=()=>!DEMO&&isJudge()&&state.profile?.display_name==='زياد محمد البابطين';
function notificationItem(n){
 return `<button type="button" class="notice-item ${n.read_at?'':'unread'}" data-notice-id="${esc(n.id)}">${esc(n.message)}<small>${stamp(n.created_at)}</small></button>`;
}
async function openNotice(id){
 const item=state.notifications.find(row=>row.id===id);
 if(!item)return;
 if(!item.read_at&&!await markRead({p_id:id}))return;
 if(item.task_id)await openTaskNotification(item.task_id,false);
 else if(item.submission_id)await openSubmission(item.submission_id,false);
 else if(item.case_id){state.showNotifs=false;await openCaseDetail(item.case_id);}
}
async function openSubmission(id,read=true){
 if(!isSubmissionRecipient()||!/^[0-9a-f-]{36}$/i.test(id))return;
 const actor=actorId();
 try{
  const {data,error}=await state.client.from('case_submissions').select('*').eq('id',id).single();
  if(error)throw error;
  if(actorId()!==actor)return;
  if(read)await markRead({p_submission:id},false);
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
async function openTaskNotification(id,read=true){
 if(!state.profile?.is_active||!/^[0-9a-f-]{36}$/i.test(id))return;
 const actor=actorId();
 try{
  const {data,error}=await state.client.from('tasks').select('*,sent_by_me,task_assignments(*)').eq('id',id).is('deleted_at',null).maybeSingle();
  if(error)throw error;
  if(actorId()!==actor)return;
  if(!data){notify('هذه المهمة غير متاحة.');return;}
  if(read)await markRead({p_task:id},false);
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
 if((task&&state.profile?.is_active)||(submission&&isSubmissionRecipient())){
  history.replaceState(null,'',location.pathname+location.search);
  if(task)void openTaskNotification(task);
  else void openSubmission(submission);
 }
}
// Keep this application server key and the worker URL/scope stable across releases.
const casePushKey='BND6akMpzQ92HuUYHN47pGm2rhVJrbEqv1Yv0YM3g7doSzBjVcHl43zcVnKK1C11SPjxPz0IRzhipXFLSbH25-c';
const pushOwnerKey='fourth-circuit-push-owner';
let pushOperation=Promise.resolve();
function queuePushOperation(operation){
 const result=pushOperation.then(operation);
 pushOperation=result.catch(()=>{});
 return result;
}
function rememberedPushOwner(){
 try{return localStorage.getItem(pushOwnerKey);}catch{return null;}
}
function rememberPushOwner(actor){
 try{localStorage.setItem(pushOwnerKey,actor);}catch{}
}
function supportsPush(){
 return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}
async function stablePushRegistration(){
 const registration=await navigator.serviceWorker.register('./case-push-sw.js');
 return registration.active?registration:navigator.serviceWorker.ready;
}
function subscribePush(registration){
 return registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:casePushKey});
}
async function syncPushSubscription(actor){
 if(actor!==actorId()||!state.profile?.is_active)return;
 const registration=await stablePushRegistration();
 if(Notification.permission!=='granted'||actor!==actorId())return;
 let subscription=await registration.pushManager.getSubscription();
 if(rememberedPushOwner()!==actor){
  if(!subscription)return;
  const {data,error}=await state.client.rpc('check_judge_push_subscription',{browser_subscription:subscription.toJSON()});
  if(error||!data||actor!==actorId())return;
  rememberPushOwner(actor);
  return;
 }
 subscription??=await subscribePush(registration);
 if(actor!==actorId())return;
 const {error}=await state.client.rpc('register_judge_push',{subscription:subscription.toJSON()});
 if(error)throw error;
}
function registerPushWorker(){
 if(state.profile?.is_active&&supportsPush()){
  const actor=actorId();
  void queuePushOperation(()=>syncPushSubscription(actor)).catch(()=>{});
 }
}
async function enableCasePush(renew=false){
 if(!state.profile?.is_active)return;
 if(!supportsPush()){
  notify('لتفعيل الإشعارات على الآيفون، أضف الموقع إلى الشاشة الرئيسية وافتحه من أيقونته.','error');
  return;
 }
 const actor=actorId();
 try{
  if(Notification.permission!=='granted'&&await Notification.requestPermission()!=='granted'){
   notify('يلزم السماح بالإشعارات في إعدادات الجهاز.','error');
   return;
  }
  await queuePushOperation(async()=>{
   if(actorId()!==actor)return;
   const registration=await stablePushRegistration();
   const existing=await registration.pushManager.getSubscription();
   if(renew&&existing&&!(await existing.unsubscribe()))throw new Error('unsubscribe_failed');
   const subscription=(!renew&&existing)||await subscribePush(registration);
   if(actorId()!==actor)return;
   const {error}=await state.client.rpc('register_judge_push',{subscription:subscription.toJSON()});
   if(error)throw error;
   rememberPushOwner(actor);
   if(renew&&existing&&existing.endpoint!==subscription.endpoint){
    await state.client.rpc('unregister_judge_push',{destination:existing.endpoint});
   }
   notify('فُعّلت الإشعارات على هذا الجهاز.','success');
  });
  if(renew&&actorId()===actor)void inspectPushDevice();
 }catch{
  notify('تعذّر تفعيل الإشعارات على هذا الجهاز.','error');
 }
}
// خروج تلقائي بعد 30 دقيقة دون استخدام (مشترك بين تبويبات الجهاز نفسه). تشغيل إضافة تقاضي يُعد استخدامًا.
const IDLE_MS=30*60*1000,IDLE_KEY='fourth-circuit-last-activity';
let idleNotice=false,lastTouch=0;
function touchActivity(){lastTouch=Date.now();try{localStorage.setItem(IDLE_KEY,String(lastTouch));}catch{}}
function idleExpired(){try{const t=Number(localStorage.getItem(IDLE_KEY));return t>0&&Date.now()-t>IDLE_MS;}catch{return false;}}
for(const ev of ['pointerdown','keydown','touchstart','wheel','input'])addEventListener(ev,()=>{if(Date.now()-lastTouch>15000)touchActivity();},{passive:true,capture:true});
setInterval(async()=>{
 if(DEMO||!state.client||!state.user||!idleExpired())return;
 try{await state.client.auth.signOut({scope:'local'});}catch{}
 notify('تم تسجيل الخروج تلقائيًا بعد 30 دقيقة دون استخدام.');
},60000);
async function signOutAccount(){
 await queuePushOperation(async()=>{
  if(state.profile?.is_active&&supportsPush()){
   try{
    const registration=await navigator.serviceWorker.getRegistration();
    const subscription=await registration?.pushManager?.getSubscription();
    if(subscription){
     const {data}=await state.client.rpc('check_judge_push_subscription',{browser_subscription:subscription.toJSON()});
     if(data)rememberPushOwner(actorId());
     await state.client.rpc('unregister_judge_push',{destination:subscription.endpoint});
    }
   }catch{}
  }
  await state.client?.auth.signOut({scope:'local'});
 });
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

function renderNotifPopup(){
 const unread=state.notifications.filter(n=>!n.read_at);
 const rows=state.showReadNotices?state.notifications.filter(n=>n.read_at):unread;
 return `<div class="notif-pop"><div class="status-line"><h3>${state.showReadNotices?'سجل الإشعارات':'التنبيهات الجديدة'}</h3><button class="btn btn-small" data-action="mark-read" ${state.unreadCount?'':'disabled'}>تحديد الكل كمقروء</button></div>
 <div class="notice-list">${rows.map(notificationItem).join('')||'<p class="hint">لا توجد إشعارات في هذا العرض.</p>'}</div>
 ${state.showReadNotices&&state.hasMoreNoticeHistory?'<button class="text-button" data-action="more-notice-history">عرض الأقدم</button>':''}
 <button class="text-button" data-action="notice-history">${state.showReadNotices?'عرض التنبيهات الجديدة':'سجل الإشعارات'}</button>
 <button class="btn btn-soft" data-action="enable-case-push">تفعيل الإشعارات على هذا الجهاز</button>
 ${isSubmissionRecipient()?renderPushTest():''}</div>`;
}
function stat(label,value,note,icon){return `<div class="stat"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-number">${value}</div><div class="stat-note">${note}</div></div>`;}
function dashboard(){
 const all=listForDate(),approved=all.filter(c=>c.status==='approved').length;
 const pending=state.tasks.filter(t=>myAssignment(t)&&!myAssignment(t).executed_at);
 const urgent=pending.filter(t=>t.priority==='urgent');
 return `<div class="welcome-banner"><div><span class="hero-kicker">لوحة تنظيم العمل</span><h1>كل أعمال الدائرة في مكان واحد</h1><p>قضايا الجلسات، ومحاضرها، والمهام الواردة من الكتّاب وأمناء السر؛ تُراجع وتُنجز من لوحة واحدة.</p><div class="hero-date">◷ ${hijriLong(state.filterDate)}</div></div><div class="hero-deco" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div>
 <div class="stats">${stat('قضايا اليوم المحدد',all.length,'بحسب جدول الجلسات','▤')}${stat('قضايا معتمدة',approved,'تُعتمد عند الحفظ','✓')}${stat('مهام قيد الإنجاز',pending.length,urgent.length+' منها عاجلة','☷')}</div>
 <div class="dashboard-columns"><section class="dashboard-main"><div class="section-head"><div><span class="section-eyebrow">جلسات الدائرة</span><h2>قضايا اليوم المختار</h2></div><div class="section-actions"><span class="date-heading">اليوم الهجري:</span>${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button></div></div></div>
 ${previousSessionsPicker()}${dayTabs()}<div class="cases-list">${dayCasesList(all,emptyState())}</div><div class="compact-actions"><button class="btn btn-soft" data-nav="cases">عرض جميع القضايا ←</button><button class="btn btn-soft" data-nav="poster">حفظ تقرير الجلسات كصورة ↓</button></div></section>
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
function sessionStartMinute(time){
 const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time??'');
 if(!match||Number(match[1])>23||Number(match[2])>59)return null;
 return Number(match[1])*60+Number(match[2]);
}
function currentSessionStart(cases,minute){
 const starts=cases.map(c=>sessionStartMinute(c.session_time)).filter(start=>start!==null);
 let current=null,next=null;
 for(const start of starts){
  if(start<=minute&&(current===null||start>current))current=start;
  if(start>minute&&(next===null||start<next))next=start;
 }
 return current!==null&&(next!==null||minute<current+30)?current:null;
}
function updateCurrentSessionHighlight(now=new Date()){
 if(!['dashboard','cases'].includes(state.screen))return;
 const rows=document.querySelectorAll('[data-case-session-time]');
 if(!rows.length)return;
 let current=null;
 if(state.filterDate===todayRiyadh(now)){
  const parts=Object.fromEntries(clockFormatter.formatToParts(now).map(part=>[part.type,part.value]));
  const minute=(Number(parts.hour)%12+(parts.dayPeriod==='PM'?12:0))*60+Number(parts.minute);
  current=currentSessionStart(listForDate(),minute);
 }
 for(const row of rows){
  const active=current!==null&&sessionStartMinute(row.dataset.caseSessionTime)===current;
  if(row.classList.contains('case-session-current')===active)continue;
  row.classList.toggle('case-session-current',active);
  row.querySelector('.current-session-label').hidden=!active;
  if(active)row.setAttribute('aria-current','time');
  else row.removeAttribute('aria-current');
 }
}
// ===== متابعة الإفادات والخطابات وتقارير الخبراء =====
const FOLLOWUP_KINDS=[['info','إفادة جهة'],['letter','خطاب'],['expert','تقرير خبير'],['other','أخرى']];
const FOLLOWUP_STATUS=[['waiting','بانتظار الورود','ready'],['arrived','وصل','approved'],['not_issued','لم يصدر لوجود خلل','danger'],['no_reply','لم يرد','danger'],['other','أخرى (انظر الملاحظة)','draft']];
const followupLabel=(list,key)=>(list.find(x=>x[0]===key)||[])[1]||'';
function followupSuggestion(c){
 const text=latinDigits(`${priorOutcome(c)?.outcome||''} ${c.previous_minutes?.slice(-600)||''}`);
 if(/خبير|الخبرة|مقدر|هيئة النظر|تقرير/.test(text))return 'expert';
 if(/إفادة|افادة|ورود/.test(text))return 'info';
 if(/خطاب|الكتابة إلى|الكتابة الى|مخاطبة|يكتب/.test(text))return 'letter';
 return null;
}
function followupBadge(c){
 const f=state.followups?.get(c.id);if(!f)return '';
 const st=FOLLOWUP_STATUS.find(x=>x[0]===f.status)||FOLLOWUP_STATUS[0];
 return `<span class="badge followup-${esc(st[2])}" title="${esc(f.note||'')}">${esc(followupLabel(FOLLOWUP_KINDS,f.kind))}: ${esc(st[1])}</span>`;
}
function followupPanel(c){
 if(DEMO)return '';
 const f=state.followups?.get(c.id);const suggest=f?null:followupSuggestion(c);
 const kind=f?.kind||suggest||'info',status=f?.status||'waiting';
 const opts=(list,val)=>list.map(([k,l])=>`<option value="${k}" ${k===val?'selected':''}>${l}</option>`).join('');
 return `<form id="followup-form" class="detail-field detail-wide soft-box followup-card" data-case-id="${esc(c.id)}">
  <small>متابعة الإفادة أو الخطاب أو تقرير الخبير</small>
  ${f?'':`<p class="hint">${suggest?'يبدو من الجلسة السابقة أن القضية رُفعت بانتظار '+esc(followupLabel(FOLLOWUP_KINDS,suggest))+'. ':''}فعّل المتابعة إذا كانت القضية بانتظار ورود شيء.</p>`}
  <div class="followup-grid"><label>النوع<select class="input" name="kind">${opts(FOLLOWUP_KINDS,kind)}</select></label>
  <label>الحالة<select class="input" name="status">${opts(FOLLOWUP_STATUS,status)}</select></label></div>
  <label>ملاحظة<input class="input" name="note" maxlength="500" value="${esc(f?.note||'')}" placeholder="مثال: الخطاب لم يُصدَّر لخطأ في رقم الهوية"></label>
  <div class="case-entry-actions" style="margin-top:10px"><button type="submit" class="btn btn-soft" value="save">${f?'حفظ الحالة':'تفعيل المتابعة'}</button>${f?'<button type="submit" class="btn" value="remove">إلغاء المتابعة</button>':''}</div>
  ${f?`<p class="hint">آخر تحديث: ${esc(f.updated_by_name||'')} · ${stamp(f.updated_at)}${isJudge()?'':' · يصل القاضي إشعار عند أي حالة غير «بانتظار الورود».'}</p>`:''}
 </form>`;
}
async function saveFollowup(form,submitter){
 const caseId=form.dataset.caseId,remove=submitter?.value==='remove';
 const fd=new FormData(form);
 const btns=form.querySelectorAll('button');btns.forEach(b=>b.disabled=true);
 const {error}=await state.client.rpc('set_case_followup',{p_case_id:caseId,p_kind:remove?null:fd.get('kind'),p_status:fd.get('status'),p_note:latinDigits(String(fd.get('note')||''))});
 btns.forEach(b=>b.disabled=false);
 if(error){notify('تعذّر حفظ المتابعة: '+error.message,'error');return;}
 notify(remove?'أُلغيت المتابعة.':'تم حفظ حالة المتابعة.','success');
 await loadAll();
}
// اليوم الجاري: الجلسات المنتهية تنزل تحت سطر «الجلسات السابقة لهذا اليوم»، وتظهر بالضغط عليه.
let pastSessionsOpen=false,pastSessionsKey='';
const riyadhMinutes=(now=new Date())=>((now.getUTCHours()+3)%24)*60+now.getUTCMinutes();
const minutesOf=t=>{const [h,m]=String(t||'').split(':').map(Number);return Number.isFinite(h)?h*60+(m||0):null;};
function sessionEnded(c,now=riyadhMinutes()){
 const start=minutesOf(c.session_time);if(start===null)return false;
 const end=minutesOf(c.session_end_time)??start+30;
 return end<=now;
}
function dayCasesList(list,empty){
 if(!list.length)return empty;
 if(state.filterDate!==todayRiyadh())return list.map(c=>caseRow(c)).join('');
 const now=riyadhMinutes(),past=list.filter(c=>sessionEnded(c,now)),next=list.filter(c=>!sessionEnded(c,now));
 pastSessionsKey=past.map(c=>c.id).join(',');
 if(!past.length)return next.map(c=>caseRow(c)).join('');
 return `${next.map(c=>caseRow(c)).join('')||'<p class="hint">انتهت جلسات اليوم.</p>'}
 <details class="past-sessions" data-past-sessions ${pastSessionsOpen?'open':''}><summary>الجلسات السابقة لهذا اليوم <span>${past.length}</span></summary>${past.map(c=>caseRow(c)).join('')}</details>`;
}
function caseRow(c){const item=priorOutcome(c);return `<article class="case-row" data-case-session-time="${esc(c.session_time)}"><div class="case-time-slot"><div class="time-pill">${esc(tm(c.session_time))}</div><span class="current-session-label" hidden>موعدها الآن</span></div><div class="case-content"><div class="case-title">${esc(c.case_type||'قضية دون تصنيف')} <span class="badge ${esc(c.status)}">${c.status==='approved'?'✓ ':''}${statusTitle(c.status)}</span></div><div class="case-sub"><span>رقم ${caseNumberButton(c.case_number)}</span><span>${esc(short(c.plaintiffs,34))} × ${esc(short(c.defendants,34))}</span>${sessionNumberBadge(c)}${followupBadge(c)}<span class="byline">أدخله: ${esc(profileName(c.created_by))}</span></div><div class="case-assignee"><span aria-hidden="true">👤</span> <span data-case-assignee="${esc(c.id)}">${esc(assigneeLabel(c))}</span></div>${item?.outcome?`<div class="case-assignee">${outcomeLabel(item)}: ${esc(item.outcome)}</div>`:''}</div><div class="case-row-actions"><button class="btn btn-small" data-detail="${esc(c.id)}">عرض</button><button class="btn btn-small btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button></div></article>`;}
function emptyState(){return `<div class="card empty"><span class="empty-icon">▤</span><b>لا توجد قضايا في هذا التاريخ</b><p>يمكن إضافة القضايا وتعديلها في أي وقت خلال الأيام الخمسة القادمة.</p></div>`;}
function sessionsPage(){
 const report=state.screen==='poster';
 return `<div class="seg sessions-nav" role="group" aria-label="خيارات الجلسات">
  <button type="button" data-nav="cases" class="${report?'':'active'}" aria-pressed="${!report}">جدول الجلسات</button>
  <button type="button" data-nav="poster" class="${report?'active':''}" aria-pressed="${report}">تصميم التقرير</button>
 </div>${report?posterPage():casesPage()}`;
}
function casesPage(){return `<div class="eyebrow">السجل المشترك للقضايا</div><h1 class="heading">جدول القضايا والجلسات</h1><p class="subheading">إضافة وتعديل وحفظ بيانات الجلسات مع الاحتفاظ بسجل التعديلات.</p><div class="filters">${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<input type="search" class="search" data-search placeholder="ابحث برقم القضية أو بأحد أطرافها..." value="${esc(state.search)}"/><div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button></div></div>${previousSessionsPicker()}${dayTabs()}<div class="cases-list">${dayCasesList(filteredCases(),emptyState())}</div>`;}
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
 const entryDate=dayWithinWindow(state.filterDate)?state.filterDate:nextWorkday();
 bulkEntry=Array.isArray(saved?.rows)&&saved.rows.length&&saved.rows.every(row=>/^[0-9a-f-]{36}$/i.test(row.id))?saved:{date:entryDate,rows:[newBulkRow()]};
 sortBulkRows();
 if(!bulkEntry.rows.some(row=>row.saved||row.attempted)&&!dayWithinWindow(bulkEntry.date))bulkEntry.date=entryDate;
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
   const payloads=chunk.map(row=>({...casePayload(row,entry.date),id:row.id,created_by:author,updated_by:author,status:'approved'}));
   for(const row of chunk)row.attempted=true;
   rememberCaseEntry();
   if(DEMO){
    const stamp=new Date().toISOString();
    state.cases.push(...payloads.filter(p=>!state.cases.some(c=>c.id===p.id)).map(p=>({...p,created_at:stamp,updated_at:stamp})));
    for(const row of chunk)row.saved=true;
    persistDemo();
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
  state.historyDate=null;state.filterDate=entry.date;
  render();
  notify('حُفظت جميع القضايا واعتمدت تلقائيًا.','success');
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
 const f=state.form,id=state.editorId;
 const sessionSelect=caseDate(f,'f_session_date',{label:'تاريخ الجلسة القادمة (هجري)'});
 return `<div class="modal-backdrop" id="editor-backdrop"><div id="case-entry-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="case-entry-title"><div class="modal-head"><div><h2 id="case-entry-title">${id==='new'?'إضافة القضايا':'تعديل بيانات القضية'}</h2><small>${draftHint()}</small></div><button class="icon-button" data-action="close-editor" aria-label="إغلاق">✕</button></div>${id==='new'?caseEntryModes('single'):''}<form id="case-form" novalidate><div class="modal-body"><div class="form-grid">${caseInput(f,'case_number','f_case_number','text')}${sessionSelect}${caseTime(f,'f_session_time')}${caseInput(f,'plaintiffs','f_plaintiffs','text')}${caseInput(f,'defendants','f_defendants','text')}${caseInput(f,'case_type','f_case_type','text')}${caseStage(f,'f_stage')}${f.stage==='followup'?caseSessionNumber(f,'f_session_number')+casePreviousDate(f):''}</div><div class="form-grid">${caseArea(f,'claim_summary','f_claim_summary',4)}</div>${f.stage==='followup'?`<div class="divider-label">الضبط الأصلي للجلسة السابقة</div><p class="hint">الصق ضبط الجلسة السابقة كاملًا كما هو في تقاضي، دون اختصار. يُعرض للقاضي مقتطف تحضيري تلقائيًا مع إمكانية فتح الأصل كاملًا.</p><div class="form-grid">${caseArea(f,'previous_minutes','f_previous_minutes',12)}</div>`:''}</div><div class="modal-foot">${id!=='new'?'<button type="button" class="btn btn-danger" data-action="delete-case">حذف من الجدول</button>':''}<button type="button" class="btn" data-action="close-editor">إلغاء</button><button type="button" class="btn btn-soft" data-save="draft">حفظ مسودة محليًا</button><button type="button" class="btn" data-action="discard-case-draft">حذف المسودة</button><button type="button" class="btn btn-primary" data-save="ready">حفظ القضية</button></div></form></div></div>`;
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
 const {expected_outcome,custom_outcome,judge_notes,consult_notes}=preparation.fields;
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
   <label class="form-label" for="consult-notes">رد الاستشارة</label>
   <textarea id="consult-notes" class="input" name="consult_notes" rows="6" placeholder="الصق هنا رد ChatGPT إن أردت حفظه. يظهر لك وحدك.">${esc(consult_notes||'')}</textarea>
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
 void loadCaseHistory(state.cases.find(x=>x.id===caseId)?.case_number);
 if(!isJudge()||!state.client){render();return;}
 const preparation={caseId,actor:actorId(),fields:{},loading:true,message:''};
 casePreparation=preparation;
 render();
 try{
  const {data,error}=await state.client.from('judge_case_preparation')
   .select('expected_outcome,custom_outcome,judge_notes,consult_notes').eq('case_id',caseId).maybeSingle();
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
 const {expected_outcome,custom_outcome,judge_notes,consult_notes}=preparation.fields;
 const outcome=expected_outcome||null;
 const consult=consult_notes?.trim()?consult_notes:null;
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
  const {error}=outcome||notes||consult
   ?await table.upsert({case_id:preparation.caseId,expected_outcome:outcome,custom_outcome:custom,judge_notes:notes,consult_notes:consult})
   :await table.delete().eq('case_id',preparation.caseId);
  if(error)throw error;
  preparation.fields={expected_outcome:outcome,custom_outcome:custom,judge_notes:notes,consult_notes:consult};
  preparation.message='تم حفظ تحضير الجلسة.';
 }catch{
  preparation.message='تعذّر الحفظ. حاول مرة أخرى.';
 }finally{
  preparation.saving=false;
  if(casePreparation===preparation)refreshPreparationPanel();
 }
}

// ملف القضية الزمني: الجلسات السابقة المسحوبة من تقاضي (جدول case_session_history).
let caseHistory=null;
async function loadCaseHistory(caseNumber){
 caseHistory=null;
 if(!caseNumber||!state.client)return;
 const current={caseNumber,rows:[],loading:true};
 caseHistory=current;
 try{
  const {data,error}=await state.client.from('case_session_history')
   .select('session_hijri,session_key,minutes,outcome').eq('case_number',caseNumber).order('session_key');
  if(error)throw error;
  current.rows=data||[];
 }catch{current.rows=[];}
 finally{
  current.loading=false;
  if(caseHistory===current){const panel=$('#case-history');if(panel)panel.outerHTML=caseHistoryPanel(state.cases.find(x=>x.id===state.detailId));else if(current.rows.length&&state.detailId!==null)render();}
 }
}
const hijriMonths=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const hijriText=v=>{const [d,m,y]=String(v||'').split('/').map(Number);return hijriMonths[m-1]?`${d} ${hijriMonths[m-1]} ${y}هـ`:esc(v);};
function sessionDecision(row){
 if(row.outcome)return row.outcome;
 const clip=(t,n=170)=>t.length>n?t.slice(0,n-3)+'…':t;
 const tidy=t=>t.replace(/[ً-ْ]/g,'');
 const tail=t=>t.replace(/[،,]?\s*(و?ختمت|و?أغلقت|والله الموفق).*$/,'').replace(/[،,]?\s*(وعليه|ولأجل ذلك)\s+رفعت الجلسة$/,'').replace(/[،,]\s*$/,'').trim();
 const parts=latinDigits(row.minutes||'').split(/[.؛\n]+/).map(x=>tidy(x.trim())).filter(Boolean);
 const verb=/(قررت|أمهل|امهل|أحال|إحالة|مخاطبة|شطب|حكمت|ندب|حجز|رفعت|رفع الجلسة|رفعها)/;
 const idx=parts.map((x,i)=>verb.test(x)&&!/^(وختمت|ختمت|وأغلقت|أغلقت)/.test(x)?i:-1).filter(i=>i>=0).at(-1);
 if(idx===undefined)return clip(parts.at(-1)||'');
 const sentence=tail(parts[idx]);
 const hits=[...sentence.matchAll(/(?:فقد |وعليه |عليه |لذا |ولأجل ذلك |ولذلك )?قررت(?: الدائرة)?/g)];
 const start=hits.length?hits.at(-1).index:-1;
 let text=(start>=0?sentence.slice(start):sentence).replace(/^(فقد|وعليه|عليه|لذا|ولذلك|ولأجل ذلك)\s+/,'');
 if(/^قررت\s?(الدائرة\s)?(رفع الجلسة|رفعها)$/.test(text)||/^رفعت الجلسة$/.test(text)){
  let before=start>0?sentence.slice(0,start).replace(/^.*?(ونظرا|ونظراً|نظرا|نظراً|ولما|وحيث|فأجبت|فأجيب)/,'$1').replace(/[،,]?\s*(ففهم|ففهما|واستعدا).*$/,'').replace(/[،,]\s*$/,'').trim():'';
  if(/افتتحت الجلسة$/.test(before)||before.length<12)before='';
  if(!before){const prev=parts[idx-1]||'';if(prev&&!/^(هكذا|فقرر|قرر|وقرر)/.test(prev))before=prev.replace(/^.*?(تبين|وجدت|ونظرا|ونظراً|لعدم|لحين)/,'$1');}
  if(before)text=`${clip(before,115)} ← رُفعت الجلسة`;
 }
 return clip(text);
}
// «نسخ للاستشارة»: ينسخ ملف القضية بجلساتها ليلصقه القاضي بنفسه في ChatGPT. لا يُرسل شيء آليًا.
const arabicDigits=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
// اسم المحادثة في ChatGPT: «قضية» + اسم عائلة المدعي الأول، أو اسم الجهة إذا كان المدعي شركة أو جهة.
function consultTitle(c){
 const first=latinDigits(String(c.plaintiffs||'')).split(/[،,؛;\n]|\s+و\s+/)[0].replace(/\(.*?\)/g,'').replace(/[|«»"]/g,'').trim();
 if(!first)return `قضية ${latinDigits(String(c.case_number||''))}`;
 const words=first.split(/\s+/).filter(Boolean);
 const entity=/^(شركة|مؤسسة|مصنع|مكتب|بنك|مصرف|مجموعة|جمعية|وزارة|أمانة|بلدية|هيئة|مستشفى|مدارس|مجمع)$/;
 const name=entity.test(words[0])?words.slice(0,2).join(' '):words[words.length-1];
 return `قضية ${name}`;
}
function consultText(c){
 const plain=v=>latinDigits(String(v??'')).trim();
 const hText=v=>{const [d,m,y]=String(v||'').split('/').map(Number);return hijriMonths[m-1]?`${d} ${hijriMonths[m-1]} ${y}هـ`:String(v||'');};
 let rows=caseHistory?.caseNumber===c.case_number?caseHistory.rows:[];
 if(!rows.length&&c.previous_minutes){const p=hijriParts(c.previous_date);rows=[{session_hijri:p?`${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year}`:'',minutes:c.previous_minutes}];}
 const title=consultTitle(c);
 const head=[`سمِّ هذه المحادثة: ${title}`,'',`القضية رقم ${plain(c.case_number)}${c.case_type?' — '+plain(c.case_type):''}`,
  c.plaintiffs&&`المدعي: ${plain(c.plaintiffs)}`,c.defendants&&`المدعى عليه: ${plain(c.defendants)}`,
  c.claim_summary&&`موضوع الدعوى: ${plain(c.claim_summary)}`,c.claim_requests&&`الطلبات: ${plain(c.claim_requests)}`].filter(Boolean);
 const sessions=rows.map((r,i)=>`الجلسة ${arabicDigits(i+1)}${r.session_hijri?' ('+hText(r.session_hijri)+')':''}:\n${plain(r.minutes)||'لا يوجد ضبط محفوظ'}`);
 return [head.join('\n'),...sessions,'لخص لي القضية ووش المتوجه، وتأكد جدًا جدًا وادرسها جيدًا، أريد الحسم.'].join('\n\n');
}
async function copyConsult(){
 const c=state.cases.find(x=>x.id===state.detailId);if(!c||!isJudge())return;
 if(caseHistory?.caseNumber===c.case_number&&caseHistory.loading){notify('انتظر اكتمال تحميل ملف القضية ثم أعد المحاولة.');return;}
 try{await navigator.clipboard.writeText(consultText(c));notify('تم نسخ ملف القضية. الصقه في ChatGPT بنفسك.','success');}
 catch{notify('تعذّر النسخ.','error');}
}
function caseHistoryPanel(c){
 if(!c||!caseHistory||caseHistory.caseNumber!==c.case_number||!caseHistory.rows.length)return '<div id="case-history" hidden></div>';
 const rows=caseHistory.rows;
 const item=(row,i)=>`<li><div class="history-dot"></div><div class="history-body"><div class="history-head"><b>الجلسة ${i+1}</b><span>${hijriText(row.session_hijri)}</span></div><p>${esc(sessionDecision(row)||'لا يوجد ضبط محفوظ')}</p>${row.minutes?`<details><summary>الضبط كاملًا</summary><div class="source-box">${esc(row.minutes)}</div></details>`:''}</div></li>`;
 return `<div id="case-history" class="detail-field detail-wide history-card"><small>ملف القضية · ${rows.length} ${rows.length===1?'جلسة سابقة':rows.length===2?'جلستان سابقتان':'جلسات سابقة'}</small><ol class="history-list">${rows.map(item).join('')}<li class="history-now"><div class="history-dot"></div><div class="history-body"><div class="history-head"><b>الجلسة ${rows.length+1}</b><span>${hijriLong(c.session_date)}</span></div></div></li></ol></div>`;
}
function detailModal(){
 const c=state.cases.find(x=>x.id===state.detailId);if(!c)return '';
 const info=(title,value,wide=false)=>`<div class="detail-field ${wide?'detail-wide':''}"><small>${title}</small><p>${esc(value||'غير مدخل')}</p></div>`;
 const m=minutesExtract(c),judge=isJudge();
 return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>القضية رقم ${caseNumberButton(c.case_number)}</h2><small>${esc(c.case_type)} • ${hijriLong(c.session_date)} • ${tm(c.session_time)}</small></div><div class="toolbar">${judge?'<button type="button" class="btn btn-small btn-soft" data-action="copy-consult" title="ينسخ ملف القضية كاملًا لتلصقه في ChatGPT بنفسك">نسخ للاستشارة</button>':''}<button class="icon-button" data-action="close-detail">✕</button></div></div><div class="modal-body"><div class="status-line"><span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span><span class="pill">${sessionNumberBadge(c)}</span></div><div class="detail-grid" style="margin-top:24px">${info('المدعي',c.plaintiffs)}${info('المدعى عليه',c.defendants)}${info('موضوع الدعوى',c.claim_summary,true)}${info('مُدخل القضية',profileName(c.created_by))}${c.previous_date?info('تاريخ الجلسة الأخيرة',hijriLong(c.previous_date),true):''}${caseHistoryPanel(c)}${judge?`<div class="detail-field detail-wide summary-card"><small>معاينة مختصرة آلية من الضبط الأصلي</small><p>${esc(m.overview)}</p>${m.evidence?`<small class="summary-label">عبارة ورود رفع الجلسة في المحضر</small><p class="quote-text">${esc(m.evidence)}</p>`:''}<small class="summary-note">هذا استخراج نصي أولي غير معتمد، وقد لا يوضح سبب الرفع بدقة. راجع الأصل دائمًا.</small></div><div class="detail-field detail-wide"><button class="btn btn-soft" data-action="toggle-source">${state.showSource?'إخفاء':'عرض'} ضبط الجلسة السابقة كاملًا</button>${state.showSource?`<div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div>`:''}</div>`:`<div class="detail-field detail-wide"><small>الضبط الأصلي كاملًا</small><div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div></div>`}${outcomeEditor(c)}${followupPanel(c)}${judge?preparationPanel():''}<div class="detail-field detail-wide"><small>آخر تحديث</small><p>${stamp(c.updated_at)} • ${esc(profileName(c.updated_by||c.created_by))}</p></div></div></div><div class="modal-foot"><button class="btn" data-action="close-detail">إغلاق</button><button class="btn btn-soft" data-case-task="${esc(c.id)}">＋ مهمة لهذه القضية</button><button class="btn btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button></div></div></div>`;
}
function initialTask(){return {title:'',category:'case',case_number:'',details:'',proposed_action:'',due_date:'',priority:'normal',assigned_to:[],completion_mode:'any'};}
const myAssignment=task=>task.task_assignments?.find(item=>item.assignee_id===actorId());
const taskComplete=task=>Boolean(task.task_assignments?.length&&task.task_assignments.every(item=>item.confirmed_at));
function taskCardMini(t){
 return `<div class="mini-task"><span class="priority-dot ${esc(t.priority)}"></span><div><b>${esc(short(t.title,62))}</b><small>${esc(profileName(t.created_by))}</small></div><button type="button" class="btn btn-small" data-open-task="${esc(t.id)}">عرض</button></div>`;
}
const taskLists=[['mine','الواردة لي'],['sent','المرسلة مني'],['done','المهام المنفذة'],['pending','بانتظار التأكيد']];
const taskStates={open:'قيد التنفيذ',pending:'بانتظار التأكيد',done:'مكتملة'};
const assignmentState=a=>a.confirmed_at?'done':a.executed_at?'pending':'open';
const taskState=t=>taskComplete(t)?'done':t.task_assignments?.some(a=>assignmentState(a)==='pending')?'pending':'open';
const expandedTaskCards=new Set();
function taskViewMembership(task){
 const mine=myAssignment(task);
 const sent=task.sent_by_me??(task.created_by===actorId());
 const pending=a=>assignmentState(a)==='pending';
 if(!isJudge()&&sent&&task.sender_ack_at&&!mine)return {mine:false,sent:false,done:false,pending:false,all:false};
 return {
  mine:!sent&&mine&&assignmentState(mine)==='open',
  sent,
  done:(isJudge()||sent||mine)&&taskComplete(task),
  pending:isJudge()||sent?task.task_assignments?.some(pending):mine&&pending(mine),
  all:isJudge(),
 };
}
function taskMatchesMonitor(task){
 const person=state.taskPersonFilter;
 const status=state.taskStatusFilter;
 if(!person)return !status||taskState(task)===status;
 return (task.created_by===person&&(!status||taskState(task)===status))||
  task.task_assignments?.some(a=>a.assignee_id===person&&(!status||assignmentState(a)===status));
}
function visibleTaskRows(){
 const filter=state.taskFilter;
 return state.tasks.filter(task=>!task.deleted_at&&taskViewMembership(task)[filter]&&
  (filter!=='all'||taskMatchesMonitor(task))&&
  latinDigits([task.title,task.details,task.case_number,task.proposed_action].join(' ')).includes(state.taskSearch))
 .map(task=>taskRow(task)).join('')||'<p class="hint">لا توجد مهام في هذا العرض.</p>';
}
function tasksPage(){
 if(state.focusedTaskId){
  const task=state.tasks.find(t=>t.id===state.focusedTaskId);
  return `<h1 class="heading">المهمة</h1><button type="button" class="btn btn-soft" data-nav="tasks">العودة إلى المهام</button><div class="tasks-list">${task?taskRow(task,true):'<p class="hint">هذه المهمة غير متاحة.</p>'}</div>`;
 }
 const lists=isJudge()?[...taskLists,['all','متابعة جميع المهام']]:taskLists;
 const counts={};
 for(const task of state.tasks){
  if(task.deleted_at)continue;
  for(const [key,belongs] of Object.entries(taskViewMembership(task)))if(belongs)counts[key]=(counts[key]||0)+1;
 }
 return `<div class="section-head"><h1 class="heading">المهام والمتابعة</h1><div class="section-actions"><button class="btn btn-soft btn-small" data-action="export-tasks">حفظ صورة</button><button class="btn btn-primary" data-action="new-task">＋ إضافة مهمة</button></div></div>
 <div class="task-views" role="group" aria-label="قوائم المهام">${lists.map(([key,label])=>`<button type="button" data-task-filter="${key}" aria-pressed="${state.taskFilter===key}">${label} <span>${counts[key]||0}</span></button>`).join('')}</div>
 <div class="task-list-filters"><input type="search" class="search" data-task-search aria-label="البحث في المهام" placeholder="ابحث في المهام" value="${esc(state.taskSearch)}">
 ${isJudge()&&state.taskFilter==='all'?`<select class="field" data-task-person-filter aria-label="تصفية حسب الموظف"><option value="">كل المستخدمين</option>${state.profiles.filter(p=>p.is_active).map(p=>`<option value="${esc(p.id)}" ${state.taskPersonFilter===p.id?'selected':''}>${esc(p.display_name)}</option>`).join('')}</select>
 <select class="field" data-task-status-filter aria-label="تصفية حسب الحالة">${[['','كل الحالات'],...Object.entries(taskStates)].map(([key,label])=>`<option value="${key}" ${(state.taskStatusFilter||'')===key?'selected':''}>${label}</option>`).join('')}</select>`:''}</div>
 <div class="tasks-list">${visibleTaskRows()}</div>`;
}
function taskNeedsProposal(task,isNew=false){
 const sender=isNew?state.profile:state.profiles.find(profile=>profile.id===task.created_by);
 if(sender?.role!=='secretary')return false;
 const recipients=task.assigned_to??task.task_assignments?.map(assignment=>assignment.assignee_id)??[];
 return state.profiles.some(profile=>(DEMO||profile.is_active)&&profile.role==='judge'&&
  profile.display_name==='زياد محمد البابطين'&&recipients.includes(profile.id));
}
function syncTaskProposalField(){
 const field=$('#task-proposed-action');
 if(!field)return;
 const required=taskNeedsProposal(state.taskForm,state.taskEditorId==='new');
 field.closest('[data-task-proposal]').style.display=required?'':'none';
 field.required=required;
 field.disabled=!required;
}
function taskRow(t,expanded=false){
 const assignments=t.task_assignments||[];
 const status=taskState(t);
 const returned=assignments.some(a=>a.attempt>0&&!a.executed_at);
 const statusLabel=status==='pending'?'تم التنفيذ · بانتظار التأكيد':status==='open'&&returned?'أُعيدت للاستكمال':taskStates[status];
 return `<details class="task-compact" data-task-card="${esc(t.id)}" ${expanded||expandedTaskCards.has(t.id)?'open':''}>
 <summary><strong>${esc(t.title)}</strong>${t.source==='email'?`<span class="task-source-badge" title="وصلت من البريد">📧 من البريد</span>`:''}<span class="task-card-assignees">${esc(assignments.map(a=>a.assignee_name).join('، ')||'لم يُحدد المكلف')}</span>
 <span class="task-card-status" data-state="${status}">${statusLabel}</span></summary>
 <div class="task-card-body">
 ${t.details?`<div class="task-details">${esc(t.details)}</div>`:''}
 ${taskNeedsProposal(t)&&t.proposed_action?.trim()?`<div class="task-details"><strong>الإجراء المقترح:</strong> ${esc(t.proposed_action)}</div>`:''}
 ${t.source==='email'?`<div class="task-source-note">📧 وصلت هذه المهمة من البريد${t.source_sender?` · المرسل: <strong>${esc(t.source_sender)}</strong>`:''}${t.source_subject?` · الموضوع: ${esc(t.source_subject)}`:''}${t.source_received_at?` · ${stamp(t.source_received_at)}`:''}</div>`:''}
 ${taskDirectiveBox(t)}
 <div class="task-meta"><span>أرسلها: ${esc(profileName(t.created_by))}</span>${t.completion_mode==='any'?'<span>يكفي تنفيذ أحدهم</span>':''}<span>${esc(taskCategories[t.category]||'أخرى')}</span>${t.case_number?`<span>رقم القضية: ${caseNumberButton(t.case_number)}</span>`:''}${t.due_date?`<span>الموعد: ${hijri(t.due_date)}</span>`:''}</div>
 ${assignments.map(a=>{
  const button=(action,label)=>`<button type="button" class="btn btn-small btn-soft" data-task-transition="${action}" data-task-id="${esc(t.id)}" data-assignee="${esc(a.assignee_id)}">${label}</button>`;
  return `<div class="task-card-assignment"><strong>${esc(a.assignee_name)} · ${a.executed_at&&!a.confirmed_at?'تم التنفيذ · بانتظار التأكيد':a.attempt>0&&!a.executed_at?'أُعيدت للاستكمال':taskStates[assignmentState(a)]}</strong>
  <div class="task-meta"><span>الإسناد: ${stamp(a.assigned_at)}</span>${a.executed_at?`<span>التنفيذ: ${stamp(a.executed_at)}</span>`:''}${a.confirmed_at?`<span>التأكيد: ${stamp(a.confirmed_at)}</span>`:''}</div>
  ${a.return_reason&&!a.executed_at?`<div class="task-note returned"><strong>سبب الإعادة:</strong> ${esc(a.return_reason)}</div>`:''}
  ${a.execution_note&&a.executed_at&&!(profileRole(a.assignee_id)==='judge'&&t.judge_directive&&!isJudge())?`<div class="task-note"><strong>${profileRole(a.assignee_id)==='judge'?'توجيه القاضي':'رسالة التنفيذ'}:</strong> ${esc(a.execution_note)}</div>`:''}
  ${!a.executed_at&&a.assignee_id===actorId()?(isJudge()?(t.created_by!==actorId()?taskNoteForm(t,a,'execute',`توجيهك إلى ${esc(profileName(t.created_by))} (اختياري، يصله ولا يرد عليه)`,'مثال: يُكتب للجهة بطلب الإفادة، ويُعرض علي بعد ورودها','إنهاء وإرسال التوجيه',true):button('execute','إنهاء وأرشفة')):taskNoteForm(t,a,'execute','رسالة التنفيذ (إلزامية)','مثال: تم تنفيذ المهمة وإرسال الخطاب للرئيس لاعتماده','تم التنفيذ')):''}
  ${isJudge()&&a.executed_at&&!a.confirmed_at?button('confirm','تأكيد الإنجاز')+taskNoteForm(t,a,'return','سبب الإعادة (يصل للموظف)','مثال: الخطاب ناقص رقم القضية','إعادة للاستكمال'):''}</div>`;
 }).join('')}
 ${isJudge()||(t.created_by===actorId()&&!t.judge_directive)?`<button class="btn btn-small btn-soft" data-task-edit="${esc(t.id)}">تعديل</button>`:''}
 ${isSubmissionRecipient()?`<button type="button" class="btn btn-small btn-danger" data-task-delete="${esc(t.id)}">حذف نهائي</button>`:''}
 </div></details>`;
}
function profileRole(id){return state.profiles.find(p=>p.id===id)?.role;}
function taskDirectiveBox(t){
 if(!t.judge_directive||t.created_by!==actorId()||isJudge())return '';
 return `<div class="task-note directive"><strong>توجيه القاضي:</strong> ${esc(t.judge_directive)}${t.sender_ack_at?'':`<div style="margin-top:8px"><button type="button" class="btn btn-small btn-primary" data-task-ack="${esc(t.id)}">اطّلعت</button> <small class="hint">بعد الاطلاع تُغلق المهمة عندك. إذا احتجت شيئًا أرسل مهمة جديدة.</small></div>`}</div>`;
}
async function ackTaskDirective(id){
 if(DEMO)return;
 const {error}=await state.client.rpc('ack_task_directive',{p_task:id});
 if(error)return notify('تعذّر الحفظ: '+error.message,'error');
 notify('سُجّل اطلاعك، وأُغلقت المهمة عندك.','success');await loadAll();
}
function taskNoteForm(t,a,action,label,placeholder,submit,optional=false){
 return `<form class="task-note-form" data-task-note-form data-task-id="${esc(t.id)}" data-assignee="${esc(a.assignee_id)}" data-action-name="${action}">
  <label>${label}<textarea class="input" name="note" rows="2" ${optional?'':'minlength="3" required'} maxlength="1000" placeholder="${esc(placeholder)}"></textarea></label>
  <button type="submit" class="btn btn-small ${action==='execute'?'btn-primary':'btn-soft'}">${submit}</button></form>`;
}
async function submitTaskNote(form){
 if(DEMO)return;
 const note=latinDigits(form.elements.note.value).trim();
 if(note.length<3&&!(isJudge()&&form.dataset.actionName==='execute')){form.elements.note.focus();return notify(form.dataset.actionName==='execute'?'اكتب رسالة التنفيذ قبل الإرسال.':'اكتب سبب الإعادة.','error');}
 const btn=form.querySelector('button');btn.disabled=true;
 try{
  const {error}=await state.client.rpc('change_task_assignment',{p_task:form.dataset.taskId,p_assignee:form.dataset.assignee,p_action:form.dataset.actionName,p_note:note});
  if(error)throw error;
  await loadAll();
  notify(form.dataset.actionName==='execute'?(isJudge()?(note?'أُنهيت المهمة ووصل توجيهك للموظف.':'أُنهيت المهمة.'):'سُجّل التنفيذ ووصلت رسالتك للقاضي.'):'أُعيدت المهمة للموظف مع السبب.','success');
 }catch(e){notify('تعذّر الحفظ: '+(e.message||''),'error');}
 finally{btn.disabled=false;}
}
function taskRecipients(f){
 const profiles=state.profiles.filter(p=>DEMO||p.is_active&&['judge','secretary'].includes(p.role));
 return `<fieldset class="form-group wide"><legend class="form-label">توجيه المهمة إلى <span class="case-required" aria-hidden="true">*</span></legend>
 <div class="task-meta"><label><input type="checkbox" data-task-all ${profiles.length&&f.assigned_to.length===profiles.length?'checked':''}> الجميع</label>
 ${profiles.map(p=>`<label><input type="checkbox" data-task-recipient="${esc(p.id)}" ${f.assigned_to.includes(p.id)?'checked':''}> ${esc(p.display_name)}</label>`).join('')}</div>
 ${state.taskEditorId==='new'?`<div class="task-meta" data-task-mode ${f.assigned_to.length>1?'':'hidden'}><label><input type="radio" name="task-mode" value="any" data-task-mode-input ${(f.completion_mode||'any')==='any'?'checked':''}> يكفي تنفيذ أحدهم، وتُغلق عند الباقين</label><label><input type="radio" name="task-mode" value="all" data-task-mode-input ${f.completion_mode==='all'?'checked':''}> يجب أن ينفذها كل واحد</label></div>`:''}</fieldset>`;
}
function taskEditor(){const f=state.taskForm,id=state.taskEditorId,needsProposal=taskNeedsProposal(f,id==='new');const fld=(name,label,type='text')=>`<div class="form-group"><label class="form-label">${label}</label><input class="input" type="${type}" data-task-field="${name}" value="${esc(f[name]||'')}" />${name==='case_number'?copyCaseFieldButton:''}</div>`;
 return `<div class="modal-backdrop"><div class="modal task-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${id==='new'?'إضافة مهمة أو تذكير':'تعديل المهمة'}</h2><small>يُحفظ اسم من أضاف المهمة ومن أنجزها.</small></div><button class="icon-button" data-action="close-task-editor">✕</button></div><form id="task-form"><div class="modal-body">${f.caseTemplates&&id==='new'?`<div class="task-templates"><small>قوالب سريعة للقضية ${esc(f.case_number)} (عدّل ما بين القوسين):</small><div>${CASE_TASK_TEMPLATES.map(([label],i)=>`<button type="button" class="btn btn-small btn-soft" data-task-template="${i}">${label}</button>`).join('')}</div></div>`:''}<div class="form-grid two"><div class="form-group wide"><label class="form-label">عنوان المهمة *</label><input class="input" data-task-field="title" maxlength="220" required placeholder="مثل: الرد على البريد بخصوص القضية ..." value="${esc(f.title||'')}" /></div><div class="form-group"><label class="form-label">نوع المهمة</label><select class="input" data-task-field="category">${Object.entries(taskCategories).map(([k,v])=>`<option value="${k}" ${f.category===k?'selected':''}>${v}</option>`).join('')}</select></div>${fld('case_number','رقم القضية أو التذكرة (اختياري)')}<div class="form-group"><label class="form-label">الأولوية</label><select class="input" data-task-field="priority">${Object.entries(priorityNames).map(([k,v])=>`<option value="${k}" ${f.priority===k?'selected':''}>${v}</option>`).join('')}</select></div>${hijriPicker('due_date',f.due_date,'التاريخ المطلوب (هجري)',{past:5,future:10})}${id==='new'?taskRecipients(f):''}<div class="form-group wide"><label class="form-label">تفاصيل المطلوب</label><textarea class="input" rows="4" data-task-field="details" placeholder="اذكر مضمون الطلب أو الرسالة والمستند الذي يُرجع إليه.">${esc(f.details||'')}</textarea></div><div class="form-group wide" data-task-proposal ${needsProposal?'':'style="display:none"'}><label class="form-label" for="task-proposed-action">الإجراء المقترح <span class="case-required" aria-hidden="true">*</span></label><textarea id="task-proposed-action" class="input" rows="2" data-task-field="proposed_action" aria-describedby="task-proposal-hint" ${needsProposal?'required':'disabled'} placeholder="مثل: إعداد الإفادة المطلوبة والرفع بها للمحكمة">${esc(f.proposed_action||'')}</textarea><small id="task-proposal-hint" class="hint">توصية للعرض على القاضي.</small></div></div></div><div class="modal-foot"><button type="button" class="btn" data-action="close-task-editor">إلغاء</button><button type="submit" class="btn btn-primary">✓ حفظ المهمة</button></div></form></div></div>`;}
// مهمة مربوطة بقضية: رقم القضية والنوع والمكلفون (أمناء السر، يكفي تنفيذ أحدهم) جاهزة، مع قوالب سريعة.
const CASE_TASK_TEMPLATES=[
 ['كتابة خطاب لجهة','إصدار خطاب إلى (الجهة) بشأن القضية رقم {n}، وإرساله للرئيس لاعتماده.'],
 ['طلب إفادة','طلب إفادة من (الجهة) عن (المطلوب) في القضية رقم {n}، ومتابعة ورودها قبل الجلسة.'],
 ['إحالة لخبير أو مقدّر','إعداد خطاب الإحالة إلى (الخبير/الهيئة) في القضية رقم {n} مع المستندات اللازمة.'],
 ['تبليغ الأطراف','تبليغ (الطرف) بموعد الجلسة القادمة في القضية رقم {n} والتأكد من تمام التبليغ.'],
 ['تزويد الأطراف بنسخة','تزويد (الطرف) بنسخة من (المذكرة/المستند) في القضية رقم {n}.'],
];
function openCaseTask(caseId){
 const c=state.cases.find(x=>x.id===caseId);if(!c)return;
 const secretaries=state.profiles.filter(p=>p.is_active&&p.role==='secretary').map(p=>p.id);
 state.editorId=null;state.detailId=null;state.taskEditorId='new';
 state.taskForm={...initialTask(),category:'case',case_number:c.case_number,assigned_to:secretaries,completion_mode:'any',caseTemplates:true};
 render();
}
function applyCaseTaskTemplate(i){
 const f=state.taskForm,t=CASE_TASK_TEMPLATES[i];if(!f||!t)return;
 f.title=`${t[0]} — القضية ${f.case_number}`;f.details=t[1].replace('{n}',f.case_number);
 render();setTimeout(()=>{const d=document.querySelector('[data-task-field="details"]');d?.focus();d?.setSelectionRange(0,0);},50);
}
function openTaskEditor(id='new'){state.editorId=null;state.detailId=null;state.taskEditorId=id;state.taskForm=id==='new'?initialTask():{...state.tasks.find(t=>t.id===id)};render();}
function closeTaskEditor(){state.taskEditorId=null;state.taskForm=null;render();}
const savingTaskForms=new WeakSet();
async function saveTask(){const f=state.taskForm;if(f&&savingTaskForms.has(f))return;if(!f||!f.title?.trim()||f.title.trim().length<3)return notify('اكتب عنوان المهمة على الأقل.','error');const needsProposal=taskNeedsProposal(f,state.taskEditorId==='new');if(needsProposal&&!f.proposed_action?.trim()){ $('#task-proposed-action')?.focus();return notify('أدخل الإجراء المقترح للمهمة.','error');}const due=readHijriPicker('due_date');if(!due.ok)return notify(due.message,'error');f.due_date=due.value;const fields=['title','category','case_number','details','due_date','priority'];if(needsProposal)fields.push('proposed_action');const original=state.tasks.find(task=>task.id===state.taskEditorId);const payload=Object.fromEntries(fields.map(k=>[k,savedText(f[k],original?.[k])]));payload.due_date=payload.due_date||null;const editorId=state.taskEditorId,author=actorId(),isNew=editorId==='new';
 if(isNew&&!f.assigned_to.length){document.querySelector('[data-task-recipient]')?.focus();return notify('اختر من توجه إليه المهمة.','error');}
 if(isNew){payload.assigned_to=f.assigned_to;payload.completion_mode=f.assigned_to.length>1?(f.completion_mode||'any'):'all';}
 savingTaskForms.add(f);
 try{if(DEMO){const old=state.tasks.find(x=>x.id===state.taskEditorId),v={...old,...payload,id:isNew?uid():old.id,status:old?.status||'open',created_by:old?.created_by||actorId(),updated_by:actorId(),created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};if(isNew)v.task_assignments=f.assigned_to.map(id=>({task_id:v.id,assignee_id:id,assignee_name:profileName(id),assigned_at:v.created_at}));state.tasks=isNew?[v,...state.tasks]:state.tasks.map(x=>x.id===v.id?v:x);demoEvent(`${state.profile.display_name} ${isNew?'أضاف':'عدّل'} مهمة: ${v.title}`);closeTaskEditor();notify('تم حفظ المهمة في المعاينة.','success');return;}
  if(isNew)f.id??=crypto.randomUUID();
  const res=isNew
   ?await state.client.rpc('save_directed_task',{p_task:{...payload,id:f.id}})
   :await state.client.from('tasks').update(payload).eq('id',editorId).select('id').single();
  if(res.error)throw res.error;
  if(actorId()!==author||state.taskForm!==f)return;
  if(isNew){state.screen='tasks';state.focusedTaskId=null;state.taskFilter='sent';state.taskSearch='';}
  closeTaskEditor();
  await loadAll();
  notify('تم حفظ المهمة وظهرت في الحسابات المشتركة.','success');
 }catch(e){
  if(actorId()===author&&state.taskForm===f){
   const message=e.message==='task_already_saved'?'حُفظت هذه المهمة في محاولة سابقة. افتحها من حساب المكلف أو القاضي لمراجعتها.':
    e.code==='42501'?'تعذّر حفظ المهمة بصلاحيات هذا الحساب.':'تعذّر حفظ المهمة: '+e.message;
   notify(message,'error');
  }
 }finally{savingTaskForms.delete(f);}
}
async function deleteTaskPermanently(button){
 if(!isSubmissionRecipient()||button.disabled)return;
 const id=button.dataset.taskDelete;
 const task=state.tasks.find(item=>item.id===id);
 if(!task||!window.confirm(`حذف «${task.title}» نهائيًا مع سجل تنفيذها وإشعاراتها؟ لا يمكن التراجع.`))return;
 button.disabled=true;
 try{
  const {error}=await state.client.rpc('delete_task_permanently',{p_task:id});
  if(error)throw error;
  ++loadSequence;
  state.tasks=state.tasks.filter(item=>item.id!==id);
  expandedTaskCards.delete(id);
  if(state.focusedTaskId===id)state.focusedTaskId=null;
  await loadAll();
  notify('حُذفت المهمة نهائيًا.','success');
 }catch{notify('تعذّر حذف المهمة.','error');}
 finally{button.disabled=false;}
}
async function changeTaskAssignment(button){
 if(DEMO||button.disabled)return;
 button.disabled=true;
 try{
  const {error}=await state.client.rpc('change_task_assignment',{
   p_task:button.dataset.taskId,p_assignee:button.dataset.assignee,p_action:button.dataset.taskTransition
  });
  if(error)throw error;
  await loadAll();
  const message=button.dataset.taskTransition==='execute'?(isJudge()?'أُنجزت المهمة.':'سُجّل التنفيذ وأُشعر القاضي للتأكيد.'):
   button.dataset.taskTransition==='confirm'?'تم تأكيد الإنجاز.':'أُعيدت المهمة للموظف للاستكمال.';
  notify(message,'success');
 }catch{notify('تعذّر تحديث حالة المهمة.','error');}
 finally{button.disabled=false;}
}
function exportTasksPng(){
 const tasks=state.tasks.filter(t=>myAssignment(t)&&!myAssignment(t).executed_at).slice(0,65);
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
function refreshDiwanNotifications(){
 const header=app.querySelector('.topbar');
 const bell=header?.querySelector('.notification-bell');
 if(!bell)return;
 bell.querySelector('.notif-count')?.remove();
 if(state.unreadCount){
  const count=document.createElement('span');
  count.className='notif-count';
  count.textContent=state.unreadCount;
  bell.append(count);
 }
 header.querySelector('.notif-pop')?.remove();
 if(state.showNotifs)header.insertAdjacentHTML('beforeend',renderNotifPopup());
}

// ===== مراجعة جلسات اليوم (المطابقة مع تقاضي) =====
const reviewState={date:null,snapshots:{},recon:{},loaded:false,busy:false};
async function loadReview(){
 if(DEMO||!state.client)return;
 const [s,r]=await Promise.all([state.client.from('taqadi_day_snapshots').select('*'),state.client.from('session_reconciliations').select('*')]);
 reviewState.snapshots=Object.fromEntries((s.data||[]).map(x=>[x.session_date,x]));
 reviewState.recon=Object.fromEntries((r.data||[]).map(x=>[x.session_date,x]));
 reviewState.loaded=true;
 if(state.screen==='review')render();
}
function reviewDays(){return fiveWorkdays();}
function reviewRows(date){
 const snap=reviewState.snapshots[date];
 const org=state.cases.filter(c=>c.session_date===date&&!c.deleted_at);
 const byNum=new Map(org.map(c=>[c.case_number,c]));
 const rows=[];
 for(const it of (snap?.items||[])){
  const c=byNum.get(it.case_number);byNum.delete(it.case_number);
  const orgTime=c?String(c.session_time||'').slice(0,5):null;
  const kind=!c?'missing':orgTime!==it.time?'time':'ok';
  rows.push({num:it.case_number,taqadi:it.time,org:orgTime,kind,missing:it.missing||[],status:it.status});
 }
 for(const c of byNum.values())rows.push({num:c.case_number,taqadi:null,org:String(c.session_time||'').slice(0,5),kind:'extra',missing:[]});
 return rows.sort((a,b)=>String(a.taqadi||a.org).localeCompare(String(b.taqadi||b.org)));
}
function reviewPage(){
 const days=reviewDays();
 if(!days.includes(reviewState.date))reviewState.date=days.find(d=>reviewState.snapshots[d])||days[0];
 const date=reviewState.date,snap=reviewState.snapshots[date],rows=reviewRows(date);
 const orgCount=state.cases.filter(c=>c.session_date===date&&!c.deleted_at).length;
 const issues=rows.filter(r=>r.kind!=='ok').length;
 const recon=reviewState.recon[date];
 const confirmed=recon&&snap&&recon.snapshot_fetched_at===snap.fetched_at&&!issues;
 const label={ok:'مطابقة',missing:'ناقصة في المنظم',time:'الوقت مختلف',extra:'غير موجودة في تقاضي'};
 const tabs=`<div class="workday-tabs" role="group" aria-label="اختيار اليوم">${days.map(d=>{const weekday=new Intl.DateTimeFormat('ar-SA',{numberingSystem:'latn',weekday:'long',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`));const p=hijriParts(d);const sn=reviewState.snapshots[d],rc=reviewState.recon[d];const st=!sn?'لم تُسحب':rc&&rc.snapshot_fetched_at===sn.fetched_at&&!reviewRows(d).some(r=>r.kind!=='ok')?'✓ مؤكدة':'بانتظار التأكيد';return `<button type="button" data-review-day="${d}" aria-pressed="${d===date}" class="workday-tab ${d===date?'active':''}"><b>${weekday}</b><span>${p.day} ${HIJRI_MONTHS[p.month-1]}</span><small>${st}</small></button>`;}).join('')}</div>`;
 const body=!reviewState.loaded?'<div class="empty"><b>جارٍ التحميل…</b></div>':!snap?`<div class="empty"><div class="empty-icon">▤</div><b>لم تُسحب جلسات هذا اليوم من تقاضي بعد</b><p>تظهر المقارنة بعد تشغيل «بدء» في أداة تقاضي.</p></div>`:`
  <div class="review-counts"><div class="stat"><div class="stat-label">في تقاضي</div><div class="stat-number">${snap.items.length}</div></div><div class="stat"><div class="stat-label">في المنظم</div><div class="stat-number">${orgCount}</div></div><div class="stat ${issues?'review-bad':'review-good'}"><div class="stat-label">ناقص أو مختلف</div><div class="stat-number">${issues}</div></div></div>
  <p class="hint">آخر سحب من تقاضي: ${stamp(snap.fetched_at)}</p>
  <div class="review-table" role="table" aria-label="مقارنة الجلسات"><div class="review-row review-head" role="row"><span>رقم القضية</span><span>وقت تقاضي</span><span>وقت المنظم</span><span>الحالة</span></div>
  ${rows.map(r=>`<div class="review-row review-${r.kind}" role="row"><span>${caseNumberButton(r.num)}</span><span dir="ltr">${esc(r.taqadi?tm(r.taqadi):'—')}</span><span dir="ltr">${esc(r.org?tm(r.org):'—')}</span><span>${label[r.kind]}${r.kind==='missing'&&r.missing.length?`<small>تعذر استخراج: ${esc(r.missing.join('، '))}</small>`:''}</span></div>`).join('')}</div>
  <div class="review-foot">${confirmed?`<div class="review-confirmed">✓ أكّد المطابقة ${esc(recon.confirmed_by_name)} · ${stamp(recon.confirmed_at)}</div>`:`<button class="btn btn-primary" data-action="confirm-review" ${issues||reviewState.busy?'disabled':''}>✓ تأكيد مطابقة الجلسات</button>${issues?'<small class="warning">عالج النقص أو الاختلاف أولًا.</small>':''}`}
  <small class="hint">تأكيد للمراجعة فقط، وليس اعتمادًا قضائيًا للقضايا.</small></div>`;
 return `<div class="eyebrow">المطابقة مع تقاضي</div><h1 class="heading">مراجعة جلسات اليوم</h1><p class="subheading">قارن الجلسات المُدخلة آليًا بقائمة تقاضي، ثم أكّد المطابقة.</p>${tabs}<div class="card review-card">${body}</div>`;
}
async function confirmReview(){
 const date=reviewState.date;if(!date||reviewState.busy)return;
 reviewState.busy=true;render();
 const {error}=await state.client.rpc('confirm_session_reconciliation',{p_date:date});
 reviewState.busy=false;
 if(error)notify(error.message,'error');else notify('تم تأكيد مطابقة الجلسات.','success');
 await loadAll();await loadReview();
}
// جسر أداة تقاضي: تستدعيه إضافة «أرشيف أحكام تقاضي» داخل هذه الصفحة بعد تسجيل الدخول.
window.taqadiBridge={
 version:1,
 async status(){
  if(DEMO||!state.client||!state.user||!state.profile?.is_active)return {ready:false};
  touchActivity();
  const {data,error}=await state.client.rpc('taqadi_entry_window');
  if(error)return {ready:false,error:error.message};
  const days=(data||[]).map(x=>typeof x==='string'?x:Object.values(x)[0]).sort();
  return {ready:true,name:state.profile.display_name,days:days.map(iso=>{const p=hijriParts(iso);return {iso,hijri:`${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year}`};})};
 },
 existing(iso){return state.cases.filter(c=>c.session_date===iso&&!c.deleted_at).map(c=>c.case_number);},
 // قضايا اليوم في المنظم مع حالة ملفها الزمني: هل جلستها السابقة محفوظة في الملف؟
 async existingDetail(iso){
  touchActivity();
  const list=state.cases.filter(c=>c.session_date===iso&&!c.deleted_at);
  const nums=list.map(c=>c.case_number);
  const have=new Set();
  if(nums.length&&state.client){
   const {data,error}=await state.client.from('case_session_history').select('case_number,session_hijri').in('case_number',nums);
   if(error)return {error:error.message};
   for(const r of data||[])have.add(r.case_number+'|'+r.session_hijri);
  }
  const hj=d=>{const p=hijriParts(d);return p?`${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year}`:'';};
  return list.map(c=>{const prev=c.previous_date?hj(c.previous_date):'';return {case_number:c.case_number,stage:c.stage,previous_hijri:prev,history_ready:!!prev&&have.has(c.case_number+'|'+prev)};});
 },
 async importHistory(items){
  if(!state.client||!state.user)return {error:'غير مسجل الدخول في المنظم'};
  touchActivity();
  const {data,error}=await state.client.rpc('import_case_history',{p_items:items||[]});
  return error?{error:error.message}:data;
 },
 async importDay(iso,items){
  if(!state.client||!state.user)return {error:'غير مسجل الدخول في المنظم'};
  touchActivity();
  const rows=(items||[]).map(it=>{
   let previous_date='';
   const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(it.previous_hijri||'');
   if(m)previous_date=fromHijri(+m[3],+m[2],+m[1])||'';
   return {...it,previous_date};
  });
  const {data,error}=await state.client.rpc('import_taqadi_day',{p_date:iso,p_items:rows});
  if(error)return {error:error.message};
  await loadAll();await loadReview();
  return data;
 }
};
// شاشة البداية: تبقى حتى يكتمل رسم الشعار (نحو ثانيتين)، ثم تتلاشى وتبدأ حركة دخول الواجهة.
let splashReleased=false;
function releaseSplash(){
 if(splashReleased)return;splashReleased=true;
 const splash=document.getElementById('splash');
 setTimeout(()=>{splash?.classList.add('out');document.body.classList.remove('booting');setTimeout(()=>splash?.remove(),800);},Math.max(0,2300-performance.now()));
}
function render(){releaseSplash();if(!state.historyDate&&!displayDays().includes(state.filterDate))state.filterDate=displayedWorkday;if(!app)return;if(DEMO&&!state.profile){app.innerHTML=selectUserScreen();return;}if(!DEMO&&!state.user){app.innerHTML=authScreen();bindOrganizerPasskeyLogin();return;}if(!DEMO&&!state.profile?.is_active){app.innerHTML=unavailableAccountScreen();return;}if(state.screen==='diwan'&&canShowDiwan(state)&&$('#diwan-slot')&&state.editorId===null&&state.detailId===null&&state.taskEditorId===null&&!bulkEntry){refreshDiwanNotifications();return;}app.innerHTML=shell();updateCurrentSessionHighlight();if(state.screen==='diwan'&&canShowDiwan(state))void mountDiwan(state);if(state.screen==='hearings'){assignmentDays.clear();showHearings();}else void refreshCaseAssignments();}
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
   <div id="organizer-passkey-login"></div>
  </div></div>`;
}
const organizerDeviceKey='organizer:ziyad';
let organizerLoginView;

async function invokeOrganizerPasskey(body) {
 const {data,error}=await state.client.functions.invoke('organizer-passkeys',{body});
 if(error)throw error;
 return data;
}

function bindOrganizerPasskeyLogin() {
 organizerLoginView?.abort();
 const username=$('#account-name');
 const container=$('#organizer-passkey-login');
 if(!username || !container || !state.client) return;
 const view=new AbortController();
 organizerLoginView=view;
 let attempt;
 view.signal.addEventListener('abort',()=>attempt?.abort(),{once:true});
 const watcher=new MutationObserver(()=>{if(!container.isConnected)view.abort();});
 watcher.observe(app,{childList:true});
 view.signal.addEventListener('abort',()=>watcher.disconnect(),{once:true});
 function update() {
  attempt?.abort();
  container.replaceChildren();
  if(username.value!=='ziyad')return;
  attempt=new AbortController();
  void addPasskeyUnlock(container,organizerDeviceKey,invokeOrganizerPasskey,async session=>{
   if(state.user || state.authBusy || username.value!=='ziyad')throw Error('login_changed');
   state.authBusy=true;
   try {
    const {error}=await state.client.auth.setSession(session);
    if(error)throw error;
   }finally{state.authBusy=false;}
  },attempt.signal,'organizer');
 }
 username.addEventListener('change',update,{signal:view.signal});
 update();
}

async function loadOrganizerPasskeyAccess() {
 state.organizerPasskeyOwnerUid=null;
 const actor=state.user?.id;
 if (!actor || state.profile?.role!=='judge' || !state.profile.is_active) return;
 try {
  const response=await invokeOrganizerPasskey({action:'list'});
  if (state.user?.id!==actor || !Array.isArray(response?.devices))return;
  state.organizerPasskeyOwnerUid=actor;
  const toolbar=$('.circuit-app .toolbar');
  if (toolbar && !toolbar.querySelector('[data-action="organizer-passkey-settings"]')) {
   toolbar.insertAdjacentHTML('afterbegin',organizerPasskeyButton);
  }
 } catch { /* The standard sign-in remains available independently of passkeys. */ }
}

function showOrganizerPasskeySettings() {
 const actor=state.user?.id;
 if (!actor || state.organizerPasskeyOwnerUid!==actor || state.profile?.role!=='judge' || !state.profile.is_active) return;
 const dialog=document.createElement('dialog');
 dialog.className='organizer-passkey-dialog';
 dialog.setAttribute('aria-label','مفتاح مرور المنظّم');
 dialog.innerHTML=`<div class="section-head"><h2>مفتاح مرور المنظّم</h2>
  <button type="button" class="btn btn-soft">إغلاق</button></div><div class="organizer-passkey-settings"></div>`;
 const view=new AbortController();
 dialog.addEventListener('close',()=>{view.abort();dialog.remove();},{once:true});
 const observer=new MutationObserver(()=>{
  if(!dialog.isConnected){view.abort();return;}
  if(state.user?.id!==actor)dialog.close();
 });
 observer.observe(app,{childList:true});
 view.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 dialog.querySelector('button').onclick=()=>dialog.close();
 app.append(dialog);
 dialog.showModal();
 const content=dialog.querySelector('.organizer-passkey-settings');
 void addPasskeySettings(content,organizerDeviceKey,body=>{
  if(view.signal.aborted || state.user?.id!==actor)throw Error('session_changed');
  return invokeOrganizerPasskey(body);
 },()=>{},view.signal,'organizer');
 const devices=content.querySelector('details');
 if(devices)devices.open=true;
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
async function saveCase(status='approved'){
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
 payload.status=isSubmissionSender()?'draft':'approved';payload.updated_by=actorId();if(editorId==='new')payload.created_by=author;caseSaving=true;editor.inert=true;state.loading=true;try{if(DEMO){let isNew=state.editorId==='new';const old=state.cases.find(c=>c.id===state.editorId);const doc={...old,...payload,id:isNew?uid():state.editorId,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),created_by:old?.created_by||actorId()};if(old?.status==='approved'&&JSON.stringify(payload)!==JSON.stringify(Object.fromEntries(Object.keys(payload).map(k=>[k,old[k]])))&&status!=='approved')doc.status='ready';if(status==='approved')doc.approved_by=actorId();state.cases=isNew?[...state.cases,doc]:state.cases.map(x=>x.id===doc.id?doc:x);state.reportApprovals=state.reportApprovals.filter(r=>![doc.session_date,old?.session_date].includes(r.session_date));persistDemo();state.filterDate=doc.session_date;notify('تم الحفظ محليًا في هذه المعاينة.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();return;}if(isSubmissionSender()){
  f.submissionRequestId??=crypto.randomUUID();
  rememberCaseEntry();
  await saveAndSubmitCases(f.submissionRequestId,[{...payload,id:editorId==='new'?f.submissionRequestId:editorId,clear_previous:Object.hasOwn(payload,'last_session_summary')}],editorId!=='new');
 }else{
  const query=state.client.from('cases');
  const result=editorId==='new'?await query.insert(payload).select('id').single():await query.update(payload).eq('id',editorId).select('id').single();
  if(result.error)throw result.error;
 }if(actorId()!==author||state.form!==f)return;state.historyDate=null;state.filterDate=payload.session_date;notify('حُفظت القضية واعتمدت تلقائيًا.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();await loadAll();}catch(err){notify(err.message==='case_waiting_for_submission'?'القضية لم تُرسل للقاضي بعد.':'تعذّر الحفظ: '+err.message,'error');}finally{state.loading=false;caseSaving=false;if(editor.isConnected)editor.inert=false;}}
async function softDeleteCase(){const id=state.editorId;if(id==='new')return;if(!window.confirm('هل تريد إزالة هذه القضية من الجدول؟ ستبقى نسخة في سجل المراجعات.'))return;if(DEMO){const c=state.cases.find(x=>x.id===id);state.cases=state.cases.filter(x=>x.id!==id);state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==c?.session_date);persistDemo();notify('أُزيلت القضية من المعاينة.','success');closeModal();return;}const {error}=await state.client.from('cases').update({deleted_at:new Date().toISOString(),updated_by:state.user.id}).eq('id',id);if(error)return notify(error.message,'error');notify('أُزيلت القضية من العرض.','success');closeModal();await loadAll();}
async function loadProfile(){const {data,error}=await state.client.from('profiles').select('*').eq('id',state.user.id).maybeSingle();if(error)throw error;state.profile=data||null;void loadOrganizerPasskeyAccess();void loadDiwanAccess(state).then(()=>{if(state.profile?.is_active&&canShowDiwan(state))render();}).catch(()=>{});}
async function loadSharedCases(){
 const rows=[];
 const pageSize=500;
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await state.client.from('cases').select('*').is('deleted_at',null)
   .order('session_date').order('id').range(offset,offset+pageSize-1);
  if(error)return {error,data:null};
  rows.push(...data);
  if(data.length<pageSize)return {error:null,data:rows};
 }
}
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
 const [cases,notifications,profiles,tasks,reports,outcomes,unread,followups]=await Promise.all([
  loadSharedCases(),
  state.client.from('notifications').select('*',{count:'exact'}).not('read_at','is',null).order('created_at',{ascending:false}).order('id').limit(state.noticeHistoryLimit||30),
  state.client.from('profiles').select('id,display_name,is_active,role'),
  state.client.from('tasks').select('*,sent_by_me,task_assignments(*)').is('deleted_at',null).order('created_at',{ascending:false}),
  state.client.from('report_approvals').select('*'),loadSessionOutcomes(),
  state.client.from('notifications').select('*',{count:'exact'}).is('read_at',null).order('created_at',{ascending:false}).limit(100),
  state.client.from('case_followups').select('*')]);
 if(state.user?.id!==userId||sequence!==loadSequence)return;
 const snapshot=JSON.stringify([cases.data,notifications.data,profiles.data,tasks.data,reports.data,outcomes,unread.data,unread.count,notifications.count,followups.data]);
 const changed=snapshot!==lastDataSnapshot;
 lastDataSnapshot=snapshot;
 if(background&&!changed)return;
 if(outcomes)sessionOutcomes=new Map(outcomes.map(item=>[outcomeKey(item.case_key,item.hearing_date),item]));
 if(cases.error)notify('تعذّر تحديث القضايا: '+cases.error.message,'error');else state.cases=cases.data||[];
 if(tasks.error)notify('تعذّر تحديث المهام: '+tasks.error.message,'error');else state.tasks=tasks.data||[];
 if(reports.error)console.warn('Report approvals:',reports.error);else state.reportApprovals=reports.data||[];
 if(notifications.error)console.warn('Notifications:',notifications.error);else {
  if(!unread.error){
   state.unreadCount=unread.count??0;
   state.hasMoreNoticeHistory=(notifications.count??0)>(notifications.data?.length??0);
   state.notifications=[...new Map([...(unread.data||[]),...(notifications.data||[]).filter(row=>row.read_at)].map(row=>[row.id,row])).values()];
  }
 }
 if(!profiles.error)state.profiles=profiles.data||[];
 if(!followups.error)state.followups=new Map((followups.data||[]).map(f=>[f.case_id,f]));
 if(background&&state.screen==='diwan'){refreshDiwanNotifications();return;}
 if(!background||(!state.form&&!bulkEntry&&!state.taskForm&&!document.activeElement?.closest('#session-outcome-form')))render();
}
async function refreshProfile(){try{await loadProfile();if(state.profile?.is_active)state.booting=true;render();if(state.profile?.is_active){try{await loadAll();}finally{state.booting=false;}render();subscribeChanges();registerPushWorker();openNotificationLink();}}catch(e){state.booting=false;notify(e.message,'error');}}
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
try{const mod=window.supabase;if(!mod?.createClient)throw new Error('تعذّر تحميل مكتبة الاتصال بأمان');state.client=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});let {data:{session},error}=await state.client.auth.getSession();if(error)throw error;if(session&&!session.user.is_anonymous&&idleExpired()){await state.client.auth.signOut({scope:'local'});session=null;idleNotice=true;}if(session)touchActivity();if(session?.user.is_anonymous)await state.client.auth.signOut({scope:'local'});state.user=session?.user.is_anonymous?null:session?.user||null;if(state.user){await loadProfile();if(state.profile?.is_active){state.booting=true;render();try{await loadAll();}finally{state.booting=false;}render();subscribeChanges();registerPushWorker();openNotificationLink();}}state.client.auth.onAuthStateChange((_ev,session)=>{if(_ev==='SIGNED_IN')touchActivity();const old=state.user?.id;state.user=session?.user.is_anonymous?null:session?.user||null;if(state.user?.id!==old){assignmentDays.clear();assignmentActor=null;resetCaseEntry();state.detailId=null;casePreparation=null;state.submission=null;state.focusedTaskId=null;if(state.sub){state.client.removeChannel(state.sub);state.sub=null;}state.profile=null;state.diwanOwnerUid=null;state.notifications=[];state.unreadCount=0;state.showReadNotices=false;state.noticeHistoryLimit=30;state.hasMoreNoticeHistory=false;state.taskFilter='mine';state.taskStatusFilter='';state.taskPersonFilter='';expandedTaskCards.clear();state.taskSearch='';state.historyDate=null;state.filterDate=displayedWorkday;lastDataSnapshot='';state.initialNotifLoad=true;render();if(state.user){setTimeout(async()=>{await refreshProfile();if(state.profile?.is_active)subscribeChanges();},10);}}});render();if(idleNotice)notify('تم تسجيل الخروج تلقائيًا بعد 30 دقيقة دون استخدام. سجّل الدخول من جديد.');}catch(e){releaseSplash();app.innerHTML=`<div class="empty" style="min-height:90vh"><b>تعذّر تشغيل الموقع</b><p>${esc(e.message)}. تحقق من بيانات الاتصال بالقاعدة والاتصال بالإنترنت.</p></div>`;}}
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
function subscribeChanges(){if(state.sub)return;state.sub=state.client.channel('case-team-sync').on('postgres_changes',{event:'*',schema:'public',table:'cases'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'tasks'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'task_assignments'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'report_approvals'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'case_followups'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`recipient_id=eq.${state.user.id}`},refreshInBackground).subscribe(status=>{if(status==='SUBSCRIBED')refreshInBackground();});}
async function markRead(filters={},redraw=true){
 const actor=actorId();
 const {error}=DEMO?{}:await state.client.rpc('read_circuit_notifications',filters);
 if(actor!==actorId())return false;
 if(error){notify('تعذّر حفظ حالة قراءة الإشعارات.','error');return false;}
 const all=Object.keys(filters).length===0;
 let read=0;
 for(const item of state.notifications){
  if(!item.read_at&&(all||item.id===filters.p_id||item.task_id===filters.p_task&&filters.p_task||item.submission_id===filters.p_submission&&filters.p_submission)){
   item.read_at=new Date().toISOString();read++;
  }
 }
 state.unreadCount=all?0:Math.max(0,(state.unreadCount??0)-read);
 ++loadSequence;
 lastDataSnapshot='';
 if(DEMO)persistDemo();
 if(redraw)render();
 return true;
}
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
document.addEventListener('click',async e=>{const target=e.target.closest('[data-task-ack],[data-case-task],[data-task-template],[data-review-day],[data-task-delete],[data-notice-id],[data-task-transition],[data-copy-case-number],[data-copy-case-field],[data-open-task],[data-open-submission],[data-nav],[data-action],[data-edit],[data-detail],[data-save],[data-stage],[data-person],[data-task-toggle],[data-task-edit],[data-task-filter],[data-day-tab]');if(!target)return;if(target.dataset.taskDelete){await deleteTaskPermanently(target);return;}if(target.dataset.caseTask){openCaseTask(target.dataset.caseTask);return;}if(target.dataset.taskAck){await ackTaskDirective(target.dataset.taskAck);return;}if(target.dataset.taskTemplate!==undefined){applyCaseTaskTemplate(Number(target.dataset.taskTemplate));return;}if(target.dataset.noticeId){await openNotice(target.dataset.noticeId);return;}if(target.dataset.taskTransition){await changeTaskAssignment(target);return;}if(target.matches('[data-copy-case-number],[data-copy-case-field]')){void copyCaseNumber(target);return;}if(target.dataset.openTask){void openTaskNotification(target.dataset.openTask);return;}if(target.dataset.openSubmission){void openSubmission(target.dataset.openSubmission);return;}if(target.dataset.dayTab){if(displayDays().includes(target.dataset.dayTab)){state.historyDate=null;state.filterDate=target.dataset.dayTab;render();}return;}if(target.dataset.person){const choice=STAFF.find(x=>x.id===target.dataset.person);if(DEMO){state.profile=choice;localStorage.setItem('fourth-circuit-demo-profile',choice.id);notify(`مرحبًا ${choice.display_name}`,'success');render();}return;}if(target.dataset.taskEdit){openTaskEditor(target.dataset.taskEdit);return;}if(target.dataset.taskFilter){state.taskFilter=target.dataset.taskFilter;render();return;}if(target.dataset.nav){navigate(target.dataset.nav);return;}if(target.dataset.reviewDay){reviewState.date=target.dataset.reviewDay;render();return;}if(target.dataset.edit){openEditor(target.dataset.edit);return;}if(target.dataset.detail){void openCaseDetail(target.dataset.detail);return;}if(target.dataset.save){await saveCase(target.dataset.save);return;}if(target.dataset.stage){state.stageFilter=target.dataset.stage;render();return;}const action=target.dataset.action;if(!action)return;switch(action){case 'organizer-passkey-settings':showOrganizerPasskeySettings();break;case 'confirm-review':confirmReview();break;case 'new-case':openEditor();break;case 'case-entry-mode':switchCaseEntry(target.dataset.entryMode);break;case 'close-bulk':case 'discard-bulk':case 'add-bulk-row':case 'bulk-details':case 'remove-bulk-row':bulkAction(action,target);break;case 'discard-case-draft':discardSingleDraft();break;case 'new-task':openTaskEditor();break;case 'close-task-editor':closeTaskEditor();break;case 'approve-report':await approveReport();break;case 'export-tasks':exportTasksPng();break;case 'reload-preparation':void openCaseDetail(state.detailId);break;case 'copy-consult':await copyConsult();break;case 'close-editor':case 'close-detail':if(!caseSaving)closeModal();break;case 'toggle-source':state.showSource=!state.showSource;render();break;case 'next-day':state.historyDate=null;state.filterDate=nextWorkday();render();break;case 'delete-case':await softDeleteCase();break;case 'toggle-notifs':state.showNotifs=!state.showNotifs;render();break;case 'mark-read':await markRead();break;case 'notice-history':state.showReadNotices=!state.showReadNotices;render();break;case 'more-notice-history':state.noticeHistoryLimit=(state.noticeHistoryLimit||30)+30;await loadAll();break;case 'inspect-push':await inspectPushDevice();break;case 'local-push-display':await testLocalPushDisplay();break;case 'test-push-worker':await testCasePush(true);break;case 'renew-case-push':await enableCasePush(true);break;case 'test-case-push':await testCasePush();break;case 'enable-case-push':await enableCasePush();break;case 'enable-notifs':await enableNotifications();break;case 'refresh':await loadAll();notify('تم تحديث البيانات من القاعدة.','success');break;case 'logout':if(DEMO){resetCaseEntry();state.profile=null;localStorage.removeItem('fourth-circuit-demo-profile');render();}else await signOutAccount();break;case 'toggle-auth':state.authMode=state.authMode==='login'?'signup':'login';render();break;case 'export-png':exportPng();break;case 'share-png':await sharePng();break;}});
document.addEventListener('input',e=>{normalizeNumberInput(e.target);if(e.target.matches('#judge-preparation [name]')){updatePreparationField(e.target);return;}if(e.target.dataset.formField&&e.target.dataset.formField!=='stage'){const row=bulkRowFor(e.target);if(row||state.form){(row||state.form)[e.target.dataset.formField]=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');}}if(e.target.dataset.taskField&&state.taskForm){state.taskForm[e.target.dataset.taskField]=e.target.value;}if(e.target.matches('[data-task-search]')){state.taskSearch=e.target.value;const list=$('.tasks-list');if(list)list.innerHTML=visibleTaskRows();}if(e.target.matches('[data-search]')){state.search=e.target.value;const list=$('.cases-list');if(list)list.innerHTML=filteredCases().length?filteredCases().map(c=>caseRow(c,isJudge())).join(''):emptyState();void refreshCaseAssignments();}});
document.addEventListener('toggle',e=>{
 const card=e.target;
 if(!card.isConnected||!card.matches?.('[data-task-card]'))return;
 if(card.open)expandedTaskCards.add(card.dataset.taskCard);
 else expandedTaskCards.delete(card.dataset.taskCard);
},true);
document.addEventListener('change',e=>{
 if(e.target.matches('[data-task-person-filter]')){state.taskPersonFilter=e.target.value;render();return;}
 if(e.target.matches('[data-task-status-filter]')){state.taskStatusFilter=e.target.value;render();return;}
 if(state.taskForm&&e.target.matches('[data-task-all],[data-task-recipient]')){
  const inputs=[...document.querySelectorAll('[data-task-recipient]')];
  if(e.target.matches('[data-task-all]'))inputs.forEach(input=>{input.checked=e.target.checked;});
  state.taskForm.assigned_to=inputs.filter(input=>input.checked).map(input=>input.dataset.taskRecipient);
  syncTaskProposalField();
  $('[data-task-all]').checked=inputs.length>0&&state.taskForm.assigned_to.length===inputs.length;
  const mode=$('[data-task-mode]');if(mode)mode.hidden=state.taskForm.assigned_to.length<2;
  return;
 }
 if(state.taskForm&&e.target.matches('[data-task-mode-input]')){state.taskForm.completion_mode=e.target.value;return;}

 if(e.target.matches('[data-case-time-part]')){updateCaseTime(e.target);return;}
 if(e.target.matches('[data-form-field="stage"]')&&(state.form||bulkEntry)){changeCaseStage(e.target);return;}
 if(e.target.id==='bulk-default-date'&&bulkEntry){bulkEntry.date=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');return;}
 if(e.target.matches('[data-previous-sessions]')){state.historyDate=e.target.value||null;state.filterDate=state.historyDate||displayedWorkday;state.search='';state.stageFilter='all';render();return;}
 if(e.target.matches('[data-filter-date]')){if(displayDays().includes(e.target.value)){state.historyDate=null;state.filterDate=e.target.value;render();}else notify('اختر يوم عمل من الأيام الخمسة القادمة.','error');}
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
document.addEventListener('submit',e=>{if(e.target.id==='account-login-form'){e.preventDefault();void loginAccount(e.target);return;}if(e.target.id==='session-outcome-form'){e.preventDefault();void saveSessionOutcome(e.target);return;}if(e.target.id==='judge-preparation'){e.preventDefault();void saveCasePreparation();return;}if(e.target.id==='followup-form'){e.preventDefault();void saveFollowup(e.target,e.submitter);return;}if(e.target.matches('[data-task-note-form]')){e.preventDefault();void submitTaskNote(e.target);return;}if(e.target.id==='bulk-case-form'){e.preventDefault();void saveBulkEntry();}if(e.target.id==='case-form'){e.preventDefault();saveCase('ready');}if(e.target.id==='task-form'){e.preventDefault();saveTask();}});
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
 // توزيع الجلسات: اليوم غير المحفوظ يُعبّأ تلقائيًا بأوقات جلسات المنظم (المطابقة لتقاضي).
 globalThis.__organizerHearings=date=>state.cases.filter(c=>c.session_date===date&&!c.deleted_at&&c.session_time)
  .map(c=>{const [h,m]=String(c.session_time).split(':').map(Number);const hh=Math.min(14,Math.max(8,h||8));const slot={h:hh,m:hh===14?0:Math.min(59,Math.max(0,m||0))};
   if(c.session_end_time){const [eh,em]=String(c.session_end_time).split(':').map(Number);if(eh*60+em>slot.h*60+slot.m&&eh*60+em<=15*60){slot.endH=eh;slot.endM=em;}}
   return slot;})
  .sort((a,b)=>a.h*60+a.m-(b.h*60+b.m));
 // الاسم الكامل لمنشئ الجدول في الصورة المحفوظة.
 globalThis.__hearingsCreatorName=name=>{const n=String(name||'');
  if(/الشريف|عبد ?الرحمن/.test(n))return 'عبد الرحمن يحيى علي الشريف';
  if(/بكري|^يحيى/.test(n))return 'يحيى محمد إبراهيم بكري';
  if(/زياد|البابطين/.test(n))return 'زياد بن محمد البابطين';
  return n;};
 hearingsMount=import('./assets/hearings/main.js?v=5.0.30').then(module=>{
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
window.setInterval(()=>{updateClock();refreshDisplayWorkday();},1000);
document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-past-sessions]'))pastSessionsOpen=e.target.open;},true);
window.setInterval(()=>{
 if(!state.user||state.detailId||state.editorId||state.taskEditorId||!['dashboard','cases'].includes(state.screen))return;
 if(document.activeElement?.matches?.('input,textarea,select'))return;
 const today=todayRiyadh();if(state.filterDate!==today)return;
 const key=state.cases.filter(c=>c.session_date===today&&!c.deleted_at&&sessionEnded(c)).map(c=>c.id).sort().join(',');
 if(key!==pastSessionsKey.split(',').filter(Boolean).sort().join(','))render();
},60000);
document.addEventListener('visibilitychange',refreshDisplayWorkday);
