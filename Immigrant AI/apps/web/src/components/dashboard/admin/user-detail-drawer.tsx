"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { AdminUserDirectoryEntry } from "@/types/admin";

import { PLAN_COLORS, PLAN_LABELS, STATUS_COLORS, fmtDate } from "./shared";

export function UserDetailDrawer({
  user,
  onClose,
  onDelete,
}: {
  user: AdminUserDirectoryEntry | null;
  onClose: () => void;
  onDelete?: (userId: string) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setConfirmDelete(false);
    setDeleteError(null);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [user, onClose]);

  if (!user) return null;

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(user.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      setIsDeleting(false);
    }
  };

  const plan = user.plan ?? "free";
  const fullName = [user.profile?.first_name, user.profile?.last_name]
    .filter(Boolean)
    .join(" ");
  const initials = (user.profile?.first_name?.[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-ink/40 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-lg font-black text-accent">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{user.email}</p>
              {fullName ? <p className="truncate text-xs text-muted">{fullName}</p> : null}
              <p className="mt-0.5 font-mono text-[10px] text-muted">{user.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red hover:bg-red/5 transition-colors"
                aria-label="Delete user"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close drawer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-6 py-6">
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Account
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Plan">
                <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", PLAN_COLORS[plan] ?? "bg-canvas border-line text-ink")}>
                  {PLAN_LABELS[plan] ?? plan}
                </span>
              </Field>
              <Field label="Status">
                <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", user.status === "active" ? "bg-green/10 border-green/20 text-green-700" : "bg-red/5 border-red/20 text-red")}>
                  {user.status}
                </span>
              </Field>
              <Field label="Email verified">
                <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", user.email_verified ? "bg-green/10 border-green/20 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
                  {user.email_verified ? "Verified" : "Pending"}
                </span>
              </Field>
              <Field label="Joined">
                <span className="text-xs text-ink">{fmtDate(user.created_at)}</span>
              </Field>
              <Field label="Last updated">
                <span className="text-xs text-ink">{fmtDate(user.updated_at)}</span>
              </Field>
              <Field label="Cases">
                <span className="text-sm font-bold text-ink">{user.immigration_cases.length}</span>
              </Field>
            </div>
          </section>

          {user.profile ? (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Profile
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Nationality">
                  <span className="text-xs text-ink">{user.profile.nationality ?? "—"}</span>
                </Field>
                <Field label="Current country">
                  <span className="text-xs text-ink">{user.profile.current_country ?? "—"}</span>
                </Field>
                <Field label="Target country">
                  <span className="text-xs text-ink">{user.profile.target_country ?? "—"}</span>
                </Field>
                <Field label="Profession">
                  <span className="text-xs text-ink">{user.profile.profession ?? "—"}</span>
                </Field>
                <Field label="Education">
                  <span className="text-xs text-ink">{user.profile.education_level ?? "—"}</span>
                </Field>
                <Field label="English level">
                  <span className="text-xs text-ink">{user.profile.english_level ?? "—"}</span>
                </Field>
                <Field label="Experience">
                  <span className="text-xs text-ink">{user.profile.years_of_experience !== null ? `${user.profile.years_of_experience} yrs` : "—"}</span>
                </Field>
                <Field label="Timeline">
                  <span className="text-xs text-ink">{user.profile.relocation_timeline ?? "—"}</span>
                </Field>
                <Field label="Capital">
                  <span className="text-xs text-ink">{user.profile.available_capital ?? "—"}</span>
                </Field>
              </div>
            </section>
          ) : (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Profile
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-6 text-center text-xs text-muted">
                User has not completed onboarding.
              </p>
            </section>
          )}

          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Immigration cases ({user.immigration_cases.length})
            </p>
            <div className="mt-3 space-y-2">
              {user.immigration_cases.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line bg-canvas/40 px-4 py-6 text-center text-xs text-muted">
                  No cases yet.
                </p>
              ) : (
                user.immigration_cases.map((c) => (
                  <div key={c.id} className="rounded-xl border border-line bg-canvas/40 p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-ink">{c.title || "Untitled case"}</p>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_COLORS[c.status] ?? "bg-canvas border-line text-ink")}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted">{c.id.slice(0, 8)} · updated {fmtDate(c.updated_at)}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {confirmDelete && (
          <div className="border-t border-line bg-red/5 px-6 py-5">
            <p className="text-sm font-semibold text-red">Delete this account?</p>
            <p className="mt-1 text-xs text-muted">
              This permanently removes <span className="font-medium text-ink">{user.email}</span> and all associated data. This cannot be undone.
            </p>
            {deleteError && (
              <p className="mt-2 text-xs text-red">{deleteError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red px-4 py-2 text-xs font-bold text-white hover:bg-red/80 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-canvas transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
