import type { StructuredIssue } from "./types.ts";

export class ExchangeManagerError extends Error {
  issue: StructuredIssue;

  constructor(issue: StructuredIssue) {
    super(issue.message);
    this.issue = issue;
  }
}

export const issue = (
  code: StructuredIssue["code"],
  message: string,
  retriable = false,
  details?: Record<string, unknown>,
  retryAfterMs?: number,
): StructuredIssue => ({ code, message, retriable, details, retryAfterMs });

export const isTransientIssue = (err: StructuredIssue) =>
  err.code === "RATE_LIMIT" || err.code === "NETWORK_TIMEOUT" || err.code === "EXCHANGE_DOWN";
