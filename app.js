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
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayRiyadh = () => {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:KSA,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return `${parts.find(x=>x.type==='year').value}-${parts.find(x=>x.type==='month').value}-${parts.find(x=>x.type==='day').value}`;
};
const addDays = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
const tomorrow = () => addDays(todayRiyadh(), 1);
const nextWorkday = () => {let d=todayRiyadh();do{d=addDays(d,1);}while([5,6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));return d;};
const hijri = (d) => {try{return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric',timeZone:KSA}).format(new Date(`${d}T12:00:00Z`));}catch{return d;}};
const gregorian = (d) => {try{return new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:KSA}).format(new Date(`${d}T12:00:00Z`));}catch{return d;}};
// جميع التواريخ المعروضة هجرية بأم القرى، وتُحفظ بصيغة ISO داخل القاعدة للفرز فقط.
const hijriLong=(iso)=>{try{return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${iso}T12:00:00Z`));}catch{return iso||'—';}};
const fiveWorkdays=()=>{const out=[];let day=todayRiyadh();while(out.length<5){day=addDays(day,1);if(![5,6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))out.push(day);}return out;};
const dayWithinWindow=(day)=>fiveWorkdays().includes(day);
function workdaySelect(value,attr,label='اختر يوم الجلسات'){
  const days=fiveWorkdays(),opts=days.map((day)=>`<option value="${day}" ${day===value?'selected':''}>${esc(hijriLong(day))}</option>`).join('');
  const outside=value&&!days.includes(value)?`<option selected disabled value="${esc(value)}">تاريخ قديم خارج الأيام الخمسة — اختر يومًا جديدًا</option>`:'';
  return `<select class="field workday-select" ${attr} aria-label="${esc(label)}">${outside}${opts}</select>`;
}
function dayTabs(){return `<div class="workday-tabs" role="group" aria-label="اختيار يوم العمل">${fiveWorkdays().map(day=>{const weekday=new Intl.DateTimeFormat('ar-SA',{weekday:'long',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));const parts=hijriParts(day);const label=HIJRI_MONTHS[parts.month-1];const count=state.cases.filter(c=>c.session_date===day).length;return `<button type="button" data-day-tab="${day}" aria-pressed="${day===state.filterDate}" class="workday-tab ${day===state.filterDate?'active':''}"><b>${weekday}</b><span>${parts.day} ${label}</span><small>${count} ${count===1?'قضية':'قضايا'}</small></button>`;}).join('')}</div>`;}
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
function hijriPicker(field,iso,label,{past=10,future=3,mandatory=false,parts:chosenParts}={}){
  const parts=chosenParts||hijriParts(iso),year=hijriParts(todayRiyadh()).year;
  const attrs=`data-hijri-field="${field}"`;
  const picker=(part,items,placeholder)=>`<select class="input hijri-date-part" ${attrs} data-hijri-part="${part}" aria-label="${label} - ${placeholder}" ${mandatory?'required':''}><option value="">${placeholder}</option>${items.map(([v,l])=>`<option value="${v}" ${parts?.[part]===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const days=Array.from({length:30},(_,i)=>[i+1,String(i+1)]),months=HIJRI_MONTHS.map((v,i)=>[i+1,v]);
  const years=Array.from({length:past+future+1},(_,i)=>year+future-i).map(v=>[v,String(v)+' هـ']);
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
const stamp = (v) => v ? new Intl.DateTimeFormat('ar-SA',{timeZone:KSA,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)) : '—';
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
function notify(message,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toast-root').append(el);setTimeout(()=>el.remove(),4700);}
function initialForm(date=state.filterDate){return {case_number:'',session_date:date,session_time:'08:00',plaintiffs:'',defendants:'',case_type:'',claim_summary:'',stage:'first',previous_date:'',previous_minutes:'',status:'draft'};}
const statusTitle = (v)=>({draft:'مسودة',ready:'بانتظار الاعتماد',approved:'معتمدة'}[v]||'مسودة');
const stageTitle=(v)=>v==='first'?'جلسة تحضيرية (أولى)':'جلسة لاحقة';
const listForDate=()=>state.cases.filter(c=>c.session_date===state.filterDate).sort((a,b)=>String(a.session_time).localeCompare(String(b.session_time)));
const filteredCases=()=>listForDate().filter(c=>(state.stageFilter==='all'||c.status===state.stageFilter)&&[c.case_number,c.plaintiffs,c.defendants,c.case_type,c.claim_summary].some(v=>String(v||'').includes(state.search)));
const profileName=(id)=>state.profiles.find(p=>p.id===id)?.display_name||'أحد الموظفين';
function navigate(screen){state.screen=screen;state.showNotifs=false;render();window.scrollTo({top:0,behavior:'smooth'});}
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
  ${state.screen==='dashboard'?dashboard():state.screen==='tasks'?tasksPage():state.screen==='hearings'?'<div id="hearings-slot"></div>':sessionsPage()}</div></main></div>${state.editorId!==null?editorModal():''}${state.detailId!==null?detailModal():''}${state.taskEditorId!==null?taskEditor():''}${bulkEntry?bulkEditor():''}`;
}
function renderNotifPopup(){return `<div class="notif-pop"><div class="status-line"><h3>التنبيهات</h3><button class="btn btn-small" data-action="mark-read">تحديد الكل كمقروء</button></div>${state.notifications.length?`<div class="notice-list">${state.notifications.slice(0,15).map(n=>`<div class="notice-item ${!n.read_at?'unread':''}">${esc(n.message)}<small>${stamp(n.created_at)}</small></div>`).join('')}</div>`:'<div class="empty" style="padding:20px">لا توجد تنبيهات بعد</div>'}<button class="text-button" data-action="enable-notifs">تفعيل تنبيه المتصفح أثناء فتح الموقع</button></div>`;}
function stat(label,value,note,icon){return `<div class="stat"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-number">${value}</div><div class="stat-note">${note}</div></div>`;}
function dashboard(){
 const all=listForDate(),approved=all.filter(c=>c.status==='approved').length,ready=all.filter(c=>c.status==='ready').length;
 const pending=state.tasks.filter(t=>!t.deleted_at&&t.status==='open');
 const urgent=pending.filter(t=>t.priority==='urgent');
 return `<div class="welcome-banner"><div><span class="hero-kicker">لوحة تنظيم العمل</span><h1>كل أعمال الدائرة في مكان واحد</h1><p>قضايا الجلسات، ومحاضرها، والمهام الواردة من الكتّاب وأمناء السر؛ تُراجع وتُنجز من لوحة واحدة.</p><div class="hero-date">◷ ${hijriLong(state.filterDate)}</div></div><div class="hero-deco" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div>
 <div class="stats">${stat('قضايا اليوم المحدد',all.length,'بحسب جدول الجلسات','▤')}${stat('قضايا معتمدة',approved,'راجعتها الدائرة','✓')}${stat('بانتظار الاعتماد',ready,'تحتاج مراجعة','◷')}${stat('مهام قيد الإنجاز',pending.length,urgent.length+' منها عاجلة','☷')}</div>
 <div class="dashboard-columns"><section class="dashboard-main"><div class="section-head"><div><span class="section-eyebrow">جلسات الدائرة</span><h2>قضايا اليوم المختار</h2></div><div class="section-actions"><span class="date-heading">اليوم الهجري:</span>${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button><button class="btn btn-soft" data-action="new-bulk">＋ إضافة عدة قضايا</button></div></div></div>
 ${dayTabs()}<div class="cases-list">${all.length?all.map(caseRow).join(''):emptyState()}</div><div class="compact-actions"><button class="btn btn-soft" data-nav="cases">عرض جميع القضايا ←</button><button class="btn btn-soft" data-nav="poster">حفظ تقرير الجلسات كصورة ↓</button></div></section>
 <aside class="dashboard-side"><div class="card aside-card"><div class="side-card-title"><div><span class="section-eyebrow">مهام ومتابعة</span><h3>المطلوب إنجازه</h3></div><button class="tiny-plus" data-action="new-task" title="إضافة مهمة">＋</button></div>${pending.length?pending.slice(0,5).map(taskCardMini).join(''):'<div class="mini-empty">لا توجد مهام معلّقة حاليًا.</div>'}<button class="text-button side-more" data-nav="tasks">فتح قائمة المتابعة ←</button></div>
 <div class="card aside-card"><div class="side-card-title"><h3>آخر الإضافات والتحديثات</h3></div>${state.notifications.length?`<div class="notice-list">${state.notifications.slice(0,4).map(n=>`<div class="notice-item">${esc(n.message)}<small>${stamp(n.created_at)}</small></div>`).join('')}</div>`:'<p class="hint">تظهر هنا إشعارات من أضاف قضية أو مهمة أو أنجزها.</p>'}</div></aside></div><p class="footer-note">التقرير يستند إلى ما أدخله أمناء السر من تقاضي؛ والمقتطف آلي أولي، ولا يغني عن الضبط الأصلي.</p>`;
}
function caseRow(c){return `<article class="case-row"><div class="time-pill">${esc(tm(c.session_time))}</div><div class="case-content"><div class="case-title">${esc(c.case_type||'قضية دون تصنيف')} <span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span></div><div class="case-sub"><span>رقم ${esc(c.case_number)}</span><span>${esc(short(c.plaintiffs,34))} × ${esc(short(c.defendants,34))}</span><span>${stageTitle(c.stage)}</span><span class="byline">أدخله: ${esc(profileName(c.created_by))}</span></div></div><div class="case-row-actions"><button class="btn btn-small" data-detail="${esc(c.id)}">عرض</button><button class="btn btn-small btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button></div></article>`;}
function emptyState(){return `<div class="card empty"><span class="empty-icon">▤</span><b>لا توجد قضايا في هذا التاريخ</b><p>يمكن إضافة القضايا وتعديلها في أي وقت خلال الأيام الخمسة القادمة.</p><button class="btn btn-primary" data-action="new-case">＋ إضافة قضية</button></div>`;}
function sessionsPage(){
 const report=state.screen==='poster';
 return `<div class="seg sessions-nav" role="group" aria-label="خيارات الجلسات">
  <button type="button" data-nav="cases" class="${report?'':'active'}" aria-pressed="${!report}">جدول الجلسات</button>
  <button type="button" data-nav="poster" class="${report?'active':''}" aria-pressed="${report}">تصميم التقرير</button>
 </div>${report?posterPage():casesPage()}`;
}
function casesPage(){return `<div class="eyebrow">السجل المشترك للقضايا</div><h1 class="heading">جدول القضايا والجلسات</h1><p class="subheading">إضافة وتعديل وحفظ بيانات الجلسات مع الاحتفاظ بسجل التعديلات.</p><div class="filters">${workdaySelect(state.filterDate,'data-filter-date','تصفية القضايا حسب يوم العمل')}<input type="search" class="search" data-search placeholder="ابحث برقم القضية أو بأحد أطرافها..." value="${esc(state.search)}"/><div class="seg">${[['all','الكل'],['draft','مسودة'],['ready','قيد المراجعة'],['approved','معتمدة']].map(([v,t])=>`<button data-stage="${v}" class="${state.stageFilter===v?'active':''}">${t}</button>`).join('')}</div><div class="case-entry-actions"><button class="btn btn-primary" data-action="new-case">＋ قضية جديدة</button><button class="btn btn-soft" data-action="new-bulk">＋ إضافة عدة قضايا</button></div></div>${dayTabs()}<div class="cases-list">${filteredCases().length?filteredCases().map(caseRow).join(''):emptyState()}</div>`;}
function posterPage(){
 const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');
 return `<div class="eyebrow">تقرير جاهز للمشاركة</div><h1 class="heading">تصميم تقرير الجلسات</h1><p class="subheading">اختر أحد أيام العمل الخمسة، وصدّر تقرير ذلك اليوم كصورة.</p><div class="poster-controls">${workdaySelect(state.filterDate,'data-filter-date','اختيار يوم التقرير')}<label class="pill"><input type="checkbox" data-approved-only ${state.posterApprovedOnly?'checked':''} /> المعتمدة فقط</label>${isJudge()?`<button class="btn btn-accent" data-action="approve-report" ${!cases.length||listForDate().some(c=>c.status!=='approved')?'disabled':''}>✓ ${isReportApproved()?'التقرير معتمد':'اعتماد التقرير'}</button>`:''}<button class="btn btn-primary" data-action="export-png" ${!cases.length?'disabled':''}>↓ حفظ التصميم كصورة PNG</button><button class="btn" data-action="share-png" ${!cases.length?'disabled':''}>↗ مشاركة الصورة</button></div><div class="report-status">${isReportApproved()?'✓ التقرير معتمد':'◇ التقرير بانتظار الاعتماد'} · ${esc(state.profile?.display_name||'')}</div><div class="poster-page"><div class="poster-head"><div><h2>تنظيم أعمال الدائرة الرابعة</h2><p>تقرير القضايا حسب يوم العمل</p></div><div style="font-size:31px;color:var(--brown)">▦</div></div><div class="poster-banner"><span>${hijriLong(state.filterDate)}</span><span>${cases.length} قضايا</span></div>${cases.length?cases.map((c,i)=>{const m=minutesExtract(c);return `<div class="poster-row"><div class="status-line"><h3>${i+1}. ${esc(c.case_type||'قضية')} — ${esc(tm(c.session_time))}</h3><span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span></div><p class="poster-info">رقم القضية ${esc(c.case_number)} | ${stageTitle(c.stage)} | ${esc(short(c.plaintiffs,45))} × ${esc(short(c.defendants,45))} | أدخلها: ${esc(profileName(c.created_by))}</p><div class="poster-line"><strong>موضوع الدعوى:</strong> ${esc(c.claim_summary||'غير مدخل')}</div><div class="poster-line"><strong>مقتطف من الضبط السابق:</strong> ${esc(m.overview)}</div>${m.evidence?`<div class="poster-line"><strong>العبارة المتعلقة برفع الجلسة:</strong> ${esc(m.evidence)}</div>`:''}</div>`;}).join(''):'<p class="hint">لا توجد قضايا للعرض في اليوم المختار.</p>'}<div class="poster-footer">المقتطف مستخرج آليًا للمراجعة من النص الأصلي، ولا يغني عنه.</div></div><p class="footer-note">تحتوي الصورة على بيانات القضايا؛ لا تُشارك إلا بالطرق المصرح بها.</p>`;
}
const CASE_FIELDS = [
 ['session_date','تاريخ الجلسة القادمة'],
 ['case_number','رقم القضية'],
 ['session_time','وقت الجلسة'],
 ['plaintiffs','المدعي / المدعون'],
 ['defendants','المدعى عليه / عليهم'],
 ['case_type','نوع الدعوى'],
 ['stage','مرحلة القضية'],
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
  `<input id="${id}" class="input" data-form-field="${name}" type="${type}" value="${esc(form[name]||'')}" required ${name==='case_number'?'maxlength="60"':''}>`);
}
function caseArea(form,name,id,rows){
 return caseField(name,`<label class="form-label" for="${id}">${CASE_LABELS[name]}${CASE_STAR}</label>`,
  `<textarea id="${id}" class="input" data-form-field="${name}" rows="${rows}" required>${esc(form[name]||'')}</textarea>`,{wide:true});
}
function caseStage(form,id){
 return caseField('stage',`<label class="form-label" for="${id}">${CASE_LABELS.stage}${CASE_STAR}</label>`,
  `<select id="${id}" class="input" data-form-field="stage" required><option value="first" ${form.stage==='first'?'selected':''}>جلسة تحضيرية (أولى)</option><option value="followup" ${form.stage==='followup'?'selected':''}>جلسة لاحقة</option></select>`);
}
function caseDate(form,id,options={}){
 const label=options.label||CASE_LABELS.session_date;
 const inherited=options.defaultDate;
 const select=workdaySelect(form.session_date,`id="${id}" data-form-field="session_date"${inherited?'':' required'}`,label);
 const placeholder=inherited?`<option value="" ${!form.session_date?'selected':''}>التاريخ المشترك</option>`:'';
 const control=placeholder?select.replace('</select>',placeholder+'</select>'):select;
 return caseField('session_date',`<label class="form-label" for="${id}">${label}${CASE_STAR}</label>`,control);
}
function casePreviousDate(form){
 return caseField('previous_date','',hijriPicker('previous_date',form.previous_date,'تاريخ الجلسة السابقة (هجري)',{past:25,future:1,mandatory:true,parts:form.previous_parts}),{wide:true});
}
function caseDateResult(form){
 if(form.previous_parts){
  const {day,month,year}=form.previous_parts;
  if(!day||!month||!year)return {error:'أكمل اليوم والشهر والسنة بالتاريخ الهجري.'};
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
 const caseNumber=String(form.case_number??'').trim();
 if(caseNumber&&(caseNumber.length<2||caseNumber.length>60))errors.case_number='رقم القضية يجب أن يتكون من حرفين إلى 60 حرفًا.';
 const date=form.session_date||defaultDate;
 if(!date||(checkWindow&&!dayWithinWindow(date)))errors.session_date='اختر تاريخًا من أيام العمل الخمسة القادمة.';
 if(!['first','followup'].includes(form.stage))errors.stage='اختر مرحلة القضية.';
 if(form.stage==='followup'){
  const previous=caseDateResult(form);
  if(previous.error)errors.previous_date=previous.error;
  if(!String(form.previous_minutes??'').trim())errors.previous_minutes='أدخل ضبط الجلسة السابقة كاملًا.';
 }
 if(checkDuplicate&&caseNumber&&state.cases.some(c=>c.id!==id&&c.case_number===caseNumber&&c.session_date===date)){
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
  if(message&&!first)first=group.querySelector('input,select,textarea');
 }
 return first;
}
function focusCaseField(field){
 if(!field)return;
 field.focus({preventScroll:true});
 field.scrollIntoView({block:'center',inline:'nearest'});
}
function casePayload(form,defaultDate){
 const payload=Object.fromEntries(CASE_FIELDS.map(([key])=>[key,typeof form[key]==='string'?form[key].trim():form[key]]));
 payload.session_date=form.session_date||defaultDate;
 payload.previous_date=form.stage==='followup'?caseDateResult(form).value:null;
 payload.previous_minutes=form.stage==='followup'?form.previous_minutes.trim():'';
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
function openBulkEntry(){
 if(caseSaving)return;
 closeModal(false);
 const saved=getCaseDraft('bulk');
 bulkEntry=Array.isArray(saved?.rows)&&saved.rows.length&&saved.rows.every(row=>/^[0-9a-f-]{36}$/i.test(row.id))?saved:{date:state.filterDate,rows:[newBulkRow()]};
 sortBulkRows();
 if(!dayWithinWindow(bulkEntry.date))bulkEntry.date=state.filterDate;
 render();
}
function sortBulkRows(){
 bulkEntry.rows.sort((a,b)=>(a.session_time||'99:99').localeCompare(b.session_time||'99:99'));
}
function bulkEditor(){
 const {date,rows}=bulkEntry;
 return `<div class="modal-backdrop" id="bulk-backdrop"><div class="modal bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
  <div class="modal-head"><div><h2 id="bulk-title">إضافة عدة قضايا</h2><small>${draftHint()}</small></div><button class="icon-button" type="button" data-action="close-bulk" aria-label="إغلاق">✕</button></div>
  <form id="bulk-case-form" novalidate><div class="modal-body">
   <div class="bulk-date">${caseDate({session_date:date},'bulk-default-date',{label:'تاريخ الجلسات المشترك (هجري)'})}</div>
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
  ${row.saved||row.attempted?`<p class="hint">${esc(row.case_number)} · ${esc(tm(row.session_time))}</p>`:`<div class="bulk-grid">
   ${caseInput(row,'case_number',id('number'))}${caseInput(row,'session_time',id('time'),'time')}
   ${caseInput(row,'plaintiffs',id('plaintiffs'))}${caseInput(row,'defendants',id('defendants'))}
   ${caseInput(row,'case_type',id('type'))}${caseStage(row,id('stage'))}
   <div class="bulk-row-actions"><button type="button" class="btn btn-small" data-action="bulk-details" aria-expanded="${row.expanded}">التفاصيل</button><button type="button" class="btn btn-small btn-danger" data-action="remove-bulk-row" aria-label="حذف ${rowLabel}">حذف</button></div>
  </div>${row.expanded?`<div class="form-grid bulk-details">
   ${caseDate(row,id('date'),{defaultDate:bulkEntry.date,label:'تاريخ هذه القضية (هجري)'})}
   ${caseArea(row,'claim_summary',id('summary'),3)}
   ${row.stage==='followup'?casePreviousDate(row)+caseArea(row,'previous_minutes',id('minutes'),7):''}
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
   const key=JSON.stringify([String(row.case_number??'').trim(),row.session_date||entry.date]);
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
  for(let offset=0;offset<rows.length;offset+=50){
   if(bulkEntry!==entry||actorId()!==author)return;
   const chunk=rows.slice(offset,offset+50);
   const payloads=chunk.map(row=>({...casePayload(row,entry.date),id:row.id,created_by:author,updated_by:author,status:'ready'}));
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
  notify('تم حفظ جميع القضايا.','success');
  await loadAll();
 }catch(error){
  if(bulkEntry!==entry||actorId()!==author)return;
  redrawBulkRows();
  summary.hidden=false;
  summary.textContent='تعذّر إكمال الحفظ. بقيت المسودة ويمكنك إعادة المحاولة دون تكرار القضايا المحفوظة.';
  if(error.code==='23505')summary.textContent+=' يوجد رقم قضية مسجل بالفعل في التاريخ نفسه.';
 }finally{
  caseSaving=false;
  if(form.isConnected){form.inert=false;submit.disabled=false;}
 }
}

function editorModal(){
 const f=state.form,id=state.editorId,canApprove=isJudge()&&id!=='new';
 const sessionSelect=caseDate(f,'f_session_date',{label:'تاريخ الجلسة القادمة (هجري)'});
 return `<div class="modal-backdrop" id="editor-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${id==='new'?'إضافة قضية جديدة':'تعديل بيانات القضية'}</h2><small>${draftHint()}</small></div><button class="icon-button" data-action="close-editor">✕</button></div><form id="case-form" novalidate><div class="modal-body"><div class="form-grid">${caseInput(f,'case_number','f_case_number','text')}${sessionSelect}${caseInput(f,'session_time','f_session_time','time')}${caseInput(f,'plaintiffs','f_plaintiffs','text')}${caseInput(f,'defendants','f_defendants','text')}${caseInput(f,'case_type','f_case_type','text')}${caseStage(f,'f_stage')}${f.stage==='followup'?casePreviousDate(f):''}</div><div class="form-grid">${caseArea(f,'claim_summary','f_claim_summary',4)}</div>${f.stage==='followup'?`<div class="divider-label">الضبط الأصلي للجلسة السابقة</div><p class="hint">الصق ضبط الجلسة السابقة كاملًا كما هو في تقاضي، دون اختصار. يُعرض للقاضي مقتطف تحضيري تلقائيًا مع إمكانية فتح الأصل كاملًا.</p><div class="form-grid">${caseArea(f,'previous_minutes','f_previous_minutes',12)}</div>`:''}</div><div class="modal-foot">${id!=='new'?'<button type="button" class="btn btn-danger" data-action="delete-case">حذف من الجدول</button>':''}<button type="button" class="btn" data-action="close-editor">إلغاء</button><button type="button" class="btn btn-soft" data-save="draft">حفظ مسودة محليًا</button><button type="button" class="btn" data-action="discard-case-draft">حذف المسودة</button><button type="button" class="btn btn-primary" data-save="ready">حفظ وإرسال للمراجعة</button>${canApprove?'<button type="button" class="btn btn-primary" data-action="approve-from-editor">✓ حفظ واعتماد</button>':''}</div></form></div></div>`;
}
function detailModal(){
 const c=state.cases.find(x=>x.id===state.detailId);if(!c)return '';
 const info=(title,value,wide=false)=>`<div class="detail-field ${wide?'detail-wide':''}"><small>${title}</small><p>${esc(value||'غير مدخل')}</p></div>`;
 const m=minutesExtract(c),judge=isJudge();
 return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>القضية رقم ${esc(c.case_number)}</h2><small>${esc(c.case_type)} • ${hijriLong(c.session_date)} • ${tm(c.session_time)}</small></div><button class="icon-button" data-action="close-detail">✕</button></div><div class="modal-body"><div class="status-line"><span class="badge ${esc(c.status)}">${statusTitle(c.status)}</span><span class="pill">${stageTitle(c.stage)}</span></div><div class="detail-grid" style="margin-top:24px">${info('المدعي',c.plaintiffs)}${info('المدعى عليه',c.defendants)}${info('موضوع الدعوى',c.claim_summary,true)}${c.previous_date?info('تاريخ الجلسة الأخيرة',hijriLong(c.previous_date),true):''}${judge?`<div class="detail-field detail-wide summary-card"><small>معاينة مختصرة آلية من الضبط الأصلي</small><p>${esc(m.overview)}</p>${m.evidence?`<small class="summary-label">عبارة ورود رفع الجلسة في المحضر</small><p class="quote-text">${esc(m.evidence)}</p>`:''}<small class="summary-note">هذا استخراج نصي أولي غير معتمد، وقد لا يوضح سبب الرفع بدقة. راجع الأصل دائمًا.</small></div><div class="detail-field detail-wide"><button class="btn btn-soft" data-action="toggle-source">${state.showSource?'إخفاء':'عرض'} ضبط الجلسة السابقة كاملًا</button>${state.showSource?`<div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div>`:''}</div>`:`<div class="detail-field detail-wide"><small>الضبط الأصلي كاملًا</small><div class="source-box source-expanded">${esc(c.previous_minutes||'لا يوجد ضبط محفوظ')}</div></div>`}<div class="detail-field detail-wide"><small>آخر تحديث</small><p>${stamp(c.updated_at)} • ${esc(profileName(c.updated_by||c.created_by))}</p></div></div></div><div class="modal-foot"><button class="btn" data-action="close-detail">إغلاق</button><button class="btn btn-soft" data-edit="${esc(c.id)}">✎ تعديل</button>${isJudge()&&c.status!=='approved'?`<button class="btn btn-primary" data-approve="${esc(c.id)}">✓ اعتماد البيانات</button>`:''}</div></div></div>`;
}
function initialTask(){return {title:'',category:'case',case_number:'',details:'',due_date:'',priority:'normal',status:'open'};}
function taskCardMini(t){return `<div class="mini-task"><span class="priority-dot ${esc(t.priority)}"></span><div><b>${esc(short(t.title,62))}</b><small>${esc(taskCategories[t.category]||'أخرى')} ${t.case_number?' · '+esc(t.case_number):''} · بواسطة ${esc(profileName(t.created_by))}</small></div>${isJudge()?`<button class="mini-check" title="تم الإنجاز" data-task-toggle="${esc(t.id)}">✓</button>`:''}</div>`;}
function tasksPage(){const visible=state.tasks.filter(t=>!t.deleted_at&& (state.taskFilter==='all'||t.status===state.taskFilter) && [t.title,t.details,t.case_number,profileName(t.created_by)].join(' ').includes(state.taskSearch));
 const pending=state.tasks.filter(x=>!x.deleted_at&&x.status==='open'),done=state.tasks.filter(x=>!x.deleted_at&&x.status==='done');
 return `<div class="eyebrow">تنظيم العمل والمتابعة</div><h1 class="heading">المهام والتذكيرات</h1><p class="subheading">أمناء السر يضيفون الأعمال المطلوب متابعتها، وتظهر للقاضي مع اسم من أضافها. وعند الإنجاز يضع القاضي علامة ✓.</p>
 <div class="task-stats">${stat('تحتاج إلى إجراء',pending.length,'لم يتم إنجازها بعد','☷')}${stat('مهام عاجلة',pending.filter(x=>x.priority==='urgent').length,'الأولى بالمتابعة','!')}${stat('تم إنجازها',done.length,'محفوظة في السجل','✓')}</div>
 <div class="section-head"><div><span class="section-eyebrow">سجل الأعمال</span><h2>قائمة المتابعة</h2></div><div class="section-actions"><button class="btn btn-soft" data-action="export-tasks">↓ حفظ المهام كصورة</button><button class="btn btn-primary" data-action="new-task">＋ إضافة مهمة جديدة</button></div></div>
 <div class="filters"><input type="search" class="search" data-task-search placeholder="ابحث عن بريد أو قضية أو رقم تذكرة..." value="${esc(state.taskSearch)}"/><div class="seg">${[['open','قيد الإنجاز'],['done','المنجزة'],['all','الجميع']].map(([v,n])=>`<button data-task-filter="${v}" class="${state.taskFilter===v?'active':''}">${n}</button>`).join('')}</div></div>
 <div class="tasks-list">${visible.length?visible.sort((a,b)=>(a.status==='done')-(b.status==='done')||({urgent:0,normal:1,low:2}[a.priority]-({urgent:0,normal:1,low:2}[b.priority]))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).map(taskRow).join(''):`<div class="card empty"><b>لا توجد مهام في هذا العرض</b><p>يمكن إضافة مهمة خاصة بالبريد، أو قضية تحتاج إلى تصحيح، أو تذكرة، أو أي عمل آخر.</p></div>`}</div>`;
}
function taskRow(t){return `<article class="task-row ${t.status==='done'?'task-done':''}"><div class="task-check-wrap">${isJudge()?`<button class="task-check" title="${t.status==='done'?'إعادة فتح المهمة':'تحديد أنها أُنجزت'}" data-task-toggle="${esc(t.id)}">${t.status==='done'?'✓':'○'}</button>`:`<span class="task-check readonly">${t.status==='done'?'✓':'○'}</span>`}</div><div class="task-info"><div class="task-title">${esc(t.title)} <span class="badge ${t.priority==='urgent'?'priority-urgent':'priority-normal'}">${priorityNames[t.priority]||'عادية'}</span></div><div class="task-details">${esc(short(t.details,240))}</div><div class="task-meta"><span>${esc(taskCategories[t.category]||'أخرى')}</span>${t.case_number?`<span>رقم القضية: ${esc(t.case_number)}</span>`:''}${t.due_date?`<span>الموعد: ${hijri(t.due_date)}</span>`:''}<span>أضافها: ${esc(profileName(t.created_by))}</span><span>${stamp(t.created_at)}</span><span>${esc(profileName(t.updated_by||t.created_by))}</span>${t.status==='done'?`<span class="done-info">أُنجزت بواسطة: ${esc(profileName(t.completed_by))}</span>`:''}</div></div><div class="task-actions"><span class="badge ${t.status==='done'?'approved':'ready'}">${t.status==='done'?'منجزة':'قيد الإنجاز'}</span><button class="btn btn-small btn-soft" data-task-edit="${esc(t.id)}">✎ تعديل</button></div></article>`;}
function taskEditor(){const f=state.taskForm,id=state.taskEditorId;const fld=(name,label,type='text')=>`<div class="form-group"><label class="form-label">${label}</label><input class="input" type="${type}" data-task-field="${name}" value="${esc(f[name]||'')}" /></div>`;
 return `<div class="modal-backdrop"><div class="modal task-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${id==='new'?'إضافة مهمة أو تذكير':'تعديل المهمة'}</h2><small>يُحفظ اسم من أضاف المهمة ومن أنجزها.</small></div><button class="icon-button" data-action="close-task-editor">✕</button></div><form id="task-form"><div class="modal-body"><div class="form-grid two"><div class="form-group wide"><label class="form-label">عنوان المهمة *</label><input class="input" data-task-field="title" maxlength="220" required placeholder="مثل: الرد على البريد بخصوص القضية ..." value="${esc(f.title||'')}" /></div><div class="form-group"><label class="form-label">نوع المهمة</label><select class="input" data-task-field="category">${Object.entries(taskCategories).map(([k,v])=>`<option value="${k}" ${f.category===k?'selected':''}>${v}</option>`).join('')}</select></div>${fld('case_number','رقم القضية أو التذكرة (اختياري)')}<div class="form-group"><label class="form-label">الأولوية</label><select class="input" data-task-field="priority">${Object.entries(priorityNames).map(([k,v])=>`<option value="${k}" ${f.priority===k?'selected':''}>${v}</option>`).join('')}</select></div>${hijriPicker('due_date',f.due_date,'التاريخ المطلوب (هجري)',{past:5,future:10})}<div class="form-group wide"><label class="form-label">تفاصيل المطلوب</label><textarea class="input" rows="4" data-task-field="details" placeholder="ما الذي يلزم عمله؟ وما الرسالة أو المستند الذي يرجع إليه؟">${esc(f.details||'')}</textarea></div></div></div><div class="modal-foot">${id!=='new'?'<button type="button" class="btn btn-danger" data-action="delete-task">إزالة المهمة</button>':''}<button type="button" class="btn" data-action="close-task-editor">إلغاء</button><button type="submit" class="btn btn-primary">✓ حفظ المهمة</button></div></form></div></div>`;}
function openTaskEditor(id='new'){state.editorId=null;state.detailId=null;state.taskEditorId=id;state.taskForm=id==='new'?initialTask():{...state.tasks.find(t=>t.id===id)};render();}
function closeTaskEditor(){state.taskEditorId=null;state.taskForm=null;render();}
async function saveTask(){const f=state.taskForm;if(!f||!f.title?.trim()||f.title.trim().length<3)return notify('اكتب عنوان المهمة على الأقل.','error');const due=readHijriPicker('due_date');if(!due.ok)return notify(due.message,'error');f.due_date=due.value;const fields=['title','category','case_number','details','due_date','priority'];const payload=Object.fromEntries(fields.map(k=>[k,f[k]||'']));payload.title=payload.title.trim();payload.due_date=payload.due_date||null;const isNew=state.taskEditorId==='new';
 try{if(DEMO){const old=state.tasks.find(x=>x.id===state.taskEditorId),v={...old,...payload,id:isNew?uid():old.id,status:old?.status||'open',created_by:old?.created_by||actorId(),updated_by:actorId(),created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};state.tasks=isNew?[v,...state.tasks]:state.tasks.map(x=>x.id===v.id?v:x);demoEvent(`${state.profile.display_name} ${isNew?'أضاف':'عدّل'} مهمة: ${v.title}`);closeTaskEditor();notify('تم حفظ المهمة في المعاينة.','success');return;}
 const data=isNew?{...payload,created_by:actorId()}:{...payload};const res=isNew?await state.client.from('tasks').insert(data):await state.client.from('tasks').update(data).eq('id',state.taskEditorId);if(res.error)throw res.error;closeTaskEditor();await loadAll();notify('تم حفظ المهمة وظهرت في الحسابات المشتركة.','success');}catch(e){notify('تعذّر حفظ المهمة: '+e.message,'error');}}
async function toggleTask(id){if(!isJudge())return notify('الإنجاز يُعتمد من حساب القاضي.','error');const t=state.tasks.find(x=>x.id===id);if(!t)return;const done=t.status!=='done';try{if(DEMO){t.status=done?'done':'open';t.completed_by=done?actorId():null;t.completed_at=done?new Date().toISOString():null;t.updated_by=actorId();t.updated_at=new Date().toISOString();demoEvent(`${state.profile.display_name} ${done?'أنجز':'أعاد فتح'} مهمة: ${t.title}`);render();return;}const {error}=await state.client.from('tasks').update({status:done?'done':'open'}).eq('id',id);if(error)throw error;await loadAll();notify(done?'تم إنجاز المهمة.':'أُعيد فتح المهمة.','success');}catch(e){notify('تعذّر تحديث المهمة: '+e.message,'error');}}
async function deleteTask(){const id=state.taskEditorId;const t=state.tasks.find(x=>x.id===id);if(!t||!confirm('إزالة هذه المهمة من القائمة؟'))return;try{if(DEMO){state.tasks=state.tasks.filter(x=>x.id!==id);demoEvent(`${state.profile.display_name} أزال مهمة: ${t.title}`);closeTaskEditor();return;}const {error}=await state.client.from('tasks').update({deleted_at:new Date().toISOString()}).eq('id',id);if(error)throw error;closeTaskEditor();await loadAll();}catch(e){notify('تعذّرت إزالة المهمة: '+e.message,'error');}}
function exportTasksPng(){
 const tasks=state.tasks.filter(t=>!t.deleted_at&&t.status==='open').slice(0,65);
 if(!tasks.length)return notify('لا توجد مهام مفتوحة لتصدير صورتها.','error');
 try{
  const w=1100,h=320+tasks.length*250,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.direction='rtl';
  ctx.fillStyle='#f2f7f5';ctx.fillRect(0,0,w,h);ctx.fillStyle='#087967';ctx.fillRect(0,0,w,15);ctx.textAlign='right';ctx.font='bold 43px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('تنظيم أعمال الدائرة الرابعة',w-65,91);ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillStyle='#59796c';ctx.fillText('قائمة المتابعة • المهام غير المنجزة',w-65,136);
  roundRect(ctx,65,168,w-130,70,8,'#087967');ctx.fillStyle='#fff';ctx.font='bold 26px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`${tasks.length} مهام تحتاج متابعة`,w-90,212);
  let y=258;for(const [i,t] of tasks.entries()){
   roundRect(ctx,65,y,w-130,224,9,'#fff');ctx.strokeStyle='#dcebe5';ctx.lineWidth=1;ctx.strokeRect(65,y,w-130,224);ctx.fillStyle='#087967';ctx.font='bold 25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`${i+1}. ${short(t.title,68)}`,w-88,y+41);
   ctx.fillStyle='#718b81';ctx.font='20px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`النوع: ${taskCategories[t.category]||'متابعة'} | الأولوية: ${priorityNames[t.priority]||'عادية'}${t.case_number?' | رقم القضية: '+short(t.case_number,20):''}`,w-88,y+80);
   ctx.fillStyle='#325e52';drawWrapped(ctx,short(t.details||'لا توجد تفاصيل إضافية',240),w-88,y+119,w-185,28,{size:19,max:2});
   ctx.fillStyle='#7d988e';ctx.font='19px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`أضافها: ${short(profileName(t.created_by),34)}${t.due_date?' | المطلوب: '+hijri(t.due_date):''}`,w-88,y+190);y+=250;
  }
  ctx.fillStyle='#607d74';ctx.font='18px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.textAlign='center';ctx.fillText('قائمة متابعة داخلية — يلزم التحقق من الأعمال في نظامها الأصلي',w/2,h-30);
  canvas.toBlob(blob=>{if(!blob)return notify('تعذر إنشاء الصورة.','error');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`مهام-الدائرة-الرابعة-${todayRiyadh()}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);notify('تم تجهيز صورة قائمة المهام.','success');},'image/png');
 }catch(e){notify('تعذر إخراج الصورة: '+e.message,'error');}
}
function isReportApproved(){return !!state.reportApprovals.find(r=>r.session_date===state.filterDate&&r.approved_at);}
async function approveReport(){if(!isJudge())return notify('اعتماد التقرير متاح للقاضي فقط.','error');const all=listForDate();if(!all.length||all.some(x=>x.status!=='approved'))return notify('اعتمد جميع ملخصات القضايا أولًا.','error');if(!confirm('هل راجعت قضايا هذا التاريخ وتريد اعتماد التقرير قبل حفظ صورته؟'))return;
 try{if(DEMO){state.reportApprovals=state.reportApprovals.filter(x=>x.session_date!==state.filterDate);state.reportApprovals.push({session_date:state.filterDate,approved_at:new Date().toISOString(),approved_by:actorId(),case_count:all.length});demoEvent(`${state.profile.display_name} اعتمد تقرير جلسات ${state.filterDate}`);render();return;}const {error}=await state.client.from('report_approvals').upsert({session_date:state.filterDate,approved_at:new Date().toISOString(),case_count:all.length},{onConflict:'session_date'});if(error)throw error;await loadAll();notify('تم اعتماد التقرير ويمكن حفظ الصورة.','success');}catch(e){notify('تعذّر اعتماد التقرير: '+e.message,'error');}}
function render(){if(!dayWithinWindow(state.filterDate))state.filterDate=nextWorkday();if(!app)return;if(DEMO&&!state.profile){app.innerHTML=selectUserScreen();return;}if(!DEMO&&!state.user){app.innerHTML=authScreen();return;}if(!DEMO&&!state.profile?.is_active){app.innerHTML=pendingScreen();return;}app.innerHTML=shell();if(state.screen==='hearings')showHearings();}
function selectUserScreen(){return `<div class="choose-screen"><div class="choose-header"><span class="choose-emblem">▦</span><span>${APP_NAME}</span></div><div class="choose-card"><div class="eyebrow">مساحة العمل</div><h1>مرحبًا بك</h1><p>اختر اسمك للدخول، وسيظهر اسمك عند إضافة القضايا والمهام وتعديلها.</p><div class="staff-grid">${STAFF.map(p=>`<button data-person="${esc(p.id)}" class="staff-choice"><span class="staff-avatar">${esc(p.display_name[0])}</span><span><b>${esc(p.display_name)}</b><small>${roleTitle(p.role)}</small></span><span class="staff-arrow">←</span></button>`).join('')}</div><div class="selector-notice">الحفظ الحالي محلي في هذا الجهاز فقط إلى أن تُفعّل قاعدة بيانات مستقلة. اختيار الاسم وحده لا يؤكد هوية الموظف. لا تُدخل معلومات قضائية حقيقية قبل تفعيل الحفظ المشترك المحمي.</div></div><div class="choose-foot">مساحة عمل مستقلة — دون شعار أو انتماء مؤسسي.</div></div>`;}
function authScreen(){return `<div class="choose-screen"><div class="choose-header"><span class="choose-emblem">▦</span><span>${APP_NAME}</span></div><div class="choose-card auth-choice"><div class="eyebrow">الدخول باختيار الاسم</div><h1>اختر اسمك</h1><p>لا يلزم بريد إلكتروني أو كلمة مرور. عند أول استخدام على جهاز جديد، يلزم اعتماد الجهاز من مسؤول قاعدة البيانات للسماح بالاطلاع على القضايا.</p><div class="staff-grid">${STAFF.map(p=>`<button data-person="${esc(p.id)}" class="staff-choice"><span class="staff-avatar">${esc(p.display_name[0])}</span><span><b>${esc(p.display_name)}</b><small>${roleTitle(p.role)}</small></span><span class="staff-arrow">←</span></button>`).join('')}</div><div class="selector-notice">لكل جهاز اعتماد مرة واحدة لحماية البيانات؛ ويظل الدخول بعد ذلك بالاسم فقط. اختيار اسم غير صاحب الجهاز لا يمنحه صلاحياته.</div></div></div>`;}
function pendingScreen(){return `<div class="auth-screen"><div class="auth-art"><h1>${APP_NAME}</h1><p>بيانات القضايا محمية بصلاحيات محددة.</p></div><div class="auth-form-wrap"><div class="auth-form"><div class="eyebrow">الحساب قيد المراجعة</div><h2>بانتظار اعتماد الجهاز</h2><p>تم إنشاء هوية مؤقتة لهذا الجهاز، ولم تُعتمد صلاحية الوصول بعد. يراجع المشرف طلب الجهاز ثم يربطه باسم صاحبه، دون بريد أو كلمة مرور.</p><p class="hint">معرّف الجهاز: ${esc(state.user?.id||"غير متاح")}</p><button class="btn" data-action="refresh-profile">التحقق مجددًا</button><button class="text-button" data-action="logout">تسجيل الخروج</button></div></div></div>`;}
function clearPreviousSession(form){
 delete form.previous_parts;
 form.previous_date=null;
 form.previous_minutes='';
}
function openEditor(id='new'){
 if(caseSaving)return;
 state.detailId=null;
 state.showSource=false;
 state.editorId=id;
 bulkEntry=null;
 state.form=getCaseDraft('single:'+id)||(id==='new'?initialForm():{...state.cases.find(x=>x.id===id)});
 if(state.form.stage==='first')clearPreviousSession(state.form);
 render();
}
function changeCaseStage(select){
 const row=bulkRowFor(select);
 const form=row||state.form;
 if(!form||!applyCaseStage(form,select))return;
 if(row)redrawBulkRows();else render();
 document.getElementById(select.id)?.focus({preventScroll:true});
}
function closeModal(shouldRender=true){
 rememberCaseEntry();
 resetCaseEntry();
 state.detailId=null;
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
 const first=showCaseErrors(editor,caseErrors(f,editorId));
 if(first){focusCaseField(first);return;}
 const payload=casePayload(f);
 const originalCase=state.cases.find(c=>c.id===state.editorId);
 if(originalCase&&(f.previousSessionDiscarded||f.stage==='first'||originalCase.stage==='first')){
  // Legacy summaries and evidence must not refer to a discarded session.
  Object.assign(payload,{last_session_summary:'',adjournment_reason:'',reason_evidence_quote:'',next_action:'',summary_warning:''});
 }
 payload.status=status==='approved'?'approved':status;payload.updated_by=actorId();if(status==='approved'){if(state.profile?.role!=='judge'){notify('الاعتماد متاح للقاضي فقط.','error');return;}if(payload.stage!=='first'&&!payload.previous_minutes){notify('لا يمكن اعتماد متابعة دون نص الضبط.','error');return;}}if(editorId==='new')payload.created_by=author;caseSaving=true;editor.inert=true;state.loading=true;try{if(DEMO){let isNew=state.editorId==='new';const old=state.cases.find(c=>c.id===state.editorId);const doc={...old,...payload,id:isNew?uid():state.editorId,created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),created_by:old?.created_by||actorId()};if(old?.status==='approved'&&JSON.stringify(payload)!==JSON.stringify(Object.fromEntries(Object.keys(payload).map(k=>[k,old[k]])))&&status!=='approved')doc.status='ready';if(status==='approved')doc.approved_by=actorId();state.cases=isNew?[...state.cases,doc]:state.cases.map(x=>x.id===doc.id?doc:x);state.reportApprovals=state.reportApprovals.filter(r=>![doc.session_date,old?.session_date].includes(r.session_date));demoEvent(`${state.profile.display_name} ${isNew?'أضاف':'عدّل'} القضية ${doc.case_number}`);state.filterDate=doc.session_date;notify('تم الحفظ محليًا في هذه المعاينة.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();return;}let query=state.client.from('cases');let result=state.editorId==='new'?await query.insert(payload).select('id').single():await query.update(payload).eq('id',state.editorId).select('id').single();if(result.error)throw result.error;if(actorId()!==author||state.form!==f)return;state.filterDate=payload.session_date;notify(status==='approved'?'حُفظت القضية واعتمدت.':'حُفظت القضية وظهرت في الحسابات المشتركة.','success');storeCaseDraft('single:'+editorId,null);resetCaseEntry();closeModal();await loadAll();}catch(err){notify('تعذّر الحفظ: '+err.message,'error');}finally{state.loading=false;caseSaving=false;if(editor.isConnected)editor.inert=false;}}
async function approveCase(id){if(!isJudge())return;const c=state.cases.find(x=>x.id===id);if(!c)return;if(Object.keys(caseErrors(c,id,{checkDuplicate:false,checkWindow:false})).length){openEditor(id);focusCaseField(showCaseErrors($('#case-form'),caseErrors(state.form,id)));return;}if(!window.confirm('هل راجعت بيانات القضية والضبط الأصلي قبل الاعتماد؟'))return;if(DEMO){c.status='approved';c.approved_by=actorId();c.updated_at=new Date().toISOString();state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==c.session_date);demoEvent(`${state.profile.display_name} اعتمد القضية ${c.case_number}`);closeModal();return;}const {error}=await state.client.from('cases').update({status:'approved',approved_by:state.user.id,updated_by:state.user.id}).eq('id',id);if(error)return notify('فشل الاعتماد: '+error.message,'error');notify('تم اعتماد بيانات القضية','success');closeModal();await loadAll();}
async function softDeleteCase(){const id=state.editorId;if(id==='new')return;if(!window.confirm('هل تريد إزالة هذه القضية من الجدول؟ ستبقى نسخة في سجل المراجعات.'))return;if(DEMO){const c=state.cases.find(x=>x.id===id);state.cases=state.cases.filter(x=>x.id!==id);state.reportApprovals=state.reportApprovals.filter(r=>r.session_date!==c?.session_date);demoEvent(`${state.profile.display_name} أزال القضية ${c?.case_number||''}`);notify('أُزيلت القضية من المعاينة.','success');closeModal();return;}const {error}=await state.client.from('cases').update({deleted_at:new Date().toISOString(),updated_by:state.user.id}).eq('id',id);if(error)return notify(error.message,'error');notify('أُزيلت القضية من العرض.','success');closeModal();await loadAll();}
async function loadProfile(){const {data,error}=await state.client.from('profiles').select('*').eq('id',state.user.id).maybeSingle();if(error)throw error;state.profile=data||null;}
let lastDataSnapshot = '';
let loadSequence = 0;
async function loadAll({background=false}={}){if(DEMO){render();return;}if(!state.profile?.is_active)return;
 const userId=state.user.id;
 const sequence=++loadSequence;
 const [cases,notifications,profiles,tasks,reports]=await Promise.all([
  state.client.from('cases').select('*').is('deleted_at',null).order('session_date',{ascending:true}),
  state.client.from('notifications').select('*').eq('recipient_id',state.user.id).order('created_at',{ascending:false}).limit(90),
  state.client.from('profiles').select('id,display_name,role').eq('is_active',true),
  state.client.from('tasks').select('*').is('deleted_at',null).order('created_at',{ascending:false}),
  state.client.from('report_approvals').select('*')]);
 if(state.user?.id!==userId||sequence!==loadSequence)return;
 const snapshot=JSON.stringify([cases.data,notifications.data,profiles.data,tasks.data,reports.data]);
 const changed=snapshot!==lastDataSnapshot;
 lastDataSnapshot=snapshot;
 if(background&&!changed)return;
 if(cases.error)notify('تعذّر تحديث القضايا: '+cases.error.message,'error');else state.cases=cases.data||[];
 if(tasks.error)notify('تعذّر تحديث المهام: '+tasks.error.message,'error');else state.tasks=tasks.data||[];
 if(reports.error)console.warn('Report approvals:',reports.error);else state.reportApprovals=reports.data||[];
 if(notifications.error)console.warn('Notifications:',notifications.error);else {
  const oldIds=new Set(state.notifications.map(n=>n.id)),next=notifications.data||[];
  if(!state.initialNotifLoad){for(const x of next){if(!oldIds.has(x.id)&&!x.read_at&&'Notification' in window && Notification.permission==='granted'&&document.visibilityState==='hidden'){try{new Notification('تنظيم أعمال الدائرة الرابعة',{body:x.message,icon:'assets/favicon.svg'});}catch{}}}}
  state.notifications=next;state.initialNotifLoad=false;
 }
 if(!profiles.error)state.profiles=profiles.data||[];if(!background||(!state.form&&!bulkEntry))render();}
async function refreshProfile(){try{await loadProfile();render();if(state.profile?.is_active){await loadAll();subscribeChanges();}}catch(e){notify(e.message,'error');}}
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
try{const mod=await import('https://esm.sh/@supabase/supabase-js@2.119.0?bundle');state.client=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});const {data:{session},error}=await state.client.auth.getSession();if(error)throw error;state.user=session?.user||null;if(state.user){await loadProfile();if(state.profile?.is_active){await loadAll();subscribeChanges();}}state.client.auth.onAuthStateChange((_ev,session)=>{const old=state.user?.id;state.user=session?.user||null;if(state.user?.id!==old){resetCaseEntry();if(state.sub){state.client.removeChannel(state.sub);state.sub=null;}state.profile=null;state.notifications=[];lastDataSnapshot='';state.initialNotifLoad=true;render();if(state.user){setTimeout(async()=>{await refreshProfile();if(state.profile?.is_active)subscribeChanges();},10);}}});render();}catch(e){app.innerHTML=`<div class="empty" style="min-height:90vh"><b>تعذّر تشغيل الموقع</b><p>${esc(e.message)}. تحقق من بيانات الاتصال بالقاعدة والاتصال بالإنترنت.</p></div>`;}}
let backgroundRefreshRunning=false;
async function refreshInBackground(){
 if(backgroundRefreshRunning||!state.profile?.is_active)return;
 backgroundRefreshRunning=true;
 try{await loadAll({background:true});}finally{backgroundRefreshRunning=false;}
}
if(!DEMO){
 window.setInterval(refreshInBackground,4000);
 document.addEventListener('visibilitychange',refreshInBackground);
}
function subscribeChanges(){if(state.sub)return;state.sub=state.client.channel('case-team-sync').on('postgres_changes',{event:'*',schema:'public',table:'cases'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'tasks'},refreshInBackground).on('postgres_changes',{event:'*',schema:'public',table:'report_approvals'},refreshInBackground).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`recipient_id=eq.${state.user.id}`},refreshInBackground).subscribe(status=>{if(status==='SUBSCRIBED')refreshInBackground();});}
function authBusy(b){state.authBusy=b;const btn=$('#auth-form button[type=submit]');if(btn)btn.disabled=b;}
async function joinDevice(choice){
  if(!state.client||!choice||state.authBusy)return;
  state.authBusy=true;
  try{
    const {data:existing,error:sessionError}=await state.client.auth.getSession();
    if(sessionError)throw sessionError;
    if(existing?.session?.user){
      state.user=existing.session.user;
      await loadProfile();
      if(state.profile?.is_active){
        if(state.profile.display_name!==choice.display_name){
          notify('هذا الجهاز معتمد باسم '+state.profile.display_name+'، ولا يمكن تبديل هويته باختيار اسم آخر.','error');
        }else{await loadAll();subscribeChanges();}
        render();return;
      }
      render();return;
    }
    // هوية الجهاز المؤقتة لا تمنح صلاحيات حتى يعتمدها المسؤول في قاعدة البيانات.
    const {data,error}=await state.client.auth.signInAnonymously({options:{data:{display_name:choice.display_name}}});
    if(error)throw error;
    state.user=data.user;
    await loadProfile();
    render();
  }catch(e){notify('تعذّر تجهيز الدخول: '+e.message,'error');render();}
  finally{state.authBusy=false;}
}
async function markRead(){if(DEMO){state.notifications.forEach(x=>x.read_at=new Date().toISOString());persistDemo();render();return;}const {error}=await state.client.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',state.user.id).is('read_at',null);if(error)notify(error.message,'error');await loadAll();}
async function enableNotifications(){if(!('Notification' in window))return notify('المتصفح لا يدعم إشعارات الويب بالطريقة الحالية.','error');try{const permission=await Notification.requestPermission();notify(permission==='granted'?'تم السماح بالتنبيهات أثناء عمل الصفحة.':'لم يُسمح بتنبيهات المتصفح.');}catch(e){notify(e.message,'error');}}
function roundRect(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function drawWrapped(ctx,text,x,y,maxWidth,lineH,{size=23,color='#272321',weight='400',max=100}={}){ctx.font=`${weight} ${size}px "Thmanyah Sans", Tahoma, Arial, sans-serif`;ctx.fillStyle=color;ctx.textAlign='right';ctx.direction='rtl';let parts=String(text||'—').split('\n'),lines=[];for(const part of parts){let line='';for(const word of part.split(/\s+/)){let test=(line?line+' ':'')+word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}lines.push(line||' ');}let visible=lines.slice(0,max);if(lines.length>max)visible[visible.length-1]+='…';for(let i=0;i<visible.length;i++)ctx.fillText(visible[i],x,y+i*lineH);return y+visible.length*lineH;}
function buildPosterCanvas(cases){const scale=1;const canvas=document.createElement('canvas');const w=1200,pad=73,content=w-pad*2;let y=0;const sizes=[];const meas=canvas.getContext('2d');function height(text,maxwidth,size=22,lh=38,max=100){meas.font=`400 ${size}px "Thmanyah Sans", Tahoma, Arial, sans-serif`;let lines=0;for(let p of String(text||'—').split('\n')){let line='';for(const word of p.split(/\s+/)){const test=(line?line+' ':'')+word;if(meas.measureText(test).width>maxwidth&&line){lines++;line=word;}else line=test;}lines++;}return Math.min(lines,max)*lh;}
for(const c of cases){let part=190;const m=minutesExtract(c);part+=height('موضوع الدعوى: '+short(c.claim_summary,400),content-88,23,38,5);part+=height('مقتطف من الضبط: '+m.overview,content-88,23,38,7);if(m.evidence)part+=height('عبارة الرفع: '+m.evidence,content-88,23,38,6);sizes.push(Math.max(300,part+20));}
const totalHeight=Math.min(30000,400+sizes.reduce((a,b)=>a+b+26,0)+110);canvas.width=w*scale;canvas.height=totalHeight*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#f2f7f6';ctx.fillRect(0,0,w,totalHeight);roundRect(ctx,0,0,w,21,0,'#087967');ctx.fillStyle='#087967';ctx.textAlign='right';ctx.direction='rtl';ctx.font='bold 49px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('تنظيم أعمال الدائرة الرابعة',w-pad,103);ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillStyle='#77695e';ctx.fillText('تقرير قضايا الجلسات اليومي',w-pad,153);ctx.textAlign='left';ctx.fillStyle='#087967';ctx.font='bold 66px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText('▦',pad,120);ctx.fillStyle='#d9cabb';ctx.fillRect(pad,182,content,2);roundRect(ctx,pad,213,content,90,16,'#087967');ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 30px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(hijri(state.filterDate),w-pad-25,268);ctx.textAlign='left';ctx.font='25px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(cases.length+' قضايا',pad+25,268);y=337;
for(let i=0;i<cases.length;i++){let c=cases[i],heightBox=sizes[i];if(y+heightBox>totalHeight-70)break;roundRect(ctx,pad,y,content,heightBox,17,'#ffffff');ctx.strokeStyle='#e3d9ce';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(pad,y,content,heightBox,17);ctx.stroke();ctx.textAlign='right';ctx.direction='rtl';ctx.fillStyle='#087967';ctx.font='bold 29px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`${i+1}. ${short(c.case_type||'قضية',44)} — ${tm(c.session_time)}`,w-pad-28,y+48);ctx.fillStyle='#746d66';ctx.font='20px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText(`رقم ${c.case_number}  •  ${stageTitle(c.stage)}  •  ${statusTitle(c.status)}`,w-pad-30,y+90);const parties=short(`${c.plaintiffs||'—'}   ×   ${c.defendants||'—'}`,82);ctx.fillText(parties,w-pad-30,y+124);ctx.fillStyle='#e9e1d7';ctx.fillRect(pad+25,y+145,content-50,1);let yy=y+187;const m=minutesExtract(c);const lines=[['الموضوع',short(c.claim_summary||'غير مدخل',400),5],['مقتطف من الضبط',m.overview,7],...(m.evidence?[['عبارة الرفع',m.evidence,6]]:[])];for(const [name,value,max] of lines){yy=drawWrapped(ctx,`${name}: ${value}`,w-pad-30,yy,content-60,38,{size:23,max})+10;}y+=heightBox+26;}
ctx.fillStyle='#81766e';ctx.textAlign='center';ctx.font='21px "Thmanyah Sans", Tahoma, Arial, sans-serif';ctx.fillText((isReportApproved()?'تقرير معتمد • ':'تقرير غير معتمد • ')+'أعده: '+short(state.profile?.display_name||'',24)+' • مستخرج نصي أولي من الضبط',w/2,Math.min(y+29,totalHeight-45));return canvas;}
async function sharePng(){const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');if(!cases.length)return;try{const canvas=buildPosterCanvas(cases);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('تعذّر إنشاء الصورة');const file=new File([blob],`تقرير-القضايا-${state.filterDate}.png`,{type:'image/png'});if(navigator.share && navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'تقرير تنظيم أعمال الدائرة الرابعة'});}else{notify('المشاركة المباشرة غير متاحة في هذا المتصفح؛ استخدم حفظ الصورة ثم أرسلها.');exportPng();}}catch(e){if(e.name!=='AbortError')notify('تعذرت مشاركة الصورة: '+e.message,'error');}}
function exportPng(){const cases=listForDate().filter(x=>!state.posterApprovedOnly||x.status==='approved');if(!cases.length)return notify('لا توجد قضايا لتصديرها.','error');try{const canvas=buildPosterCanvas(cases);canvas.toBlob(blob=>{if(!blob)return notify('لم يتمكن المتصفح من إنشاء الصورة.','error');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`تقرير-القضايا-${state.filterDate}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);notify('تم تجهيز صورة التقرير للحفظ.','success');},'image/png');}catch(e){notify('تعذر حفظ الصورة: '+e.message,'error');}}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-nav],[data-action],[data-edit],[data-detail],[data-approve],[data-save],[data-stage],[data-person],[data-task-toggle],[data-task-edit],[data-task-filter],[data-day-tab]');if(!target)return;if(target.dataset.dayTab){if(dayWithinWindow(target.dataset.dayTab)){state.filterDate=target.dataset.dayTab;render();}return;}if(target.dataset.person){const choice=STAFF.find(x=>x.id===target.dataset.person);if(DEMO){state.profile=choice;localStorage.setItem('fourth-circuit-demo-profile',choice.id);notify(`مرحبًا ${choice.display_name}`,'success');render();}else{await joinDevice(choice);}return;}if(target.dataset.taskToggle){await toggleTask(target.dataset.taskToggle);return;}if(target.dataset.taskEdit){openTaskEditor(target.dataset.taskEdit);return;}if(target.dataset.taskFilter){state.taskFilter=target.dataset.taskFilter;render();return;}if(target.dataset.nav){navigate(target.dataset.nav);return;}if(target.dataset.edit){openEditor(target.dataset.edit);return;}if(target.dataset.detail){state.detailId=target.dataset.detail;state.showSource=false;render();return;}if(target.dataset.approve){await approveCase(target.dataset.approve);return;}if(target.dataset.save){await saveCase(target.dataset.save);return;}if(target.dataset.stage){state.stageFilter=target.dataset.stage;render();return;}const action=target.dataset.action;if(!action)return;switch(action){case 'new-case':openEditor();break;case 'new-bulk':openBulkEntry();break;case 'close-bulk':case 'discard-bulk':case 'add-bulk-row':case 'bulk-details':case 'remove-bulk-row':bulkAction(action,target);break;case 'discard-case-draft':discardSingleDraft();break;case 'new-task':openTaskEditor();break;case 'close-task-editor':closeTaskEditor();break;case 'delete-task':await deleteTask();break;case 'approve-report':await approveReport();break;case 'export-tasks':exportTasksPng();break;case 'close-editor':case 'close-detail':if(!caseSaving)closeModal();break;case 'toggle-source':state.showSource=!state.showSource;render();break;case 'next-day':state.filterDate=nextWorkday();render();break;case 'approve-from-editor':await saveCase('approved');break;case 'delete-case':await softDeleteCase();break;case 'toggle-notifs':state.showNotifs=!state.showNotifs;render();break;case 'mark-read':await markRead();break;case 'enable-notifs':await enableNotifications();break;case 'refresh':await loadAll();notify('تم تحديث البيانات من القاعدة.','success');break;case 'refresh-profile':await refreshProfile();break;case 'logout':if(DEMO){resetCaseEntry();state.profile=null;localStorage.removeItem('fourth-circuit-demo-profile');render();}else await state.client?.auth.signOut();break;case 'toggle-auth':state.authMode=state.authMode==='login'?'signup':'login';render();break;case 'export-png':exportPng();break;case 'share-png':await sharePng();break;}});
document.addEventListener('input',e=>{if(e.target.dataset.formField&&e.target.dataset.formField!=='stage'){const row=bulkRowFor(e.target);if(row||state.form){(row||state.form)[e.target.dataset.formField]=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');}}if(e.target.dataset.taskField&&state.taskForm){state.taskForm[e.target.dataset.taskField]=e.target.value;}if(e.target.matches('[data-task-search]')){state.taskSearch=e.target.value;const list=$('.tasks-list');if(list){const temp=state.taskSearch;state.taskSearch=temp;list.innerHTML=state.tasks.filter(t=>!t.deleted_at&&(state.taskFilter==='all'||t.status===state.taskFilter)&&[t.title,t.details,t.case_number,profileName(t.created_by)].join(' ').includes(temp)).map(taskRow).join('')||'<div class="card empty">لا توجد نتائج</div>';}}if(e.target.matches('[data-search]')){state.search=e.target.value;const list=$('.cases-list');if(list)list.innerHTML=filteredCases().length?filteredCases().map(caseRow).join(''):emptyState();}});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-form-field="stage"]')&&(state.form||bulkEntry)){changeCaseStage(e.target);return;}
 if(e.target.id==='bulk-default-date'&&bulkEntry){bulkEntry.date=e.target.value;rememberCaseEntry();markCaseError(e.target.closest('[data-case-control]'),'');return;}
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
document.addEventListener('focusout',e=>{if(e.target.matches('[data-bulk-row] [data-form-field="session_time"]'))setTimeout(reorderBulkRows,0);});
document.addEventListener('submit',e=>{if(e.target.id==='bulk-case-form'){e.preventDefault();void saveBulkEntry();}if(e.target.id==='case-form'){e.preventDefault();saveCase('ready');}if(e.target.id==='task-form'){e.preventDefault();saveTask();}});
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
 hearingsMount=import('./assets/hearings/main.js?v=5.0.8').then(module=>{
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
if(location.hash==='#hearings')state.screen='hearings';
init();
window.setInterval(updateClock,1000);
