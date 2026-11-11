import { createClient } from "@supabase/supabase-js";

const url = "https://gdqktrvhnnibimgyjncn.supabase.co";
const gatewayUrl = `${url}/functions/v1/hearings-gateway`;

export type MainSession = {
  getToken: () => Promise<string | null>;
  subscribe: (listener: () => void) => () => void;
  signOut: () => Promise<void>;
};

let mainSession: MainSession;

export function configureMainSession(session: MainSession) {
  mainSession = session;
}

export function subscribeToMainSession(listener: () => void) {
  return mainSession.subscribe(listener);
}

export async function requestHearings(operation: object) {
  const token = await mainSession.getToken();
  if (!token) return Response.json({ message: "session_required" }, { status: 401 });
  return fetch(gatewayUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(operation),
  });
}

export function signOutFromMain() {
  return mainSession.signOut();
}

// PostgREST still builds the queries. Every request is authorized by the gateway.
export const supabase = createClient(url, "gateway-only", {
  accessToken: async () => null,
  global: {
    fetch: (input, init) => {
      const target = new URL(String(input));
      const headers = new Headers(init?.headers);
      return requestHearings({
        resource: target.pathname.replace(/^\/rest\/v1\//, ""),
        query: target.search,
        method: init?.method ?? "GET",
        body: init?.body,
        accept: headers.get("accept"),
        prefer: headers.get("prefer"),
      });
    },
  },
});
