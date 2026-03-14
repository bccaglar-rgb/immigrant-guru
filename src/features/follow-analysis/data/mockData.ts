import type { Account, AccountAnalytics, AddAccountInput, Post, Reel, TrendPoint } from "../types";
import { calculateEngagementRate } from "../utils/analytics";

const hashtagPool = ["creator", "growth", "instagramtips", "brand", "reels", "socialmedia", "audience", "contentstrategy", "marketing", "analytics"];
const mentionsPool = ["@meta", "@creatorhq", "@socialdaily", "@brandlab", "@reelmaster"];

const baseAccounts: Account[] = [
  {
    id: "acc-1",
    accountId: "178414000001",
    username: "@bitrium.social",
    displayName: "Bitrium Social",
    bio: "Helping social teams scale with AI-driven insights.",
    avatarUrl: "https://api.dicebear.com/9.x/glass/svg?seed=bitrium-social",
    accountUrl: "https://instagram.com/bitrium.social",
    websiteUrl: "https://bitrium.social",
    verified: true,
    category: "Technology",
    language: "English",
    createdAt: "2022-02-12",
    lastSyncAt: "2026-03-05",
    followers: 76264,
    following: 1454,
  },
  {
    id: "acc-2",
    accountId: "178414000002",
    username: "@urban.frames",
    displayName: "Urban Frames",
    bio: "Daily city aesthetics, reels, and storytelling for creators.",
    avatarUrl: "https://api.dicebear.com/9.x/glass/svg?seed=urban-frames",
    accountUrl: "https://instagram.com/urban.frames",
    websiteUrl: "https://urbanframes.media",
    verified: false,
    category: "Photography",
    language: "English",
    createdAt: "2021-09-02",
    lastSyncAt: "2026-03-05",
    followers: 43910,
    following: 809,
  },
  {
    id: "acc-3",
    accountId: "178414000003",
    username: "@fitloop.co",
    displayName: "FitLoop",
    bio: "Fitness coaching clips + nutrition breakdowns.",
    avatarUrl: "https://api.dicebear.com/9.x/glass/svg?seed=fitloop",
    accountUrl: "https://instagram.com/fitloop.co",
    websiteUrl: "https://fitloop.co",
    verified: true,
    category: "Health & Fitness",
    language: "English",
    createdAt: "2020-06-21",
    lastSyncAt: "2026-03-05",
    followers: 128402,
    following: 1203,
  },
];

function seeded(seedText: string) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) % 100000;
  }
  return seed;
}

function generatePosts(account: Account, count = 18): { posts: Post[]; reels: Reel[] } {
  const seed = seeded(account.id + account.username);
  const posts: Post[] = [];
  const reels: Reel[] = [];

  for (let i = 0; i < count; i += 1) {
    const postSeed = seed + i * 13;
    const mediaType = postSeed % 3 === 0 ? "video" : "image";
    const likes = 900 + (postSeed % 5400);
    const comments = 40 + (postSeed % 520);
    const views = mediaType === "video" ? likes * (4 + (postSeed % 5)) : undefined;
    const date = new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hashtags = [hashtagPool[postSeed % hashtagPool.length], hashtagPool[(postSeed + 3) % hashtagPool.length]];
    const mentions = [mentionsPool[postSeed % mentionsPool.length]];

    const post: Post = {
      id: `${account.id}-post-${i + 1}`,
      accountId: account.id,
      date,
      caption: `${account.displayName} campaign post ${i + 1} focused on #${hashtags[0]} and #${hashtags[1]}.`,
      link: `${account.accountUrl}/p/${account.id}-${i + 1}`,
      likes,
      comments,
      views,
      hashtags,
      mentions,
      mediaType,
      mediaUrl: `https://picsum.photos/seed/${encodeURIComponent(`${account.id}-${i}`)}/480/320`,
    };

    posts.push(post);

    if (mediaType === "video") {
      reels.push({
        ...post,
        avgWatchTimeSec: 5 + (postSeed % 19),
      });
    }
  }

  return { posts, reels };
}

function generateTrends(account: Account, posts: Post[]): TrendPoint[] {
  return Array.from({ length: 12 }).map((_, idx) => {
    const date = new Date(Date.now() - (11 - idx) * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const followers = Math.round(account.followers * (0.88 + idx * 0.013));
    const samplePosts = posts.slice(idx, idx + 4);
    const likes = samplePosts.reduce((sum, post) => sum + post.likes, 0);
    const comments = samplePosts.reduce((sum, post) => sum + post.comments, 0);
    const views = samplePosts.reduce((sum, post) => sum + (post.views ?? 0), 0);
    const engagementRate = calculateEngagementRate(samplePosts, followers);

    return {
      date,
      followers,
      likes,
      comments,
      views,
      engagementRate,
    };
  });
}

export function buildAnalyticsDataset(): AccountAnalytics[] {
  return baseAccounts.map((account) => {
    const { posts, reels } = generatePosts(account, 16 + (seeded(account.id) % 6));
    return {
      account,
      posts,
      reels,
      trends: generateTrends(account, posts),
    };
  });
}

export async function fetchMockAnalytics(options?: { fail?: boolean }) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (options?.fail) {
    throw new Error("Failed to load account analytics. Please retry.");
  }
  return buildAnalyticsDataset();
}

export function createMockAccount(input: AddAccountInput): AccountAnalytics {
  const id = `acc-${Date.now()}`;
  const account: Account = {
    id,
    accountId: `${Math.floor(100000000000 + Math.random() * 899999999999)}`,
    username: input.username.startsWith("@") ? input.username : `@${input.username}`,
    displayName: input.displayName || input.username,
    bio: input.bio || "No bio provided.",
    avatarUrl: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(input.username)}`,
    accountUrl: input.accountUrl || `https://instagram.com/${input.username.replace("@", "")}`,
    websiteUrl: input.websiteUrl || "https://example.com",
    verified: input.verified,
    category: input.category || "General",
    language: input.language || "English",
    createdAt: "2026-03-05",
    lastSyncAt: "2026-03-05",
    followers: 1200 + Math.floor(Math.random() * 20000),
    following: 80 + Math.floor(Math.random() * 1200),
  };

  const { posts, reels } = generatePosts(account, 12);
  return {
    account,
    posts,
    reels,
    trends: generateTrends(account, posts),
  };
}
