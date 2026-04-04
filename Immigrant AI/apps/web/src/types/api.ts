export type ApiRequestResult<T> =
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

