export interface SongRequest {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "played";
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
