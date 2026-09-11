import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { BASE_URL } from '@/api/config';
import { isJwtExpired } from './jwt';
import type { AuthContextValue, UserDto } from './types';

const SESSION_KEY = 'session';
const SESSION_USER_KEY = 'session_user';

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function signOut() {
    GoogleSignin.signOut().catch(() => {});
    Promise.all([
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(SESSION_USER_KEY),
    ]).catch(() => {});
    setSession(null);
    setUser(null);
  }

  const signOutRef = useRef(signOut);

  useEffect(() => {
    signOutRef.current = signOut;
  });

  useEffect(() => {
    async function restore() {
      try {
        const [token, userJson] = await Promise.all([
          SecureStore.getItemAsync(SESSION_KEY),
          SecureStore.getItemAsync(SESSION_USER_KEY),
        ]);

        if (token && !isJwtExpired(token) && userJson) {
          setSession(token);
          setUser(JSON.parse(userJson) as UserDto);
        } else if (token || userJson) {
          await Promise.all([
            SecureStore.deleteItemAsync(SESSION_KEY),
            SecureStore.deleteItemAsync(SESSION_USER_KEY),
          ]);
        }
      } catch {
        // treat SecureStore errors as signed out
      } finally {
        setIsLoading(false);
        SplashScreen.hide();
      }
    }
    restore();
  }, []);

  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && sessionRef.current && isJwtExpired(sessionRef.current)) {
        signOutRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  async function signIn(googleIdToken: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: googleIdToken }),
    });
    if (!response.ok) {
      throw new Error(`Sign-in failed: ${response.status}`);
    }
    const data = (await response.json()) as { token: string; user: UserDto };
    await Promise.all([
      SecureStore.setItemAsync(SESSION_KEY, data.token),
      SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(data.user)),
    ]);
    setSession(data.token);
    setUser(data.user);
  }

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
