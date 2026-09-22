/** Production is API-only. The desk UI stays on localhost. */
export function productionServesPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
