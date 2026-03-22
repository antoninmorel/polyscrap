export const buildUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, string | number>
): string => {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};
