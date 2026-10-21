export default {
  signIn: {
    title: 'BabyTrack',
    tagline: 'Track together, decide together.',
    button: 'Sign in with Google',
    error: {
      generic: 'Sign-in failed. Please try again.',
      network: 'No internet connection.',
    },
  },
  tabs: {
    contractions: 'Contractions',
    feeding: 'Feeding',
    partner: 'Partner',
    settings: 'Settings',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    signOut: 'Sign out',
  },
  format: {
    minSec: '{{m}}m {{s}}s',
    min: '{{m}}m',
    hMin: '{{h}}h {{m}}m',
    ml: '{{amount}} ml',
  },
} as const;
