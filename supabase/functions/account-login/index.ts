import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "https://fh76zx2wy2-spec.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const url = Deno.env.get("SUPABASE_URL")!;
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth });
const usernames = new Set(["abdulrahman", "yahya", "ziyad"]);
const respond = (status: number, body: object) => Response.json(body, { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = typeof body?.password === "string"
    ? body.password.replace(/[٠-٩۰-۹]/g, (digit: string) =>
      String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)))
    : "";
  if (!usernames.has(username) || !password || password.length > 128) {
    return respond(401, { error: "invalid_credentials" });
  }

  const { data: account, error: lookupError } = await admin.rpc("begin_account_login", { p_username: username });
  if (lookupError) return respond(503, { error: "unavailable" });
  if (account?.limited) return respond(429, { error: "rate_limited" });
  if (!account?.email || !account.pepper) return respond(401, { error: "invalid_credentials" });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(account.pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(username + ":" + password));
  const credential = Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, "0")).join("");
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth });
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: credential });
  if (error?.status === 429) return respond(429, { error: "rate_limited" });
  if (error || !data.session || data.user.id !== account.user_id) return respond(401, { error: "invalid_credentials" });
  return respond(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
