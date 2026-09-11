import { BASE_URL } from './config';

export function createApiClient(
  getSession: () => string | null,
  onUnauthorized: () => void,
) {
  return {
    async request(path: string, options?: RequestInit): Promise<Response> {
      const token = getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> | undefined),
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      if (response.status === 401 || response.status === 403) {
        onUnauthorized();
        throw new Error('Session expired');
      }
      return response;
    },
  };
}
