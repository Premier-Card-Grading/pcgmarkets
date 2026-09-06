import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { serviceClient } from "./supabase-server";

export async function sessionClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (all: { name: string; value: string; options: CookieOptions }[]) => { for (const c of all) store.set(c.name, c.value, c.options); } },
  });
}

export async function requireAdmin(): Promise<{ email: string }> {
  const sb = await sessionClient();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) redirect("/admin-login");
  const { data: row } = await serviceClient().from("admin_users").select("email").eq("email", email).maybeSingle();
  if (!row) redirect("/admin-login?denied=1");
  return { email };
}
