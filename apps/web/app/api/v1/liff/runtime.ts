import { Pool, type QueryResultRow } from "pg";

export type LiffAppRuntimeConfig = {
  tenantId: string;
  tenantDisplayName: string;
  liffAppRecordId: string;
  liffAppId: string;
  lineChannelRecordId: string;
  channelId: string;
  callbackUrl: string;
  allowedReturnUrls: unknown;
  requiredConsentVersion: string | null;
  sessionTtlSeconds: number;
  enabled: boolean;
};

export type LiffIdentityRuntime = {
  tenantId: string;
  tenantDisplayName: string;
  liffAppRecordId: string;
  liffAppId: string;
  lineChannelRecordId: string;
  channelId: string;
  lineUserRecordId: string;
  requiredConsentVersion: string | null;
  sessionTtlSeconds: number;
};

export type LiffBootstrap = {
  tenantId: string;
  tenantDisplayName: string;
  liffAppId: string;
  lineUserId: string;
  requiredConsentVersion: string | null;
  intakeQueueId: string | null;
  intakeQueueName: string | null;
  categories: readonly { id: string; code: string; label: string }[];
};

type LiffAppRow = QueryResultRow & {
  tenant_id: string;
  tenant_display_name: string;
  tenant_status: string;
  liff_app_record_id: string;
  liff_app_id: string;
  line_channel_record_id: string;
  channel_id: string;
  callback_url: string;
  allowed_return_urls: unknown;
  required_consent_version: string | null;
  session_ttl_seconds: number;
  enabled: boolean;
};

type LiffIdentityRow = QueryResultRow & {
  tenant_id: string;
  tenant_display_name: string;
  liff_app_record_id: string;
  liff_app_id: string;
  line_channel_record_id: string;
  channel_id: string;
  line_user_record_id: string;
  required_consent_version: string | null;
  session_ttl_seconds: number;
};

type BootstrapRow = QueryResultRow & {
  tenant_id: string;
  tenant_display_name: string;
  liff_app_id: string;
  line_user_id: string;
  required_consent_version: string | null;
  intake_queue_id: string | null;
  intake_queue_name: string | null;
  categories: unknown;
};

let pool: Pool | undefined;

const databasePool = (): Pool => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("database runtime is not configured");
  pool ??= new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
};

const mapApp = (row: LiffAppRow | undefined): LiffAppRuntimeConfig | undefined => row ? ({
  tenantId: row.tenant_id,
  tenantDisplayName: row.tenant_display_name,
  liffAppRecordId: row.liff_app_record_id,
  liffAppId: row.liff_app_id,
  lineChannelRecordId: row.line_channel_record_id,
  channelId: row.channel_id,
  callbackUrl: row.callback_url,
  allowedReturnUrls: row.allowed_return_urls,
  requiredConsentVersion: row.required_consent_version,
  sessionTtlSeconds: row.session_ttl_seconds,
  enabled: row.enabled,
}) : undefined;

export const resolveLiffApp = async (liffAppId: string): Promise<LiffAppRuntimeConfig | undefined> => {
  const result = await databasePool().query<LiffAppRow>("select * from private.resolve_liff_app($1::text)", [liffAppId]);
  return mapApp(result.rows[0]);
};

export const persistLiffIdentity = async (input: {
  liffAppId: string;
  lineUserId: string;
  verifiedAt: Date;
  consentVersion?: string;
  consentAccepted?: boolean;
}): Promise<LiffIdentityRuntime> => {
  const result = await databasePool().query<LiffIdentityRow>(
    "select * from private.persist_liff_identity($1::text,$2::text,$3::timestamptz,$4::text,$5::boolean)",
    [input.liffAppId, input.lineUserId, input.verifiedAt.toISOString(), input.consentVersion ?? null, input.consentAccepted === true],
  );
  const row = result.rows[0];
  if (!row) throw new Error("LIFF identity persistence returned no row");
  return {
    tenantId: row.tenant_id,
    tenantDisplayName: row.tenant_display_name,
    liffAppRecordId: row.liff_app_record_id,
    liffAppId: row.liff_app_id,
    lineChannelRecordId: row.line_channel_record_id,
    channelId: row.channel_id,
    lineUserRecordId: row.line_user_record_id,
    requiredConsentVersion: row.required_consent_version,
    sessionTtlSeconds: row.session_ttl_seconds,
  };
};

const parseCategories = (value: unknown): readonly { id: string; code: string; label: string }[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { id: string; code: string; label: string } =>
    Boolean(item)
    && typeof item === "object"
    && typeof (item as { id?: unknown }).id === "string"
    && typeof (item as { code?: unknown }).code === "string"
    && typeof (item as { label?: unknown }).label === "string",
  );
};

export const resolveLiffBootstrap = async (input: { liffAppId: string; tenantId: string; lineUserId: string }): Promise<LiffBootstrap | undefined> => {
  const result = await databasePool().query<BootstrapRow>(
    "select * from private.resolve_liff_bootstrap($1::text,$2::uuid,$3::text)",
    [input.liffAppId, input.tenantId, input.lineUserId],
  );
  const row = result.rows[0];
  return row ? {
    tenantId: row.tenant_id,
    tenantDisplayName: row.tenant_display_name,
    liffAppId: row.liff_app_id,
    lineUserId: row.line_user_id,
    requiredConsentVersion: row.required_consent_version,
    intakeQueueId: row.intake_queue_id,
    intakeQueueName: row.intake_queue_name,
    categories: parseCategories(row.categories),
  } : undefined;
};
