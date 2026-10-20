import type { Db } from "../client";

export async function uploadPublic(db: Db, bucket: "set-logos" | "card-images", path: string, body: Buffer, contentType: string): Promise<string> {
  const { error } = await db.storage.from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
