"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Login() {
  const [email, setEmail] = useState(""); const [state, setState] = useState<"idle" | "sent" | "error">("idle"); const [err, setErr] = useState("");
  const denied = useSearchParams().get("denied") === "1";
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  async function send(e?: React.FormEvent) { e?.preventDefault(); const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/admin/review` } }); if (error) { setErr(error.message); setState("error"); } else setState("sent"); }
  return (<>
    <AppHeader variant="public" search={{ show: false }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><div className="mx-auto mt-8 max-w-[420px]">
      <h1 className="m-0 mb-1.5 text-[34px] font-extrabold tracking-[-0.03em]">Sign in to admin</h1>
      <p className="m-0 mb-[22px] text-[15px] text-mute">We email you a link. There is no password.</p>
      {denied && <div className="mb-4 rounded-xl bg-bad-fill px-3.5 py-3 text-sm font-medium text-bad">That address is not an admin on this project.</div>}
      {state === "error" && <div className="mb-4 rounded-xl bg-bad-fill px-3.5 py-3 text-sm font-medium text-bad">{err}</div>}
      <form onSubmit={send} className="flex flex-col gap-4 rounded-2xl border border-line-2 bg-surface p-[22px] shadow-object">
        <div className="flex flex-col gap-1.5"><label htmlFor="login-email" className="text-[13px] font-semibold text-ink-2">Email</label><Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required /><span className="text-[12.5px] text-mute">Only the admin address on this project receives a link.</span></div>
        <Button type="submit" className="w-full">Email me a sign-in link</Button>
      </form>
      {state === "sent" && <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-good-fill px-3.5 py-3 text-sm text-good"><Check size={18} strokeWidth={2.4} className="mt-px shrink-0" /><div>Link sent. Open it on this device within 10 minutes. Nothing arrived? Check spam, then <button type="button" onClick={() => send()} className="font-semibold text-teal underline">send another</button>.</div></div>}
    </div></main>
    <SiteFooter credit={false} />
  </>);
}

export default function Page() {
  return (<Suspense><Login /></Suspense>);
}
