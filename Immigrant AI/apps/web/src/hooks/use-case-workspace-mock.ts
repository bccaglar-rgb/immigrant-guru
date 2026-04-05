"use client";

import { useCallback, useEffect, useState } from "react";

import { getCaseWorkspaceMock } from "@/lib/case-workspace-mocks";
import type { CaseWorkspaceData } from "@/types/case-workspace";

type WorkspaceLoadStatus = "loading" | "ready" | "error";

export function useCaseWorkspaceMock(caseId: string) {
  const [data, setData] = useState<CaseWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<WorkspaceLoadStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(() => {
    setData(null);
    setStatus("loading");
    setError("");
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setData(null);
      setStatus("loading");
      setError("");
    }, 0);

    const timer = window.setTimeout(() => {
      if (caseId.toLowerCase().includes("error")) {
        setStatus("error");
        setError(
          "The case workspace could not be assembled right now. Try again in a moment."
        );
        return;
      }

      setData(getCaseWorkspaceMock(caseId));
      setStatus("ready");
    }, 450);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
    };
  }, [caseId, reloadToken]);

  return {
    data,
    error,
    reload: load,
    status
  };
}
