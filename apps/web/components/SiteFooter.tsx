export function SiteFooter({ credit = true }: { credit?: boolean }) {
  return (<footer className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-y-1.5 gap-x-6 border-t border-line-2 px-5 pt-4 pb-6 text-xs leading-[1.55] text-mute">
    <span className="min-w-[240px] flex-1">Not affiliated with eBay or LY Corporation. Prices are observed sales, not offers.</span>
    {credit && <span className="min-w-[240px] flex-1">Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from TCGdex.</span>}
  </footer>);
}
