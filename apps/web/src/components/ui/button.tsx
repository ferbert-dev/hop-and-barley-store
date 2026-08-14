import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

import { classNames } from './class-names';
import styles from './primitives.module.css';

export type ButtonVariant = 'danger' | 'primary' | 'secondary';

interface ButtonSharedProps {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
}

type ButtonAsLinkProps = ButtonSharedProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'className' | 'href'
  > & {
    disabled?: never;
    href: string;
    pending?: never;
    pendingLabel?: never;
    type?: never;
  };

type ButtonAsButtonProps = ButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: never;
    pending?: boolean;
    pendingLabel?: string;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const variantClasses: Record<ButtonVariant, string> = {
  danger: styles.buttonDanger,
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
};

export function Button(props: ButtonProps) {
  if ('href' in props && props.href !== undefined) {
    const {
      children,
      className,
      href,
      variant = 'primary',
      ...anchorProps
    } = props;

    return (
      <a
        {...anchorProps}
        className={classNames(
          styles.button,
          variantClasses[variant],
          className,
        )}
        href={href}
      >
        {children}
      </a>
    );
  }

  const {
    children,
    className,
    disabled,
    pending = false,
    pendingLabel = 'Working…',
    type = 'button',
    variant = 'primary',
    ...buttonProps
  } = props;

  return (
    <button
      {...buttonProps}
      aria-busy={pending || undefined}
      aria-label={pending ? pendingLabel : buttonProps['aria-label']}
      className={classNames(styles.button, variantClasses[variant], className)}
      disabled={disabled || pending}
      type={type}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
