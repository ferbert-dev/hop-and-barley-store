'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  createBrowserLikesTransport,
  type LikesTransport,
} from './likes-transport';

type LikesState = 'loading' | 'ready' | 'unavailable';

type LikesContextValue = Readonly<{
  count: number | null;
  createLike: (paymentAttemptId: string) => Promise<void>;
  state: LikesState;
}>;

const unavailableContext: LikesContextValue = {
  count: null,
  createLike: async () => {
    throw new Error('Likes are unavailable');
  },
  state: 'unavailable',
};

const LikesContext = createContext<LikesContextValue>(unavailableContext);

export function LikesProvider({
  children,
  transport,
}: Readonly<{
  children: ReactNode;
  transport?: LikesTransport;
}>) {
  const [resolvedTransport] = useState(
    () => transport ?? createBrowserLikesTransport(),
  );
  const [count, setCount] = useState<number | null>(null);
  const [state, setState] = useState<LikesState>('loading');

  useEffect(() => {
    let active = true;

    void resolvedTransport.count().then(
      ({ count: nextCount }) => {
        if (!active) return;
        setCount(nextCount);
        setState('ready');
      },
      () => {
        if (active) setState('unavailable');
      },
    );

    return () => {
      active = false;
    };
  }, [resolvedTransport]);

  const createLike = useCallback(
    async (paymentAttemptId: string) => {
      const result = await resolvedTransport.create(paymentAttemptId);
      setCount(result.count);
      setState('ready');
    },
    [resolvedTransport],
  );

  const value = useMemo(
    () => ({ count, createLike, state }),
    [count, createLike, state],
  );

  return (
    <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
  );
}

export function useLikes() {
  return useContext(LikesContext);
}
