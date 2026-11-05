import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { initialsOf, ROLE_LABEL } from '../lib/people';
import { supabase } from './client';
import { authErrorMessage, unwrap } from './errors';
import type { Profile } from './types';

type SessionState = {
  status: 'loading' | 'guest' | 'ready';
  userId: string | null;
};

const SessionContext = createContext<SessionState>({ status: 'loading', userId: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading', userId: null });

  useEffect(() => {
    let lastUserId: string | null = null;
    // В этом обработчике нельзя ждать вызовы supabase: клиент держит блокировку сессии.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      // Данные прошлого пользователя не должны быть видны следующему.
      if (userId !== lastUserId) queryClient.clear();
      lastUserId = userId;
      const status = userId ? 'ready' : 'guest';
      setState((prev) => (prev.status === status && prev.userId === userId ? prev : { status, userId }));
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession() {
  return use(SessionContext);
}

/** Профиль и роль вошедшего пользователя. На защищённых адресах удобнее useMe. */
export function useCurrentProfile() {
  const { userId } = useSession();
  return useQuery({
    queryKey: ['profiles', 'me', userId],
    enabled: !!userId,
    queryFn: async ({ signal }) =>
      unwrap(
        await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId ?? '')
          .abortSignal(signal)
          .maybeSingle(),
      ),
  });
}

export type Me = Profile & {
  initials: string;
  roleLabel: string;
  isManager: boolean;
};

const MeContext = createContext<Me | null>(null);

export function MeProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const me = useMemo(
    () => ({
      ...profile,
      initials: initialsOf(profile.full_name),
      roleLabel: ROLE_LABEL[profile.role],
      isManager: profile.role === 'manager',
    }),
    [profile],
  );
  return <MeContext value={me}>{children}</MeContext>;
}

/** Текущий пользователь. Работает на всех адресах за защитой входа. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error('useMe вызван вне защищённых адресов');
  return me;
}

/** Возвращает понятный текст ошибки или null, если вход удался. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return error ? authErrorMessage(error) : null;
}

export async function signOut(): Promise<boolean> {
  const { error } = await supabase.auth.signOut();
  return !error;
}
