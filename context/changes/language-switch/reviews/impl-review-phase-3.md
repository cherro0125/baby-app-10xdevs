<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Language Switch (EN/PL)

- **Plan**: context/changes/language-switch/plan.md
- **Scope**: Phase 3 of 4 (commit 81fbc23)
- **Date**: 2026-10-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Polski dopisek „(najpierw zatrzymaj, aby edytować)” może wyjść poza ekran

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/time-edit-sheet.tsx:89-97
- **Detail**: Dla trwającego skurczu wiersz „Początek” ma trzy teksty obok siebie (etykieta 72px + godzina + dopisek), a styl `timeRow` nie ma `flexShrink`/zawijania. Po polsku to ok. 350pt+ przy ok. 327pt dostępnych na telefonie 375pt. Na 16 Pro Max (440pt) się mieści, dlatego test ręczny tego nie pokazał.
- **Fix**: Dodać `flexShrink: 1` na tekście dopisku, żeby zawijał się do drugiej linii.
- **Decision**: FIXED (flexShrink: 1 on the hint text)

### F2 — Zmiana szerokości etykiety 40→72 niezapisana; arkusz karmienia wciąż ma 40

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/time-edit-sheet.tsx:205-208, src/components/feeding-time-edit-sheet.tsx:198-200
- **Detail**: Uzasadniony drift (komentarz w kodzie + opis w commicie), ale plan go nie zna. `feeding-time-edit-sheet.tsx` (faza 4) ma tę samą etykietę z `width: 40`, więc „Początek” się tam nie zmieści, a dwa bliźniacze arkusze się rozjadą.
- **Fix**: Dopisać notatkę w `change.md` → `## Notes` i w fazie 4 zastosować tę samą szerokość (oraz fix z F1) w arkuszu karmienia.
- **Decision**: FIXED (note in change.md ## Notes for Phase 4)

### F3 — Kilka polskich sformułowań brzmi sztywno

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/locales/pl.ts:29-48
- **Detail**: `contractions.startButton` „Rozpocznij skurcz” czyta się jak polecenie „zacznij mieć skurcz” (główny przycisk ekranu). Poza tym: `confirmDelete` „Potwierdzić usunięcie?” (sztywne), `endAfterStart` „Koniec musi być po początku” (niezgrabne), `stop` „Stop” (vs „Zatrzymaj” w `stopFirst`), `apart` „{{min}} min odstępu” (poprawne, test ręczny je zakładał).
- **Fix**: `startButton` → „Rozpocznij pomiar”, `confirmDelete` → „Na pewno usunąć?”, `endAfterStart` → „Koniec musi być później niż początek”; resztę zostawić.
- **Decision**: FIXED (startButton, confirmDelete, endAfterStart reworded)

### F4 — Komunikat błędu przechowywany jako przetłumaczony tekst

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/time-edit-sheet.tsx:72,111-113
- **Detail**: `setError(t('timeEdit.endAfterStart'))` zamraża język w stanie. Dziś nieosiągalne (arkusz to pełnoekranowy Modal, nie da się wtedy wejść w Ustawienia).
- **Fix**: Trzymać w stanie flagę (`useState(false)`) i wołać `t()` przy renderze.
- **Decision**: FIXED (boolean state, translated at render)

### F5 — Klucz `common.start` to rzeczownik („Początek”), nazwa sugeruje czasownik

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/locales/pl.ts:32
- **Detail**: Poprawne dla etykiety w arkuszu edycji, ale w fazie 4 ktoś może go użyć na przycisku „Start” i dostanie „Początek”. Nazwa klucza pochodzi z kontraktu planu.
- **Fix**: Zostawić nazwę z planu i pamiętać w fazie 4, że `common.start`/`common.end` to etykiety czasu, nie akcje.
- **Decision**: FIXED (documented in change.md ## Notes; key names kept per plan contract)
