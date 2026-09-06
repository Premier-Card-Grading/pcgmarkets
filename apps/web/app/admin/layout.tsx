import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <div className="space-y-4">
      <nav className="flex gap-4 text-sm"><Link href="/admin/review">Review queue</Link><Link href="/admin/health">Health</Link><span className="ml-auto text-zinc-500">{email}</span></nav>
      {children}
    </div>
  );
}
