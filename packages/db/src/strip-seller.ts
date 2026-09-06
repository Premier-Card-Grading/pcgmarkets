const DROP_KEY = /^(seller(_?id|_?name|_?username|_?user|_?login|_?info|_?feedback|_?rating|_?email|_?phone)?|username|user_?id|feedback(_?score)?|contact(_?email)?|email|phone)$/i;
const KEEP_KEY = /^seller_?country$/i;

export function stripSellerFields(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(stripSellerFields);
  if (raw && typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (KEEP_KEY.test(k)) { out[k] = v; continue; }
      if (DROP_KEY.test(k) && (typeof v !== "object" || v === null)) continue;
      if (DROP_KEY.test(k) && typeof v === "object") {
        const inner = stripSellerFields(v) as Record<string, unknown>;
        if (Object.keys(inner).length) out[k] = inner;
        continue;
      }
      out[k] = stripSellerFields(v);
    }
    return out;
  }
  return raw;
}
