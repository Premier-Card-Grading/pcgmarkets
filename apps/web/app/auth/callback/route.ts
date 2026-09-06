import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/admin";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) await (await sessionClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(url.searchParams.get("next") ?? "/admin/review", url.origin));
}
