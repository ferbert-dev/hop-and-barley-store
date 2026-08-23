export function resolveBrowserApiUrl(
  configuredApiUrl: string,
  browserOrigin: string,
  configuredHostAliases: string,
): string {
  const apiUrl = new URL(configuredApiUrl);
  const pageUrl = new URL(browserOrigin);
  const hostAliases = new Set(
    configuredHostAliases
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );

  if (
    apiUrl.protocol === pageUrl.protocol &&
    hostAliases.has(apiUrl.hostname) &&
    hostAliases.has(pageUrl.hostname)
  ) {
    apiUrl.hostname = pageUrl.hostname;
  }

  return apiUrl.toString().replace(/\/$/u, '');
}
