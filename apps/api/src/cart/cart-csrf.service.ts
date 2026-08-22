import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const CSRF_PATTERN = /^([A-Za-z0-9_-]{1,16})\.([A-Za-z0-9_-]{43})$/;
const CSRF_CONTEXT = 'hop-and-barley/cart-csrf/v1\0';

type CsrfKey = Readonly<{ key: Buffer; version: string }>;

@Injectable()
export class CartCsrfService {
  private readonly keys: readonly CsrfKey[];

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.keys = parseKeyring(config.getOrThrow<string>('CART_CSRF_KEYRING'));
  }

  issue(rawCartToken: string): string {
    const active = this.keys[0];
    if (!active) throw new Error('CART_CSRF_KEYRING is unavailable');
    return `${active.version}.${this.mac(active.key, rawCartToken).toString('base64url')}`;
  }

  verify(candidate: unknown, rawCartToken: string): boolean {
    if (typeof candidate !== 'string') return false;
    const match = CSRF_PATTERN.exec(candidate);
    if (!match) return false;
    const key = this.keys.find(({ version }) => version === match[1]);
    if (!key) return false;
    const supplied = Buffer.from(match[2], 'base64url');
    if (supplied.length !== 32 || supplied.toString('base64url') !== match[2]) {
      return false;
    }
    return timingSafeEqual(this.mac(key.key, rawCartToken), supplied);
  }

  private mac(key: Buffer, rawCartToken: string): Buffer {
    return createHmac('sha256', key)
      .update(CSRF_CONTEXT, 'utf8')
      .update(rawCartToken, 'ascii')
      .digest();
  }
}

function parseKeyring(value: string): readonly CsrfKey[] {
  return value.split(',').map((entry) => {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator);
    const encodedKey = entry.slice(separator + 1);
    if (
      separator <= 0 ||
      !/^[A-Za-z0-9_-]{1,16}$/.test(version) ||
      !/^[a-f0-9]{64}$/.test(encodedKey)
    ) {
      throw new Error('CART_CSRF_KEYRING is invalid');
    }
    return { key: Buffer.from(encodedKey, 'hex'), version };
  });
}
