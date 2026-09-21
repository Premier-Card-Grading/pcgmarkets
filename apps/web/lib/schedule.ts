export const SCHEDULE = [{ cron: "5 */6 * * *", label: "ebay:sold-comps, then match and prices" }, { cron: "35 3 * * *", label: "fx:daily" }, { cron: "50 3 * * 1", label: "catalog:tcgdex" }];
export function nextRun(cron: string, now: Date): Date {
  const [m, h, , , dow] = cron.split(" "); const minute = Number(m);
  const hourOk = (x: number) => h === "*" ? true : h.startsWith("*/") ? x % Number(h.slice(2)) === 0 : x === Number(h);
  const dowOk = (d: number) => dow === "*" || d === Number(dow);
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
  for (let i = 0; i < 24 * 8; i++, t.setUTCHours(t.getUTCHours() + 1)) {
    const cand = new Date(t); cand.setUTCMinutes(minute);
    if (cand.getTime() > now.getTime() && hourOk(cand.getUTCHours()) && dowOk(cand.getUTCDay())) return cand;
  }
  throw new Error(`no run within 8 days for ${cron}`);
}
