"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewItemData } from "@/lib/review";
import { ReviewItem } from "./ReviewItem";

export function ReviewList({ items, total }: { items: ReviewItemData[]; total: number }) {
  const [active, setActive] = useState(0);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=combobox], [contenteditable]")) return;
      const k = e.key.toLowerCase();
      const el = document.querySelectorAll("[data-review-item]")[active] as HTMLElement | undefined;
      if (k === "j") setActive((a) => Math.min(a + 1, items.length - 1));
      else if (k === "k") setActive((a) => Math.max(a - 1, 0));
      else if (k === "a") (el?.querySelector("[data-action=assign]") as HTMLButtonElement | null)?.click();
      else if (k === "r") (el?.querySelector("[data-action=reject]") as HTMLButtonElement | null)?.click();
      else if (k === "s") setActive((a) => Math.min(a + 1, items.length - 1));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length]);

  useEffect(() => {
    (document.querySelectorAll("[data-review-item]")[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (items.length === 0) return <p className="m-0 text-[15px] text-mute">Queue is empty. Nothing needs a decision right now.</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <ReviewItem key={it.id} item={it} active={i === active} onDone={() => router.refresh()} onSkip={() => setActive(Math.min(i + 1, items.length - 1))} />
        ))}
      </div>
      <p className="mt-3.5 text-[13px] text-mute">
        Showing {items.length} of {total}. Decisions here override the matcher on every future run.
      </p>
    </>
  );
}
