import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthForm, type AuthFormAction } from './auth-form';

describe('AuthForm', () => {
  it('renders the exact registration fields, visible requirements, and inert Google CTA', () => {
    render(<AuthForm action={vi.fn()} kind="register" />);

    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('At least 12 characters total')).toBeVisible();
    expect(screen.queryByLabelText(/Remember me/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Google sign-in is not available in this MVP.'),
    ).toBeVisible();
  });

  it('updates every password requirement while typing and reports mismatch', async () => {
    const user = userEvent.setup();
    render(<AuthForm action={vi.fn()} kind="register" />);

    await user.type(screen.getByLabelText('Password'), 'Abcdefghi1!x');
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveTextContent(/— met$/);
    }

    await user.type(screen.getByLabelText('Confirm Password'), 'Abcdefghi1!y');
    expect(screen.getByText('Passwords do not match.')).toHaveAttribute(
      'role',
      'alert',
    );
  });

  it('announces field-safe login validation returned by the action', async () => {
    const user = userEvent.setup();
    const action = vi.fn<AuthFormAction>().mockResolvedValue({
      errors: {
        email: 'Enter a valid email address.',
        password: 'Enter your password.',
      },
      status: 'invalid',
    });
    render(<AuthForm action={action} kind="login" />);

    await user.type(screen.getByLabelText('Email address'), 'bad@example.com');
    await user.type(screen.getByLabelText('Password'), 'submitted-value');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Enter your password.')).toHaveAttribute(
      'role',
      'alert',
    );
  });

  it('exposes a pending state without allowing a duplicate submit', async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: { status: 'unavailable' }) => void) | undefined;
    const action = vi.fn<AuthFormAction>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<AuthForm action={action} kind="login" />);

    await user.type(screen.getByLabelText('Email address'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-value');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    resolveAction?.({ status: 'unavailable' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Authentication is temporarily unavailable.',
    );
  });

  it('shows only the generic accepted registration outcome', async () => {
    const user = userEvent.setup();
    const action = vi
      .fn<AuthFormAction>()
      .mockResolvedValue({ status: 'accepted' });
    render(<AuthForm action={action} kind="register" />);

    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'Abcdefghi1!x');
    await user.type(screen.getByLabelText('Confirm Password'), 'Abcdefghi1!x');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If the details can be accepted, your account is ready.',
    );
    expect(
      screen.getByRole('link', { name: 'Continue to sign in' }),
    ).toHaveAttribute('href', '/login');
  });
});
