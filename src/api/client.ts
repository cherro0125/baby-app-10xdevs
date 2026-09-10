const BASE_URL = __DEV__
  ? 'http://localhost:8080'
  : (process.env.EXPO_PUBLIC_API_URL ?? '');

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
      }
      return response;
    },
  };
}
