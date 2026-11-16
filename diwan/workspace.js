import {diwanViews} from './views.js?v=1';

export function mountDiwanWorkspace(root, request, signal) {
  let records=[],draft=[];
  const WORD_LIBRARY_URLS={
    mammoth:new URL('./vendor/mammoth.js',import.meta.url).href,
    docx:new URL('./vendor/docx.js',import.meta.url).href
  };
  const wordLibraryPromises=new Map();
  function loadWordLibrary(globalName){
    if(window[globalName])return Promise.resolve(window[globalName]);
    if(wordLibraryPromises.has(globalName))return wordLibraryPromises.get(globalName);
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=WORD_LIBRARY_URLS[globalName];
      script.async=true;
      script.onload=()=>window[globalName]
        ?resolve(window[globalName])
        :reject(new Error('تم تحميل الملف لكن المكتبة لم تبدأ بصورة صحيحة'));
      script.onerror=()=>reject(new Error('تعذّر تنزيل مكتبة Word'));
      document.head.appendChild(script);
    }).catch(err=>{
      wordLibraryPromises.delete(globalName); // يسمح بمحاولة جديدة بعد عودة الاتصال
      throw err;
    });
    wordLibraryPromises.set(globalName,promise);
    return promise;
  }
  /* =====================================================================
     محرك تصنيف بالنقاط (Scoring) بدل أول تطابق (rules.find)
     كل تصنيف فرعي (CATS) له:
       tier    : 0 مخصّص من المستخدم (أعلى أولوية) | 1 موضوع أساسي | 2 دفع إجرائي | 3 يمين/بينة فقط (أدنى أولوية)
       strong  : أنماط قوية الدلالة (وزن 5 لكل تطابق)
       weak    : أنماط داعمة فقط (وزن 1 لكل تطابق)
       requires: إن وُجدت، يجب تحقق واحد منها على الأقل وإلا استُبعد التصنيف
       excludes: إن تحقق أي منها يُستبعد التصنيف فورًا
     يُختار التصنيف من أعلى طبقة (tier) لديها مرشح، ثم الأعلى نقاطًا داخلها.
     الهدف: لا يفوز اليمين/النكول بالتصنيف الرئيسي على حساب موضوع القضية،
     ولا تكفي كلمة عامة واحدة (عقار/خبير) لتصنيف خاطئ محدد.
     ===================================================================== */
  let CATS=[
  /* ===== المركبات والحوادث (tier 1) ===== */
  {main:'المركبات والحوادث',sub:'حادث مركبة دون تأمين',caseType:'حادث مركبة',tier:1,
    strong:[/(حادث|حوادث|تصادم|صدم|دهس|اصطدام|ارتطام|انقلاب).{0,20}(بدون|عدم وجود|ما فيه|لا يوجد|منتهي).{0,10}تامين/,/تامين.{0,10}منتهي/]},
  {main:'المركبات والحوادث',sub:'تعويض عن حادث مروري',caseType:'حادث مروري',tier:1,
    strong:[/تعويض.{0,15}حادث/,/حادث.{0,15}تعويض/,/تعويض.{0,15}اضرار.{0,15}(مركبه|سياره)/]},
  {main:'المركبات والحوادث',sub:'أرش إصابة في حادث مروري',caseType:'حادث مروري',tier:1,
    requires:[/ارش/], strong:[/ارش.{0,10}اصابه/,/ارش/]},
  {main:'المركبات والحوادث',sub:'اعتراض على نسبة الخطأ في حادث مروري',caseType:'حادث مروري',tier:1,
    strong:[/اعتراض.{0,15}نسبه.{0,15}الخطا/,/نسبه.{0,10}الخطا/]},
  {main:'المركبات والحوادث',sub:'تلفيات مركبة',caseType:'حادث مركبة',tier:1,
    strong:[/تلفيات.{0,10}(مركبه|سياره)/,/تلفيات/]},
  {main:'المركبات والحوادث',sub:'أجرة زائدة لمركبة',caseType:'مركبات',tier:1,
    strong:[/اجره.{0,10}زايده.{0,15}(مركبه|مركبات|سياره|سيارات)/,/زياده.{0,10}اجره.{0,15}(مركبه|مركبات|سياره|سيارات)/,/(مركبه|مركبات|سياره|سيارات).{0,15}اجره.{0,10}زايده/]},
  {main:'المركبات والحوادث',sub:'أجرة المثل للمركبة',caseType:'مركبات',tier:1,
    strong:[/اجره.{0,10}المثل.{0,15}(مركبه|مركبات|سياره|سيارات)/,/اجره المثل/]},
  {main:'المركبات والحوادث',sub:'أجرة مركبة',caseType:'مركبات',tier:1,
    strong:[/(اجره|أجرة|ايجار).{0,10}(مركبه|مركبات|سياره|سيارات)/,/(مركبه|مركبات|سياره|سيارات).{0,10}(اجره|أجرة|ايجار)/]},
  {main:'المركبات والحوادث',sub:'نقل مخالفات المركبة',caseType:'مركبات',tier:1,
    strong:[/نقل.{0,10}مخالفات/,/مخالفات.{0,10}نقل/]},
  {main:'المركبات والحوادث',sub:'مطالبة بقيمة إصلاح مركبة',caseType:'حادث مركبة',tier:1,
    strong:[/اصلاح.{0,15}(مركبه|سياره)/,/(مركبه|سياره).{0,15}اصلاح/]},
  {main:'المركبات والحوادث',sub:'عدم صفة قائد المركبة',caseType:'حادث مركبة',tier:1,
    strong:[/(قايد|قايده).{0,25}(مو مالك|ليس مالك|ليست مالك|غير مالك|غير المالك|بدون تفويض|ما معه تفويض|غير مفوض|غير المفوض|لا يملك تفويض|بدون رخصه)/]},
  {main:'المركبات والحوادث',sub:'رد مركبة / استرداد عين مركبة',caseType:'مركبات',tier:1,
    strong:[/استرداد.{0,10}(مركبه|سياره)/,/استرداد عين.{0,15}(مركبه|سياره)/,/رد.{0,10}(مركبه|سياره)/]},
  {main:'المركبات والحوادث',sub:'حادث مروري غير محدد',caseType:'حادث مروري',tier:1,
    strong:[/حادث|حوادث|تصادم|اصطدام|صدم|دهس|دعس|انقلاب|ارتطام|صدمه/]},

  /* ===== أجرة نقل (خدمات) — تُفحص مبكرًا حتى لا تُبتلع بتصنيف الإيجار العام ===== */
  {main:'الشركات والخدمات',sub:'أجرة نقل',caseType:'خدمات',tier:1,
    strong:[/اجره.{0,10}نقل/,/نقل.{0,10}اجره/]},

  /* ===== المرافق: الكهرباء والاتصالات (tier 1، قصيرة عمدًا) ===== */
  {main:'الكهرباء',sub:'مطالبة بفواتير كهرباء غير مسددة',caseType:'فواتير كهرباء',tier:1,
    strong:[/كهرباء/]},
  {main:'الاتصالات',sub:'مطالبة بفواتير اتصالات غير مسددة',caseType:'فواتير اتصالات',tier:1,
    strong:[/اتصالات|stc|موبايلي|زين/i]},

  /* ===== العقارات (tier 1) ===== */
  {main:'العقارات والملكية',sub:'رد ثمن العقار لعدم وجود صك ملكية',caseType:'عقار',tier:1,
    strong:[/(ارض|عقار).{0,20}(ما لها صك|بدون صك).{0,20}(رد|استرجاع|رجع)/,/رد.{0,15}(ثمن|الفلوس|المبلغ).{0,15}(صك|عقار|ارض)/,/عدم وجود صك.{0,20}رد.{0,10}ثمن/]},
  {main:'العقارات والملكية',sub:'فسخ عقد بيع عقار ورد الثمن',caseType:'عقار',tier:1,
    strong:[/فسخ.{0,15}بيع.{0,15}عقار/,/فسخ.{0,15}عقار.{0,15}(رد|ثمن)/]},
  {main:'العقارات والملكية',sub:'فسخ عقد متعلق بعقار غير مملوك للمدعى عليه',caseType:'عقار',tier:1,
    strong:[/فسخ.{0,20}عقار.{0,20}غير مملوك/]},
  {main:'العقارات والملكية',sub:'نقل ملكية عقار',caseType:'عقار',tier:1,
    strong:[/نقل.{0,10}ملكيه.{0,10}عقار/,/نقل ملكيه/]},
  {main:'العقارات والملكية',sub:'إخلاء عقار',caseType:'عقار',tier:1,
    strong:[/اخلاء.{0,10}عقار/]},
  {main:'العقارات والملكية',sub:'إلزام بإفراغ جزء من عقار',caseType:'عقار',tier:1,
    strong:[/افراغ.{0,15}عقار/,/الزام.{0,10}افراغ/]},
  {main:'العقارات والملكية',sub:'رفع يد عن عقار متداخل',caseType:'عقار',tier:1,
    strong:[/رفع.{0,10}يد.{0,15}عقار/,/رفع اليد/]},
  {main:'العقارات والملكية',sub:'إصلاح عقار مستأجر من قبل المؤجر',caseType:'عقار',tier:1,
    strong:[/اصلاح.{0,10}(عقار|ماجور).{0,15}مءجر/,/اصلاح.{0,10}الماجور/]},
  {main:'العقارات والملكية',sub:'مطالبة بنسبة من أرباح عقار',caseType:'عقار',tier:1,
    strong:[/نسبه.{0,10}ارباح.{0,10}عقار/,/ارباح.{0,10}عقار/]},
  {main:'العقارات والملكية',sub:'نزاع على صك ملكية',caseType:'عقار',tier:1,
    strong:[/نزاع.{0,15}صك/,/صك.{0,15}نزاع/]},
  {main:'العقارات والملكية',sub:'عدم وجود صك',caseType:'عقار',tier:1,
    strong:[/(بدون|ما لها|لا يوجد|عدم وجود).{0,10}صك/]},
  {main:'العقارات والملكية',sub:'إثبات ملكية عقار',caseType:'عقار',tier:1,
    requires:[/اثبات.{0,15}(ملكيه|ملك)/,/ملكيه.{0,15}عقار/,/اثبات.{0,10}الملكيه/],
    strong:[/اثبات.{0,15}(ملكيه|ملك)/,/ملكيه.{0,15}عقار/,/اثبات.{0,10}الملكيه/]},

  /* ===== الإيجار (tier 1) ===== */
  {main:'الإيجار',sub:'مطالبة بأجرة متبقية من عقد إيجار',caseType:'إيجار',tier:1,
    strong:[/اجره.{0,10}متبقيه/,/متبقي.{0,10}اجره/]},
  {main:'الإيجار',sub:'أجرة زائدة عن عقد إيجار',caseType:'إيجار',tier:1,
    strong:[/اجره.{0,10}زايده/,/زياده.{0,10}اجره/]},
  {main:'الإيجار',sub:'فسخ وإخلاء',caseType:'إيجار',tier:1,
    strong:[/فسخ.{0,15}اخلاء/,/اخلاء.{0,15}فسخ/]},
  {main:'الإيجار',sub:'فسخ عقد إيجار',caseType:'إيجار',tier:1,
    strong:[/فسخ.{0,10}ايجار/]},
  {main:'الإيجار',sub:'إخلاء مأجور',caseType:'إيجار',tier:1,
    strong:[/اخلاء/]},
  {main:'الإيجار',sub:'عدم سداد الأجرة',caseType:'إيجار',tier:1,
    strong:[/عدم سداد.{0,10}اجره/,/اجره.{0,15}(ما سدد|لم يسدد|متاخره)/]},
  {main:'الإيجار',sub:'أجرة عقار',caseType:'إيجار',tier:1,
    strong:[/اجره.{0,10}عقار/]},
  {main:'الإيجار',sub:'مطالبة بأجرة',caseType:'إيجار',tier:1,
    strong:[/عقد ايجار|اجره|ايجار/]},

  /* ===== القروض والديون (tier 1) ===== */
  {main:'القروض والديون',sub:'قرض مع إنكار الاستلام',caseType:'قرض',tier:1,
    strong:[/قرض.{0,15}انكار.{0,15}استلام/,/قرض.{0,10}(ما|لم).{0,10}استلم/]},
  {main:'القروض والديون',sub:'إقرار بالقرض',caseType:'قرض',tier:1,
    strong:[/قرض.{0,25}اقرار/,/اقرار.{0,25}قرض/]},
  {main:'القروض والديون',sub:'إقرار بمديونية',caseType:'قرض',tier:1,
    strong:[/اقرار.{0,25}مديونيه/,/اقرار.{0,15}(?<!م)دين/]},
  {main:'القروض والديون',sub:'مطالبة برد قرض',caseType:'قرض',tier:1,
    strong:[/رد.{0,10}قرض/,/قرض.{0,10}رد/]},
  {main:'القروض والديون',sub:'منازعة في سبب المديونية',caseType:'قرض',tier:1,
    strong:[/منازعه.{0,15}سبب.{0,15}مديونيه/,/منازعه.{0,10}مديونيه/,/منازعه.{0,10}سبب.{0,10}الدين/]},
  {main:'القروض والديون',sub:'إثبات قرض',caseType:'قرض',tier:1,
    strong:[/اثبات.{0,10}قرض/]},
  {main:'القروض والديون',sub:'سلفة',caseType:'قرض',tier:1,
    strong:[/سلفه/]},
  {main:'القروض والديون',sub:'سند لأمر',caseType:'قرض',tier:1,
    strong:[/سند.{0,5}لامر/]},
  {main:'القروض والديون',sub:'مطالبة بسداد قرض',caseType:'قرض',tier:1,
    strong:[/قرض/]},
  {main:'القروض والديون',sub:'مطالبة بدين',caseType:'دين',tier:1,
    strong:[/(?<!م)دين(?!ونيه)/]},

  /* ===== الكفالة والضمان (tier 1) ===== */
  {main:'الكفالة والضمان',sub:'الحكم على الكفيل الغارم',caseType:'كفالة',tier:1,
    strong:[/كفيل.{0,5}غارم/]},
  {main:'الكفالة والضمان',sub:'رجوع الكفيل على المدين',caseType:'كفالة',tier:1,
    strong:[/رجوع.{0,10}كفيل/]},
  {main:'الكفالة والضمان',sub:'إنكار الكفالة',caseType:'كفالة',tier:1,
    strong:[/انكار.{0,10}كفاله/,/انكار.{0,10}كفيل/]},
  {main:'الكفالة والضمان',sub:'مطالبة كفيل',caseType:'كفالة',tier:1,
    strong:[/كفيل|كفاله/]},
  {main:'الكفالة والضمان',sub:'ضمان مالي',caseType:'كفالة',tier:1,
    strong:[/ضمان/]},

  /* ===== الصلح والتنازل (tier 1) ===== */
  {main:'الصلح والتنازل',sub:'تنفيذ اتفاق صلح',caseType:'صلح',tier:1,
    strong:[/تنفيذ.{0,10}صلح/,/اتفاق.{0,10}صلح/]},
  {main:'الصلح والتنازل',sub:'إثبات صلح',caseType:'صلح',tier:1,
    strong:[/صلح/]},
  {main:'الصلح والتنازل',sub:'إثبات تنازل',caseType:'تنازل',tier:1,
    strong:[/اثبات.{0,10}تنازل/]},
  {main:'الصلح والتنازل',sub:'تنازل عن الدعوى',caseType:'تنازل',tier:1,
    strong:[/تنازل.{0,15}دعو/]},
  {main:'الصلح والتنازل',sub:'تنازل عن مطالبة',caseType:'تنازل',tier:1,
    strong:[/تنازل/]},
  {main:'الصلح والتنازل',sub:'مخالصة',caseType:'تنازل',tier:1,
    strong:[/مخالصه/]},

  /* ===== أتعاب المحاماة والخبرة (tier 1) — إصلاح: تتطلب تركيبة وليس كلمة مفردة ===== */
  {main:'أتعاب المحاماة والخبرة',sub:'رفض أتعاب محاماة',caseType:'أتعاب',tier:1,
    requires:[/رفض.{0,15}اتعاب.{0,15}محام/], strong:[/رفض.{0,15}اتعاب.{0,15}محام/]},
  {main:'أتعاب المحاماة والخبرة',sub:'نزاع في مقدار الأتعاب',caseType:'أتعاب',tier:1,
    requires:[/نزاع.{0,10}اتعاب/,/مقدار.{0,10}اتعاب/], strong:[/نزاع.{0,10}اتعاب/,/مقدار.{0,10}اتعاب/]},
  {main:'أتعاب المحاماة والخبرة',sub:'أتعاب خبير',caseType:'أتعاب',tier:1,
    requires:[/اتعاب.{0,15}خبير/,/خبير.{0,15}اتعاب/],
    strong:[/اتعاب.{0,15}خبير/,/خبير.{0,15}اتعاب/]},
  {main:'أتعاب المحاماة والخبرة',sub:'مطالبة بأتعاب محاماة',caseType:'أتعاب',tier:1,
    requires:[/اتعاب.{0,15}محام/,/محاماه/], strong:[/اتعاب.{0,15}محام/,/محاماه/]},

  /* ===== البيع والمبيع (tier 1) ===== */
  {main:'البيع والمبيع',sub:'عيب مبيع',caseType:'بيع',tier:1,
    strong:[/عيب.{0,10}(مبيع|بيع)/,/(مبيع|بيع).{0,10}عيب/,/اشتريت.{0,10}عيب/]},
  {main:'البيع والمبيع',sub:'مطالبة بثمن مبيع',caseType:'بيع',tier:1,
    strong:[/ثمن.{0,10}(مبيع|بيع)/,/(مبيع|بيع).{0,10}ثمن/,/باقي.{0,10}ثمن/,/عدم سداد.{0,10}ثمن/,/لم يسدد.{0,10}ثمن/,/ما سدد.{0,10}ثمن/,/اشتري.{0,25}(لم|ما).{0,10}(يسدد|سدد)/]},
  {main:'البيع والمبيع',sub:'تسليم المبيع',caseType:'بيع',tier:1,
    strong:[/تسليم.{0,10}مبيع/]},
  {main:'البيع والمبيع',sub:'فسخ عقد بيع',caseType:'بيع',tier:1,
    strong:[/فسخ.{0,10}بيع/]},

  /* ===== الشركات والخدمات (tier 1) ===== */
  {main:'الشركات والخدمات',sub:'محاسبة بين الشركاء',caseType:'شركات',tier:1,
    strong:[/محاسبه.{0,10}شركاء/,/تصفيه.{0,10}شركه/]},
  {main:'الشركات والخدمات',sub:'مستحقات شريك',caseType:'شركات',tier:1,
    strong:[/شريك/]},
  {main:'الشركات والخدمات',sub:'مطالبة بموجب فواتير',caseType:'خدمات',tier:1,
    strong:[/فواتير|فاتوره/]},
  {main:'الشركات والخدمات',sub:'عقد خدمات',caseType:'خدمات',tier:1,
    strong:[/خدمه|خدمات/]},

  /* ===== العقود (tier 1، عام — يُفحص أخيرًا لأن كلمة "عقد" شائعة في تصنيفات أخرى) ===== */
  {main:'العقود والالتزامات',sub:'عدم إتمام العقد',caseType:'عقد',tier:1,
    strong:[/عدم.{0,10}اتمام.{0,10}عقد/,/ما تم العقد/,/لم يتم العقد/]},
  {main:'العقود والالتزامات',sub:'عدم تنفيذ العقد',caseType:'عقد',tier:1,
    strong:[/عدم تنفيذ العقد/,/ما نفذ العقد/]},
  {main:'العقود والالتزامات',sub:'فسخ العقد',caseType:'عقد',tier:1,
    strong:[/فسخ.{0,10}عقد/]},
  {main:'العقود والالتزامات',sub:'تنفيذ الالتزام',caseType:'عقد',tier:1,
    strong:[/تنفيذ.{0,10}التزام/,/الزام.{0,10}تنفيذ/]},
  {main:'العقود والالتزامات',sub:'التعويض عن الإخلال بالعقد',caseType:'عقد',tier:1,
    strong:[/تعويض.{0,10}اخلال/,/اخلال.{0,10}عقد/]},
  {main:'العقود والالتزامات',sub:'مطالبة مالية ناشئة عن عقد',caseType:'عقد',tier:1,
    strong:[/عقد/]},

  /* ===== المنقولات والودائع (tier 1) ===== */
  {main:'المنقولات والودائع',sub:'استرداد وديعة',caseType:'منقولات',tier:1,
    strong:[/استرداد.{0,30}(منقول|ذهب).{0,20}(وديعه|مودع)/,/(وديعه|مودع).{0,20}استرداد/,/استرداد.{0,15}(وديعه|مودع)/]},
  {main:'المنقولات والودائع',sub:'استرداد منقول',caseType:'منقولات',tier:1,
    strong:[/استرداد.{0,10}منقول/,/استرداد.{0,15}ذهب/,/ذهب/]},
  {main:'المنقولات والودائع',sub:'استرداد عين',caseType:'منقولات',tier:1,
    strong:[/استرداد عين/]},

  /* ===== الالتزامات المالية العامة (tier 1) ===== */
  {main:'الالتزامات المالية',sub:'استرداد مبلغ',caseType:'التزامات مالية',tier:1,
    strong:[/استرداد.{0,10}مبلغ/,/رد.{0,10}مبلغ/]},
  {main:'الالتزامات المالية',sub:'رد طلب التعويض المعنوي',caseType:'تعويض',tier:1,
    strong:[/تعويض.{0,10}معنوي/,/رد.{0,15}تعويض.{0,15}معنوي/]},
  {main:'الالتزامات المالية',sub:'مطالبة بتعويض',caseType:'تعويض',tier:1,
    weak:[/تعويض/]},

  /* ===== الدفوع الشكلية والإجرائية (tier 2 — بعد المواضيع الأساسية) ===== */
  {main:'الدفوع الشكلية والإجرائية',sub:'رد الدعوى لعدم سداد رسوم الخبير',caseType:'دفع إجرائي',tier:2,
    strong:[/(رد|رفض).{0,15}(سداد|دفع).{0,15}(رسوم|اتعاب).{0,15}خبير/,/رسوم.{0,10}الخبير/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'عدم اختصاص مكاني',caseType:'دفع إجرائي',tier:2,
    strong:[/اختصاص.{0,10}مكاني/,/مكاني.{0,10}اختصاص/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'سبق الفصل في الدعوى',caseType:'دفع إجرائي',tier:2,
    strong:[/سبق.{0,10}فصل/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'رفض التماس إعادة النظر',caseType:'دفع إجرائي',tier:2,
    strong:[/التماس.{0,10}اعاده.{0,10}نظر/,/اعاده النظر/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'صرف النظر عن دعوى مستعجلة',caseType:'دفع إجرائي',tier:2,
    strong:[/صرف.{0,10}النظر.{0,15}مستعجله/,/صرف النظر/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'عدم الاختصاص',caseType:'دفع إجرائي',tier:2,
    strong:[/عدم اختصاص|غير مختصه|اختصاص/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'عدم القبول',caseType:'دفع إجرائي',tier:2,
    strong:[/عدم.{0,10}قبول/]},
  {main:'الدفوع الشكلية والإجرائية',sub:'عدم الصفة',caseType:'دفع إجرائي',tier:2,
    strong:[/عدم.{0,10}صفه/,/الدفع.{0,10}صفه/]},

  /* ===== الأيمان والبينة (tier 3 — تفاصيل/بينة، لا تسرق التصنيف الرئيسي من الموضوع) ===== */
  {main:'الأيمان والبينة',sub:'نكول المدعى عليه بسبب غيابه',caseType:'يمين',tier:3,
    strong:[/(غياب|غايب|غاب).{0,20}نكول/,/نكول.{0,20}(غياب|غايب|غاب)/,/(غياب|غايب|غاب).{0,20}(ما ادي اليمين|لم يود اليمين)/]},
  {main:'الأيمان والبينة',sub:'نكول عن اليمين',caseType:'يمين',tier:3,
    strong:[/نكول|نكل/]},
  {main:'الأيمان والبينة',sub:'توجيه اليمين',caseType:'يمين',tier:3,
    strong:[/توجيه.{0,10}يمين/,/يمين حاسمه/,/يمين متممه/,/يمين/]},
  {main:'الأيمان والبينة',sub:'شهادة شاهد',caseType:'بينة',tier:3,
    strong:[/شاهد|شهاده/]},
  {main:'الأيمان والبينة',sub:'عدم تقديم بينة',caseType:'بينة',tier:3,
    strong:[/عدم.{0,10}(تقديم.{0,10})?بينه/,/عدم وجود بينه/]}
  ];

  /* دليل التصنيفات (نفس بنية الواجهة القديمة: كائن main → [subs]) يُبنى تلقائيًا من CATS
     حتى لا يظهر أي تصنيف بالواجهة إلا وله قاعدة تحليل فعلية. */
  function buildCatalog(cats){
    const map={};
    cats.forEach(c=>{ (map[c.main]=map[c.main]||[]); if(!map[c.main].includes(c.sub))map[c.main].push(c.sub); });
    map['غير مصنف بدقة']=['يحتاج مراجعة يدوية'];
    return map;
  }
  let catalog=buildCatalog(CATS);
  let customCategories=[]; // {id, main, sub, caseType, pattern, tags} — مخزّنة سحابيًا لكل مستخدم

  function caseTypeForSub(sub){const c=CATS.find(x=>x.sub===sub);return c?c.caseType:'';}
  function isCustomCategory(main,sub){return customCategories.some(c=>c.main===main&&c.sub===sub);}
  function addCustomCategoryRuntime(entry){
    if(!catalog[entry.main])catalog[entry.main]=[];
    if(!catalog[entry.main].includes(entry.sub))catalog[entry.main].push(entry.sub);
    if(NEW_TAXONOMY[entry.main]&&!NEW_TAXONOMY[entry.main].includes(entry.sub))NEW_TAXONOMY[entry.main].push(entry.sub);
    const parts=(entry.pattern||'').split(',').map(s=>norm(s.trim())).filter(Boolean).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const re=parts.length?new RegExp(parts.join('|')):/$^/;
    CATS.unshift({id:entry.id,main:entry.main,sub:entry.sub,caseType:entry.caseType||entry.main,tier:0,strong:[re]});
  }
  function removeCustomCategoryRuntime(id){
    const entry=customCategories.find(c=>c.id===id);
    if(!entry)return;
    CATS=CATS.filter(c=>!(c.id===id));
    if(catalog[entry.main])catalog[entry.main]=catalog[entry.main].filter(s=>s!==entry.sub);
    if(NEW_TAXONOMY[entry.main])NEW_TAXONOMY[entry.main]=NEW_TAXONOMY[entry.main].filter(s=>s!==entry.sub);
    customCategories=customCategories.filter(c=>c.id!==id);
  }

  /* ===== تصحيحات المستخدم اليدوية (classificationAliases) =====
     مطابقة نصية دقيقة فقط (exact match على النص المطبَّع) — لا تتحول لقاعدة عامة تؤثر على نصوص أخرى مشابهة.
     الهدف: إذا صحّح المستخدم تصنيف قضية معينة يدويًا، ونفس هذا النص بالحرف ورد لاحقًا (إعادة تحليل، أو قضية جديدة
     بنفس الوصف)، يستفيد من تصحيحه دون تعميمه ككلمة دالة جديدة. */
  let classificationAliases=[]; // {normalizedText, mainCategory, subCategory, caseType, savedAt}
  function findAlias(text){
    const n=norm(text||'');
    if(!n)return null;
    return classificationAliases.find(a=>a.normalizedText===n)||null;
  }
  function saveClassificationAlias(text,mainCategory,subCategory,caseType){
    const n=norm(text||'');
    if(!n)return;
    const entry={normalizedText:n,mainCategory,subCategory,caseType,savedAt:new Date().toISOString()};
    const i=classificationAliases.findIndex(a=>a.normalizedText===n);
    if(i>-1)classificationAliases[i]=entry; else classificationAliases.push(entry);
    if(saveAlias)saveAlias(entry);
  }
  /* بديل classifyScored يراعي تصحيحات المستخدم أولًا (مطابقة نصية دقيقة)، ثم يعود لمحرك النقاط كالمعتاد */
  function classifyWithAliases(text){
    const alias=findAlias(text);
    if(alias)return{mainCategory:alias.mainCategory,subCategory:alias.subCategory,caseType:alias.caseType,confidence:99};
    return classifyScored(text);
  }

  function norm(s){return s.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,' ').trim()}

  /* ===== التقويم الهجري (أم القرى) — عبر Intl المدعومة أصلًا في المتصفح، بلا حساب يدوي أو افتراض بداية الشهر ===== */
  const HIJRI_MONTH_NAMES=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
  const HIJRI_WEEKDAY_NAMES=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; // getDay(): 0=الأحد
  /* تهيئة آمنة: لا تفترض أن كل متصفح يدعم تقويم islamic-umalqura. إن فشل الإنشاء أو أعاد نتائج غير معقولة
     (مثل سنة هجرية خارج نطاق العصر الحالي، ما يعني أن المتصفح تجاهل التقويم بصمت وأرجع الميلادي)، نستخدم
     fallback آمن (عرض التاريخ الميلادي) بدل كسر الشريط أو عرض بيانات خاطئة. */
  let hijriFormatter=null, hijriCalendarSupported=false;
  try{
    hijriFormatter=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric'});
    const testParts=hijriFormatter.formatToParts(new Date());
    const testYear=parseInt(testParts.find(p=>p.type==='year').value,10);
    hijriCalendarSupported=testYear>=1400&&testYear<=1500; // نطاق معقول لسنة هجرية فعلية، وليس ميلادية تسربت بصمت
  }catch(e){
    console.warn('تقويم أم القرى غير مدعوم في هذا المتصفح؛ سيُستخدم التاريخ الميلادي كبديل آمن.',e);
    hijriCalendarSupported=false;
  }
  function gregorianToHijri(dateObj){
    if(!hijriCalendarSupported)return null;
    try{
      const parts=hijriFormatter.formatToParts(dateObj);
      const year=parseInt(parts.find(p=>p.type==='year').value,10);
      const month=parseInt(parts.find(p=>p.type==='month').value,10);
      const day=parseInt(parts.find(p=>p.type==='day').value,10);
      return{
        hijriYear:year,
        hijriMonthNumber:month,
        hijriMonth:HIJRI_MONTH_NAMES[month-1],
        hijriMonthKey:year+'-'+String(month).padStart(2,'0'),
        hijriDay:day
      };
    }catch(e){
      console.warn('تعذّر حساب التاريخ الهجري لهذا التاريخ:',e);
      return null;
    }
  }
  function hijriFieldsForNow(){return gregorianToHijri(new Date())||{hijriYear:'',hijriMonth:'',hijriMonthNumber:'',hijriMonthKey:'',hijriDay:''};}
  const GREGORIAN_MONTH_NAMES_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  /* نص جزء التاريخ فقط: "الأحد 25 صفر 1448 هـ" عند دعم التقويم الهجري،
     أو fallback ميلادي آمن مثل "الأحد 9 أغسطس 2026م" إن لم يكن مدعومًا — لا ينكسر الموقع أبدًا. */
  function detectStatusWord(text){
    const n=norm(text);
    if(/^غير\s*نهاي/.test(n))return 'قابلة للاعتراض';
    if(/^قابل(ه|ة)?\s*للاعتراض/.test(n))return 'قابلة للاعتراض';
    if(/^نهاي/.test(n))return 'نهائية';
    return null;
  }

  /* ===== محلل الإدخال المتعدد (parser) =====
     يدعم: أرقام ثم وصف / وصف ثم أرقام / رقم+حالة على نفس السطر (11111 نهائي) /
     وصف ثم أرقام مع حالة / أكثر من رقم يتقاسمون نفس الوصف — بأي ترتيب،
     ولا تُنهي الأسطر الفارغة العلاقة بين الرقم والوصف إلا عند اكتمال مجموعة فعلية. */
  function parse(s){
    const lines=s.split(/\n/).map(x=>x.trim());
    let pendingNums=[];       // [{num, status}]
    let pendingDesc=[];       // [line, line, ...]
    let descCameFirst=false;  // هل تصدَّر الوصف الأرقام في هذه المجموعة؟
    let pendingGroupStatus=null; // حالة وردت ضمن سطر وصف (مثل "تلفيات مركبة نهائي") تسري كحالة افتراضية لكل أرقام المجموعة التي لم تُحدَّد حالتها صراحة برقمها
    const out=[];

    function flush(){
      if(pendingNums.length){
        const joined=pendingDesc.join(' ').trim();
        pendingNums.forEach(entry=>out.push({num:entry.num,text:joined,status:entry.status||pendingGroupStatus||null}));
      }
      pendingNums=[];pendingDesc=[];descCameFirst=false;pendingGroupStatus=null;
    }
    function addNumber(num,status){
      if(pendingDesc.length===0){
        pendingNums.push({num,status});
      } else if(pendingNums.length===0){
        descCameFirst=true;
        pendingNums.push({num,status});
      } else if(descCameFirst){
        pendingNums.push({num,status});
      } else {
        flush();
        pendingNums.push({num,status});
      }
    }
    function addDescLine(rawLine){
      // سطر وصف قد ينتهي أو يتضمّن كلمة حالة ملحقة بنص حقيقي (مثل "تلفيات مركبة نهائي" أو
      // "جميع دعاوى الاتصالات السعودية نهائية") — استخرج الحالة ونظّف السطر منها قبل اعتباره وصفًا،
      // واحتفظ بها كحالة افتراضية للمجموعة الحالية (تُستخدم فقط للأرقام التي لم تُحدَّد حالتها بنفسها).
      const foundStatus=detectCaseStatus(norm(rawLine));
      const line=foundStatus?stripStatusWords(rawLine):rawLine;
      if(foundStatus)pendingGroupStatus=foundStatus;
      if(!line)return; // كان السطر بأكمله كلمة حالة (حالة نادرة، متكفَّل بها أصلًا في مكان آخر)
      if(pendingNums.length===0){
        pendingDesc.push(line);
      } else if(pendingDesc.length===0){
        descCameFirst=false;
        pendingDesc.push(line);
      } else if(!descCameFirst){
        pendingDesc.push(line);
      } else {
        flush();
        pendingDesc.push(line);
      }
    }

    for(const l of lines){
      if(!l){
        // سطر فارغ: لا يُنهي العلاقة إلا إذا كانت المجموعة الحالية مكتملة فعلاً (أرقام + وصف معًا)
        if(pendingNums.length&&pendingDesc.length)flush();
        continue;
      }
      const same=l.match(/^([0-9٠-٩]{4,20})\s+(.+)$/);
      if(same){
        const num=norm(same[1]);
        const rest=same[2].trim();
        const statusOnly=detectStatusWord(rest);
        if(statusOnly){
          // رقم + حالة فقط بنفس السطر (مثل "11111 نهائي") — ليست وصفًا، بل حالة تُلحق بالرقم
          addNumber(num,statusOnly);
        } else {
          // رقم ووصف حقيقي معًا في نفس السطر: بيانات مكتملة ومستقلة
          flush();
          out.push({num,text:rest,status:null});
        }
        continue;
      }
      const n=norm(l);
      if(/^\d{4,20}$/.test(n)){
        addNumber(n,null);
        continue;
      }
      const statusOnlyLine=detectStatusWord(l);
      if(statusOnlyLine&&pendingNums.length&&!pendingDesc.length){
        // سطر حالة مستقل (بدون رقم) يخص كل الأرقام المعلّقة التي لم تُحدَّد حالتها بعد
        pendingNums.forEach(e=>{ if(!e.status)e.status=statusOnlyLine; });
        continue;
      }
      addDescLine(l);
    }
    flush();
    return out;
  }

  /* إزالة كلمة الحالة من نص الوصف نفسه عندما تكون واردة ضمن سطر الوصف (لا تصبح جزءًا من originalText) */
  function stripStatusWords(text){
    return String(text||'')
      .replace(/غير\s*نهائي[ةه]?/g,'')
      .replace(/قابل[ةه]?\s*للاعتراض/g,'')
      .replace(/نهائي[ةه]?/g,'')
      .replace(/\s{2,}/g,' ')
      .replace(/^[\s,،\-–]+|[\s,،\-–]+$/g,'')
      .trim();
  }
  function detectCaseStatus(n){
    if(/غير\s*نهاي/.test(n))return 'قابلة للاعتراض';
    if(/قابل(ه|ة)?\s*للاعتراض/.test(n))return 'قابلة للاعتراض';
    if(/نهاي/.test(n))return 'نهائية';
    return '';
  }

  /* ===== استيراد Word: تفسير خلية "حالة القضية" المستقلة (وليست جزءًا من جملة وصفية) ===== */
  function parseImportStatus(text){
    const t=String(text||'').trim();
    if(!t)return '';
    const n=norm(t);
    if(/^غير\s*نهاي/.test(n))return 'قابلة للاعتراض';
    if(/^قابله?\s*للاعتراض$/.test(n))return 'قابلة للاعتراض';
    if(/^نهاي/.test(n))return 'نهائية';
    return '';
  }
  /* استخراج جدول من HTML الناتج عن mammoth.convertToHtml — يتجاهل سطر العناوين والصفوف الفارغة بالكامل */
  function parseDocxTable(htmlString){
    const parser=new DOMParser();
    const docu=parser.parseFromString(htmlString,'text/html');
    const table=docu.querySelector('table');
    const result={rows:[],blankSkipped:0,headerSkipped:false};
    if(!table)return result;
    const trs=Array.from(table.querySelectorAll('tr'));
    trs.forEach((tr,idx)=>{
      const tds=Array.from(tr.querySelectorAll('td'));
      const cellText=i=>(tds[i]?tds[i].textContent:'').trim();
      const col0=norm(cellText(0)).replace(/[^\d]/g,''); // رقم القضية بعد تطبيع الأرقام العربية
      const col1=cellText(1);
      const col2=cellText(2);
      if(idx===0&&!/^\d{4,20}$/.test(col0)){result.headerSkipped=true;return}
      if(!col0&&!col1&&!col2){result.blankSkipped++;return}
      result.rows.push({rawCaseNumber:col0,rawDesc:col1,rawStatus:col2});
    });
    return result;
  }
  /* بناء معاينة الاستيراد: نفس محرك التصنيف الحالي بالضبط (analyze)، لا محرك ثانٍ */
  function buildImportPreview(parsedRows){
    const seenInFile=new Set();
    const existingSet=new Set(records.filter(r=>!r.isDeleted).map(r=>String(r.caseNumber)));
    const nowHijri=hijriFieldsForNow();
    return parsedRows.map(row=>{
      const num=row.rawCaseNumber;
      let importRowStatus='ok',note='';
      if(!/^\d{4,20}$/.test(num)){importRowStatus='error';note='رقم القضية غير صالح';}
      else if(seenInFile.has(num)){importRowStatus='error';note='مكرر داخل الملف نفسه';}
      else if(existingSet.has(num)){importRowStatus='exists';note='موجودة مسبقًا — لن تُستورد لتفادي التكرار';}
      if(importRowStatus!=='error')seenInFile.add(num);

      const a=analyze(num,row.rawDesc||'',null);
      const wordStatus=parseImportStatus(row.rawStatus);
      if(wordStatus)a.caseStatus=wordStatus;
      const nf=computeNewTaxonomyFields(a.mainCategory,a.subCategory,a.originalText);
      return{...a,...nf,importRowStatus,note,hijriYear:nowHijri.hijriYear,hijriMonth:nowHijri.hijriMonth,hijriMonthNumber:nowHijri.hijriMonthNumber,hijriMonthKey:nowHijri.hijriMonthKey};
    });
  }

  /* ===== استخراج حقول إضافية صريحة فقط (بلا افتراض) ===== */
  function extractJudgmentResult(n){
    if(/رد.{0,10}دعوي|رفض.{0,10}دعوي|رد.{0,10}طلب|رفض.{0,10}طلب/.test(n))return 'رد الدعوى';
    if(/للمدعي عليه|حكم.{0,15}المدعي عليه/.test(n))return 'للمدعى عليه';
    if(/حكم.{0,10}للمدعي(?!.{0,8}عليه)|حكم.{0,10}لصالح.{0,10}المدعي(?!.{0,8}عليه)|حكم له/.test(n))return 'للمدعي';
    if(/حكم عليه/.test(n))return 'للمدعى عليه';
    return '';
  }
  function extractReason(n){
    const m=n.match(/(?:بسبب|نتيجه|لعدم|بدعوي|لرفض)\s+([^,.]{3,45})/);
    return m?m[0].trim():'';
  }
  function extractEvidenceType(n){
    if(/شاهد|شهاده/.test(n))return 'شهادة شهود';
    if(/عدم.{0,10}بينه|عدم وجود بينه/.test(n))return 'عدم تقديم بينة';
    if(/صك|مستند|سند/.test(n))return 'بينة كتابية';
    if(/يمين|حلف|نكول|نكل/.test(n))return 'يمين';
    return '';
  }
  function extractOathType(n){
    if(/نكول.{0,15}حاسمه|حاسمه.{0,15}نكول|نكل.{0,15}حاسمه/.test(n))return 'نكول عن اليمين الحاسمة';
    if(/نكول.{0,15}متممه|متممه.{0,15}نكول|نكل.{0,15}متممه/.test(n))return 'نكول عن اليمين المتممة';
    if(/نكول|نكل/.test(n))return 'نكول عن اليمين';
    if(/يمين حاسمه/.test(n))return 'يمين حاسمة';
    if(/يمين متممه/.test(n))return 'يمين متممة';
    if(/ادي.{0,10}اليمين|اداء.{0,10}اليمين|ادى اليمين/.test(n))return 'أداء اليمين';
    if(/يمين/.test(n))return 'يمين';
    return '';
  }
  function extractPartyStatus(n){
    if(/غياب|غايب|غاب/.test(n))return 'غياب المدعى عليه';
    if(/انكار/.test(n))return 'إنكار';
    if(/اقرار/.test(n))return 'إقرار';
    return '';
  }

  /* ===== محرك التسجيل بالنقاط ===== */
  function scoreCategory(cat,n){
    if(cat.excludes&&cat.excludes.some(re=>re.test(n)))return null;
    if(cat.requires&&cat.requires.length&&!cat.requires.some(re=>re.test(n)))return null;
    // كل عنصر في strong هو صياغة بديلة لنفس الإشارة، وليس دليلاً إضافيًا مستقلاً؛
    // لذلك النقاط "مسطّحة" (٥ كحد أقصى لوجود أي تطابق قوي) بدل جمع كل الصياغات المتطابقة.
    const hasStrong=(cat.strong||[]).some(re=>re.test(n));
    const weakHits=(cat.weak||[]).filter(re=>re.test(n)).length;
    const raw=(hasStrong?5:0)+Math.min(weakHits,2);
    return raw>0?raw:null;
  }
  function classifyScored(text){
    const n=norm(text);
    const candidates=[];
    CATS.forEach(cat=>{ const score=scoreCategory(cat,n); if(score!=null)candidates.push({cat,score}); });
    if(!candidates.length)return{mainCategory:'غير مصنف بدقة',subCategory:'يحتاج مراجعة يدوية',caseType:'غير محدد',confidence:0};
    candidates.sort((a,b)=> (a.cat.tier-b.cat.tier) || (b.score-a.score) );
    const best=candidates[0].cat, bestScore=candidates[0].score;
    const confidence=Math.min(97,Math.round((bestScore/(bestScore+3))*100));
    return{mainCategory:best.main,subCategory:best.sub,caseType:best.caseType,confidence};
  }

  function analyze(number,text,statusHint){
    let finalText=text;
    let caseStatus;
    if(statusHint){
      caseStatus=statusHint; // وردت الحالة من parser (سطر/إلحاق منفصل) — النص أصلًا نظيف منها
    } else {
      caseStatus=detectCaseStatus(norm(text));
      if(caseStatus)finalText=stripStatusWords(text); // أزل كلمة الحالة من الوصف المخزَّن
    }
    const n=norm(finalText);
    const c=classifyWithAliases(finalText);
    const oathType=extractOathType(n);
    const partyStatus=extractPartyStatus(n);
    const tags=[c.caseType,caseStatus,oathType,partyStatus].filter(Boolean);
    return{caseNumber:number,originalText:finalText,mainCategory:c.mainCategory,subCategory:c.subCategory,caseType:c.caseType,
      tags,confidence:c.confidence,isDeleted:false,caseStatus,
      judgmentResult:extractJudgmentResult(n),judgmentReason:extractReason(n),
      evidenceType:extractEvidenceType(n),oathType,partyStatus};
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function fmtDate(iso){if(!iso)return '—';try{const d=new Date(iso);return d.toLocaleDateString('ar-SA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}

  /* ============================= محرك القائمة المنسدلة القابلة للبحث (Searchable Dropdown) ============================= */
  let __sselRegistry={};
  let __sselHighlight={}; // id -> فهرس الخيار المظلَّل حاليًا ضمن النتائج المعروضة (-1 = لا شيء مظلَّل)
  function buildSearchableSelect(id,options,selected,onSelectFnName){
    __sselRegistry[id]={options,onSelectFnName};
    return `<div class="ssel" id="${id}">
      <input type="text" class="ssel-input" data-value="${esc(selected||'')}" value="${esc(selected||'')}" placeholder="اكتب للبحث..." data-diwan-input="sselFilter" data-diwan-value="${esc(id)}" data-diwan-focus="sselOpenOnFocus" data-diwan-value="${esc(id)}" data-diwan-keydown="sselKeyNav" data-diwan-value="${esc(id)}">
      <div class="ssel-list" style="display:none"></div>
    </div>`;
  }
  /* المطابقات الحالية بحسب نص استعلام مُمرَّر صراحة (لا تعتمد على input.value دائمًا، لدعم "فتح القائمة كاملة" عند التركيز) */
  function sselMatches(id,query){
    const entry=__sselRegistry[id];
    if(!entry)return[];
    const q=norm(query||'');
    return entry.options.map((o,i)=>({o,i})).filter(x=>norm(x.o).includes(q)).slice(0,60);
  }
  function sselRenderList(id,query,highlightIdx){
    const container=element(id);
    if(!container)return;
    const list=container.querySelector('.ssel-list');
    const matches=sselMatches(id,query);
    __sselHighlight[id]=(highlightIdx!=null&&highlightIdx>=0&&highlightIdx<matches.length)?highlightIdx:-1;
    list.innerHTML=matches.length?matches.map((x,pos)=>`<div class="ssel-item${pos===__sselHighlight[id]?' ssel-item-active':''}" data-diwan-pointerdown="sselChooseIndex" data-diwan-value="${esc(id)}" data-diwan-secondary="${x.i}">${esc(x.o)}</div>`).join(''):'<div class="ssel-item" style="color:var(--text-secondary)">لا توجد نتائج مطابقة</div>';
    list.style.display='block';
  }
  /* عند الضغط/التركيز على الحقل: تفتح القائمة كاملة فورًا (حتى لو كان الحقل يحمل قيمة مختارة بالفعل)،
     دون الحاجة لمسح النص الموجود أولًا. القيمة الموجودة لا تُعتبر فلترًا إطلاقًا حتى يكتب المستخدم بنفسه. */
  let __sselUserTyped={}; // id -> هل كتب المستخدم فعليًا منذ آخر فتح/اختيار؟
  function sselOpenOnFocus(id){
    __sselUserTyped[id]=false;
    sselRenderList(id,'',-1);
  }
  function sselFilter(id){
    const container=element(id);
    if(!container)return;
    __sselUserTyped[id]=true; // كتابة فعلية من المستخدم — من الآن فالبحث يعتمد على ما يكتبه
    const input=container.querySelector('.ssel-input');
    sselRenderList(id,input.value,-1);
  }
  function sselKeyNav(e,id){
    const container=element(id);
    if(!container)return;
    const list=container.querySelector('.ssel-list');
    const input=container.querySelector('.ssel-input');
    const isOpen=list.style.display==='block';
    const effectiveQuery=__sselUserTyped[id]?input.value:''; // لا تُعتبر القيمة الموجودة فلترًا إلا بعد كتابة فعلية
    const matches=sselMatches(id,effectiveQuery);
    if(e.key==='ArrowDown'){
      e.preventDefault();
      if(!isOpen){sselRenderList(id,effectiveQuery,0);return}
      const next=Math.min((__sselHighlight[id]!=null?__sselHighlight[id]:-1)+1,matches.length-1);
      sselRenderList(id,effectiveQuery,next);
      sselScrollHighlightIntoView(id);
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      if(!isOpen)return;
      const prev=Math.max((__sselHighlight[id]!=null?__sselHighlight[id]:0)-1,0);
      sselRenderList(id,effectiveQuery,prev);
      sselScrollHighlightIntoView(id);
    } else if(e.key==='Enter'){
      if(!isOpen)return;
      e.preventDefault();
      const idx=__sselHighlight[id];
      if(idx!=null&&idx>=0&&idx<matches.length)sselChooseIndex(id,matches[idx].i);
    } else if(e.key==='Escape'){
      list.style.display='none';
    }
  }
  function sselScrollHighlightIntoView(id){
    const container=element(id);
    const active=container&&container.querySelector('.ssel-item-active');
    if(active&&typeof active.scrollIntoView==='function')active.scrollIntoView({block:'nearest'});
  }
  function sselChooseIndex(id,idx){
    const entry=__sselRegistry[id];
    const value=entry.options[idx];
    const container=element(id);
    const input=container.querySelector('.ssel-input');
    input.value=value;input.dataset.value=value;
    container.querySelector('.ssel-list').style.display='none';
    __sselHighlight[id]=-1;
    __sselUserTyped[id]=false;
    if(entry.onSelectFnName)selectCallbacks[entry.onSelectFnName]?.(value,id);
  }
  function sselValue(id){
    const container=element(id);
    return container?container.querySelector('.ssel-input').value:'';
  }
  root.addEventListener('click',e=>{
    if (!e.target.closest('.exportMenuWrap')) closeExportMenu();
    root.querySelectorAll('.ssel-list').forEach(l=>{
      const parent=l.closest('.ssel');
      if(parent&&!parent.contains(e.target))l.style.display='none';
    });
  },{signal});

  /* ============================= محرك مربعات الاختيار المتعدد (Multi-select Checklist) — للنتيجة الإجرائية/وسائل الإثبات/الوسوم ============================= */
  function buildMultiChecklist(id,options,selectedList){
    const selSet=new Set(selectedList||[]);
    const items=options.map(o=>`<label><input type="checkbox" value="${esc(o)}" ${selSet.has(o)?'checked':''}> ${esc(o)}</label>`).join('');
    return `<div><input type="text" class="ssel-input" placeholder="بحث ضمن القائمة..." data-diwan-input="mclFilter" data-diwan-value="${esc(id)}" style="margin-bottom:8px"><div class="multichecklist" id="${id}">${items}</div></div>`;
  }
  function mclFilter(id,q){
    const nq=norm(q);
    root.querySelectorAll('#'+id+' label').forEach(l=>{
      l.style.display=norm(l.textContent).includes(nq)?'flex':'none';
    });
  }
  function mclValues(id){
    return Array.from(root.querySelectorAll('#'+id+' input[type=checkbox]:checked')).map(c=>c.value);
  }

  function mainOptionsHTML(selected){return Object.keys(catalog).map(m=>`<option value="${esc(m)}" ${m===selected?'selected':''}>${esc(m)}</option>`).join('');}
  function subOptionsHTML(main,selected){return (catalog[main]||[]).map(s=>`<option value="${esc(s)}" ${s===selected?'selected':''}>${esc(s)}</option>`).join('');}

  function runAnalysis(){
    draft=parse(element('input').value).map(x=>{
      const a=analyze(x.num,x.text,x.status);
      const nf=computeNewTaxonomyFields(a.mainCategory,a.subCategory,a.originalText);
      return{...a,...nf};
    });
    let el=element('preview');
    if(!draft.length){el.innerHTML='<div class="empty">أضف رقم قضية من 4 أرقام على الأقل.</div>';return}
    el.innerHTML='<div class="section-head"><div><small class="eyebrow">نتيجة التحليل</small><h2>راجع الاقتراح قبل الحفظ</h2></div></div>'+
      draft.map((x,i)=>{
        const hasSuggestion=x.main_category_new&&x.main_category_new!=='يحتاج إنشاء تصنيف جديد';
        return`<article class="review" data-i="${i}"><div class="review-head"><div><small style="color:var(--muted)">رقم القضية</small><br><strong dir="ltr">#${esc(x.caseNumber)}</strong></div><span class="badge" style="${hasSuggestion?'':'background:var(--lemon-soft);color:var(--lemon-text)'}">${hasSuggestion?'✅ اقتراح جاهز':'🟠 اختر تصنيفًا'}</span></div>
        <div class="fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
          <div><label style="font-size:11px;color:var(--muted)">التصنيف الرئيسي</label>${buildSearchableSelect('addMain'+i,NEW_MAIN_CATEGORIES,hasSuggestion?x.main_category_new:'','onAddMainChange')}</div>
          <div><label style="font-size:11px;color:var(--muted)">التصنيف الفرعي</label><div id="addSubWrap${i}">${buildSearchableSelect('addSub'+i,hasSuggestion?(NEW_TAXONOMY[x.main_category_new]||[]):[],hasSuggestion?x.sub_category_new:'','onAddSubChange')}</div></div>
        </div>
        <div style="margin:10px 0"><label style="font-size:11px;color:var(--muted)">الاختصاص${x.jurisdiction_status&&x.jurisdiction_status!=='غير محدد'?' <span style="color:var(--g)">— اكتُشف تلقائيًا من النص ✓</span>':''}</label>${buildSearchableSelect('addJurisdiction'+i,JURISDICTION_OPTIONS,x.jurisdiction_status||'غير محدد',null)}</div>
        <div id="caseStatusWrap${i}" style="margin:10px 0${hasSuggestion&&x.main_category_new===FORMAL_DEFENSES_MAIN?';display:none':''}"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:6px">حالة الحكم${x.caseStatus?' <span style="color:var(--g)">— اكتُشفت تلقائيًا من النص ✓</span>':''}</label>
          <div style="display:flex;gap:8px">
            <label style="flex:1;display:flex;align-items:center;gap:6px;padding:9px;border:1px solid var(--line);border-radius:8px;cursor:pointer">
              <input type="radio" name="caseStatus${i}" class="caseStatusRadio" value="نهائية" ${x.caseStatus==='نهائية'?'checked':''}> نهائية
            </label>
            <label style="flex:1;display:flex;align-items:center;gap:6px;padding:9px;border:1px solid var(--line);border-radius:8px;cursor:pointer">
              <input type="radio" name="caseStatus${i}" class="caseStatusRadio" value="قابلة للاعتراض" ${x.caseStatus==='قابلة للاعتراض'?'checked':''}> قابلة للاعتراض
            </label>
          </div>
        </div>
        <p>${esc(x.originalText)||'لا يوجد وصف'}</p></article>`;
      }).join('')+
      `<button class="btn btn-primary save" id="btnSaveDraft" ${ready?'':'disabled'} data-diwan-click="saveDraft">${ready?'اعتماد وحفظ سحابيًا ☁️':'سجّل الدخول أولًا لحفظ القضية سحابيًا'}</button>`;
    el.querySelectorAll('.review').forEach(card=>{
      card.querySelectorAll('.caseStatusRadio').forEach(radio=>{
        radio.onchange=()=>{ const i=+card.dataset.i; if(radio.checked) draft[i].caseStatus=radio.value; };
      });
    });
  }
  function onAddMainChange(value,id){
    const i=+id.replace('addMain','');
    draft[i].main_category_new=value;
    draft[i].sub_category_new=null;
    element('addSubWrap'+i).innerHTML=buildSearchableSelect('addSub'+i,NEW_TAXONOMY[value]||[],'','onAddSubChange');
    const badge=root.querySelector('.review[data-i="'+i+'"] .badge');
    if(badge){badge.textContent='🟠 اختر الفرع';badge.style.background='var(--lemon-soft)';badge.style.color='var(--lemon-text)';}
    const statusWrap=element('caseStatusWrap'+i);
    if(statusWrap){
      if(value===FORMAL_DEFENSES_MAIN){
        statusWrap.style.display='none';
        draft[i].caseStatus='قابلة للاعتراض'; // فروع الدفوع والنتائج الشكلية تُعتبر تلقائيًا قابلة للاعتراض
      } else {
        statusWrap.style.display='';
      }
    }
  }
  function onAddSubChange(value,id){
    const i=+id.replace('addSub','');
    draft[i].sub_category_new=value;
    draft[i].caseType=caseTypeForSub(value)||draft[i].main_category_new;
    draft[i].classification_status='classified';
    draft[i].classification_source='manual';
    const card=root.querySelector('.review[data-i="'+i+'"]');
    if(card){
      const badge=card.querySelector('.badge');
      if(badge){badge.textContent='✅ اقتراح جاهز';badge.style.background='';badge.style.color='';}
    }
  }

  /* ============================= حفظ/تعديل/حذف — كل شيء يكتب إلى قاعدة الديوان (autosave، لا يوجد تخزين محلي) ============================= */
  /* ============================= حساب حقول نظام التصنيف الجديد لكل قضية (إضافي بالكامل، لا يمس الحقول القديمة) ============================= */
  /* ============================= محرك اقتراح إعادة التصنيف (قراءة فقط — لا يغيّر أي قضية) =============================
     يجمع إشارتين:
     1) جدول Mapping (من التصنيف القديم) — مصدر ثقة أساسي.
     2) تطابق الكلمات الدالة بين النص الأصلي وأسماء كل تصنيف فرعي في الشجرة الجديدة (689 فرعًا) —
        تصحيح/تعزيز مستقل لا يعتمد فقط على التصنيف القديم.
     لا "ذكاء اصطناعي" حقيقي هنا — قواعد ومطابقة نصية صريحة، معروضة بصراحة في سبب الاقتراح. */
  const STOPWORDS_AR=new Set(['غير','على','من','في','إلى','عن','مع','أن','إن','ما','لا','كل','هذا','هذه','ذلك','التي','الذي','قد','كان','كانت','بين','عند','بعد','قبل','دون','بلا','بها','منه','منها','عنه','عنها']);
  function keywordMatchScore(text,candidateLabel){
    const textWords=new Set(norm(text).split(/\s+/).filter(w=>w.length>=3&&!STOPWORDS_AR.has(w)));
    const candWords=norm(candidateLabel).split(/\s+/).filter(w=>w.length>=3&&!STOPWORDS_AR.has(w));
    if(!candWords.length||!textWords.size)return 0;
    let matches=0;
    candWords.forEach(cw=>{ if([...textWords].some(tw=>tw.includes(cw)||cw.includes(tw)))matches++; });
    return matches/candWords.length;
  }
  function findBestKeywordMatch(text){
    let best=null,bestScore=0;
    Object.entries(NEW_TAXONOMY).forEach(([main,subs])=>{
      subs.forEach(sub=>{
        const score=keywordMatchScore(text,sub);
        if(score>bestScore){bestScore=score;best={main,sub};}
      });
    });
    return{match:best,score:bestScore};
  }
  function generateReclassificationSuggestion(record){
    const text=record.originalText||'';
    const oldMain=record.legacy_main_category||record.mainCategory;
    const oldSub=record.legacy_sub_category||record.subCategory;
    const mappingEntry=MIGRATION_MAPPING.find(m=>m.oldMain===oldMain&&m.oldSub===oldSub);
    const kw=findBestKeywordMatch(text);

    let suggestedMain=null,suggestedSub=null,confidence,reason;
    const proceduralSuggested=mappingEntry&&mappingEntry.proceduralResult?[mappingEntry.proceduralResult]:[];
    const evidenceSuggested=mappingEntry&&mappingEntry.evidenceMethod?[mappingEntry.evidenceMethod]:[];

    if(mappingEntry&&mappingEntry.newMain&&mappingEntry.status==='migrated_high'){
      suggestedMain=mappingEntry.newMain;suggestedSub=mappingEntry.newSub;
      confidence='اقتراح تغيير - ثقة عالية';
      reason='التصنيف القديم "'+oldMain+' ← '+oldSub+'" يقابل بوضوح هذا التصنيف الجديد في جدول المطابقة.';
    } else if(mappingEntry&&mappingEntry.newMain&&mappingEntry.status==='migrated_medium'){
      suggestedMain=mappingEntry.newMain;suggestedSub=mappingEntry.newSub;
      confidence='اقتراح تغيير - ثقة متوسطة';
      reason='التصنيف القديم يقابل على الأرجح هذا التصنيف الجديد وفق جدول المطابقة، ويُفضَّل تأكيدك.';
    } else if(kw.score>=0.6){
      suggestedMain=kw.match.main;suggestedSub=kw.match.sub;
      confidence=kw.score>=0.85?'اقتراح تغيير - ثقة عالية':'اقتراح تغيير - ثقة متوسطة';
      reason='نص القضية الأصلي يحتوي كلمات دالة واضحة على تصنيف "'+kw.match.sub+'".';
    } else if(kw.score>=0.3){
      suggestedMain=kw.match.main;suggestedSub=kw.match.sub;
      confidence='يحتاج قرارًا يدويًا';
      reason='يوجد تشابه جزئي فقط بين النص وتصنيف "'+kw.match.sub+'"، غير كافٍ للجزم به آليًا.';
    } else {
      confidence='لا توجد معلومات كافية';
      reason='النص الأصلي لا يحتوي كلمات دالة كافية لاقتراح تصنيف جديد بثقة معقولة — يحتاج مراجعة يدوية كاملة.';
    }

    const alreadyCorrect=record.main_category_new&&record.main_category_new===suggestedMain&&(!suggestedSub||record.sub_category_new===suggestedSub)&&record.migrationStatus==='migrated';
    if(alreadyCorrect){confidence='التصنيف الحالي يبدو صحيحًا';reason='التصنيف الجديد الحالي للقضية يطابق نتيجة إعادة الفحص.';}

    return{
      caseNumber:record.caseNumber,originalText:text,
      oldMain,oldSub,
      currentMainNew:record.main_category_new||null,currentSubNew:record.sub_category_new||null,
      jurisdictionStatus:record.jurisdiction_status||'غير محدد',
      suggestedMain,suggestedSub,
      proceduralSuggested,evidenceSuggested,
      confidence,reason,
      alreadyCorrect:!!alreadyCorrect
    };
  }

  /* ============================= الحالة الموحّدة الوحيدة للتصنيف — تُستخدم في كل صفحة، بلا استثناء =============================
     القيم الثلاث فقط: 'classified' | 'needs_review' | 'unclassified'
     هذه الدالة الوحيدة التي يحق لها تقرير حالة أي قضية. لا تُكتب شروط حالة منفصلة في أي مكان آخر بالموقع. */
  function getClassificationState(record){
    if(record.classification_status==='classified'||record.classification_status==='needs_review'||record.classification_status==='unclassified'){
      return record.classification_status;
    }
    // Backfill آمن للقضايا القديمة التي لم تُحسب لها الحالة الموحّدة بعد (بلا كتابة فعلية هنا، عرض فقط)
    if(!record.main_category_new)return 'needs_review';
    if(record.main_category_new==='يحتاج إنشاء تصنيف جديد')return 'unclassified';
    return 'classified';
  }
  const CLASSIFICATION_STATE_LABELS={classified:'مصنفة',needs_review:'تحتاج مراجعة',unclassified:'غير مصنفة'};
  function classificationStateLabel(record){return CLASSIFICATION_STATE_LABELS[getClassificationState(record)];}
  const CLASSIFICATION_SOURCE_LABELS={auto:'تصنيف تلقائي',manual:'تصنيف يدوي',legacy_migration:'مُرحَّل من النظام القديم'};

  /* استخراج حقل الاختصاص من النص الأصلي — صريح فقط، لا يُفترض "مختص" أبدًا إن لم يوجد نص واضح؛
     يبقى "غير محدد" حتى يختاره المستخدم يدويًا. حقل مستقل تمامًا عن procedural_results. */
  function extractJurisdictionStatus(text){
    const n=norm(text||'');
    if(n.includes(norm('عدم الاختصاص الدولي'))||n.includes(norm('عدم اختصاص دولي')))return 'عدم الاختصاص الدولي';
    if(n.includes(norm('عدم الاختصاص الولائي'))||n.includes(norm('عدم اختصاص ولائي')))return 'عدم الاختصاص الولائي';
    if(n.includes(norm('عدم الاختصاص النوعي'))||n.includes(norm('عدم اختصاص نوعي')))return 'عدم الاختصاص النوعي';
    if(n.includes(norm('عدم الاختصاص المكاني'))||n.includes(norm('عدم اختصاص مكاني')))return 'عدم الاختصاص المكاني';
    if(n.includes(norm('عدم الاختصاص القيمي'))||n.includes(norm('عدم اختصاص قيمي')))return 'عدم الاختصاص القيمي';
    return 'غير محدد';
  }

  function computeNewTaxonomyFields(oldMain,oldSub,originalText){
    const mapping=MIGRATION_MAPPING.find(m=>m.oldMain===oldMain&&m.oldSub===oldSub);
    const n=norm(originalText||'');
    let mainNew=null,subNew=null,migrationStatus='needs_review';
    const proceduralResults=[];
    const evidenceMethods=[];

    if(mapping){
      if(mapping.newMain){
        mainNew=mapping.newMain;
        subNew=mapping.newSub||null;
        migrationStatus=(mapping.status==='migrated_high'||mapping.status==='migrated_medium')?'suggested':'needs_review';
      }
      if(mapping.proceduralResult)proceduralResults.push(mapping.proceduralResult);
      if(mapping.evidenceMethod)evidenceMethods.push(mapping.evidenceMethod);
    }
    if(!mainNew){
      mainNew='يحتاج إنشاء تصنيف جديد';
      subNew=null;
      migrationStatus='needs_review';
    }

    // تعزيز وسائل الإثبات من الحقول المستخرجة أصلًا (oathType/evidenceType) إن طابقت قيمة معروفة في القائمة الجديدة
    [oathTypeToEvidence(n)].filter(Boolean).forEach(v=>{ if(!evidenceMethods.includes(v))evidenceMethods.push(v); });

    const classification_status=(mainNew==='يحتاج إنشاء تصنيف جديد')?'unclassified':(migrationStatus==='suggested'?'needs_review':'needs_review');
    return{
      main_category_new:mainNew,
      sub_category_new:subNew,
      procedural_results:proceduralResults,
      evidence_methods:evidenceMethods,
      tags_new:[],
      case_progress_status:'', // حالة سير القضية — حقل مستقل، لا تخمين آلي، يُدخله المستخدم يدويًا
      jurisdiction_status:extractJurisdictionStatus(originalText),
      legacy_main_category:oldMain,
      legacy_sub_category:oldSub,
      migrationStatus, // قديم — يُحتفَظ به للتوافق فقط، لا يقود الواجهة
      classification_status,
      classification_source:'legacy_migration'
    };
  }
  /* يحوّل نوع اليمين/النكول المستخرج مسبقًا (oathType الحالي) إلى أقرب قيمة في قائمة وسائل الإثبات الجديدة، بلا تخمين إن لم يوجد تطابق واضح */
  function oathTypeToEvidence(n){
    if(/نكول.{0,15}حاسمه|حاسمه.{0,15}نكول/.test(n))return 'نكول عن اليمين';
    if(/نكول/.test(n))return 'نكول عن اليمين';
    if(/يمين حاسمه/.test(n))return 'يمين حاسمة';
    if(/يمين متممه/.test(n))return 'يمين متممة';
    return null;
  }

  async function saveDraft(){
    if(!ready){alert('افتح ديوان القضايا بالرمز السري أولًا لحفظ القضية.');return}
    const btn=element('btnSaveDraft');
    if(btn){btn.disabled=true;btn.textContent='جارٍ الحفظ سحابيًا... ☁️';}
    setSync('جارٍ الحفظ…');
    // قراءة القيم النهائية من شاشة المراجعة بالفهرس الأصلي في draft قبل أي تصفية.
    // ملاحظة: procedural_results وevidence_methods وcase_progress_status وtags_new لم تعد تُقرأ من نموذج
    // الإضافة (لا توجد عناصر واجهة لها بعد حذف "تفاصيل إضافية") — تبقى كما حسبها computeNewTaxonomyFields
    // تلقائيًا عند التحليل، دون أي استبدال بقيم فارغة.
    draft.forEach((c,i)=>{
      const mainVal=sselValue('addMain'+i)||null;
      const subVal=sselValue('addSub'+i)||null;
      c.main_category_new=mainVal||'يحتاج إنشاء تصنيف جديد';
      c.sub_category_new=subVal||null;
      c.jurisdiction_status=sselValue('addJurisdiction'+i)||'غير محدد';
      const checkedRadio=root.querySelector(`input[name="caseStatus${i}"]:checked`);
      if(checkedRadio)c.caseStatus=checkedRadio.value;
      if(mainVal&&subVal){
        c.classification_status='classified';
        if(!c.classification_source)c.classification_source='auto'; // بقي كما اقترحه النظام دون تعديل المستخدم
      } else {
        c.classification_status=(mainVal&&mainVal!=='يحتاج إنشاء تصنيف جديد')?'needs_review':'unclassified';
        c.classification_source='auto';
      }
      if(mainVal===FORMAL_DEFENSES_MAIN)c.caseStatus='قابلة للاعتراض'; // شبكة أمان: فروع الدفوع الشكلية قابلة للاعتراض دائمًا
    });
    const existing=new Set(records.map(x=>String(x.caseNumber)));
    const toSave=draft.filter(x=>!existing.has(String(x.caseNumber)));
    try{
      const now=new Date().toISOString();
      const hijri=gregorianToHijri(new Date(now));
      for(const c of toSave){
        c.createdAt=now;c.updatedAt=now;
        c.hijriYear=hijri.hijriYear;c.hijriMonth=hijri.hijriMonth;c.hijriMonthNumber=hijri.hijriMonthNumber;c.hijriMonthKey=hijri.hijriMonthKey;
        c.legacy_main_category=c.mainCategory;c.legacy_sub_category=c.subCategory;
        c.tags_new=c.tags_new||[];
        await saveCase(c);
      }
      setSync('تم الحفظ.');
    }catch(err){
      console.error(err);setSync('تعذّر الحفظ ⚠️');alert('تعذّر الحفظ سحابيًا: '+(err.message||err));
    }
    draft=[];element('input').value='';element('preview').innerHTML='';element('search').value='';show('cases');
  }
  function exportData(){let blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),cases:records},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='case-register-backup.json';a.click();URL.revokeObjectURL(a.href)}
  async function importData(e){
    if(!ready){alert('سجّل الدخول أولًا لاستيراد نسخة إلى حسابك السحابي.');e.target.value='';return}
    try{
      let data=JSON.parse(await e.target.files[0].text()),rows=Array.isArray(data)?data:data.cases;
      if(!Array.isArray(rows))throw new Error('بنية غير متوقعة');
      let existing=new Set(records.map(x=>String(x.caseNumber)));
      let added=0;
      setSync('جارٍ استيراد النسخة الاحتياطية ☁️');
      for(const row of rows){
        if(!row||!row.caseNumber||existing.has(String(row.caseNumber)))continue;
        const now=new Date().toISOString();
        await saveCase({
          ...row,caseNumber:String(row.caseNumber),originalText:String(row.originalText||''),
          mainCategory:row.mainCategory||'غير مصنف بدقة',subCategory:row.subCategory||'غير مصنف بدقة',
          caseType:row.caseType||'غير محدد',tags:Array.isArray(row.tags)?row.tags:[],
          confidence:row.confidence||0,isDeleted:!!row.isDeleted,
          createdAt:row.createdAt||now,updatedAt:row.updatedAt||now
        });
        existing.add(String(row.caseNumber));
        added++;
      }
      setSync('تم الحفظ.');
      alert('تم استيراد '+added+' قضية جديدة بنجاح إلى حسابك السحابي');
    }catch(err){console.error(err);alert('ملف النسخة الاحتياطية غير صالح: '+(err.message||err))}
    e.target.value='';
  }
  async function trash(n,restore=false){
    if(!ready)return;
    setSync('جارٍ الحفظ…');
    try{
      await updateCase(n,{isDeleted:!restore,updatedAt:new Date().toISOString()});
      setSync('تم الحفظ.');
    }catch(err){console.error(err);setSync('تعذّر الحفظ ⚠️');}
  }

  /* ============================= إعادة تحليل القضايا غير المصنفة (ميزة صيانة، لا تمس رقم القضية/النص الأصلي/تاريخ الإنشاء/حالة الحذف/معرّف المستند) ============================= */

  /* يعيد فقط الحقول الناتجة عن محرك التصنيف — لا caseStatus ولا originalText ولا أي حقل آخر */
  function reanalyzeFields(originalText){
    const n=norm(originalText||'');
    const c=classifyWithAliases(originalText||'');
    const oathType=extractOathType(n);
    const partyStatus=extractPartyStatus(n);
    const tags=[c.caseType,oathType,partyStatus].filter(Boolean);
    return{
      mainCategory:c.mainCategory,subCategory:c.subCategory,caseType:c.caseType,
      tags,confidence:c.confidence,
      judgmentResult:extractJudgmentResult(n),judgmentReason:extractReason(n),
      evidenceType:extractEvidenceType(n),oathType,partyStatus
    };
  }

  /* استخراج الكلمات العربية (٣ أحرف فأكثر) من مصدر تعبيرات تصنيف معيّن، لأغراض تشخيص "أقرب تصنيف" فقط */
  function extractPatternWords(cat){
    const all=[...(cat.strong||[]),...(cat.weak||[]),...(cat.requires||[])];
    const words=new Set();
    all.forEach(re=>{ (re.source.match(/[\u0600-\u06FF]{3,}/g)||[]).forEach(w=>words.add(w)); });
    return[...words];
  }

  /* لماذا بقيت القضية غير مصنفة، وما أقرب تصنيف محتمل، وما الكلمة/القاعدة الناقصة */
  function diagnoseWhyUnclassified(text){
    const n=norm(text||'');
    const words=[...new Set(n.split(/\s+/).filter(w=>w.length>=3))];
    if(!words.length)return{reason:'لا يوجد نص وصفي كافٍ لتحليله',closest:'—',missingRule:'أضف وصفًا للقضية أولًا'};
    let candidates=[];
    CATS.forEach(cat=>{
      const patternWords=extractPatternWords(cat);
      const overlap=words.filter(w=>patternWords.some(pw=>w.includes(pw)||pw.includes(w)));
      if(overlap.length)candidates.push({main:cat.main,sub:cat.sub,overlap:[...new Set(overlap)]});
    });
    candidates.sort((a,b)=>b.overlap.length-a.overlap.length);
    if(!candidates.length){
      return{reason:'لا تحتوي القضية أي كلمة دالة معروفة لدى محرك التصنيف الحالي',closest:'لا يوجد',missingRule:'أضف تصنيفًا فرعيًا جديدًا وكلمات دالة تصف موضوع هذه القضية (من صفحة التصنيفات)'};
    }
    const top=candidates[0];
    return{
      reason:'يوجد تشابه جزئي فقط في الكلمات، غير كافٍ لتجاوز حد الثقة الأدنى لأي تصنيف',
      closest:top.main+' ← '+top.sub,
      missingRule:'وسّع قاعدة "'+top.sub+'" لتشمل الكلمات: '+top.overlap.join('، ')
    };
  }

  async function reanalyzeUnclassified(){
    if(!ready){alert('افتح ديوان القضايا بالرمز السري أولًا لتشغيل إعادة التحليل السحابية.');return}
    const targets=records.filter(r=>!r.isDeleted&&r.mainCategory==='غير مصنف بدقة'&&!r.manuallyReviewed);
    if(!targets.length){alert('لا توجد قضايا غير مصنفة بحاجة لإعادة التحليل حاليًا 🎉');return}

    const btn=element('btnReanalyze');
    if(btn){btn.disabled=true;btn.textContent='جارٍ إعادة تحليل '+targets.length+' قضية... ☁️';}
    setSync('جارٍ إعادة التحليل ☁️');

    let reanalyzedCount=0,becameClassified=0,stillUnclassified=0;
    const stillUnclassifiedDetails=[];

    for(const r of targets){
      const fields=reanalyzeFields(r.originalText);
      fields.updatedAt=new Date().toISOString();
      try{
        // updateDoc يحدّث الحقول المذكورة فقط؛ لا يمس caseNumber ولا originalText ولا createdAt
        // ولا isDeleted ولا معرّف المستند نفسه (doc id) بأي شكل.
        await updateCase(r.caseNumber,fields);
        Object.assign(r,fields); // تحديث النسخة المحلية فورًا لتفادي أي وميض قبل وصول onSnapshot
        reanalyzedCount++;
        if(fields.mainCategory!=='غير مصنف بدقة'){
          becameClassified++;
        } else {
          stillUnclassified++;
          const diag=diagnoseWhyUnclassified(r.originalText);
          stillUnclassifiedDetails.push({caseNumber:r.caseNumber,text:r.originalText,...diag});
        }
      }catch(err){
        console.error('تعذّر إعادة تحليل القضية #'+r.caseNumber,err);
      }
    }

    if(btn){btn.disabled=false;btn.textContent='إعادة تحليل القضايا غير المصنفة';}
    setSync('تم الحفظ.');
    renderCases();renderTrash();renderTree();

    showReanalyzeReport(reanalyzedCount,becameClassified,stillUnclassified,stillUnclassifiedDetails);
  }

  function showReanalyzeReport(reanalyzed,became,stillUn,details){
    const box=element('reportModalBox');
    let html='<h3 style="color:var(--g);margin-top:0">تقرير إعادة التحليل</h3>'+
      '<div class="grid" style="margin:16px 0">'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--g);font-weight:700">'+reanalyzed+'</div><div style="font-size:12px;color:var(--muted)">تمت إعادة تحليلها</div></div>'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--mint-dark);font-weight:700">'+became+'</div><div style="font-size:12px;color:var(--muted)">أصبحت مصنَّفة</div></div>'+
      '</div>'+
      '<div class="card" style="margin:0 0 16px"><div style="font-size:26px;color:var(--lemon-text);font-weight:700">'+stillUn+'</div><div style="font-size:12px;color:var(--muted)">بقيت غير مصنفة</div></div>';

    if(details.length){
      html+='<h4 style="color:var(--g)">القضايا التي بقيت غير مصنفة</h4>';
      details.forEach(d=>{
        html+='<div class="card" style="margin-top:10px">'+
          '<strong>#'+esc(d.caseNumber)+'</strong>'+
          '<p style="font-size:12px;color:var(--muted);margin:6px 0">'+esc(d.text||'(بلا نص)')+'</p>'+
          '<p style="font-size:12px"><b>السبب:</b> '+esc(d.reason)+'</p>'+
          '<p style="font-size:12px"><b>أقرب تصنيف محتمل:</b> '+esc(d.closest)+'</p>'+
          '<p style="font-size:12px"><b>ما الناقص:</b> '+esc(d.missingRule)+'</p>'+
        '</div>';
      });
    }
    html+='<div style="text-align:left;margin-top:18px"><button class="btn btn-primary" data-diwan-click="closeReport">إغلاق</button></div>';
    box.innerHTML=html;
    openDialog('reportModal');
  }
  function closeReport(){element('reportModal').close();}

  /* ============================= إصلاح نصوص قضايا قديمة (Migration) — معاينة إلزامية قبل أي كتابة، لا حذف ولا نسخ جديدة ============================= */

  /* نص "تالف" = فارغ، أو يساوي حرفيًا كلمة الحالة نفسها (بقايا الخلل القديم في parser) */
  function isBrokenText(text){
    const t=String(text||'').trim();
    if(!t)return true;
    const n=norm(t);
    if(/^غير\s*نهايي?ه?$/.test(n))return true;
    if(/^نهايي?ه?$/.test(n))return true;
    if(/^قابله?\s*للاعتراض$/.test(n))return true;
    return false;
  }

  let migrationPreviewData=[]; // محفوظة بين خطوة المعاينة وخطوة التنفيذ

  function previewMigration(){
    const raw=element('migrationInput').value;
    const parsed=parse(raw);
    if(!parsed.length){alert('الصق نص القائمة الأصلية أولًا.');return}

    const preview=[];
    parsed.forEach(p=>{
      const existing=records.find(r=>String(r.caseNumber)===String(p.num));
      if(!existing)return;              // رقم غير موجود أصلًا في قاعدتك — لا نُنشئ قضية جديدة هنا إطلاقًا
      if(existing.manuallyReviewed)return; // قضية راجعتها يدويًا — لا تُمس
      if(!isBrokenText(existing.originalText))return; // نصها سليم أصلًا — لا حاجة لإصلاح
      const fields=reanalyzeFields(p.text);
      preview.push({
        caseNumber:p.num,
        oldText:existing.originalText||'(بلا نص)',
        newText:p.text,
        newStatus:p.status||'',
        ...fields
      });
    });

    migrationPreviewData.length=0;
    migrationPreviewData.push(...preview);
    renderMigrationPreview(preview);
  }

  function renderMigrationPreview(preview){
    const box=element('reportModalBox');
    let html='<h3 style="color:var(--g);margin-top:0">معاينة إصلاح النصوص (لم يُطبَّق أي تغيير بعد)</h3>';
    if(!preview.length){
      html+='<p style="color:var(--muted)">لم يتم العثور على أي قضية تحتاج إصلاحًا مطابقة لهذه القائمة — إما أن الأرقام غير موجودة في قاعدتك، أو نصوصها سليمة أصلًا، أو رُوجعت يدويًا من قبل.</p>'+
        '<div style="text-align:left;margin-top:16px"><button class="btn btn-soft" data-diwan-click="closeReport">إغلاق</button></div>';
      box.innerHTML=html;
      openDialog('reportModal');
      return;
    }
    html+='<p style="color:var(--muted);font-size:12px">سيتم إصلاح <b style="color:var(--g)">'+preview.length+'</b> قضية. راجع الجدول ثم اضغط "تأكيد وتنفيذ" للمتابعة، أو "إلغاء" للتراجع دون أي تغيير.</p>'+
      '<div style="overflow-x:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<thead><tr style="text-align:right;color:var(--muted)"><th style="padding:8px">رقم القضية</th><th style="padding:8px">النص الحالي</th><th style="padding:8px">النص المصحح</th><th style="padding:8px">التصنيف المتوقع</th></tr></thead><tbody>';
    preview.forEach(p=>{
      html+='<tr style="border-top:1px solid var(--line)"><td style="padding:8px">#'+esc(p.caseNumber)+'</td>'+
        '<td style="padding:8px;color:var(--red)">'+esc(p.oldText)+'</td>'+
        '<td style="padding:8px;color:var(--mint-dark)">'+esc(p.newText)+(p.newStatus?' <span class="badge" style="margin-inline-start:4px">'+esc(p.newStatus)+'</span>':'')+'</td>'+
        '<td style="padding:8px">'+esc(p.mainCategory)+' ← '+esc(p.subCategory)+'</td></tr>';
    });
    html+='</tbody></table></div>'+
      '<div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">'+
        '<button class="btn btn-soft" data-diwan-click="closeReport">إلغاء</button>'+
        '<button class="btn btn-primary" id="btnConfirmMigration" data-diwan-click="applyMigration">تأكيد وتنفيذ الإصلاح ☁️</button>'+
      '</div>';
    box.innerHTML=html;
    openDialog('reportModal');
  }

  async function applyMigration(){
    if(!ready){alert('سجّل الدخول أولًا.');return}
    const preview=migrationPreviewData;
    if(!preview.length)return;
    const btn=element('btnConfirmMigration');
    if(btn){btn.disabled=true;btn.textContent='جارٍ الإصلاح... ☁️';}
    setSync('جارٍ إصلاح النصوص ☁️');

    let fixedCount=0,becameClassified=0,stillNeedsReview=0;
    for(const p of preview){
      const patch={
        originalText:p.newText,
        caseStatus:p.newStatus,
        mainCategory:p.mainCategory,subCategory:p.subCategory,caseType:p.caseType,
        tags:p.tags,confidence:p.confidence,
        judgmentResult:p.judgmentResult,judgmentReason:p.judgmentReason,
        evidenceType:p.evidenceType,oathType:p.oathType,partyStatus:p.partyStatus,
        updatedAt:new Date().toISOString()
      };
      try{
        // updateDoc: تحديث جزئي فقط — لا يمس caseNumber ولا createdAt ولا isDeleted ولا معرّف المستند
        await updateCase(p.caseNumber,patch);
        const local=records.find(r=>String(r.caseNumber)===String(p.caseNumber));
        if(local)Object.assign(local,patch);
        fixedCount++;
        if(p.mainCategory!=='غير مصنف بدقة')becameClassified++; else stillNeedsReview++;
      }catch(err){
        console.error('تعذّر إصلاح القضية #'+p.caseNumber,err);
      }
    }

    setSync('تم الحفظ.');
    renderCases();renderTrash();renderTree();
    migrationPreviewData.length=0;

    const box=element('reportModalBox');
    box.innerHTML='<h3 style="color:var(--g);margin-top:0">تقرير إصلاح النصوص</h3>'+
      '<div class="grid" style="margin:16px 0">'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--g);font-weight:700">'+fixedCount+'</div><div style="font-size:12px;color:var(--muted)">تم إصلاح نصها</div></div>'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--mint-dark);font-weight:700">'+becameClassified+'</div><div style="font-size:12px;color:var(--muted)">أصبحت مصنَّفة</div></div>'+
      '</div>'+
      '<div class="card" style="margin:0 0 16px"><div style="font-size:26px;color:var(--lemon-text);font-weight:700">'+stillNeedsReview+'</div><div style="font-size:12px;color:var(--muted)">بقيت تحتاج مراجعة</div></div>'+
      '<div style="text-align:left"><button class="btn btn-primary" data-diwan-click="closeReport">إغلاق</button></div>';
  }

  /* ============================= استيراد قضايا من Word (.docx) — معاينة إلزامية، ثم استيراد فقط بعد الموافقة ============================= */
  let wordImportPreviewData=[];

  async function handleWordFile(event){
    const file=event.target.files[0];
    event.target.value='';
    if(!file)return;
    try{
      const mammothApi=await loadWordLibrary('mammoth');
      const arrayBuffer=await file.arrayBuffer();
      const result=await mammothApi.convertToHtml({arrayBuffer});
      const parsed=parseDocxTable(result.value);
      if(!parsed.rows.length){alert('لم يتم العثور على جدول صالح داخل الملف، أو الجدول فارغ بالكامل.');return}
      const preview=buildImportPreview(parsed.rows);
      wordImportPreviewData.length=0;
      wordImportPreviewData.push(...preview);
      renderWordImportPreview(preview,parsed);
    }catch(err){
      console.error(err);
      alert('تعذّر تحميل أو قراءة ملف Word. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.\n'+(err.message||err));
    }
  }

  function renderWordImportPreview(preview,parsedMeta){
    const box=element('reportModalBox');
    const okCount=preview.filter(p=>p.importRowStatus==='ok').length;
    const existsCount=preview.filter(p=>p.importRowStatus==='exists').length;
    const errorCount=preview.filter(p=>p.importRowStatus==='error').length;

    let html='<h3 style="color:var(--g);margin-top:0">معاينة استيراد Word</h3>'+
      '<p style="font-size:12px;color:var(--muted)">'+preview.length+' صفًا في الجدول'+
      (parsedMeta.blankSkipped?(' — تم تجاهل '+parsedMeta.blankSkipped+' صفًا فارغًا'):'')+
      '. جاهزة للاستيراد: <b style="color:var(--mint-dark)">'+okCount+'</b> — موجودة مسبقًا: <b style="color:var(--lemon-text)">'+existsCount+'</b> — أخطاء: <b style="color:var(--red)">'+errorCount+'</b>.</p>'+
      '<div style="overflow-x:auto;margin-top:10px;max-height:50vh;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
      '<thead><tr style="text-align:right;color:var(--muted)"><th style="padding:6px">#</th><th style="padding:6px">الوصف</th><th style="padding:6px">التصنيف</th><th style="padding:6px">حالة الحكم</th><th style="padding:6px">حالة سير القضية</th><th style="padding:6px">الشهر الهجري</th><th style="padding:6px">الوضع</th></tr></thead><tbody>';

    preview.forEach((p,i)=>{
      const badge=p.importRowStatus==='ok'?'<span class="badge">جديدة</span>':
        p.importRowStatus==='exists'?'<span class="badge warn" style="background:var(--amber-bg);color:var(--lemon-text);border-color:var(--lemon-text)">'+esc(p.note)+'</span>':
        '<span class="badge" style="background:var(--red-bg);color:var(--red);border-color:var(--border)">'+esc(p.note)+'</span>';
      const disabled=p.importRowStatus!=='ok'?'disabled':'';
      html+='<tr data-row="'+i+'" style="border-top:1px solid var(--line)'+(p.importRowStatus!=='ok'?';opacity:.55':'')+'">'+
        '<td style="padding:6px">'+esc(p.caseNumber)+'</td>'+
        '<td style="padding:6px;max-width:160px">'+esc(p.originalText||'—')+'</td>'+
        '<td style="padding:6px;min-width:170px">'+buildSearchableSelect('wiMain'+i,NEW_MAIN_CATEGORIES,p.main_category_new!=='يحتاج إنشاء تصنيف جديد'?p.main_category_new:'','onWiMainChange')+'<div id="wiSubWrap'+i+'" style="margin-top:4px">'+buildSearchableSelect('wiSub'+i,NEW_TAXONOMY[p.main_category_new]||[],p.sub_category_new,null)+'</div></td>'+
        '<td style="padding:6px"><select class="wiStatus" '+disabled+' style="font-size:11px;padding:4px;border:1px solid var(--line);border-radius:6px">'+
          '<option value="" '+(!p.caseStatus?'selected':'')+'>—</option>'+
          '<option value="نهائية" '+(p.caseStatus==='نهائية'?'selected':'')+'>نهائية</option>'+
          '<option value="قابلة للاعتراض" '+(p.caseStatus==='قابلة للاعتراض'?'selected':'')+'>غير نهائية</option>'+
        '</select></td>'+
        '<td style="padding:6px;min-width:130px"><select class="wiProgress" '+disabled+' style="font-size:11px;padding:4px;border:1px solid var(--line);border-radius:6px">'+
          '<option value="">—</option>'+
          CASE_PROGRESS_STATUS.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('')+
        '</select></td>'+
        '<td style="padding:6px">'+esc(p.hijriMonth)+' '+esc(p.hijriYear)+'هـ</td>'+
        '<td style="padding:6px">'+badge+'</td>'+
        '</tr>';
    });
    html+='</tbody></table></div>'+
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">'+
        '<button class="btn btn-soft" data-diwan-click="closeReport">إلغاء</button>'+
        '<button class="btn btn-primary" id="btnConfirmWordImport" '+(okCount?'':'disabled')+' data-diwan-click="confirmWordImport">اعتماد واستيراد القضايا ('+okCount+')</button>'+
      '</div>';
    box.innerHTML=html;
    openDialog('reportModal');
  }
  function onWiMainChange(value,id){
    const i=id.replace('wiMain','');
    element('wiSubWrap'+i).innerHTML=buildSearchableSelect('wiSub'+i,NEW_TAXONOMY[value]||[],'',null);
  }

  async function confirmWordImport(){
    if(!ready){alert('سجّل الدخول أولًا لاستيراد القضايا سحابيًا.');return}
    const btn=element('btnConfirmWordImport');
    if(btn){btn.disabled=true;btn.textContent='جارٍ الاستيراد... ☁️';}
    setSync('جارٍ استيراد قضايا Word ☁️');

    const rows=root.querySelectorAll('#reportModalBox tr[data-row]');
    let imported=0,skipped=0;
    const now=new Date().toISOString();
    for(const tr of rows){
      const i=+tr.dataset.row;
      const p=wordImportPreviewData[i];
      if(!p||p.importRowStatus!=='ok'){skipped++;continue}
      const mainNew=sselValue('wiMain'+i)||'يحتاج إنشاء تصنيف جديد';
      const subNew=sselValue('wiSub'+i)||null;
      const caseStatus=tr.querySelector('.wiStatus').value;
      const progressStatus=tr.querySelector('.wiProgress').value;
      const caseType=caseTypeForSub(subNew)||p.caseType;
      const classified=!!(mainNew&&mainNew!=='يحتاج إنشاء تصنيف جديد'&&subNew);
      const caseObj={
        caseNumber:p.caseNumber,originalText:p.originalText,mainCategory:p.mainCategory,subCategory:p.subCategory,caseType,
        tags:[caseType,caseStatus,p.oathType,p.partyStatus].filter(Boolean),
        confidence:p.confidence,isDeleted:false,caseStatus,
        judgmentResult:p.judgmentResult,judgmentReason:p.judgmentReason,evidenceType:p.evidenceType,
        oathType:p.oathType,partyStatus:p.partyStatus,
        createdAt:now,updatedAt:now,
        main_category_new:mainNew,sub_category_new:subNew,
        procedural_results:p.procedural_results||[],evidence_methods:p.evidence_methods||[],tags_new:[],
        case_progress_status:progressStatus||'',
        legacy_main_category:p.mainCategory,legacy_sub_category:p.subCategory,
        classification_status:classified?'classified':(mainNew==='يحتاج إنشاء تصنيف جديد'?'unclassified':'needs_review'),
        classification_source:'auto',
        hijriYear:p.hijriYear,hijriMonth:p.hijriMonth,hijriMonthNumber:p.hijriMonthNumber,hijriMonthKey:p.hijriMonthKey
      };
      try{
        await saveCase(caseObj);
        records.unshift(caseObj);
        imported++;
      }catch(err){
        console.error('تعذّر استيراد القضية #'+p.caseNumber,err);
        skipped++;
      }
    }

    setSync('تم الحفظ.');
    renderCases();renderTrash();renderTree();
    wordImportPreviewData.length=0;

    const box=element('reportModalBox');
    box.innerHTML='<h3 style="color:var(--g);margin-top:0">تقرير استيراد Word</h3>'+
      '<div class="grid" style="margin:16px 0">'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--mint-dark);font-weight:700">'+imported+'</div><div style="font-size:12px;color:var(--muted)">قضية مستوردة بنجاح</div></div>'+
        '<div class="card" style="margin:0"><div style="font-size:26px;color:var(--muted);font-weight:700">'+skipped+'</div><div style="font-size:12px;color:var(--muted)">تم تجاهلها</div></div>'+
      '</div>'+
      '<div style="text-align:left"><button class="btn btn-primary" data-diwan-click="closeReport">إغلاق</button></div>';
  }

  /* ============================= إضافة شهر الأرشفة الهجري للقضايا القديمة (ترحيل آمن، معاينة إلزامية) ============================= */
  let hijriMigrationPreviewData=[];
  /* ============================= سجل تدقيق تغييرات التصنيف (classificationAuditLog) ============================= */
  let auditLogCache=[]; // آخر السجلات المحمَّلة محليًا لعرضها في صفحة المراجعة
  async function writeAuditLogEntry(e){
    const entry={
      caseNumber:e.caseNumber,
      oldMainCategoryNew:e.oldMain||null,oldSubCategoryNew:e.oldSub||null,
      newMainCategoryNew:e.newMain||null,newSubCategoryNew:e.newSub||null,
      proceduralResultsAfter:e.proceduralResultsAfter||[],evidenceMethodsAfter:e.evidenceMethodsAfter||[],
      reason:e.reason||'',source:e.source||'manual', // 'manual' | 'suggestion_accepted' | 'bulk_accepted'
      confidence:e.confidence||null,
      changedAt:new Date().toISOString()
    };
    try{
      if(saveAudit)await saveAudit(entry);
      auditLogCache.unshift(entry);
    }catch(err){console.error('تعذّر كتابة سجل التدقيق (لن يمنع حفظ القضية نفسها):',err);}
  }

  let hijriAutoMigrationRunning=false;
  /* نسخة صامتة تلقائية من ترحيل الشهر الهجري — تعمل مرة واحدة كلما وُجدت قضايا ناقصة الحقول الهجرية،
     بلا حاجة لأي إجراء يدوي من المستخدم. تستخدم نفس القاعدة الآمنة: حساب الشهر من createdAt الفعلي
     لكل قضية، ولا تغيّر أي حقل آخر إطلاقًا. */
  async function runHijriMigrationSilently(){
    if(hijriAutoMigrationRunning||!ready)return;
    const targets=records.filter(r=>!r.isDeleted&&!r.hijriMonthKey&&r.createdAt);
    if(!targets.length)return;
    hijriAutoMigrationRunning=true;
    for(const r of targets){
      const h=gregorianToHijri(new Date(r.createdAt));
      const patch={hijriYear:h.hijriYear,hijriMonth:h.hijriMonth,hijriMonthNumber:h.hijriMonthNumber,hijriMonthKey:h.hijriMonthKey};
      try{
        await updateCase(r.caseNumber,patch);
        Object.assign(r,patch);
      }catch(err){console.error('تعذّر الترحيل التلقائي للشهر الهجري للقضية #'+r.caseNumber,err);}
    }
    hijriAutoMigrationRunning=false;
    if(typeof renderCases==='function')renderCases();
    if(typeof renderDashboard==='function')renderDashboard();
    if(typeof renderTree==='function')renderTree();
  }

  /* ============================= تحليل نظام التصنيف الجديد (قراءة فقط — مرحلة تحليل، لا تُنفَّذ أي كتابة على Firestore هنا إطلاقًا) =============================
     جدول Mapping هذا مطابق برمجيًا 1:1 لكل تصنيف قديم موجود فعليًا في محرك التصنيف الحالي (CATS) —
     تم التحقق من هذا التطابق آليًا (95 من 95، بلا نقص ولا زيادة) قبل تسليم هذا الملف. */

  const NEW_TAXONOMY={
  "العقود وأحكامها العامة":["إثبات وجود عقد","نفي وجود عقد","انعقاد العقد","عدم انعقاد العقد","الوعد بالتعاقد","الإخلال بالوعد بالتعاقد","العربون","استرداد العربون","التفاوض بسوء نية","عقد الإذعان","الشرط التعسفي","تفسير العقد","تحديد مضمون العقد","تنفيذ العقد","الامتناع عن تنفيذ العقد","التنفيذ العيني","فسخ العقد","الفسخ الاتفاقي","الانفساخ لاستحالة التنفيذ","الإقالة","بطلان العقد","إبطال العقد","إبطال العقد لنقص الأهلية","الإبطال للغلط","الإبطال للتغرير","الإبطال للإكراه","الإبطال للاستغلال","الغبن في الحالات النظامية","بطلان شرط مع بقاء العقد","عدم مشروعية محل العقد","عدم مشروعية سبب العقد","عدم نفاذ التصرف","إجازة العقد أو التصرف","آثار العقد في الخلف العام","آثار العقد في الخلف الخاص","التعهد عن الغير","الاشتراط لمصلحة الغير","الظروف الاستثنائية","إعادة التوازن العقدي","التعويض عن الإخلال بالعقد","عقد غير مسمى","النزاع في وصف العقد","النزاع في تكييف العقد"],
  "البيع والمبيع":["المطالبة بالثمن","المطالبة بباقي الثمن","رد الثمن","تسليم المبيع","الامتناع عن تسليم المبيع","نقل ملكية المبيع","فسخ البيع","إبطال البيع","بطلان البيع","بيع ملك الغير","عدم نفاذ بيع ملك الغير","إجازة بيع ملك الغير","استحقاق المبيع للغير","ضمان الاستحقاق","ضمان العيب","العيب الخفي","نقص المبيع","زيادة المبيع","اختلاف مساحة المبيع","اختلاف مقدار المبيع","إنقاص الثمن","إكمال الثمن","رد المبيع","البيع بالعينة","عدم مطابقة العينة","البيع بشرط التجربة","البيع بالتقسيط","الثمن المؤجل","بيع حق متنازع فيه","بيع الجزاف","النزاع في وصف المبيع","هلاك المبيع قبل التسليم","مصروفات البيع","إخلال البائع بالتزاماته","إخلال المشتري بالتزاماته","التعويض الناشئ عن البيع"],
  "المقايضة":["إثبات المقايضة","تنفيذ المقايضة","تسليم أحد البدلين","فسخ المقايضة","إبطال المقايضة","ضمان الاستحقاق","ضمان العيب","الفرق النقدي بين البدلين","التعويض الناشئ عن المقايضة"],
  "الهبة والتبرعات":["إثبات الهبة","تسليم الموهوب","الرجوع في الهبة","استرداد الهبة","بطلان الهبة","إبطال الهبة","هبة مشروطة","الإخلال بشرط الهبة","هلاك الموهوب","التعويض الناشئ عن الهبة","النزاع في وصف التصرف هل هو هبة أو بيع","التصرف في مرض الموت في الحدود الداخلة في الاختصاص","التصرف مع الاحتفاظ بالحيازة أو الانتفاع"],
  "القروض والديون":["إثبات قرض","نفي القرض","المطالبة برد قرض","المطالبة بباقي قرض","قرض نقدي","قرض عيني","إثبات سداد الدين","نفي سداد الدين","السداد الجزئي","تحديد أجل الوفاء","قرض غير محدد الأجل","رد مثل المقترض","رد قيمة المقترض","النزاع في مقدار القرض","النزاع في وصف المبلغ هل هو قرض أو شراكة","النزاع في وصف المبلغ هل هو قرض أو هبة","النزاع في وصف المبلغ","دين ناشئ عن حوالة مالية","دين ناشئ عن تسليم نقدي","دين ناشئ عن حساب بين الطرفين","مطالبة بدين مدني","المطالبة بباقي الدين","براءة الذمة من الدين"],
  "الصلح والتنازل والإسقاط":["إثبات الصلح","تنفيذ الصلح","الإخلال بالصلح","تفسير عقد الصلح","صلح على جزء من الحق","صلح مع الإنكار","صلح مع الإقرار","صلح على تأجيل الدين","صلح على تعجيل الدين مع الحط","بطلان الصلح","إبطال الصلح","إثبات التنازل عن الحق","إثبات إسقاط الحق","النزاع في نطاق التنازل","النزاع في نطاق الصلح","الرجوع عن التنازل متى كان محلًا للنزاع"],
  "الإيجار":["إثبات عقد الإيجار","المطالبة بالأجرة","المطالبة بباقي الأجرة","أجرة مدة إضافية","أجرة المثل","تحديد مقدار الأجرة","تحديد مدة الإيجار","تجدد عقد الإيجار","عدم تجدد عقد الإيجار","فسخ عقد الإيجار","إنهاء عقد الإيجار","إخلاء المأجور","تسليم المأجور","رد المأجور","تأخر المؤجر في التسليم","عدم الانتفاع بالمأجور","نقص المنفعة","العيب في المأجور","صيانة المأجور","إلزام المؤجر بالإصلاح","إصلاح المستأجر والرجوع بالمصروفات","تلفيات المأجور","التعويض عن تلف المأجور","التغييرات التي أحدثها المستأجر","إعادة المأجور إلى حالته","التنازل عن الإيجار","التأجير من الباطن","اعتراض المؤجر على التنازل أو التأجير من الباطن","بيع العين المؤجرة","إيجار الأراضي","إيجار المنقول","إيجار المركبة","إيجار المعدات","إيجار منفعة","إيجار حق","التعويض الناشئ عن عقد الإيجار"],
  "الإعارة":["إثبات الإعارة","رد العين المعارة","الامتناع عن رد العين المعارة","تلف العين المعارة","هلاك العين المعارة","استعمال العين في غير ما أعدت له","تجاوز حدود الإذن","مصروفات العين المعارة","انتهاء الإعارة","التعويض الناشئ عن الإعارة"],
  "الوديعة والأمانات":["إثبات الوديعة","رد الوديعة","الامتناع عن رد الوديعة","هلاك الوديعة","تلف الوديعة","استعمال الوديعة دون إذن","نقل حفظ الوديعة إلى الغير","مصروفات حفظ الوديعة","أجرة الإيداع","التعويض عن إخلال المودع لديه","أموال مسلمة على سبيل الأمانة","مقتنيات مسلمة على سبيل الأمانة","مطالبة برد أمانة"],
  "الحراسة":["فرض الحراسة","تعيين الحارس","إنهاء الحراسة","تسليم المال للحارس","رد المال بعد انتهاء الحراسة","غلة المال محل الحراسة","حساب الحارس","أجرة الحارس","مسؤولية الحارس","تجاوز الحارس سلطته","إدارة المال محل الحراسة","استبدال الحارس"],
  "المقاولات والإنشاءات":["المطالبة بأجرة المقاولة","المطالبة بباقي قيمة المقاولة","تنفيذ العمل","إكمال العمل","فسخ عقد المقاولة","إنهاء عقد المقاولة","عيوب التنفيذ","عدم مطابقة المواصفات","إصلاح العيوب","إعادة تنفيذ الأعمال","تأخر المقاول","تعويض التأخير","تلف المواد","مواد قدمها المقاول","مواد قدمها صاحب العمل","الأعمال الإضافية","زيادة الأعمال","اختلاف المقايسة","تجاوز المقايسة","عقد مقاولة بسعر إجمالي","المطالبة بزيادة الأجر","أجر المثل","استلام العمل","الامتناع عن استلام العمل","ضمان الأعمال","المقاولة من الباطن","مطالبة المقاول من الباطن","رجوع صاحب العمل على المقاول","توقف المقاول عن العمل","الظروف الاستثنائية في المقاولة","إعادة التوازن المالي للمقاولة","فسخ المقاولة بسبب الظروف الاستثنائية","التعويض عن سوء التنفيذ"],
  "الخدمات والأعمال المهنية":["عقد تقديم خدمة","المطالبة بمقابل خدمة","خدمة لم تنفذ","خدمة نفذت جزئيًا","خدمة معيبة","فسخ عقد خدمة","استرداد مقابل خدمة","التعويض عن إخلال مقدم الخدمة","أعمال التصميم","تصميم هندسي","تصميم معماري","تصميم داخلي","برمجة","تطوير موقع","تطوير نظام","صيانة","إصلاح","تركيب","نقل","تخزين","دعاية وإعلان","تصوير","استشارات","تدريب","وساطة","سمسرة في الحدود الداخلة في الاختصاص","خدمات إلكترونية","خدمات مهنية أخرى"],
  "الوكالة والنيابة في التعاقد":["إثبات الوكالة","تجاوز حدود الوكالة","تصرف الوكيل دون صلاحية","إجازة تصرف الوكيل","عدم نفاذ تصرف الوكيل","المطالبة بأجرة الوكيل","المطالبة بمصروفات الوكيل","مطالبة الوكيل بمبالغ تسلمها","إلزام الوكيل بتقديم الحساب","إخلال الوكيل بواجب العناية","شراء الوكيل لنفسه","بيع الوكيل لنفسه","تصرف الوكيل لمصلحة قريبه","بيع الوكيل بأقل من الثمن المحدد","شراء الوكيل بأكثر من الثمن المحدد","البيع المؤجل من الوكيل","انتهاء الوكالة","عزل الوكيل","اعتزال الوكيل","التعويض عن تصرف الوكيل"],
  "الشركات المدنية والمشاركة":["إثبات الشركة","بطلان الشركة المدنية","حصة الشريك","عدم تقديم الحصة","إدارة الشركة","تجاوز المدير","أرباح الشركة","خسائر الشركة","محاسبة الشريك","تقديم حساب عن الشركة","مسؤولية الشركاء عن الدين","انسحاب الشريك","إخراج الشريك","انتهاء الشركة","تصفية الشركة","تعيين مصف","قسمة أموال الشركة","بيع حصة الشريك","النزاع في نسبة الشراكة","استرداد رأس المال","التعويض الناشئ عن الشراكة"],
  "المضاربة":["إثبات المضاربة","رأس مال المضاربة","أرباح المضاربة","خسائر المضاربة","تعدي المضارب","تقصير المضارب","ضمان المضارب بسبب التعدي أو التقصير","خلط أموال المضاربة","تسليم المال للغير مضاربة","مخالفة قيود المضاربة","تقديم حساب المضاربة","إنهاء المضاربة","انسحاب أحد الطرفين","رد رأس المال","تصفية المضاربة","التعويض"],
  "المشاركة في الناتج والمزارعة والمساقاة":["المشاركة في الناتج","توزيع الناتج","مصروفات الأصل","رد الأصل","فسخ المشاركة","إنهاء المشاركة","المزارعة","المساقاة","نصيب المالك","نصيب العامل","البذر والغراس","نفقات الزراعة","انتهاء العقد قبل الحصاد","أجر مثل العامل","التعويض عن الإخلال"],
  "الكفالة والضمان":["إثبات الكفالة","مطالبة الكفيل","براءة الكفيل","انتهاء الكفالة","رجوع الكفيل على المدين","تعدد الكفلاء","كفالة جزء من الدين","كفالة دين مستقبل","كفالة دين مشروط","الوفاء من الكفيل","تمديد أجل الدين وأثره على الكفيل","انتقال الدين المكفول","الضمان الشخصي","التعويض المرتبط بالكفالة أو الضمان"],
  "التأمين":["استحقاق مبلغ التأمين","رفض التغطية التأمينية","تفسير التغطية","استثناءات الوثيقة","تعويض التأمين","رجوع شركة التأمين","التأمين على المركبات","التأمين على الممتلكات","تأمين المسؤولية","إلغاء وثيقة التأمين","استرداد قسط التأمين"],
  "المسؤولية المدنية والتعويض":["تعويض عن ضرر مادي","تعويض عن ضرر معنوي","خسارة محققة","فوات كسب","تفويت منفعة","إتلاف مال","تلف منقول","تلف عقار","إصابة جسدية","وفاة","مسؤولية عن فعل شخصي","مسؤولية المتبوع عن التابع","مسؤولية متولي الرقابة","مسؤولية عن الأشياء","مسؤولية عن البناء","مسؤولية عن الحيوان","تعدد المسؤولين","اشتراك المتضرر في الخطأ","السبب الأجنبي","القوة القاهرة","فعل الغير","خطأ المتضرر","التعويض العيني","التعويض النقدي","تقدير التعويض","التعويض عن الضرر المستقبلي","التعويض عن إساءة استعمال الحق","التعويض عن التفاوض بسوء نية","تعويض عقدي","تعويض غير عقدي","رجوع من أدى التعويض على المسؤول"],
  "المركبات والحوادث المرورية":["تعويض حادث مروري","تلفيات مركبة","نقص قيمة المركبة","تكلفة إصلاح مركبة","أجرة سطحة أو نقل","فوات منفعة المركبة","أجرة مركبة بديلة","النزاع في نسبة الخطأ","رجوع شركة التأمين","بيع مركبة معيبة","عيب خفي في مركبة","اختلاف عداد المركبة","التلاعب بعداد المركبة","تغيير الهيكل","وجود حادث سابق","فسخ بيع مركبة","رد ثمن مركبة","نقل ملكية مركبة","الامتناع عن نقل ملكية مركبة","استرداد حيازة مركبة","استعمال مركبة دون إذن","إيجار مركبة","أجرة مثل مركبة","إصلاح مركبة","نزاع مع ورشة","صيانة مركبة","قطع غيار","مخالفات مرورية مرتبطة باستعمال المركبة أو التصرف فيها متى انعقد الاختصاص"],
  "الإثراء بلا سبب ودفع غير المستحق":["استرداد مبلغ دفع خطأ","استرداد حوالة خاطئة","استرداد مبلغ غير مستحق","استرداد مبلغ زال سبب استحقاقه","إثراء على حساب الغير","استرداد منفعة دون سبب","رد ما قبض دون سند","الوفاء بدين غير موجود","الوفاء بدين منقضٍ","التعويض بقدر الإثراء"],
  "الفضالة":["القيام بشأن عاجل لحساب الغير دون تكليف","رد مصروفات الفضولي","أجر الفضولي","تعويض الفضولي","مسؤولية الفضولي","إقرار رب العمل لتصرف الفضولي","التزامات رب العمل تجاه الفضولي"],
  "الالتزام بالإرادة المنفردة والوعد بجائزة":["المطالبة بالجائزة","استحقاق الجائزة","الرجوع عن الوعد بالجائزة","تعدد من قام بالعمل","سقوط المطالبة بالجائزة","التزام بإرادة منفردة آخر"],
  "تنفيذ الالتزامات والوفاء":["إلزام بأداء مبلغ","إلزام بتنفيذ عمل","إلزام بالامتناع عن عمل","التنفيذ العيني","التعويض بدل التنفيذ","التأخر في التنفيذ","الإعذار","الوفاء بالدين","إثبات الوفاء","الوفاء الجزئي","رفض الدائن استلام الوفاء","تحديد من يصح منه الوفاء","تحديد من يستحق استلام الوفاء","مكان الوفاء","زمن الوفاء","الأجل القضائي للوفاء","الوفاء البديل","خصم المدفوعات من عدة ديون","استرداد سند الدين بعد الوفاء"],
  "أوصاف الالتزام وتعدد أطرافه":["الالتزام المعلق على شرط","الشرط الواقف","الشرط الفاسخ","الالتزام المضاف إلى أجل","سقوط الأجل","تعدد محل الالتزام","الالتزام التخييري","الالتزام البدلي","تعدد الدائنين","تعدد المدينين","التضامن بين المدينين","التضامن بين الدائنين","الدين المشترك","عدم قابلية الالتزام للانقسام","رجوع المدين المتضامن على الباقين"],
  "انتقال الحقوق والديون":["حوالة الحق","نفاذ حوالة الحق","ضمان المحيل","دفوع المدين تجاه المحال له","تعدد حوالات الحق","حوالة الدين","موافقة الدائن على حوالة الدين","انتقال ضمانات الدين","انتقال الدين مع الكفالة","حوالة العقد أو المركز التعاقدي متى كان لها محل"],
  "انقضاء الالتزام":["الوفاء","الوفاء البديل","المقاصة","المقاصة القضائية","المقاصة الاتفاقية","اتحاد الذمة","الإبراء","استحالة التنفيذ","انقضاء الالتزام دون وفاء","عدم سماع الدعوى لمرور الزمن","وقف مدة عدم السماع","انقطاع مدة عدم السماع","الإقرار بالحق وأثره في المدة"],
  "العقارات والملكية":["إثبات ملكية عقار","نفي ملكية عقار","نقل ملكية عقار","إفراغ عقار","إلزام بالإفراغ","الامتناع عن الإفراغ","رد ثمن عقار","فسخ بيع عقار","بيع عقار غير مملوك","بطلان تصرف عقاري","عدم نفاذ تصرف عقاري","النزاع على صك ملكية","النزاع على سند ملكية","عدم وجود صك","نزاع في حدود العقار","نزاع في مساحة العقار","تداخل عقارين","إزالة تعدٍ على عقار","رفع يد عن عقار","منع التعرض للملكية","تسليم عقار","إخلاء عقار على أساس حق موضوعي","ثمار العقار وغلاته","أجرة مثل الانتفاع بعقار","بناء في أرض الغير","غراس في أرض الغير","الالتصاق","هدم منشآت","إزالة منشآت","مصروفات ضرورية على العقار","مصروفات نافعة على العقار","ملكية الوحدات العقارية","الأجزاء المشتركة","حقوق الملاك في العقار المشترك"],
  "الملكية الشائعة والقسمة":["إثبات حصة شائعة","إدارة المال الشائع","الانتفاع بالمال الشائع","تصرف الشريك في حصته","تصرف الشريك في جزء مفرز","نفقات المال الشائع","المهايأة المكانية","المهايأة الزمنية","إنهاء الشيوع","القسمة الرضائية","القسمة القضائية","قسمة العين","بيع المال الشائع عند تعذر القسمة","الاعتراض على القسمة","قسمة منافع المال الشائع"],
  "أسباب كسب الملكية والالتصاق":["إحراز المباح","انتقال الملكية بالعقد","انتقال الملكية بالإرث في الحدود الداخلة في الاختصاص","انتقال الملكية بالوصية في الحدود الداخلة في الاختصاص","الالتصاق الطبيعي","بناء المالك بمواد الغير","البناء في أرض الغير بحسن نية","البناء في أرض الغير بسوء نية","الغراس في أرض الغير","اشتراط التسجيل لانتقال الملكية","النزاع في وقت انتقال الملكية"],
  "الشفعة":["ثبوت الشفعة","نفي الشفعة","سقوط الشفعة","التنازل عن الشفعة","فوات مهلة الشفعة","عدم سماع دعوى الشفعة","إيداع الثمن","تعدد الشفعاء","تعدد المشترين","بيع العقار مرة أخرى قبل الأخذ بالشفعة","منشآت المشتري في العقار المشفوع","تصرفات المشتري بعد العلم بالشفعة","آثار الحكم بالشفعة"],
  "الحيازة":["إثبات الحيازة","استرداد الحيازة موضوعيًا","منازعة في حيازة منقول","قرينة حيازة المنقول","حسن نية الحائز","سوء نية الحائز","ثمار الشيء المحوز","مصروفات الحائز الضرورية","مصروفات الحائز النافعة","مصروفات الحائز الكمالية","مسؤولية الحائز عن الهلاك","مسؤولية الحائز عن التلف","رد المال إلى مالكه"],
  "الانتفاع والاستعمال والسكنى والارتفاق":["إثبات حق الانتفاع","إنهاء حق الانتفاع","استعمال المنتفع للعين","غلة العين محل الانتفاع","مصروفات المنتفع","تلف العين محل الانتفاع","حق الاستعمال","حق السكنى","إثبات حق الارتفاق","نفي حق الارتفاق","حق ممر","حق مجرى","حق مسيل","حق شرب","مرور المرافق","استعمال حق الارتفاق","صيانة محل الارتفاق","تعديل موضع الارتفاق","إنهاء حق الارتفاق"],
  "الرهن والحقوق العينية التبعية وحقوق الامتياز":["إثبات الرهن","بطلان الرهن","انقضاء الرهن","فك الرهن","أولوية الدائن المرتهن","النزاع في المال المرهون","حق الامتياز","أولوية صاحب الامتياز","تزاحم الحقوق العينية التبعية"],
  "الاتصالات والخدمات الرقمية":["فاتورة اتصالات","مديونية جوال","أجهزة بالتقسيط","شرائح اتصال","باقات","إلغاء خدمة","استمرار الفوترة بعد الإلغاء","خدمة لم تقدم","اعتراض على فاتورة","إثبات تعاقد إلكتروني","استخدام غير مصرح به","تعويض عن انقطاع الخدمة","استرداد مبلغ","أجهزة مرتبطة بعقد الخدمة","خدمات رقمية أخرى"],
  "الكهرباء والمياه والمرافق":["قيمة استهلاك","فاتورة متنازع عليها","عداد","نقل عداد","نقل ملكية عداد","توصيل خدمة","فصل خدمة","إعادة خدمة","رسوم التوصيل","تكاليف التوصيل","استهلاك غير مشروع","تلف أجهزة بسبب الخدمة","تعويض عن انقطاع الخدمة","تعويض عن خلل في الخدمة","مديونية سابقة على المالك أو المستفيد","استرداد مبلغ"],
  "أتعاب المحاماة والخبرة والمهن":["أتعاب محاماة باتفاق","أتعاب محاماة دون اتفاق","باقي أتعاب محاماة","استرداد أتعاب محاماة","فسخ اتفاق أتعاب","أتعاب مرحلة من مراحل القضية","مصروفات المحامي","التعويض عن إخلال المحامي","أتعاب خبير","تحميل أتعاب الخبرة","استرداد أتعاب الخبرة","أتعاب تقييم","أتعاب هندسية","أتعاب محاسبة","أتعاب خدمات مهنية"],
  "الأشخاص والأهلية والتمثيل المدني":["انعدام الأهلية","نقص الأهلية","تصرف ناقص الأهلية","إبطال تصرف ناقص الأهلية","النيابة النظامية","تجاوز النائب حدود النيابة","النزاع في صحة التمثيل","موطن الشخص","موطن العمل","الشخص الاعتباري في الحدود الداخلة في اختصاص المحكمة","مسائل الغائب أو المفقود المدنية في الحدود الداخلة في الاختصاص"],
  "القضاء المستعجل":["معاينة لإثبات الحالة","استرداد الحيازة المستعجل","منع التعرض للحيازة","وقف الأعمال الجديدة","منع من السفر","الحراسة القضائية","أجرة الأجير اليومية","طلب مستعجل مقرر بنظام خاص","إجراء تحفظي مستعجل","طلب مستعجل آخر مقرر نظامًا"],
  };
  const PROCEDURAL_RESULTS=["عدم الاختصاص الدولي","عدم الاختصاص الولائي","عدم الاختصاص النوعي","عدم الاختصاص المكاني","عدم الاختصاص القيمي","الإحالة للمحكمة المختصة","الإحالة لقيام نزاع سابق","الإحالة للارتباط","ضم الدعاوى","رفض الإحالة","عدم قبول الدعوى لانعدام صفة المدعي","عدم قبول الدعوى لانعدام صفة المدعى عليه","عدم قبول الدعوى لانعدام الأهلية","عدم قبول الدعوى لانعدام المصلحة","عدم قبول الدعوى لسبب إجرائي آخر","عدم قبول الطلب العارض عند انتفاء المصلحة","عدم قبول الدفع عند انتفاء المصلحة","عدم جواز نظر الدعوى لسبق الفصل فيها","حجية الحكم السابق","حجية الأمر المقضي","وجود دعوى سابقة مرتبطة","الدفع بوجود شرط تحكيم","الدفع باتفاق تحكيم","رفض الدفع بالتحكيم","التنازل عن التمسك بشرط التحكيم","الدعوى السابقة لأوانها لعدم حلول الأجل","الدعوى السابقة لأوانها لعدم تحقق الشرط","عدم استكمال إجراء سابق لازم","عدم تحقق شرط سابق لرفع الدعوى","عدم تحرير الدعوى","طلب تحرير الدعوى","غموض الطلبات","نقص بيانات الصحيفة","بطلان صحيفة الدعوى","تصحيح صحيفة الدعوى","تعديل صحيفة الدعوى","التبليغ للشخص","التبليغ الإلكتروني","التبليغ النظامي","تعذر التبليغ","بطلان التبليغ","إعادة التبليغ","عدم ثبوت التبليغ","ثبوت التبليغ","غياب المدعي","غياب المدعى عليه","غياب الطرفين","السير في الدعوى في غيبة المدعى عليه","الحكم الحضوري حكمًا بحسب الحالة","طلب إعادة التبليغ","شطب الدعوى","السير بعد الشطب","عدم السير بعد الشطب","اعتبار الدعوى كأن لم تكن متى انطبق النظام","طلب ترك الخصومة","قبول ترك الخصومة","عدم قبول ترك الخصومة","ترك إجراء من إجراءات الخصومة","التنازل عن إجراء","التنازل عن دليل","التنازل عن طلب عارض","وقف السير باتفاق الخصوم","الوقف التعليقي","وقف السير لحين الفصل في مسألة أخرى","وقف السير لحين الفصل في دعوى أخرى","انتهاء وقف السير","استئناف السير بعد الوقف","رفض طلب الوقف","انقطاع الخصومة بوفاة الخصم","انقطاع الخصومة بفقد الأهلية","انقطاع الخصومة بزوال صفة النائب","استئناف السير بعد الانقطاع","تبليغ الخلف","استمرار نظر الدعوى في مواجهة الخلف","إدخال خصم بطلب أحد الأطراف","الإدخال بأمر المحكمة","إضافة مدعى عليه","إدخال صاحب الصفة","رفض طلب الإدخال","عدم قبول الإدخال","تدخل انضمامي","تدخل هجومي","قبول التدخل","رفض التدخل","عدم قبول التدخل","تصحيح اسم الخصم","تصحيح صفة الخصم","استبدال الخصم","إضافة صاحب الصفة","استمرار الخصومة في مواجهة الخلف","تصحيح الطلب الأصلي","تعديل الطلب","طلب مكمل","طلب مترتب على الطلب الأصلي","تغيير سبب الدعوى مع بقاء الطلب","طلب وقتي","طلب تحفظي","عدم قبول الطلب العارض","طلب مقابل","مقاصة قضائية","طلب مقابل يؤدي لرفض دعوى المدعي كليًا","طلب مقابل يؤدي لرفض دعوى المدعي جزئيًا","طلب تعويض عن الدعوى","طلب تعويض عن إجراء فيها","صحة الوكالة","عدم ثبوت الوكالة","قصور الوكالة","انتهاء الوكالة","عزل الوكيل","اعتزال الوكيل","صحة تمثيل الشخص الاعتباري","عدم صحة التمثيل","عدم صلاحية القاضي","تنحي القاضي","طلب رد القاضي","قبول طلب رد القاضي","رفض طلب رد القاضي","عدم قبول طلب رد القاضي","استئناف السير بعد الفصل في طلب الرد","فتح باب المرافعة","إعادة فتح باب المرافعة","قفل باب المرافعة","حجز القضية للحكم","منح مهلة","رفض طلب المهلة","تمكين الخصم من الرد","انتهاء مهلة الرد","الاكتفاء بما قُدِّم","ندب خبير","تعيين خبير","تحديد مهمة الخبير","إيداع أتعاب الخبرة","عدم إيداع أتعاب الخبرة","رد الخبير","الاعتراض على الخبير","الاعتراض على تقرير الخبير","استكمال تقرير الخبير","خبرة إضافية","ندب خبير آخر","الأخذ بتقرير الخبير","عدم الأخذ بتقرير الخبير","طلب معاينة","الأمر بالمعاينة","إجراء المعاينة","رفض طلب المعاينة","إثبات الحالة (إجراء)","طلب توجيه يمين حاسمة","توجيه اليمين الحاسمة","قبول توجيه اليمين","رد اليمين","أداء اليمين الحاسمة","النكول عن اليمين الحاسمة","الامتناع عن اليمين الحاسمة","الرجوع عن توجيه اليمين قبل قبولها","طلب يمين متممة","توجيه اليمين المتممة","أداء اليمين المتممة","الامتناع عن اليمين المتممة","قبول الطلب المستعجل","رفض الطلب المستعجل","عدم قبول الطلب المستعجل","انتفاء الاستعجال","الإجراء التحفظي","رفع الإجراء التحفظي","تعديل الإجراء التحفظي","منع من السفر","رفع المنع من السفر","استرداد الحيازة (مستعجل)","منع التعرض للحيازة","وقف الأعمال الجديدة","إثبات الحالة (مستعجل)","الحراسة القضائية","حكم في الموضوع","إجابة الدعوى كليًا","إجابة الدعوى جزئيًا","رفض الدعوى موضوعيًا","عدم قبول الدعوى (حكم)","عدم سماع الدعوى","عدم جواز نظر الدعوى (حكم)","الحكم بعدم الاختصاص","إثبات صلح (حكم)","إثبات تنازل (حكم)","إثبات ترك الخصومة (حكم)","حكم جزئي","حكم وقتي","حكم مستعجل","حكم نهائي","حكم قابل للاعتراض","النفاذ المعجل","رفض النفاذ المعجل","تصحيح خطأ مادي في الحكم","تصحيح خطأ كتابي في الحكم","تصحيح خطأ حسابي في الحكم","رفض طلب التصحيح","تفسير الحكم","رفض طلب التفسير","الفصل في طلب مغفل","اعتراض بالاستئناف","طلب تدقيق","قبول الاعتراض شكلًا","عدم قبول الاعتراض شكلًا","فوات مدة الاعتراض","تأييد الحكم","تعديل الحكم","إلغاء الحكم","نقض الحكم كليًا","نقض الحكم جزئيًا","إعادة القضية (استئناف)","وقف التنفيذ المعجل","طلب النقض أمام المحكمة العليا","عدم قبول النقض","رفض النقض","قبول النقض","نقض الحكم كليًا أمام المحكمة العليا","نقض الحكم جزئيًا أمام المحكمة العليا","النقض للخطأ في التكييف","النقض للخطأ في الوصف","النقض لعدم الاختصاص","النقض لتشكيل المحكمة غير الصحيح","وقف التنفيذ (نقض)","إعادة القضية (نقض)","تقديم التماس إعادة النظر","قبول الالتماس شكلًا","عدم قبول الالتماس","رفض الالتماس","قبول الالتماس موضوعًا","وقف التنفيذ (التماس)","فوات مدة الالتماس","الالتماس للتزوير","الالتماس لشهادة الزور","الالتماس لظهور أوراق قاطعة","الالتماس للغش","الالتماس للحكم بما لم يُطلب","الالتماس للحكم بأكثر مما طُلب","الالتماس لتناقض المنطوق","الالتماس لعدم التمثيل الصحيح","فوات مدة الاستئناف","فوات مدة النقض","فوات مدة إجراء","سقوط حق إجرائي بفوات المدة","عدم سماع الدعوى لمرور الزمن","عدم سماع الدعوى لمدة نظامية خاصة","عدم سماع دعوى الشفعة","وقف مدة عدم السماع","انقطاع مدة عدم السماع","إيداع أتعاب الخبرة (مصاريف)","عدم إيداع أتعاب الخبرة (مصاريف)","تحميل أحد الأطراف أتعاب الخبرة","توزيع أتعاب الخبرة","استرداد أتعاب الخبرة","الحكم بأتعاب الخبرة","مصاريف الدعوى","وفاة المدعي","وفاة المدعى عليه","فقد أهلية أحد الخصوم","زوال صفة الممثل","إدخال الورثة","إدخال الخلف","استئناف السير بعد تغير حالة الخصم","تعدد المدعين","تعدد المدعى عليهم","فصل الدعوى بالنسبة لأحد الخصوم","استمرار الدعوى بالنسبة للبقية","إضافة مدعى عليه (تعدد)","إيداع مذكرة جوابية","إيداع مذكرة رد","تمكين الخصم من الرد (مذكرات)","عدم الرد في المهلة","تقديم مستندات","منح مهلة لتقديم مستند","قبول مستند متأخر","رفض مستند متأخر"];
  /* التصنيف الرئيسي الأربعون: "الدفوع والنتائج الشكلية" — فروعه المباشرة هي نفس قائمة الردود الشكلية بالضبط،
     يظهر كتصنيف موضوعي عادي قابل للاختيار كبقية الـ39، وليس نافذة أو قسمًا منفصلًا. */
  const FORMAL_DEFENSES_MAIN='الدفوع والنتائج الشكلية';
  /* لا تُربط بكامل PROCEDURAL_RESULTS — فقط الردود الشكلية المحددة (استبعاد صريح: الخبرة، اليمين، المهل،
     التبليغات الروتينية، الاستئناف والنقض الموضوعيان). 60 بندًا منتقاة، كلها موجودة فعليًا ضمن PROCEDURAL_RESULTS. */
  const FORMAL_DEFENSES_SUBCATS=["عدم الاختصاص الدولي","عدم الاختصاص الولائي","عدم الاختصاص النوعي","عدم الاختصاص المكاني","عدم الاختصاص القيمي","الإحالة للمحكمة المختصة","الإحالة لقيام نزاع سابق","الإحالة للارتباط","ضم الدعاوى","رفض الإحالة","عدم قبول الدعوى لانعدام صفة المدعي","عدم قبول الدعوى لانعدام صفة المدعى عليه","عدم قبول الدعوى لانعدام الأهلية","عدم قبول الدعوى لانعدام المصلحة","عدم قبول الدعوى لسبب إجرائي آخر","عدم قبول الطلب العارض عند انتفاء المصلحة","عدم قبول الدفع عند انتفاء المصلحة","عدم جواز نظر الدعوى لسبق الفصل فيها","حجية الحكم السابق","حجية الأمر المقضي","وجود دعوى سابقة مرتبطة","الدفع بوجود شرط تحكيم","الدفع باتفاق تحكيم","رفض الدفع بالتحكيم","التنازل عن التمسك بشرط التحكيم","الدعوى السابقة لأوانها لعدم حلول الأجل","الدعوى السابقة لأوانها لعدم تحقق الشرط","عدم استكمال إجراء سابق لازم","عدم تحقق شرط سابق لرفع الدعوى","عدم تحرير الدعوى","طلب تحرير الدعوى","غموض الطلبات","نقص بيانات الصحيفة","بطلان صحيفة الدعوى","تصحيح صحيفة الدعوى","تعديل صحيفة الدعوى","تعذر التبليغ","بطلان التبليغ","عدم ثبوت التبليغ","شطب الدعوى","السير بعد الشطب","عدم السير بعد الشطب","اعتبار الدعوى كأن لم تكن متى انطبق النظام","طلب ترك الخصومة","قبول ترك الخصومة","عدم قبول ترك الخصومة","ترك إجراء من إجراءات الخصومة","التنازل عن إجراء","التنازل عن دليل","التنازل عن طلب عارض","فوات مدة الاعتراض","فوات مدة الاستئناف","فوات مدة النقض","فوات مدة إجراء","سقوط حق إجرائي بفوات المدة","عدم سماع الدعوى لمرور الزمن","عدم سماع الدعوى لمدة نظامية خاصة","عدم سماع دعوى الشفعة","وقف مدة عدم السماع","انقطاع مدة عدم السماع"];
  NEW_TAXONOMY[FORMAL_DEFENSES_MAIN]=FORMAL_DEFENSES_SUBCATS;
  const NEW_MAIN_CATEGORIES=Object.keys(NEW_TAXONOMY); // مُشتقّة تلقائيًا بعد إضافة التصنيف الأربعين — مصدر واحد للحقيقة
  const CASE_PROGRESS_STATUS=["منظورة","مؤجلة","موقوفة","منقطعة","مشطوبة","متروكة","محجوزة للحكم","صدر فيها حكم","قيد الاعتراض","مؤيدة","منقوضة","معادة من الاستئناف","معادة من المحكمة العليا"];
  const JURISDICTION_OPTIONS=["مختص","عدم الاختصاص الدولي","عدم الاختصاص الولائي","عدم الاختصاص النوعي","عدم الاختصاص المكاني","عدم الاختصاص القيمي","غير محدد"];
  const EVIDENCE_METHODS=["إقرار قضائي","إقرار غير قضائي","تجزئة الإقرار","الرجوع عن الإقرار","استجواب الخصم","امتناع الخصم عن الإجابة","محرر رسمي","محرر عادي","حجية المحرر الرسمي","إنكار الخط","إنكار التوقيع","إنكار الختم","إنكار البصمة","إلزام الخصم بتقديم محرر","الامتناع عن تقديم محرر","تحقيق الخطوط","الادعاء بالتزوير","دعوى تزوير أصلية","استبعاد محرر","دليل رقمي","مراسلات إلكترونية","رسائل جوال","محادثات إلكترونية","تسجيل صوتي","بريد إلكتروني","مستخرجات رقمية","شهادة","اعتراض على شاهد","تعارض الشهادة","شهادة سماعية متى جازت نظامًا","قرائن","عرف","حجية الأمر المقضي","معاينة","خبرة","ندب خبير","تقرير خبير","اعتراض على تقرير خبير","استكمال الخبرة","خبرة إضافية","يمين حاسمة","رد اليمين","أداء اليمين","نكول عن اليمين","يمين متممة","أداء اليمين المتممة","الامتناع عنها"];
  const SUGGESTED_TAGS_NEW=["عقار","أرض","منزل","شقة","عمارة","محل","مزرعة","مركبة","سيارة","تأجير سيارات","حادث مروري","ورشة","صيانة","اتصالات","STC","أجهزة","خدمات رقمية","كهرباء","مياه","مرافق","قرض","حوالة","دين","إيجار","بيع","مقاولة","تصميم","محاماة","خبير","شركة","شراكة","مضاربة","تأمين","جهة حكومية"];

  const MIGRATION_MAPPING=[
  {oldMain:"المركبات والحوادث",oldSub:"حادث مركبة دون تأمين",newMain:"المركبات والحوادث المرورية",newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"لا يوجد فرع جديد مطابق لـ\"دون تأمين\" — يحتاج فرعًا جديدًا."},
  {oldMain:"المركبات والحوادث",oldSub:"تعويض عن حادث مروري",newMain:"المركبات والحوادث المرورية",newSub:"تعويض حادث مروري",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"أرش إصابة في حادث مروري",newMain:"المركبات والحوادث المرورية",newSub:"تعويض حادث مروري",proceduralResult:null,evidenceMethod:null,status:"migrated_medium",note:"يُحفظ \"أرش\" كوسم؛ لا يوجد فرع \"أرش إصابة\" صريح."},
  {oldMain:"المركبات والحوادث",oldSub:"اعتراض على نسبة الخطأ في حادث مروري",newMain:"المركبات والحوادث المرورية",newSub:"النزاع في نسبة الخطأ",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"تلفيات مركبة",newMain:"المركبات والحوادث المرورية",newSub:"تلفيات مركبة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"أجرة زائدة لمركبة",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"لا يوجد فرع \"أجرة زائدة\" صريح؛ قد ينتمي للإيجار أو المركبات."},
  {oldMain:"المركبات والحوادث",oldSub:"أجرة المثل للمركبة",newMain:"المركبات والحوادث المرورية",newSub:"أجرة مثل مركبة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"أجرة مركبة",newMain:"الإيجار",newSub:"إيجار المركبة",proceduralResult:null,evidenceMethod:null,status:"migrated_medium",note:"أُعيد تصنيفها رئيسيًا تحت الإيجار."},
  {oldMain:"المركبات والحوادث",oldSub:"نقل مخالفات المركبة",newMain:"المركبات والحوادث المرورية",newSub:"مخالفات مرورية مرتبطة باستعمال المركبة أو التصرف فيها متى انعقد الاختصاص",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"المركبات والحوادث",oldSub:"مطالبة بقيمة إصلاح مركبة",newMain:"المركبات والحوادث المرورية",newSub:"تكلفة إصلاح مركبة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"عدم صفة قائد المركبة",newMain:"المركبات والحوادث المرورية",newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا صريحًا؛ واقعة موضوعية خاصة بالحادث لا دفعًا إجرائيًا عامًا."},
  {oldMain:"المركبات والحوادث",oldSub:"رد مركبة / استرداد عين مركبة",newMain:"المركبات والحوادث المرورية",newSub:"استرداد حيازة مركبة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المركبات والحوادث",oldSub:"حادث مروري غير محدد",newMain:"المركبات والحوادث المرورية",newSub:"تعويض حادث مروري",proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"fallback عام سابق؛ يُفضَّل مراجعة النص الأصلي."},
  {oldMain:"الشركات والخدمات",oldSub:"أجرة نقل",newMain:"الخدمات والأعمال المهنية",newSub:"نقل",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الشركات والخدمات",oldSub:"محاسبة بين الشركاء",newMain:"الشركات المدنية والمشاركة",newSub:"محاسبة الشريك",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الشركات والخدمات",oldSub:"مستحقات شريك",newMain:"الشركات المدنية والمشاركة",newSub:"حصة الشريك",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"الشركات والخدمات",oldSub:"مطالبة بموجب فواتير",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"fallback عام جدًا — أي نوع فاتورة؟"},
  {oldMain:"الشركات والخدمات",oldSub:"عقد خدمات",newMain:"الخدمات والأعمال المهنية",newSub:"المطالبة بمقابل خدمة",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"الكهرباء",oldSub:"مطالبة بفواتير كهرباء غير مسددة",newMain:"الكهرباء والمياه والمرافق",newSub:"قيمة استهلاك",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الاتصالات",oldSub:"مطالبة بفواتير اتصالات غير مسددة",newMain:"الاتصالات والخدمات الرقمية",newSub:"فاتورة اتصالات",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"رد ثمن العقار لعدم وجود صك ملكية",newMain:"العقارات والملكية",newSub:"رد ثمن عقار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"فسخ عقد بيع عقار ورد الثمن",newMain:"العقارات والملكية",newSub:"فسخ بيع عقار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"فسخ عقد متعلق بعقار غير مملوك للمدعى عليه",newMain:"العقارات والملكية",newSub:"بيع عقار غير مملوك",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"نقل ملكية عقار",newMain:"العقارات والملكية",newSub:"نقل ملكية عقار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"إخلاء عقار",newMain:"العقارات والملكية",newSub:"إخلاء عقار على أساس حق موضوعي",proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"قد يكون سببه إيجاريًا لا ملكيًا."},
  {oldMain:"العقارات والملكية",oldSub:"إلزام بإفراغ جزء من عقار",newMain:"العقارات والملكية",newSub:"إلزام بالإفراغ",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"رفع يد عن عقار متداخل",newMain:"العقارات والملكية",newSub:"رفع يد عن عقار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"إصلاح عقار مستأجر من قبل المؤجر",newMain:"الإيجار",newSub:"إلزام المؤجر بالإصلاح",proceduralResult:null,evidenceMethod:null,status:"migrated_high",note:"أُعيد تصنيفها تحت الإيجار."},
  {oldMain:"العقارات والملكية",oldSub:"مطالبة بنسبة من أرباح عقار",newMain:"العقارات والملكية",newSub:"ثمار العقار وغلاته",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"العقارات والملكية",oldSub:"نزاع على صك ملكية",newMain:"العقارات والملكية",newSub:"النزاع على صك ملكية",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"عدم وجود صك",newMain:"العقارات والملكية",newSub:"عدم وجود صك",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقارات والملكية",oldSub:"إثبات ملكية عقار",newMain:"العقارات والملكية",newSub:"إثبات ملكية عقار",proceduralResult:null,evidenceMethod:null,status:"migrated_high",note:"مثال المستخدم الحرفي."},
  {oldMain:"الإيجار",oldSub:"مطالبة بأجرة متبقية من عقد إيجار",newMain:"الإيجار",newSub:"المطالبة بباقي الأجرة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"أجرة زائدة عن عقد إيجار",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"لا يوجد فرع \"أجرة زائدة\" صريح — يحتاج إضافته."},
  {oldMain:"الإيجار",oldSub:"فسخ وإخلاء",newMain:"الإيجار",newSub:"فسخ عقد الإيجار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"فسخ عقد إيجار",newMain:"الإيجار",newSub:"فسخ عقد الإيجار",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"إخلاء مأجور",newMain:"الإيجار",newSub:"إخلاء المأجور",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"عدم سداد الأجرة",newMain:"الإيجار",newSub:"المطالبة بالأجرة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"أجرة عقار",newMain:"الإيجار",newSub:"المطالبة بالأجرة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الإيجار",oldSub:"مطالبة بأجرة",newMain:"الإيجار",newSub:"المطالبة بالأجرة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"القروض والديون",oldSub:"قرض مع إنكار الاستلام",newMain:"القروض والديون",newSub:"نفي القرض",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"القروض والديون",oldSub:"إقرار بالقرض",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا \"إقرار بالقرض\"."},
  {oldMain:"القروض والديون",oldSub:"إقرار بمديونية",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا \"إقرار بمديونية\"."},
  {oldMain:"القروض والديون",oldSub:"مطالبة برد قرض",newMain:"القروض والديون",newSub:"المطالبة برد قرض",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"القروض والديون",oldSub:"منازعة في سبب المديونية",newMain:"القروض والديون",newSub:"النزاع في وصف المبلغ",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"القروض والديون",oldSub:"إثبات قرض",newMain:"القروض والديون",newSub:"إثبات قرض",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"القروض والديون",oldSub:"سلفة",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا \"سلفة\"."},
  {oldMain:"القروض والديون",oldSub:"سند لأمر",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا \"سند لأمر\"."},
  {oldMain:"القروض والديون",oldSub:"مطالبة بسداد قرض",newMain:"القروض والديون",newSub:"المطالبة برد قرض",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"القروض والديون",oldSub:"مطالبة بدين",newMain:"القروض والديون",newSub:"مطالبة بدين مدني",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"الكفالة والضمان",oldSub:"الحكم على الكفيل الغارم",newMain:"الكفالة والضمان",newSub:"مطالبة الكفيل",proceduralResult:null,evidenceMethod:null,status:"migrated_medium",note:"النتيجة القضائية لا الموضوع."},
  {oldMain:"الكفالة والضمان",oldSub:"رجوع الكفيل على المدين",newMain:"الكفالة والضمان",newSub:"رجوع الكفيل على المدين",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الكفالة والضمان",oldSub:"إنكار الكفالة",newMain:"الكفالة والضمان",newSub:"إثبات الكفالة",proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"\"إنكار\" وصف لموقف الخصم لا للموضوع."},
  {oldMain:"الكفالة والضمان",oldSub:"مطالبة كفيل",newMain:"الكفالة والضمان",newSub:"مطالبة الكفيل",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الكفالة والضمان",oldSub:"ضمان مالي",newMain:"الكفالة والضمان",newSub:"الضمان الشخصي",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"الصلح والتنازل",oldSub:"تنفيذ اتفاق صلح",newMain:"الصلح والتنازل والإسقاط",newSub:"تنفيذ الصلح",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الصلح والتنازل",oldSub:"إثبات صلح",newMain:"الصلح والتنازل والإسقاط",newSub:"إثبات الصلح",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الصلح والتنازل",oldSub:"إثبات تنازل",newMain:"الصلح والتنازل والإسقاط",newSub:"إثبات التنازل عن الحق",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"الصلح والتنازل",oldSub:"تنازل عن الدعوى",newMain:null,newSub:null,proceduralResult:"إثبات ترك الخصومة (حكم)",evidenceMethod:null,status:"needs_review",note:"إجرائي فعليًا؛ الموضوع الحقيقي غير معروف."},
  {oldMain:"الصلح والتنازل",oldSub:"تنازل عن مطالبة",newMain:"الصلح والتنازل والإسقاط",newSub:"إثبات إسقاط الحق",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"الصلح والتنازل",oldSub:"مخالصة",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"يحتاج فرعًا جديدًا \"مخالصة\"."},
  {oldMain:"أتعاب المحاماة والخبرة",oldSub:"رفض أتعاب محاماة",newMain:"أتعاب المحاماة والخبرة والمهن",newSub:"أتعاب محاماة دون اتفاق",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"أتعاب المحاماة والخبرة",oldSub:"نزاع في مقدار الأتعاب",newMain:"أتعاب المحاماة والخبرة والمهن",newSub:"باقي أتعاب محاماة",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"أتعاب المحاماة والخبرة",oldSub:"أتعاب خبير",newMain:"أتعاب المحاماة والخبرة والمهن",newSub:"أتعاب خبير",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"أتعاب المحاماة والخبرة",oldSub:"مطالبة بأتعاب محاماة",newMain:"أتعاب المحاماة والخبرة والمهن",newSub:"أتعاب محاماة باتفاق",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"البيع والمبيع",oldSub:"عيب مبيع",newMain:"البيع والمبيع",newSub:"العيب الخفي",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"البيع والمبيع",oldSub:"مطالبة بثمن مبيع",newMain:"البيع والمبيع",newSub:"المطالبة بالثمن",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"البيع والمبيع",oldSub:"تسليم المبيع",newMain:"البيع والمبيع",newSub:"تسليم المبيع",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"البيع والمبيع",oldSub:"فسخ عقد بيع",newMain:"البيع والمبيع",newSub:"فسخ البيع",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقود والالتزامات",oldSub:"عدم إتمام العقد",newMain:"العقود وأحكامها العامة",newSub:"عدم انعقاد العقد",proceduralResult:null,evidenceMethod:null,status:"migrated_medium"},
  {oldMain:"العقود والالتزامات",oldSub:"عدم تنفيذ العقد",newMain:"العقود وأحكامها العامة",newSub:"الامتناع عن تنفيذ العقد",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقود والالتزامات",oldSub:"فسخ العقد",newMain:"العقود وأحكامها العامة",newSub:"فسخ العقد",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقود والالتزامات",oldSub:"تنفيذ الالتزام",newMain:"تنفيذ الالتزامات والوفاء",newSub:"التنفيذ العيني",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقود والالتزامات",oldSub:"التعويض عن الإخلال بالعقد",newMain:"العقود وأحكامها العامة",newSub:"التعويض عن الإخلال بالعقد",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"العقود والالتزامات",oldSub:"مطالبة مالية ناشئة عن عقد",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"fallback عام جدًا."},
  {oldMain:"المنقولات والودائع",oldSub:"استرداد وديعة",newMain:"الوديعة والأمانات",newSub:"رد الوديعة",proceduralResult:null,evidenceMethod:null,status:"migrated_high"},
  {oldMain:"المنقولات والودائع",oldSub:"استرداد منقول",newMain:"الحيازة",newSub:"استرداد الحيازة موضوعيًا",proceduralResult:null,evidenceMethod:null,status:"needs_review"},
  {oldMain:"المنقولات والودائع",oldSub:"استرداد عين",newMain:"الحيازة",newSub:"استرداد الحيازة موضوعيًا",proceduralResult:null,evidenceMethod:null,status:"needs_review"},
  {oldMain:"الالتزامات المالية",oldSub:"استرداد مبلغ",newMain:"الإثراء بلا سبب ودفع غير المستحق",newSub:"استرداد مبلغ دفع خطأ",proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"ليس كل استرداد مبلغ بالضرورة إثراء بلا سبب."},
  {oldMain:"الالتزامات المالية",oldSub:"رد طلب التعويض المعنوي",newMain:"المسؤولية المدنية والتعويض",newSub:"تعويض عن ضرر معنوي",proceduralResult:"رفض الدعوى موضوعيًا",evidenceMethod:null,status:"needs_review",note:"خلط قديم بين الموضوع والنتيجة."},
  {oldMain:"الالتزامات المالية",oldSub:"مطالبة بتعويض",newMain:"المسؤولية المدنية والتعويض",newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"عام جدًا؛ يحتاج تحديد نوع الضرر."},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"رد الدعوى لعدم سداد رسوم الخبير",newMain:null,newSub:null,proceduralResult:"عدم إيداع أتعاب الخبرة",evidenceMethod:null,status:"needs_review"},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"عدم اختصاص مكاني",newMain:null,newSub:null,proceduralResult:"عدم الاختصاص المكاني",evidenceMethod:null,status:"needs_review",note:"مثال المستخدم الحرفي."},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"سبق الفصل في الدعوى",newMain:null,newSub:null,proceduralResult:"عدم جواز نظر الدعوى لسبق الفصل فيها",evidenceMethod:null,status:"needs_review"},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"رفض التماس إعادة النظر",newMain:null,newSub:null,proceduralResult:"رفض الالتماس",evidenceMethod:null,status:"needs_review"},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"صرف النظر عن دعوى مستعجلة",newMain:"القضاء المستعجل",newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"النتيجة \"صرف النظر\" غير موجودة صراحة — تحتاج إضافة."},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"عدم الاختصاص",newMain:null,newSub:null,proceduralResult:"الحكم بعدم الاختصاص",evidenceMethod:null,status:"needs_review"},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"عدم القبول",newMain:null,newSub:null,proceduralResult:"عدم قبول الدعوى (حكم)",evidenceMethod:null,status:"needs_review"},
  {oldMain:"الدفوع الشكلية والإجرائية",oldSub:"عدم الصفة",newMain:null,newSub:null,proceduralResult:"عدم قبول الدعوى لانعدام صفة المدعي",evidenceMethod:null,status:"needs_review",note:"القديم لا يميز صفة المدعي عن المدعى عليه."},
  {oldMain:"الأيمان والبينة",oldSub:"نكول المدعى عليه بسبب غيابه",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:"نكول عن اليمين",status:"needs_review"},
  {oldMain:"الأيمان والبينة",oldSub:"نكول عن اليمين",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:"نكول عن اليمين",status:"needs_review"},
  {oldMain:"الأيمان والبينة",oldSub:"توجيه اليمين",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:"يمين حاسمة",status:"needs_review",note:"يحتاج تحديد النوع من حقل oathType المحفوظ أصلًا."},
  {oldMain:"الأيمان والبينة",oldSub:"شهادة شاهد",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:"شهادة",status:"needs_review"},
  {oldMain:"الأيمان والبينة",oldSub:"عدم تقديم بينة",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"needs_review",note:"لا توجد قيمة \"عدم تقديم بينة\" في قائمة وسائل الإثبات الجديدة."},
  {oldMain:"غير مصنف بدقة",oldSub:"يحتاج مراجعة يدوية",newMain:null,newSub:null,proceduralResult:null,evidenceMethod:null,status:"not_migrated",note:"يُستبدل مستقبلًا بـ\"يحتاج إنشاء تصنيف جديد\" مع الاحتفاظ الكامل بالـLegacy."},
  ];

  function analyzeNewTaxonomyMigration(){
    const active=records.filter(r=>!r.isDeleted);
    const counts={}; // مفتاح "الرئيسي|||الفرعي" -> عدد القضايا الفعلي
    active.forEach(r=>{
      const key=(r.mainCategory||'')+'|||'+(r.subCategory||'');
      counts[key]=(counts[key]||0)+1;
    });

    const rows=MIGRATION_MAPPING.map(m=>{
      const key=m.oldMain+'|||'+m.oldSub;
      return {...m, caseCount:counts[key]||0};
    });

    // تنبيه إن وُجدت قضايا بتصنيف قديم غير موجود في جدول الجدول (احتياطًا، لا يجب أن يحدث لأن الجدول مطابق 1:1 لمحرك التصنيف الحالي)
    const knownKeys=new Set(MIGRATION_MAPPING.map(m=>m.oldMain+'|||'+m.oldSub));
    const unknownKeys=Object.keys(counts).filter(k=>!knownKeys.has(k));

    const totalCases=active.length;
    const statusTotals={migrated_high:0,migrated_medium:0,needs_review:0,not_migrated:0};
    rows.forEach(r=>{ statusTotals[r.status]=(statusTotals[r.status]||0)+r.caseCount; });

    const box=element('reportModalBox');
    let html2='<h3 style="color:var(--mint-dark);margin-top:0">تقرير تحليل الترحيل للتصنيف الجديد</h3>'+
      '<p style="font-size:12px;color:var(--text-secondary)">مبني بالكامل على بياناتك الفعلية المحمَّلة من Firestore الآن. <b style="color:var(--mint-dark)">لم يُغيَّر أي تصنيف لأي قضية.</b></p>'+
      '<div class="grid" style="margin:16px 0">'+
        '<div class="card" style="margin:0"><div style="font-size:24px;color:var(--mint-dark);font-weight:700">'+totalCases+'</div><div style="font-size:11px;color:var(--text-secondary)">إجمالي القضايا الحالية</div></div>'+
        '<div class="card" style="margin:0"><div style="font-size:24px;color:#187346;font-weight:700">'+statusTotals.migrated_high+'</div><div style="font-size:11px;color:var(--text-secondary)">يمكن ترحيلها آليًا بثقة عالية</div></div>'+
      '</div>'+
      '<div class="grid" style="margin:0 0 16px">'+
        '<div class="card" style="margin:0"><div style="font-size:24px;color:var(--lemon-text);font-weight:700">'+statusTotals.migrated_medium+'</div><div style="font-size:11px;color:var(--text-secondary)">ثقة متوسطة (يُفضَّل تأكيدك)</div></div>'+
        '<div class="card" style="margin:0"><div style="font-size:24px;color:#a1443a;font-weight:700">'+(statusTotals.needs_review+statusTotals.not_migrated)+'</div><div style="font-size:11px;color:var(--text-secondary)">تحتاج مراجعة يدوية (موضوع غير مؤكد)</div></div>'+
      '</div>';

    if(unknownKeys.length){
      html2+='<div class="card" style="border-color:#a1443a"><b style="color:#a1443a">تنبيه:</b> وُجدت قضايا بتصنيف قديم غير مدرج في جدول التحليل الحالي: '+unknownKeys.map(k=>esc(k.replace('|||',' / '))).join('، ')+'</div>';
    }

    html2+='<h4 style="color:var(--mint-dark);margin-top:20px">جدول Mapping التفصيلي (فقط التصنيفات التي لديك قضايا فعلية تحتها)</h4>'+
      '<div style="overflow-x:auto;max-height:45vh;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">'+
      '<thead><tr style="text-align:right;color:var(--text-secondary)"><th style="padding:6px">التصنيف القديم</th><th style="padding:6px">عدد القضايا</th><th style="padding:6px">المقترح الجديد</th><th style="padding:6px">الثقة</th></tr></thead><tbody>';
    rows.filter(r=>r.caseCount>0).sort((a,b)=>b.caseCount-a.caseCount).forEach(r=>{
      const statusLabel={migrated_high:'✅ عالية',migrated_medium:'🟡 متوسطة',needs_review:'🔶 تحتاج مراجعة',not_migrated:'⛔ لم تُرحَّل'}[r.status]||r.status;
      const newLabel=r.proceduralResult?('نتيجة إجرائية: '+esc(r.proceduralResult)):(r.evidenceMethod?('وسيلة إثبات: '+esc(r.evidenceMethod)):(r.newMain?esc(r.newMain)+(r.newSub?' ← '+esc(r.newSub):' ← (يحتاج تحديد فرع)'):'غير محدد بعد'));
      html2+='<tr style="border-top:1px solid var(--border)"><td style="padding:6px">'+esc(r.oldMain)+' ← '+esc(r.oldSub)+'</td><td style="padding:6px;font-weight:700">'+r.caseCount+'</td><td style="padding:6px">'+newLabel+(r.note?'<br><span style="color:var(--text-secondary);font-size:10px">'+esc(r.note)+'</span>':'')+'</td><td style="padding:6px">'+statusLabel+'</td></tr>';
    });
    html2+='</tbody></table></div>'+
      '<p style="font-size:11px;color:var(--text-secondary);margin-top:14px">هذا التقرير للعرض فقط. لا يوجد أي زر تنفيذ ترحيل بعد — بانتظار موافقتك على جدول الـMapping كاملًا.</p>'+
      '<div style="text-align:left;margin-top:12px"><button class="btn btn-primary" data-diwan-click="closeReport">إغلاق</button></div>';

    box.innerHTML=html2;
    openDialog('reportModal');
  }

  function previewHijriMigration(){
    const targets=records.filter(r=>!r.isDeleted&&!r.hijriMonthKey&&r.createdAt);
    hijriMigrationPreviewData.length=0;
    hijriMigrationPreviewData.push(...targets.map(r=>{
      const h=gregorianToHijri(new Date(r.createdAt));
      return{caseNumber:r.caseNumber,createdAt:r.createdAt,...h};
    }));
    const box=element('reportModalBox');
    if(!hijriMigrationPreviewData.length){
      box.innerHTML='<h3 style="color:var(--g);margin-top:0">لا حاجة لأي ترحيل</h3><p style="color:var(--muted)">كل قضاياك لديها بالفعل شهر أرشفة هجري.</p><div style="text-align:left;margin-top:16px"><button class="btn btn-soft" data-diwan-click="closeReport">إغلاق</button></div>';
      openDialog('reportModal');
      return;
    }
    // تجميع حسب الشهر لعرض ملخص واضح
    const byMonth={};
    hijriMigrationPreviewData.forEach(p=>{byMonth[p.hijriMonthKey]=byMonth[p.hijriMonthKey]||{label:p.hijriMonth+' '+p.hijriYear+'هـ',count:0};byMonth[p.hijriMonthKey].count++;});
    let html='<h3 style="color:var(--g);margin-top:0">معاينة إضافة شهر الأرشفة الهجري</h3>'+
      '<p style="font-size:12px;color:var(--muted)">سيُضاف شهر الأرشفة لـ<b style="color:var(--g)"> '+hijriMigrationPreviewData.length+' </b>قضية بناءً على تاريخ إضافتها الفعلي. لن يتغيّر رقم القضية أو وصفها أو تصنيفها أو تاريخ إنشائها.</p>'+
      '<div style="margin-top:10px">'+Object.values(byMonth).map(m=>'<div class="card" style="margin-top:8px;padding:10px 14px;display:flex;justify-content:space-between"><span>'+esc(m.label)+'</span><b>'+m.count+' قضية</b></div>').join('')+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">'+
        '<button class="btn btn-soft" data-diwan-click="closeReport">إلغاء</button>'+
        '<button class="btn btn-primary" data-diwan-click="applyHijriMigration">تأكيد وتنفيذ ☁️</button>'+
      '</div>';
    box.innerHTML=html;
    openDialog('reportModal');
  }
  async function applyHijriMigration(){
    if(!ready){alert('سجّل الدخول أولًا.');return}
    setSync('جارٍ إضافة شهر الأرشفة ☁️');
    let done=0;
    for(const p of hijriMigrationPreviewData){
      const patch={hijriYear:p.hijriYear,hijriMonth:p.hijriMonth,hijriMonthNumber:p.hijriMonthNumber,hijriMonthKey:p.hijriMonthKey};
      try{
        await updateCase(p.caseNumber,patch);
        const local=records.find(r=>String(r.caseNumber)===String(p.caseNumber));
        if(local)Object.assign(local,patch);
        done++;
      }catch(err){console.error('تعذّر ترحيل القضية #'+p.caseNumber,err);}
    }
    setSync('تم الحفظ.');
    renderCases();renderTrash();renderTree();
    hijriMigrationPreviewData.length=0;
    const box=element('reportModalBox');
    box.innerHTML='<h3 style="color:var(--g);margin-top:0">تم إضافة شهر الأرشفة</h3><p><b style="color:var(--mint-dark);font-size:22px">'+done+'</b> قضية أصبح لها الآن شهر أرشفة هجري.</p><div style="text-align:left;margin-top:16px"><button class="btn btn-primary" data-diwan-click="closeReport">إغلاق</button></div>';
  }

  /* ============================= العرض ============================= */
  let activeSubFilter=null; // عند الضغط على تصنيف فرعي من الدليل، أو من لوحة الفلاتر
  let activeMainFilter=null;
  let activeHijriMonthFilter=null; // مفتاح الشهر الهجري "1448-02" أو null لكل الفترات
  let activeCaseStatusFilter=null; // 'نهائية' | 'قابلة للاعتراض' | null
  let activeClassificationStateFilter=null; // 'classified' | 'needs_review' | 'unclassified' | null
  let activeProceduralFilter=null;
  let activeProgressStatusFilter=null;
  let activeJurisdictionFilter=null;

  function hasActiveFilters(){
    return !!(activeSubFilter||activeMainFilter||activeHijriMonthFilter||activeCaseStatusFilter||activeClassificationStateFilter||activeProceduralFilter||activeProgressStatusFilter||activeJurisdictionFilter);
  }
  function clearAllFilters(){
    activeSubFilter=null;activeMainFilter=null;activeHijriMonthFilter=null;activeCaseStatusFilter=null;activeClassificationStateFilter=null;activeProceduralFilter=null;activeProgressStatusFilter=null;activeJurisdictionFilter=null;
    renderFilterPanel();renderCases();updateFilterIndicator();
  }
  function toggleFilterPanel(){
    const el=element('filterPanel');
    const open=el.style.display==='grid';
    element('filterIconBtn').setAttribute('aria-expanded',String(!open));
    if(open){el.style.display='none';return}
    renderFilterPanel();
    el.style.display='grid';
  }
  /* دوال تسمية صريحة لكل فلتر — تُستخدم من لوحة الفلاتر وقابلة لإعادة الاستخدام والاختبار مباشرة */
  function setHijriFilter(key){activeHijriMonthFilter=key||null;renderCases();updateFilterIndicator();}
  function setMainFilter(main){activeMainFilter=main||null;activeSubFilter=null;renderFilterPanel();renderCases();updateFilterIndicator();}
  function setSubFilter(sub){activeSubFilter=sub||null;renderCases();updateFilterIndicator();}
  function setCaseStatusFilter(status){activeCaseStatusFilter=status||null;renderCases();updateFilterIndicator();}
  function renderFilterPanel(){
    const el=element('filterPanel');
    const activeRows=records.filter(x=>!x.isDeleted);
    const monthCounts={};
    activeRows.filter(r=>r.hijriMonthKey).forEach(r=>{monthCounts[r.hijriMonthKey]=monthCounts[r.hijriMonthKey]||{label:r.hijriMonth+' '+r.hijriYear+'هـ',count:0};monthCounts[r.hijriMonthKey].count++;});
    const monthKeys=Object.keys(monthCounts).sort().reverse();
    const mainOpts=NEW_MAIN_CATEGORIES;
    const subOpts=(activeMainFilter?(NEW_TAXONOMY[activeMainFilter]||[]):Object.values(NEW_TAXONOMY).flat());

    el.innerHTML=
      `<div><label>الفترة (الشهر الهجري)</label><select id="fMonth" data-diwan-change="setHijriFilter">
        <option value="">كل الفترات</option>
        ${monthKeys.map(k=>`<option value="${k}" ${activeHijriMonthFilter===k?'selected':''}>${esc(monthCounts[k].label)} — ${monthCounts[k].count} قضية</option>`).join('')}
      </select></div>
      <div><label>التصنيف الرئيسي</label><select id="fMain" data-diwan-change="setMainFilter">
        <option value="">كل التصنيفات</option>
        ${mainOpts.map(m=>`<option value="${esc(m)}" ${activeMainFilter===m?'selected':''}>${esc(m)}</option>`).join('')}
      </select></div>
      <div><label>التصنيف الفرعي</label><select id="fSub" data-diwan-change="setSubFilter">
        <option value="">كل الفروع</option>
        ${subOpts.map(s=>`<option value="${esc(s)}" ${activeSubFilter===s?'selected':''}>${esc(s)}</option>`).join('')}
      </select></div>
      <div><label>حالة الحكم</label><select id="fStatus" data-diwan-change="setCaseStatusFilter">
        <option value="">الكل</option>
        <option value="نهائية" ${activeCaseStatusFilter==='نهائية'?'selected':''}>نهائية</option>
        <option value="قابلة للاعتراض" ${activeCaseStatusFilter==='قابلة للاعتراض'?'selected':''}>قابلة للاعتراض</option>
      </select></div>
      <div><label>حالة التصنيف</label><select id="fClassState" data-diwan-change="setClassificationStateFilter">
        <option value="">الكل</option>
        <option value="classified" ${activeClassificationStateFilter==='classified'?'selected':''}>✅ مصنفة</option>
        <option value="needs_review" ${activeClassificationStateFilter==='needs_review'?'selected':''}>🟠 تحتاج مراجعة</option>
        <option value="unclassified" ${activeClassificationStateFilter==='unclassified'?'selected':''}>⚪ غير مصنفة</option>
      </select></div>
      <div><label>الاختصاص</label><select id="fJurisdiction" data-diwan-change="setJurisdictionFilter">
        <option value="">الكل</option>
        ${JURISDICTION_OPTIONS.map(s=>`<option value="${esc(s)}" ${activeJurisdictionFilter===s?'selected':''}>${esc(s)}</option>`).join('')}
      </select></div>
      <div><label>النتيجة / المسألة الإجرائية</label>${buildSearchableSelect('fProcedural',PROCEDURAL_RESULTS,activeProceduralFilter||'','onFProceduralChange')}</div>
      <div><label>حالة سير القضية</label><select id="fProgress" data-diwan-change="setProgressStatusFilter">
        <option value="">الكل</option>
        ${CASE_PROGRESS_STATUS.map(s=>`<option value="${esc(s)}" ${activeProgressStatusFilter===s?'selected':''}>${esc(s)}</option>`).join('')}
      </select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn btn-soft" data-diwan-click="clearAllFilters" style="border:0;background:none;color:var(--red);text-decoration:underline;cursor:pointer;font:inherit">مسح الفلاتر</button></div>`;
  }
  function onFProceduralChange(v){activeProceduralFilter=v||null;renderCases();updateFilterIndicator();}
  function setProgressStatusFilter(v){activeProgressStatusFilter=v||null;renderCases();updateFilterIndicator();}
  function setJurisdictionFilter(v){activeJurisdictionFilter=v||null;renderCases();updateFilterIndicator();}
  function setClassificationStateFilter(v){activeClassificationStateFilter=v||null;renderCases();updateFilterIndicator();}
  function updateFilterIndicator(){
    element('filterIconBtn').classList.toggle('hasFilter',hasActiveFilters());
  }
  function toggleExportMenu() {
    const open=element('exportMenu').classList.toggle('open');
    element('diwanExportButton').setAttribute('aria-expanded',String(open));
  }
  function closeExportMenu() {
    element('exportMenu').classList.remove('open');
    element('diwanExportButton').setAttribute('aria-expanded','false');
  }

  /* الفلاتر الحالية بالضبط (بحث + تصنيف رئيسي/فرعي جديد + فترة هجرية + حالة الحكم + حالة التصنيف الموحّدة
     + الاختصاص + النتيجة الإجرائية + حالة سير القضية) — مصدر واحد للحقيقة يستخدمه العرض والتصدير معًا. البحث يشمل
     الحقول القديمة (Legacy) داخليًا تلقائيًا عبر JSON.stringify، دون عرضها في نتائج الواجهة. */
  function searchText(value) {
    return value.replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit<='٩'?0x660:0x6f0)));
  }
  function getVisibleCaseRows(){
    const q=searchText(element('search').value.trim());
    let rows=records.filter(x=>!x.isDeleted&&searchText(JSON.stringify(x)).includes(q));
    if(activeMainFilter)rows=rows.filter(x=>x.main_category_new===activeMainFilter);
    if(activeSubFilter)rows=rows.filter(x=>x.sub_category_new===activeSubFilter);
    if(activeHijriMonthFilter)rows=rows.filter(x=>x.hijriMonthKey===activeHijriMonthFilter);
    if(activeCaseStatusFilter)rows=rows.filter(x=>x.caseStatus===activeCaseStatusFilter);
    if(activeClassificationStateFilter)rows=rows.filter(x=>getClassificationState(x)===activeClassificationStateFilter);
    if(activeProceduralFilter)rows=rows.filter(x=>(x.procedural_results||[]).includes(activeProceduralFilter));
    if(activeProgressStatusFilter)rows=rows.filter(x=>x.case_progress_status===activeProgressStatusFilter);
    if(activeJurisdictionFilter)rows=rows.filter(x=>(x.jurisdiction_status||'غير محدد')===activeJurisdictionFilter);
    rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    return rows;
  }
  let selectionMode=false;
  let selectedCaseNumbers=new Set();
  function toggleSelectionMode(){
    selectionMode=!selectionMode;
    if(!selectionMode)selectedCaseNumbers.clear();
    renderCases();
  }
  function toggleCaseSelection(num,checked){
    if(checked)selectedCaseNumbers.add(String(num)); else selectedCaseNumbers.delete(String(num));
    renderCases();
  }
  let activeCasesTab='all';
  function setCasesTab(tab){activeCasesTab=tab;root.querySelectorAll('.casesTabBtn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));quickReviewQueue=[];element('quickReviewBar').innerHTML='';renderCases();}
  function goToNeedsReviewTab(){show('cases');setCasesTab('needs_review');}

  function renderCases(){
    let rows=getVisibleCaseRows();
    if(activeCasesTab==='needs_review')rows=rows.filter(x=>getClassificationState(x)!=='classified');
    if(activeCasesTab==='classified')rows=rows.filter(x=>getClassificationState(x)==='classified');
    root.querySelectorAll('.casesTabBtn').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeCasesTab));
    renderNeedsReviewBar();
    const allActive=records.filter(x=>!x.isDeleted);
    element('caseCounter').textContent=allActive.length;
    element('tabNeedsReviewCount').textContent=allActive.filter(x=>getClassificationState(x)!=='classified').length;

    const chips=[];
    if(activeMainFilter)chips.push(`<span class="badge">التصنيف: ${esc(activeMainFilter)} <a href="#" data-diwan-click="clearMain" style="color:var(--red);text-decoration:none;font-weight:700">✕</a></span>`);
    if(activeSubFilter)chips.push(`<span class="badge">الفرع: ${esc(activeSubFilter)} <a href="#" data-diwan-click="clearSub" style="color:var(--red);text-decoration:none;font-weight:700">✕</a></span>`);
    if(activeCaseStatusFilter)chips.push(`<span class="badge">الحالة: ${esc(activeCaseStatusFilter)} <a href="#" data-diwan-click="clearStatus" style="color:var(--red);text-decoration:none;font-weight:700">✕</a></span>`);
    if(activeHijriMonthFilter){
      const r0=records.find(x=>x.hijriMonthKey===activeHijriMonthFilter);
      const label=r0?(r0.hijriMonth+' '+r0.hijriYear+'هـ'):activeHijriMonthFilter;
      chips.push(`<span class="badge">الفترة: ${esc(label)} <a href="#" data-diwan-click="clearMonth" style="color:var(--red);text-decoration:none;font-weight:700">✕</a></span>`);
    }
    const chip=chips.length?`<div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">${chips.join('')}</div>`:'';
    const exportBar=`<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-soft" data-diwan-click="toggleSelectionMode">${selectionMode?'إلغاء التحديد':'تحديد قضايا معيّنة'}</button>
      ${selectionMode&&selectedCaseNumbers.size?`<span class="badge">محدَّد: ${selectedCaseNumbers.size} — استخدم زر التصدير أعلى الصفحة لتصديرها</span>`:''}
    </div>`;
    element('caseList').innerHTML=chip+exportBar+(rows.length?`<div class="grid">${rows.map(x=>{
      const dateLine=x.hijriMonthKey?`أضيفت في ${esc(x.hijriMonth)} ${esc(x.hijriYear)}هـ`:`أُنشئت: ${fmtDate(x.createdAt)}`;
      const checkbox=selectionMode?`<input type="checkbox" data-diwan-click="toggleCaseSelection" data-diwan-value="${esc(x.caseNumber)}" aria-label="تحديد القضية ${esc(x.caseNumber)}" ${selectedCaseNumbers.has(String(x.caseNumber))?'checked':''} style="width:17px;height:17px;margin-inline-end:6px">`:'';
      const state=getClassificationState(x);
      const catLine=state==='classified'?(esc(x.main_category_new)+' ← '+esc(x.sub_category_new||'')):'<span style="color:var(--text-secondary)">لم يُحدَّد تصنيف بعد</span>';
      return `<article class="card" data-diwan-click="openUnselectedCase" data-diwan-value="${esc(x.caseNumber)}" style="cursor:pointer"><div class="card-head">${selectionMode?`<label>${checkbox}<bdi>#${esc(x.caseNumber)}</bdi></label>`:`<button type="button" class="btn diwan-case-link"><bdi>#${esc(x.caseNumber)}</bdi></button>`}<span class="badge ${state==='classified'?'approved':'ready'}">${CLASSIFICATION_STATE_LABELS[state]}</span></div><h3 style="font-size:15px">${catLine}</h3><p>${esc((x.originalText||'').slice(0,110))}</p><div class="meta">${dateLine}${x.caseStatus?' — <span style="color:'+(x.caseStatus==='نهائية'?'var(--mint-dark)':'var(--lemon-text)')+'">'+esc(x.caseStatus)+'</span>':''}${x.jurisdiction_status&&x.jurisdiction_status!=='غير محدد'?' — <span style="color:'+(x.jurisdiction_status==='مختص'?'var(--mint-dark)':'var(--red)')+'">'+esc(x.jurisdiction_status)+'</span>':''}</div></article>`;
    }).join('')}</div>`:(ready?'<div class="empty">لا توجد قضايا مطابقة</div>':'<div class="empty">افتح ديوان القضايا بالرمز السري من الأعلى لعرض قضاياك المحفوظة سحابيًا</div>'));
  }

  /* ============================= تصدير أرقام القضايا فقط (نص عادي، خصوصية كاملة — لا نص أصلي ولا تصنيف ولا أي بيانات أخرى) ============================= */
  function downloadCaseNumbersFile(numbers,filename){
    const uniqueNums=[...new Set(numbers.map(String))];
    if(!uniqueNums.length){alert('لا توجد قضايا لتصديرها بالفلتر الحالي.');return}
    const blob=new Blob([uniqueNums.join('\n')+'\n'],{type:'text/plain'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
  }
  function exportVisibleCaseNumbers(){
    const rows=getVisibleCaseRows();
    const filename=activeHijriMonthFilter?('case-numbers-'+activeHijriMonthFilter+'.txt'):'case-numbers.txt';
    downloadCaseNumbersFile(rows.map(x=>x.caseNumber),filename);
  }
  function exportSelectedCaseNumbers(){
    downloadCaseNumbersFile([...selectedCaseNumbers],'case-numbers-selected.txt');
  }
  /* نقطة الدخول الموحّدة من قائمة "تصدير": تعمل على التحديد إن وُجد، وإلا على القضايا الظاهرة حاليًا بعد الفلاتر والبحث */
  function getExportScopeRows(){
    if(selectionMode&&selectedCaseNumbers.size){
      return records.filter(r=>selectedCaseNumbers.has(String(r.caseNumber)));
    }
    return getVisibleCaseRows();
  }
  function exportCaseNumbersTxt(){
    if(selectionMode&&selectedCaseNumbers.size){exportSelectedCaseNumbers();return}
    exportVisibleCaseNumbers();
  }

  /* ============================= تصدير إلى Word (.docx) — يحترم البحث والفلاتر والتحديد ============================= */
  async function exportToWord(){
    const rows=getExportScopeRows();
    if(!rows.length){alert('لا توجد قضايا لتصديرها بالفلتر أو التحديد الحالي.');return}
    let docxApi;
    try{
      docxApi=await loadWordLibrary('docx');
    }catch(err){
      console.error(err);
      alert('تعذّر تحميل مكتبة إنشاء ملفات Word. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.');
      return;
    }
    const {Document,Packer,Paragraph,Table,TableRow,TableCell,TextRun,WidthType}=docxApi;
    const headerRow=new TableRow({children:['رقم القضية','نوع/وصف القضية','الاختصاص','الحالة','شهر الأرشفة'].map(h=>
      new TableCell({children:[new Paragraph({children:[new TextRun({text:h,bold:true})]})]})
    )});
    const dataRows=rows.map(r=>{
      const hijri=r.hijriMonthKey?(r.hijriMonth+' '+r.hijriYear+'هـ'):'';
      return new TableRow({children:[r.caseNumber,r.originalText||'',r.jurisdiction_status||'غير محدد',r.caseStatus||'',hijri].map(v=>
        new TableCell({children:[new Paragraph(String(v||''))]})
      )});
    });
    const table=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[headerRow,...dataRows]});
    const doc=new Document({sections:[{children:[table]}]});
    const blob=await Packer.toBlob(doc);
    const filename=(selectionMode&&selectedCaseNumbers.size)?'cases-export-selected.docx':(activeHijriMonthFilter?('cases-export-'+activeHijriMonthFilter+'.docx'):'cases-export.docx');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
  }

  function renderTrash(){
    let rows=records.filter(x=>x.isDeleted);
    element('trashList').innerHTML=rows.length?rows.map(x=>`<article class="card"><strong dir="ltr">#${esc(x.caseNumber)}</strong><h3>${esc(x.subCategory)}</h3><div class="meta">حُذفت: ${fmtDate(x.updatedAt)}</div><footer><span>${esc(x.mainCategory)}</span><button type="button" class="btn btn-soft" data-diwan-click="trash" data-diwan-value="${esc(x.caseNumber)}">استعادة</button></footer></article>`).join(''):'<div class="empty">السلة فارغة</div>';
  }
  /* ============================= نظام المراجعة المبسّط — جزء من صفحة القضايا، لا صفحة مستقلة ============================= */
  let reauditSuggestions=[]; // نتائج "إعادة تدقيق جميع التصنيفات" — في الذاكرة فقط، بلا أي كتابة
  let reviewSelectedCaseNumbers=new Set();
  let quickReviewQueue=[];
  let quickReviewIndex=0;
  let quickReviewReviewedCount=0;

  function computeReviewStats(){
    const active=records.filter(r=>!r.isDeleted);
    const needsReview=active.filter(r=>getClassificationState(r)!=='classified');
    const classified=active.filter(r=>getClassificationState(r)==='classified');
    return{total:active.length,needsReview:needsReview.length,classified:classified.length};
  }

  /* يُستدعى من renderCases عند تفعيل تبويب "تحتاج مراجعة" فقط */
  function renderNeedsReviewBar(){
    const bar=element('quickReviewBar');
    if(!bar)return;
    if(activeCasesTab!=='needs_review'){bar.innerHTML='';return}
    const needsReviewCases=records.filter(r=>!r.isDeleted&&getClassificationState(r)!=='classified');
    if(!needsReviewCases.length){bar.innerHTML='';return}
    if(!quickReviewQueue.length){
      bar.innerHTML=`<div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <span>لديك <b style="color:var(--mint-dark)">${needsReviewCases.length}</b> قضية تحتاج مراجعة</span>
        <button class="btn btn-primary" data-diwan-click="startQuickReview">ابدأ المراجعة السريعة</button>
      </div>`;
    } else {
      renderQuickReviewCard();
    }
  }
  function startQuickReview(){
    // حماية ثابتة: أي قضية اعتُمدت مراجعتها سابقًا (classification_reviewed_at موجود) تُستبعد نهائيًا من هذا الطابور،
    // بصرف النظر عن أي شيء آخر — لا تُعاد مراجعتها أبدًا آليًا.
    const needsReviewCases=records.filter(r=>!r.isDeleted&&!r.classification_reviewed_at&&getClassificationState(r)!=='classified');
    quickReviewQueue=needsReviewCases.map(generateReclassificationSuggestion);
    quickReviewIndex=0;quickReviewReviewedCount=0;
    renderQuickReviewCard();
  }
  /* اختصاص "له معنى فعلي" فقط — لا "مختص" ولا "غير محدد" ولا فراغ. يُفحص أولًا في البيانات المحفوظة، ثم في النص إن لم توجد */
  function getMeaningfulJurisdiction(record){
    const real=['عدم الاختصاص الدولي','عدم الاختصاص الولائي','عدم الاختصاص النوعي','عدم الاختصاص المكاني','عدم الاختصاص القيمي'];
    if(record.jurisdiction_status&&real.includes(record.jurisdiction_status))return record.jurisdiction_status;
    const fromText=extractJurisdictionStatus(record.originalText||'');
    return real.includes(fromText)?fromText:null;
  }
  function renderQuickReviewCard(){
    const bar=element('quickReviewBar');
    if(!bar)return;
    if(quickReviewIndex>=quickReviewQueue.length){
      bar.innerHTML=`<div class="card">تمت مراجعة ${quickReviewReviewedCount} من ${quickReviewQueue.length} — انتهت قائمة المراجعة السريعة 🎉</div>`;
      quickReviewQueue=[];
      renderCases();
      return;
    }
    const s=quickReviewQueue[quickReviewIndex];
    const record=records.find(r=>String(r.caseNumber)===String(s.caseNumber))||{};
    const confClass={'اقتراح تغيير - ثقة عالية':'confidence-high','اقتراح تغيير - ثقة متوسطة':'confidence-medium','يحتاج قرارًا يدويًا':'confidence-manual','لا توجد معلومات كافية':'confidence-insufficient','التصنيف الحالي يبدو صحيحًا':'confidence-high'}[s.confidence]||'';
    const mainVal=(record.main_category_new&&record.main_category_new!=='يحتاج إنشاء تصنيف جديد')?record.main_category_new:(s.suggestedMain||'');
    const subVal=(record.main_category_new&&record.main_category_new!=='يحتاج إنشاء تصنيف جديد')?(record.sub_category_new||''):(s.suggestedSub||'');
    const jurisdiction=getMeaningfulJurisdiction(record);
    const proceduralChips=[...new Set([...(record.procedural_results||[]),...(s.proceduralSuggested||[])])];
    const evidenceChips=[...new Set([...(record.evidence_methods||[]),...(s.evidenceSuggested||[])])];

    // أسطر ذكية شرطية — تظهر فقط عند وجود قيمة حقيقية فعلًا، وإلا لا شيء إطلاقًا
    const briefLines=[];
    if(jurisdiction)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>الاختصاص المقترح:</b> ${esc(jurisdiction)}</p>`);
    if(proceduralChips.length)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>النتيجة الإجرائية:</b> <span class="chipsline" style="display:inline-flex;vertical-align:middle">${proceduralChips.map(p=>'<span>'+esc(p)+'</span>').join('')}</span></p>`);
    if(evidenceChips.length)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>وسائل الإثبات:</b> <span class="chipsline" style="display:inline-flex;vertical-align:middle">${evidenceChips.map(p=>'<span>'+esc(p)+'</span>').join('')}</span></p>`);
    if(record.case_progress_status)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>حالة سير القضية:</b> ${esc(record.case_progress_status)}</p>`);
    if(record.caseStatus)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>حالة الحكم:</b> ${esc(record.caseStatus)}</p>`);
    if((record.tags_new||[]).length)briefLines.push(`<p style="margin:6px 0;font-size:12.5px"><b>الوسوم:</b> ${(record.tags_new||[]).map(esc).join('، ')}</p>`);

    bar.innerHTML=`<div class="suggestion-card">
      <p style="font-size:11px;color:var(--text-secondary);margin-top:0">تمت مراجعة ${quickReviewReviewedCount} من ${quickReviewQueue.length}</p>
      <p><b>#${esc(s.caseNumber)}</b> — ${esc((s.originalText||'').slice(0,90))}</p>
      <div style="margin-top:10px"><label style="font-size:11px;color:var(--muted)">التصنيف الرئيسي</label>${buildSearchableSelect('qrMain',NEW_MAIN_CATEGORIES,mainVal,'onQrMainChangeFull')}</div>
      <div style="margin-top:8px"><label style="font-size:11px;color:var(--muted)">التصنيف الفرعي</label><div id="qrSubWrap">${buildSearchableSelect('qrSub',NEW_TAXONOMY[mainVal]||[],subVal,null)}</div></div>
      ${s.suggestedMain?'<p style="font-size:11px;color:var(--text-secondary);margin-top:8px">اقتراح النظام: '+esc(s.suggestedMain)+' ← '+esc(s.suggestedSub||'')+' <span class="confidence-badge '+confClass+'">'+esc(s.confidence)+'</span> — '+esc(s.reason)+'</p>':'<p style="font-size:11px;color:var(--text-secondary);margin-top:8px"><span class="confidence-badge confidence-insufficient">'+esc(s.confidence)+'</span> '+esc(s.reason)+'</p>'}
      ${briefLines.join('')}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" data-diwan-click="quickReviewAcceptFull">اعتماد</button>
        <button class="btn btn-soft" data-diwan-click="quickReviewSkip">لاحقًا</button>
      </div>
    </div>`;
  }
  function onQrMainChangeFull(value){
    element('qrSubWrap').innerHTML=buildSearchableSelect('qrSub',NEW_TAXONOMY[value]||[],'',null);
  }
  async function quickReviewAcceptFull(){
    if(!ready){alert('سجّل الدخول أولًا.');return}
    const s=quickReviewQueue[quickReviewIndex];
    const record=records.find(r=>String(r.caseNumber)===String(s.caseNumber));
    if(!record){quickReviewIndex++;renderQuickReviewCard();return}
    const mainVal=sselValue('qrMain')||'يحتاج إنشاء تصنيف جديد';
    const subVal=sselValue('qrSub')||null;
    const beforeMain=record.main_category_new||null,beforeSub=record.sub_category_new||null;

    // Patch جزئي: التصنيف يُحدَّث دائمًا. بقية الحقول لا تُضاف للـPatch إلا إذا كانت لها قيمة حقيقية
    // معروضة فعلًا (مكتشفة أو محفوظة سابقًا) — فلا تُكتب أبدًا قيمة فارغة أو "غير محدد" أو [] فوق بيانات لم تُلمس.
    const patch={
      main_category_new:mainVal,
      sub_category_new:subVal,
      legacy_main_category:record.legacy_main_category||s.oldMain,
      legacy_sub_category:record.legacy_sub_category||s.oldSub,
      classification_status:(mainVal&&mainVal!=='يحتاج إنشاء تصنيف جديد'&&subVal)?'classified':(mainVal!=='يحتاج إنشاء تصنيف جديد'?'needs_review':'unclassified'),
      classification_source:'manual',
      classification_reviewed_at:new Date().toISOString(),
      migrationStatus:'migrated',
      updatedAt:new Date().toISOString()
    };
    const jurisdiction=getMeaningfulJurisdiction(record);
    if(jurisdiction)patch.jurisdiction_status=jurisdiction;
    const proceduralChips=[...new Set([...(record.procedural_results||[]),...(s.proceduralSuggested||[])])];
    if(proceduralChips.length)patch.procedural_results=proceduralChips;
    const evidenceChips=[...new Set([...(record.evidence_methods||[]),...(s.evidenceSuggested||[])])];
    if(evidenceChips.length)patch.evidence_methods=evidenceChips;
    // حالة سير القضية والوسوم: كانت معروضة للعلم فقط إن وُجدت — لا تُعاد كتابتها هنا
    if(mainVal===FORMAL_DEFENSES_MAIN)patch.caseStatus='قابلة للاعتراض'; // فروع الدفوع والنتائج الشكلية قابلة للاعتراض تلقائيًا

    await updateCase(s.caseNumber,patch);
    Object.assign(record,patch);
    await writeAuditLogEntry({caseNumber:s.caseNumber,oldMain:beforeMain,oldSub:beforeSub,newMain:patch.main_category_new,newSub:patch.sub_category_new,proceduralResultsAfter:patch.procedural_results||record.procedural_results||[],evidenceMethodsAfter:patch.evidence_methods||record.evidence_methods||[],reason:'مراجعة سريعة',source:'manual',confidence:s.confidence});
    quickReviewIndex++;quickReviewReviewedCount++;
    renderQuickReviewCard();
  }
  function quickReviewSkip(){
    quickReviewIndex++;
    renderQuickReviewCard();
  }

  /* إعادة فحص تصنيف قضية واحدة من صفحة التفاصيل — زران فقط */
  function openReclassifySuggestion(caseNumber){
    const record=records.find(r=>String(r.caseNumber)===String(caseNumber));
    if(!record){alert('تعذّر العثور على القضية.');return}
    const suggestion=generateReclassificationSuggestion(record);
    renderSuggestionCard(suggestion);
    openDialog('reportModal');
  }
  function renderSuggestionCard(s){
    const box=element('reportModalBox');
    const confClass={'اقتراح تغيير - ثقة عالية':'confidence-high','اقتراح تغيير - ثقة متوسطة':'confidence-medium','يحتاج قرارًا يدويًا':'confidence-manual','لا توجد معلومات كافية':'confidence-insufficient','التصنيف الحالي يبدو صحيحًا':'confidence-high'}[s.confidence]||'';
    box.innerHTML=`<h3 style="color:var(--mint-dark);margin-top:0">إعادة فحص التصنيف</h3>
      <div class="suggestion-card">
        <p><b>الحالي:</b> ${s.currentMainNew?esc(s.currentMainNew)+' ← '+esc(s.currentSubNew||''):'لا يوجد تصنيف بعد'}</p>
        ${s.jurisdictionStatus&&s.jurisdictionStatus!=='غير محدد'?'<p><b>الاختصاص:</b> '+esc(s.jurisdictionStatus)+'</p>':''}
        <p><b>المقترح:</b> ${s.suggestedMain?esc(s.suggestedMain)+' ← '+esc(s.suggestedSub||''):'لا يوجد اقتراح كافٍ'}</p>
        <p><b>الثقة:</b> <span class="confidence-badge ${confClass}">${esc(s.confidence)}</span></p>
        <p><b>السبب:</b> ${esc(s.reason)}</p>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        ${s.suggestedMain?'<button class="btn btn-primary" data-diwan-click="acceptSuggestion" data-diwan-value="' + esc(s.caseNumber) + '">اعتماد التغيير</button>':''}
        <button class="btn btn-soft" data-diwan-click="keepCurrentClassification" data-diwan-value="${esc(s.caseNumber)}">إبقاء الحالي</button>
      </div>`;
  }
  async function applySuggestionToCase(s,source){
    const record=records.find(r=>String(r.caseNumber)===String(s.caseNumber));
    if(!record)return;
    const beforeMain=record.main_category_new||null,beforeSub=record.sub_category_new||null;
    const patch={
      main_category_new:s.suggestedMain,sub_category_new:s.suggestedSub||null,
      procedural_results:[...new Set([...(record.procedural_results||[]),...(s.proceduralSuggested||[])])],
      evidence_methods:[...new Set([...(record.evidence_methods||[]),...(s.evidenceSuggested||[])])],
      legacy_main_category:record.legacy_main_category||s.oldMain,
      legacy_sub_category:record.legacy_sub_category||s.oldSub,
      classification_status:'classified',
      classification_source:source==='manual'?'manual':'auto',
      classification_reviewed_at:new Date().toISOString(),
      migrationStatus:'migrated',
      updatedAt:new Date().toISOString()
    };
    await updateCase(s.caseNumber,patch);
    Object.assign(record,patch);
    await writeAuditLogEntry({caseNumber:s.caseNumber,oldMain:beforeMain,oldSub:beforeSub,newMain:s.suggestedMain,newSub:s.suggestedSub,proceduralResultsAfter:patch.procedural_results,evidenceMethodsAfter:patch.evidence_methods,reason:s.reason,source,confidence:s.confidence});
  }
  async function acceptSuggestion(caseNumber){
    if(!ready){alert('سجّل الدخول أولًا.');return}
    const record=records.find(r=>String(r.caseNumber)===String(caseNumber));
    const s=generateReclassificationSuggestion(record);
    await applySuggestionToCase(s,'suggestion_accepted');
    closeReport();renderCases();
  }
  async function keepCurrentClassification(caseNumber){
    if(!ready){alert('سجّل الدخول أولًا.');return}
    const record=records.find(r=>String(r.caseNumber)===String(caseNumber));
    if(record){
      const patch={classification_status:'classified',classification_source:'manual',classification_reviewed_at:new Date().toISOString(),migrationStatus:'migrated',updatedAt:new Date().toISOString()};
      await updateCase(caseNumber,patch);
      Object.assign(record,patch);
      await writeAuditLogEntry({caseNumber,oldMain:record.main_category_new,oldSub:record.sub_category_new,newMain:record.main_category_new,newSub:record.sub_category_new,proceduralResultsAfter:record.procedural_results||[],evidenceMethodsAfter:record.evidence_methods||[],reason:'أبقى المستخدم التصنيف الحالي بعد المراجعة',source:'reviewed_keep_current',confidence:null});
    }
    closeReport();renderCases();
  }

  /* إعادة تدقيق جميع التصنيفات — أداة صيانة (الإعدادات ← أدوات متقدمة)، قراءة فقط، بلا تغيير آلي.
     القضايا التي لديها classification_reviewed_at (اعتُمدت مراجعتها يدويًا سابقًا) تُستبعد نهائيًا من الفحص
     نفسه — لا تُحسب، ولا تُفحص، ولا تظهر في أي اقتراح لاحق. */
  async function runFullReaudit(){
    const allActive=records.filter(r=>!r.isDeleted);
    const active=allActive.filter(r=>!r.classification_reviewed_at);
    const alreadyReviewedCount=allActive.length-active.length;
    const suggestions=active.map(generateReclassificationSuggestion);
    const looksCorrect=suggestions.filter(s=>s.alreadyCorrect).length;
    const needsChange=suggestions.filter(s=>!s.alreadyCorrect&&s.suggestedMain).length;
    const insufficient=suggestions.filter(s=>!s.alreadyCorrect&&!s.suggestedMain).length;
    reauditSuggestions.length=0;
    reauditSuggestions.push(...suggestions.filter(s=>!s.alreadyCorrect));
    const box=element('reportModalBox');
    box.innerHTML=`<h3 style="color:var(--mint-dark);margin-top:0">نتيجة إعادة التدقيق الشامل</h3>
      <div class="grid" style="margin:16px 0">
        <div class="card" style="margin:0"><div style="font-size:22px;color:var(--mint-dark);font-weight:700">${active.length}</div><div style="font-size:11px;color:var(--text-secondary)">تم فحصها</div></div>
        <div class="card" style="margin:0"><div style="font-size:22px;color:#187346;font-weight:700">${looksCorrect}</div><div style="font-size:11px;color:var(--text-secondary)">تصنيفها يبدو صحيحًا</div></div>
        <div class="card" style="margin:0"><div style="font-size:22px;color:var(--lemon-text);font-weight:700">${needsChange}</div><div style="font-size:11px;color:var(--text-secondary)">يُقترح تغييرها</div></div>
        <div class="card" style="margin:0"><div style="font-size:22px;color:var(--red);font-weight:700">${insufficient}</div><div style="font-size:11px;color:var(--text-secondary)">لا توجد معلومات كافية</div></div>
      </div>
      <p style="font-size:11px;color:var(--text-secondary)">لم يتغيّر أي تصنيف. تم استبعاد ${alreadyReviewedCount} قضية سبق اعتماد مراجعتها يدويًا من الفحص تمامًا. القضايا التي يُقترح تغييرها أو تحتاج معلومات أُضيفت إلى تبويب "تحتاج مراجعة" في صفحة القضايا.</p>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <button class="btn btn-soft" data-diwan-click="closeReport">إغلاق</button>
        <button class="btn btn-primary" data-diwan-click="reviewAfterReport">مراجعة الـ${needsChange+insufficient} قضية</button>
      </div>`;
    openDialog('reportModal');
  }

  function goToSub(main,sub){activeMainFilter=main;activeSubFilter=sub;activeCasesTab='all';show('cases');}

  /* ============================= الرئيسية (لوحة المعلومات) ============================= */
  function miniCaseCard(x){
    const dateLine=x.hijriMonthKey?`${esc(x.hijriMonth)} ${esc(x.hijriYear)}هـ`:fmtDate(x.createdAt);
    const state=getClassificationState(x);
    const catLine=state==='classified'?(esc(x.main_category_new)+' ← '+esc(x.sub_category_new||'')):'<span style="color:var(--text-secondary)">لم يُحدَّد تصنيف بعد</span>';
    return `<article class="card" data-diwan-click="openCaseDetail" data-diwan-value="${esc(x.caseNumber)}" style="cursor:pointer"><div class="card-head"><button type="button" class="btn diwan-case-link"><bdi>#${esc(x.caseNumber)}</bdi></button><span class="badge ${state==='classified'?'approved':'ready'}">${CLASSIFICATION_STATE_LABELS[state]}</span></div><h3 style="font-size:15px">${catLine}</h3><p>${esc((x.originalText||'').slice(0,80))}</p><div class="meta">${dateLine}${x.caseStatus?' — <span style="color:'+(x.caseStatus==='نهائية'?'var(--mint-dark)':'var(--lemon-text)')+'">'+esc(x.caseStatus)+'</span>':''}</div></article>`;
  }
  function renderDashboard(){
    const active=records.filter(x=>!x.isDeleted);
    element('statTotal').textContent=active.length;
    element('statClassified').textContent=active.filter(x=>getClassificationState(x)==='classified').length;
    element('statReview').textContent=active.filter(x=>getClassificationState(x)!=='classified').length;
    element('statFinal').textContent=active.filter(x=>x.caseStatus==='نهائية').length;

    const q=searchText(element('dashSearch').value.trim());
    const resultsBox=element('dashSearchResults');
    if(q){
      const matches=active.filter(x=>searchText(JSON.stringify(x)).includes(q)).slice(0,12);
      resultsBox.innerHTML=`<h4 style="color:var(--g);margin-top:20px">نتائج البحث (${matches.length})</h4>`+
        (matches.length?`<div class="grid">${matches.map(miniCaseCard).join('')}</div>`:'<div class="empty">لا توجد نتائج مطابقة</div>');
      element('dashLists').innerHTML='';
      return;
    }
    resultsBox.innerHTML='';

    const recent=active.slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,5);
    const needsReviewCount=active.filter(x=>getClassificationState(x)!=='classified').length;

    let html='<h4 style="color:var(--g)">آخر القضايا</h4>'+(recent.length?'<div class="grid">'+recent.map(miniCaseCard).join('')+'</div>':'<div class="empty">لا توجد قضايا بعد</div>');
    if(needsReviewCount>0){
      html+=`<div class="card" style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <span>لديك <b style="color:var(--mint-dark)">${needsReviewCount}</b> قضية تحتاج مراجعة</span>
        <button class="btn btn-primary" data-diwan-click="goToNeedsReviewTab">مراجعتها الآن</button>
      </div>`;
    }
    element('dashLists').innerHTML=html;
  }

  /* ============================= لوحة تفاصيل القضية: عرض / تعديل ومراجعة / إعادة تحليل فردية ============================= */
  let detailEditMode=false;
  let detailDraftFields=null; // نسخة عمل مؤقتة أثناء التعديل، لا تُكتب على السجل الفعلي إلا عند الحفظ
  let currentDetailCaseNumber=null;

  function openCaseDetail(caseNumber){
    const r=records.find(x=>String(x.caseNumber)===String(caseNumber));
    if(!r)return;
    currentDetailCaseNumber=String(caseNumber);
    detailEditMode=false;
    detailDraftFields=null;
    renderCaseDetail(r);
    openDialog('caseDetailModal');
  }
  function closeCaseDetail(){
    element('caseDetailModal').close();
    detailEditMode=false;
    detailDraftFields=null;
    currentDetailCaseNumber=null;
  }

  function fieldRow(label,value){
    return `<div style="padding:9px 0;border-bottom:1px solid var(--line)"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:13.5px;color:var(--ivory);margin-top:3px">${value||'<span style="color:var(--muted)">—</span>'}</div></div>`;
  }

  function renderCaseDetail(r){
    const box=element('caseDetailBox');
    if(!detailEditMode){
      const state=getClassificationState(r);
      box.innerHTML=
        `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div><div style="font-size:11px;color:var(--muted)">رقم القضية</div><h3 style="margin:4px 0;color:var(--g)">#${esc(r.caseNumber)}</h3></div>
          <button class="btn btn-soft" data-diwan-click="closeCaseDetail">إغلاق ✕</button>
        </div>
        <div style="margin-top:10px"><span class="badge" style="font-size:12px;padding:6px 12px">${CLASSIFICATION_STATE_LABELS[state]}</span>${r.classification_reviewed_at?' <span style="font-size:11px;color:var(--text-secondary)">— اعتمد التصنيف يدويًا</span>':''}</div>
        ${state==='classified'?`<div class="classification" style="margin-top:12px">${esc(r.main_category_new)}<b>←</b>${esc(r.sub_category_new||'')}</div>`:''}
        ${fieldRow('الاختصاص',r.jurisdiction_status&&r.jurisdiction_status!=='غير محدد'?esc(r.jurisdiction_status):'')}
        ${fieldRow('النتيجة / المسألة الإجرائية',(r.procedural_results||[]).length?'<div class="chipsline">'+(r.procedural_results||[]).map(p=>'<span>'+esc(p)+'</span>').join('')+'</div>':'')}
        ${fieldRow('وسائل الإثبات',(r.evidence_methods||[]).length?'<div class="chipsline">'+(r.evidence_methods||[]).map(p=>'<span>'+esc(p)+'</span>').join('')+'</div>':'')}
        ${fieldRow('حالة سير القضية',r.case_progress_status?esc(r.case_progress_status):'')}
        ${fieldRow('حالة الحكم',r.caseStatus?esc(r.caseStatus):'')}
        ${fieldRow('الوسوم',(r.tags_new||[]).map(t=>esc(t)).join('، '))}
        ${fieldRow('النص الأصلي',esc(r.originalText||''))}
        ${fieldRow('تاريخ الإضافة',esc(fmtDate(r.createdAt))+(r.hijriMonthKey?' — '+esc(r.hijriMonth)+' '+esc(r.hijriYear)+'هـ':''))}
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary" data-diwan-click="enterCaseEditMode">تعديل</button>
          ${state!=='classified'?'<button class="btn btn-soft" data-diwan-click="openReclassifySuggestion" data-diwan-value="' + esc(r.caseNumber) + '">إعادة فحص التصنيف</button>':'<button class="btn btn-soft" data-diwan-click="openReclassifySuggestion" data-diwan-value="' + esc(r.caseNumber) + '">إعادة فحص التصنيف</button>'}
          <button class="btn btn-soft" data-diwan-click="trashFromDetail" data-diwan-value="${esc(r.caseNumber)}" style="color:var(--red)">نقل إلى السلة</button>
        </div>
        <details style="margin-top:20px"><summary style="cursor:pointer;color:var(--text-secondary);font-size:12px">بيانات التصنيف القديمة</summary>
          ${fieldRow('التصنيف القديم (Legacy)',esc(r.legacy_main_category||r.mainCategory||'')+' ← '+esc(r.legacy_sub_category||r.subCategory||''))}
          ${fieldRow('نوع القضية (قديم)',esc(r.caseType||''))}
          ${fieldRow('درجة ثقة المحرك القديم',r.confidence!=null?esc(r.confidence)+'%':'')}
        </details>`;
    } else {
      const d=detailDraftFields;
      box.innerHTML=
        `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div><div style="font-size:11px;color:var(--muted)">تعديل القضية</div><h3 style="margin:4px 0;color:var(--g)">#${esc(r.caseNumber)}</h3></div>
          <button class="btn btn-soft" data-diwan-click="exitCaseEditMode">إلغاء التعديل ✕</button>
        </div>
        <div class="fields" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">النص/الوصف</label><textarea id="dfText" style="width:100%;min-height:90px;padding:9px;border:1px solid var(--line);border-radius:8px;font:inherit">${esc(d.originalText)}</textarea></div>
          <div style="grid-column:1/-1"><button class="btn btn-soft" type="button" data-diwan-click="reanalyzeSingleCase">إعادة التحليل (على النص أعلاه فقط)</button></div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">التصنيف الرئيسي (اكتب للبحث — مثلًا: شفعة، إخلاء، عيب، قرض)</label>${buildSearchableSelect('dfMainNew',NEW_MAIN_CATEGORIES,d.main_category_new,'onDfMainNewChange')}</div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">التصنيف الفرعي</label><div id="dfSubNewWrap">${buildSearchableSelect('dfSubNew',NEW_TAXONOMY[d.main_category_new]||[],d.sub_category_new,null)}</div></div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">الاختصاص</label>${buildSearchableSelect('dfJurisdiction',JURISDICTION_OPTIONS,d.jurisdiction_status||'غير محدد',null)}</div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">النتيجة / المسألة الإجرائية</label>${buildMultiChecklist('dfProcedural',PROCEDURAL_RESULTS,d.procedural_results)}</div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">وسائل الإثبات</label>${buildMultiChecklist('dfEvidenceMethods',EVIDENCE_METHODS,d.evidence_methods)}</div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">حالة سير القضية</label>${buildSearchableSelect('dfProgress',CASE_PROGRESS_STATUS,d.case_progress_status||'',null)}</div>
          <div id="dfStatusWrap" style="${d.main_category_new===FORMAL_DEFENSES_MAIN?'display:none':''}"><label style="font-size:11px;color:var(--muted)">حالة الحكم</label><select id="dfStatus" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:8px">
            <option value="" ${!d.caseStatus?'selected':''}>غير محددة</option>
            <option value="نهائية" ${d.caseStatus==='نهائية'?'selected':''}>نهائية</option>
            <option value="قابلة للاعتراض" ${d.caseStatus==='قابلة للاعتراض'?'selected':''}>غير نهائية / قابلة للاعتراض</option>
          </select></div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">الوسوم</label>${buildMultiChecklist('dfTagsNew',SUGGESTED_TAGS_NEW,d.tags_new)}</div>
        </div>
        <div id="reanalyzeSuggestionBox"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn-primary" data-diwan-click="saveCaseReview" data-diwan-value="${esc(r.caseNumber)}">حفظ</button>
          <button class="btn btn-soft" data-diwan-click="exitCaseEditMode">إلغاء</button>
        </div>`;
    }
  }
  function onDfMainNewChange(value){
    element('dfSubNewWrap').innerHTML=buildSearchableSelect('dfSubNew',NEW_TAXONOMY[value]||[],'',null);
    const statusWrap=element('dfStatusWrap');
    if(statusWrap)statusWrap.style.display=(value===FORMAL_DEFENSES_MAIN)?'none':'';
  }

  function enterCaseEditMode(){
    const r=records.find(x=>String(x.caseNumber)===String(currentDetailCaseNumber));
    if(!r)return;
    detailDraftFields={
      originalText:r.originalText||'',caseType:r.caseType||'',mainCategory:r.mainCategory||'',subCategory:r.subCategory||'',
      judgmentResult:r.judgmentResult||'',judgmentReason:r.judgmentReason||'',evidenceType:r.evidenceType||'',
      oathType:r.oathType||'',partyStatus:r.partyStatus||'',caseStatus:r.caseStatus||'',
      main_category_new:r.main_category_new||'يحتاج إنشاء تصنيف جديد',sub_category_new:r.sub_category_new||'',
      procedural_results:r.procedural_results||[],evidence_methods:r.evidence_methods||[],tags_new:r.tags_new||[],
      case_progress_status:r.case_progress_status||'',
      jurisdiction_status:r.jurisdiction_status||'غير محدد'
    };
    detailEditMode=true;
    renderCaseDetail(r);
  }
  function exitCaseEditMode(){
    const r=records.find(x=>String(x.caseNumber)===String(currentDetailCaseNumber));
    detailEditMode=false;
    detailDraftFields=null;
    if(r)renderCaseDetail(r);
  }

  /* إعادة تحليل قضية واحدة فقط: تعمل على نص textarea الحالي (وقد لا يزال غير محفوظ)، وتعرض اقتراحًا قبل الحفظ */
  function reanalyzeSingleCase(){
    const text=element('dfText').value;
    const fields=reanalyzeFields(text);
    const box=element('reanalyzeSuggestionBox');
    box.innerHTML=`<div class="classification" style="margin-top:12px">اقتراح إعادة التحليل (قديم): ${esc(fields.mainCategory)}<b>←</b>${esc(fields.subCategory)} — ثقة ${fields.confidence}%
      <div style="margin-top:8px"><button class="btn btn-soft" type="button" data-diwan-click="applyReanalyzeSuggestion">اعتماد هذا الاقتراح في النموذج</button></div>
    </div>`;
    lastReanalyzeSuggestion=fields;
  }
  function applyReanalyzeSuggestion(){
    const fields=lastReanalyzeSuggestion;
    if(!fields)return;
    const nf=computeNewTaxonomyFields(fields.mainCategory,fields.subCategory,fields.originalText||element('dfText').value);
    element('dfMainNew').querySelector('.ssel-input').value=nf.main_category_new!=='يحتاج إنشاء تصنيف جديد'?nf.main_category_new:'';
    element('dfSubNewWrap').innerHTML=buildSearchableSelect('dfSubNew',NEW_TAXONOMY[nf.main_category_new]||[],nf.sub_category_new,null);
  }

  async function saveCaseReview(caseNumber){
    if(!ready){alert('سجّل الدخول أولًا لحفظ المراجعة سحابيًا.');return}
    const local=records.find(x=>String(x.caseNumber)===String(caseNumber));
    const beforeMain=local?local.main_category_new:null, beforeSub=local?local.sub_category_new:null;
    const newMain=sselValue('dfMainNew')||'يحتاج إنشاء تصنيف جديد';
    const newSub=sselValue('dfSubNew')||null;
    const classified=!!(newMain&&newMain!=='يحتاج إنشاء تصنيف جديد'&&newSub);
    const patch={
      originalText:element('dfText').value,
      caseStatus:newMain===FORMAL_DEFENSES_MAIN?'قابلة للاعتراض':element('dfStatus').value,
      main_category_new:newMain,
      sub_category_new:newSub,
      procedural_results:mclValues('dfProcedural'),
      evidence_methods:mclValues('dfEvidenceMethods'),
      tags_new:mclValues('dfTagsNew'),
      case_progress_status:sselValue('dfProgress')||'',
      jurisdiction_status:sselValue('dfJurisdiction')||'غير محدد',
      legacy_main_category:(local&&local.legacy_main_category)||(local&&local.mainCategory),
      legacy_sub_category:(local&&local.legacy_sub_category)||(local&&local.subCategory),
      classification_status:classified?'classified':(newMain==='يحتاج إنشاء تصنيف جديد'?'unclassified':'needs_review'),
      classification_source:'manual',
      classification_reviewed_at:new Date().toISOString(),
      migrationStatus:'migrated',
      updatedAt:new Date().toISOString()
    };
    setSync('جارٍ حفظ المراجعة ☁️');
    try{
      // updateDoc: تحديث جزئي — لا يمس caseNumber ولا createdAt ولا isDeleted ولا معرّف المستند
      await updateCase(caseNumber,patch);
      if(local)Object.assign(local,patch);
      // حفظ التصحيح كـ classificationAlias (مطابقة نصية دقيقة فقط، لا قاعدة عامة) — يعتمد على النص والتصنيف الجديد
      saveClassificationAlias(patch.originalText,newMain,newSub||'',caseTypeForSub(newSub)||newMain);
      // سجل تدقيق: فقط إذا تغيّر التصنيف الجديد فعليًا
      if(beforeMain!==newMain||beforeSub!==newSub){
        await writeAuditLogEntry({
          caseNumber,oldMain:beforeMain,oldSub:beforeSub,newMain,newSub,
          proceduralResultsAfter:patch.procedural_results,evidenceMethodsAfter:patch.evidence_methods,
          reason:'تعديل يدوي من صفحة تفاصيل القضية',source:'manual',confidence:null
        });
      }
      setSync('تم الحفظ.');
      renderCases();renderTrash();renderTree();
      detailEditMode=false;detailDraftFields=null;
      if(local)renderCaseDetail(local);
    }catch(err){
      console.error(err);setSync('تعذّر الحفظ ⚠️');
      alert('تعذّر حفظ المراجعة: '+(err.message||err));
    }
  }

  async function trashFromDetail(caseNumber){
    if(!confirm('نقل القضية #'+caseNumber+' إلى السلة؟'))return;
    await trash(caseNumber);
    closeCaseDetail();
  }

  function renderTree(){
    let rows=records.filter(x=>!x.isDeleted);
    element('tree').innerHTML=
      `<div style="margin-bottom:14px"><button class="btn btn-soft" data-diwan-click="toggleAddCategoryForm">+ إضافة تصنيف فرعي جديد</button></div>`+
      `<div id="addCategoryForm" style="display:none;background:var(--mint-pale);border-radius:12px;padding:14px;margin-bottom:16px">
        <div class="fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:11px;color:var(--muted)">التصنيف الرئيسي</label><select id="newCatMain" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px">${NEW_MAIN_CATEGORIES.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></div>
          <div><label style="font-size:11px;color:var(--muted)">اسم التصنيف الفرعي الجديد</label><input id="newCatSub" placeholder="مثال: أجرة مركبات" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px"></div>
          <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--muted)">كلمات دالة (مفصولة بفاصلة) — تُستخدم للتعرّف على هذا التصنيف تلقائيًا مستقبلًا</label><input id="newCatKeywords" placeholder="مثال: اجرة مركبة, ايجار سياره" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px"></div>
          <div><label style="font-size:11px;color:var(--muted)">نوع القضية (اختياري)</label><input id="newCatType" placeholder="مثال: مركبات" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-primary" data-diwan-click="submitAddCategory">إضافة</button><button class="btn btn-soft" data-diwan-click="toggleAddCategoryForm">إلغاء</button></div>
      </div>`+
      Object.entries(NEW_TAXONOMY).map(([m,subs])=>{
        let count=rows.filter(x=>x.main_category_new===m).length;
        return `<details><summary>${esc(m)} <span class="badge" style="float:left">${count}</span></summary><ul>${subs.map(s=>{
          const n=rows.filter(x=>x.sub_category_new===s).length;
          const del=isCustomCategory(m,s)?` <button class="btn btn-soft" type="button" data-diwan-click="deleteCustomCategory" data-diwan-value="${esc(m)}" data-diwan-secondary="${esc(s)}" style="color:var(--red);text-decoration:none;font-weight:700;margin-inline-start:6px">حذف</button>`:'';
          return `<li><button type="button" class="btn btn-soft diwan-subcategory" data-diwan-click="goToSub" data-diwan-value="${esc(m)}" data-diwan-secondary="${esc(s)}">${esc(s)} <span class="badge">${n}</span></button>${del}</li>`;
        }).join('')}</ul></details>`;
      }).join('');
  }
  function toggleAddCategoryForm(){
    const f=element('addCategoryForm');
    if(f)f.style.display=f.style.display==='none'?'block':'none';
  }
  function submitAddCategory(){
    const main=element('newCatMain').value.trim();
    const sub=element('newCatSub').value.trim();
    const keywords=element('newCatKeywords').value.trim();
    const caseType=element('newCatType').value.trim();
    if(!sub){alert('اكتب اسم التصنيف الفرعي الجديد');return}
    if(!ready){alert('سجّل الدخول أولًا لحفظ التصنيفات الجديدة سحابيًا');return}
    const entry={id:'cat_'+Date.now().toString(36),main,sub,caseType,pattern:keywords,tags:[]};
    addCustomCategoryRuntime(entry);
    customCategories.push(entry);
    if(saveCategories)saveCategories(customCategories);
    renderTree();
  }
  function deleteCustomCategory(main,sub){
    const entry=customCategories.find(c=>c.main===main&&c.sub===sub);
    if(!entry)return;
    if(!confirm('حذف تصنيف "'+sub+'"؟ لن يتم حذف القضايا المصنفة سابقًا تحته، لكن لن يُقترح تلقائيًا بعد الآن.'))return;
    removeCustomCategoryRuntime(entry.id);
    if(saveCategories)saveCategories(customCategories);
    renderTree();
  }
  function newCase(){element('search').value='';draft=[];element('preview').innerHTML='';show('home')}
  function show(id) {
    closeExportMenu();
    if (element('syncLine').textContent.startsWith('تم الحفظ')) setSync('');
    root.querySelectorAll('.diwan-page').forEach(page => { page.hidden = page.id !== id; });
    root.querySelectorAll('[data-page]').forEach(button => {
      const checked=button.dataset.page===(id==='home'?'cases':id);
      button.classList.toggle('active',checked);
      if(checked) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    renderActivePage();
  }
  function renderActivePage(){
    const active=root.querySelector('.diwan-page:not([hidden])');
    const id=active?active.id:'dashboard';
    if(id==='cases')renderCases();
    else if(id==='trash')renderTrash();
    else if(id==='taxonomy')renderTree();
    else if(id==='dashboard')renderDashboard();
  }
  let activePageRenderFrame=0;
  function scheduleActivePageRender(){
    if(activePageRenderFrame)return;
    activePageRenderFrame=requestAnimationFrame(()=>{
      activePageRenderFrame=0;
      renderActivePage();
    });
  }

  function element(id) {
    return root.querySelector('#' + CSS.escape(id));
  }

  function openDialog(id) {
    const dialog = element(id);
    if (!dialog.open) dialog.showModal();
  }

  function setSync(message) {
    if (!signal.aborted) element('syncLine').textContent = message;
  }

  function replace(list, items) {
    list.length = 0;
    for (const item of items) list.push(item);
  }

  let ready = false;
  let lastReanalyzeSuggestion;
  let writeVersion = 0;
  let pendingWrites = 0;
  let previousSnapshot;
  let refreshing = false;

  async function write(operation, payload) {
    writeVersion++;
    pendingWrites++;
    try { return await request(operation, payload); }
    finally { pendingWrites--; }
  }

  async function persistCase(caseNumber, patch, create) {
    const saved = await write('save', {caseNumber, patch, create});
    if (signal.aborted) return;
    const index = records.findIndex(item => String(item.caseNumber) === caseNumber);
    if (index < 0) records.push(saved);
    else records[index] = saved;
    scheduleActivePageRender();
  }

  const saveCase = item => persistCase(String(item.caseNumber), item, true);
  const updateCase = (caseNumber, patch) => persistCase(String(caseNumber), patch, false);
  const saveAudit = entry => write('audit', {entry});
  const saveCategories = list => write('setting', {name:'customCategories', list:[...list]}).catch(error => setSync(error.message));
  const saveAlias = () => write('setting', {name:'classificationAliases', list:[...classificationAliases]}).catch(error => setSync(error.message));
  const selectCallbacks = {onAddMainChange,onAddSubChange,onDfMainNewChange,onFProceduralChange,onQrMainChange:onQrMainChangeFull,onWiMainChange};

  async function refresh() {
    if (signal.aborted || refreshing || pendingWrites || document.hidden) return;
    refreshing = true;
    const version = writeVersion;
    try {
      const snapshot = await request('load');
      if (signal.aborted || version !== writeVersion || pendingWrites) return;
      const content = JSON.stringify(snapshot);
      if (previousSnapshot !== content) {
        replace(records, snapshot.cases);
        customCategories.forEach(category => removeCustomCategoryRuntime(category.id));
        replace(customCategories, snapshot.settings.customCategories ?? []);
        customCategories.forEach(addCustomCategoryRuntime);
        replace(classificationAliases, snapshot.settings.classificationAliases ?? []);
        replace(auditLogCache, snapshot.audit);
        previousSnapshot = content;
        scheduleActivePageRender();
      }
      ready = true;
      setSync('');
    } catch (error) {
      setSync(error.message);
    } finally {
      refreshing = false;
    }
  }

  const actions = {
    show: id => { show(id); root.querySelector('.diwan-page:not([hidden]) h2')?.focus({preventScroll:true}); root.scrollIntoView({block:'start'}); },
    acceptSuggestion, analyzeNewTaxonomyMigration, applyHijriMigration, applyMigration,
    applyReanalyzeSuggestion, clearAllFilters, closeCaseDetail, closeReport, confirmWordImport,
    deleteCustomCategory, enterCaseEditMode, exitCaseEditMode, exportData, goToNeedsReviewTab,
    goToSub, keepCurrentClassification, newCase, openCaseDetail, openReclassifySuggestion,
    previewHijriMigration, previewMigration, quickReviewAcceptFull, quickReviewSkip,
    reanalyzeSingleCase, reanalyzeUnclassified, renderCases, renderDashboard, runAnalysis,
    runFullReaudit, saveCaseReview, saveDraft, setCasesTab, startQuickReview,
    submitAddCategory, toggleAddCategoryForm, toggleExportMenu, toggleFilterPanel,
    toggleSelectionMode, trash: id => trash(id,true), trashFromDetail,
    openUnselectedCase: id => { if (!selectionMode) openCaseDetail(id); },
    chooseBackup: () => element('importFile').click(),
    chooseWord: () => element('wordFile').click(),
    exportNumbersFromMenu: () => { closeExportMenu(); exportCaseNumbersTxt(); },
    exportBackupFromMenu: () => { closeExportMenu(); exportData(); },
    exportWordFromMenu: () => { closeExportMenu(); return exportToWord(); },
    reviewAfterReport: () => { closeReport(); goToNeedsReviewTab(); },
    clearStatus: () => setCaseStatusFilter(''),
    clearMain: () => { activeMainFilter=null; renderCases(); updateFilterIndicator(); },
    clearSub: () => setSubFilter(''),
    clearMonth: () => setHijriFilter(''),
    handleWordFile: (_id,_other,event) => handleWordFile(event),
    importData: (_id,_other,event) => importData(event),
    toggleCaseSelection: (id,_other,_event,control) => toggleCaseSelection(id,control.checked),
    setCaseStatusFilter: (_id,_other,_event,control) => setCaseStatusFilter(control.value),
    setClassificationStateFilter: (_id,_other,_event,control) => setClassificationStateFilter(control.value),
    setHijriFilter: (_id,_other,_event,control) => setHijriFilter(control.value),
    setJurisdictionFilter: (_id,_other,_event,control) => setJurisdictionFilter(control.value),
    setMainFilter: (_id,_other,_event,control) => setMainFilter(control.value),
    setProgressStatusFilter: (_id,_other,_event,control) => setProgressStatusFilter(control.value),
    setSubFilter: (_id,_other,_event,control) => setSubFilter(control.value),
    mclFilter: (id,_other,_event,control) => mclFilter(id,control.value),
    sselFilter, sselOpenOnFocus,
    sselKeyNav: (id,_other,event) => sselKeyNav(event,id),
    sselChooseIndex: (id,index,event) => {event.preventDefault();sselChooseIndex(id,Number(index));}
  };

  function dispatch(event, type = event.type) {
    const control = event.target.closest('[data-diwan-' + type + ']');
    if (!control || !root.contains(control) || signal.aborted) return;
    const action = control.getAttribute('data-diwan-' + type);
    if (!Object.hasOwn(actions,action)) return;
    if (type === 'click' && control.matches('a[href="#"]')) event.preventDefault();
    try {
      Promise.resolve(actions[action](control.dataset.diwanValue,control.dataset.diwanSecondary,event,control))
        .catch(error => setSync(error.message || 'تعذّر تنفيذ الإجراء.'));
    } catch (error) {
      setSync(error.message || 'تعذّر تنفيذ الإجراء.');
    }
  }

  root.innerHTML = diwanViews;
  for (const heading of root.querySelectorAll('.diwan-page h2')) heading.tabIndex = -1;
  for (const type of ['click','input','change','keydown','pointerdown']) {
    root.addEventListener(type,dispatch,{signal});
  }
  root.addEventListener('focusin',event=>dispatch(event,'focus'),{signal});
  root.addEventListener('keydown',event => {
    if (event.key==='Escape' && element('exportMenu').classList.contains('open')) {
      closeExportMenu();
      element('diwanExportButton').focus();
    }
  },{signal});
  element('caseDetailModal').addEventListener('cancel',closeCaseDetail,{signal});
  show('dashboard');
  setSync('جارٍ تحميل القضايا…');
  const timer = setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh,{signal});
  signal.addEventListener('abort',() => {
    clearInterval(timer);
    cancelAnimationFrame(activePageRenderFrame);
    ready = false;
  },{once:true});
  void refresh();
}
