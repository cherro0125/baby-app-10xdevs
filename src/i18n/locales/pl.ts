import type { TranslationShape } from '../types';

const pl: TranslationShape = {
  signIn: {
    title: 'BabyTrack',
    tagline: 'Śledźcie razem, decydujcie razem.',
    button: 'Zaloguj się przez Google',
    error: {
      generic: 'Logowanie nie powiodło się. Spróbuj ponownie.',
      network: 'Brak połączenia z internetem.',
    },
  },
  tabs: {
    contractions: 'Skurcze',
    feeding: 'Karmienie',
    partner: 'Partner',
    settings: 'Ustawienia',
  },
  settings: {
    title: 'Ustawienia',
    language: 'Język',
    signOut: 'Wyloguj się',
  },
  common: {
    loading: 'Ładowanie…',
    cancel: 'Anuluj',
    confirm: 'Potwierdź',
    save: 'Zapisz',
    delete: 'Usuń',
    confirmDelete: 'Na pewno usunąć?',
    stop: 'Stop',
    start: 'Początek',
    end: 'Koniec',
    addNote: 'Dodaj notatkę…',
    you: 'Ty',
    continueTiming: 'Kontynuuj pomiar',
    endNow: 'Zakończ teraz',
  },
  timeEdit: {
    title: 'Edytuj czasy',
    stopFirst: '(najpierw zatrzymaj, aby edytować)',
    endAfterStart: 'Koniec musi być później niż początek',
  },
  contractions: {
    startButton: 'Rozpocznij pomiar',
    strength: 'Siła',
    empty: 'Nie zarejestrowano jeszcze skurczów',
    apart: '{{min}} min odstępu',
    firstLogged: 'pierwszy zapisany',
    banner: {
      none: 'Brak skurczów',
      recording: 'Skurcze zarejestrowane — mierz dalej',
      goNow: 'Wykryto wzorzec — może być czas jechać do szpitala',
    },
    incomplete: {
      title: 'Skurcz w toku',
      body: 'Wygląda na to, że pomiar skurczu nie został zatrzymany. Co chcesz zrobić?',
    },
  },
  format: {
    minSec: '{{m}} min {{s}} s',
    min: '{{m}} min',
    hMin: '{{h}} godz. {{m}} min',
    ml: '{{amount}} ml',
  },
};

export default pl;
