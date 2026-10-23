import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createApiClient } from '@/api/client';
import { useSession } from '@/auth/session-provider';

export interface PartnerDto {
  id: string;
  email: string;
  displayName: string | null;
}

export interface PartnerInviteDto {
  token: string;
  deepLink: string;
  expiresAt: string;
}

export interface InviterInfoDto {
  inviterName: string | null;
  inviterEmail: string;
}

export interface UsePartnerResult {
  partner: PartnerDto | null;
  isLoading: boolean;
  /** Re-reads the link status from the server, e.g. while an invite waits to be accepted. */
  refresh: () => Promise<void>;
  generateInvite: () => Promise<PartnerInviteDto>;
  getInviteInfo: (token: string) => Promise<InviterInfoDto>;
  acceptInvite: (token: string) => Promise<void>;
  unlink: () => Promise<void>;
}

const PartnerContext = createContext<UsePartnerResult | null>(null);

export function usePartner(): UsePartnerResult {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error('usePartner must be used within PartnerProvider');
  return ctx;
}

// One partner state for all tabs: the tabs stay mounted, so per-screen copies went stale
// when the link changed on another screen or on the partner's device.
export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useSession();
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  // Ignores responses from fetches superseded by a newer fetch or a session change.
  const fetchSeqRef = useRef(0);
  const [partner, setPartner] = useState<PartnerDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    sessionRef.current = session;
    signOutRef.current = signOut;
  });

  function api() {
    return createApiClient(() => sessionRef.current, () => signOutRef.current());
  }

  async function fetchStatus() {
    const seq = ++fetchSeqRef.current;
    // Signed out: the value below reports no partner, nothing to fetch.
    if (!sessionRef.current) return;
    try {
      const res = await api().request('/api/partner');
      if (seq !== fetchSeqRef.current) return;
      if (res.ok) {
        setPartner((await res.json()) as PartnerDto);
      } else if (res.status === 404) {
        setPartner(null);
      }
    } catch (e) {
      console.error('[usePartner] fetchStatus failed', e);
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    function load() {
      fetchStatus().catch(console.error);
    }
    // Deferred like the AppState callback, so no state update runs synchronously inside the effect.
    const initial = setTimeout(load, 0);
    // The partner may have linked or unlinked while the app was in the background.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      clearTimeout(initial);
      sub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // While linked, re-check every 10 s in the foreground so an unlink on the partner's device shows
  // up here too. Chained, so a slow response is never overlapped or discarded.
  const partnerId = partner?.id ?? null;
  useEffect(() => {
    if (!session || !partnerId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (AppState.currentState === 'active') await fetchStatus().catch(console.error);
      if (!cancelled) timer = setTimeout(poll, 10_000);
    }
    timer = setTimeout(poll, 10_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, partnerId]);

  async function generateInvite(): Promise<PartnerInviteDto> {
    const res = await api().request('/api/partner/invite', { method: 'POST' });
    if (!res.ok) throw new Error(`generateInvite failed: ${res.status}`);
    return (await res.json()) as PartnerInviteDto;
  }

  async function getInviteInfo(token: string): Promise<InviterInfoDto> {
    const res = await api().request(`/api/partner/invite/${encodeURIComponent(token)}`);
    if (!res.ok) {
      const err = new Error(`getInviteInfo failed: ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as InviterInfoDto;
  }

  async function acceptInvite(token: string): Promise<void> {
    const res = await api().request('/api/partner/link', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const err = new Error(`acceptInvite failed: ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const data = (await res.json()) as { partnerId: string; partnerName: string | null; partnerEmail: string };
    fetchSeqRef.current++;
    setPartner({ id: data.partnerId, email: data.partnerEmail, displayName: data.partnerName });
  }

  async function unlink(): Promise<void> {
    const res = await api().request('/api/partner', { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`unlink failed: ${res.status}`);
    }
    fetchSeqRef.current++;
    setPartner(null);
  }

  const value: UsePartnerResult = {
    partner: session ? partner : null,
    isLoading: session ? isLoading : false,
    refresh: fetchStatus,
    generateInvite,
    getInviteInfo,
    acceptInvite,
    unlink,
  };

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}
