import type { Job } from "../run";
export function matchJob(_opts: { all: boolean }): Job { return async () => ({ items_seen: 0, items_new: 0, items_updated: 0 }); }
