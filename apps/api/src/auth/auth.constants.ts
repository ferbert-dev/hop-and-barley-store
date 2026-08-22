export const REGISTRATION_ACCEPTED = Object.freeze({
  status: 'accepted' as const,
});
export const REGISTRATION_UNAVAILABLE = Object.freeze({
  status: 'unavailable' as const,
});

export const REGISTRATION_CACHE_CONTROL = 'private, no-store';
export const REGISTRATION_VARY = 'Origin';
