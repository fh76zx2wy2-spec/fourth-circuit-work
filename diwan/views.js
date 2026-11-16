export const diwanViews = `<nav class="seg diwan-navigation" aria-label="أقسام ديوان القضايا">
<button type="button" data-page="dashboard" data-diwan-click="show" data-diwan-value="dashboard">نظرة عامة</button>
<button type="button" data-page="cases" data-diwan-click="show" data-diwan-value="cases">القضايا</button>
<button type="button" data-page="taxonomy" data-diwan-click="show" data-diwan-value="taxonomy">التصنيفات</button>
<button type="button" data-page="trash" data-diwan-click="show" data-diwan-value="trash">المحذوفات</button>
<button type="button" data-page="settings" data-diwan-click="show" data-diwan-value="settings">الإعدادات</button>
</nav>
<p id="syncLine" class="diwan-status" role="status">
</p>
<section id="dashboard" class="diwan-page">
  <div class="section-head diwan-page-head">
    <div>
      <h2>نظرة عامة</h2>
    </div>
    <button class="btn btn-primary" data-diwan-click="show" data-diwan-value="home">+ إضافة قضية</button>
  </div>
  <input class="search diwan-search" id="dashSearch" aria-label="بحث في الأرشيف" placeholder="ابحث بالرقم أو الوصف أو التصنيف" data-diwan-input="renderDashboard">

  <div class="stats diwan-stats">
    <div class="stat">
      <b class="stat-number" id="statTotal">0</b>
      <span class="stat-label">إجمالي القضايا</span>
    </div>
    <div class="stat">
      <b class="stat-number" id="statClassified">0</b>
      <span class="stat-label">مصنفة</span>
    </div>
    <div class="stat">
      <b class="stat-number" id="statReview">0</b>
      <span class="stat-label">تحتاج مراجعة</span>
    </div>
    <div class="stat">
      <b class="stat-number" id="statFinal">0</b>
      <span class="stat-label">نهائية</span>
    </div>
  </div>
  <div id="dashSearchResults">
  </div>
  <div id="dashLists">
  </div>
</section>
<section id="home" class="diwan-page" hidden>
  <div class="section-head diwan-page-head">
    <div>
      <h2>إضافة قضية</h2>
      <p>ألصق رقم القضية ووصفها لتحليلها ومراجعتها قبل الحفظ.</p>
    </div>
  </div>
  <div class="card diwan-entry">
    <label class="form-label" for="input">رقم القضية ووصفها</label>
    <textarea id="input" placeholder="مثال:&#10;حادث&#10;8789797">
    </textarea>
    <div class="bar">
      <button class="btn btn-primary" data-diwan-click="runAnalysis">تحليل القضية ←</button>
    </div>
  </div>
  <div id="preview">
  </div>
</section>
<section id="cases" class="diwan-page" hidden>
  <div class="section-head diwan-page-head">
    <div>
      <h2>القضايا المحفوظة <span class="badge" id="caseCounter">0</span>
      </h2>
    </div>
    <button class="btn btn-primary" data-diwan-click="newCase">+ إضافة قضية</button>
  </div>
  <div class="seg diwan-case-tabs" aria-label="حالة مراجعة القضايا">
    <button class="casesTabBtn" data-tab="all" data-diwan-click="setCasesTab" data-diwan-value="all">جميع القضايا</button>
    <button class="casesTabBtn" data-tab="needs_review" data-diwan-click="setCasesTab" data-diwan-value="needs_review">تحتاج مراجعة <span class="badge" id="tabNeedsReviewCount">
    </span>
    </button>
    <button class="casesTabBtn" data-tab="classified" data-diwan-click="setCasesTab" data-diwan-value="classified">تمت مراجعتها</button>
  </div>
  <div class="diwan-searchbar">
    <input class="search" id="search" aria-label="البحث في القضايا" placeholder="ابحث بالرقم أو النص أو التصنيف" data-diwan-input="renderCases" >
    <button class="icon-button diwan-filter-button" id="filterIconBtn" aria-controls="filterPanel" aria-expanded="false" data-diwan-click="toggleFilterPanel" title="تصفية" aria-label="تصفية القضايا">
    <span class="dot">
    </span>⚲</button>
    <div class="exportMenuWrap">
      <button class="icon-button diwan-filter-button" id="diwanExportButton" aria-controls="exportMenu" aria-expanded="false" data-diwan-click="toggleExportMenu" title="تصدير" aria-label="خيارات التصدير">⭳</button>
      <div class="exportMenu" id="exportMenu">
        <button class="btn btn-soft" data-diwan-click="exportWordFromMenu">تصدير إلى Word</button>
        <button class="btn btn-soft" data-diwan-click="exportNumbersFromMenu">تصدير أرقام القضايا TXT</button>
        <button class="btn btn-soft" data-diwan-click="exportBackupFromMenu">نسخة احتياطية JSON</button>
      </div>
    </div>
  </div>
  <div id="filterPanel" class="filterpanel" style="display:none">
  </div>
  <div id="quickReviewBar">
  </div>
  <div id="caseList">
  </div>
</section>
<section id="taxonomy" class="diwan-page" hidden>
  <div class="section-head diwan-page-head">
    <div>
      <h2>دليل التصنيفات</h2>
    </div>
  </div>
  <div id="tree" class="tree">
  </div>
</section>
<section id="trash" class="diwan-page" hidden>
  <div class="section-head diwan-page-head">
    <div>
      <h2>سلة المحذوفات</h2>
    </div>
  </div>
  <div id="trashList">
  </div>
</section>
<section id="settings" class="diwan-page" hidden>
  <div class="section-head diwan-page-head">
    <div>
      <h2>إعدادات الديوان</h2>
    </div>
  </div>
  <div id="diwan-security-settings">
  </div>
  <article class="card">
    <h3>النسخة الاحتياطية</h3>
    <p>صدّر نسخة من القضايا أو استورد نسخة سابقة. يتجاوز الاستيراد القضايا الموجودة.</p>
    <div class="diwan-actions">
      <button class="btn btn-soft" data-diwan-click="exportData">تصدير JSON</button>
      <button class="btn btn-primary" data-diwan-click="chooseBackup">استيراد نسخة</button>
      <input hidden id="importFile" type="file" accept="application/json" data-diwan-change="importData">
      <button class="btn btn-soft" data-diwan-click="chooseWord">استيراد Word</button>
      <input hidden id="wordFile" type="file" accept=".docx" data-diwan-change="handleWordFile">
    </div>
  </article>
  <details class="card diwan-advanced">
    <summary>أدوات التصنيف والصيانة</summary>
    <div>
      <article class="card">
        <h3>إعادة تدقيق جميع التصنيفات السابقة</h3>
        <p>يفحص كل قضاياك (وليس فقط التي تحتاج مراجعة) ويقترح تصحيحات إن وُجدت، دون تغيير أي شيء آليًا. القضايا التي يبدو تصنيفها صحيحًا لا تُضاف لأي طابور.</p>
        <div style="margin-top:15px">
          <button class="btn btn-soft" data-diwan-click="runFullReaudit">تشغيل إعادة التدقيق الشامل</button>
        </div>
      </article>
      <article class="card">
        <h3>إعادة تحليل القضايا غير المصنفة</h3>
        <p>بعد أي تحسين لمحرك التصنيف، استخدم هذا الزر لإعادة تصنيف القضايا التي وقعت سابقًا في "غير مصنف بدقة" فقط — دون حذف أي قضية أو تغيير رقمها أو نصها الأصلي.</p>
        <div style="margin-top:15px">
          <button class="btn btn-primary" id="btnReanalyze" data-diwan-click="reanalyzeUnclassified">إعادة تحليل القضايا غير المصنفة</button>
        </div>
      </article>
      <article class="card">
        <h3>إضافة شهر الأرشفة الهجري للقضايا القديمة</h3>
        <p>قضاياك المضافة قبل هذه الميزة ليس لها بعد شهر أرشفة هجري. هذا الترحيل يحسب الشهر الهجري (أم القرى) بناءً على تاريخ الإضافة الفعلي المحفوظ (createdAt) لكل قضية — دون تغيير رقمها أو وصفها أو تصنيفها أو تاريخ إنشائها. يعرض معاينة أولًا ولا ينفّذ شيئًا قبل موافقتك.</p>
        <div style="margin-top:15px">
          <button class="btn btn-soft" data-diwan-click="previewHijriMigration">معاينة إضافة شهر الأرشفة</button>
        </div>
      </article>
      <article class="card">
        <h3>تحليل نظام التصنيف الجديد (قراءة فقط)</h3>
        <p>يحسب عدد قضاياك الفعلية تحت كل تصنيف قديم، ويطبّق عليها جدول Mapping. لا يُحدَّث أو يُغيَّر أي تصنيف لأي قضية عند الضغط على هذا الزر.</p>
        <div style="margin-top:15px">
          <button class="btn btn-soft" data-diwan-click="analyzeNewTaxonomyMigration">معاينة التصنيفات</button>
        </div>
      </article>
      <article class="card">
        <h3>إصلاح نصوص قضايا قديمة (تعطّلت بسبب خلل قديم في القارئ)</h3>
        <p>الصق هنا نفس القائمة الأصلية الصحيحة التي كتبتها سابقًا. لن يُطبَّق أي تغيير قبل مراجعتك للمعاينة والموافقة عليها صراحة.</p>
        <textarea id="migrationInput" style="width:100%;min-height:140px;margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:10px;font:inherit" placeholder="الصق هنا القائمة الأصلية الكاملة بنفس صيغتك المعتادة...">
        </textarea>
        <div style="margin-top:12px">
          <button class="btn btn-soft" id="btnMigrationPreview" data-diwan-click="previewMigration">معاينة الإصلاح (بدون أي تغيير فعلي)</button>
        </div>
      </article>
    </div>
  </details>
</section>
<dialog id="reportModal" class="diwan-dialog" aria-label="تقرير ديوان القضايا">
  <div id="reportModalBox">
  </div>
</dialog>
<dialog id="caseDetailModal" class="diwan-dialog" aria-label="تفاصيل القضية">
  <div id="caseDetailBox">
  </div>
</dialog>`;
