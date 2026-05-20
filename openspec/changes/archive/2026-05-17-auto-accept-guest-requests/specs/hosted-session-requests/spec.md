## ADDED Requirements

### Requirement: Auto-accept is the default for incoming guest song requests

The system SHALL expose an app-wide boolean setting `auto_accept_guest_requests`, **default `true`**, configurable from the **Queue** tab of `SettingsDialog`. When `true` (default), incoming pending guest song requests SHALL be added to the queue automatically without host approval.

#### Scenario: Toggle is visible and persistent in settings
- **WHEN** the host opens `SettingsDialog` and selects the Queue tab
- **THEN** the system SHALL display a toggle labelled "Auto-accept guest requests", on by default, with helper copy explaining that turning it off restores manual approval
- **AND** changes to the toggle SHALL persist across app restarts via the existing settings store

#### Scenario: Auto-accept routes new request directly to the queue
- **WHEN** the hosted-session polling cycle detects a new pending request
- **AND** the `auto_accept_guest_requests` setting is `true`
- **THEN** the system SHALL invoke `addRequestToQueueWithSinger` for that request, adding the song to the queue and auto-assigning the singer
- **AND** the request SHALL NOT appear in the approval modal

#### Scenario: Auto-accept emits a passive toast per accepted request
- **WHEN** a request is auto-accepted
- **THEN** the system SHALL emit one notification containing the guest's name and the song title (e.g. `"<guest_name> added <song> to the queue"`)
- **AND** the notification SHALL NOT include an action button

### Requirement: Host can opt out into manual approval

When the host toggles `auto_accept_guest_requests` to `false`, incoming guest song requests SHALL be held for manual approval (preserving the flow from #211) and the host SHALL get a visible reminder that the non-default mode is active.

#### Scenario: New pending requests arrive while auto-accept is off
- **WHEN** the hosted-session polling cycle detects one or more new pending requests
- **AND** the `auto_accept_guest_requests` setting is `false`
- **THEN** the system SHALL display a notification reporting the new request count with a "View" action
- **AND** the requests SHALL remain in `pending` status until the host approves or rejects them

#### Scenario: Host approves a pending request via the modal
- **WHEN** the host clicks "Approve" on a pending request in the approval modal
- **THEN** the system SHALL add the song to the queue via `addRequestToQueueWithSinger`, preserving singer auto-assignment

#### Scenario: Manual-approval reminder badge is visible while hosting
- **WHEN** a hosted session is active and `auto_accept_guest_requests` is `false`
- **THEN** `HostSessionModal` SHALL display a `Manual approval: ON` badge near the join code
- **AND** when the setting is `true` (default), the badge SHALL NOT be rendered

#### Scenario: Re-enabling auto-accept resumes auto-routing on the next poll
- **WHEN** the host toggles `auto_accept_guest_requests` from `false` to `true` while a session is active
- **THEN** subsequent pending requests SHALL be auto-routed to the queue per the default behaviour
- **AND** any pending requests still in the approval modal at toggle time SHALL remain pending until the next poll picks them up
