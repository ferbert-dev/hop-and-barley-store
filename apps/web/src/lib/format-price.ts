export function formatPrice(priceMinor: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    currency,
    style: 'currency',
  }).format(priceMinor / 100);
}
