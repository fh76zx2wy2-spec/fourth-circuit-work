import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays, ChevronDown, Clock, Download, Loader2, Plus, Shuffle, Trash2,
  Users, AlertTriangle, CheckCircle2, Scale, History, Search, Upload, Archive, LogOut, ArrowLeftRight,
} from "lucide-react";
import {
  CLERKS, HOURS, MINUTES, END_TIMES, MIN_COUNT, MAX_COUNT, type Hearing, newId, clampTime,
  countBy, pad, periodLabel, defaultEndTime, resolvedEndTime, formatTime12, formatTimeRange, nextHearingStart, sortChrono, todayRiyadh, formatDates,
} from "@/lib/schedule";
import {
  type HistoryData, type DayRecord,
  blankDay, normalizeDay, isDate, dayIsFinal, historicalDays,
  distributeFairly, assignAdditionalFairly, hasAssignmentSpacingConflict,
} from "@/lib/history";
import { isSaudiWorkday } from "@/lib/domain";
import { apologyErrorMessage, deleteDay, exportDatabaseBackup, getProfile, loadEmployees, loadHistory, loadWeeklySummary, restoreDatabaseBackup, saveApology, saveDay, saveErrorMessage, signOut, type DbEmployee, type Profile, type WeeklyRow } from "@/lib/repository";


function initialState(): HistoryData {
  const today = todayRiyadh();
  return { version: 2, selectedDate: today, days: { [today]: blankDay() } };
}

export function Index() {
  const [data, setData] = useState<HistoryData>(initialState);
  const [storageWarning, setStorageWarning] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [historyMsg, setHistoryMsg] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dbEmployees, setDbEmployees] = useState<DbEmployee[]>([]);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string, "draft" | "approved">>({});
  const [creators, setCreators] = useState<Record<string, string>>({});
  const [remoteReady, setRemoteReady] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [swapTarget, setSwapTarget] = useState<Hearing | null>(null);
  const [replacement, setReplacement] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapError, setSwapError] = useState("");
  const [confirmRedistribution, setConfirmRedistribution] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getProfile(), loadEmployees(), loadHistory()]).then(([p, employees, loaded]) => {
      if (!active) return;
      setProfile(p); setDbEmployees(employees); setData(loaded.history); setVersions(loaded.versions); setStatuses(loaded.statuses); setCreators(loaded.creators); setRemoteReady(true);
    }).catch(() => { if (active) setStorageWarning(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!remoteReady) return;
    void loadWeeklySummary(data.selectedDate).then(setWeekly).catch(() => setWeekly([]));
  }, [data.selectedDate, remoteReady]);


  const date = data.selectedDate;
  const day = data.days[date] ?? blankDay();
  const { hearings, active, distributed } = day;
  const dates = useMemo(() => formatDates(date), [date]);
  const counts = useMemo(() => countBy(hearings, active), [hearings, active]);
  const invalid = distributed && !dayIsFinal(day);
  const ready = dayIsFinal(day);
  const vals = Object.values(counts);
  const balanced = vals.length ? Math.max(...vals) - Math.min(...vals) <= 1 : false;
  const spacingConflict = distributed && hasAssignmentSpacingConflict(hearings.map(hearing => hearing.clerk).filter((name): name is string => Boolean(name)));
  const workday = isSaudiWorkday(date);
  const totalDays = useMemo(() => historicalDays(data.days), [data.days]);
  const pastDates = useMemo(() => {
    return Object.entries(data.days).filter(([d, record]) => {
      if (!dayIsFinal(record)) return false;
      return historySearch ? d === historySearch : true;
    }).sort(([a], [b]) => b.localeCompare(a));
  }, [data.days, historySearch]);

  function updateDay(callback: (value: DayRecord) => DayRecord) {
    setData(prev => {
      const old = prev.days[prev.selectedDate] ?? blankDay();
      return { ...prev, days: { ...prev.days, [prev.selectedDate]: callback(old) } };
    });
  }
  function selectDate(nextDate: string) {
    if (!isDate(nextDate)) return;
    setData(prev => ({
      ...prev, selectedDate: nextDate,
      days: prev.days[nextDate] ? prev.days : { ...prev.days, [nextDate]: blankDay() },
    }));
    setMsg(null); setHistoryMsg("");
  }
  const setCount = (n: number) => {
    const c = Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(Number.isFinite(n) ? n : 0)));
    setData(prev => {
      const d = prev.days[prev.selectedDate] ?? blankDay();
      if (d.hearings.length === c) return prev;
      if (c < d.hearings.length) {
        return { ...prev, days: { ...prev.days, [prev.selectedDate]: { ...d, hearings: d.hearings.slice(0, c) } } };
      }
      const extraCount = c - d.hearings.length;
      const latestMinutes = d.hearings.reduce((max, h) => Math.max(max, h.h * 60 + h.m), 7 * 60 + 30);
      const assigned = d.distributed
        ? assignAdditionalFairly(d.hearings, extraCount, d.active, prev.days, prev.selectedDate)
        : [];
      const added = Array.from({ length: extraCount }, (_, k) => {
        const minutes = Math.min(latestMinutes + (k + 1) * 30, 14 * 60);
        const clerk = assigned[k] ?? null;
        const start = { h: Math.floor(minutes / 60), m: minutes % 60 };
        const end = defaultEndTime(start);
        return { id: newId(), ...start, endH: end.h, endM: end.m, clerk, originalClerk: clerk };
      });
      return { ...prev, days: { ...prev.days, [prev.selectedDate]: { ...d, hearings: [...d.hearings, ...added] } } };
    });
  };
  const removeRow = (id: string) => {
    if (!hearings.length) return;
    updateDay(d => {
      const remaining = d.hearings.filter(h => h.id !== id);
      return { ...d, hearings: remaining, distributed: d.distributed && remaining.length > 0 && remaining.every(h => h.clerk) };
    });
  };
  const updateRow = (id: string, patch: Partial<Hearing>) => updateDay(d => ({
    ...d, hearings: d.hearings.map(h => {
      if (h.id !== id) return h;
      const n = { ...h, ...patch };
      return { ...n, ...clampTime(n.h, n.m) };
    }),
  }));
  const toggleClerk = (c: string) => updateDay(d => ({
    ...d, active: d.active.includes(c) ? d.active.filter(x => x !== c) : CLERKS.filter(x => x === c || d.active.includes(x)),
    hearings: d.hearings.map(h => ({ ...h, clerk: null, originalClerk: null })), distributed: false,
  }));
  const performDraw = () => {
    if (!active.length) return;
    setData(prev => {
      const current = prev.days[prev.selectedDate];
      if (!current || !current.active.length) return prev;
      const assigned = distributeFairly(current.hearings.length, current.active, prev.days, prev.selectedDate);
      return { ...prev, days: {
        ...prev.days,
        [prev.selectedDate]: {
          ...current, hearings: current.hearings.map((h, i) => ({ ...h, clerk: assigned[i] ?? null, originalClerk: assigned[i] ?? null })), distributed: true,
        },
      }};
    });
  };
  const draw = () => {
    if (distributed) {
      setConfirmRedistribution(true);
      return;
    }
    performDraw();
  };
  async function saveRemote(status: "draft" | "approved" = "draft") {
    try {
      if (!remoteReady) throw new Error("لم يكتمل تحميل قاعدة البيانات بعد.");
      if (!workday) throw new Error("outside_work_week");
      const ids = new Map(dbEmployees.map(e => [e.name, e.id]));
      const result = await saveDay({
        date, ...(versions[date] === undefined ? {} : { expectedVersion: versions[date] }), status,
        absentEmployeeIds: CLERKS.filter(name => !active.includes(name)).map(name => ids.get(name)).filter((id): id is string => Boolean(id)),
        hearings: hearings.map((h, position) => {
          const end = resolvedEndTime(h);
          return ({
          id: h.id, position: position + 1, starts_at: `${pad(h.h)}:${pad(h.m)}:00`, ends_at: nextHearingStart(h, hearings) ? null : `${pad(end.h)}:${pad(end.m)}:00`,
          original_assignee_id: (h.originalClerk ?? h.clerk) ? ids.get((h.originalClerk ?? h.clerk)!) ?? null : null,
          actual_assignee_id: h.clerk ? ids.get(h.clerk) ?? null : null,
          status: "scheduled" as const,
        });}),
      });
      setVersions(v => ({ ...v, [date]: result.version }));
      setStatuses(v => ({ ...v, [date]: result.status as "draft" | "approved" }));
      setCreators(v => v[date] || !profile ? v : ({ ...v, [date]: profile.display_name }));
      setWeekly(await loadWeeklySummary(date));
      setMsg({ ok: true, text: status === "approved" ? "تم الحفظ والاعتماد في قاعدة البيانات." : "تم الحفظ في قاعدة البيانات." });
    } catch (error) {
      setMsg({ ok: false, text: saveErrorMessage(error) });
      throw error;
    }
  }
  async function submitSwap() {
    if (!swapTarget?.clerk || !replacement) return;
    if (!workday) { setSwapError("لا يمكن تسجيل تبديل لجلسات الجمعة أو السبت. اختر يوم عمل من الأحد إلى الخميس."); return; }
    setSwapBusy(true); setSwapError("");
    try {
      await saveRemote("draft");
      const ids = new Map(dbEmployees.map(e => [e.name, e.id]));
      if (!ids.get(replacement)) throw new Error("invalid_replacement");
      await saveApology({ hearingId: swapTarget.id, originalId: ids.get(swapTarget.originalClerk ?? swapTarget.clerk)!, replacementId: ids.get(replacement)!, reason: swapReason });
      updateRow(swapTarget.id, { clerk: replacement });
      setWeekly(await loadWeeklySummary(date));
      setSwapTarget(null); setReplacement(""); setSwapReason(""); setSwapError("");
      setMsg({ ok: true, text: "تم حفظ الاعتذار والتبديل في قاعدة البيانات." });
    } catch (error) { setSwapError(apologyErrorMessage(error)); }
    finally { setSwapBusy(false); }
  }
  const resetAll = () => {
    const today = todayRiyadh();
    if (dayIsFinal(data.days[today] ?? blankDay()) && !window.confirm("يوجد توزيع محفوظ لهذا اليوم، هل تريد تهيئته من جديد؟ لن تُحذف سجلات الأيام الأخرى.")) return;
    setData(prev => ({ ...prev, selectedDate: today, days: { ...prev.days, [today]: blankDay() } }));
    setHistorySearch(""); setMsg(null);
  };
  async function deleteRecord(target: string) {
    if (!window.confirm(`هل تريد حذف سجل يوم ${target} وإحصاءاته فقط؟ لن تتأثر بقية الأيام، ولا يمكن التراجع عن الحذف.`)) return;
    try {
      await deleteDay(target);
      setData(prev => { const days = { ...prev.days }; delete days[target]; if (prev.selectedDate === target) days[target] = blankDay(); return { ...prev, days }; });
      setVersions(prev => { const next = { ...prev }; delete next[target]; return next; });
      setStatuses(prev => { const next = { ...prev }; delete next[target]; return next; });
      setCreators(prev => { const next = { ...prev }; delete next[target]; return next; });
      try { setWeekly(await loadWeeklySummary(date)); } catch { setWeekly([]); }
      setHistoryMsg("تم حذف سجل اليوم من قاعدة البيانات.");
    } catch { setHistoryMsg("تعذّر حذف السجل."); }
  }
  async function backup() {
    try {
    const databaseBackup = await exportDatabaseBackup();
    const blob = new Blob([JSON.stringify(databaseBackup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `نسخة-احتياطية-جلسات-الدائرة-الرابعة-${todayRiyadh()}.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    setHistoryMsg("تم تنزيل النسخة الاحتياطية.");
    } catch { setHistoryMsg("تعذّر إنشاء النسخة الاحتياطية من قاعدة البيانات."); }
  }
  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error("large");
      const value: unknown = JSON.parse(await file.text());
      if (profile?.role !== "admin") throw Error("admin");
      const parsed = value as { format?: string; version?: number; data?: { hearing_days?: unknown[] } };
      if (parsed.format !== "fourth-circuit-backup" || parsed.version !== 3 || !Array.isArray(parsed.data?.hearing_days)) throw Error("invalid");
      if (!window.confirm(`استعادة نسخة تحتوي على ${parsed.data.hearing_days.length} يومًا؟ ستُدمج السجلات المتطابقة.`)) return;
      await restoreDatabaseBackup(value);
      const loaded = await loadHistory(); setData(loaded.history); setVersions(loaded.versions); setStatuses(loaded.statuses); setCreators(loaded.creators);
      setHistoryMsg("تم استعادة السجلات بنجاح.");
    } catch { setHistoryMsg("تعذّرت قراءة النسخة الاحتياطية. تأكد من اختيار ملف JSON الصحيح."); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }

  // Export (the original image design stays intact).
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"" | "save">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const filename = `توزيع-جلسات-الدائرة-الرابعة-${date}.png`;
  const canManageHearings = profile?.role === "admin";

  async function renderPng(): Promise<Blob> {
    const node = cardRef.current;
    if (!node) throw new Error("no card");
    await document.fonts.ready;
    const { toBlob } = await import("html-to-image");
    const opts = { pixelRatio: 2, cacheBust: true, width: node.offsetWidth, height: node.offsetHeight };
    let blob: Blob | null = null;
    try { blob = await toBlob(node, opts); } catch { blob = await toBlob(node, { ...opts, skipFonts: true }); }
    if (!blob) throw new Error("empty");
    return blob;
  }
  async function save() {
    setBusy("save"); setMsg(null);
    try {
      await saveRemote(statuses[date] ?? "draft");
      const blob = await renderPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMsg({ ok: true, text: "تم حفظ الصورة بنجاح." });
    } catch {
      setMsg({ ok: false, text: "تعذّر حفظ البيانات أو إنشاء الصورة. لم يُعرض نجاح لأن العملية لم تكتمل." });
    } finally { setBusy(""); }
  }
  return (
    <div className="min-h-screen pb-44 lg:pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-5 flex justify-end">
        <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary" aria-label="تسجيل الخروج">
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>

      <main className="mx-auto max-w-7xl px-4 sm:px-5 py-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <section className="space-y-5 min-w-0">
          <Panel icon={<CalendarDays className="size-5" />} title="تاريخ الجلسات">
            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-center">
              <label className="block">
                <span className="sr-only">التاريخ</span>
                <input type="date" lang="en-US" value={date} onChange={(e) => e.target.value && selectDate(e.target.value)}
                  onClick={(event) => {
                    const input = event.currentTarget;
                    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || typeof input.showPicker !== "function") return;
                    try {
                      input.showPicker();
                      event.preventDefault();
                    } catch {
                      // Keep the browser's native date interaction if the picker cannot be opened here.
                    }
                  }}
                  className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <p className="text-sm sm:text-base leading-7">
                <b className="text-primary">{dates.weekday}</b> الموافق {dates.hijri} <span className="text-gold">|</span> {dates.greg}
              </p>
            </div>
            {!workday && <Alert tone="warn">الجمعة والسبت خارج أيام عمل الدائرة. اختر يومًا من الأحد إلى الخميس للحفظ والتوزيع.</Alert>}
            {statuses[date] === "approved" && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-success/15 px-3 py-2 text-xs font-bold text-success">
                <CheckCircle2 className="size-5" /> تم اعتماد جلسات اليوم
              </div>
            )}
          </Panel>

          <Panel icon={<Clock className="size-5" />} title="الجلسات وأوقاتها">
            {!hearings.length && (
              <p className="rounded-xl border border-dashed border-gold bg-accent/40 p-4 text-center text-sm text-muted-foreground">
                {canManageHearings ? "لا توجد جلسات بعد. أضف الجلسات واحدةً واحدة." : "لم يضف المشرف جلسات اليوم بعد."}
              </p>
            )}
            <ol className="space-y-2">
              {hearings.map((h, i) => {
                const next = nextHearingStart(h, hearings);
                const finalEnd = resolvedEndTime(h);
                return (
                <li key={h.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-center rounded-xl border border-border bg-muted/50 p-3 animate-in fade-in">
                  <span className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">الجلسة {i + 1}</span>
                  <button type="button" onClick={() => removeRow(h.id)} disabled={!canManageHearings} aria-label={`حذف الجلسة ${i + 1}`}
                    className="sm:order-last grid place-items-center size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 transition">
                    <Trash2 className="size-4" />
                  </button>
                  <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">الساعة
                      <Select disabled={!canManageHearings} label={`ساعة الجلسة ${i + 1}`} value={h.h} onChange={(v) => updateRow(h.id, { h: Number(v) })}>
                        {HOURS.map((x) => <option key={x} value={x}>{pad(x)} {periodLabel(x)}</option>)}
                      </Select>
                    </label>
                    <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">الدقيقة
                      <Select disabled={!canManageHearings} label={`دقائق الجلسة ${i + 1}`} value={h.m} onChange={(v) => updateRow(h.id, { m: Number(v) })}>
                        {MINUTES.map((x) => <option key={x} value={x} disabled={h.h === 14 && x !== 0}>{pad(x)}</option>)}
                      </Select>
                    </label>
                    {next ? <span className="col-span-2 px-1 text-[11px] text-muted-foreground">النهاية تلقائيًا: {formatTime12(next.h, next.m)}</span> : (
                      <label className="col-span-2 text-[11px] font-semibold text-muted-foreground">نهاية الجلسة الأخيرة
                        <Select disabled={!canManageHearings} label="وقت نهاية الجلسة الأخيرة" value={`${finalEnd.h}:${pad(finalEnd.m)}`} onChange={(value) => { const [endH, endM] = value.split(":").map(Number); if (endH !== undefined && endM !== undefined) updateRow(h.id, { endH, endM }); }}>
                          {END_TIMES.filter((time) => time.h * 60 + time.m > h.h * 60 + h.m).map((time) => <option key={`${time.h}:${time.m}`} value={`${time.h}:${pad(time.m)}`}>{formatTime12(time.h, time.m)}</option>)}
                        </Select>
                      </label>
                    )}
                  </div>
                  <div className="min-w-0 col-span-2 sm:col-span-1">
                    {distributed ? (
                      <Select label={`موظف الجلسة ${i + 1}`} value={h.clerk && active.includes(h.clerk) ? h.clerk : ""} onChange={(v) => updateRow(h.id, { clerk: v || null, originalClerk: v || null })}>
                        <option value="">— بدون —</option>
                        {active.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    ) : <span className="text-xs text-muted-foreground px-2">لم يُوزَّع بعد</span>}
                    {distributed && h.clerk && <button type="button" onClick={() => { setSwapTarget(h); setReplacement(""); setSwapReason(""); setSwapError(""); }} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary underline"><ArrowLeftRight className="size-3" /> اعتذار / تبديل</button>}
                  </div>
                </li>
              );})}
            </ol>
            {canManageHearings && <button type="button" onClick={() => setCount(hearings.length + 1)} disabled={hearings.length >= MAX_COUNT}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-gold px-4 py-2 text-sm font-medium text-primary hover:bg-accent disabled:opacity-40 transition">
              <Plus className="size-4" /> إضافة جلسة
            </button>}
          </Panel>

          {profile?.role === "admin" && (
            <p className="-mt-3 px-1 text-xs text-muted-foreground">
              منشئ جدول هذا اليوم: <b className="text-primary">{creators[date] ?? "لم يُحفظ الجدول بعد"}</b>
            </p>
          )}

          <Panel icon={<Users className="size-5" />} title="الموظفون المتاحون اليوم">
            <ul className="grid sm:grid-cols-2 gap-2">
              {CLERKS.map((c) => {
                const on = active.includes(c);
                return (
                  <li key={c}>
                    <button type="button" role="switch" aria-checked={on} onClick={() => toggleClerk(c)}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-start transition ${on ? "border-gold bg-accent" : "border-border bg-card opacity-70"}`}>
                      <span className="font-medium text-sm">{c}</span>
                      <span className="flex items-center gap-2">
                        {distributed && on && <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">{counts[c] ?? 0}</span>}
                        <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-primary" : "bg-input"}`}>
                          <span className={`absolute top-0.5 size-5 rounded-full bg-card transition-all ${on ? "right-0.5" : "right-[1.375rem]"}`} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!active.length && <Alert tone="error">لا يوجد موظف متاح. فعّل موظفًا واحدًا على الأقل للتوزيع.</Alert>}
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="الجلسات" value={hearings.length} />
            <Stat label="الموظفون" value={active.length} />
            <Stat label="التوازن" value={!distributed ? "—" : invalid ? "ناقص" : balanced ? "متوازن" : "يدوي"} />
          </div>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            <CheckCircle2 className="inline size-4 align-middle text-success" /> العدالة عبر الأيام مفعّلة؛ الجلسات الزائدة للأقل نصيبًا في أيام حضوره. {totalDays > 0 ? `(${totalDays} يوم محفوظ)` : ""}
          </p>

          {invalid && <Alert tone="warn">هناك جلسات غير مسندة، اضغط «إعادة التوزيع» أو أسندها يدويًا.</Alert>}
          {spacingConflict && <Alert tone="warn">تعذّر تطبيق تفضيلات تباعد الجلسات بالكامل بعدد الموظفين المتاحين، أو أن التعديل اليدوي خالفها.</Alert>}
          {ready && !balanced && <Alert tone="warn">التعديل اليدوي جعل التوزيع غير متساوٍ (فرق أكثر من جلسة).</Alert>}
          {storageWarning && <Alert tone="error">تعذّر تحميل بيانات توزيع الجلسات. لا تعتمد التعديل قبل عودة الاتصال ونجاح الحفظ.</Alert>}

          <div className="hidden lg:flex flex-wrap gap-3">
            <Actions {...{ distributed, ready, busy, draw, save, saveData: saveRemote, canApprove: profile?.role === "admin" || profile?.can_approve === true, disabled: !hearings.length || !active.length || !remoteReady || !workday }} />
          </div>
          {msg && <Alert tone={msg.ok ? "ok" : "error"}>{msg.text}</Alert>}

          {/* Closed by default: doesn't make the normal workflow look busy. */}
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <button type="button" aria-expanded={historyExpanded} onClick={() => setHistoryExpanded(v => !v)}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-start gap-3 hover:bg-muted/50 transition">
              <span className="flex items-center gap-2 text-base font-bold text-primary"><History className="size-5 text-gold" /> سجل الأيام السابقة</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">{totalDays} يوم <ChevronDown className={`size-5 transition-transform ${historyExpanded ? "rotate-180" : ""}`} /></span>
            </button>
            {historyExpanded && (
              <div className="px-4 sm:px-5 pb-5 border-t border-border">
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium"><Search className="size-4 text-gold" /> ابحث بالتاريخ</label>
                  <input type="date" lang="en-US" aria-label="البحث في سجل الأيام بالتاريخ الميلادي" value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)} className="h-11 rounded-xl border border-input bg-card px-3 text-sm min-w-0" />
                  {historySearch && <button type="button" onClick={() => setHistorySearch("")} className="text-sm text-primary underline">إظهار كل السجلات</button>}
                </div>
                <div className="mt-3 max-h-72 overflow-y-auto space-y-2" aria-label="نتائج البحث">
                  {pastDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 rounded-xl bg-muted/50">لا توجد جلسات محفوظة للتاريخ المحدد.</p>
                  ) : pastDates.map(([d, record]) => {
                    const f = formatDates(d);
                    return (
                      <div key={d} className="flex items-center gap-2 justify-between rounded-xl border border-border p-3">
                        <div className="min-w-0 text-sm"><b className="block text-primary">{f.weekday}، {f.greg}</b>
                          <span className="text-xs text-muted-foreground">{f.hijri} · {record.hearings.length} جلسة</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={() => selectDate(d)} className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm">عرض</button>
                          <button type="button" onClick={() => void deleteRecord(d)} aria-label={`حذف سجل ${d}`}
                            className="rounded-lg border border-border px-2 py-2 text-destructive" title="حذف السجل"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-4 items-center">
                  <button type="button" onClick={() => selectDate(todayRiyadh())} className="inline-flex items-center gap-2 rounded-lg border border-gold px-3 py-2 text-sm font-semibold text-primary">العودة لليوم</button>
                  <button type="button" onClick={() => void backup()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Archive className="size-4" /> نسخة احتياطية</button>
                  {profile?.role === "admin" && <button type="button" onClick={() => importRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><Upload className="size-4" /> استعادة نسخة</button>}
                  <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-label="استعادة ملف النسخة الاحتياطية" onChange={e => void restoreBackup(e.target.files?.[0])} />
                </div>
                {historyMsg && <p role="status" className="mt-2 text-xs text-muted-foreground">{historyMsg}</p>}
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">السجلات محفوظة في قاعدة بيانات مشتركة ومحمية، وتظهر للحسابات المصرح لها من الأجهزة المختلفة.</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <button type="button" aria-expanded={summaryExpanded} onClick={() => setSummaryExpanded(v => !v)} className="w-full flex items-center justify-between p-4 sm:p-5 text-start gap-3 hover:bg-muted/50 transition">
              <span className="flex items-center gap-2 text-base font-bold text-primary"><Scale className="size-5 text-gold" /> ملخص الأسبوع والتعويضات</span>
              <ChevronDown className={`size-5 transition-transform ${summaryExpanded ? "rotate-180" : ""}`} />
            </button>
            {summaryExpanded && <div className="border-t border-border p-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted-foreground"><th className="text-start p-2">الموظف</th><th>الجلسات</th><th>التغطية</th><th>التعويض المعلق</th></tr></thead><tbody>{weekly.map(row => <tr key={row.employee_id} className="border-t border-border"><td className="p-2 font-medium">{row.employee_name}</td><td className="text-center">{row.actual_count}</td><td className="text-center">{row.covered_count}</td><td className="text-center">{Math.max(0, row.pending_compensation)}</td></tr>)}</tbody></table>{weekly.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات محفوظة لهذا الأسبوع.</p>}</div>}
          </div>
          <button type="button" onClick={resetAll} className="text-xs text-muted-foreground underline underline-offset-4">بدء يوم جديد (دون حذف السجل)</button>
        </section>

        <section className="lg:sticky lg:top-4 space-y-3 min-w-0" aria-label="معاينة الصورة">
          <h2 className="text-sm font-semibold text-muted-foreground">معاينة الصورة المحفوظة</h2>
          {ready ? (
            <ScaledPreview>
              <ExportCard ref={cardRef} hearings={sortChrono(hearings)} dates={dates} active={active} counts={counts} />
            </ScaledPreview>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gold/60 bg-card p-10 text-center shadow-card">
              <Scale className="size-12 mx-auto text-gold" />
              <p className="mt-4 text-base font-semibold text-primary">أدخل الأوقات ثم اضغط توزيع الجلسات</p>
              <p className="mt-1 text-sm text-muted-foreground">ستظهر هنا الصورة كما ستُحفظ تمامًا.</p>
            </div>
          )}
        </section>
      </main>

      <div className="lg:hidden fixed inset-x-0 bottom-[calc(71px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-card/95 backdrop-blur p-3 grid grid-cols-2 gap-2">
        <Actions {...{ distributed, ready, busy, draw, save, saveData: saveRemote, canApprove: profile?.role === "admin" || profile?.can_approve === true, disabled: !hearings.length || !active.length || !remoteReady || !workday }} compact />
      </div>
      {confirmRedistribution && <div className="fixed inset-0 z-50 grid place-items-center bg-navy-deep/60 p-4" role="dialog" aria-modal="true" aria-label="تأكيد إعادة التوزيع"><div className="w-full max-w-sm rounded-2xl bg-card p-5 text-center shadow-xl"><AlertTriangle className="mx-auto size-11 text-warning" /><h2 className="mt-3 text-base font-bold text-primary">هل أنت متأكد من إعادة التوزيع؟</h2><p className="mt-2 text-sm text-muted-foreground">سيُعاد توزيع جميع جلسات اليوم من جديد.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setConfirmRedistribution(false); performDraw(); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">نعم، أعد التوزيع</button><button type="button" onClick={() => setConfirmRedistribution(false)} className="rounded-xl border border-border px-4 py-2 text-sm">إلغاء</button></div></div></div>}
      {swapTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-navy-deep/60 p-4" role="dialog" aria-modal="true" aria-label="اعتذار أو تبديل"><div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl"><h2 className="text-lg font-bold text-primary">اعتذار / تبديل</h2><p className="mt-1 text-sm text-muted-foreground">الموظف الأصلي: {swapTarget.originalClerk ?? swapTarget.clerk}</p><label className="mt-4 block text-sm font-medium">الموظف البديل<select value={replacement} onChange={e => { setReplacement(e.target.value); setSwapError(""); }} className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3"><option value="">اختر البديل</option>{active.filter(name => name !== (swapTarget.originalClerk ?? swapTarget.clerk)).map(name => <option key={name}>{name}</option>)}</select></label><label className="mt-3 block text-sm font-medium">السبب (اختياري)<input value={swapReason} onChange={e => setSwapReason(e.target.value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0))))} maxLength={500} className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3" /></label>{!workday && <p className="mt-3 text-sm text-warning">الجمعة والسبت خارج أيام عمل الدائرة؛ اختر تاريخ يوم عمل أولًا.</p>}{swapError && <p role="alert" className="mt-3 text-sm text-destructive">{swapError}</p>}<div className="mt-5 flex gap-2"><button type="button" disabled={!replacement || swapBusy || !workday} onClick={() => void submitSwap()} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40">{swapBusy && <Loader2 className="size-4 animate-spin" />}{swapBusy ? "جارٍ الحفظ..." : "حفظ"}</button><button type="button" disabled={swapBusy} onClick={() => setSwapTarget(null)} className="rounded-xl border border-border px-4 py-2 disabled:opacity-40">إلغاء</button></div></div></div>}
    </div>
  );
}

function Actions(p: { distributed: boolean; ready: boolean; busy: string; disabled: boolean; draw: () => void; save: () => void; saveData: (status?: "draft" | "approved") => Promise<void>; canApprove: boolean; compact?: boolean }) {
  return (
    <>
      <button type="button" onClick={p.draw} disabled={p.disabled}
        className={`${p.compact ? "col-span-2" : "flex-1"} inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 h-11 text-sm font-semibold shadow-card hover:brightness-110 active:scale-[0.98] disabled:opacity-40 transition`}>
        <Shuffle className="size-5" /> {p.distributed ? "إعادة التوزيع" : "توزيع الجلسات عشوائيًا"}
      </button>
      <button type="button" onClick={p.save} disabled={!p.ready || p.disabled || !!p.busy}
        className={`${p.compact && !p.canApprove ? "col-span-2" : "flex-1"} inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-navy-deep px-4 h-11 text-sm font-semibold hover:brightness-105 active:scale-[0.98] disabled:opacity-40 transition`}>
        {p.busy === "save" ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
        حفظ الصورة
      </button>
      {p.canApprove && <button type="button" onClick={() => void p.saveData("approved").catch(() => {})} disabled={!p.ready || p.disabled}
        className="inline-flex items-center justify-center rounded-xl bg-success px-4 h-11 text-sm font-bold text-white shadow-card hover:brightness-105 disabled:opacity-40">اعتماد جلسات اليوم</button>}
    </>
  );
}

function Panel({ icon, title, extra, children }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-primary"><span className="text-gold">{icon}</span>{title}</h2>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="relative min-w-0">
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-input bg-card ps-3 pe-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:cursor-default disabled:opacity-70">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-4 text-gold" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="text-xl font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Alert({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-success/40 bg-success/10 text-success" : tone === "warn" ? "border-warning/50 bg-warning/10 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div role="status" className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${cls}`}>
      {tone === "ok" ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0 text-warning" />}
      <span>{children}</span>
    </div>
  );
}

const CARD_W = 800;
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!outer.current || !inner.current) return;
      setScale(Math.min(1, outer.current.clientWidth / CARD_W));
      setH(inner.current.offsetHeight);
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="w-full overflow-hidden rounded-2xl shadow-card" style={{ height: h * scale || undefined }}>
      <div ref={inner} style={{ width: CARD_W, transform: `scale(${scale})`, transformOrigin: "top right" }}>{children}</div>
    </div>
  );
}

function ScalesMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M60 12v72M40 88h40M24 26h72M60 12l-3 6h6z" />
      <path d="M24 26 10 58h28zM96 26 82 58h28z" />
      <path d="M10 58a14 8 0 0 0 28 0M82 58a14 8 0 0 0 28 0" />
    </svg>
  );
}

function Arches({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 60" className={className} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={`M${i * 50 + 5} 60V30a20 20 0 0 1 40 0v30`} />
      ))}
      <path d="M0 59h400" />
    </svg>
  );
}

const ExportCard = forwardRef<HTMLDivElement, { hearings: Hearing[]; dates: { weekday: string; hijri: string; greg: string }; active: string[]; counts: Record<string, number> }>(
  function ExportCard({ hearings, dates, active, counts }, ref) {
    return (
      <div ref={ref} id="export-card" dir="rtl" className="bg-parchment text-navy-deep font-sans" style={{ width: CARD_W }}>
        <div className="relative bg-gradient-navy text-primary-foreground px-12 pt-10 pb-8 text-center overflow-hidden">
          <Arches className="absolute bottom-0 inset-x-0 w-full h-14 text-gold opacity-20" />
          <ScalesMark className="relative mx-auto w-16 text-gold" />
          <p className="relative mt-3 text-2xl font-medium text-gold-soft">المحكمة العامة بأبي عريش</p>
          <h1 className="relative mt-1 text-5xl font-bold">الدائرة العامة الرابعة</h1>
        </div>
        <div className="gold-rule h-1" />
        <div className="px-12 py-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-navy">توزيع جلسات اليوم</h2>
            <p className="mt-4 text-2xl font-semibold">{dates.weekday} الموافق {dates.hijri}</p>
            <p className="mt-1 text-xl text-muted-foreground">{dates.greg}</p>
            <div className="mx-auto mt-5 inline-flex items-center gap-3 rounded-full border-2 border-gold px-6 py-2 text-xl font-semibold">
              إجمالي الجلسات: <span className="text-navy text-2xl font-bold">{hearings.length}</span>
            </div>
          </div>

          <table className="mt-8 w-full border-collapse text-xl">
            <thead>
              <tr className="bg-navy text-primary-foreground">
                <th className="py-3 px-4 w-24 rounded-tr-xl font-semibold">م</th>
                <th className="py-3 px-4 text-start font-semibold">الموظف المكلّف</th>
                <th className="py-3 px-4 w-44 rounded-tl-xl font-semibold">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {hearings.map((h, i) => (
                <tr key={h.id} className={i % 2 ? "bg-gold-soft/50" : "bg-card"}>
                  <td className="py-3 px-4 text-center font-bold text-navy border-b border-border">{i + 1}</td>
                  <td className="py-3 px-4 font-medium border-b border-border">{h.clerk}</td>
                  <td className="py-3 px-4 text-center font-semibold border-b border-border whitespace-nowrap">{formatTimeRange(h, hearings)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 rounded-2xl border border-gold/60 bg-card p-5">
            <h3 className="text-xl font-bold text-navy mb-3">ملخص التوزيع</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-lg">
              {active.map((c) => (
                <div key={c} className="flex items-center justify-between gap-3 border-b border-dashed border-border py-1.5">
                  <span>{c}</span>
                  <span className="rounded-full bg-navy text-primary-foreground px-3 text-base font-bold">{counts[c] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="gold-rule" />
        <div className="py-4 text-center text-base text-muted-foreground">الدائرة العامة الرابعة — المحكمة العامة بأبي عريش</div>
      </div>
    );
  },
);
