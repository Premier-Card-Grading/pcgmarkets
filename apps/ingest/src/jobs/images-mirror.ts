import sharp from "sharp";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Job } from "../run";
import { PausedError } from "@pcg/connectors";
import { loadRemoteImageWork, setMirroredImage } from "@pcg/db";

/** Where the web app serves static files from: apps/web/public. The card-images folder there is git-ignored. */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../../../web/public");
/** Wide enough for the 250px card image on a 2x screen. */
const WIDTH = 490;
const UA = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})` };
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
export const localImagePath = (lang: string, setId: string, id: string) => `/card-images/${safe(lang)}/${safe(setId)}/${safe(id)}.webp`;

/**
 * Copies card images still served from third-party hosts (TCGdex, pokemontcg.io/scrydex) into our own files, resized to
 * WebP, and points the cards at the copies. Those hosts take 1–3 s per image; our files load at once. A file already on
 * disk is not fetched again. Japanese images already live in our Supabase storage and are left alone.
 */
export function imagesMirror(opts: { publicDir?: string; fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer>; concurrency?: number } = {}): Job {
  const dir = opts.publicDir ?? PUBLIC;
  const get = opts.fetchImpl ?? fetch;
  const toWebp = opts.toWebp ?? ((b: Buffer) => sharp(b).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
  return async ({ db, log }) => {
    const work = await loadRemoteImageWork(db);
    log(`${work.length} card images on third-party hosts`);
    let copied = 0, reused = 0, missing = 0, failed = 0, stopped = false;
    const queue = [...work];
    const worker = async () => {
      for (let w = queue.shift(); w && !stopped; w = queue.shift()) {
        const rel = localImagePath(w.language, w.set_id, w.id), file = join(dir, rel);
        try {
          if (existsSync(file)) reused += 1;
          else {
            const res = await get(w.image_url, { headers: UA });
            if (res.status === 429) { stopped = true; throw new PausedError(res.status, w.image_url); }
            if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) { missing += 1; continue; }
            const webp = await toWebp(Buffer.from(await res.arrayBuffer()));
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, webp);
            copied += 1;
          }
          await setMirroredImage(db, w.id, rel, w.image_url);
        } catch (e) {
          if (e instanceof PausedError) throw e;
          failed += 1;
          log(`${w.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if ((copied + reused) % 500 === 0 && copied + reused > 0) log(`${copied + reused}/${work.length}`);
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
    log(`copied ${copied}, already on disk ${reused}, missing ${missing}, failed ${failed}`);
    return { items_seen: work.length, items_new: copied, items_updated: copied + reused };
  };
}
