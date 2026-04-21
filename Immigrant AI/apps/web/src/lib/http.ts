type FetchJsonOptions = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

type FetchJsonResult = {
  ok: boolean;
  status: number;
  data: unknown;
  errorMessage: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "The request took too long. Please try again.";
    }

    const normalizedMessage = error.message.trim().toLowerCase();
    if (
      normalizedMessage.includes("fetch failed") ||
      normalizedMessage.includes("failed to fetch") ||
      normalizedMessage.includes("networkerror") ||
      normalizedMessage.includes("load failed")
    ) {
      return "The service could not be reached. Please try again in a moment.";
    }

    if (error.message.trim()) {
      return error.message;
    }
  }

  return "Request failed unexpectedly.";
}

function getPayloadErrorMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data === "object") {
    const objectData = data as {
      detail?:
        | string
        | Array<{
            loc?: Array<string | number>;
            msg?: string;
          }>;
      error?: {
        details?:
          | string
          | Array<{
              loc?: Array<string | number>;
              msg?: string;
            }>;
        message?: string;
      };
      message?: string;
    };

    const resolveIssueMessage = (
      issues:
        | string
        | Array<{
            loc?: Array<string | number>;
            msg?: string;
          }>
        | undefined
    ): string | null => {
      if (!Array.isArray(issues) || issues.length === 0) {
        return null;
      }

      const firstIssue = issues.find(
        (issue) => typeof issue?.msg === "string" && issue.msg
      );

      if (!firstIssue?.msg) {
        return null;
      }

      const location = Array.isArray(firstIssue.loc)
        ? firstIssue.loc
            .filter(
              (segment): segment is string =>
                typeof segment === "string" && segment !== "body"
            )
            .join(".")
        : "";

      return location ? `${location}: ${firstIssue.msg}` : firstIssue.msg;
    };

    const wrappedIssueMessage = resolveIssueMessage(objectData.error?.details);
    if (wrappedIssueMessage) {
      return wrappedIssueMessage;
    }

    if (typeof objectData.error?.message === "string" && objectData.error.message) {
      return objectData.error.message;
    }

    if (typeof objectData.detail === "string" && objectData.detail) {
      return objectData.detail;
    }

    const detailIssueMessage = resolveIssueMessage(objectData.detail);
    if (detailIssueMessage) {
      return detailIssueMessage;
    }

    if (typeof objectData.message === "string" && objectData.message) {
      return objectData.message;
    }
  }

  return `Request failed with status ${status}.`;
}

function buildRequestSignal(
  timeoutMs: number,
  upstreamSignal?: AbortSignal | null
): AbortSignal | undefined {
  const supportsTimeout = typeof AbortSignal.timeout === "function";
  const supportsAny = typeof AbortSignal.any === "function";
  const timeoutSignal = supportsTimeout ? AbortSignal.timeout(timeoutMs) : undefined;

  if (!upstreamSignal) {
    return timeoutSignal;
  }

  if (supportsAny && timeoutSignal) {
    return AbortSignal.any([upstreamSignal, timeoutSignal]);
  }

  return upstreamSignal;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const text = await response.text();
    return text.length > 0 ? JSON.parse(text) : null;
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export async function fetchJson(
  input: RequestInfo | URL,
  {
    retries = 0,
    retryDelayMs = 300,
    timeoutMs = 4000,
    ...init
  }: FetchJsonOptions = {}
): Promise<FetchJsonResult> {
  let attempt = 0;
  let lastStatus = 0;
  let lastErrorMessage = "Request failed unexpectedly.";

  while (attempt <= retries) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: buildRequestSignal(timeoutMs, init.signal)
      });
      const data = await parseResponseBody(response);
      lastStatus = response.status;

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data,
          errorMessage: ""
        };
      }

      lastErrorMessage =
        getPayloadErrorMessage(data, response.status);
    } catch (error) {
      lastErrorMessage = normalizeErrorMessage(error);
    }

    attempt += 1;
    if (attempt <= retries) {
      await delay(retryDelayMs * attempt);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: null,
    errorMessage: lastErrorMessage
  };
}
