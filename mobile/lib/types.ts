export interface Category {
  slug: string;
  name: string;
  emoji: string | null;
}

export interface Organizer {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  ratingAvg: number;
  completedMeetingsCount: number;
}

export interface FeedEvent {
  id: string;
  title: string;
  description: string | null;
  category: Category | null;
  trainingType: Category | null;
  city: string;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  seatsTotal: number;
  seatsTaken: number;
  costType: string;
  isBusiness: boolean;
  photoUrl: string | null;
  isHighlighted: boolean;
  isMine: boolean;
  organizer: Organizer | null;
  myApplicationStatus: "pending" | "accepted" | "rejected" | null;
  isLive?: boolean;
  isBoosted?: boolean;
  isAnonymous?: boolean;
  organizerHidden?: boolean;
  goingCount?: number;
  goingPreview?: { id: string; name: string; avatarUrl: string | null }[];
  businessPricingType?: "ticket" | "free" | "custom" | null;
  businessPricingDetails?: string | null;
}

export interface PersonCard {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
  sharedInterests: string[];
  sharedCount: number;
}

export interface EventDetail extends Omit<FeedEvent, "isHighlighted" | "isMine" | "myApplicationStatus"> {
  startsAt: string;
  endsAt: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  hasChat: boolean;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

export interface MapEvent {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  seatsLeft: number;
  isBusiness: boolean;
  placeName: string | null;
  organizer: { name: string; avatarUrl: string | null } | null;
  category?: { slug: string; name: string } | null;
  isAnonymous?: boolean;
  organizerHidden?: boolean;
}

export interface MyProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
  phone: string | null;
  email: string | null;
}
