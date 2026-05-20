## 1. Settings

- [x] 1.1 Add `AUTO_ACCEPT_GUEST_REQUESTS: "auto_accept_guest_requests"` to `SETTINGS_KEYS` and `false` to `SETTINGS_DEFAULTS` in `src/stores/settingsStore.ts`
- [x] 1.2 Expose a typed getter/setter on `useSettingsStore` for the new key (covered by the existing generic `getSetting`/`setSetting` — no per-key wrapper needed per project convention)
- [x] 1.3 Add toggle + helper copy to the Queue tab of `src/components/settings/SettingsDialog.tsx` ("Auto-accept guest requests" / "Skip approval — incoming requests go straight to the queue")

## 2. Session store branch

- [x] 2.1 In `refreshHostedSession` (src/stores/sessionStore.ts), read `auto_accept_guest_requests` when new pending requests are detected
- [x] 2.2 When setting is `true`, call `loadPendingRequests` and route each request through `addRequestToQueueWithSinger` instead of firing the "new requests" notification
- [x] 2.3 For each auto-accepted request, emit one `notify("info", "<guest_name> added <song> to the queue")` with no action
- [x] 2.4 Preserve current behavior when the setting is `false`

## 3. Host UI badge

- [x] 3.1 Render an `Auto-accept: ON` badge near the join code in `HostSessionModal` when `auto_accept_guest_requests` is `true`
- [x] 3.2 Ensure the badge reactively appears/disappears as the setting toggles during an active session (selector subscribes to `useSettingsStore`)

## 4. Tests

- [x] 4.1 Unit-test sessionStore branch: setting off → notification fires, request stays pending
- [x] 4.2 Unit-test sessionStore branch: setting on → `addRequestToQueueWithSinger` called per pending request, passive toast emitted, modal not shown
- [x] 4.3 Unit-test that flipping setting mid-session changes routing on the next poll
- [x] 4.4 E2E (or component test) for SettingsDialog toggle persistence — covered by settingsStore key/default tests + existing generic settings persistence
- [x] 4.5 E2E (or component test) for `Auto-accept: ON` badge visibility in `HostSessionModal`

## 5. Docs

- [x] 5.1 Add an entry to `CHANGELOG.md` under Unreleased
- [x] 5.2 Mention the toggle in CLAUDE.md "Hosted Sessions" section if user-facing behavior shifts (optional) — skipped; behaviour additive, no convention change
