"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useAuthSession } from "@/hooks/use-auth-session";
import {
  getMyProfile,
  profileFormSchema,
  profileFormToUpdatePayload,
  profileToFormValues,
  updateMyProfile
} from "@/lib/profile-client";
import { emptyProfileFormValues } from "@/types/profile";
import type {
  ProfileFieldErrors,
  ProfileFormField,
  ProfileFormValues,
  UserProfile
} from "@/types/profile";

type ProfileDataStatus = "loading" | "ready" | "error";

type ProfileFeedback =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

function areFormValuesEqual(
  left: ProfileFormValues,
  right: ProfileFormValues
): boolean {
  return (
    Object.keys(left) as Array<keyof ProfileFormValues>
  ).every((key) => left[key] === right[key]);
}

export function useProfileForm() {
  const { clearSession, replaceUserProfile, session } = useAuthSession();
  const [status, setStatus] = useState<ProfileDataStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ProfileFeedback>(null);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [formValues, setFormValues] = useState<ProfileFormValues>(
    emptyProfileFormValues
  );
  const [initialValues, setInitialValues] = useState<ProfileFormValues>(
    emptyProfileFormValues
  );
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const applyProfile = useCallback(
    (nextProfile: UserProfile) => {
      const nextValues = profileToFormValues(nextProfile);
      setProfile(nextProfile);
      setFormValues(nextValues);
      setInitialValues(nextValues);
      setFieldErrors({});
      setLoadError(null);
      setStatus("ready");
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus("error");
      setLoadError("A valid authenticated session is required to load your profile.");
      return;
    }

    setStatus("loading");
    setFeedback(null);
    setLoadError(null);

    const result = await getMyProfile(session.accessToken);
    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return;
      }

      setStatus("error");
      setLoadError(result.errorMessage);
      return;
    }

    applyProfile(result.data);
  }, [applyProfile, clearSession, session]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [refresh, session?.accessToken]);

  const handleFieldChange = useCallback(
    (field: ProfileFormField, value: string) => {
      setFormValues((current) => ({
        ...current,
        [field]: value
      }));
      setFieldErrors((current) => ({
        ...current,
        [field]: undefined
      }));
      setFeedback(null);
    },
    []
  );

  const isDirty = useMemo(
    () => !areFormValuesEqual(formValues, initialValues),
    [formValues, initialValues]
  );

  const save = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!session) {
        setFeedback({
          tone: "error",
          message: "Your session is no longer available. Sign in again to save changes."
        });
        return;
      }

      setFeedback(null);
      setFieldErrors({});

      const validation = profileFormSchema.safeParse(formValues);
      if (!validation.success) {
        const nextErrors: ProfileFieldErrors = {};

        for (const issue of validation.error.issues) {
          const field = issue.path[0];
          if (typeof field === "string" && !(field in nextErrors)) {
            nextErrors[field as ProfileFormField] = issue.message;
          }
        }

        setFieldErrors(nextErrors);
        setFeedback({
          tone: "error",
          message: "Review the highlighted fields before saving your profile."
        });
        return;
      }

      setIsSaving(true);

      const result = await updateMyProfile(
        session.accessToken,
        profileFormToUpdatePayload(validation.data)
      );

      setIsSaving(false);

      if (!result.ok) {
        if (result.status === 401) {
          clearSession();
          return;
        }

        setFeedback({
          tone: "error",
          message: result.errorMessage
        });
        return;
      }

      applyProfile(result.data);
      replaceUserProfile(result.data);
      setFeedback({
        tone: "success",
        message: "Profile updated successfully. Your strategy workspace can use the latest inputs now."
      });
    },
    [applyProfile, clearSession, formValues, replaceUserProfile, session]
  );

  return {
    feedback,
    fieldErrors,
    formValues,
    handleFieldChange,
    isDirty,
    isSaving,
    loadError,
    profile,
    refresh,
    save,
    status
  };
}
