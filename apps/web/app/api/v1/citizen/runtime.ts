import { Pool, type QueryResultRow } from "pg";

import type { ComplaintPublicListStatus, ComplaintPublicView } from "@citychatbot/complaints";

type ComplaintWriteRow = QueryResultRow & {
  complaint_id: string;
  complaint_no: string;
  canonical_status: string;
  created_at: string;
  row_version: string | number;
  idempotent_replay: boolean;
};

type ComplaintPageRow = QueryResultRow & {
  items: unknown;
  next_cursor: string | null;
};

type CommentRow = QueryResultRow & {
  message_id: string;
  item: unknown;
  idempotent_replay: boolean;
};

type SurveyRow = QueryResultRow & {
  survey: unknown;
  idempotent_replay: boolean;
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

const asPublicView = (value: unknown): ComplaintPublicView => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("citizen response is invalid");
  return value as ComplaintPublicView;
};

const asPublicViews = (value: unknown): readonly ComplaintPublicView[] => {
  if (!Array.isArray(value)) throw new Error("citizen list response is invalid");
  return value.map(asPublicView);
};

export type CitizenComplaintCreateInput = {
  liffAppId: string;
  tenantId: string;
  lineUserId: string;
  idempotencyKey: string;
  requestHash: string;
  categoryId?: string;
  categoryUncertain: boolean;
  citizenName?: string;
  citizenPhoneEncrypted?: string;
  title: string;
  description: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  intakeQueueId: string;
};

export const createCitizenComplaint = async (input: CitizenComplaintCreateInput) => {
  const result = await databasePool().query<ComplaintWriteRow>(
    "select * from private.create_citizen_complaint($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::boolean,$8::text,$9::text,$10::text,$11::text,$12::text,$13::numeric,$14::numeric,$15::uuid)",
    [
      input.liffAppId,
      input.tenantId,
      input.lineUserId,
      input.idempotencyKey,
      input.requestHash,
      input.categoryId ?? null,
      input.categoryUncertain,
      input.citizenName ?? null,
      input.citizenPhoneEncrypted ?? null,
      input.title,
      input.description,
      input.locationText ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.intakeQueueId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("citizen complaint write returned no row");
  return {
    complaintId: row.complaint_id,
    complaintNo: row.complaint_no,
    status: row.canonical_status,
    createdAt: row.created_at,
    rowVersion: Number(row.row_version),
    idempotentReplay: row.idempotent_replay,
  };
};

export const listCitizenComplaints = async (input: {
  tenantId: string;
  lineUserId: string;
  status: ComplaintPublicListStatus;
  limit: number;
  cursor?: number;
}): Promise<{ items: readonly ComplaintPublicView[]; nextCursor?: string }> => {
  const result = await databasePool().query<ComplaintPageRow>(
    "select * from private.list_citizen_complaints($1::uuid,$2::text,$3::text,$4::integer,$5::integer)",
    [input.tenantId, input.lineUserId, input.status, input.limit, input.cursor ?? 0],
  );
  const row = result.rows[0];
  if (!row) throw new Error("citizen complaint list returned no row");
  return {
    items: asPublicViews(row.items),
    ...(row.next_cursor ? { nextCursor: row.next_cursor } : {}),
  };
};

export const getCitizenComplaint = async (input: { tenantId: string; lineUserId: string; complaintId: string }): Promise<ComplaintPublicView | undefined> => {
  const result = await databasePool().query<{ item: unknown }>(
    "select private.get_citizen_complaint($1::uuid,$2::text,$3::uuid) as item",
    [input.tenantId, input.lineUserId, input.complaintId],
  );
  const value = result.rows[0]?.item;
  return value === null || value === undefined ? undefined : asPublicView(value);
};

export const addCitizenComment = async (input: {
  tenantId: string;
  lineUserId: string;
  complaintId: string;
  expectedVersion: number;
  body: string;
  idempotencyKey: string;
  requestHash: string;
}) => {
  const result = await databasePool().query<CommentRow>(
    "select * from private.add_citizen_comment($1::uuid,$2::text,$3::uuid,$4::bigint,$5::text,$6::text,$7::text)",
    [input.tenantId, input.lineUserId, input.complaintId, input.expectedVersion, input.body, input.idempotencyKey, input.requestHash],
  );
  const row = result.rows[0];
  if (!row) throw new Error("citizen comment write returned no row");
  return { messageId: row.message_id, item: asPublicView(row.item), idempotentReplay: row.idempotent_replay };
};

export const submitCitizenSurvey = async (input: {
  tenantId: string;
  lineUserId: string;
  complaintId: string;
  rating: number;
  comment?: string;
  idempotencyKey: string;
  requestHash: string;
}) => {
  const result = await databasePool().query<SurveyRow>(
    "select * from private.submit_citizen_survey($1::uuid,$2::text,$3::uuid,$4::smallint,$5::text,$6::text,$7::text)",
    [input.tenantId, input.lineUserId, input.complaintId, input.rating, input.comment ?? null, input.idempotencyKey, input.requestHash],
  );
  const row = result.rows[0];
  if (!row) throw new Error("citizen survey write returned no row");
  return { survey: row.survey, idempotentReplay: row.idempotent_replay };
};
