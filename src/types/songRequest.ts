/**
 * Valid status values for song requests.
 * Used for both SongRequest.status and filtering in API calls.
 */
export type SongRequestStatus = "pending" | "approved" | "rejected" | "played";

export interface SongRequest {
  id: string;
  title: string;
  status: SongRequestStatus;
  /** Display name for the guest (used for UI display) */
  guest_name: string;
  /** Unique identifier for the session guest (used for linking to singer) */
  session_guest_id: string;
  requested_at: string;
  youtube_id?: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
}

export interface GroupedRequests {
  guestName: string;
  requests: SongRequest[];
}
