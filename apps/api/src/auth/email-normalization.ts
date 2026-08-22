import { BadRequestException } from '@nestjs/common';
import { domainToASCII } from 'node:url';

const LOCAL_PART_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type CanonicalRegistrationEmail = {
  email: string;
  normalizedEmail: string;
};

export function canonicalizeRegistrationEmail(
  input: string,
): CanonicalRegistrationEmail {
  const email = input.normalize('NFC');
  const separator = email.indexOf('@');

  if (
    separator <= 0 ||
    separator !== email.lastIndexOf('@') ||
    email.length > 320
  ) {
    throw invalidRegistrationInput();
  }

  const localPart = email.slice(0, separator);
  const displayDomain = email.slice(separator + 1);
  if (
    Buffer.byteLength(localPart, 'ascii') > 64 ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    displayDomain.length === 0 ||
    displayDomain.endsWith('.')
  ) {
    throw invalidRegistrationInput();
  }

  const canonicalDomain = domainToASCII(displayDomain).toLowerCase();
  const labels = canonicalDomain.split('.');
  if (
    canonicalDomain.length === 0 ||
    canonicalDomain.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    throw invalidRegistrationInput();
  }

  const normalizedEmail = `${localPart.toLowerCase()}@${canonicalDomain}`;
  if (normalizedEmail.length > 320) throw invalidRegistrationInput();

  return { email, normalizedEmail };
}

function invalidRegistrationInput(): BadRequestException {
  return new BadRequestException('Invalid registration input.');
}
