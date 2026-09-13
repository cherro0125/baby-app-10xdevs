import { useEffect, useRef, useState } from 'react';

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
  generateInvite: () => Promise<PartnerInviteDto>;
  getInviteInfo: (token: string) => Promise<InviterInfoDto>;
  acceptInvite: (token: string) => Promise<void>;
  unlink: () => Promise<void>;
}

export function usePartner(): UsePartnerResult {
  const { session, signOut } = useSession();
  const sessionRef = useRef<string | null>(null);
  const signOutRef = useRef(signOut);
  const [partner, setPartner] = useState<PartnerDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    sessionRef.current = session;
    signOutRef.current = signOut;
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      const token = sessionRef.current;
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const api = createApiClient(() => sessionRef.current, () => signOutRef.current());
        const res = await api.request('/api/partner');
        if (!cancelled) {
          if (res.ok) {
            const data = (await res.json()) as PartnerDto;
            setPartner(data);
          } else if (res.status === 404) {
            setPartner(null);
          }
        }
      } catch (e) {
        console.error('[usePartner] fetchStatus failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchStatus().catch(console.error);
    return () => { cancelled = true; };
  }, [session]);

  function api() {
    return createApiClient(() => sessionRef.current, () => signOutRef.current());
  }

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
    setPartner({ id: data.partnerId, email: data.partnerEmail, displayName: data.partnerName });
  }

  async function unlink(): Promise<void> {
    const res = await api().request('/api/partner', { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`unlink failed: ${res.status}`);
    }
    setPartner(null);
  }

  return { partner, isLoading, generateInvite, getInviteInfo, acceptInvite, unlink };
}
