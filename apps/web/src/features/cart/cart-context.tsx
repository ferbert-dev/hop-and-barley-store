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
  | Readonly<{ kind: 'remove'; productSlug: string }>
  | Readonly<{
      kind: 'update';
      productSlug: string;
      quantity: number;
    }>;

export type CartContextValue = Readonly<{
  add(productSlug: string, quantity: number): Promise<void>;
  clear(): Promise<void>;
  items: Cart['items'];
  pending: CartPendingOperation | null;
  refresh(): Promise<void>;
  remove(productSlug: string): Promise<void>;
  state: CartState;
  totalsAreRefreshing: boolean;
  update(productSlug: string, quantity: number): Promise<void>;
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
  const pendingRef = useRef<CartPendingOperation | null>(null);
  const pendingMutation = useRef<Promise<void> | null>(null);

  const loadCanonical = useCallback(
    async (showLoading: boolean) => {
      const requestId = ++responseId.current;
      if (showLoading) setState({ kind: 'loading' });
      try {
        const cart = await transport.load();
        if (responseId.current === requestId) {
          setState({ cart, kind: 'ready' });
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
    await loadCanonical(true);
  }, [loadCanonical]);

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
            setState({ cart, kind: 'ready' });
          }
        } catch {
          try {
            const cart = await transport.load();
            if (responseId.current === requestId) {
              setState({
                cart,
                kind: 'ready',
                message:
                  'Your cart was refreshed after the change could not be completed.',
              });
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
      add: (productSlug, quantity) =>
        mutate({ kind: 'add' }, () => transport.add(productSlug, quantity)),
      clear: () => mutate({ kind: 'clear' }, () => transport.clear()),
      items: projectItems(state, pending),
      pending,
      refresh,
      remove: (productSlug) =>
        mutate({ kind: 'remove', productSlug }, () =>
          transport.remove(productSlug),
        ),
      state,
      totalsAreRefreshing: state.kind === 'ready' && pending !== null,
      update: (productSlug, quantity) =>
        mutate({ kind: 'update', productSlug, quantity }, () =>
          transport.update(productSlug, quantity),
        ),
    }),
    [mutate, pending, refresh, state, transport],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function projectItems(
  state: CartState,
  pending: CartPendingOperation | null,
): Cart['items'] {
  if (state.kind !== 'ready') return [];
  if (!pending || pending.kind === 'add') return state.cart.items;
  if (pending.kind === 'clear') return [];
  if (pending.kind === 'remove') {
    return state.cart.items.filter(
      (item) => item.productSlug !== pending.productSlug,
    );
  }
  return state.cart.items.map((item) =>
    item.productSlug === pending.productSlug
      ? { ...item, quantity: pending.quantity }
      : item,
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
