'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { Field, Select } from '../../components/ui/field';
import type { AdminProductCreateOptions } from './admin-product-create-server';
import {
  createAdminProductFromBrowser,
  type AdminProductCreated,
} from './admin-product-create-transport';
import {
  initialLocalDateTime,
  validateAdminProductCreate,
  type AdminProductSaleKind,
} from './admin-product-create-validation';
import styles from './create-product.module.css';

type FormState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ errors: Record<string, string>; kind: 'invalid' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'success'; product: AdminProductCreated }>
  | Readonly<{ kind: 'unavailable' }>;

export function CreateProductForm({
  options,
}: Readonly<{ options: AdminProductCreateOptions }>) {
  const router = useRouter();
  const [saleKind, setSaleKind] = useState<AdminProductSaleKind>('WEIGHT');
  const [image, setImage] = useState<File | null>(null);
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
        <h2>Product created</h2>
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
        state.kind === 'unavailable' ? 'create-product-error' : undefined
      }
      className={styles.form}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const formData = new FormData(event.currentTarget);
        const validation = validateAdminProductCreate({
          activeFrom: String(formData.get('activeFrom') ?? ''),
          activeUntil: String(formData.get('activeUntil') ?? ''),
          categoryId: String(formData.get('categoryId') ?? ''),
          description: String(formData.get('description') ?? ''),
          image,
          isActive: formData.get('isActive') === 'true',
          name: String(formData.get('name') ?? ''),
          packageNetWeightGrams: String(
            formData.get('packageNetWeightGrams') ?? '',
          ),
          price: String(formData.get('price') ?? ''),
          saleKind,
          stock: String(formData.get('stock') ?? ''),
        });
        if (!validation.ok) {
          setState({ errors: validation.errors, kind: 'invalid' });
          return;
        }
        setState({ kind: 'submitting' });
        try {
          const product = await createAdminProductFromBrowser(validation.value);
          setState({ kind: 'success', product });
          router.refresh();
        } catch {
          setState({ kind: 'unavailable' });
        }
      }}
    >
      <fieldset disabled={pending}>
        <legend className="visually-hidden">Create product</legend>
        {state.kind === 'unavailable' ? (
          <p
            className={styles.errorSummary}
            id="create-product-error"
            role="alert"
          >
            The product could not be saved safely. Check the details and try
            again.
          </p>
        ) : null}

        <div className={styles.grid}>
          <div className={styles.imagePanel}>
            <h2>Product image</h2>
            <p>JPEG, PNG, or WebP. Maximum file size: 5 MiB.</p>
            {previewUrl ? (
              // The selected upload is a local blob URL, which Next Image does
              // not optimize. The server receives and validates the original file.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected product image preview"
                className={styles.preview}
                src={previewUrl}
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
              label={image ? 'Replace image' : 'Choose image'}
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
              required
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
            />
            <Select
              error={errors.categoryId}
              id="product-category"
              label="Product Type"
              name="categoryId"
              required
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
          />
        ) : (
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
            defaultValue={initialLocalDateTime()}
          />
          <Field
            error={errors.activeUntil}
            id="product-active-until"
            label="Active until"
            name="activeUntil"
            type="datetime-local"
          />
          <label className={styles.activeToggle}>
            <input
              defaultChecked
              name="isActive"
              type="checkbox"
              value="true"
            />
            Active
          </label>
        </div>

        <div className={styles.actions}>
          <Button
            pending={pending}
            pendingLabel="Saving product…"
            type="submit"
          >
            Save
          </Button>
          <Button href="/admin/products" variant="secondary">
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
