import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Index } from "@/Hearings";
import { blankDay } from "@/lib/history";
import { CLERKS } from "@/lib/schedule";
import { getProfile, loadEmployees, loadHistory, saveDay } from "@/lib/repository";

vi.mock("@/lib/repository", () => ({
  getProfile: vi.fn(),
  loadEmployees: vi.fn(),
  loadHistory: vi.fn(),
  loadWeeklySummary: vi.fn(async () => []),
  saveDay: vi.fn(async () => ({ version: 1, status: "approved" })),
  apologyErrorMessage: vi.fn(),
  saveErrorMessage: vi.fn(),
  deleteDay: vi.fn(),
  exportDatabaseBackup: vi.fn(),
  restoreDatabaseBackup: vi.fn(),
  saveApology: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/schedule", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/schedule")>(),
  todayRiyadh: () => "2026-11-15",
}));
vi.mock("html-to-image", () => ({ toBlob: vi.fn(async () => new Blob(["schedule"], { type: "image/png" })) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["secretary", "admin"] as const)("lets an authorized %s prepare and share an approved distribution", async (role) => {
  vi.mocked(getProfile).mockResolvedValue({ user_id: "account", display_name: "مستخدم", role, can_approve: true });
  vi.mocked(loadEmployees).mockResolvedValue(CLERKS.map((name, i) => ({ id: String(i), name, sort_order: i })));
  vi.mocked(loadHistory).mockResolvedValue({
    history: { version: 2, selectedDate: "2026-11-15", days: { "2026-11-15": blankDay() } },
    versions: {}, statuses: {}, creators: {},
  });
  const share = vi.fn(async () => {});
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });

  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  render(<Index />);
  const add = await screen.findByRole("button", { name: "إضافة جلسة" });
  fireEvent.click(add);
  fireEvent.click(add);
  fireEvent.change(screen.getByLabelText("دقائق الجلسة 1"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "حذف الجلسة 2" }));
  fireEvent.click(screen.getAllByRole("button", { name: "توزيع الجلسات عشوائيًا" })[0]!);
  fireEvent.click(screen.getAllByRole("button", { name: "اعتماد وتجهيز الإرسال" })[0]!);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "إرسال الصورة" })[0]).toBeEnabled());
  expect(saveDay).toHaveBeenLastCalledWith(expect.objectContaining({
    status: "approved",
    hearings: [expect.objectContaining({ starts_at: "08:05:00", actual_assignee_id: expect.any(String) })],
  }));
  fireEvent.click(screen.getAllByRole("button", { name: "إرسال الصورة" })[0]!);
  await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] })));
});
