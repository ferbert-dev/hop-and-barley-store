import { validateAvatarFile } from './avatar-file';

describe('avatar file validation', () => {
  const validCases = [
    {
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      contentType: 'image/jpeg',
    },
    {
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: 'image/png',
    },
    {
      bytes: Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary'),
      contentType: 'image/webp',
    },
  ] as const;

  it.each(validCases)(
    'accepts matching $contentType magic bytes',
    (fixture) => {
      expect(
        validateAvatarFile({
          buffer: fixture.bytes,
          mimetype: fixture.contentType,
          size: fixture.bytes.length,
        }),
      ).toEqual({
        bytes: fixture.bytes,
        contentType: fixture.contentType,
        sizeBytes: fixture.bytes.length,
      });
    },
  );

  it('rejects a declared image whose magic bytes do not match', () => {
    expectHttpStatus(
      () =>
        validateAvatarFile({
          buffer: Buffer.from('not an image'),
          mimetype: 'image/png',
          size: 12,
        }),
      415,
    );
  });

  it('rejects a valid signature under the wrong declared MIME type', () => {
    expectHttpStatus(
      () =>
        validateAvatarFile({
          buffer: validCases[0].bytes,
          mimetype: 'image/png',
          size: validCases[0].bytes.length,
        }),
      415,
    );
  });

  it('rejects missing, empty, inconsistent and oversized uploads', () => {
    expectHttpStatus(() => validateAvatarFile(undefined), 400);
    for (const fixture of [
      { buffer: Buffer.alloc(0), mimetype: 'image/png', size: 0 },
      {
        buffer: validCases[0].bytes,
        mimetype: 'image/jpeg',
        size: validCases[0].bytes.length + 1,
      },
      {
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0xff),
        mimetype: 'image/jpeg',
        size: 2 * 1024 * 1024 + 1,
      },
    ]) {
      expectHttpStatus(() => validateAvatarFile(fixture), 400);
    }
  });
});

function expectHttpStatus(action: () => unknown, status: number): void {
  try {
    action();
    throw new Error('Expected avatar validation to reject');
  } catch (error) {
    expect(error).toMatchObject({ status });
  }
}
