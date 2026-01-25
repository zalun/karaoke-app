# Song Request Approval Feature Plan

## Overview

Add functionality for hosts to receive notifications about song requests from guests and approve/reject them through a dedicated UI.

## Features

1. **Notifications** - Show notification when new requests arrive, with link to approval modal
2. **Queue Button** - Badge button next to fair queue toggle showing pending count
3. **Approval Modal** - View and approve/reject requests grouped by guest

---

## Implementation

### 1. Extend Notification System

**File:** `src/stores/notificationStore.ts`

Extend `NotificationAction` to support onClick callbacks:

```typescript
export interface NotificationAction {
  label: string;
  url?: string;        // External links
  onClick?: () => void; // Internal actions (NEW)
}
```

**File:** `src/components/notification/NotificationBar.tsx`

Handle onClick callbacks in addition to URLs.

---

### 2. Add Song Request Types

**New File:** `src/types/songRequest.ts`

```typescript
export interface SongRequest {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "played";
  guest_name: string;  // From session_guests join
  requested_at: string;
  // Additional fields from song_requests table as needed
  youtube_id?: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
}

export interface GroupedRequests {
  guestName: string;
  requests: SongRequest[];
}
```

---

### 3. Extend Hosted Session Service

**File:** `src/services/hostedSession.ts`

Add new API methods using existing backend endpoints:

```typescript
// GET /api/session/{id}/requests?status=pending
getRequests(accessToken, sessionId, status?: string): Promise<SongRequest[]>

// PATCH /api/session/{id}/requests with body { action: "approve", requestId }
approveRequest(accessToken, sessionId, requestId): Promise<void>

// PATCH /api/session/{id}/requests with body { action: "reject", requestId }
rejectRequest(accessToken, sessionId, requestId): Promise<void>

// PATCH /api/session/{id}/requests with body { action: "approve", requestIds: [...] }
approveAllRequests(accessToken, sessionId, requestIds: string[]): Promise<void>
```

---

### 4. Extend Session Store

**File:** `src/stores/sessionStore.ts`

Add state and actions:

```typescript
// State
pendingRequests: SongRequest[];
previousPendingCount: number;
showRequestsModal: boolean;
isLoadingRequests: boolean;

// Actions
loadPendingRequests: () => Promise<void>;
approveRequest: (requestId: string) => Promise<void>;
rejectRequest: (requestId: string) => Promise<void>;
approveAllRequests: (guestId?: string) => Promise<void>;
openRequestsModal: () => void;
closeRequestsModal: () => void;
```

Add notification trigger in `refreshHostedSession()`:

```typescript
const previousCount = get().previousPendingCount;
const newCount = updated.stats.pendingRequests;

if (newCount > previousCount && previousCount !== undefined) {
  const diff = newCount - previousCount;
  notify("info", `${diff} new song request${diff > 1 ? "s" : ""}`, {
    label: "View",
    onClick: () => get().openRequestsModal(),
  });
}
set({ previousPendingCount: newCount });
```

---

### 5. Add Requests Button to Queue Panel

**File:** `src/App.tsx` (around line 1007)

Insert before the fair queue toggle (before `ml-auto`):

```tsx
{hostedSession && (
  <button
    onClick={openRequestsModal}
    title={`${hostedSession.stats.pendingRequests} pending requests`}
    className="relative p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
  >
    <Inbox size={18} />
    {hostedSession.stats.pendingRequests > 0 && (
      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
        {hostedSession.stats.pendingRequests > 99 ? "99+" : hostedSession.stats.pendingRequests}
      </span>
    )}
  </button>
)}
```

---

### 6. Create Song Requests Modal

**New File:** `src/components/session/SongRequestsModal.tsx`

Structure:
- Fixed overlay (bg-black/50)
- Modal container (bg-gray-800 rounded-lg p-6 w-[500px] max-h-[80vh])
- Header: "Song Requests" with close button
- Content: Requests grouped by guest name
  - Guest section header with "Approve All" for that guest
  - Request items: thumbnail, title, artist, duration, approve/reject buttons
- Footer: Global "Approve All" button
- Empty state when no pending requests

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/types/songRequest.ts` | NEW - Type definitions |
| `src/components/session/SongRequestsModal.tsx` | NEW - Approval modal |
| `src/services/hostedSession.ts` | Add request API methods |
| `src/stores/sessionStore.ts` | Add request state + notification logic |
| `src/stores/notificationStore.ts` | Extend NotificationAction with onClick |
| `src/components/notification/NotificationBar.tsx` | Handle onClick callbacks |
| `src/App.tsx` | Add requests button + render modal |
| `src/components/session/index.ts` | Export new modal |

---

## Verification

1. **Unit tests** for sessionStore request actions
2. **E2E test** with mocked hosted session:
   - Verify badge shows pending count
   - Click badge opens modal
   - Approve/reject updates UI
3. **Manual testing**:
   - Host a session, have guest submit requests
   - Verify notification appears with correct count
   - Click "View" to open modal
   - Approve requests, verify they're added to queue

---

## Backend API (Already Implemented)

Endpoints available at `homekaraoke.app`:

- `GET /api/session/{id}/requests?status=pending` - List requests with guest_name joined
- `PATCH /api/session/{id}/requests` - Approve/reject with body `{ action, requestId }` or `{ action, requestIds }`

Both require authentication and verify user is host/co-host.
