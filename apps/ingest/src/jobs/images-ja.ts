import sharp from "sharp";
import type { Job } from "../run";
import { limitless, PausedError } from "@pcg/connectors";
import { loadJaImageWork, uploadPublic, setLogoUrl, setCardImage } from "@pcg/db";

const CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc";
export const cardImageUrl = (code: string, number: string, size: "SM" | "LG") => `${CDN}/${code}/${code}_${number}_R_JP_${size}.png`;
const UA = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Copies Limitless JA logos and card images into our storage. Re-runs skip what is already copied. */
export function imagesJa(opts: { size: "SM" | "LG"; fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer> }): Job {
  const get = opts.fetchImpl ?? fetch;
  const toWebp = opts.toWebp ?? ((b: Buffer) => sharp(b).webp({ quality: 80 }).toBuffer());
  return async ({ db, log }) => {
    const work = await loadJaImageWork(db, { replaceLimitless: opts.size === "LG" });
    let seen = 0, copied = 0, missing = 0;
    const fetchPng = async (url: string): Promise<Buffer | null> => {
      const res = await get(url, { headers: UA });
      if (res.status === 403 || res.status === 429) throw new PausedError(res.status, url);
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
      return Buffer.from(await res.arrayBuffer());
    };
    for (const s of work.sets) {
      seen += 1;
      const png = await fetchPng(limitless.logoUrl(s.code));
      await sleep(1000);
      if (!png) { missing += 1; continue; }
      await setLogoUrl(db, s.id, await uploadPublic(db, "set-logos", `ja/${s.id}.png`, png, "image/png"));
      copied += 1;
    }
    const queue = [...work.cards];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        seen += 1;
        const png = await fetchPng(cardImageUrl(c.code, c.number, opts.size));
        if (!png) { missing += 1; continue; }
        const url = await uploadPublic(db, "card-images", `ja/${c.set_id}/${c.id}.webp`, await toWebp(png), "image/webp");
        await setCardImage(db, c.id, url);
        copied += 1;
        await sleep(250);
      }
    };
    await Promise.all([worker(), worker()]);
    log(`copied ${copied}, missing ${missing} (logos ${work.sets.length}, cards ${work.cards.length}, size ${opts.size})`);
    return { items_seen: seen, items_new: copied, items_updated: 0 };
  };
}
