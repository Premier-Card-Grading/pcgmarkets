import type { CertRecord } from "@pcg/domain";

const BASE = "https://app.premiercardgrading.com/public/api/v1/gradings";

export async function lookupCert(input: string, opts: { timeoutMs?: number } = {}): Promise<CertRecord | null> {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const gradedId = digits.padStart(9, "0");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetch(`${BASE}?gradedId=${gradedId}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const rec = (Array.isArray(body) ? body[0] : (body as { data?: unknown[] })?.data?.[0]) as Record<string, unknown> | undefined;
    if (!rec || rec.gradedId !== gradedId) return null;
    const info = (rec.cardInfo ?? {}) as Record<string, unknown>;
    return {
      gradedId, setName: String(rec.setName ?? ""), cardNumber: String(rec.cardNumber ?? info.number ?? ""),
      language: String(info.language ?? ""), finalGrade: typeof rec.finalGrade === "number" ? rec.finalGrade : null, grade: String(rec.grade ?? ""),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
