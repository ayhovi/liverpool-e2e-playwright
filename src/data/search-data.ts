export interface SearchCase {
  term: string;
  color: string;
}

export function getSearchCases(): SearchCase[] {
  const terms = (process.env.SEARCH_TERMS ?? process.env.SEARCH_TERM ?? 'playstation 5')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const color = process.env.FILTER_COLOR?.trim() || 'Blanco';
  return terms.map((term) => ({ term, color }));
}
