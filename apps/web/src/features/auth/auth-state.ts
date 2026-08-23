import type { AuthFieldName } from './auth-validation';

export type AuthFormState = Readonly<{
  errors?: Partial<Record<AuthFieldName, string>>;
  status: 'accepted' | 'idle' | 'invalid' | 'unavailable';
}>;

export const INITIAL_AUTH_FORM_STATE: AuthFormState = Object.freeze({
  status: 'idle',
});
