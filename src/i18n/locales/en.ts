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
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    confirmDelete: 'Confirm delete?',
    stop: 'Stop',
    start: 'Start',
    end: 'End',
    addNote: 'Add a note…',
    you: 'You',
    continueTiming: 'Continue timing',
    endNow: 'End now',
  },
  timeEdit: {
    title: 'Edit times',
    stopFirst: '(stop first to edit)',
    endAfterStart: 'End must be after start',
  },
  contractions: {
    startButton: 'Start Contraction',
    strength: 'Strength',
    empty: 'No contractions recorded yet',
    apart: '{{min}} min apart',
    firstLogged: 'first logged',
    banner: {
      none: 'No contractions yet',
      recording: 'Contractions recorded — keep timing',
      goNow: 'Pattern detected — may be time to go to the hospital',
    },
    incomplete: {
      title: 'Contraction in progress',
      body: 'It looks like a contraction was left running. What would you like to do?',
    },
  },
  format: {
    minSec: '{{m}}m {{s}}s',
    min: '{{m}}m',
    hMin: '{{h}}h {{m}}m',
    ml: '{{amount}} ml',
  },
} as const;
