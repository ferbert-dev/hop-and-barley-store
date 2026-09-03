import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { CATALOG_ADMIN_PRODUCT_TYPES } from '../catalog/catalog-product-types';
import type { ProductSpecificationDto } from '../catalog/dto/product-detail.dto';
import { PrismaService } from '../database/prisma.service';
import {
  ProductAssetStorageService,
  type UploadedProductImage,
} from '../product-assets/product-asset-storage.service';
import {
  ADMIN_PRODUCT_SALE_KINDS,
  type AdminCreateProductBodyDto,
  type AdminCreatedProductDto,
  type AdminProductCreateOptionsDto,
  type AdminUpdateProductBodyDto,
} from './dto/admin-product-create.dto';

const INT32_MAX = 2_147_483_647;
const STOCK_MAX = 2_000_000_000;
const WEIGHT_INCREMENT_MG = 100_000;
const WEIGHT_MAXIMUM_MG = 100_000_000;

const PRODUCT_CREATE_UNAVAILABLE = Object.freeze({ status: 'unavailable' });
const PRODUCT_SLUG_CONFLICT = Object.freeze({ status: 'slug-conflict' });
const PRODUCT_NOT_FOUND = Object.freeze({ status: 'not-found' });
const PRODUCT_UPDATE_CONFLICT = Object.freeze({ status: 'update-conflict' });

const createdProductSelect = {
  activeFrom: true,
  activeUntil: true,
  amountUnit: true,
  category: { select: { id: true, name: true, slug: true } },
  createdAt: true,
  currency: true,
  description: true,
  id: true,
  imagePath: true,
  isActive: true,
  kitYieldVolumeMl: true,
  maximumOrderAmount: true,
  minimumOrderAmount: true,
  name: true,
  orderStepAmount: true,
  packageNetWeightMg: true,
  priceBasisAmount: true,
  priceMinor: true,
  priceQualifier: true,
  saleKind: true,
  slug: true,
  specifications: true,
  stockAmount: true,
  teaser: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class AdminProductCreationService {
  private readonly logger = new Logger(AdminProductCreationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProductAssetStorageService)
    private readonly assets: ProductAssetStorageService,
  ) {}

  getCreateOptions(): AdminProductCreateOptionsDto {
    return {
      categories: CATALOG_ADMIN_PRODUCT_TYPES.map(({ id, name, slug }) => ({
        id,
        name,
        slug,
      })),
      saleKinds: [...ADMIN_PRODUCT_SALE_KINDS],
    };
  }

  async createProduct(
    dto: AdminCreateProductBodyDto,
    image: UploadedProductImage,
  ): Promise<AdminCreatedProductDto> {
    const category = CATALOG_ADMIN_PRODUCT_TYPES.find(
      (candidate) => candidate.id === dto.categoryId,
    );
    if (!category) {
      throw new BadRequestException({ status: 'invalid-product-category' });
    }

    const priceMinor = parseUsdMinor(dto.price);
    const stockAmount = parseCanonicalInteger(
      dto.stockAmount,
      0,
      STOCK_MAX,
      'stockAmount',
    );
    const packageNetWeightMg = resolvePackageNetWeight(dto);
    const kitYieldVolumeMl = resolveKitYield(dto);
    const activeFrom = dto.activeFrom ? new Date(dto.activeFrom) : new Date();
    const activeUntil = dto.activeUntil ? new Date(dto.activeUntil) : null;
    if (activeUntil && activeUntil <= activeFrom) {
      throw new BadRequestException({ status: 'invalid-activity-window' });
    }

    const sale = resolveSaleConfiguration(dto.saleKind);
    const specifications = [{ label: 'Product Type', value: category.name }];
    const slug = createProductSlug(dto.name);
    const storedAsset = await this.assets.storeImage(image);

    try {
      const created = await this.prisma.product.create({
        data: {
          activeFrom,
          activeUntil,
          ...sale,
          category: { connect: { id: category.id } },
          currency: 'USD',
          description: dto.description,
          imagePath: storedAsset.imagePath,
          isActive: dto.isActive === 'true',
          kitYieldVolumeMl,
          name: dto.name,
          packageNetWeightMg,
          priceMinor,
          saleKind: dto.saleKind,
          slug,
          specifications,
          stockAmount,
          teaser: dto.teaser ?? createTeaser(dto.description),
        },
        select: createdProductSelect,
      });

      return {
        ...created,
        activeFrom: created.activeFrom ?? activeFrom,
        amountUnit: sale.amountUnit,
        currency: 'USD',
        priceQualifier: sale.priceQualifier,
        saleKind: dto.saleKind,
        specifications,
      };
    } catch (error) {
      try {
        await this.assets.deleteAsset(storedAsset.key);
      } catch {
        this.logger.error('admin.product.create.asset_cleanup_failed');
      }
      if (isProductSlugConflict(error)) {
        throw new ConflictException(PRODUCT_SLUG_CONFLICT);
      }
      this.logger.error('admin.product.create.failed');
      throw new ServiceUnavailableException(PRODUCT_CREATE_UNAVAILABLE);
    }
  }

  async getProduct(id: string): Promise<AdminCreatedProductDto> {
    const product = await this.prisma.product.findUnique({
      select: createdProductSelect,
      where: { id },
    });
    if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND);
    return {
      ...product,
      amountUnit:
        product.saleKind === 'WEIGHT'
          ? ('MILLIGRAM' as const)
          : ('EACH' as const),
      currency: 'USD',
      priceQualifier:
        product.saleKind === 'WEIGHT'
          ? ('per 100g' as const)
          : product.saleKind === 'KIT'
            ? ('per kit' as const)
            : ('per package' as const),
      specifications: parseProductSpecifications(product.specifications),
    };
  }

  async updateProduct(
    id: string,
    dto: AdminUpdateProductBodyDto,
    image?: UploadedProductImage,
  ): Promise<AdminCreatedProductDto> {
    const existing = await this.prisma.product.findUnique({
      select: { imagePath: true, updatedAt: true },
      where: { id },
    });
    if (!existing) throw new NotFoundException(PRODUCT_NOT_FOUND);
    if (existing.updatedAt.toISOString() !== dto.expectedUpdatedAt) {
      throw new ConflictException(PRODUCT_UPDATE_CONFLICT);
    }

    const category = CATALOG_ADMIN_PRODUCT_TYPES.find(
      (candidate) => candidate.id === dto.categoryId,
    );
    if (!category) {
      throw new BadRequestException({ status: 'invalid-product-category' });
    }
    const priceMinor = parseUsdMinor(dto.price);
    const stockAmount = parseCanonicalInteger(
      dto.stockAmount,
      0,
      STOCK_MAX,
      'stockAmount',
    );
    const packageNetWeightMg = resolvePackageNetWeight(dto);
    const kitYieldVolumeMl = resolveKitYield(dto);
    const activeFrom = dto.activeFrom ? new Date(dto.activeFrom) : new Date();
    const activeUntil = dto.activeUntil ? new Date(dto.activeUntil) : null;
    if (activeUntil && activeUntil <= activeFrom) {
      throw new BadRequestException({ status: 'invalid-activity-window' });
    }
    const sale = resolveSaleConfiguration(dto.saleKind);
    const specifications = [{ label: 'Product Type', value: category.name }];
    const storedAsset = image ? await this.assets.storeImage(image) : null;
    let updateCommitted = false;

    try {
      const changed = await this.prisma.product.updateMany({
        data: {
          activeFrom,
          activeUntil,
          ...sale,
          categoryId: category.id,
          description: dto.description,
          ...(storedAsset ? { imagePath: storedAsset.imagePath } : {}),
          isActive: dto.isActive === 'true',
          kitYieldVolumeMl,
          name: dto.name,
          packageNetWeightMg,
          priceMinor,
          saleKind: dto.saleKind,
          specifications,
          stockAmount,
          teaser: dto.teaser ?? createTeaser(dto.description),
        },
        where: { id, updatedAt: existing.updatedAt },
      });
      if (changed.count !== 1) {
        throw new ConflictException(PRODUCT_UPDATE_CONFLICT);
      }
      updateCommitted = true;
      const updated = await this.getProduct(id);
      return updated;
    } catch (error) {
      if (storedAsset && !updateCommitted) {
        await this.assets
          .deleteAsset(storedAsset.key)
          .catch(() =>
            this.logger.error('admin.product.update.new_asset_cleanup_failed'),
          );
      }
      if (error instanceof ConflictException) throw error;
      this.logger.error('admin.product.update.failed');
      throw new ServiceUnavailableException(PRODUCT_CREATE_UNAVAILABLE);
    }
  }
}

function resolveSaleConfiguration(
  saleKind: AdminCreateProductBodyDto['saleKind'],
) {
  if (saleKind === 'WEIGHT') {
    return {
      amountUnit: 'MILLIGRAM' as const,
      maximumOrderAmount: WEIGHT_MAXIMUM_MG,
      minimumOrderAmount: WEIGHT_INCREMENT_MG,
      orderStepAmount: WEIGHT_INCREMENT_MG,
      priceBasisAmount: WEIGHT_INCREMENT_MG,
      priceQualifier: 'per 100g' as const,
    };
  }
  return {
    amountUnit: 'EACH' as const,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    orderStepAmount: 1,
    priceBasisAmount: 1,
    priceQualifier:
      saleKind === 'KIT' ? ('per kit' as const) : ('per package' as const),
  };
}

export function createProductSlug(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const bounded = normalized.slice(0, 64).replace(/-+$/g, '');
  return bounded || 'product';
}

function createTeaser(description: string): string {
  const normalized = description.replace(/\s+/g, ' ').trim();
  return Array.from(normalized).slice(0, 160).join('');
}

function parseUsdMinor(value: string): number {
  const match = /^(0|[1-9]\d{0,7})\.(\d{1,2})$/.exec(value);
  if (!match) {
    throw new BadRequestException({ status: 'invalid-product-price' });
  }
  const whole = Number(match[1]);
  const fraction = Number(match[2].padEnd(2, '0'));
  const minor = whole * 100 + fraction;
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > INT32_MAX) {
    throw new BadRequestException({ status: 'invalid-product-price' });
  }
  return minor;
}

function resolvePackageNetWeight(
  dto: AdminCreateProductBodyDto,
): number | null {
  if (dto.saleKind !== 'PACKAGE') {
    if (dto.packageNetWeightMg !== undefined) {
      throw new BadRequestException({ status: 'invalid-package-net-weight' });
    }
    return null;
  }
  if (dto.packageNetWeightMg === undefined) return null;
  return parseCanonicalInteger(
    dto.packageNetWeightMg,
    1,
    INT32_MAX,
    'packageNetWeightMg',
  );
}

function resolveKitYield(dto: AdminCreateProductBodyDto): number | null {
  if (dto.saleKind !== 'KIT') {
    if (dto.kitYieldVolumeMl !== undefined) {
      throw new BadRequestException({ status: 'invalid-kit-yield' });
    }
    return null;
  }
  if (dto.kitYieldVolumeMl === undefined) {
    throw new BadRequestException({ status: 'invalid-kit-yield' });
  }
  return parseCanonicalInteger(
    dto.kitYieldVolumeMl,
    1,
    INT32_MAX,
    'kitYieldVolumeMl',
  );
}

function parseCanonicalInteger(
  value: string,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException({ field, status: 'invalid-integer' });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException({ field, status: 'invalid-integer' });
  }
  return parsed;
}

function parseProductSpecifications(
  value: Prisma.JsonValue,
): ProductSpecificationDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Stored product specifications are invalid');
  }
  return value.map((item) => {
    if (item === null || Array.isArray(item) || typeof item !== 'object') {
      throw new TypeError('Stored product specifications are invalid');
    }
    const { label, value: specificationValue } = item as Record<
      string,
      unknown
    >;
    const validValue =
      typeof specificationValue === 'string' ||
      (Array.isArray(specificationValue) &&
        specificationValue.length > 0 &&
        specificationValue.every((entry) => typeof entry === 'string'));
    if (typeof label !== 'string' || !label || !validValue) {
      throw new TypeError('Stored product specifications are invalid');
    }
    return {
      label,
      value: Array.isArray(specificationValue)
        ? [...specificationValue]
        : specificationValue,
    };
  });
}

function isProductSlugConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  if (error.code !== 'P2002') return false;
  if (
    !('meta' in error) ||
    error.meta === null ||
    typeof error.meta !== 'object'
  ) {
    return false;
  }

  const target = 'target' in error.meta ? error.meta.target : undefined;
  if (
    target === 'Product_slug_key' ||
    target === 'slug' ||
    (Array.isArray(target) && target.some((value) => value === 'slug'))
  ) {
    return true;
  }

  const driver =
    'driverAdapterError' in error.meta ? error.meta.driverAdapterError : null;
  if (driver === null || typeof driver !== 'object' || !('cause' in driver)) {
    return false;
  }
  const cause = driver.cause;
  if (cause === null || typeof cause !== 'object') return false;
  if (
    'constraint' in cause &&
    cause.constraint !== null &&
    typeof cause.constraint === 'object'
  ) {
    const constraint = cause.constraint;
    return (
      ('index' in constraint && constraint.index === 'Product_slug_key') ||
      ('fields' in constraint &&
        Array.isArray(constraint.fields) &&
        constraint.fields.some((value) => value === 'slug'))
    );
  }
  return false;
}
