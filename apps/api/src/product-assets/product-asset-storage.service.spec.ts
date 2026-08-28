import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  ProductAssetStorageService,
} from './product-asset-storage.service';

describe('ProductAssetStorageService', () => {
  let storageRoot: string;
  let service: ProductAssetStorageService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'hb-m3-assets-'));
    service = new ProductAssetStorageService(
      new ConfigService({ PRODUCT_ASSET_STORAGE_PATH: storageRoot }),
    );
  });

  afterEach(async () => {
    await rm(storageRoot, { force: true, recursive: true });
  });

  it('decodes, strips metadata, bounds dimensions and atomically publishes a UUID WebP', async () => {
    const input = await sharp({
      create: {
        background: { alpha: 1, b: 30, g: 20, r: 10 },
        channels: 4,
        height: 1_200,
        width: 2_400,
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const stored = await service.storeImage({
      buffer: input,
      mimetype: 'image/jpeg',
      size: input.length,
    });

    expect(stored.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/,
    );
    expect(stored.imagePath).toBe(`/product-assets/${stored.key}`);
    const encoded = await readFile(join(storageRoot, stored.key));
    const metadata = await sharp(encoded).metadata();
    expect(metadata).toMatchObject({ format: 'webp' });
    expect(
      Math.max(metadata.width ?? 0, metadata.height ?? 0),
    ).toBeLessThanOrEqual(1_600);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    await expect(service.readAsset(stored.key)).resolves.toEqual(encoded);

    await service.deleteAsset(stored.key);
    await expect(service.readAsset(stored.key)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects traversal and a missing opaque key with the same not-found response', async () => {
    for (const key of [
      '../../etc/passwd',
      '00000000-0000-4000-8000-000000000099.webp',
    ]) {
      await expect(service.readAsset(key)).rejects.toMatchObject({
        response: { status: 'not-found' },
      });
    }
  });

  it('rejects a declared MIME spoof that cannot be decoded', async () => {
    const input = Buffer.from('not an image');
    await expect(
      service.storeImage({
        buffer: input,
        mimetype: 'image/png',
        size: input.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an allowed claimed MIME when it does not match the allowed decoded format', async () => {
    const png = await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 10,
        width: 10,
      },
    })
      .png()
      .toBuffer();

    await expect(
      service.storeImage({
        buffer: png,
        mimetype: 'image/jpeg',
        size: png.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a decodable but disallowed actual format despite an allowed declared MIME', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(
      service.storeImage({
        buffer: svg,
        mimetype: 'image/png',
        size: svg.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a compressed image whose decoded pixel count exceeds the conservative limit', async () => {
    const input = await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 6_400,
        width: 6_400,
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(input.length).toBeLessThan(PRODUCT_IMAGE_MAX_BYTES);

    await expect(
      service.storeImage({
        buffer: input,
        mimetype: 'image/png',
        size: input.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversize, empty, mismatched-size and unsupported-MIME envelopes', async () => {
    const cases = [
      {
        buffer: Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1),
        mimetype: 'image/png',
        size: PRODUCT_IMAGE_MAX_BYTES + 1,
      },
      { buffer: Buffer.alloc(0), mimetype: 'image/png', size: 0 },
      { buffer: Buffer.from('x'), mimetype: 'image/png', size: 2 },
      { buffer: Buffer.from('x'), mimetype: 'image/gif', size: 1 },
    ];

    for (const image of cases) {
      await expect(service.storeImage(image)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
