import type { Account, HashtagStat, MentionStat, Post } from "../types";

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function calculateEngagementRate(posts: Post[], followers: number) {
  if (!posts.length || followers <= 0) return 0;
  const totalInteractions = posts.reduce((sum, post) => sum + post.likes + post.comments, 0);
  return (totalInteractions / posts.length / followers) * 100;
}

export function averageLikes(posts: Post[]) {
  if (!posts.length) return 0;
  return Math.round(posts.reduce((sum, post) => sum + post.likes, 0) / posts.length);
}

export function averageComments(posts: Post[]) {
  if (!posts.length) return 0;
  return Math.round(posts.reduce((sum, post) => sum + post.comments, 0) / posts.length);
}

export function getPostingFrequency(posts: Post[]) {
  const now = Date.now();
  const inWeek = posts.filter((post) => now - new Date(post.date).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
  const inMonth = posts.filter((post) => now - new Date(post.date).getTime() <= 30 * 24 * 60 * 60 * 1000).length;
  const lastPostDate = posts[0]?.date ?? "";
  return { inWeek, inMonth, lastPostDate };
}

export function getTopPosts(posts: Post[], take = 3) {
  return [...posts].sort((a, b) => b.likes - a.likes).slice(0, take);
}

export function computeHashtagStats(posts: Post[]): HashtagStat[] {
  const map = new Map<string, { count: number; totalEngagement: number; postIds: string[] }>();
  posts.forEach((post) => {
    post.hashtags.forEach((tag) => {
      const normalized = tag.toLowerCase();
      const prev = map.get(normalized) ?? { count: 0, totalEngagement: 0, postIds: [] };
      prev.count += 1;
      prev.totalEngagement += post.likes + post.comments;
      prev.postIds.push(post.id);
      map.set(normalized, prev);
    });
  });

  return [...map.entries()]
    .map(([hashtag, value]) => ({
      hashtag,
      count: value.count,
      avgEngagement: value.totalEngagement / value.count,
      postIds: value.postIds,
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeMentionStats(posts: Post[]): MentionStat[] {
  const map = new Map<string, { count: number; postIds: string[] }>();
  posts.forEach((post) => {
    post.mentions.forEach((mention) => {
      const prev = map.get(mention) ?? { count: 0, postIds: [] };
      prev.count += 1;
      prev.postIds.push(post.id);
      map.set(mention, prev);
    });
  });

  return [...map.entries()]
    .map(([username, value]) => ({ username, count: value.count, postIds: value.postIds }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeAccount(account: Account, posts: Post[]) {
  return {
    followers: account.followers,
    following: account.following,
    totalPosts: posts.length,
    engagementRate: calculateEngagementRate(posts, account.followers),
    avgLikes: averageLikes(posts),
    avgComments: averageComments(posts),
  };
}
