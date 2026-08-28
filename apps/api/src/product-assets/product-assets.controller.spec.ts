import { StreamableFile } from '@nestjs/common';
import { ProductAssetStorageService } from './product-asset-storage.service';
import { ProductAssetsController } from './product-assets.controller';

const KEY = '7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp';

describe('ProductAssetsController', () => {
  const asset = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x57, 0x45, 0x42]);
  const readAsset = jest.fn<Promise<Buffer>, [string]>();
  const controller = new ProductAssetsController({
    readAsset,
  } as unknown as ProductAssetStorageService);

  beforeEach(() => {
    readAsset.mockReset().mockResolvedValue(asset);
  });

  it('returns an exact binary WebP stream with immutable and nosniff metadata', async () => {
    const response = await controller.read(KEY);

    expect(response).toBeInstanceOf(StreamableFile);
    expect(response.getHeaders()).toMatchObject({
      length: asset.length,
      type: 'image/webp',
    });
    await expect(readStream(response)).resolves.toEqual(asset);
    expect(readAsset).toHaveBeenCalledWith(KEY);

    const readHandler: unknown = Object.getOwnPropertyDescriptor(
      ProductAssetsController.prototype,
      'read',
    )?.value;
    expect(typeof readHandler).toBe('function');
    const headerMetadata: unknown = Reflect.getMetadata(
      '__headers__',
      readHandler as object,
    );
    expect(headerMetadata).toEqual(
      expect.arrayContaining([
        {
          name: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
        { name: 'Content-Type', value: 'image/webp' },
        { name: 'X-Content-Type-Options', value: 'nosniff' },
      ]),
    );
  });
});

function readStream(file: StreamableFile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.getStream();
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
