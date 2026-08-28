import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1_024 * 1_024;
export const PRODUCT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const PRODUCT_IMAGE_FORMAT_BY_MIME = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
const PRODUCT_IMAGE_MAX_INPUT_PIXELS = 40_000_000;
const PRODUCT_IMAGE_MAX_EDGE = 1_600;
const PRODUCT_ASSET_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

const INVALID_IMAGE = Object.freeze({ status: 'invalid-product-image' });
const ASSET_UNAVAILABLE = Object.freeze({
  status: 'asset-storage-unavailable',
});
const ASSET_NOT_FOUND = Object.freeze({ status: 'not-found' });

export interface UploadedProductImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredProductAsset {
  imagePath: `/product-assets/${string}.webp`;
  key: `${string}.webp`;
}

@Injectable()
export class ProductAssetStorageService {
  private readonly logger = new Logger(ProductAssetStorageService.name);
  private readonly storageRoot: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.storageRoot = resolve(
      config.getOrThrow<string>('PRODUCT_ASSET_STORAGE_PATH'),
    );
  }

  async storeImage(image: UploadedProductImage): Promise<StoredProductAsset> {
    this.assertUploadEnvelope(image);
    const encoded = await this.decodeAndEncode(image.buffer, image.mimetype);
    const key = `${randomUUID()}.webp` as const;
    const temporaryKey = `.${randomUUID()}.tmp`;
    const temporaryPath = join(this.storageRoot, temporaryKey);
    const finalPath = join(this.storageRoot, key);

    try {
      await mkdir(this.storageRoot, { mode: 0o750, recursive: true });
      await writeFile(temporaryPath, encoded, { flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, finalPath);
    } catch {
      await unlink(temporaryPath).catch(() => undefined);
      this.logger.error('product.asset.store.failed');
      throw new ServiceUnavailableException(ASSET_UNAVAILABLE);
    }

    return { imagePath: `/product-assets/${key}`, key };
  }

  async deleteAsset(key: string): Promise<void> {
    if (!PRODUCT_ASSET_KEY.test(key)) return;
    try {
      await unlink(join(this.storageRoot, key));
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) return;
      throw error;
    }
  }

  async readAsset(key: string): Promise<Buffer> {
    if (!PRODUCT_ASSET_KEY.test(key)) {
      throw new NotFoundException(ASSET_NOT_FOUND);
    }

    try {
      return await readFile(join(this.storageRoot, key));
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        throw new NotFoundException(ASSET_NOT_FOUND);
      }
      this.logger.error('product.asset.read.failed');
      throw new ServiceUnavailableException(ASSET_UNAVAILABLE);
    }
  }

  private assertUploadEnvelope(image: UploadedProductImage): void {
    if (
      !image ||
      !Buffer.isBuffer(image.buffer) ||
      image.buffer.length === 0 ||
      image.buffer.length > PRODUCT_IMAGE_MAX_BYTES ||
      image.size !== image.buffer.length ||
      !PRODUCT_IMAGE_MIME_TYPES.includes(
        image.mimetype as (typeof PRODUCT_IMAGE_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(INVALID_IMAGE);
    }
  }

  private async decodeAndEncode(
    input: Buffer,
    claimedMimeType: string,
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(input, {
        failOn: 'error',
        limitInputPixels: PRODUCT_IMAGE_MAX_INPUT_PIXELS,
      }).metadata();
      const expectedFormat =
        PRODUCT_IMAGE_FORMAT_BY_MIME[
          claimedMimeType as keyof typeof PRODUCT_IMAGE_FORMAT_BY_MIME
        ];
      if (!expectedFormat || metadata.format !== expectedFormat) {
        throw new Error('Decoded image format does not match claimed MIME');
      }

      return await sharp(input, {
        failOn: 'error',
        limitInputPixels: PRODUCT_IMAGE_MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize({
          fit: 'inside',
          height: PRODUCT_IMAGE_MAX_EDGE,
          width: PRODUCT_IMAGE_MAX_EDGE,
          withoutEnlargement: true,
        })
        .webp({ effort: 4, quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException(INVALID_IMAGE);
    }
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code
  );
}
