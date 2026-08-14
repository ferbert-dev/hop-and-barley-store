import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from './dialog';

const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);

describe('Dialog', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button')?.focus();
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(function close(this: HTMLDialogElement) {
        this.removeAttribute('open');
        setTimeout(() => this.dispatchEvent(new Event('close')), 0);
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();

    if (originalShowModal) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        originalShowModal,
      );
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    }

    if (originalClose) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        'close',
        originalClose,
      );
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it('opens modally with connected title and description', () => {
    render(
      <Dialog
        description="This cannot be undone."
        id="retire-product"
        onOpenChange={vi.fn()}
        open
        title="Retire product?"
      >
        Product details
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Retire product?' });
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
  });

  it('requests close on Escape and restores the previous focus after closing', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.append(trigger);
    trigger.focus();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Dialog
        id="remove-item"
        onOpenChange={onOpenChange}
        open
        title="Remove item?"
      >
        Confirmation
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <Dialog
        id="remove-item"
        onOpenChange={onOpenChange}
        open={false}
        title="Remove item?"
      >
        Confirmation
      </Dialog>,
    );

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('exposes an explicit close control', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        id="account-help"
        onOpenChange={onOpenChange}
        open
        title="Account help"
      >
        Help content
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores a queued close event after an immediate reopen', async () => {
    vi.useFakeTimers();
    const firstTrigger = document.createElement('button');
    const secondTrigger = document.createElement('button');
    firstTrigger.textContent = 'First trigger';
    secondTrigger.textContent = 'Second trigger';
    document.body.append(firstTrigger, secondTrigger);
    firstTrigger.focus();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Dialog
        id="queued-close"
        onOpenChange={onOpenChange}
        open
        title="Queued close"
      >
        Confirmation
      </Dialog>,
    );

    rerender(
      <Dialog
        id="queued-close"
        onOpenChange={onOpenChange}
        open={false}
        title="Queued close"
      >
        Confirmation
      </Dialog>,
    );
    secondTrigger.focus();
    rerender(
      <Dialog
        id="queued-close"
        onOpenChange={onOpenChange}
        open
        title="Queued close"
      >
        Confirmation
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const closeButton = screen.getByRole('button', { name: 'Close dialog' });

    expect(dialog).toHaveAttribute('open');
    expect(closeButton).toHaveFocus();

    await act(async () => vi.runAllTimersAsync());

    expect(dialog).toHaveAttribute('open');
    expect(closeButton).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
    firstTrigger.remove();
    secondTrigger.remove();
  });

  it('reports a genuine native close and restores trigger focus', async () => {
    vi.useFakeTimers();
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.append(trigger);
    trigger.focus();
    const onOpenChange = vi.fn();
    render(
      <Dialog
        id="native-close"
        onOpenChange={onOpenChange}
        open
        title="Native close"
      >
        Confirmation
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;

    dialog.close();
    await act(async () => vi.runAllTimersAsync());

    expect(dialog).not.toHaveAttribute('open');
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
