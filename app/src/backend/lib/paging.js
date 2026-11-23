// Paginated Jira reads (P1 performance). The first page reports `total`, so the remaining pages are
// fetched in parallel (bounded) instead of one after another. If `total` is missing, pages are read
// sequentially until `isLast`. Never reads more than maxPages pages.
export async function collectPages(fetchPage, { pageSize = 50, maxPages = 20, concurrency = 4 } = {}) {
  const first = await fetchPage(0);
  const pages = [first];
  const total = Number(first?.total);
  const more = first?.isLast === false && (first.values ?? []).length > 0;
  let truncated = false;
  if (more && Number.isFinite(total) && total > pageSize) {
    const needed = Math.ceil(total / pageSize);
    const count = Math.min(maxPages, needed);
    truncated = needed > maxPages;
    const starts = Array.from({ length: count - 1 }, (_, i) => (i + 1) * pageSize);
    for (let i = 0; i < starts.length; i += concurrency) pages.push(...(await Promise.all(starts.slice(i, i + concurrency).map((s) => fetchPage(s)))));
  } else if (more) {
    for (let p = 1; ; p++) {
      if (p >= maxPages) {
        truncated = true;
        break;
      }
      const page = await fetchPage(p * pageSize);
      pages.push(page);
      if (page?.isLast !== false || !(page.values ?? []).length) break;
    }
  }
  return { pages, truncated };
}
