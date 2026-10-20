/** Supabase caps a select at 1000 rows by default; page until a short page comes back. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const r = await page(from, from + size - 1);
    if (r.error) throw new Error(r.error.message);
    const rows = r.data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
