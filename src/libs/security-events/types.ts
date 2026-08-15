export type SecurityEventType =
  | "login_failed"
  | "login_success"
  | "brute_force_lockout"
  | "rate_limit_exceeded"
  | "account_flagged"
  | "account_unflagged"
  | "suspicious_ip"
  | "mfa_failed"
  | "password_changed"
  | "session_hijack_attempt";

export interface SecurityEventRecord {
  id: string;
  user_id: string | null;
  event_type: SecurityEventType;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SecurityEventsDeps {
  db: {
    unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    sql: {
      unsafe<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    };
  };
}

export interface SecurityEventsConfig {
  defaultLimit?: number;
  autoPurgeHours?: number;
}
