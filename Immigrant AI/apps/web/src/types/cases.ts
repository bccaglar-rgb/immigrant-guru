export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

export const immigrationCaseStatusValues = [
  "draft",
  "in_review",
  "active",
  "closed"
] as const;

export type ImmigrationCaseStatus = (typeof immigrationCaseStatusValues)[number];

export const immigrationCaseStatusOptions: ReadonlyArray<
  SelectOption<ImmigrationCaseStatus>
> = [
  { label: "Draft", value: "draft" },
  { label: "In review", value: "in_review" },
  { label: "Active", value: "active" },
  { label: "Closed", value: "closed" }
];

export type ImmigrationCaseSummary = {
  id: string;
  title: string;
  target_country: string | null;
  target_program: string | null;
  current_stage: string | null;
  status: ImmigrationCaseStatus;
  notes: string | null;
  latest_score: string | null;
  risk_score: string | null;
  created_at: string;
  updated_at: string;
};

export type ImmigrationCase = ImmigrationCaseSummary & {
  user_id: string;
};

export type ImmigrationCaseWritePayload = {
  title: string;
  target_country: string | null;
  target_program: string | null;
  current_stage: string | null;
  status: ImmigrationCaseStatus;
  notes: string | null;
  latest_score: string | null;
  risk_score: string | null;
};

export type ImmigrationCaseFormValues = {
  title: string;
  target_country: string;
  target_program: string;
  current_stage: string;
  status: ImmigrationCaseStatus;
  notes: string;
  latest_score: string;
  risk_score: string;
};

export type ImmigrationCaseFormField = keyof ImmigrationCaseFormValues;

export type ImmigrationCaseFieldErrors = Partial<
  Record<ImmigrationCaseFormField, string>
>;

export const emptyImmigrationCaseFormValues: ImmigrationCaseFormValues = {
  title: "",
  target_country: "",
  target_program: "",
  current_stage: "",
  status: "draft",
  notes: "",
  latest_score: "",
  risk_score: ""
};

