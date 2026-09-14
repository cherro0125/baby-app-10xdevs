# Sleep Log — Plan Brief

## What we're building

A sleep timer tab between Feeding and Partner. Parent taps Start → elapsed counter runs → taps Stop → completion sheet (Nap / Night / Other + optional note) → entry saved and visible to partner within ~5 seconds.

## Three phases

| Phase | What lands |
|-------|------------|
| 1 · Backend | V7 creates `sleeps` table; V8 adds CHECK constraints. Full Spring Boot domain: `Sleep` entity, `SleepType` enum (NAP/NIGHT/OTHER), repository, service, controller, `SleepNotFoundException`, `GlobalExceptionHandler` update. Endpoints: POST / PATCH / GET / GET shared / DELETE under `/api/sleeps`. |
| 2 · Frontend data | `sleeps` SQLite table in `schema.ts`. `LocalSleep` interface + `SleepType` type in `types.ts`. `use-sleeps.ts` hook: local mutations, 5-second partner polling, upload (`synced=0 AND ended_at IS NOT NULL`). |
| 3 · Frontend UI | `SleepTimer`, `SleepCompletionSheet`, `SleepRow`, `SleepList`, `IncompleteSleepModal`, `SleepTimeEditSheet`, `sleep-log.tsx` screen. Tab registered in `app-tabs.tsx` and `app-tabs.web.tsx` between Feeding and Partner. |

## Key decisions

- **durationMinutes**: server-derived (`ChronoUnit.MINUTES.between(startedAt, endedAt).toInt()`); not sent by client.
- **Upload gate**: only `synced=0 AND ended_at IS NOT NULL` rows uploaded (finalized sleeps only).
- **Crash recovery**: `IncompleteSleepModal` shown when `activeSleep.id === initialActiveId` on load.
- **Default on EndNow**: `sleepType = 'NAP'` (same pattern as `handleEndNow` in feeding-log).
- **Flyway**: V7 = create table, V8 = CHECK constraints (sleep_type_valid + sleeps_temporal_order).
- **Badge colors**: NAP = `#2196F3` (blue), NIGHT = `#7B1FA2` (purple), OTHER = `theme.backgroundElement`.

## Template references

| New file | Mirrors |
|----------|---------|
| `Sleep.kt` | `Feeding.kt` (no amountMl) |
| `SleepService.kt` | `FeedingService.kt` |
| `SleepController.kt` | `FeedingController.kt` |
| `use-sleeps.ts` | `use-feedings.ts` |
| `sleep-completion-sheet.tsx` | `feeding-completion-sheet.tsx` (no amount input) |
| `sleep-row.tsx` | `feeding-row.tsx` (NAP/NGT/OTH badges) |
| `sleep-log.tsx` | `feeding-log.tsx` |
