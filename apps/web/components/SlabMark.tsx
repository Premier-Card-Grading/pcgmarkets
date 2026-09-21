export function SlabMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (<svg viewBox="0 0 24 24" className={className} aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><rect x="7" y="5" width="10" height="4" rx="1" fill="var(--gold-badge)" /><rect x="7.5" y="11" width="9" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55" /></svg>);
}
