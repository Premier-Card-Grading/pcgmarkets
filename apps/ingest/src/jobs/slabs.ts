import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Job } from "../run";
import { loadSlabWork, saveSlabFinding } from "@pcg/db";
import { readSlabLabel, pickCert, similarity, type PcgCert, type SlabFinding, type SlabLabel } from "@pcg/domain";
import { searchCerts } from "@pcg/connectors";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "../../.cache");
const CERT_CACHE_DAYS = 7;

export type CertSearch = (param: "setName" | "cardName" | "gradedId", value: string, finalGrade?: number) => Promise<PcgCert[]>;

/**
 * What PCG says about the slab in one photo, from the photo's OCR lines alone: the label PCG
 * printed, its certs in PCG's public API, and the number printed on the card. Never the title.
 */
export async function identifySlab(lines: string[], soldAt: Date, search: CertSearch): Promise<SlabFinding> {
  const read = readSlabLabel(lines);
  if (read.kind === "chinese_pcg" || read.kind === "no_label") return { status: read.kind, certs: [] };
  if (read.kind === "premier_old") {
    for (const n of read.numbers) {
      const hit = (await search("gradedId", n.padStart(9, "0"))).find((c) => read.lines.some((l) => similarity(l, c.name) >= 0.8));
      if (hit) return { status: "cert", certs: [hit] };
    }
    return { status: "old_label_cert_not_in_pcg", certs: [] };
  }
  return { ...(await identifyLabel(read.label, lines.join(" | "), soldAt, search)), read: "ocr" };
}

/** A label transcribed from the photo by an agent, as written by the vision step. */
export interface VisionRead {
  premier: boolean; name: string | null; set: string | null; rarity: string | null;
  centering: number | null; corners: number | null; edges: number | null; surface: number | null;
  gradeWord: string | null; finalGrade: number | null; cardNumber: string | null; confidence: "high" | "low";
}

/** Identifies a slab from a transcribed label. Only a confident, Premier, named reading is looked up. */
export async function identifyVision(v: VisionRead, soldAt: Date, search: CertSearch): Promise<SlabFinding | null> {
  if (!v.premier || v.confidence !== "high" || !v.name || !v.set) return null;
  const grades = [v.centering, v.corners, v.edges, v.surface, v.finalGrade].filter((g): g is number => typeof g === "number");
  const label: SlabLabel = { name: v.name, set: v.set, rarity: v.rarity, grades, gradeWord: v.gradeWord };
  return { ...(await identifyLabel(label, v.cardNumber ?? "", soldAt, search)), read: "vision" };
}

async function identifyLabel(label: SlabLabel, ocrText: string, soldAt: Date, search: CertSearch): Promise<SlabFinding> {
  // The API ANDs a final grade with setName or cardName, but ORs setName with cardName: ask within
  // the label's set for each grade it shows, and by card name only if the OCR'd set finds nothing.
  const grades = [...new Set(label.grades)];
  const ask = async (param: "setName" | "cardName", q: string) => {
    const byId = new Map<string, PcgCert>();
    for (const g of grades) for (const c of await search(param, q, g)) byId.set(c.id, c);
    return [...byId.values()];
  };
  try {
    // A series-only set ("MEGA") can match too many certs to list: then search by card name instead.
    let cands = await ask("setName", label.set).catch(() => [] as PcgCert[]);
    let r = pickCert(label, cands, ocrText, soldAt);
    if (r.status === "label_not_in_pcg") {
      const words = label.name.split(/\s+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
      for (const q of [label.name, ...words]) {
        cands = await ask("cardName", q);
        r = pickCert(label, cands, ocrText, soldAt);
        if (r.status !== "label_not_in_pcg") break;
      }
    }
    return { ...r, label };
  } catch {
    return { status: "pcg_lookup_failed", certs: [], label };
  }
}

/** PCG searches cached on disk for a week: the same set/grade comes up for many sales. */
function cachedSearch(): { search: CertSearch; save: () => void } {
  const path = join(CACHE, "pcg-certs.json");
  const cache: Record<string, { at: number; certs: PcgCert[] }> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const fresh = (e: { at: number }) => Date.now() - e.at < CERT_CACHE_DAYS * 86_400_000;
  return {
    search: async (param, value, finalGrade) => {
      const key = `${param}=${value}${finalGrade != null ? `&finalGrade=${finalGrade}` : ""}`;
      const hit = cache[key];
      if (hit && fresh(hit)) return hit.certs;
      const certs = await searchCerts(param, value, finalGrade);
      cache[key] = { at: Date.now(), certs };
      return certs;
    },
    save: () => writeFileSync(path, JSON.stringify(cache)),
  };
}

/** Builds the macOS Vision OCR tool once. */
async function ocrTool(): Promise<string> {
  const bin = join(CACHE, "slab-ocr");
  const src = join(HERE, "../../tools/slab-ocr.swift");
  if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) await run("swiftc", ["-O", src, "-o", bin]);
  return bin;
}

const fullSize = (url: string) => url.replace(/s-l\d+(\.\w+)$/, "s-l1600$1");

export function slabsJob(opts: { all: boolean }): Job {
  return async ({ db, log }) => {
    mkdirSync(join(CACHE, "slabs"), { recursive: true });
    const work = await loadSlabWork(db, opts);
    log(`reading ${work.length} slab photo(s)`);
    const ocr = await ocrTool();
    const { search, save } = cachedSearch();
    const tally: Record<string, number> = {};
    let done = 0;
    try {
      for (const w of work) {
        let finding: SlabFinding;
        const img = join(CACHE, "slabs", `${w.sourceItemId}.jpg`);
        const text = join(CACHE, "slabs", `${w.sourceItemId}.json`);
        const url = w.imageUrls[0];
        if (!url) finding = { status: "no_photo", certs: [] };
        else {
          if (!existsSync(img)) {
            const res = await fetch(fullSize(url), { signal: AbortSignal.timeout(30_000) });
            if (!res.ok) throw new Error(`photo ${w.sourceItemId}: ${res.status}`);
            writeFileSync(img, Buffer.from(await res.arrayBuffer()));
          }
          if (!existsSync(text)) writeFileSync(text, (await run(ocr, [img])).stdout);
          const lines = JSON.parse(readFileSync(text, "utf8")) as string[];
          const soldAt = new Date(`${(w.soldAt ?? new Date().toISOString()).slice(0, 10)}T23:59:59Z`);
          // An agent's transcription of the label (vision step), when there is one, replaces the OCR's.
          const vision = join(CACHE, "slabs", `${w.sourceItemId}.vision.json`);
          const byVision = existsSync(vision) ? await identifyVision(JSON.parse(readFileSync(vision, "utf8")) as VisionRead, soldAt, search) : null;
          finding = byVision ?? await identifySlab(lines, soldAt, search);
        }
        await saveSlabFinding(db, w.id, { ...w.metadata, pcg: finding });
        tally[finding.status] = (tally[finding.status] ?? 0) + 1;
        if (++done % 50 === 0) { save(); log(`${done}/${work.length} ${JSON.stringify(tally)}`); }
      }
    } finally {
      save();
    }
    log(JSON.stringify(tally));
    return { items_seen: work.length, items_new: (tally.cert ?? 0) + (tally.card_certain_cert_shared ?? 0), items_updated: work.length };
  };
}
