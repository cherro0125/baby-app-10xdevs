// In-memory SecureStore so persistence code can run under Jest.
// Cleared after every test; clearMocks only resets call history.
const mockSecureStore = new Map<string, string>();

afterEach(() => {
  mockSecureStore.clear();
});

jest.mock('expo-secure-store', () => {
  const store = mockSecureStore;
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]),
}));
