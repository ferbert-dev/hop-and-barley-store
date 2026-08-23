export function splitOriginList(value: string): string[] {
  return value.split(',').map((origin) => origin.trim());
}

export function originIsAllowed(
  configuredOrigins: string,
  presentedOrigin: string | undefined,
): boolean {
  return (
    presentedOrigin !== undefined &&
    splitOriginList(configuredOrigins).includes(presentedOrigin)
  );
}
