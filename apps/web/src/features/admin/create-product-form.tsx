'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { Field, Select } from '../../components/ui/field';
import { revalidateProductViews } from './admin-product-actions';
import type { AdminProductCreateOptions } from './admin-product-create-server';
import type { AdminEditableProduct } from './admin-product-edit-server';
import {
  createAdminProductFromBrowser,
  type AdminProductCreated,
} from './admin-product-create-transport';
import {
  initialLocalDateTime,
  validateAdminProductCreate,
  validateAdminProductUpdate,
  type AdminProductSaleKind,
} from './admin-product-create-validation';
import { updateAdminProductFromBrowser } from './admin-product-update-transport';
import styles from './create-product.module.css';

type FormState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ errors: Record<string, string>; kind: 'invalid' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'success'; product: AdminProductCreated }>
  | Readonly<{ kind: 'unavailable' }>;

export function CreateProductForm({
  options,
  product,
}: Readonly<{
  options: AdminProductCreateOptions;
  product?: AdminEditableProduct;
}>) {
  const router = useRouter();
  const [saleKind, setSaleKind] = useState<AdminProductSaleKind>(
    product?.saleKind === 'PACKAGE' || product?.saleKind === 'KIT'
      ? product.saleKind
      : 'WEIGHT',
  );
  const [image, setImage] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  if (state.kind === 'success') {
    return (
      <section className={styles.success} role="status" tabIndex={-1}>
        <h2>Product {product ? 'updated' : 'created'}</h2>
        <p>
          The product is ready for review in the catalog when its activation
          settings allow it.
        </p>
        <div className={styles.actions}>
          <Button href={`/product/${state.product.slug}`}>View product</Button>
          <Button href="/admin/products" variant="secondary">
            Back to product management
          </Button>
        </div>
      </section>
    );
  }

  const errors = state.kind === 'invalid' ? state.errors : {};
  const pending = state.kind === 'submitting';

  return (
    <form
      aria-describedby={
        state.kind === 'unavailable' ? 'product-form-error' : undefined
      }
      className={styles.form}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const formData = new FormData(event.currentTarget);
        const input = {
          activeFrom: String(formData.get('activeFrom') ?? ''),
          activeUntil: String(formData.get('activeUntil') ?? ''),
          categoryId: String(formData.get('categoryId') ?? ''),
          description: String(formData.get('description') ?? ''),
          image,
          isActive: formData.get('isActive') === 'true',
          kitYieldLitres: String(formData.get('kitYieldLitres') ?? ''),
          name: String(formData.get('name') ?? ''),
          packageNetWeightGrams: String(
            formData.get('packageNetWeightGrams') ?? '',
          ),
          price: String(formData.get('price') ?? ''),
          saleKind,
          stock: String(formData.get('stock') ?? ''),
          teaser: String(formData.get('teaser') ?? ''),
        };
        setState({ kind: 'submitting' });
        try {
          if (product) {
            const validation = validateAdminProductUpdate(
              input,
              product.updatedAt,
            );
            if (!validation.ok) {
              setState({ errors: validation.errors, kind: 'invalid' });
              return;
            }
            await updateAdminProductFromBrowser(product.id, validation.value);
            await revalidateProductViews().catch(() => undefined);
            setState({ kind: 'success', product });
          } else {
            const validation = validateAdminProductCreate(input);
            if (!validation.ok) {
              setState({ errors: validation.errors, kind: 'invalid' });
              return;
            }
            const created = await createAdminProductFromBrowser(
              validation.value,
            );
            await revalidateProductViews().catch(() => undefined);
            setState({ kind: 'success', product: created });
          }
          router.refresh();
        } catch {
          setState({ kind: 'unavailable' });
        }
      }}
    >
      <fieldset disabled={pending}>
        <legend className="visually-hidden">
          {product ? 'Edit product' : 'Create product'}
        </legend>
        {state.kind === 'unavailable' ? (
          <p
            className={styles.errorSummary}
            id="product-form-error"
            role="alert"
          >
            The product could not be saved safely. Reload the editor if it was
            changed elsewhere, then try again.
          </p>
        ) : null}

        <div className={styles.grid}>
          <div className={styles.imagePanel}>
            <h2>Product image</h2>
            <p>JPEG, PNG, or WebP. Maximum file size: 5 MiB.</p>
            {previewUrl || product?.imagePath ? (
              // The selected upload is a local blob URL, which Next Image does
              // not optimize. The server receives and validates the original file.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected product image preview"
                className={styles.preview}
                src={previewUrl ?? product?.imagePath}
              />
            ) : (
              <div
                aria-label="No product image selected"
                className={styles.previewEmpty}
              >
                Image preview
              </div>
            )}
            <Field
              accept="image/jpeg,image/png,image/webp"
              error={errors.image}
              id="product-image"
              label={image || product ? 'Replace image' : 'Choose image'}
              name="image"
              onChange={(event) => {
                const nextImage = event.currentTarget.files?.item(0) ?? null;
                if (previewUrlRef.current) {
                  URL.revokeObjectURL(previewUrlRef.current);
                }
                const nextPreviewUrl = nextImage
                  ? URL.createObjectURL(nextImage)
                  : null;
                previewUrlRef.current = nextPreviewUrl;
                setPreviewUrl(nextPreviewUrl);
                setImage(nextImage);
                if (state.kind === 'invalid') setState({ kind: 'idle' });
              }}
              required={!product}
              type="file"
            />
          </div>

          <div className={styles.fields}>
            <Field
              autoComplete="off"
              error={errors.name}
              id="product-name"
              label="Title"
              maxLength={160}
              name="name"
              required
              type="text"
              defaultValue={product?.name}
            />
            <Field
              autoComplete="off"
              error={errors.teaser}
              id="product-teaser"
              label="Short description"
              maxLength={160}
              name="teaser"
              type="text"
              defaultValue={product?.teaser}
            />
            <label
              className={styles.textareaField}
              htmlFor="product-description"
            >
              <span>Description</span>
              <textarea
                aria-describedby={
                  errors.description ? 'product-description-error' : undefined
                }
                aria-errormessage={
                  errors.description ? 'product-description-error' : undefined
                }
                aria-invalid={Boolean(errors.description) || undefined}
                className={styles.textarea}
                id="product-description"
                maxLength={4_000}
                name="description"
                required
                rows={7}
                defaultValue={product?.description}
              />
              {errors.description ? (
                <span id="product-description-error" role="alert">
                  {errors.description}
                </span>
              ) : null}
            </label>
            <Field
              error={errors.price}
              id="product-price"
              inputMode="decimal"
              label="Price (USD)"
              min="0.01"
              name="price"
              required
              step="0.01"
              type="number"
              defaultValue={
                product ? (product.priceMinor / 100).toFixed(2) : undefined
              }
            />
            <Select
              error={errors.categoryId}
              id="product-category"
              label="Product Type"
              name="categoryId"
              required
              defaultValue={product?.category.id}
            >
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <fieldset className={styles.saleKind}>
          <legend>Sale mode</legend>
          <label>
            <input
              checked={saleKind === 'WEIGHT'}
              name="saleKind"
              onChange={() => setSaleKind('WEIGHT')}
              type="radio"
              value="WEIGHT"
            />
            Weight
          </label>
          <label>
            <input
              checked={saleKind === 'PACKAGE'}
              name="saleKind"
              onChange={() => setSaleKind('PACKAGE')}
              type="radio"
              value="PACKAGE"
            />
            Package
          </label>
          <label>
            <input
              checked={saleKind === 'KIT'}
              name="saleKind"
              onChange={() => setSaleKind('KIT')}
              type="radio"
              value="KIT"
            />
            Kit
          </label>
          {errors.saleKind ? <p role="alert">{errors.saleKind}</p> : null}
        </fieldset>

        {saleKind === 'WEIGHT' ? (
          <Field
            description="Sold in 0.1 kg steps. The product price is per 100g."
            error={errors.stock}
            id="product-stock-kg"
            inputMode="decimal"
            label="Stock (kg)"
            min="0"
            name="stock"
            required
            step="0.1"
            type="number"
            defaultValue={
              product?.saleKind === 'WEIGHT'
                ? (product.stockAmount / 1_000_000).toFixed(1)
                : undefined
            }
          />
        ) : saleKind === 'PACKAGE' ? (
          <div className={styles.packageFields}>
            <Field
              error={errors.stock}
              id="product-stock-packages"
              inputMode="numeric"
              label="Stock (packages)"
              min="0"
              name="stock"
              required
              step="1"
              type="number"
              defaultValue={
                product?.saleKind === 'PACKAGE'
                  ? product.stockAmount
                  : undefined
              }
            />
            <Field
              description="Optional. This describes one package."
              error={errors.packageNetWeightGrams}
              id="product-package-net-weight"
              inputMode="decimal"
              label="Package net weight (g)"
              min="0.001"
              name="packageNetWeightGrams"
              step="0.001"
              type="number"
              defaultValue={
                product?.packageNetWeightMg
                  ? product.packageNetWeightMg / 1_000
                  : undefined
              }
            />
          </div>
        ) : (
          <div className={styles.packageFields}>
            <Field
              error={errors.stock}
              id="product-stock-kits"
              inputMode="numeric"
              label="Stock (kits)"
              min="0"
              name="stock"
              required
              step="1"
              type="number"
              defaultValue={
                product?.saleKind === 'KIT' ? product.stockAmount : undefined
              }
            />
            <Field
              description="The finished batch volume produced by one kit."
              error={errors.kitYieldLitres}
              id="product-kit-yield"
              inputMode="decimal"
              label="Kit yield (litres)"
              min="0.001"
              name="kitYieldLitres"
              required
              step="0.001"
              type="number"
              defaultValue={
                product?.kitYieldVolumeMl
                  ? product.kitYieldVolumeMl / 1_000
                  : undefined
              }
            />
          </div>
        )}

        <div className={styles.schedule}>
          <Field
            error={errors.activeFrom}
            id="product-active-from"
            label="Active from"
            name="activeFrom"
            type="datetime-local"
            defaultValue={
              toLocalDateTime(product?.activeFrom) ?? initialLocalDateTime()
            }
          />
          <Field
            error={errors.activeUntil}
            id="product-active-until"
            label="Active until"
            name="activeUntil"
            type="datetime-local"
            defaultValue={toLocalDateTime(product?.activeUntil)}
          />
          <label className={styles.activeToggle}>
            <input
              aria-label={isActive ? 'Active' : 'Disabled'}
              checked={isActive}
              name="isActive"
              onChange={(event) => setIsActive(event.currentTarget.checked)}
              role="switch"
              type="checkbox"
              value="true"
            />
            <span>{isActive ? 'Active' : 'Disabled'}</span>
          </label>
        </div>

        <div className={styles.actions}>
          <Button href="/admin/products" variant="secondary">
            Cancel
          </Button>
          <Button
            pending={pending}
            pendingLabel="Saving product…"
            type="submit"
          >
            {product ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function toLocalDateTime(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
