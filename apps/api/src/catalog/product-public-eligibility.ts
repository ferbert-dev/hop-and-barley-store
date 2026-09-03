export type PublicProductEligibility = Readonly<{
  activeFrom: Date | null;
  activeUntil: Date | null;
  isActive: boolean;
}>;

export function isPublicProductEligible(
  product: PublicProductEligibility,
  evaluatedAt: Date,
): boolean {
  return (
    product.isActive &&
    (product.activeFrom === null || product.activeFrom <= evaluatedAt) &&
    (product.activeUntil === null || product.activeUntil > evaluatedAt)
  );
}
