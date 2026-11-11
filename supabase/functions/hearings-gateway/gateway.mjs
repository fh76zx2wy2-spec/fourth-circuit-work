const allowedTables = new Map([
  ["profiles", ["GET"]],
  ["employees", ["GET"]],
  ["hearing_days", ["GET", "DELETE"]],
  ["hearings", ["GET"]],
  ["day_absences", ["GET"]],
  ["apologies", ["GET"]],
  ["compensation_adjustments", ["GET"]],
  ["rpc/save_complete_day", ["POST"]],
  ["rpc/record_apology", ["POST"]],
  ["rpc/weekly_summary", ["POST"]],
  ["rpc/restore_backup", ["POST"]],
]);

export function validateOperation(value) {
  if (!value || typeof value !== "object") return false;
  if (!allowedTables.get(value.resource)?.includes(value.method)) return false;
  if (typeof value.query !== "string" || (value.query && !value.query.startsWith("?"))) return false;
  if (value.method === "DELETE") {
    const params = new URLSearchParams(value.query);
    if (params.size !== 1 || !/^eq\.\d{4}-\d{2}-\d{2}$/.test(params.get("hearing_date") ?? "")) return false;
  }
  return true;
}

export function createGateway({ origin, authorize, forward }) {
  return async function gateway(request) {
    const headers = { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
    const json = (status, message) => Response.json({ message }, { status, headers });
    if (request.headers.get("origin") !== origin) return json(403, "origin_denied");
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" },
    });
    if (request.method !== "POST") return json(405, "method_denied");
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, "session_required");

    try {
      const identity = await authorize(authorization.slice(7));
      if (!identity) return json(403, "hearings_access_denied");
      const operation = await request.json().catch(() => null);
      if (operation?.resource === "identity") return Response.json(identity.profile, { headers });
      if (!validateOperation(operation)) return json(400, "invalid_operation");
      const response = await forward(identity, operation);
      for (const name of ["content-type", "content-range"]) {
        const value = response.headers.get(name);
        if (value) headers[name] = value;
      }
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return json(502, "hearings_unavailable");
    }
  };
}
