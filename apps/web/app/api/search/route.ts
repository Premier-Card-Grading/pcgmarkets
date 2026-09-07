import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase-server";
import { searchProducts } from "@/lib/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json(await searchProducts(anonClient(), q));
}
