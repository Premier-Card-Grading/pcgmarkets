import { cn } from "@/lib/utils";
const tones = { ok: "text-good bg-good-fill", warn: "text-warn bg-warn-fill", bad: "text-bad bg-bad-fill", mute: "text-mute bg-sunk" } as const;
export type Tone = keyof typeof tones;
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-[7px] pr-[9px] text-[13px] font-bold", tones[tone], className)}><span className="h-[7px] w-[7px] rounded-full bg-current" />{children}</span>;
}
