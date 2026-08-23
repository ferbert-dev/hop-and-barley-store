import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 12 characters total' },
  { key: 'lowercase', label: 'At least one lowercase letter' },
  { key: 'uppercase', label: 'At least one uppercase letter' },
  { key: 'digit', label: 'At least one digit' },
  { key: 'special', label: 'At least one special character' },
] as const;

export type PasswordRequirementKey =
  (typeof PASSWORD_REQUIREMENTS)[number]['key'];

export type PasswordRequirementState = Readonly<
  Record<PasswordRequirementKey, boolean>
>;

const LOWERCASE_PATTERN = /\p{Ll}/u;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const DIGIT_PATTERN = /\p{Nd}/u;
const SPECIAL_PATTERN = /[\p{P}\p{S}]/u;

export function evaluatePasswordRequirements(
  password: string,
): PasswordRequirementState {
  return {
    digit: DIGIT_PATTERN.test(password),
    length: [...password].length >= PASSWORD_MIN_LENGTH,
    lowercase: LOWERCASE_PATTERN.test(password),
    special: SPECIAL_PATTERN.test(password),
    uppercase: UPPERCASE_PATTERN.test(password),
  };
}

export const registrationEmailSchema = z
  .string()
  .min(1, 'Enter your email address.')
  .max(320, 'Enter a valid email address.')
  .email('Enter a valid email address.');

export const registrationPasswordSchema = z
  .string()
  .superRefine((password, context) => {
    const state = evaluatePasswordRequirements(password);
    for (const requirement of PASSWORD_REQUIREMENTS) {
      if (!state[requirement.key]) {
        context.addIssue({
          code: 'custom',
          message: requirement.label,
        });
      }
    }
  });

export const registrationCredentialsSchema = z
  .object({
    email: registrationEmailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export const registrationFormSchema = registrationCredentialsSchema
  .extend({
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
