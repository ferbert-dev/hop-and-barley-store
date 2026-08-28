const STATIC_PRODUCT_IMAGE_PATH =
  /^\/assets\/products\/[a-z0-9]+(?:-[a-z0-9]+)*[.]webp$/;
const UPLOADED_PRODUCT_IMAGE_PATH =
  /^\/product-assets\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$/;

export function isProductImagePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (STATIC_PRODUCT_IMAGE_PATH.test(value) ||
      UPLOADED_PRODUCT_IMAGE_PATH.test(value))
  );
}

export function isUploadedProductImagePath(value: unknown): value is string {
  return typeof value === 'string' && UPLOADED_PRODUCT_IMAGE_PATH.test(value);
}
