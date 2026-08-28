import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  saveProfile.mockReset();
  vi.mocked(saveAvatarFromBrowser).mockReset();
  vi.mocked(deleteAvatarFromBrowser).mockReset();
});

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
      email: 'brewer@example.com',
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
