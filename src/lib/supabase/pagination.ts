export const DEFAULT_PAGE_SIZE = 1_000;

export interface PagedQueryError {
  message: string;
}

export interface PagedQueryResult<T> {
  data: T[] | null;
  error: PagedQueryError | null;
}

export interface PagedQuery<T> {
  range(from: number, to: number): PromiseLike<PagedQueryResult<T>>;
}

/**
 * Supabase projects commonly cap a response at 1,000 rows even when a larger
 * range is requested. Rebuild the query for each page so period totals never
 * silently ignore later rows.
 */
export async function fetchAllRows<T>(
  createQuery: () => PagedQuery<T>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<PagedQueryResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await createQuery().range(from, from + pageSize - 1);

    if (result.error) {
      return { data: null, error: result.error };
    }

    const page = result.data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}
