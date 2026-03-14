export interface AuditEntry {
  userId: string;
  exchange: string;
  symbol?: string;
  action: string;
  payload: unknown;
  response?: unknown;
  ip?: string;
  device?: string;
  createdAt: string;
}

export class AuditLogService {
  async write(entry: AuditEntry): Promise<void> {
    // Persist to Postgres in production.
    void entry;
  }
}

