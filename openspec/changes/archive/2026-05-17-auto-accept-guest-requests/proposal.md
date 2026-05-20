## Why

For typical home-karaoke hosting (small parties, family use), the song-request approval modal added in #211 is unnecessary friction — the host wants requests to land directly on the queue. Defaulting auto-accept ON matches the common case; hosts who genuinely need vetting can opt out via Settings.

Refines #231 (originally framed as opt-in; flipped to opt-out per host UX feedback).

## What Changes

- New app-wide setting `auto_accept_guest_requests` (bool, **default `true`**), surfaced as a toggle on the **Queue** tab of `SettingsDialog`.
- When the setting is `true` (default), the hosted-session polling loop bypasses the approval modal: incoming pending requests are routed through the existing `addRequestToQueueWithSinger` path (singer auto-assignment from #215 is preserved).
- For each auto-accepted request, fire a passive toast `"<guest_name> added <song> to the queue"` via the existing `notificationStore`. No action button.
- When the setting is `false` (host opted out), the existing approval flow from #211 is unchanged, AND `HostSessionModal` shows a small `Manual approval: ON` badge near the join code so the host has a visible reminder that requests need their action.
- The default-on case shows no badge — it's the expected baseline.

Out of scope for this change:
- Rate-limiting / spam protection (issue #231 open question, deferred).
- Undo affordance on the auto-accept toast.
- Per-session override (setting is app-wide only).

## Capabilities

### New Capabilities

- `hosted-session-requests`: behavior of the host-side handling of incoming guest song requests — both the manual-approval flow (existing, captured to lock current behavior) and the new auto-accept opt-in path.

### Modified Capabilities

(none — `openspec/specs/` is currently empty; this change establishes the first spec.)

## Impact

- **Frontend**
  - `src/stores/settingsStore.ts` — new key in `SETTINGS_KEYS` / `SETTINGS_DEFAULTS`.
  - `src/components/settings/SettingsDialog.tsx` — toggle on the Queue tab.
  - `src/stores/sessionStore.ts` — branch in `refreshHostedSession` polling: when setting is on, call into existing approval logic for each pending request instead of firing the "new requests" notification.
  - `src/components/session/HostSessionModal.tsx` — `Auto-accept: ON` badge.
- **Backend (Tauri / Rust):** no changes — setting persistence already routes through existing `settings_set` / `settings_get` commands.
- **Backend (homekaraoke.app):** no changes — same `/api/session/{id}/requests` endpoints; client-side decision only.
- **Database:** no schema migration (settings are KV).
- **Tests:** unit tests on sessionStore branch; E2E coverage TBD in design / tasks.
