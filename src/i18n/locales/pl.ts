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
  format: {
    minSec: '{{m}} min {{s}} s',
    min: '{{m}} min',
    hMin: '{{h}} godz. {{m}} min',
    ml: '{{amount}} ml',
  },
};

export default pl;
