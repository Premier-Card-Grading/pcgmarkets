export default function Loading() {
  return <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><div className="mb-3.5 h-8 w-48 rounded-lg bg-sunk" />{[0, 1, 2].map((i) => <div key={i} className="mb-2 h-[104px] rounded-[14px] border border-line-2 bg-surface" />)}</main>;
}
