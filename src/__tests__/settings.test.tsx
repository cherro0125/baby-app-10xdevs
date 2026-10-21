import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useSession } from '@/auth/session-provider';
import i18n from '@/i18n';
import { LANGUAGE_STORAGE_KEY } from '@/i18n/language';
import SettingsScreen from '@/app/(app)/settings';

jest.mock('@/auth/session-provider', () => ({
  useSession: jest.fn(),
}));

const signOut = jest.fn();

beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({ signOut } as unknown as ReturnType<typeof useSession>);
});

afterEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

describe('SettingsScreen', () => {
  it('shows English labels by default', async () => {
    await render(<SettingsScreen />);

    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('Sign out')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Polski' })).not.toBeChecked();
  });

  it('switches to Polish and persists the choice', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Polski'));

    expect(screen.getByText('Ustawienia')).toBeOnTheScreen();
    expect(screen.getByText('Język')).toBeOnTheScreen();
    expect(screen.getByText('Wyloguj się')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Polski' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, 'pl');
  });

  it('signs out', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
