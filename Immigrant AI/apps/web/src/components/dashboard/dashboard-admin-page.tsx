"use client";

import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import type { FormEvent } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import {
  createKnowledgeChunk,
  createKnowledgeSource,
  getDatabaseCheck,
  getServiceVersion,
  listUsers,
  searchKnowledgeBase
} from "@/lib/admin-client";
import { getPublicEnv } from "@/lib/config";
import {
  knowledgeAuthorityLevelOptions,
  knowledgeSourceTypeOptions
} from "@/types/admin";
import type {
  AdminUserDirectoryEntry,
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
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type LoadStatus = "idle" | "loading" | "ready" | "error";
type AdminAccessState = "loading" | "granted" | "restricted" | "error";

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

const searchDefaults: SearchFormState = {
  authorityLevel: "",
  country: "",
  limit: "5",
  query: "",
  sourceType: "",
  visaType: ""
};

const sourceDefaults: SourceFormState = {
  authorityLevel: "primary",
  country: "",
  language: "en",
  metadata: "{}",
  sourceName: "",
  sourceType: "government_website",
  visaType: ""
};

const chunkDefaults: ChunkFormState = {
  chunkIndex: "0",
  chunkText: "",
  language: "en",
  metadata: "{}",
  sourceId: ""
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function parseJsonObject(
  rawValue: string,
  fieldLabel: string
): { ok: true; data: Record<string, unknown> } | { ok: false; errorMessage: string } {
  const trimmed = rawValue.trim();

  if (trimmed.length === 0) {
    return {
      ok: true,
      data: {}
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return {
        ok: false,
        errorMessage: `${fieldLabel} must be a JSON object.`
      };
    }

    return {
      ok: true,
      data: parsed as Record<string, unknown>
    };
  } catch {
    return {
      ok: false,
      errorMessage: `${fieldLabel} must be valid JSON.`
    };
  }
}

function MetricCard({
  eyebrow,
  tone = "default",
  value
}: Readonly<{
  eyebrow: string;
  tone?: "default" | "good" | "warning";
  value: string;
}>) {
  const valueClassName =
    tone === "good"
      ? "text-green"
      : tone === "warning"
        ? "text-red"
        : "text-ink";

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {eyebrow}
      </p>
      <p className={`mt-3 text-xl font-semibold tracking-tight ${valueClassName}`}>{value}</p>
    </Card>
  );
}

function SectionIntro({
  description,
  eyebrow,
  title
}: Readonly<{
  description: string;
  eyebrow: string;
  title: string;
}>) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{description}</p>
    </div>
  );
}

function FeedbackPanel({
  message,
  tone
}: Readonly<{
  message: string;
  tone: "error" | "info" | "success";
}>) {
  const palette =
    tone === "success"
      ? "border-green/20 bg-green/10 text-green"
      : tone === "error"
        ? "border-red/20 bg-red/5 text-red"
        : "border-line bg-canvas/50 text-ink";

  return (
    <div className={`rounded-xl border px-4 py-4 text-sm ${palette}`}>
      <p className="leading-7">{message}</p>
    </div>
  );
}

function EmptyState({
  description,
  title
}: Readonly<{
  description: string;
  title: string;
}>) {
  return (
    <Card className="p-6">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted">
        {title}
      </p>
      <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
    </Card>
  );
}

export function DashboardAdminPage() {
  const { session, user } = useAuthSession();
  const appEnv = getPublicEnv().appEnv;
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [pageError, setPageError] = useState("");
  const [serviceVersion, setServiceVersion] = useState<ServiceVersion | null>(null);
  const [databaseCheck, setDatabaseCheck] = useState<DatabaseCheck | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserDirectoryEntry[]>([]);
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>("loading");
  const [adminAccessMessage, setAdminAccessMessage] = useState("");
  const [searchForm, setSearchForm] = useState<SearchFormState>(searchDefaults);
  const [searchStatus, setSearchStatus] = useState<LoadStatus>("idle");
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResponse | null>(
    null
  );
  const [sourceForm, setSourceForm] = useState<SourceFormState>(sourceDefaults);
  const [sourceError, setSourceError] = useState("");
  const [sourceFeedback, setSourceFeedback] = useState("");
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [createdSource, setCreatedSource] = useState<KnowledgeSourceSummary | null>(
    null
  );
  const [chunkForm, setChunkForm] = useState<ChunkFormState>(chunkDefaults);
  const [chunkError, setChunkError] = useState("");
  const [chunkFeedback, setChunkFeedback] = useState("");
  const [isCreatingChunk, setIsCreatingChunk] = useState(false);
  const [createdChunk, setCreatedChunk] = useState<KnowledgeChunkRecord | null>(null);

  const refreshInternalConsole = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoadStatus("loading");
    setPageError("");
    setAdminAccess("loading");
    setAdminAccessMessage("");

    const [versionResult, databaseResult, usersResult] = await Promise.all([
      getServiceVersion(),
      getDatabaseCheck(),
      listUsers(session.accessToken)
    ]);

    if (!versionResult.ok || !databaseResult.ok) {
      const nextError = !versionResult.ok
        ? versionResult.errorMessage
        : databaseResult.ok
          ? "The database check returned an unexpected result."
          : databaseResult.errorMessage;

      setLoadStatus("error");
      setPageError(nextError);
      setServiceVersion(versionResult.ok ? versionResult.data : null);
      setDatabaseCheck(databaseResult.ok ? databaseResult.data : null);
      setAdminUsers([]);
      return;
    }

    setServiceVersion(versionResult.data);
    setDatabaseCheck(databaseResult.data);
    setLoadStatus("ready");

    if (usersResult.ok) {
      setAdminUsers(usersResult.data);
      setAdminAccess("granted");
      setAdminAccessMessage("");
      return;
    }

    setAdminUsers([]);

    if (usersResult.status === 403) {
      setAdminAccess("restricted");
      setAdminAccessMessage(
        "This account can inspect platform status and retrieval, but user directory and knowledge ingestion remain restricted to configured admin operators."
      );
      return;
    }

    setAdminAccess("error");
    setAdminAccessMessage(usersResult.errorMessage);
  }, [session]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshInternalConsole();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshInternalConsole]);

  const adminSummary = useMemo(() => {
    if (adminAccess === "granted") {
      return `${adminUsers.length} users visible to this admin session.`;
    }

    if (adminAccess === "restricted") {
      return "Admin-only operations are locked for this account.";
    }

    if (adminAccess === "error") {
      return "Admin controls could not be loaded right now.";
    }

    return "Loading internal access policy.";
  }, [adminAccess, adminUsers.length]);

  const canSubmitAdminForms = adminAccess === "granted" && Boolean(session);

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session) {
      return;
    }

    const query = searchForm.query.trim();
    if (query.length < 2) {
      setSearchError("Search query must contain at least 2 characters.");
      setSearchStatus("error");
      return;
    }

    const parsedLimit = Number.parseInt(searchForm.limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 25) {
      setSearchError("Result limit must be between 1 and 25.");
      setSearchStatus("error");
      return;
    }

    setSearchStatus("loading");
    setSearchError("");

    const result = await searchKnowledgeBase(session.accessToken, {
      authority_levels: searchForm.authorityLevel
        ? [searchForm.authorityLevel]
        : undefined,
      country: searchForm.country.trim() || null,
      limit: parsedLimit,
      query,
      source_types: searchForm.sourceType ? [searchForm.sourceType] : undefined,
      visa_type: searchForm.visaType.trim() || null
    });

    if (!result.ok) {
      setSearchResults(null);
      setSearchError(result.errorMessage);
      setSearchStatus("error");
      return;
    }

    setSearchResults(result.data);
    setSearchStatus("ready");
  };

  const handleSourceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session || !canSubmitAdminForms) {
      return;
    }

    const sourceName = sourceForm.sourceName.trim();
    if (sourceName.length === 0) {
      setSourceError("Source name is required.");
      return;
    }

    const metadataResult = parseJsonObject(
      sourceForm.metadata,
      "Source metadata"
    );
    if (!metadataResult.ok) {
      setSourceError(metadataResult.errorMessage);
      return;
    }

    setIsCreatingSource(true);
    setSourceError("");
    setSourceFeedback("");

    const result = await createKnowledgeSource(session.accessToken, {
      authority_level: sourceForm.authorityLevel,
      chunks: [],
      country: sourceForm.country.trim() || null,
      language: sourceForm.language.trim() || null,
      metadata: metadataResult.data,
      source_name: sourceName,
      source_type: sourceForm.sourceType,
      visa_type: sourceForm.visaType.trim() || null
    });

    setIsCreatingSource(false);

    if (!result.ok) {
      setSourceError(result.errorMessage);
      if (result.status === 403) {
        setAdminAccess("restricted");
        setAdminAccessMessage(
          "Admin knowledge ingestion is restricted to configured internal operators."
        );
      }
      return;
    }

    setCreatedSource(result.data);
    setSourceFeedback("Trusted knowledge source created successfully.");
    setSourceForm(sourceDefaults);
    setChunkForm((current) => ({
      ...current,
      sourceId: result.data.id
    }));
  };

  const handleChunkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session || !canSubmitAdminForms) {
      return;
    }

    const sourceId = chunkForm.sourceId.trim();
    if (!sourceId) {
      setChunkError("Source ID is required before a chunk can be attached.");
      return;
    }

    const chunkText = chunkForm.chunkText.trim();
    if (!chunkText) {
      setChunkError("Chunk text is required.");
      return;
    }

    const parsedIndex = Number.parseInt(chunkForm.chunkIndex, 10);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
      setChunkError("Chunk index must be a non-negative integer.");
      return;
    }

    const metadataResult = parseJsonObject(
      chunkForm.metadata,
      "Chunk metadata"
    );
    if (!metadataResult.ok) {
      setChunkError(metadataResult.errorMessage);
      return;
    }

    setIsCreatingChunk(true);
    setChunkError("");
    setChunkFeedback("");

    const result = await createKnowledgeChunk(session.accessToken, {
      chunk_index: parsedIndex,
      chunk_text: chunkText,
      language: chunkForm.language.trim() || null,
      metadata: metadataResult.data,
      source_id: sourceId
    });

    setIsCreatingChunk(false);

    if (!result.ok) {
      setChunkError(result.errorMessage);
      if (result.status === 403) {
        setAdminAccess("restricted");
        setAdminAccessMessage(
          "Admin knowledge ingestion is restricted to configured internal operators."
        );
      }
      return;
    }

    setCreatedChunk(result.data);
    setChunkFeedback("Knowledge chunk stored successfully.");
    setChunkForm((current) => ({
      ...chunkDefaults,
      sourceId: current.sourceId
    }));
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        actions={
          <Button
            disabled={loadStatus === "loading"}
            onClick={() => {
              void refreshInternalConsole();
            }}
            type="button"
            variant="secondary"
          >
            Refresh console
          </Button>
        }
        description="Use this internal workspace to verify service health, inspect guarded admin access, search trusted knowledge chunks, and seed authoritative content without leaving the product shell."
        eyebrow="Internal"
        title="Admin and operations console"
      />

      {appEnv === "production" ? (
        <FeedbackPanel
          message="This internal console is intentionally hidden from production navigation. Direct access remains available for controlled operator sessions."
          tone="info"
        />
      ) : null}

      {loadStatus === "error" ? (
        <DashboardErrorState
          message={pageError}
          onRetry={() => {
            void refreshInternalConsole();
          }}
          title="The internal console could not load its latest system signals."
        />
      ) : null}

      {loadStatus !== "error" ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              eyebrow="Service version"
              value={
                serviceVersion
                  ? `${serviceVersion.name} ${serviceVersion.version}`
                  : "Loading"
              }
            />
            <MetricCard
              eyebrow="Environment"
              value={serviceVersion?.environment ?? "Loading"}
            />
            <MetricCard
              eyebrow="Database"
              tone={databaseCheck?.status === "ok" ? "good" : "warning"}
              value={databaseCheck?.status ?? "Loading"}
            />
          </div>

          <Card className="p-6">
            <SectionIntro
              description="Internal access is still enforced by backend guards. This panel surfaces whether the current authenticated operator can use admin-only capabilities."
              eyebrow="Access"
              title="Current operator state"
            />
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-ink">{user?.email ?? "Unknown session"}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{adminSummary}</p>
              </div>
              <div className="rounded-full border border-line bg-canvas/50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-accent">
                {adminAccess}
              </div>
            </div>
            {adminAccessMessage ? (
              <div className="mt-5">
                <FeedbackPanel
                  message={adminAccessMessage}
                  tone={adminAccess === "error" ? "error" : "info"}
                />
              </div>
            ) : null}
          </Card>

          <Card className="p-6 md:p-7">
            <SectionIntro
              description="Run lexical grounding searches against the current knowledge base to validate how future AI grounding will resolve relevant policy chunks."
              eyebrow="Knowledge search"
              title="Retrieval test console"
            />
            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSearchSubmit}>
              <Input
                label="Query"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    query: event.target.value
                  }))
                }
                placeholder="specialty occupation degree requirement"
                value={searchForm.query}
              />
              <Input
                label="Country"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    country: event.target.value
                  }))
                }
                placeholder="United States"
                value={searchForm.country}
              />
              <Input
                label="Visa type"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    visaType: event.target.value
                  }))
                }
                placeholder="H-1B"
                value={searchForm.visaType}
              />
              <Input
                label="Result limit"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    limit: event.target.value
                  }))
                }
                placeholder="5"
                value={searchForm.limit}
              />
              <Select
                label="Source type filter"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    sourceType: event.target.value as KnowledgeSourceType | ""
                  }))
                }
                placeholder="Any trusted source type"
                value={searchForm.sourceType}
              >
                {knowledgeSourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Authority filter"
                onChange={(event) =>
                  setSearchForm((current) => ({
                    ...current,
                    authorityLevel: event.target.value as KnowledgeAuthorityLevel | ""
                  }))
                }
                placeholder="Any authority level"
                value={searchForm.authorityLevel}
              >
                {knowledgeAuthorityLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <div className="md:col-span-2">
                <Button disabled={searchStatus === "loading"} type="submit">
                  {searchStatus === "loading" ? "Searching..." : "Search knowledge base"}
                </Button>
              </div>
            </form>

            {searchError ? (
              <div className="mt-5">
                <FeedbackPanel message={searchError} tone="error" />
              </div>
            ) : null}

            {searchStatus === "ready" && searchResults ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted">
                  {searchResults.total_results} results via {searchResults.backend}
                </p>
                {searchResults.results.length > 0 ? (
                  searchResults.results.map((result) => (
                    <Card className="p-5" key={result.chunk.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                            {result.source.source_name}
                          </p>
                          <h4 className="mt-2 text-lg font-semibold text-ink">
                            {result.source.country || "Global"} {result.source.visa_type ? `• ${result.source.visa_type}` : ""}
                          </h4>
                          <p className="mt-2 text-sm leading-7 text-muted">
                            {result.chunk.chunk_text}
                          </p>
                        </div>
                        <div className="rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm text-muted">
                          Score {result.score.toFixed(2)}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-3">
                        <p>Authority: {result.source.authority_level}</p>
                        <p>Matched: {result.matched_terms.join(", ") || "None"}</p>
                        <p>Reason: {result.match_reason}</p>
                      </div>
                    </Card>
                  ))
                ) : (
                  <EmptyState
                    description="No chunks matched the current filters. Adjust the query or broaden the authority/source constraints."
                    title="No retrieval results"
                  />
                )}
              </div>
            ) : null}
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-6 md:p-7">
              <SectionIntro
                description="Review user accounts, current case counts, and profile ownership at a glance. This data is guarded by the backend admin policy."
                eyebrow="User directory"
                title="Protected account list"
              />
              <div className="mt-6 space-y-4">
                {adminAccess === "granted" ? (
                  adminUsers.length > 0 ? (
                    adminUsers.map((entry) => (
                      <Card className="p-5" key={entry.id}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-ink">{entry.email}</p>
                            <p className="mt-1 text-sm text-muted">
                              {entry.profile?.first_name || entry.profile?.last_name
                                ? `${entry.profile?.first_name ?? ""} ${entry.profile?.last_name ?? ""}`.trim()
                                : "Profile name not set"}
                            </p>
                          </div>
                          <div className="rounded-full border border-line bg-canvas/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                            {entry.status}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-3">
                          <p>Cases: {entry.immigration_cases.length}</p>
                          <p>Joined: {formatDate(entry.created_at)}</p>
                          <p>Updated: {formatDate(entry.updated_at)}</p>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <EmptyState
                      description="No users are visible to this admin session yet."
                      title="User directory is empty"
                    />
                  )
                ) : adminAccess === "loading" ? (
                  <Card className="animate-pulse p-6" />
                ) : (
                  <EmptyState
                    description="This account does not currently hold admin access for the protected user directory."
                    title="Admin permission required"
                  />
                )}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6 md:p-7">
                <SectionIntro
                  description="Seed authoritative sources manually until automated ingestion is introduced. Source creation is restricted to configured admin accounts."
                  eyebrow="Knowledge source"
                  title="Add a trusted source"
                />
                <form className="mt-6 space-y-4" onSubmit={handleSourceSubmit}>
                  <Input
                    label="Source name"
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        sourceName: event.target.value
                      }))
                    }
                    placeholder="USCIS H-1B Specialty Occupations"
                    value={sourceForm.sourceName}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      label="Source type"
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          sourceType: event.target.value as KnowledgeSourceType
                        }))
                      }
                      value={sourceForm.sourceType}
                    >
                      {knowledgeSourceTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Authority level"
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          authorityLevel: event.target.value as KnowledgeAuthorityLevel
                        }))
                      }
                      value={sourceForm.authorityLevel}
                    >
                      {knowledgeAuthorityLevelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Country"
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          country: event.target.value
                        }))
                      }
                      placeholder="United States"
                      value={sourceForm.country}
                    />
                    <Input
                      label="Visa type"
                      onChange={(event) =>
                        setSourceForm((current) => ({
                          ...current,
                          visaType: event.target.value
                        }))
                      }
                      placeholder="H-1B"
                      value={sourceForm.visaType}
                    />
                  </div>
                  <Input
                    label="Language"
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        language: event.target.value
                      }))
                    }
                    placeholder="en"
                    value={sourceForm.language}
                  />
                  <Textarea
                    helperText='JSON object only. Example: {"source_url":"https://www.uscis.gov"}'
                    label="Metadata"
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        metadata: event.target.value
                      }))
                    }
                    value={sourceForm.metadata}
                  />
                  {sourceError ? <FeedbackPanel message={sourceError} tone="error" /> : null}
                  {sourceFeedback ? (
                    <FeedbackPanel message={sourceFeedback} tone="success" />
                  ) : null}
                  {createdSource ? (
                    <FeedbackPanel
                      message={`Latest source: ${createdSource.source_name} (${createdSource.id})`}
                      tone="info"
                    />
                  ) : null}
                  <Button
                    disabled={!canSubmitAdminForms || isCreatingSource}
                    type="submit"
                  >
                    {isCreatingSource ? "Creating source..." : "Create source"}
                  </Button>
                </form>
              </Card>

              <Card className="p-6 md:p-7">
                <SectionIntro
                  description="Attach normalized chunks to an existing trusted source so retrieval and grounded strategy generation can consume them later."
                  eyebrow="Knowledge chunk"
                  title="Add a chunk"
                />
                <form className="mt-6 space-y-4" onSubmit={handleChunkSubmit}>
                  <Input
                    label="Source ID"
                    onChange={(event) =>
                      setChunkForm((current) => ({
                        ...current,
                        sourceId: event.target.value
                      }))
                    }
                    placeholder="Paste a knowledge source UUID"
                    value={chunkForm.sourceId}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Chunk index"
                      onChange={(event) =>
                        setChunkForm((current) => ({
                          ...current,
                          chunkIndex: event.target.value
                        }))
                      }
                      placeholder="0"
                      value={chunkForm.chunkIndex}
                    />
                    <Input
                      label="Language"
                      onChange={(event) =>
                        setChunkForm((current) => ({
                          ...current,
                          language: event.target.value
                        }))
                      }
                      placeholder="en"
                      value={chunkForm.language}
                    />
                  </div>
                  <Textarea
                    label="Chunk text"
                    onChange={(event) =>
                      setChunkForm((current) => ({
                        ...current,
                        chunkText: event.target.value
                      }))
                    }
                    placeholder="Paste the normalized chunk text that should later be retrieved and grounded into strategy prompts."
                    value={chunkForm.chunkText}
                  />
                  <Textarea
                    helperText='JSON object only. Example: {"section_heading":"Overview"}'
                    label="Metadata"
                    onChange={(event) =>
                      setChunkForm((current) => ({
                        ...current,
                        metadata: event.target.value
                      }))
                    }
                    value={chunkForm.metadata}
                  />
                  {chunkError ? <FeedbackPanel message={chunkError} tone="error" /> : null}
                  {chunkFeedback ? (
                    <FeedbackPanel message={chunkFeedback} tone="success" />
                  ) : null}
                  {createdChunk ? (
                    <FeedbackPanel
                      message={`Latest chunk saved at index ${createdChunk.chunk_index} for source ${createdChunk.source_id}.`}
                      tone="info"
                    />
                  ) : null}
                  <Button
                    disabled={!canSubmitAdminForms || isCreatingChunk}
                    type="submit"
                  >
                    {isCreatingChunk ? "Creating chunk..." : "Create chunk"}
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
