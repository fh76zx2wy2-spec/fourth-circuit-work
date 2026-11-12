import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { createGateway } from "./gateway.mjs";

const mainUrl = "https://fgthgaawdccdhejogchw.supabase.co";
const mainKey = Deno.env.get("MAIN_PUBLISHABLE_KEY") ?? "sb_publishable_Z7tArTafwL3TyVWv6ks5qw_gGDUwcq6";
const hearingsUrl = Deno.env.get("SUPABASE_URL")!;
const hearingsPublicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(hearingsUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
type Profile = { user_id: string; display_name: string; role: string; can_approve: boolean };

async function authorize(token: string) {
  const main = createClient(mainUrl, mainKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await main.auth.getUser(token);
  if (error || !user || user.is_anonymous) return null;
  const { data: account } = await main.from("profiles").select("id,is_active")
    .eq("id", user.id).eq("is_active", true).maybeSingle();
  if (!account) return null;
  const { data: mapped, error: mappingError } = await admin.rpc("get_hearings_account", { account_id: user.id });
  if (mappingError) throw mappingError;
  if (!mapped) return null;
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("user_id,display_name,role,can_approve").eq("user_id", mapped).maybeSingle<Profile>();
  if (profileError) throw profileError;
  return profile ? { profile } : null;
}

const inFlight = new Map<string, Promise<string>>();
async function issueAccessToken(userId: string) {
  const { data: { user }, error: lookupError } = await admin.auth.admin.getUserById(userId);
  if (lookupError || !user?.email) throw new Error("missing_hearings_account");
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (linkError || !link.properties.hashed_token) throw new Error("hearing_session_failed");
  const auth = createClient(hearingsUrl, hearingsPublicKey, { auth: authOptions });
  const { data: signedIn, error } = await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || signedIn.user?.id !== userId || !signedIn.session) throw new Error("hearing_session_failed");
  const accessToken = signedIn.session.access_token;
  const encoded = accessToken.split(".")[1];
  const claims = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
  const { error: registrationError } = await admin.rpc("register_hearings_gateway_session", {
    p_session_id: claims.session_id,
    p_user_id: userId,
  });
  const { error: revokeError } = await auth.auth.signOut({ scope: "local" });
  if (registrationError) throw registrationError;
  if (revokeError) throw revokeError;
  return accessToken;
}

function serverToken(userId: string) {
  const current = inFlight.get(userId);
  if (current) return current;
  const token = issueAccessToken(userId);
  inFlight.set(userId, token);
  setTimeout(() => { if (inFlight.get(userId) === token) inFlight.delete(userId); }, 30_000);
  void token.catch(() => { if (inFlight.get(userId) === token) inFlight.delete(userId); });
  return token;
}

Deno.serve(createGateway({
  origin: Deno.env.get("CIRCUIT_SITE_ORIGIN") ?? "https://fh76zx2wy2-spec.github.io",
  authorize,
  async forward({ profile }: { profile: Profile }, operation: {
    resource: string; query: string; method: string; body?: string; accept?: string; prefer?: string;
  }) {
    const accessToken = await serverToken(profile.user_id);
    const url = new URL(`/rest/v1/${operation.resource}`, hearingsUrl);
    url.search = operation.query;
    return fetch(url, {
      method: operation.method,
      headers: {
        apikey: hearingsPublicKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: operation.accept ?? "application/json",
        "Content-Type": "application/json",
        Prefer: operation.prefer ?? "",
      },
      body: operation.method === "POST" ? operation.body : undefined,
      redirect: "error",
    });
  },
}));
