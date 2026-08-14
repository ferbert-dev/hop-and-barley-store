export function classNames(
  ...values: readonly (false | null | string | undefined)[]
): string {
  return values.filter(Boolean).join(' ');
}
