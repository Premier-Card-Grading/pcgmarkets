import sharp from "sharp";
import type { Job } from "../run";
import { limitless, PausedError } from "@pcg/connectors";
import { loadJaImageWork, uploadPublic, setLogoUrl, setCardImage } from "@pcg/db";

const CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc";
export const cardImageUrl = (code: string, number: string, size: "SM" | "LG") => `${CDN}/${code}/${code}_${number}_R_JP_${size}.png`;
const UA = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Copies Limitless JA logos and card images into our storage. Re-runs skip what is already copied. */
export function imagesJa(opts: { size: "SM" | "LG"; fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer>; sleep?: (ms: number) => Promise<void> }): Job {
  const get = opts.fetchImpl ?? fetch;
  const wait = opts.sleep ?? sleep;
  const toWebp = opts.toWebp ?? ((b: Buffer) => sharp(b).webp({ quality: 80 }).toBuffer());
  const version = opts.size === "LG" ? "lg" : "sm";
  return async ({ db, log }) => {
    const work = await loadJaImageWork(db, { replaceLimitless: opts.size === "LG" });
    let seen = 0, copied = 0, missing = 0, failed = 0;
    let stopped = false;
    // These image hosts answer 403 for objects that do not exist, so 403 means "missing".
    // Only 429 pauses at once; a long run of 403s is checked against a known-good probe.
    let run403 = 0;
    const fetchPng = async (url: string): Promise<Buffer | null> => {
      const res = await get(url, { headers: UA });
      if (res.status === 429) { stopped = true; throw new PausedError(res.status, url); }
      if (res.status === 403) {
        run403 += 1;
        if (run403 >= 20) {
          const probeUrl = limitless.logoUrl("SV11B");
          const probe = await get(probeUrl, { headers: UA });
          if (probe.status === 403 || probe.status === 429) { stopped = true; throw new PausedError(probe.status, probeUrl); }
          run403 = 0;
        }
        return null;
      }
      run403 = 0;
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
      return Buffer.from(await res.arrayBuffer());
    };
    for (const s of work.sets) {
      if (stopped) break;
      seen += 1;
      try {
        const png = await fetchPng(limitless.logoUrl(s.code));
        if (!png) missing += 1;
        else {
          await setLogoUrl(db, s.id, await uploadPublic(db, "set-logos", `ja/${s.id}.png`, png, "image/png"));
          copied += 1;
        }
      } catch (e) {
        if (e instanceof PausedError) throw e;
        failed += 1;
        log(`logo ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await wait(1000);
    }
    const queue = [...work.cards];
    const worker = async () => {
      for (let c = queue.shift(); c && !stopped; c = queue.shift()) {
        seen += 1;
        try {
          const png = await fetchPng(cardImageUrl(c.code, c.number, opts.size));
          if (!png) missing += 1;
          else {
            const url = await uploadPublic(db, "card-images", `ja/${c.set_id}/${c.id}.webp`, await toWebp(png), "image/webp");
            await setCardImage(db, c.id, `${url}?v=${version}`);
            copied += 1;
          }
        } catch (e) {
          if (e instanceof PausedError) throw e;
          failed += 1;
          log(`card ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await wait(250);
      }
    };
    await Promise.all([worker(), worker()]);
    log(`copied ${copied}, missing ${missing}, failed ${failed} (logos ${work.sets.length}, cards ${work.cards.length}, size ${opts.size})`);
    return { items_seen: seen, items_new: copied, items_updated: 0 };
  };
}
