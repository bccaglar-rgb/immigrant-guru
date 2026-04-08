"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import { getImmigrationCase } from "@/lib/case-client";
import { buildCaseWorkspaceData } from "@/lib/case-workspace-adapter";
import { listCaseDocuments } from "@/lib/document-client";
import { getCaseTimeline, type CaseTimeline } from "@/lib/timeline-client";
import { getCaseWorkspace } from "@/lib/workspace-client";
import type { CaseWorkspaceData } from "@/types/case-workspace";
import type { ImmigrationCase } from "@/types/cases";
import type { CaseDocument } from "@/types/documents";
import type { CaseWorkspace } from "@/types/workspace";

type WorkspaceLoadStatus = "loading" | "ready" | "error";

type UseCaseWorkspaceResult = {
  accessToken: string | null;
  caseRecord: ImmigrationCase | null;
  data: CaseWorkspaceData | null;
  error: string;
  reload: () => void;
  status: WorkspaceLoadStatus;
  workspace: CaseWorkspace | null;
};

export function useCaseWorkspace(caseId: string): UseCaseWorkspaceResult {
  const { clearSession, session, status: authStatus, user } = useAuthSession();
  const [caseRecord, setCaseRecord] = useState<ImmigrationCase | null>(null);
  const [data, setData] = useState<CaseWorkspaceData | null>(null);
  const [workspace, setWorkspace] = useState<CaseWorkspace | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<WorkspaceLoadStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || !session) {
      return;
    }

    const activeSession = session;
    let cancelled = false;

    async function loadWorkspace() {
      setStatus("loading");
      setError("");

      const accessToken = activeSession.accessToken;
      const [caseResult, workspaceResult, timelineResult, documentsResult] =
        await Promise.all([
          getImmigrationCase(accessToken, caseId),
          getCaseWorkspace(accessToken, caseId),
          getCaseTimeline(accessToken, caseId),
          listCaseDocuments(accessToken, caseId)
        ]);

      if (cancelled) {
        return;
      }

      const authFailure = [
        caseResult,
        workspaceResult,
        timelineResult,
        documentsResult
      ].some((result) => !result.ok && result.status === 401);

      if (authFailure) {
        clearSession();
        return;
      }

      if (!caseResult.ok || !workspaceResult.ok) {
        setCaseRecord(null);
        setData(null);
        setWorkspace(null);
        setError(caseResult.ok ? errorMessageOf(workspaceResult) : errorMessageOf(caseResult));
        setStatus("error");
        return;
      }

      const safeTimeline: CaseTimeline | null = timelineResult.ok
        ? timelineResult.data
        : null;
      const safeDocuments: CaseDocument[] = documentsResult.ok
        ? documentsResult.data
        : [];

      setCaseRecord(caseResult.data);
      setWorkspace(workspaceResult.data);
      setData(
        buildCaseWorkspaceData({
          caseRecord: caseResult.data,
          documents: safeDocuments,
          timeline: safeTimeline,
          user,
          workspace: workspaceResult.data
        })
      );
      setStatus("ready");
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [authStatus, caseId, clearSession, reloadToken, session, user]);

  return {
    accessToken:
      authStatus === "authenticated" && session ? session.accessToken : null,
    caseRecord: authStatus === "authenticated" && session ? caseRecord : null,
    data: authStatus === "authenticated" && session ? data : null,
    error:
      authStatus === "loading"
        ? ""
        : authStatus === "authenticated" && session
          ? error
          : "You need to sign in to access this case workspace.",
    reload,
    status:
      authStatus === "loading"
        ? "loading"
        : authStatus === "authenticated" && session
          ? status
          : "error",
    workspace:
      authStatus === "authenticated" && session ? workspace : null
  };
}

function errorMessageOf<T>(result: { ok: false; errorMessage: string } | { ok: true; data: T }) {
  return result.ok ? "Unexpected response state." : result.errorMessage;
}
