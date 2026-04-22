"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  caseFormToPayload,
  immigrationCaseFormSchema
} from "@/lib/case-client";
import { cn } from "@/lib/utils";
import {
  immigrationCaseStatusOptions
} from "@/types/cases";
import type {
  ImmigrationCaseFieldErrors,
  ImmigrationCaseFormField,
  ImmigrationCaseFormValues,
  ImmigrationCaseWritePayload
} from "@/types/cases";

type SubmitResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errorMessage: string;
    };

type CaseFormProps = Readonly<{
  cancelLabel?: string;
  initialValues: ImmigrationCaseFormValues;
  isSubmitting?: boolean;
  mode: "create" | "edit";
  onCancel?: () => void;
  onSubmit: (payload: ImmigrationCaseWritePayload) => Promise<SubmitResult>;
  submitLabel?: string;
}>;

function areValuesEqual(
  left: ImmigrationCaseFormValues,
  right: ImmigrationCaseFormValues
): boolean {
  return (
    Object.keys(left) as Array<keyof ImmigrationCaseFormValues>
  ).every((key) => left[key] === right[key]);
}

export function CaseForm({
  cancelLabel,
  initialValues,
  isSubmitting = false,
  mode,
  onCancel,
  onSubmit,
  submitLabel
}: CaseFormProps) {
  const t = useTranslations();
  const [formValues, setFormValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<ImmigrationCaseFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const isDirty = useMemo(
    () => !areValuesEqual(formValues, initialValues),
    [formValues, initialValues]
  );

  const handleChange = (field: ImmigrationCaseFormField, value: string) => {
    setFormValues((current) => ({
      ...current,
      [field]: value
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined
    }));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const validation = immigrationCaseFormSchema.safeParse(formValues);
    if (!validation.success) {
      const nextErrors: ImmigrationCaseFieldErrors = {};

      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in nextErrors)) {
          nextErrors[field as ImmigrationCaseFormField] = issue.message;
        }
      }

      setFieldErrors(nextErrors);
      setFormError(t("Review the highlighted case fields before saving."));
      return;
    }

    const result = await onSubmit(caseFormToPayload(validation.data));
    if (!result.ok) {
      setFormError(result.errorMessage);
    }
  };

  const resolvedCancelLabel = cancelLabel ?? t("Cancel");
  const resolvedSubmitLabel =
    submitLabel ??
    (mode === "create" ? t("Create strategy case") : t("Save case changes"));

  return (
    <Card className="p-6 md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
            {mode === "create" ? t("New strategy case") : t("Case planning workspace")}
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            {mode === "create"
              ? t("Define a migration pathway to evaluate")
              : t("Update the case strategy record")}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            {t("Capture the destination, program, current stage, and risk signals that anchor strategy generation, scoring, and document workflows.")}
          </p>
        </div>
      </div>

      <form className="mt-8 space-y-8" noValidate onSubmit={handleSubmit}>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t("Strategy identity")}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                error={fieldErrors.title}
                label={t("Case title")}
                onChange={(event) => handleChange("title", event.target.value)}
                placeholder={t("U.S. employment-based migration plan")}
                value={formValues.title}
              />
              <Input
                error={fieldErrors.target_country}
                label={t("Target country")}
                onChange={(event) =>
                  handleChange("target_country", event.target.value)
                }
                placeholder={t("United States")}
                value={formValues.target_country}
              />
              <Input
                error={fieldErrors.target_program}
                label={t("Target pathway or program")}
                onChange={(event) =>
                  handleChange("target_program", event.target.value)
                }
                placeholder="EB-2 NIW"
                value={formValues.target_program}
              />
              <Input
                error={fieldErrors.current_stage}
                helperText={t("Example: eligibility_review, document_collection, filing_ready")}
                label={t("Current stage")}
                onChange={(event) =>
                  handleChange("current_stage", event.target.value)
                }
                placeholder="eligibility_review"
                value={formValues.current_stage}
              />
              <Select
                error={fieldErrors.status}
                label={t("Case status")}
                onChange={(event) => handleChange("status", event.target.value)}
                value={formValues.status}
              >
                {immigrationCaseStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t("Evaluation signals")}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                error={fieldErrors.latest_score}
                helperText={t("Optional score snapshot if you want to retain a manual benchmark.")}
                inputMode="decimal"
                label={t("Latest score")}
                onChange={(event) =>
                  handleChange("latest_score", event.target.value)
                }
                placeholder="78.50"
                value={formValues.latest_score}
              />
              <Input
                error={fieldErrors.risk_score}
                helperText={t("Higher values should indicate higher execution or eligibility risk.")}
                inputMode="decimal"
                label={t("Risk score")}
                onChange={(event) =>
                  handleChange("risk_score", event.target.value)
                }
                placeholder="22.00"
                value={formValues.risk_score}
              />
              <div className="md:col-span-2">
                <Textarea
                  error={fieldErrors.notes}
                  helperText={t("Keep notes focused on blockers, evidence gaps, and next actions.")}
                  label={t("Strategy notes")}
                  onChange={(event) => handleChange("notes", event.target.value)}
                  placeholder={t("Collect recommendation letters and evidence of impact.")}
                  value={formValues.notes}
                />
              </div>
            </div>
          </div>
        </div>

        {formError ? (
          <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-4 text-sm text-red">
            {formError}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
              variant="secondary"
            >
              {resolvedCancelLabel}
            </Button>
          ) : null}
          <Button
            className={cn("sm:min-w-[220px]")}
            disabled={isSubmitting || (mode === "edit" && !isDirty)}
            type="submit"
          >
            {isSubmitting
              ? mode === "create"
                ? t("Creating case...")
                : t("Saving changes...")
              : mode === "edit" && !isDirty
                ? t("No changes to save")
                : resolvedSubmitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
