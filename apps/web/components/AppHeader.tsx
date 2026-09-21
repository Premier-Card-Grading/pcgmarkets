import Link from "next/link";
import { SlabMark } from "./SlabMark";
import { SearchField } from "./SearchField";
import { cn } from "@/lib/utils";
type Admin = { email: string; reviewCount: number; current: "review" | "health" };
export function AppHeader({ variant, search, admin }: { variant: "public" | "admin"; search?: { value?: string; show?: boolean }; admin?: Admin }) {
  return (
    <header className="bg-bar text-bar-ink">
      <div className="mx-auto flex min-h-[60px] max-w-[1120px] items-center gap-[18px] px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-[9px] whitespace-nowrap text-lg font-extrabold tracking-[-0.01em] wdth-105 no-underline"><SlabMark /><span className={cn(variant === "admin" && "max-md:hidden")}>PCG Markets</span></Link>
        {variant === "public" && search?.show !== false && <SearchField variant="header" initialQuery={search?.value} placeholder={search?.value ? undefined : "Search another card"} className="hidden md:flex flex-1 max-w-[460px]" />}
        {variant === "admin" && admin && (
          <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Admin">
            <NavLink href="/admin/review" current={admin.current === "review"}>Review <span className="rounded-full bg-gold-badge px-[7px] py-px text-[11.5px] font-extrabold text-badge-ink tnum">{admin.reviewCount}</span></NavLink>
            <NavLink href="/admin/health" current={admin.current === "health"}>Health</NavLink>
            <span className="hidden px-2 text-[13px] text-bar-mute md:inline whitespace-nowrap">{admin.email}</span>
            <NavLink href="/auth/signout">Sign out</NavLink>
          </nav>)}
      </div>
    </header>);
}
function NavLink({ href, current, children }: { href: string; current?: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={current ? "page" : undefined} className={cn("inline-flex min-h-10 items-center gap-[7px] rounded-lg px-2 md:px-2.5 font-medium no-underline", current ? "bg-bar-field text-bar-ink" : "text-bar-mute")}>{children}</Link>;
}
