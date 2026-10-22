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
  feeding: {
    startButton: 'Rozpocznij karmienie',
    empty: 'Nie zapisano jeszcze karmień',
    details: 'Szczegóły karmienia',
    amountPlaceholder: 'Ilość (ml)',
    milkType: {
      breast: 'Pierś',
      formula: 'Modyfikowane',
      pumped: 'Odciągnięte',
      other: 'Inne',
    },
    milkTypeShort: {
      breast: 'PIE',
      formula: 'MOD',
      pumped: 'ODC',
      other: 'INN',
    },
    edit: {
      title: 'Edytuj karmienie',
      saveFailed: 'Nie udało się zapisać zmian. Spróbuj ponownie.',
      invalidAmount: 'Podaj ilość jako liczbę całkowitą ml',
    },
    incomplete: {
      title: 'Karmienie w toku',
      body: 'Wygląda na to, że pomiar karmienia nie został zatrzymany. Co chcesz zrobić?',
    },
  },
  partner: {
    title: 'Partner',
    unlink: 'Rozłącz',
    unlinkConfirm: 'Na pewno? To usunie połączenie dla was obojga.',
    linkPrompt: 'Połączyć z partnerem?',
    accept: 'Akceptuj',
    linking: 'Łączenie…',
    decline: 'Odrzuć',
    inviteCode: 'Twój kod zaproszenia',
    shareInvite: 'Udostępnij link z zaproszeniem',
    invite: 'Zaproś partnera',
    orEnterCode: '— lub wpisz kod partnera —',
    link: 'Połącz',
    errors: {
      expired: 'To zaproszenie wygasło.',
      notFound: 'Nie znaleziono kodu.',
      codeLength: 'Wpisz pełny 8-znakowy kod.',
      alreadyLinked: 'Jedno z was jest już połączone z kimś innym.',
      generic: 'Coś poszło nie tak. Spróbuj ponownie.',
      inviteFailed: 'Nie udało się utworzyć zaproszenia. Spróbuj ponownie.',
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
