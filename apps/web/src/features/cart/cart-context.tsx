'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  createBrowserCartTransport,
  type Cart,
  type CartTransport,
} from './cart-transport';

export type CartState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ cart: Cart; kind: 'ready'; message?: string }>
  | Readonly<{ kind: 'unavailable' }>;

export type CartPendingOperation =
  | Readonly<{ kind: 'add' }>
  | Readonly<{ kind: 'clear' }>
  | Readonly<{ kind: 'recheck' }>
  | Readonly<{ kind: 'remove'; productSlug: string }>
  | Readonly<{
      kind: 'update';
      productSlug: string;
      amount: number;
    }>;

export type CartContextValue = Readonly<{
  add(productSlug: string, amount: number): Promise<void>;
  clear(): Promise<void>;
  ensureLoaded(): Promise<void>;
  items: Cart['items'];
  pending: CartPendingOperation | null;
  recheck(): Promise<void>;
  refresh(): Promise<void>;
  remove(productSlug: string): Promise<void>;
  state: CartState;
  totalsAreRefreshing: boolean;
  update(productSlug: string, amount: number): Promise<void>;
}>;

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  transport: injectedTransport,
}: Readonly<{ children: ReactNode; transport?: CartTransport }>) {
  const [browserTransport] = useState(createBrowserCartTransport);
  const transport = injectedTransport ?? browserTransport;
  const [state, setState] = useState<CartState>({ kind: 'loading' });
  const [pending, setPending] = useState<CartPendingOperation | null>(null);
  const responseId = useRef(0);
  const initialLoad = useRef<Promise<void> | null>(null);
  const pendingRef = useRef<CartPendingOperation | null>(null);
  const pendingMutation = useRef<Promise<void> | null>(null);

  const loadCanonical = useCallback(
    async (showLoading: boolean) => {
      const requestId = ++responseId.current;
      if (showLoading) setState({ kind: 'loading' });
      try {
        const cart = await transport.load();
        if (responseId.current === requestId) {
          setState(readyState(cart));
        }
      } catch {
        if (responseId.current === requestId) setState({ kind: 'unavailable' });
      }
    },
    [transport],
  );

  const refresh = useCallback(async () => {
    // A refresh requested while a mutation is in flight waits until the
    // mutation settles, so a pre-mutation read cannot win the response race.
    await pendingMutation.current;
    const request = loadCanonical(true);
    initialLoad.current = request;
    void request.finally(() => {
      if (initialLoad.current === request) initialLoad.current = null;
    });
    await request;
  }, [loadCanonical]);

  const ensureLoaded = useCallback(() => {
    if (state.kind !== 'loading') return Promise.resolve();

    if (!initialLoad.current) {
      const request = loadCanonical(false);
      initialLoad.current = request;
      void request.finally(() => {
        if (initialLoad.current === request) initialLoad.current = null;
      });
    }

    return initialLoad.current;
  }, [loadCanonical, state.kind]);

  const mutate = useCallback(
    async (nextPending: CartPendingOperation, action: () => Promise<Cart>) => {
      if (pendingRef.current) return;

      const requestId = ++responseId.current;
      pendingRef.current = nextPending;
      setPending(nextPending);
      const mutation = (async () => {
        try {
          const cart = await action();
          if (responseId.current === requestId) {
            setState(readyState(cart));
          }
        } catch {
          try {
            const cart = await transport.load();
            if (responseId.current === requestId) {
              setState(
                readyState(
                  cart,
                  'Your cart was refreshed after the change could not be completed.',
                ),
              );
            }
          } catch {
            if (responseId.current === requestId)
              setState({ kind: 'unavailable' });
          }
        } finally {
          // Refreshes use their own response ordering. They must never retain
          // this mutation's lock after the mutation itself has settled.
          pendingRef.current = null;
          pendingMutation.current = null;
          setPending(null);
        }
      })();
      pendingMutation.current = mutation;
      await mutation;
    },
    [transport],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      add: (productSlug, amount) =>
        mutate({ kind: 'add' }, () => transport.add(productSlug, amount)),
      clear: () => mutate({ kind: 'clear' }, () => transport.clear()),
      ensureLoaded,
      items: projectItems(state, pending),
      pending,
      recheck: () => mutate({ kind: 'recheck' }, () => transport.recheck()),
      refresh,
      remove: (productSlug) =>
        mutate({ kind: 'remove', productSlug }, () =>
          transport.remove(productSlug),
        ),
      state,
      totalsAreRefreshing: state.kind === 'ready' && pending !== null,
      update: (productSlug, amount) =>
        mutate({ kind: 'update', productSlug, amount }, () =>
          transport.update(productSlug, amount),
        ),
    }),
    [ensureLoaded, mutate, pending, refresh, state, transport],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function readyState(cart: Cart, fallbackMessage?: string): CartState {
  return {
    cart,
    kind: 'ready',
    message: cart.adjustmentMessage ?? fallbackMessage,
  };
}

function projectItems(
  state: CartState,
  pending: CartPendingOperation | null,
): Cart['items'] {
  if (state.kind !== 'ready') return [];
  if (!pending || pending.kind === 'add' || pending.kind === 'recheck') {
    return state.cart.items;
  }
  if (pending.kind === 'clear') return [];
  if (pending.kind === 'remove') {
    return state.cart.items.filter(
      (item) => item.productSlug !== pending.productSlug,
    );
  }
  return state.cart.items.map((item) =>
    item.productSlug === pending.productSlug
      ? { ...item, amount: pending.amount }
      : item,
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
