"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
export default function Login() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return (
    <form className="max-w-sm space-y-3" onSubmit={async (e) => { e.preventDefault(); await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/admin/review` } }); setSent(true); }}>
      <h1 className="text-xl font-semibold">Admin login</h1>
      <input className="w-full rounded border px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required />
      <button className="rounded bg-zinc-900 px-3 py-2 text-white">Send magic link</button>
      {sent && <div className="text-sm text-green-700">Check your email.</div>}
    </form>
  );
}
