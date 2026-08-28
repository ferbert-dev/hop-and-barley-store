import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { canonicalizeRegistrationEmail } from '../auth/email-normalization';
import { isNormalizedEmailConflict } from '../auth/normalized-email-conflict';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { validateAvatarFile, type UploadedAvatarFile } from './avatar-file';
import type {
  AvatarMetadataDto,
  CurrentUserProfileDto,
  CustomerProfilePatchDto,
  PrimaryAddressPatchDto,
  UpdateCurrentUserDto,
} from './dto/user-profile.dto';

const PROFILE_INVALID = Object.freeze({
  message: 'Review your account information and try again.',
  status: 'invalid-profile' as const,
});
const PROFILE_CONFLICT = Object.freeze({
  message: 'We could not save these changes. Review the form and try again.',
  status: 'profile-conflict' as const,
});
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

const currentUserSelect = {
  customerProfile: {
    select: {
      avatarContentType: true,
      avatarSizeBytes: true,
      avatarUpdatedAt: true,
      fullName: true,
      phone: true,
    },
  },
  email: true,
  primaryAddress: {
    select: {
      additionalInfo: true,
      apartmentUnit: true,
      city: true,
      country: true,
      floor: true,
      houseNumber: true,
      postalCode: true,
      street: true,
    },
  },
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

type StoredCurrentUser = Prisma.UserGetPayload<{
  select: typeof currentUserSelect;
}>;

export type StoredAvatar = Readonly<{
  bytes: Uint8Array<ArrayBufferLike>;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(userId: string): Promise<CurrentUserProfileDto> {
    const stored = await this.prisma.user.findUnique({
      select: currentUserSelect,
      where: { id: userId },
    });
    return toCurrentUserDto(requireActiveUser(stored));
  }

  async updateCurrent(
    userId: string,
    patch: UpdateCurrentUserDto,
  ): Promise<CurrentUserProfileDto> {
    const emailUpdate = canonicalEmailUpdate(patch);

    try {
      const stored = await this.prisma.$transaction(async (transaction) => {
        const active = await transaction.user.findUnique({
          select: { id: true, status: true },
          where: { id: userId },
        });
        if (!active || active.status !== 'ACTIVE') {
          throw new UnauthorizedException(UNAUTHORIZED);
        }

        await transaction.user.update({
          data: emailUpdate,
          select: { id: true },
          where: { id: userId },
        });
        await updateProfile(transaction, userId, patch.profile);
        await updatePrimaryAddress(transaction, userId, patch.primaryAddress);

        return transaction.user.findUniqueOrThrow({
          select: currentUserSelect,
          where: { id: userId },
        });
      });
      return toCurrentUserDto(stored);
    } catch (error) {
      if (isNormalizedEmailConflict(error)) {
        throw new ConflictException(PROFILE_CONFLICT);
      }
      throw error;
    }
  }

  async saveAvatar(
    userId: string,
    supplied: UploadedAvatarFile | undefined,
  ): Promise<AvatarMetadataDto> {
    const avatar = validateAvatarFile(supplied);
    const now = new Date();
    const stored = await this.prisma.customerProfile.upsert({
      create: {
        avatarContentType: avatar.contentType,
        avatarData: Uint8Array.from(avatar.bytes),
        avatarSizeBytes: avatar.sizeBytes,
        avatarUpdatedAt: now,
        userId,
      },
      select: {
        avatarContentType: true,
        avatarSizeBytes: true,
        avatarUpdatedAt: true,
      },
      update: {
        avatarContentType: avatar.contentType,
        avatarData: Uint8Array.from(avatar.bytes),
        avatarSizeBytes: avatar.sizeBytes,
        avatarUpdatedAt: now,
      },
      where: { userId },
    });
    return requireAvatarMetadata(stored);
  }

  async readAvatar(userId: string): Promise<StoredAvatar> {
    const stored = await this.prisma.customerProfile.findUnique({
      select: {
        avatarContentType: true,
        avatarData: true,
        avatarSizeBytes: true,
      },
      where: { userId },
    });
    if (
      !stored?.avatarData ||
      !isAvatarContentType(stored.avatarContentType) ||
      stored.avatarSizeBytes === null
    ) {
      throw new NotFoundException({ status: 'avatar-not-found' });
    }
    return {
      bytes: stored.avatarData,
      contentType: stored.avatarContentType,
      sizeBytes: stored.avatarSizeBytes,
    };
  }

  async deleteAvatar(userId: string): Promise<void> {
    await this.prisma.customerProfile.updateMany({
      data: {
        avatarContentType: null,
        avatarData: null,
        avatarSizeBytes: null,
        avatarUpdatedAt: null,
      },
      where: { userId },
    });
  }
}

function canonicalEmailUpdate(patch: UpdateCurrentUserDto): {
  email?: string;
  normalizedEmail?: string;
} {
  if (!Object.hasOwn(patch, 'email')) return {};
  try {
    return canonicalizeRegistrationEmail(patch.email ?? '');
  } catch {
    throw new BadRequestException(PROFILE_INVALID);
  }
}

async function updateProfile(
  transaction: Prisma.TransactionClient,
  userId: string,
  profile: CustomerProfilePatchDto | null | undefined,
): Promise<void> {
  if (profile === undefined) return;
  if (profile === null) {
    await transaction.customerProfile.deleteMany({ where: { userId } });
    return;
  }

  const data: { fullName?: string | null; phone?: string | null } = {};
  if (Object.hasOwn(profile, 'fullName')) data.fullName = profile.fullName;
  if (Object.hasOwn(profile, 'phone')) data.phone = profile.phone;
  if (Object.keys(data).length === 0) return;

  await transaction.customerProfile.upsert({
    create: { ...data, userId },
    update: data,
    where: { userId },
  });
}

async function updatePrimaryAddress(
  transaction: Prisma.TransactionClient,
  userId: string,
  address: PrimaryAddressPatchDto | null | undefined,
): Promise<void> {
  if (address === undefined) return;
  if (address === null) {
    await transaction.primaryAddress.deleteMany({ where: { userId } });
    return;
  }

  const data: Omit<PrimaryAddressPatchDto, never> = {};
  for (const field of [
    'additionalInfo',
    'apartmentUnit',
    'city',
    'country',
    'floor',
    'houseNumber',
    'postalCode',
    'street',
  ] as const) {
    if (Object.hasOwn(address, field)) data[field] = address[field];
  }
  if (Object.keys(data).length === 0) return;

  await transaction.primaryAddress.upsert({
    create: { ...data, userId },
    update: data,
    where: { userId },
  });
}

function requireActiveUser(
  stored: StoredCurrentUser | null,
): StoredCurrentUser {
  if (!stored || stored.status !== 'ACTIVE') {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  return stored;
}

function toCurrentUserDto(stored: StoredCurrentUser): CurrentUserProfileDto {
  const profile = stored.customerProfile;
  return {
    email: stored.email,
    primaryAddress: stored.primaryAddress,
    profile: profile
      ? {
          avatar:
            isAvatarContentType(profile.avatarContentType) &&
            profile.avatarSizeBytes !== null &&
            profile.avatarUpdatedAt !== null
              ? {
                  contentType: profile.avatarContentType,
                  sizeBytes: profile.avatarSizeBytes,
                  updatedAt: profile.avatarUpdatedAt.toISOString(),
                }
              : null,
          fullName: profile.fullName,
          phone: profile.phone,
        }
      : null,
    role: stored.role,
  };
}

function requireAvatarMetadata(stored: {
  avatarContentType: string | null;
  avatarSizeBytes: number | null;
  avatarUpdatedAt: Date | null;
}): AvatarMetadataDto {
  if (
    !isAvatarContentType(stored.avatarContentType) ||
    stored.avatarSizeBytes === null ||
    stored.avatarUpdatedAt === null
  ) {
    throw new Error('Avatar persistence invariant failed');
  }
  return {
    contentType: stored.avatarContentType,
    sizeBytes: stored.avatarSizeBytes,
    updatedAt: stored.avatarUpdatedAt.toISOString(),
  };
}

function isAvatarContentType(
  value: string | null,
): value is 'image/jpeg' | 'image/png' | 'image/webp' {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(value ?? '');
}
