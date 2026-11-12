import { requestHearings, signOutFromMain, supabase } from "./supabase";
import type { HistoryData } from "./history";
import { blankDay } from "./history";
import { CLERKS, todayRiyadh } from "./schedule";

export type Profile = {
  user_id: string;
  display_name: string;
  role: "admin" | "secretary";
  can_approve: boolean;
};
export type DbEmployee = { id: string; name: string; sort_order: number };

function client() {
  if (!supabase) throw new Error("قاعدة البيانات غير مهيأة بعد.");
  return supabase;
}

export const signOut = signOutFromMain;

export function saveErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  if (/outside_work_week/i.test(message)) {
    return "لا يمكن حفظ جلسات يوم الجمعة أو السبت. اختر يومًا من الأحد إلى الخميس.";
  }
  if (/stale_version/i.test(message)) {
    return "عُدّلت البيانات من مستخدم آخر؛ حدّث الصفحة قبل إعادة المحاولة.";
  }
  if (/approval_not_allowed/i.test(message)) {
    return "اعتماد التوزيع متاح للقاضي المشرف أو للمفوّض فقط.";
  }
  if (/invalid_hearings/i.test(message)) {
    return "بيانات الجلسات غير مكتملة؛ تأكد من توزيع جميع الجلسات ثم أعد الحفظ.";
  }
  return "تعذّر الحفظ في قاعدة البيانات. لم يُعرض نجاح وهمي.";
}

export function apologyErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  if (/outside_work_week/i.test(message)) {
    return "لا يمكن تسجيل تبديل لجلسات الجمعة أو السبت. اختر يوم عمل من الأحد إلى الخميس.";
  }
  if (/time_conflict/i.test(message)) {
    return "الموظف البديل لديه جلسة أخرى في الوقت نفسه. اختر موظفًا آخر أو عدّل الوقت.";
  }
  if (/invalid_replacement/i.test(message)) {
    return "اختر موظفًا بديلًا مختلفًا عن الموظف الأصلي.";
  }
  if (/stale_version/i.test(message)) {
    return "عُدّل الاعتذار من مستخدم آخر؛ حدّث الصفحة ثم أعد المحاولة.";
  }
  return "تعذّر حفظ الاعتذار في قاعدة البيانات. أعد المحاولة بعد التحقق من الاتصال.";
}

export async function getProfile(): Promise<Profile> {
  const result = await requestHearings({ resource: "identity" });
  if (!result.ok) throw new Error("hearings_access_denied");
  return result.json() as Promise<Profile>;
}

export async function loadEmployees(): Promise<DbEmployee[]> {
  const { data, error } = await client()
    .from("employees")
    .select("id,name,sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data as DbEmployee[];
}

export async function loadHistory(): Promise<{
  history: HistoryData;
  versions: Record<string, number>;
  statuses: Record<string, "draft" | "approved">;
  creators: Record<string, string>;
}> {
  const data = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await client()
      .from("hearing_days")
      .select(`
        id,hearing_date,status,version,created_by,
        hearings(id,position,starts_at,ends_at,status,original:employees!hearings_original_assignee_id_fkey(name),actual:employees!hearings_actual_assignee_id_fkey(name)),
        day_absences(employee:employees(name))
      `)
      .order("hearing_date", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    data.push(...page);
    if (page.length < pageSize) break;
  }
  const creatorIds = [
    ...new Set((data ?? []).map((row: any) => row.created_by as string).filter(Boolean)),
  ];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length) {
    const { data: creatorProfiles, error: creatorError } = await client()
      .from("profiles")
      .select("user_id,display_name")
      .in("user_id", creatorIds);
    if (creatorError) console.warn("Hearing record creator names unavailable", creatorError.code);
    for (const creator of creatorProfiles ?? []) {
      creatorNames.set(creator.user_id, creator.display_name);
    }
  }
  const today = todayRiyadh();
  const days: HistoryData["days"] = {};
  const versions: Record<string, number> = {};
  const statuses: Record<string, "draft" | "approved"> = {};
  const creators: Record<string, string> = {};
  for (const raw of (data ?? []) as any[]) {
    const date = raw.hearing_date as string;
    const absent = new Set(
      (raw.day_absences ?? []).map((a: any) => a.employee?.name).filter(Boolean),
    );
    const hearings = [...(raw.hearings ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((h: any) => {
        const [hour = 8, minute = 0] = String(h.starts_at).split(":").map(Number);
        const [endHour, endMinute] = h.ends_at ? String(h.ends_at).split(":").map(Number) : [];
        return {
          id: h.id,
          h: hour,
          m: minute,
          ...(Number.isFinite(endHour) && Number.isFinite(endMinute) ? { endH: endHour, endM: endMinute } : {}),
          clerk: h.actual?.name ?? h.original?.name ?? null,
          originalClerk: h.original?.name ?? h.actual?.name ?? null,
        };
      });
    days[date] = {
      hearings: hearings.length ? hearings : blankDay().hearings,
      active: CLERKS.filter((name) => !absent.has(name)),
      distributed: hearings.length > 0 && hearings.every((h: any) => h.clerk),
    };
    versions[date] = Number(raw.version);
    statuses[date] = raw.status;
    creators[date] = creatorNames.get(raw.created_by) ?? "مستخدم مصرح له";
  }
  if (!days[today]) days[today] = blankDay();
  return { history: { version: 2, selectedDate: today, days }, versions, statuses, creators };
}

export async function saveDay(input: {
  date: string;
  expectedVersion?: number;
  status: "draft" | "approved";
  absentEmployeeIds: string[];
  hearings: Array<{
    id?: string;
    position: number;
    starts_at: string;
    ends_at?: string | null;
    original_assignee_id: string | null;
    actual_assignee_id: string | null;
    status?: "scheduled" | "cancelled" | "not_held";
  }>;
}) {
  const db = client();
  const hearings = input.hearings.map((h) => ({
    ...h,
    id: h.id && /^[0-9a-f-]{36}$/i.test(h.id) ? h.id : crypto.randomUUID(),
  }));
  const { data, error } = await db.rpc("save_complete_day", {
    p_date: input.date,
    p_expected_version: input.expectedVersion ?? null,
    p_status: input.status,
    p_absent_employee_ids: input.absentEmployeeIds,
    p_hearings: hearings,
  });
  if (error) throw error;
  return data as { id: string; version: number; status: string };
}

export async function saveApology(input: {
  hearingId: string;
  originalId: string;
  replacementId: string;
  reason?: string;
  expectedVersion?: number;
}) {
  const db = client();
  const { error } = await db.rpc("record_apology", {
    p_hearing_id: input.hearingId,
    p_replacement_id: input.replacementId,
    p_reason: input.reason ?? "",
    p_expected_version: input.expectedVersion ?? null,
  });
  if (error) throw error;
}

export type WeeklyRow = {
  employee_id: string;
  employee_name: string;
  actual_count: number;
  covered_count: number;
  pending_compensation: number;
};
export async function loadWeeklySummary(date: string): Promise<WeeklyRow[]> {
  const { data, error } = await client().rpc("weekly_summary", { p_date: date });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    actual_count: Number(row.actual_count),
    covered_count: Number(row.covered_count),
    pending_compensation: Number(row.pending_compensation),
  }));
}

export async function exportDatabaseBackup() {
  const db = client();
  const tables = [
    "hearing_days",
    "day_absences",
    "hearings",
    "apologies",
    "compensation_adjustments",
  ] as const;
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const response = await db.from(table).select("*");
    if (response.error) throw response.error;
    result[table] = response.data ?? [];
  }
  return {
    format: "fourth-circuit-backup",
    version: 3,
    exported_at: new Date().toISOString(),
    data: result,
  };
}

export async function restoreDatabaseBackup(payload: unknown) {
  const { error } = await client().rpc("restore_backup", { p_payload: payload });
  if (error) throw error;
}

export async function deleteDay(date: string) {
  const { error } = await client().from("hearing_days").delete().eq("hearing_date", date);
  if (error) throw error;
}
