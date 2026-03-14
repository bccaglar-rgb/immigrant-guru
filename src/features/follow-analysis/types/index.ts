export type MediaType = "image" | "video";

export interface Account {
  id: string;
  accountId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  accountUrl: string;
  websiteUrl: string;
  verified: boolean;
  category: string;
  language: string;
  createdAt: string;
  lastSyncAt: string;
  followers: number;
  following: number;
}

export interface Post {
  id: string;
  accountId: string;
  date: string;
  caption: string;
  link: string;
  likes: number;
  comments: number;
  views?: number;
  hashtags: string[];
  mentions: string[];
  mediaType: MediaType;
  mediaUrl: string;
}

export interface Reel extends Post {
  avgWatchTimeSec: number;
}

export interface TrendPoint {
  date: string;
  followers: number;
  likes: number;
  comments: number;
  views: number;
  engagementRate: number;
}

export interface HashtagStat {
  hashtag: string;
  count: number;
  avgEngagement: number;
  postIds: string[];
}

export interface MentionStat {
  username: string;
  count: number;
  postIds: string[];
}

export interface AccountAnalytics {
  account: Account;
  posts: Post[];
  reels: Reel[];
  trends: TrendPoint[];
}

export interface AddAccountInput {
  platform: "Instagram";
  username: string;
  displayName: string;
  bio: string;
  accountUrl: string;
  websiteUrl: string;
  verified: boolean;
  category: string;
  language: string;
}

export type SortOption = "newest" | "most-liked" | "most-commented";
export type DateRangePreset = "7d" | "30d" | "90d" | "1y";
