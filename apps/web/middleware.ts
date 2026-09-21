import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (all: { name: string; value: string; options: CookieOptions }[]) => { for (const c of all) res.cookies.set(c.name, c.value, c.options); } },
  });
  await sb.auth.getUser();
  return res;
}
export const config = { matcher: ["/admin/:path*"] };
