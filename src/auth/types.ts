export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthContextValue {
  session: string | null;
  user: UserDto | null;
  isLoading: boolean;
  signIn: (googleIdToken: string) => Promise<void>;
  signOut: () => void;
}
