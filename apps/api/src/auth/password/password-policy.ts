import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PINNED_BLOCKLIST_SHA256 = [
  '4adb3f0afb4a10cf',
  '19ebe48d8c69a46f',
  '934bbc8d77c694c2',
  '10564f9583e7f4ba',
].join('');
const PINNED_BLOCKLIST_ENTRY_COUNT = 10_000;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

let cachedBlocklist: ReadonlySet<string> | undefined;

export function loadCommonPasswordBlocklist(): ReadonlySet<string> {
  if (cachedBlocklist) return cachedBlocklist;

  const source = readFileSync(join(__dirname, 'common-passwords.txt'));
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== PINNED_BLOCKLIST_SHA256) {
    throw new Error('Common-password blocklist integrity check failed.');
  }

  const entries = source
    .toString('utf8')
    .split('\n')
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.normalize('NFC').toLowerCase());
  const blocklist = new Set(entries);
  if (
    entries.length !== PINNED_BLOCKLIST_ENTRY_COUNT ||
    blocklist.size !== entries.length
  ) {
    throw new Error('Common-password blocklist cardinality check failed.');
  }

  cachedBlocklist = blocklist;
  return cachedBlocklist;
}

export function normalizeRegistrationPassword(input: string): string {
  const password = input.normalize('NFC');
  const codePointLength = [...password].length;

  if (
    codePointLength < 15 ||
    codePointLength > 128 ||
    Buffer.byteLength(password, 'utf8') > 512 ||
    CONTROL_CHARACTER_PATTERN.test(password) ||
    loadCommonPasswordBlocklist().has(password.toLowerCase())
  ) {
    throw new BadRequestException('Invalid registration input.');
  }

  return password;
}
