/**
 * Valid status values for song requests.
 * Used for both SongRequest.status and filtering in API calls.
 */
export type SongRequestStatus = "pending" | "approved" | "rejected" | "played";

export interface SongRequest {
  id: string;
  title: string;
  status: SongRequestStatus;
  guest_name: string;
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
