import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountProfileForm } from './account-profile-form';
import {
  deleteAvatarFromBrowser,
  saveAvatarFromBrowser,
  saveProfileFromBrowser,
} from './profile-browser-transport';

vi.mock('../auth/auth-actions', () => ({
  logoutAction: async () => ({ status: 'idle' }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

vi.mock('./profile-browser-transport', () => ({
  browserAvatarUrl: () => 'http://localhost:3001/api/v1/users/me/avatar',
  deleteAvatarFromBrowser: vi.fn(),
  saveAvatarFromBrowser: vi.fn(),
  saveProfileFromBrowser: vi.fn(),
}));

const saveProfile = vi.mocked(saveProfileFromBrowser);
const saveAvatar = vi.mocked(saveAvatarFromBrowser);
const NativeUrl = URL;

beforeEach(() => {
  saveProfile.mockReset();
  saveAvatar.mockReset();
  vi.mocked(deleteAvatarFromBrowser).mockReset();
  vi.stubGlobal(
    'URL',
    Object.assign(class extends NativeUrl {}, {
      createObjectURL: vi.fn(() => 'blob:profile-preview'),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('AccountProfileForm', () => {
  it('keeps phone input exact and saves the self profile with intentional null address fields', async () => {
    saveProfile.mockResolvedValue({
      kind: 'saved',
      profile: {
        email: 'brewer@example.com',
        primaryAddress: null,
        profile: {
          avatar: null,
          fullName: 'Local Brewer',
          phone: '+34 600 123 456',
        },
        role: 'CUSTOMER',
      },
    });

    render(<AccountProfileForm initialProfile={initialProfile()} />);

    expect(screen.getByText('Account Information')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Order History')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('Customer')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('brewer@example.com');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(
      screen.getByText('Email cannot be changed from account information.'),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Full Name'), {
      target: { value: 'Local Brewer' },
    });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+34 600 123 456' },
    });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    expect(saveProfile).toHaveBeenCalledWith({
      primaryAddress: {
        additionalInfo: null,
        apartmentUnit: null,
        city: null,
        country: 'Spain',
        floor: null,
        houseNumber: null,
        postalCode: null,
        street: null,
      },
      profile: { fullName: 'Local Brewer', phone: '+34 600 123 456' },
    });
    expect(
      await screen.findByText('Your account information was saved.'),
    ).toBeVisible();
  });

  it('uploads a selected profile photo with the main Save action', async () => {
    const user = userEvent.setup();
    const savedProfile = initialProfile();
    const avatar = {
      contentType: 'image/png' as const,
      sizeBytes: 5,
      updatedAt: '2026-08-29T12:00:00.000Z',
    };
    saveProfile.mockResolvedValue({ kind: 'saved', profile: savedProfile });
    saveAvatar.mockResolvedValue({ kind: 'saved', avatar });
    render(<AccountProfileForm initialProfile={initialProfile()} />);

    const file = new File(['image'], 'profile.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose image'), file);

    expect(screen.getByAltText('Current profile photo')).toHaveAttribute(
      'src',
      'blob:profile-preview',
    );
    expect(
      screen.getByText('profile.png will be uploaded when you save.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Upload photo' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveAvatar).toHaveBeenCalledWith(file));
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile.mock.invocationCallOrder[0]).toBeLessThan(
      saveAvatar.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(
      await screen.findByText(
        'Your account information and profile photo were saved.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('profile.png will be uploaded when you save.'),
    ).not.toBeInTheDocument();
    expect(screen.getByAltText('Current profile photo')).toHaveAttribute(
      'src',
      expect.stringContaining('updatedAt=2026-08-29T12%3A00%3A00.000Z'),
    );
  });

  it('reports a partial save and keeps the selected photo available for retry', async () => {
    const user = userEvent.setup();
    saveProfile.mockResolvedValue({
      kind: 'saved',
      profile: initialProfile(),
    });
    saveAvatar.mockResolvedValue({ kind: 'unavailable' });
    render(<AccountProfileForm initialProfile={initialProfile()} />);

    const file = new File(['image'], 'profile.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose image'), file);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your account information was saved, but the profile photo could not be updated. Please try again.',
    );
    expect(
      screen.getByText('profile.png will be uploaded when you save.'),
    ).toBeVisible();
    expect(screen.getByAltText('Current profile photo')).toHaveAttribute(
      'src',
      'blob:profile-preview',
    );
  });
});

function initialProfile() {
  return {
    email: 'brewer@example.com',
    primaryAddress: {
      additionalInfo: null,
      apartmentUnit: null,
      city: 'Madrid',
      country: 'Spain',
      floor: null,
      houseNumber: null,
      postalCode: null,
      street: null,
    },
    profile: { avatar: null, fullName: null, phone: null },
    role: 'CUSTOMER' as const,
  };
}
