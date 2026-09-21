import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/admin";
export async function GET(req: Request) { const sb = await sessionClient(); await sb.auth.signOut(); return NextResponse.redirect(new URL("/admin-login", req.url)); }
