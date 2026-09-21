export function SectionHead({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="mb-3.5 flex items-center justify-between gap-3"><h2 className="text-[22px] font-extrabold tracking-[-0.02em] m-0">{title}</h2>{children ?? (aside && <span className="text-[13.5px] font-medium text-mute">{aside}</span>)}</div>;
}
