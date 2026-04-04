import type { ImmigrationCaseSummary } from "@/types/cases";
import type { UserProfile } from "@/types/profile";
import type { ImmigrationScore } from "@/types/scoring";
import type { CaseWorkspace } from "@/types/workspace";

export type DashboardProfile = UserProfile;
export type DashboardCase = ImmigrationCaseSummary;

export type DashboardOverviewCards = {
  aiStrategyTeaser: {
    headline: string;
    summary: string;
  };
  caseHealth: {
    note: string;
    title: string;
    value: string;
  };
  documentStatus: {
    note: string;
    title: string;
    value: string;
  };
  immigrationScore: {
    note: string;
    title: string;
    value: string;
  };
  recommendedNextStep: {
    note: string;
    title: string;
    value: string;
  };
};

export type DashboardPrimaryCaseScore = ImmigrationScore | null;
export type DashboardPrimaryCaseWorkspace = CaseWorkspace | null;

export type DashboardDataState = "loading" | "ready" | "error";

export type DashboardRequestResult<T> =
  | {
      ok: true;
      data: T;
      status: number;
    }
  | {
      ok: false;
      errorMessage: string;
      status: number;
    };
