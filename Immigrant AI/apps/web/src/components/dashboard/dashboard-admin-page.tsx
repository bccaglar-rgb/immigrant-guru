"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import { useAuthSession } from "@/hooks/use-auth-session";
import {
  createKnowledgeChunk,
  createKnowledgeSource,
  deleteUser,
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { CasesTab } from "./admin/cases-tab";
import { RevenueTab } from "./admin/revenue-tab";
import { SystemTab } from "./admin/system-tab";
import { UserDetailDrawer } from "./admin/user-detail-drawer";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "revenue" | "users" | "cases" | "knowledge" | "feedback" | "system";
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
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return { ok: false, errorMessage: `${label} must be a JSON object` };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, errorMessage: `${label} must be valid JSON` };
  }
}

const PLAN_LABELS: Record<string, string> = { free: "Free", starter: "Starter", plus: "Plus", premium: "Premium" };
// NOTE: plan keys map to API enum values, labels are brand names left untranslated
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
  const t = useTranslations();
  const paidUsers = stats ? (stats.total_users - (stats.by_plan["free"] ?? 0)) : 0;
  const recentUsers = users.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("Total users")} value={stats?.total_users ?? "—"} sub={`${stats?.registered_today ?? 0} ${t("today")}`} />
        <MetricCard label={t("Paid users")} value={paidUsers} sub={`${stats?.registered_this_week ?? 0} ${t("this week")}`} tone="good" />
        <MetricCard label={t("Verified emails")} value={stats?.verified_users ?? "—"} sub={`${stats?.unverified_users ?? 0} ${t("pending")}`} />
        <MetricCard label={t("Database")} value={db?.status ?? "—"} tone={db?.status === "ok" ? "good" : "warn"} sub={version ? `${version.name} ${version.version}` : undefined} />
      </div>

      {stats ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Users by plan")}</p>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Recent signups")}</p>
        {recentUsers.length > 0 ? (
          <div className="divide-y divide-line">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{u.email}</p>
                  <p className="text-xs text-muted mt-0.5">{fmt(u.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge text={PLAN_LABELS[u.plan ?? "free"] ?? u.plan} className={PLAN_COLORS[u.plan ?? "free"] ?? ""} />
                  {u.email_verified ? (
                    <Badge text={t("Verified")} className="bg-green/10 border-green/20 text-green-700" />
                  ) : (
                    <Badge text={t("Unverified")} className="bg-amber-50 border-amber-200 text-amber-700" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("No users yet")}</p>
        )}
      </Card>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, accessToken, onUserUpdated, onUserDeleted }: { users: AdminUserDirectoryEntry[]; accessToken: string; onUserUpdated: (u: AdminUserDirectoryEntry) => void; onUserDeleted: (userId: string) => void }) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminUserDirectoryEntry | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !term ||
        u.email.toLowerCase().includes(term) ||
        (u.profile?.first_name ?? "").toLowerCase().includes(term) ||
        (u.profile?.last_name ?? "").toLowerCase().includes(term);
      const matchPlan = !planFilter || u.plan === planFilter;
      const matchStatus = !statusFilter || u.status === statusFilter;
      return matchSearch && matchPlan && matchStatus;
    });
  }, [users, search, planFilter, statusFilter]);

  const onUsersChange = useEffectEvent(() => {
    if (!selected) return;
    const refreshed = users.find((u) => u.id === selected.id);
    if (refreshed && refreshed !== selected) setSelected(refreshed);
  });

  useEffect(() => {
    onUsersChange();
  }, [users, selected]);

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

  const handleDelete = async (userId: string) => {
    const result = await deleteUser(accessToken, userId);
    if (!result.ok) throw new Error(result.errorMessage);
    setSelected(null);
    onUserDeleted(userId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="flex-1 rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by email or name")}
          value={search}
        />
        <select
          className="rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(e) => setPlanFilter(e.target.value)}
          value={planFilter}
        >
          <option value="">{t("All plans")}</option>
          {["free", "starter", "plus", "premium"].map((p) => (
            <option key={p} value={p}>{PLAN_LABELS[p]}</option>
          ))}
        </select>
        <select
          className="rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
          onChange={(e) => setStatusFilter(e.target.value)}
          value={statusFilter}
        >
          <option value="">{t("All statuses")}</option>
          <option value="active">{t("Active")}</option>
          <option value="suspended">{t("Suspended")}</option>
        </select>
      </div>

      {error ? <FeedbackBanner message={error} tone="error" /> : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("User")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Plan")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Status")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Verified")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Cases")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Joined")}</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-canvas/40 transition-colors">
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setSelected(u)}
                      className="text-left hover:text-accent"
                    >
                      <p className="font-semibold text-ink group-hover:text-accent">{u.email}</p>
                      {u.profile?.first_name || u.profile?.last_name ? (
                        <p className="text-xs text-muted mt-0.5">{[u.profile.first_name, u.profile.last_name].filter(Boolean).join(" ")}</p>
                      ) : null}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold focus:outline-none ${PLAN_COLORS[u.plan ?? "free"] ?? "bg-canvas border-line text-ink"}`}
                      disabled={updating === u.id}
                      onChange={(e) => void handlePlanChange(u.id, e.target.value)}
                      value={u.plan ?? "free"}
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
                      text={u.email_verified ? t("Yes") : t("No")}
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
                      {updating === u.id ? "..." : u.status === "active" ? t("Suspend") : t("Activate")}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm text-muted" colSpan={7}>{t("No users match your filters")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted">{filtered.length} {t("of")} {users.length} {t("users")}</p>

      <UserDetailDrawer user={selected} onClose={() => setSelected(null)} onDelete={handleDelete} />
    </div>
  );
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────

function FeedbackTab({ accessToken }: { accessToken: string }) {
  const t = useTranslations();
  const [data, setData] = useState<AiFeedbackSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState("");

  const onLoad = useEffectEvent(async () => {
    setStatus("loading");
    setError("");
    const result = await getAiFeedback(accessToken, 20);
    if (!result.ok) { setError(result.errorMessage); setStatus("error"); return; }
    setData(result.data);
    setStatus("ready");
  });

  useEffect(() => { void onLoad(); }, [accessToken]);

  if (status === "loading") return <Card className="animate-pulse h-40 p-6" />;
  if (status === "error") return <FeedbackBanner message={error} tone="error" />;
  if (!data) return null;

  const positiveRate = data.total_feedback > 0 ? Math.round((data.positive_feedback / data.total_feedback) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={t("Total feedback")} value={data.total_feedback} />
        <MetricCard label={t("Positive")} value={`${data.positive_feedback} (${positiveRate}%)`} tone="good" />
        <MetricCard label={t("Negative")} value={data.negative_feedback} tone={data.negative_feedback > 0 ? "warn" : "default"} />
      </div>

      {Object.keys(data.by_feature).length > 0 ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("By feature")}</p>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Recent feedback")}</p>
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
          <p className="text-sm text-muted">{t("No feedback yet")}</p>
        )}
      </Card>
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab({ accessToken, canAdmin }: { accessToken: string; canAdmin: boolean }) {
  const t = useTranslations();
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
    if (query.length < 2) { setSearchError(t("Query must be at least 2 characters")); setSearchStatus("error"); return; }
    const limit = parseInt(searchForm.limit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) { setSearchError(t("Limit must be between 1 and 25")); setSearchStatus("error"); return; }
    setSearchStatus("loading"); setSearchError("");
    const result = await searchKnowledgeBase(accessToken, { authority_levels: searchForm.authorityLevel ? [searchForm.authorityLevel] : undefined, country: searchForm.country.trim() || null, limit, query, source_types: searchForm.sourceType ? [searchForm.sourceType] : undefined, visa_type: searchForm.visaType.trim() || null });
    if (!result.ok) { setSearchError(result.errorMessage); setSearchStatus("error"); return; }
    setSearchResults(result.data); setSearchStatus("ready");
  };

  const handleSourceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin) return;
    const sourceName = sourceForm.sourceName.trim();
    if (!sourceName) { setSourceError(t("Source name is required")); return; }
    const metaParsed = parseJsonObject(sourceForm.metadata, t("Metadata"));
    if (!metaParsed.ok) { setSourceError(metaParsed.errorMessage); return; }
    setIsCreatingSource(true); setSourceError(""); setSourceFeedback("");
    const result = await createKnowledgeSource(accessToken, { authority_level: sourceForm.authorityLevel, chunks: [], country: sourceForm.country.trim() || null, language: sourceForm.language.trim() || null, metadata: metaParsed.data, source_name: sourceName, source_type: sourceForm.sourceType, visa_type: sourceForm.visaType.trim() || null });
    setIsCreatingSource(false);
    if (!result.ok) { setSourceError(result.errorMessage); return; }
    setCreatedSource(result.data); setSourceFeedback(t("Source created")); setSourceForm({ authorityLevel: "primary", country: "", language: "en", metadata: "{}", sourceName: "", sourceType: "government_website", visaType: "" });
    setChunkForm((c) => ({ ...c, sourceId: result.data.id }));
  };

  const handleChunkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin) return;
    if (!chunkForm.sourceId.trim()) { setChunkError(t("Source ID is required")); return; }
    if (!chunkForm.chunkText.trim()) { setChunkError(t("Chunk text is required")); return; }
    const idx = parseInt(chunkForm.chunkIndex, 10);
    if (!Number.isInteger(idx) || idx < 0) { setChunkError(t("Chunk index must be a non-negative integer")); return; }
    const metaParsed = parseJsonObject(chunkForm.metadata, t("Metadata"));
    if (!metaParsed.ok) { setChunkError(metaParsed.errorMessage); return; }
    setIsCreatingChunk(true); setChunkError(""); setChunkFeedback("");
    const result = await createKnowledgeChunk(accessToken, { chunk_index: idx, chunk_text: chunkForm.chunkText.trim(), language: chunkForm.language.trim() || null, metadata: metaParsed.data, source_id: chunkForm.sourceId.trim() });
    setIsCreatingChunk(false);
    if (!result.ok) { setChunkError(result.errorMessage); return; }
    setCreatedChunk(result.data); setChunkFeedback(t("Chunk saved")); setChunkForm((c) => ({ chunkIndex: "0", chunkText: "", language: "en", metadata: "{}", sourceId: c.sourceId }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Knowledge base search")}</p>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void handleSearchSubmit(e)}>
          <Input label={t("Query")} onChange={(e) => setSearchForm((c) => ({ ...c, query: e.target.value }))} placeholder={t("specialty occupation")} value={searchForm.query} />
          <Input label={t("Country")} onChange={(e) => setSearchForm((c) => ({ ...c, country: e.target.value }))} placeholder="United States" value={searchForm.country} />
          <Input label={t("Visa type")} onChange={(e) => setSearchForm((c) => ({ ...c, visaType: e.target.value }))} placeholder="H-1B" value={searchForm.visaType} />
          <Input label={t("Limit")} onChange={(e) => setSearchForm((c) => ({ ...c, limit: e.target.value }))} placeholder="5" value={searchForm.limit} />
          <Select label={t("Source type")} onChange={(e) => setSearchForm((c) => ({ ...c, sourceType: e.target.value as KnowledgeSourceType | "" }))} placeholder={t("Any source type")} value={searchForm.sourceType}>
            {knowledgeSourceTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select label={t("Authority")} onChange={(e) => setSearchForm((c) => ({ ...c, authorityLevel: e.target.value as KnowledgeAuthorityLevel | "" }))} placeholder={t("Any authority")} value={searchForm.authorityLevel}>
            {knowledgeAuthorityLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div className="md:col-span-2"><Button disabled={searchStatus === "loading"} type="submit">{searchStatus === "loading" ? t("Searching") : t("Search")}</Button></div>
        </form>
        {searchError ? <div className="mt-4"><FeedbackBanner message={searchError} tone="error" /></div> : null}
        {searchStatus === "ready" && searchResults ? (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted font-semibold uppercase tracking-widest">{searchResults.total_results} {t("results")}</p>
            {searchResults.results.map((r) => (
              <Card className="p-4" key={r.chunk.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-accent uppercase tracking-widest">{r.source.source_name}</p>
                    <p className="mt-1.5 text-sm text-ink leading-relaxed">{r.chunk.chunk_text}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted border border-line rounded-lg px-3 py-2">{t("Score")} {r.score.toFixed(2)}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Add knowledge source")}</p>
          <form className="space-y-4" onSubmit={(e) => void handleSourceSubmit(e)}>
            <Input label={t("Source name")} onChange={(e) => setSourceForm((c) => ({ ...c, sourceName: e.target.value }))} placeholder="USCIS H-1B Policy" value={sourceForm.sourceName} />
            <div className="grid gap-3 md:grid-cols-2">
              <Select label={t("Type")} onChange={(e) => setSourceForm((c) => ({ ...c, sourceType: e.target.value as KnowledgeSourceType }))} value={sourceForm.sourceType}>
                {knowledgeSourceTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Select label={t("Authority")} onChange={(e) => setSourceForm((c) => ({ ...c, authorityLevel: e.target.value as KnowledgeAuthorityLevel }))} value={sourceForm.authorityLevel}>
                {knowledgeAuthorityLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label={t("Country")} onChange={(e) => setSourceForm((c) => ({ ...c, country: e.target.value }))} placeholder="United States" value={sourceForm.country} />
              <Input label={t("Visa type")} onChange={(e) => setSourceForm((c) => ({ ...c, visaType: e.target.value }))} placeholder="H-1B" value={sourceForm.visaType} />
            </div>
            <Textarea helperText='e.g. {"source_url":"https://uscis.gov"}' label={t("Metadata (JSON)")} onChange={(e) => setSourceForm((c) => ({ ...c, metadata: e.target.value }))} value={sourceForm.metadata} />
            {sourceError ? <FeedbackBanner message={sourceError} tone="error" /> : null}
            {sourceFeedback ? <FeedbackBanner message={sourceFeedback} tone="success" /> : null}
            {createdSource ? <FeedbackBanner message={`${t("Created")}: ${createdSource.source_name} (${createdSource.id})`} tone="info" /> : null}
            <Button disabled={!canAdmin || isCreatingSource} type="submit">{isCreatingSource ? t("Creating") : t("Create source")}</Button>
          </form>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{t("Add knowledge chunk")}</p>
          <form className="space-y-4" onSubmit={(e) => void handleChunkSubmit(e)}>
            <Input label={t("Source ID")} onChange={(e) => setChunkForm((c) => ({ ...c, sourceId: e.target.value }))} placeholder={t("UUID of the source")} value={chunkForm.sourceId} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label={t("Chunk index")} onChange={(e) => setChunkForm((c) => ({ ...c, chunkIndex: e.target.value }))} placeholder="0" value={chunkForm.chunkIndex} />
              <Input label={t("Language")} onChange={(e) => setChunkForm((c) => ({ ...c, language: e.target.value }))} placeholder="en" value={chunkForm.language} />
            </div>
            <Textarea label={t("Chunk text")} onChange={(e) => setChunkForm((c) => ({ ...c, chunkText: e.target.value }))} placeholder={t("Paste normalized chunk text")} value={chunkForm.chunkText} />
            <Textarea helperText='e.g. {"section":"Overview"}' label={t("Metadata (JSON)")} onChange={(e) => setChunkForm((c) => ({ ...c, metadata: e.target.value }))} value={chunkForm.metadata} />
            {chunkError ? <FeedbackBanner message={chunkError} tone="error" /> : null}
            {chunkFeedback ? <FeedbackBanner message={chunkFeedback} tone="success" /> : null}
            {createdChunk ? <FeedbackBanner message={`${t("Saved chunk")} ${createdChunk.chunk_index} ${t("for source")} ${createdChunk.source_id}`} tone="info" /> : null}
            <Button disabled={!canAdmin || isCreatingChunk} type="submit">{isCreatingChunk ? t("Saving") : t("Save chunk")}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AdminCoreProps = {
  accessToken: string;
  userEmail?: string;
  onSignOut?: () => void;
  onSessionExpired?: () => void;
};

export function DashboardAdminPage({
  overrideToken,
  userEmail,
  onSignOut,
  onSessionExpired,
}: {
  overrideToken?: string;
  userEmail?: string;
  onSignOut?: () => void;
  onSessionExpired?: () => void;
} = {}) {
  if (overrideToken) {
    return <DashboardAdminCore accessToken={overrideToken} userEmail={userEmail} onSignOut={onSignOut} onSessionExpired={onSessionExpired} />;
  }
  return <DashboardAdminPageInner />;
}

function DashboardAdminPageInner() {
  const { session } = useAuthSession();
  if (!session) return null;
  return <DashboardAdminCore accessToken={session.accessToken} />;
}

function useSectionMeta(): Record<Tab, { title: string; description: string }> {
  const t = useTranslations();
  return {
    overview: { title: t("Overview"), description: t("Platform health, usage stats, and recent signups") },
    revenue: { title: t("Revenue & growth"), description: t("Paid conversions, ARPU, and daily signup trends") },
    users: { title: t("Users"), description: t("Manage user accounts, plans, and access status") },
    cases: { title: t("Cases"), description: t("Immigration case volume, statuses, and recent activity") },
    knowledge: { title: t("Knowledge base"), description: t("Search and curate sources and chunks") },
    feedback: { title: t("AI feedback"), description: t("Review positive and negative feedback on AI responses") },
    system: { title: t("System health"), description: t("Document processing queue, totals, and operational state") },
  };
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4H10v4a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" />
    </svg>
  );
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function IconBook({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}
function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}
function IconDollar({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}
function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  );
}
function IconServer({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}
function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function DashboardAdminCore({ accessToken, userEmail, onSignOut, onSessionExpired }: AdminCoreProps) {
  const t = useTranslations();
  const SECTION_META = useSectionMeta();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canAdmin, setCanAdmin] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [version, setVersion] = useState<ServiceVersion | null>(null);
  const [db, setDb] = useState<DatabaseCheck | null>(null);
  const [users, setUsers] = useState<AdminUserDirectoryEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const onLoad = useEffectEvent(async () => {
    setLoading(true);
    setError("");

    const [versionRes, dbRes, usersRes, statsRes] = await Promise.all([
      getServiceVersion(),
      getDatabaseCheck(),
      listUsers(accessToken),
      getAdminStats(accessToken)
    ]);

    if (versionRes.ok) setVersion(versionRes.data);
    if (dbRes.ok) setDb(dbRes.data);
    if (usersRes.ok) { setUsers(usersRes.data); setCanAdmin(true); }
    if (statsRes.ok) setStats(statsRes.data);

    if (!usersRes.ok && usersRes.status === 401) {
      onSessionExpired?.();
      return;
    }

    if (!versionRes.ok && !dbRes.ok) setError(t("Could not load system status"));
    setLoading(false);
  });

  useEffect(() => { void onLoad(); }, [accessToken, refreshKey]);

  const handleUserUpdated = useCallback((updated: AdminUserDirectoryEntry) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
  }, []);

  const handleUserDeleted = useCallback((userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }, []);

  const navGroups: {
    heading: string;
    items: { value: Tab; label: string; icon: typeof IconHome; count?: number }[];
  }[] = [
    {
      heading: t("Analytics"),
      items: [
        { value: "overview", label: t("Overview"), icon: IconHome },
        { value: "revenue", label: t("Revenue"), icon: IconDollar },
        { value: "cases", label: t("Cases"), icon: IconBriefcase },
      ],
    },
    {
      heading: t("Platform"),
      items: [
        { value: "users", label: t("Users"), icon: IconUsers, count: users.length },
        { value: "knowledge", label: t("Knowledge"), icon: IconBook },
      ],
    },
    {
      heading: t("Operations"),
      items: [
        { value: "feedback", label: t("Feedback"), icon: IconChat },
        { value: "system", label: t("System"), icon: IconServer },
      ],
    },
  ];

  const meta = SECTION_META[tab];
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "AD";
  const healthOk = Boolean(version) && db?.status === "ok";

  return (
    <div className="flex min-h-screen bg-[#0b0d12]">
      <aside className="relative flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#0b0d12]">
        {/* subtle gradient glow in sidebar */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-20 h-60 w-60 rounded-full bg-accent/20 blur-[80px]" />
          <div className="absolute bottom-0 -right-16 h-52 w-52 rounded-full bg-indigo-500/10 blur-[80px]" />
        </div>

        <div className="relative flex items-center gap-3 border-b border-white/5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-500 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.6)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-black leading-tight tracking-tight text-white">
              Immigrant<span className="text-accent">Guru</span>
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/40">{t("Admin Console")}</p>
          </div>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group, gi) => (
            <div key={group.heading} className={cn(gi > 0 && "mt-5")}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                {group.heading}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = tab === item.value;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      onClick={() => setTab(item.value)}
                      type="button"
                      className={cn(
                        "group relative flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                        active
                          ? "bg-gradient-to-r from-accent/20 to-indigo-500/10 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent to-indigo-400" />
                      ) : null}
                      <span className="flex items-center gap-3">
                        <Icon className={cn("transition-colors", active ? "text-accent" : "text-white/40 group-hover:text-white/70")} />
                        {item.label}
                      </span>
                      {item.count !== undefined ? (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                          active ? "bg-accent/25 text-accent" : "bg-white/5 text-white/50"
                        )}>
                          {item.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-white/5 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              healthOk ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-amber-400"
            )} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">
              {healthOk ? t("All systems green") : t("Checking status")}
            </p>
          </div>

          {userEmail ? (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-indigo-500 text-xs font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-white/40">{t("Signed in")}</p>
                  <p className="truncate text-[12px] font-semibold text-white">{userEmail}</p>
                </div>
              </div>
              {onSignOut ? (
                <button
                  onClick={onSignOut}
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  {t("Sign out")}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto">
        {/* light content surface with slight inset shadow from dark chrome */}
        <div className="min-h-screen bg-canvas">
          <div className="sticky top-0 z-10 border-b border-line bg-white/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-8 py-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
                  <span className="uppercase tracking-[0.18em] text-muted/70">{t("Admin")}</span>
                  <span className="text-muted/40">/</span>
                  <span className="uppercase tracking-[0.18em] text-accent">{meta.title}</span>
                </div>
                <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{meta.title}</h1>
                <p className="mt-0.5 max-w-xl text-sm text-muted">{meta.description}</p>
              </div>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loading}
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink shadow-soft transition hover:border-accent/40 hover:bg-canvas disabled:opacity-50"
                title={t("Refresh data")}
              >
                <IconRefresh className={cn(loading && "animate-spin")} />
                <span className="hidden sm:inline">{loading ? t("Refreshing") : t("Refresh")}</span>
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-[1320px] px-8 py-8">

          {error ? <div className="mb-6"><FeedbackBanner message={error} tone="error" /></div> : null}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <Card key={i} className="animate-pulse h-24 p-5" />)}
            </div>
          ) : (
            <>
              {tab === "overview" && <OverviewTab stats={stats} db={db} version={version} users={users} />}
              {tab === "revenue" && <RevenueTab accessToken={accessToken} />}
              {tab === "users" && <UsersTab users={users} accessToken={accessToken} onUserUpdated={handleUserUpdated} onUserDeleted={handleUserDeleted} />}
              {tab === "cases" && <CasesTab accessToken={accessToken} />}
              {tab === "knowledge" && <KnowledgeTab accessToken={accessToken} canAdmin={canAdmin} />}
              {tab === "feedback" && <FeedbackTab accessToken={accessToken} />}
              {tab === "system" && <SystemTab accessToken={accessToken} />}
            </>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
