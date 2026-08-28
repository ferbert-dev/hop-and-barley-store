import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type AvatarContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export type UploadedAvatarFile = Readonly<{
  buffer: Buffer;
  mimetype: string;
  size: number;
}>;

export type ValidatedAvatar = Readonly<{
  bytes: Buffer;
  contentType: AvatarContentType;
  sizeBytes: number;
}>;

export function validateAvatarFile(
  file: UploadedAvatarFile | undefined,
): ValidatedAvatar {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException({
      message: 'Choose a JPEG, PNG or WebP image to upload.',
      status: 'invalid-avatar',
    });
  }
  if (
    file.size < 1 ||
    file.size > MAX_AVATAR_BYTES ||
    file.buffer.byteLength !== file.size
  ) {
    throw new BadRequestException({
      message: 'Choose an image no larger than 2 MB.',
      status: 'invalid-avatar',
    });
  }

  const detected = detectContentType(file.buffer);
  if (detected === null || detected !== file.mimetype) {
    throw new UnsupportedMediaTypeException({
      message: 'Choose a valid JPEG, PNG or WebP image.',
      status: 'invalid-avatar',
    });
  }

  return {
    bytes: file.buffer,
    contentType: detected,
    sizeBytes: file.size,
  };
}

function detectContentType(bytes: Buffer): AvatarContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
