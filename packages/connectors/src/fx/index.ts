import { politeFetch } from "../http";

export async function fetchRates(date: string, bases: string[]) {
  const out: { date: string; base: string; quote: "USD"; rate: number }[] = [];
  for (const base of [...new Set(bases)].sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : 0))) {
    if (base === "USD") { out.push({ date, base, quote: "USD", rate: 1 }); continue; }
    const res = await politeFetch(`https://api.frankfurter.dev/v1/${date}?base=${base}&symbols=USD`, { minIntervalMs: 200 });
    if (!res.ok) throw new Error(`frankfurter ${res.status} for ${base}`);
    const body = (await res.json()) as { date: string; rates: { USD?: number } };
    if (body.rates?.USD != null) out.push({ date: body.date, base, quote: "USD", rate: body.rates.USD });
  }
  return out;
}
