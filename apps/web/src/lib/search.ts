export function parseSearch(search: Record<string, unknown>) {
  return {
    q: typeof search.q === 'string' ? search.q.slice(0, 100) : '',
    sort: search.sort === 'status' ? ('status' as const) : ('name' as const),
    desc: search.desc === true || search.desc === 'true',
  };
}
