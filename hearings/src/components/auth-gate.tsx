import { useEffect, useState, type ReactNode } from "react";
import { getProfile, type Profile } from "@/lib/repository";
import { subscribeToMainSession } from "@/lib/supabase";

export function AuthGate({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>();
  useEffect(() => {
    let version = 0;
    function check() {
      const current = ++version;
      setProfile(undefined);
      void getProfile().then(
        value => { if (current === version) setProfile(value); },
        () => { if (current === version) setProfile(null); },
      );
    }
    const unsubscribe = subscribeToMainSession(check);
    check();
    return () => { version++; unsubscribe(); };
  }, []);

  if (profile) return <div key={profile.user_id}>{children}</div>;
  if (profile === undefined) return <p className="auth-panel" role="status">جارٍ التحقق من صلاحية توزيع الجلسات…</p>;
  return (
    <div className="auth-panel">
      <h1>توزيع الجلسات</h1>
      <p role="alert">تعذّر فتح توزيع الجلسات بهذا الحساب. حدّث الصفحة ثم أعد المحاولة.</p>
    </div>
  );
}
