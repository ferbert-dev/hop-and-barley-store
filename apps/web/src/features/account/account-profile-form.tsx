'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useRouter } from 'next/navigation';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { logoutAction } from '../auth/auth-actions';
import { INITIAL_AUTH_FORM_STATE } from '../auth/auth-state';
import type { CurrentUserProfile as ServerCurrentUserProfile } from './profile-server';
import {
  browserAvatarUrl,
  deleteAvatarFromBrowser,
  saveAvatarFromBrowser,
  saveProfileFromBrowser,
  type CurrentUserProfile,
  type ProfilePatch,
} from './profile-browser-transport';
import styles from './account-profile.module.css';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type AccountProfileFormProps = Readonly<{
  initialProfile: ServerCurrentUserProfile;
}>;

type ProfileValues = {
  additionalInfo: string;
  apartmentUnit: string;
  city: string;
  country: string;
  email: string;
  floor: string;
  fullName: string;
  houseNumber: string;
  phone: string;
  postalCode: string;
  street: string;
};

type Feedback = Readonly<{
  kind: 'error' | 'success';
  message: string;
}> | null;

export function AccountProfileForm({
  initialProfile,
}: AccountProfileFormProps) {
  const [profile, setProfile] = useState<CurrentUserProfile>(initialProfile);
  const [values, setValues] = useState(() => profileToValues(initialProfile));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [logoutState, logoutFormAction, loggingOut] = useActionState(
    logoutAction,
    INITIAL_AUTH_FORM_STATE,
  );

  const avatar = profile.profile?.avatar ?? null;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const setValue = (field: keyof ProfileValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const redirectToLogin = () => {
    router.replace('/login?next=%2Faccount');
  };

  const clearSelectedAvatar = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setSelectedAvatar(null);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    const result = await saveProfileFromBrowser(toProfilePatch(values));
    setSaving(false);

    if (result.kind === 'unauthenticated') {
      redirectToLogin();
      return;
    }
    if (result.kind === 'saved') {
      setProfile(result.profile);
      setValues(profileToValues(result.profile));
      setFeedback({
        kind: 'success',
        message: 'Your account information was saved.',
      });
      return;
    }
    setFeedback({
      kind: 'error',
      message:
        result.kind === 'conflict'
          ? 'That email address is already in use. Use a different email and try again.'
          : result.kind === 'invalid'
            ? 'Review your account information and try again.'
            : 'Your account information could not be saved. Please try again.',
    });
  };

  const selectAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.item(0) ?? null;
    setFeedback(null);
    if (!file) {
      clearSelectedAvatar();
      return;
    }
    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      event.currentTarget.value = '';
      clearSelectedAvatar();
      setFeedback({
        kind: 'error',
        message: 'Choose a JPEG, PNG, or WebP image for your profile photo.',
      });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      event.currentTarget.value = '';
      clearSelectedAvatar();
      setFeedback({
        kind: 'error',
        message: 'Choose a profile photo smaller than 2 MB.',
      });
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setSelectedAvatar(file);
  };

  const uploadAvatar = async () => {
    if (!selectedAvatar) return;
    setAvatarPending(true);
    setFeedback(null);

    const result = await saveAvatarFromBrowser(selectedAvatar);
    setAvatarPending(false);

    if (result.kind === 'unauthenticated') {
      redirectToLogin();
      return;
    }
    if (result.kind === 'saved') {
      setProfile((current) => ({
        ...current,
        profile: {
          avatar: result.avatar,
          fullName: current.profile?.fullName ?? null,
          phone: current.profile?.phone ?? null,
        },
      }));
      clearSelectedAvatar();
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setFeedback({
        kind: 'success',
        message: 'Your profile photo was updated.',
      });
      return;
    }
    setFeedback({
      kind: 'error',
      message:
        result.kind === 'too-large'
          ? 'Choose a profile photo smaller than 2 MB.'
          : result.kind === 'invalid'
            ? 'Choose a valid JPEG, PNG, or WebP image.'
            : 'Your profile photo could not be updated. Please try again.',
    });
  };

  const deleteAvatar = async () => {
    setAvatarPending(true);
    setFeedback(null);
    const result = await deleteAvatarFromBrowser();
    setAvatarPending(false);

    if (result.kind === 'unauthenticated') {
      redirectToLogin();
      return;
    }
    if (result.kind === 'deleted') {
      setProfile((current) => ({
        ...current,
        profile: current.profile ? { ...current.profile, avatar: null } : null,
      }));
      setFeedback({
        kind: 'success',
        message: 'Your profile photo was removed.',
      });
      return;
    }
    setFeedback({
      kind: 'error',
      message: 'Your profile photo could not be removed. Please try again.',
    });
  };

  const avatarDisplayUrl =
    previewUrl ?? (avatar && hydrated ? avatarUrl(avatar.updatedAt) : null);

  return (
    <div className={styles.content}>
      <nav aria-label="Account sections" className={styles.tabs}>
        <span aria-disabled="true" className={styles.tab}>
          Order History
        </span>
        <span
          aria-current="page"
          className={`${styles.tab} ${styles.tabActive}`}
        >
          Account Information
        </span>
      </nav>

      {feedback ? (
        <div
          className={
            feedback.kind === 'error'
              ? styles.feedbackError
              : styles.feedbackSuccess
          }
          ref={feedbackRef}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          tabIndex={-1}
        >
          {feedback.message}
        </div>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => void handleSave(event)}
      >
        <fieldset
          className={styles.fieldset}
          disabled={saving || avatarPending}
        >
          <section
            aria-labelledby="profile-photo-heading"
            className={styles.photoSection}
          >
            <div>
              <h2 id="profile-photo-heading">Profile photo</h2>
              <p>JPEG, PNG, or WebP, up to 2 MB.</p>
            </div>
            <div className={styles.photoControls}>
              <div aria-label="Profile photo preview" className={styles.avatar}>
                {avatarDisplayUrl ? (
                  // The avatar endpoint is session-protected and sends private,
                  // no-store responses, so it cannot use Next's public image proxy.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Current profile photo" src={avatarDisplayUrl} />
                ) : (
                  <span aria-hidden="true">{initials(values.fullName)}</span>
                )}
              </div>
              <div className={styles.photoActions}>
                <label className={styles.fileLabel} htmlFor="account-avatar">
                  Choose image
                </label>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="visually-hidden"
                  id="account-avatar"
                  onChange={selectAvatar}
                  ref={avatarInputRef}
                  type="file"
                />
                {selectedAvatar ? (
                  <p className={styles.selectedFile}>{selectedAvatar.name}</p>
                ) : null}
                <div className={styles.inlineActions}>
                  <Button
                    disabled={!selectedAvatar}
                    onClick={() => void uploadAvatar()}
                    pending={avatarPending}
                    pendingLabel="Uploading…"
                    type="button"
                    variant="secondary"
                  >
                    Upload photo
                  </Button>
                  {avatar ? (
                    <Button
                      onClick={() => void deleteAvatar()}
                      pending={avatarPending}
                      pendingLabel="Removing…"
                      type="button"
                      variant="secondary"
                    >
                      Remove photo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="account-details-heading"
            className={styles.section}
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="account-details-heading">Account information</h2>
                <p>
                  Keep these details current so we can contact you about your
                  order.
                </p>
              </div>
              <div className={styles.role}>
                <span>Account role</span>
                <Badge tone="neutral">
                  {profile.role === 'ADMIN' ? 'Administrator' : 'Customer'}
                </Badge>
              </div>
            </div>
            <div className={styles.fields}>
              <Field
                autoComplete="name"
                id="account-full-name"
                label="Full Name"
                maxLength={200}
                name="fullName"
                onChange={(event) =>
                  setValue('fullName', event.currentTarget.value)
                }
                value={values.fullName}
              />
              <Field
                autoComplete="tel"
                id="account-phone"
                inputMode="tel"
                label="Phone number"
                maxLength={32}
                name="phone"
                onChange={(event) =>
                  setValue('phone', event.currentTarget.value)
                }
                value={values.phone}
              />
              <Field
                autoComplete="email"
                id="account-email"
                inputMode="email"
                label="Email"
                maxLength={320}
                name="email"
                onChange={(event) =>
                  setValue('email', event.currentTarget.value)
                }
                required
                type="email"
                value={values.email}
              />
            </div>
          </section>

          <section
            aria-labelledby="shipping-address-heading"
            className={styles.section}
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="shipping-address-heading">Shipping address</h2>
                <p>Use your primary delivery address for future orders.</p>
              </div>
            </div>
            <div className={styles.fields}>
              <Field
                autoComplete="country-name"
                id="account-country"
                label="Country"
                maxLength={120}
                name="country"
                onChange={(event) =>
                  setValue('country', event.currentTarget.value)
                }
                value={values.country}
              />
              <Field
                autoComplete="address-level2"
                id="account-city"
                label="City"
                maxLength={120}
                name="city"
                onChange={(event) =>
                  setValue('city', event.currentTarget.value)
                }
                value={values.city}
              />
              <Field
                autoComplete="postal-code"
                id="account-postal-code"
                label="Postal code"
                maxLength={32}
                name="postalCode"
                onChange={(event) =>
                  setValue('postalCode', event.currentTarget.value)
                }
                value={values.postalCode}
              />
              <Field
                autoComplete="address-line1"
                id="account-street"
                label="Street"
                maxLength={200}
                name="street"
                onChange={(event) =>
                  setValue('street', event.currentTarget.value)
                }
                value={values.street}
              />
              <Field
                autoComplete="address-line1"
                id="account-house-number"
                label="House number"
                maxLength={32}
                name="houseNumber"
                onChange={(event) =>
                  setValue('houseNumber', event.currentTarget.value)
                }
                value={values.houseNumber}
              />
              <Field
                autoComplete="address-line2"
                id="account-apartment-unit"
                label="Apartment or unit"
                maxLength={64}
                name="apartmentUnit"
                onChange={(event) =>
                  setValue('apartmentUnit', event.currentTarget.value)
                }
                value={values.apartmentUnit}
              />
              <Field
                id="account-floor"
                label="Floor"
                maxLength={32}
                name="floor"
                onChange={(event) =>
                  setValue('floor', event.currentTarget.value)
                }
                value={values.floor}
              />
              <div className={styles.textareaField}>
                <label htmlFor="account-additional-info">
                  Additional delivery information
                </label>
                <textarea
                  id="account-additional-info"
                  maxLength={500}
                  name="additionalInfo"
                  onChange={(event) =>
                    setValue('additionalInfo', event.currentTarget.value)
                  }
                  rows={4}
                  value={values.additionalInfo}
                />
              </div>
            </div>
          </section>

          <div className={styles.saveAction}>
            <Button pending={saving} pendingLabel="Saving…" type="submit">
              Save
            </Button>
          </div>
        </fieldset>
      </form>

      <section
        aria-labelledby="account-session-heading"
        className={styles.sessionSection}
      >
        <div>
          <h2 id="account-session-heading">Session</h2>
          <p>Sign out from this device when you are finished.</p>
        </div>
        <form action={logoutFormAction}>
          <Button
            pending={loggingOut}
            pendingLabel="Signing out…"
            type="submit"
            variant="secondary"
          >
            Logout
          </Button>
          {logoutState.status === 'unavailable' ? (
            <p className={styles.logoutError} role="alert">
              Logout is temporarily unavailable.
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}

function profileToValues(profile: CurrentUserProfile): ProfileValues {
  const address = profile.primaryAddress;
  return {
    additionalInfo: address?.additionalInfo ?? '',
    apartmentUnit: address?.apartmentUnit ?? '',
    city: address?.city ?? '',
    country: address?.country ?? '',
    email: profile.email,
    floor: address?.floor ?? '',
    fullName: profile.profile?.fullName ?? '',
    houseNumber: address?.houseNumber ?? '',
    phone: profile.profile?.phone ?? '',
    postalCode: address?.postalCode ?? '',
    street: address?.street ?? '',
  };
}

function toProfilePatch(values: ProfileValues): ProfilePatch {
  const address = {
    additionalInfo: optionalValue(values.additionalInfo),
    apartmentUnit: optionalValue(values.apartmentUnit),
    city: optionalValue(values.city),
    country: optionalValue(values.country),
    floor: optionalValue(values.floor),
    houseNumber: optionalValue(values.houseNumber),
    postalCode: optionalValue(values.postalCode),
    street: optionalValue(values.street),
  };
  const addressIsEmpty = Object.values(address).every(
    (value) => value === null,
  );

  return {
    email: values.email,
    primaryAddress: addressIsEmpty ? null : address,
    profile: {
      fullName: optionalValue(values.fullName),
      // Phone values are deliberately not normalized or trimmed in the browser.
      phone: optionalValue(values.phone),
    },
  };
}

function optionalValue(value: string): string | null {
  return value.length === 0 ? null : value;
}

function initials(fullName: string): string {
  const letters = fullName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return letters || 'HB';
}

function avatarUrl(updatedAt: string): string {
  const url = new URL(browserAvatarUrl());
  url.searchParams.set('updatedAt', updatedAt);
  return url.toString();
}

function subscribeToHydration(): () => void {
  return () => undefined;
}
