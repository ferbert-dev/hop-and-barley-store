import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordForm } from './forgot-password-form';

describe('ForgotPasswordForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders only the Figma-confirmed controls and returns Cancel to Sign In', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(
      screen.getByRole('button', { name: 'Reset Password' }),
    ).toBeEnabled();
  });

  it.each([
    ['', 'Enter your email address.'],
    ['not-an-email', 'Enter a valid email address.'],
  ])('rejects %j accessibly without a network call', async (email, message) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ForgotPasswordForm />);

    if (email) await user.type(screen.getByLabelText('Email'), email);
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(screen.getByText(message)).toHaveAttribute('role', 'alert');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['known@example.com', 'unknown@example.com'])(
    'replaces the form with the same neutral state for %s without delivery',
    async (email) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      render(<ForgotPasswordForm />);

      await user.type(screen.getByLabelText('Email'), email);
      await user.click(screen.getByRole('button', { name: 'Reset Password' }));

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(
        'If this email is registered, you will receive a password-reset link.',
      );
      expect(status).not.toHaveTextContent(/was sent|has been sent/i);
      expect(status).toHaveFocus();
      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
