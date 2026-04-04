"use client";

import { useCallback, useEffect, useState } from "react";

import { getDashboardCases, getDashboardProfile } from "@/lib/dashboard-client";
import { getCaseScore } from "@/lib/score-client";
import { getCaseWorkspace } from "@/lib/workspace-client";
import { createDashboardOverview } from "@/lib/dashboard-view-models";
import { useAuthSession } from "@/hooks/use-auth-session";
import type {
  DashboardCase,
  DashboardDataState,
  DashboardOverviewCards,
  DashboardPrimaryCaseScore,
  DashboardPrimaryCaseWorkspace,
  DashboardProfile
} from "@/types/dashboard";

const EMPTY_OVERVIEW = createDashboardOverview(null, [], null, null);

export function useDashboardResources() {
  const { clearSession, session, status, user } = useAuthSession();
  const [cases, setCases] = useState<DashboardCase[]>([]);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [primaryCaseScore, setPrimaryCaseScore] = useState<DashboardPrimaryCaseScore>(
    null
  );
  const [primaryCaseWorkspace, setPrimaryCaseWorkspace] =
    useState<DashboardPrimaryCaseWorkspace>(null);
  const [resourceState, setResourceState] = useState<DashboardDataState>("loading");

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !session) {
      return;
    }

    setResourceState("loading");
    setError("");

    const [profileResult, casesResult] = await Promise.all([
      getDashboardProfile(session.accessToken),
      getDashboardCases(session.accessToken)
    ]);

    if (!profileResult.ok) {
      if (profileResult.status === 401) {
        clearSession();
        return;
      }

      setResourceState("error");
      setError(profileResult.errorMessage);
      return;
    }

    if (!casesResult.ok) {
      if (casesResult.status === 401) {
        clearSession();
        return;
      }

      setResourceState("error");
      setError(casesResult.errorMessage);
      return;
    }

    setProfile(profileResult.data);
    setCases(casesResult.data);
    setPrimaryCaseScore(null);
    setPrimaryCaseWorkspace(null);

    const activeCase = casesResult.data[0];
    if (activeCase) {
      const [scoreResult, workspaceResult] = await Promise.all([
        getCaseScore(session.accessToken, activeCase.id),
        getCaseWorkspace(session.accessToken, activeCase.id)
      ]);

      if (!scoreResult.ok) {
        if (scoreResult.status === 401) {
          clearSession();
          return;
        }
      } else {
        setPrimaryCaseScore(scoreResult.data);
      }

      if (!workspaceResult.ok) {
        if (workspaceResult.status === 401) {
          clearSession();
          return;
        }
      } else {
        setPrimaryCaseWorkspace(workspaceResult.data);
      }
    }

    setResourceState("ready");
  }, [clearSession, session, status]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      const refreshTimer = window.setTimeout(() => {
        void refresh();
      }, 0);

      return () => {
        window.clearTimeout(refreshTimer);
      };
    } else if (status === "unauthenticated") {
      const resetTimer = window.setTimeout(() => {
        setProfile(null);
        setCases([]);
        setPrimaryCaseScore(null);
        setPrimaryCaseWorkspace(null);
        setResourceState("loading");
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }
  }, [refresh, session, status]);

  const overview: DashboardOverviewCards = createDashboardOverview(
    profile ?? user?.profile ?? null,
    cases,
    primaryCaseScore,
    primaryCaseWorkspace
  );

  return {
    cases,
    error,
    overview: resourceState === "ready" ? overview : EMPTY_OVERVIEW,
    profile: profile ?? user?.profile ?? null,
    refresh,
    status: resourceState
  };
}
