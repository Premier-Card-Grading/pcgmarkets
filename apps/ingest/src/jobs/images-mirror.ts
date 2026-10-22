import sharp from "sharp";
import type { Job } from "../run";
import { PausedError } from "@pcg/connectors";
import { loadRemoteImageWork, setMirroredImage, uploadPublic } from "@pcg/db";

/** The same size as the Japanese card images (images:ja --size sm), which keeps the free storage tier in budget. */
const WIDTH = 274;
const UA = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})` };
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
export const storagePath = (lang: string, setId: string, id: string) => `${safe(lang)}/${safe(setId)}/${safe(id)}.webp`;

/**
 * Copies card images still served from third-party hosts (TCGdex, pokemontcg.io/scrydex) into our Supabase storage
 * (card-images bucket, where the Japanese images already are), resized to WebP, and points the cards at the copies.
 * Those hosts take 1–3 s per image; storage answers in about 50 ms. products.image_origin_url keeps the original,
 * so the copies can be moved (e.g. to R2) or redone.
 */
export function imagesMirror(opts: { fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer>; concurrency?: number } = {}): Job {
  const get = opts.fetchImpl ?? fetch;
  const toWebp = opts.toWebp ?? ((b: Buffer) => sharp(b).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
  return async ({ db, log }) => {
    const work = await loadRemoteImageWork(db);
    log(`${work.length} card images on third-party hosts`);
    let copied = 0, missing = 0, failed = 0, stopped = false;
    const queue = [...work];
    const worker = async () => {
      for (let w = queue.shift(); w && !stopped; w = queue.shift()) {
        try {
          const res = await get(w.image_url, { headers: UA });
          if (res.status === 429) { stopped = true; throw new PausedError(res.status, w.image_url); }
          if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) { missing += 1; continue; }
          const webp = await toWebp(Buffer.from(await res.arrayBuffer()));
          const url = await uploadPublic(db, "card-images", storagePath(w.language, w.set_id, w.id), webp, "image/webp");
          await setMirroredImage(db, w.id, `${url}?v=sm`, w.image_url);
          copied += 1;
        } catch (e) {
          if (e instanceof PausedError) throw e;
          failed += 1;
          log(`${w.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (copied % 500 === 0 && copied > 0) log(`${copied}/${work.length}`);
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
    log(`copied ${copied}, missing ${missing}, failed ${failed}`);
    return { items_seen: work.length, items_new: copied, items_updated: copied };
  };
}
