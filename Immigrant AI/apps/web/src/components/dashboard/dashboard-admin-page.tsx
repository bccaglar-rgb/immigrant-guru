"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import {
  createKnowledgeChunk,
  createKnowledgeSource,
  getAdminStats,
  getAiFeedback,
  getDatabaseCheck,
  getServiceVersion,
  listUsers,
  searchKnowledgeBase,
  updateUser
} from "@/lib/admin-client";
import {
  knowledgeAuthorityLevelOptions,
  knowledgeSourceTypeOptions
} from "@/types/admin";
import type {
  AdminStats,
  AdminUserDirectoryEntry,
  AiFeedbackSummary,
  DatabaseCheck,
  KnowledgeAuthorityLevel,
  KnowledgeChunkRecord,
  KnowledgeSearchResponse,
  KnowledgeSourceSummary,
  KnowledgeSourceType,
  ServiceVersion
} from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "users" | "knowledge" | "feedback";
type LoadStatus = "idle" | "loading" | "ready" | "error";

type SearchFormState = {
  authorityLevel: KnowledgeAuthorityLevel | "";
  country: string;
  limit: string;
  query: string;
  sourceType: KnowledgeSourceType | "";
  visaType: string;
};

type SourceFormState = {
  authorityLevel: KnowledgeAuthorityLevel;
  country: string;
  language: string;
  metadata: string;
  sourceName: string;
  sourceType: KnowledgeSourceType;
  visaType: string;
};

type ChunkFormState = {
  chunkIndex: string;
  chunkText: string;
  language: string;
  metadata: string;
  sourceId: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function parseJsonObject(raw: string, label: string): { ok: true; data: Record<string, unknown> } | { ok: false; errorMessage: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, data: {} };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return { ok: false, errorMessage: `${label} must be a JSON object.` };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, errorMessage: `${label} must be valid JSON.` };
  }
}

const PLAN_LABELS: Record<string, string> = { free: "Free", starter: "Starter", plus: "Plus", premium: "Premium" };
const PLAN_COLORS: Record<string, string> = {
  free: "bg-canvas border-line text-muted",
  starter: "bg-blue-50 border-blue-200 text-blue-700",
  plus: "bg-accent/10 border-accent/30 text-accent",
  premium: "bg-amber-50 border-amber-200 text-amber-700"
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, tone = "default" }: { label: string; value: string | number; sub?: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-green-600" : tone === "warn" ? "text-red" : "text-ink";
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${active ? "bg-accent text-white" : "text-muted hover:text-ink hover:bg-canvas"}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Badge({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className ?? "bg-canvas border-line text-muted"}`}>
      {text}
    </span>
  );
}

function FeedbackBanner({ message, tone }: { message: string; tone: "error" | "info" | "success" }) {
  const cls = tone === "success" ? "border-green/20 bg-green/10 text-green" : tone === "error" ? "border-red/20 bg-red/5 text-red" : "border-line bg-canvas/50 text-ink";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{message}</div>;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats, db, version, users }: { stats: AdminStats | null; db: DatabaseCheck | null; version: ServiceVersion | null; users: AdminUserDirectoryEntry[] }) {
  const paidUsers = stats ? (stats.total_users - (stats.by_plan["free"] ?? 0)) : 0;
  const recentUsers = users.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total users" value={stats?.total_users ?? "—"} sub={`${stats?.registered_today ?? 0} today`} />
        <MetricCard label="Paid users" value={paidUsers} sub={`${stats?.registered_this_week ?? 0} this week`} tone="good" />
        <MetricCard label="Verified emails" value={stats?.verified_users ?? "—"} sub={`${stats?.unverified_users ?? 0} pending`} />
        <MetricCard label="Database" value={db?.status ?? "—"} tone={db?.status === "ok" ? "good" : "warn"} sub={version ? `${version.name} ${version.version}` : undefined} />
      </div>

      {stats ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Users by plan</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.by_plan).map(([plan, count]) => (
              <div key={plan} className={`rounded-xl border px-4 py-3 text-center min-w-[90px] ${PLAN_COLORS[plan] ?? "bg-canvas border-line text-ink"}`}>
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs font-semibold mt-0.5">{PLAN_LABELS[plan] ?? plan}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Recent signups</p>
        {recentUsers.length > 0 ? (
          <div className="divide-y divide-line">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{u.email}</p>
                  <p className="text-xs text-muted mt-0.5">{fmt(u.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge text={PLAN_LABELS[u.plan] ?? u.plan} className={PLAN_COLORS[u.plan] ?? ""} />
                  {u.email_verified ? (
                    <Badge text="Verified" className="bg-green/10 border-green/20 text-green-700" />
                  ) : (
                    <Badge text="Unverified" className="bg-amber-50 border-amber-200 text-amber-700" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No users yet.</p>
        )}
      </Card>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, accessToken, onUserUpdated }: { users: AdminUserDirectoryEntry[]; accessToken: string; onUserUpdated: (u: AdminUserDirectoryEntry) => void }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.profile?.first_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchPlan = !planFilter || u.plan === planFilter;
      return matchSearch && matchPlan;
    });
  }, [users, search, planFilter]);

  const handlePlanChange = async (userId: string, plan: string) => {
    setUpdating(userId);
    setError("");
    const result = await updateUser(accessToken, userId, { plan });
    setUpdating(null);
    if (!result.ok) { setError(result.errorMessage); return; }
    onUserUpdated(result.data);
  };

  const handleStatusToggle = async (user: AdminUserDirectoryEntry) => {
    const newStatus = user.status === "active" ? "suspended" : "active";
    setUpdating(user.id);
    setError("");
    const result = await updateUser(accessToken, user.id, { status: newStatus });
    setUpdating(null);
    if (!result.ok) { setError(result.errorMessage); return; }
    onUserUpdated(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="flex-1 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name..."
          value={search}
        />
        <select
          className="rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(e) => setPlanFilter(e.target.value)}
          value={planFilter}
        >
          <option value="">All plans</option>
          {["free", "starter", "plus", "premium"].map((p) => (
            <option key={p} value={p}>{PLAN_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {error ? <FeedbackBanner message={error} tone="error" /> : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">User</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Plan</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Verified</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Cases</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Joined</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-canvas/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{u.email}</p>
                    {u.profile?.first_name || u.profile?.last_name ? (
                      <p className="text-xs text-muted mt-0.5">{[u.profile.first_name, u.profile.last_name].filter(Boolean).join(" ")}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <select
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold focus:outline-none ${PLAN_COLORS[u.plan] ?? "bg-canvas border-line text-ink"}`}
                      disabled={updating === u.id}
                      onChange={(e) => void handlePlanChange(u.id, e.target.value)}
                      value={u.plan}
                    >
                      {["free", "starter", "plus", "premium"].map((p) => (
                        <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      text={u.status}
                      className={u.status === "active" ? "bg-green/10 border-green/20 text-green-700" : "bg-red/5 border-red/20 text-red"}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      text={u.email_verified ? "Yes" : "No"}
                      className={u.email_verified ? "bg-green/10 border-green/20 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}
                    />
                  </td>
                  <td className="px-5 py-4 text-muted">{u.immigration_cases.length}</td>
                  <td className="px-5 py-4 text-xs text-muted">{fmt(u.created_at)}</td>
                  <td className="px-5 py-4">
                    <button
                      className={`text-xs font-semibold transition-colors ${u.status === "active" ? "text-red hover:text-red/80" : "text-green-600 hover:text-green-700"} disabled:opacity-40`}
                      disabled={updating === u.id}
                      onClick={() => void handleStatusToggle(u)}
                      type="button"
                    >
                      {updating === u.id ? "..." : u.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm text-muted" colSpan={7}>No users match your filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted">{filtered.length} of {users.length} users</p>
    </div>
  );
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────

function FeedbackTab({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<AiFeedbackSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    const result = await getAiFeedback(accessToken, 20);
    if (!result.ok) { setError(result.errorMessage); setStatus("error"); return; }
    setData(result.data);
    setStatus("ready");
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  if (status === "loading") return <Card className="animate-pulse h-40 p-6" />;
  if (status === "error") return <FeedbackBanner message={error} tone="error" />;
  if (!data) return null;

  const positiveRate = data.total_feedback > 0 ? Math.round((data.positive_feedback / data.total_feedback) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Total feedback" value={data.total_feedback} />
        <MetricCard label="Positive" value={`${data.positive_feedback} (${positiveRate}%)`} tone="good" />
        <MetricCard label="Negative" value={data.negative_feedback} tone={data.negative_feedback > 0 ? "warn" : "default"} />
      </div>

      {Object.keys(data.by_feature).length > 0 ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">By feature</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.by_feature).map(([feature, count]) => (
              <div key={feature} className="rounded-xl border border-line bg-canvas px-4 py-3 text-center">
                <p className="text-lg font-bold text-ink">{count}</p>
                <p className="text-xs text-muted mt-0.5">{feature}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Recent feedback</p>
        {data.recent_feedback.length > 0 ? (
          <div className="divide-y divide-line">
            {data.recent_feedback.map((fb) => (
              <div key={fb.id} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      text={fb.rating}
                      className={fb.rating === "positive" ? "bg-green/10 border-green/20 text-green-700" : "bg-red/5 border-red/20 text-red"}
                    />
                    <span className="text-sm font-semibold text-muted">{fb.feature}</span>
                  </div>
                  <span className="text-xs text-muted">{fmt(fb.created_at)}</span>
                </div>
                {fb.comment ? <p className="mt-2 text-sm text-ink leading-relaxed">{fb.comment}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No feedback yet.</p>
        )}
      </Card>
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab({ accessToken, canAdmin }: { accessToken: string; canAdmin: boolean }) {
  const [searchForm, setSearchForm] = useState<SearchFormState>({ authorityLevel: "", country: "", limit: "5", query: "", sourceType: "", visaType: "" });
  const [searchStatus, setSearchStatus] = useState<LoadStatus>("idle");
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResponse | null>(null);

  const [sourceForm, setSourceForm] = useState<SourceFormState>({ authorityLevel: "primary", country: "", language: "en", metadata: "{}", sourceName: "", sourceType: "government_website", visaType: "" });
  const [sourceError, setSourceError] = useState("");
  const [sourceFeedback, setSourceFeedback] = useState("");
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [createdSource, setCreatedSource] = useState<KnowledgeSourceSummary | null>(null);

  const [chunkForm, setChunkForm] = useState<ChunkFormState>({ chunkIndex: "0", chunkText: "", language: "en", metadata: "{}", sourceId: "" });
  const [chunkError, setChunkError] = useState("");
  const [chunkFeedback, setChunkFeedback] = useState("");
  const [isCreatingChunk, setIsCreatingChunk] = useState(false);
  const [createdChunk, setCreatedChunk] = useState<KnowledgeChunkRecord | null>(null);

  const handleSearchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = searchForm.query.trim();
    if (query.length < 2) { setSearchError("Query must be at least 2 characters."); setSearchStatus("error"); return; }
    const limit = parseInt(searchForm.limit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) { setSearchError("Limit must be between 1 and 25."); setSearchStatus("error"); return; }
    setSearchStatus("loading"); setSearchError("");
    const result = await searchKnowledgeBase(accessToken, { authority_levels: searchForm.authorityLevel ? [searchForm.authorityLevel] : undefined, country: searchForm.country.trim() || null, limit, query, source_types: searchForm.sourceType ? [searchForm.sourceType] : undefined, visa_type: searchForm.visaType.trim() || null });
    if (!result.ok) { setSearchError(result.errorMessage); setSearchStatus("error"); return; }
    setSearchResults(result.data); setSearchStatus("ready");
  };

  const handleSourceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin) return;
    const sourceName = sourceForm.sourceName.trim();
    if (!sourceName) { setSourceError("Source name is required."); return; }
    const metaParsed = parseJsonObject(sourceForm.metadata, "Metadata");
    if (!metaParsed.ok) { setSourceError(metaParsed.errorMessage); return; }
    setIsCreatingSource(true); setSourceError(""); setSourceFeedback("");
    const result = await createKnowledgeSource(accessToken, { authority_level: sourceForm.authorityLevel, chunks: [], country: sourceForm.country.trim() || null, language: sourceForm.language.trim() || null, metadata: metaParsed.data, source_name: sourceName, source_type: sourceForm.sourceType, visa_type: sourceForm.visaType.trim() || null });
    setIsCreatingSource(false);
    if (!result.ok) { setSourceError(result.errorMessage); return; }
    setCreatedSource(result.data); setSourceFeedback("Source created."); setSourceForm({ authorityLevel: "primary", country: "", language: "en", metadata: "{}", sourceName: "", sourceType: "government_website", visaType: "" });
    setChunkForm((c) => ({ ...c, sourceId: result.data.id }));
  };

  const handleChunkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin) return;
    if (!chunkForm.sourceId.trim()) { setChunkError("Source ID is required."); return; }
    if (!chunkForm.chunkText.trim()) { setChunkError("Chunk text is required."); return; }
    const idx = parseInt(chunkForm.chunkIndex, 10);
    if (!Number.isInteger(idx) || idx < 0) { setChunkError("Chunk index must be a non-negative integer."); return; }
    const metaParsed = parseJsonObject(chunkForm.metadata, "Metadata");
    if (!metaParsed.ok) { setChunkError(metaParsed.errorMessage); return; }
    setIsCreatingChunk(true); setChunkError(""); setChunkFeedback("");
    const result = await createKnowledgeChunk(accessToken, { chunk_index: idx, chunk_text: chunkForm.chunkText.trim(), language: chunkForm.language.trim() || null, metadata: metaParsed.data, source_id: chunkForm.sourceId.trim() });
    setIsCreatingChunk(false);
    if (!result.ok) { setChunkError(result.errorMessage); return; }
    setCreatedChunk(result.data); setChunkFeedback("Chunk saved."); setChunkForm((c) => ({ chunkIndex: "0", chunkText: "", language: "en", metadata: "{}", sourceId: c.sourceId }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Knowledge base search</p>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void handleSearchSubmit(e)}>
          <Input label="Query" onChange={(e) => setSearchForm((c) => ({ ...c, query: e.target.value }))} placeholder="specialty occupation..." value={searchForm.query} />
          <Input label="Country" onChange={(e) => setSearchForm((c) => ({ ...c, country: e.target.value }))} placeholder="United States" value={searchForm.country} />
          <Input label="Visa type" onChange={(e) => setSearchForm((c) => ({ ...c, visaType: e.target.value }))} placeholder="H-1B" value={searchForm.visaType} />
          <Input label="Limit" onChange={(e) => setSearchForm((c) => ({ ...c, limit: e.target.value }))} placeholder="5" value={searchForm.limit} />
          <Select label="Source type" onChange={(e) => setSearchForm((c) => ({ ...c, sourceType: e.target.value as KnowledgeSourceType | "" }))} placeholder="Any source type" value={searchForm.sourceType}>
            {knowledgeSourceTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label="Authority" onChange={(e) => setSearchForm((c) => ({ ...c, authorityLevel: e.target.value as KnowledgeAuthorityLevel | "" }))} placeholder="Any authority" value={searchForm.authorityLevel}>
            {knowledgeAuthorityLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div className="md:col-span-2"><Button disabled={searchStatus === "loading"} type="submit">{searchStatus === "loading" ? "Searching..." : "Search"}</Button></div>
        </form>
        {searchError ? <div className="mt-4"><FeedbackBanner message={searchError} tone="error" /></div> : null}
        {searchStatus === "ready" && searchResults ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted font-semibold uppercase tracking-widest">{searchResults.total_results} results</p>
            {searchResults.results.map((r) => (
              <Card className="p-4" key={r.chunk.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-accent uppercase tracking-widest">{r.source.source_name}</p>
                    <p className="mt-1.5 text-sm text-ink leading-relaxed">{r.chunk.chunk_text}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted border border-line rounded-lg px-3 py-2">Score {r.score.toFixed(2)}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Add knowledge source</p>
          <form className="space-y-4" onSubmit={(e) => void handleSourceSubmit(e)}>
            <Input label="Source name" onChange={(e) => setSourceForm((c) => ({ ...c, sourceName: e.target.value }))} placeholder="USCIS H-1B Policy" value={sourceForm.sourceName} />
            <div className="grid gap-3 md:grid-cols-2">
              <Select label="Type" onChange={(e) => setSourceForm((c) => ({ ...c, sourceType: e.target.value as KnowledgeSourceType }))} value={sourceForm.sourceType}>
                {knowledgeSourceTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Select label="Authority" onChange={(e) => setSourceForm((c) => ({ ...c, authorityLevel: e.target.value as KnowledgeAuthorityLevel }))} value={sourceForm.authorityLevel}>
                {knowledgeAuthorityLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Country" onChange={(e) => setSourceForm((c) => ({ ...c, country: e.target.value }))} placeholder="United States" value={sourceForm.country} />
              <Input label="Visa type" onChange={(e) => setSourceForm((c) => ({ ...c, visaType: e.target.value }))} placeholder="H-1B" value={sourceForm.visaType} />
            </div>
            <Textarea helperText='e.g. {"source_url":"https://uscis.gov"}' label="Metadata (JSON)" onChange={(e) => setSourceForm((c) => ({ ...c, metadata: e.target.value }))} value={sourceForm.metadata} />
            {sourceError ? <FeedbackBanner message={sourceError} tone="error" /> : null}
            {sourceFeedback ? <FeedbackBanner message={sourceFeedback} tone="success" /> : null}
            {createdSource ? <FeedbackBanner message={`Created: ${createdSource.source_name} (${createdSource.id})`} tone="info" /> : null}
            <Button disabled={!canAdmin || isCreatingSource} type="submit">{isCreatingSource ? "Creating..." : "Create source"}</Button>
          </form>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Add knowledge chunk</p>
          <form className="space-y-4" onSubmit={(e) => void handleChunkSubmit(e)}>
            <Input label="Source ID" onChange={(e) => setChunkForm((c) => ({ ...c, sourceId: e.target.value }))} placeholder="UUID of the source" value={chunkForm.sourceId} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Chunk index" onChange={(e) => setChunkForm((c) => ({ ...c, chunkIndex: e.target.value }))} placeholder="0" value={chunkForm.chunkIndex} />
              <Input label="Language" onChange={(e) => setChunkForm((c) => ({ ...c, language: e.target.value }))} placeholder="en" value={chunkForm.language} />
            </div>
            <Textarea label="Chunk text" onChange={(e) => setChunkForm((c) => ({ ...c, chunkText: e.target.value }))} placeholder="Paste normalized chunk text..." value={chunkForm.chunkText} />
            <Textarea helperText='e.g. {"section":"Overview"}' label="Metadata (JSON)" onChange={(e) => setChunkForm((c) => ({ ...c, metadata: e.target.value }))} value={chunkForm.metadata} />
            {chunkError ? <FeedbackBanner message={chunkError} tone="error" /> : null}
            {chunkFeedback ? <FeedbackBanner message={chunkFeedback} tone="success" /> : null}
            {createdChunk ? <FeedbackBanner message={`Saved chunk ${createdChunk.chunk_index} for source ${createdChunk.source_id}`} tone="info" /> : null}
            <Button disabled={!canAdmin || isCreatingChunk} type="submit">{isCreatingChunk ? "Saving..." : "Save chunk"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardAdminPage() {
  const { session } = useAuthSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canAdmin, setCanAdmin] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [version, setVersion] = useState<ServiceVersion | null>(null);
  const [db, setDb] = useState<DatabaseCheck | null>(null);
  const [users, setUsers] = useState<AdminUserDirectoryEntry[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");

    const [versionRes, dbRes, usersRes, statsRes] = await Promise.all([
      getServiceVersion(),
      getDatabaseCheck(),
      listUsers(session.accessToken),
      getAdminStats(session.accessToken)
    ]);

    if (versionRes.ok) setVersion(versionRes.data);
    if (dbRes.ok) setDb(dbRes.data);
    if (usersRes.ok) { setUsers(usersRes.data); setCanAdmin(true); }
    if (statsRes.ok) setStats(statsRes.data);

    if (!versionRes.ok && !dbRes.ok) setError("Could not load system status.");
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const handleUserUpdated = useCallback((updated: AdminUserDirectoryEntry) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
  }, []);

  if (!session) return null;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        actions={
          <Button disabled={loading} onClick={() => void load()} variant="secondary">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
        description="Platform management — users, stats, knowledge base, and AI feedback."
        eyebrow="Internal"
        title="Admin console"
      />

      {error ? <FeedbackBanner message={error} tone="error" /> : null}

      <div className="flex gap-2 flex-wrap">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>Users ({users.length})</TabButton>
        <TabButton active={tab === "knowledge"} onClick={() => setTab("knowledge")}>Knowledge</TabButton>
        <TabButton active={tab === "feedback"} onClick={() => setTab("feedback")}>Feedback</TabButton>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Card key={i} className="animate-pulse h-24 p-5" />)}
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab stats={stats} db={db} version={version} users={users} />}
          {tab === "users" && <UsersTab users={users} accessToken={session.accessToken} onUserUpdated={handleUserUpdated} />}
          {tab === "knowledge" && <KnowledgeTab accessToken={session.accessToken} canAdmin={canAdmin} />}
          {tab === "feedback" && <FeedbackTab accessToken={session.accessToken} />}
        </>
      )}
    </div>
  );
}
