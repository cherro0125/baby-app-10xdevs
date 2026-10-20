export const BASE_URL = __DEV__
  ? (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080')
  : (process.env.EXPO_PUBLIC_API_URL ?? '');
