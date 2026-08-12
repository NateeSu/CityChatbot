import type { ComplaintPriority, ComplaintState } from "./complaint";

export type SlaErrorCode = "VALIDATION_ERROR" | "RULE_NOT_FOUND" | "HISTORICAL_SNAPSHOT_IMMUTABLE";

export class SlaDomainError extends Error {
  constructor(public readonly code: SlaErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SlaDomainError";
  }
}

export type SlaCalendarWindow = { start: string; end: string };

export type SlaBusinessCalendar = {
  id: string;
  tenantId: string;
  timezone: string;
  workingWeekdays: readonly number[];
  windows: readonly SlaCalendarWindow[];
  holidayDates: readonly string[];
};

export type SlaRuleVersion = {
  id: string;
  tenantId: string;
  version: number;
  state: "DRAFT" | "ACTIVE" | "RETIRED";
  departmentId?: string;
  categoryId?: string;
  priority?: ComplaintPriority;
  responseTargetSeconds: number;
  resolutionTargetSeconds: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  calendar: SlaBusinessCalendar;
  pauseStatuses: readonly ComplaintState[];
  warningRatio?: number;
};

export type SlaRuleSelectionInput = {
  tenantId: string;
  departmentId?: string;
  categoryId?: string;
  priority: ComplaintPriority;
  at: Date;
};

export type SlaSnapshot = {
  id: string;
  tenantId: string;
  complaintId: string;
  ruleId: string;
  ruleVersion: number;
  calendarId: string;
  timezone: string;
  departmentId?: string;
  categoryId?: string;
  priority: ComplaintPriority;
  startedAt: string;
  capturedAt: string;
  responseWarningAt: string;
  responseDueAt: string;
  resolutionWarningAt: string;
  resolutionDueAt: string;
  pauseStatuses: readonly ComplaintState[];
  pausedAt?: string;
  pausedBusinessSeconds: number;
  state: "ACTIVE" | "PAUSED" | "COMPLETED";
};

export type SlaMilestoneState = "ON_TRACK" | "WARNING" | "BREACHED" | "COMPLETED" | "PAUSED";

export type SlaEvaluation = {
  response: SlaMilestoneState;
  resolution: SlaMilestoneState;
};

export type SlaEvent = {
  type: "complaint.sla_warning" | "complaint.sla_breached";
  milestone: "response" | "resolution";
  snapshotId: string;
  tenantId: string;
  complaintId: string;
  ruleVersion: number;
  idempotencyKey: string;
  occurredAt: string;
};

export type SlaScanResult = {
  snapshots: readonly SlaSnapshot[];
  events: readonly SlaEvent[];
  emittedKeys: readonly string[];
};

export type SlaRecomputeResult = {
  snapshot: SlaSnapshot;
  audit: {
    action: "SLA_RECOMPUTE_SKIPPED" | "SLA_RECOMPUTED";
    reason: string;
    previousRuleVersion: number;
    nextRuleVersion: number;
    occurredAt: string;
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSED_STATES: readonly ComplaintState[] = ["RESOLVED", "CLOSED", "OUT_OF_JURISDICTION", "CANCELLED"];
const DEFAULT_PAUSE_STATES: readonly ComplaintState[] = ["WAITING_FOR_CITIZEN"];
const PRIORITIES: readonly ComplaintPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const COMPLAINT_STATES: readonly ComplaintState[] = ["RECEIVED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CITIZEN", "RESOLVED", "CLOSED", "OUT_OF_JURISDICTION", "CANCELLED"];

const assertDate = (date: Date, field: string): void => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new SlaDomainError("VALIDATION_ERROR", `${field} is invalid`);
};

const assertTimezone = (timezone: string): void => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch { throw new SlaDomainError("VALIDATION_ERROR", "timezone is invalid"); }
};

export const validateBusinessCalendar = (calendar: SlaBusinessCalendar): void => {
  if (!calendar.id || !calendar.tenantId) throw new SlaDomainError("VALIDATION_ERROR", "calendar identity is required");
  assertTimezone(calendar.timezone);
  if (calendar.workingWeekdays.length === 0 || calendar.workingWeekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) || new Set(calendar.workingWeekdays).size !== calendar.workingWeekdays.length) throw new SlaDomainError("VALIDATION_ERROR", "working weekdays are invalid");
  if (calendar.windows.length === 0) throw new SlaDomainError("VALIDATION_ERROR", "at least one business window is required");
  let previousEnd = "00:00";
  for (const window of calendar.windows) {
    if (!TIME.test(window.start) || !TIME.test(window.end) || window.start >= window.end || window.start < previousEnd) throw new SlaDomainError("VALIDATION_ERROR", "business window is invalid or overlaps a previous window");
    previousEnd = window.end;
  }
  if (new Set(calendar.holidayDates).size !== calendar.holidayDates.length) throw new SlaDomainError("VALIDATION_ERROR", "holiday dates must be unique");
  for (const holiday of calendar.holidayDates) {
    if (!ISO_DATE.test(holiday)) throw new SlaDomainError("VALIDATION_ERROR", "holiday date is invalid");
    const parts = holiday.split("-").map(Number);
    const year = parts[0] ?? Number.NaN; const month = parts[1] ?? Number.NaN; const day = parts[2] ?? Number.NaN;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (![year, month, day].every(Number.isFinite) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) throw new SlaDomainError("VALIDATION_ERROR", "holiday date is invalid");
  }
};

export const validateSlaRule = (rule: SlaRuleVersion): void => {
  if (!rule.id || !rule.tenantId || !Number.isSafeInteger(rule.version) || rule.version < 1) throw new SlaDomainError("VALIDATION_ERROR", "rule identity/version is invalid");
  if (!["DRAFT", "ACTIVE", "RETIRED"].includes(rule.state)) throw new SlaDomainError("VALIDATION_ERROR", "rule state is invalid");
  if (rule.priority !== undefined && !PRIORITIES.includes(rule.priority)) throw new SlaDomainError("VALIDATION_ERROR", "rule priority is invalid");
  if (!Number.isSafeInteger(rule.responseTargetSeconds) || rule.responseTargetSeconds <= 0 || !Number.isSafeInteger(rule.resolutionTargetSeconds) || rule.resolutionTargetSeconds < rule.responseTargetSeconds) throw new SlaDomainError("VALIDATION_ERROR", "SLA target seconds are invalid");
  if (rule.effectiveFrom && !Number.isFinite(Date.parse(rule.effectiveFrom))) throw new SlaDomainError("VALIDATION_ERROR", "effectiveFrom is invalid");
  if (rule.effectiveUntil && !Number.isFinite(Date.parse(rule.effectiveUntil))) throw new SlaDomainError("VALIDATION_ERROR", "effectiveUntil is invalid");
  if (rule.effectiveFrom && rule.effectiveUntil && Date.parse(rule.effectiveUntil) <= Date.parse(rule.effectiveFrom)) throw new SlaDomainError("VALIDATION_ERROR", "effective window is invalid");
  const ratio = rule.warningRatio ?? 0.8;
  if (!(ratio > 0 && ratio < 1)) throw new SlaDomainError("VALIDATION_ERROR", "warningRatio must be between zero and one");
  if (!Array.isArray(rule.pauseStatuses) || rule.pauseStatuses.some((status) => !COMPLAINT_STATES.includes(status)) || new Set(rule.pauseStatuses).size !== rule.pauseStatuses.length) throw new SlaDomainError("VALIDATION_ERROR", "pause statuses are invalid");
  validateBusinessCalendar(rule.calendar);
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; dateKey: string; weekday: number };

const localParts = (date: Date, timezone: string): LocalParts => {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[parts.weekday ?? ""];
  if (!weekday) throw new SlaDomainError("VALIDATION_ERROR", "calendar weekday could not be calculated");
  const year = Number(parts.year); const month = Number(parts.month); const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), dateKey: `${parts.year}-${parts.month}-${parts.day}`, weekday };
};

const localEpoch = (parts: Pick<LocalParts, "year" | "month" | "day" | "hour" | "minute" | "second">): number => Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

const localDateTimeToUtc = (dateKey: string, time: string, timezone: string): Date => {
  const dateParts = dateKey.split("-").map(Number); const timeParts = time.split(":").map(Number);
  const year = dateParts[0] ?? Number.NaN; const month = dateParts[1] ?? Number.NaN; const day = dateParts[2] ?? Number.NaN;
  const hour = timeParts[0] ?? Number.NaN; const minute = timeParts[1] ?? Number.NaN;
  if (!ISO_DATE.test(dateKey) || !TIME.test(time) || ![year, month, day, hour, minute].every(Number.isFinite)) throw new SlaDomainError("VALIDATION_ERROR", "local calendar date/time is invalid");
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() + 1 !== month || parsedDate.getUTCDate() !== day) throw new SlaDomainError("VALIDATION_ERROR", "local calendar date is invalid");
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(guess, timezone);
    const difference = target - localEpoch(actual);
    if (difference === 0) return guess;
    guess = new Date(guess.getTime() + difference);
  }
  throw new SlaDomainError("VALIDATION_ERROR", "local calendar date/time does not exist in timezone");
};

const nextDateKey = (dateKey: string): string => {
  const parts = dateKey.split("-").map(Number);
  const year = parts[0] ?? Number.NaN; const month = parts[1] ?? Number.NaN; const day = parts[2] ?? Number.NaN;
  if (!ISO_DATE.test(dateKey) || ![year, month, day].every(Number.isFinite)) throw new SlaDomainError("VALIDATION_ERROR", "date key is invalid");
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  if (!Number.isFinite(date.getTime())) throw new SlaDomainError("VALIDATION_ERROR", "date key is invalid");
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
};

const calendarDayIsWorking = (calendar: SlaBusinessCalendar, parts: LocalParts): boolean => calendar.workingWeekdays.includes(parts.weekday) && !calendar.holidayDates.includes(parts.dateKey);

export const businessSecondsBetween = (start: Date, end: Date, calendar: SlaBusinessCalendar): number => {
  validateBusinessCalendar(calendar); assertDate(start, "start"); assertDate(end, "end");
  if (end.getTime() <= start.getTime()) return 0;
  let key = localParts(start, calendar.timezone).dateKey;
  const endKey = localParts(end, calendar.timezone).dateKey;
  let total = 0;
  for (let guard = 0; guard < 40_000 && key <= endKey; guard += 1) {
    const dayParts = localParts(localDateTimeToUtc(key, "00:00", calendar.timezone), calendar.timezone);
    if (calendarDayIsWorking(calendar, dayParts)) {
      for (const window of calendar.windows) {
        const windowStart = localDateTimeToUtc(key, window.start, calendar.timezone).getTime();
        const windowEnd = localDateTimeToUtc(key, window.end, calendar.timezone).getTime();
        total += Math.max(0, Math.min(end.getTime(), windowEnd) - Math.max(start.getTime(), windowStart)) / 1000;
      }
    }
    key = nextDateKey(key);
  }
  return total;
};

export const addBusinessSeconds = (start: Date, seconds: number, calendar: SlaBusinessCalendar): Date => {
  validateBusinessCalendar(calendar); assertDate(start, "start");
  if (!Number.isFinite(seconds) || seconds < 0) throw new SlaDomainError("VALIDATION_ERROR", "business seconds are invalid");
  if (seconds === 0) return new Date(start.getTime());
  let remaining = seconds;
  let cursor = new Date(start.getTime());
  let key = localParts(cursor, calendar.timezone).dateKey;
  for (let guard = 0; guard < 40_000; guard += 1) {
    const dayParts = localParts(localDateTimeToUtc(key, "00:00", calendar.timezone), calendar.timezone);
    if (calendarDayIsWorking(calendar, dayParts)) {
      for (const window of calendar.windows) {
        const windowStart = localDateTimeToUtc(key, window.start, calendar.timezone);
        const windowEnd = localDateTimeToUtc(key, window.end, calendar.timezone);
        const candidate = cursor.getTime() > windowStart.getTime() ? cursor : windowStart;
        if (candidate.getTime() >= windowEnd.getTime()) continue;
        const available = (windowEnd.getTime() - candidate.getTime()) / 1000;
        if (remaining <= available) return new Date(candidate.getTime() + remaining * 1000);
        remaining -= available;
        cursor = windowEnd;
      }
    }
    key = nextDateKey(key);
    cursor = localDateTimeToUtc(key, "00:00", calendar.timezone);
  }
  throw new SlaDomainError("VALIDATION_ERROR", "business calendar search exceeded the safety limit");
};

export const selectSlaRule = (rules: readonly SlaRuleVersion[], input: SlaRuleSelectionInput): SlaRuleVersion => {
  assertDate(input.at, "selection time");
  if (!PRIORITIES.includes(input.priority)) throw new SlaDomainError("VALIDATION_ERROR", "complaint priority is invalid");
  const at = input.at.getTime();
  const candidates = rules.filter((rule) => {
    validateSlaRule(rule);
    if (rule.tenantId !== input.tenantId || rule.state !== "ACTIVE") return false;
    if (rule.effectiveFrom && at < Date.parse(rule.effectiveFrom)) return false;
    if (rule.effectiveUntil && at >= Date.parse(rule.effectiveUntil)) return false;
    if (rule.departmentId && rule.departmentId !== input.departmentId) return false;
    if (rule.categoryId && rule.categoryId !== input.categoryId) return false;
    if (rule.priority && rule.priority !== input.priority) return false;
    return (rule.priority === input.priority) || (rule.priority === undefined && rule.categoryId === undefined && rule.departmentId === undefined);
  }).map((rule) => ({ rule, score: rule.categoryId && rule.priority && rule.departmentId ? 5 : rule.categoryId && rule.priority ? 4 : rule.departmentId && rule.priority ? 3 : rule.priority ? 2 : 1 }));
  if (candidates.length === 0) throw new SlaDomainError("RULE_NOT_FOUND", "no active SLA rule matches the complaint");
  candidates.sort((left, right) => right.score - left.score || right.rule.version - left.rule.version || left.rule.id.localeCompare(right.rule.id));
  return candidates[0]!.rule;
};

export const createSlaSnapshot = (input: { id: string; complaintId: string; tenantId: string; departmentId?: string; categoryId?: string; priority: ComplaintPriority; startedAt: Date; rules: readonly SlaRuleVersion[] }): SlaSnapshot => {
  if (!input.id || !input.complaintId || !input.tenantId) throw new SlaDomainError("VALIDATION_ERROR", "snapshot identity is required");
  assertDate(input.startedAt, "startedAt");
  const rule = selectSlaRule(input.rules, { tenantId: input.tenantId, departmentId: input.departmentId, categoryId: input.categoryId, priority: input.priority, at: input.startedAt });
  const ratio = rule.warningRatio ?? 0.8;
  const responseWarningAt = addBusinessSeconds(input.startedAt, rule.responseTargetSeconds * ratio, rule.calendar);
  const responseDueAt = addBusinessSeconds(input.startedAt, rule.responseTargetSeconds, rule.calendar);
  const resolutionWarningAt = addBusinessSeconds(input.startedAt, rule.resolutionTargetSeconds * ratio, rule.calendar);
  const resolutionDueAt = addBusinessSeconds(input.startedAt, rule.resolutionTargetSeconds, rule.calendar);
  return {
    id: input.id,
    tenantId: input.tenantId,
    complaintId: input.complaintId,
    ruleId: rule.id,
    ruleVersion: rule.version,
    calendarId: rule.calendar.id,
    timezone: rule.calendar.timezone,
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    priority: input.priority,
    startedAt: input.startedAt.toISOString(),
    capturedAt: input.startedAt.toISOString(),
    responseWarningAt: responseWarningAt.toISOString(),
    responseDueAt: responseDueAt.toISOString(),
    resolutionWarningAt: resolutionWarningAt.toISOString(),
    resolutionDueAt: resolutionDueAt.toISOString(),
    pauseStatuses: [...(rule.pauseStatuses.length ? rule.pauseStatuses : DEFAULT_PAUSE_STATES)],
    pausedBusinessSeconds: 0,
    state: "ACTIVE",
  };
};

const milestone = (warningAt: string, dueAt: string, now: Date, completedAt?: string, paused = false): SlaMilestoneState => {
  if (paused) return "PAUSED";
  if (completedAt) return "COMPLETED";
  if (now.getTime() >= Date.parse(dueAt)) return "BREACHED";
  if (now.getTime() >= Date.parse(warningAt)) return "WARNING";
  return "ON_TRACK";
};

export const evaluateSla = (snapshot: SlaSnapshot, input: { now: Date; firstResponseAt?: string; resolvedAt?: string }): SlaEvaluation => {
  assertDate(input.now, "evaluation time");
  const paused = snapshot.state === "PAUSED" || Boolean(snapshot.pausedAt);
  return {
    response: milestone(snapshot.responseWarningAt, snapshot.responseDueAt, input.now, input.firstResponseAt, paused),
    resolution: snapshot.state === "COMPLETED" && input.resolvedAt ? "COMPLETED" : milestone(snapshot.resolutionWarningAt, snapshot.resolutionDueAt, input.now, input.resolvedAt, paused),
  };
};

export const applySlaStatus = (snapshot: SlaSnapshot, status: ComplaintState, at: Date, calendar: SlaBusinessCalendar): SlaSnapshot => {
  assertDate(at, "status time"); validateBusinessCalendar(calendar);
  const shouldPause = snapshot.pauseStatuses.includes(status);
  if (shouldPause && !snapshot.pausedAt && snapshot.state !== "COMPLETED") return { ...snapshot, pausedAt: at.toISOString(), state: "PAUSED" };
  if (!shouldPause && snapshot.pausedAt) {
    const pausedSeconds = businessSecondsBetween(new Date(snapshot.pausedAt), at, calendar);
    const shift = (value: string): string => addBusinessSeconds(new Date(value), pausedSeconds, calendar).toISOString();
    return { ...snapshot, responseWarningAt: shift(snapshot.responseWarningAt), responseDueAt: shift(snapshot.responseDueAt), resolutionWarningAt: shift(snapshot.resolutionWarningAt), resolutionDueAt: shift(snapshot.resolutionDueAt), pausedAt: undefined, pausedBusinessSeconds: snapshot.pausedBusinessSeconds + pausedSeconds, state: CLOSED_STATES.includes(status) ? "COMPLETED" : "ACTIVE" };
  }
  if (CLOSED_STATES.includes(status) && snapshot.state !== "COMPLETED") return { ...snapshot, state: "COMPLETED" };
  if (!shouldPause && snapshot.state === "PAUSED") return { ...snapshot, state: "ACTIVE" };
  return { ...snapshot };
};

export const scanSlaSnapshots = (inputs: readonly { snapshot: SlaSnapshot; status: ComplaintState; firstResponseAt?: string; resolvedAt?: string; calendar: SlaBusinessCalendar }[], now: Date, alreadyEmitted: ReadonlySet<string> = new Set()): SlaScanResult => {
  assertDate(now, "scan time");
  const events: SlaEvent[] = []; const nextSnapshots: SlaSnapshot[] = []; const emittedKeys = new Set(alreadyEmitted);
  for (const input of inputs) {
    const snapshot = applySlaStatus(input.snapshot, input.status, now, input.calendar);
    const evaluation = evaluateSla(snapshot, { now, firstResponseAt: input.firstResponseAt, resolvedAt: input.resolvedAt });
    for (const [milestoneName, state] of [["response", evaluation.response], ["resolution", evaluation.resolution]] as const) {
      if (state !== "WARNING" && state !== "BREACHED") continue;
      const type = state === "WARNING" ? "complaint.sla_warning" : "complaint.sla_breached";
      const key = `${type}:${snapshot.id}:${milestoneName}`;
      if (emittedKeys.has(key)) continue;
      emittedKeys.add(key);
      events.push({ type, milestone: milestoneName, snapshotId: snapshot.id, tenantId: snapshot.tenantId, complaintId: snapshot.complaintId, ruleVersion: snapshot.ruleVersion, idempotencyKey: key, occurredAt: now.toISOString() });
    }
    nextSnapshots.push(snapshot);
  }
  return { snapshots: nextSnapshots, events, emittedKeys: [...emittedKeys].sort() };
};

export const recomputeSlaSnapshot = (snapshot: SlaSnapshot, rule: SlaRuleVersion, input: { at: Date; reason: string; allowHistoricalRewrite?: boolean }): SlaRecomputeResult => {
  assertDate(input.at, "recompute time");
  if (input.reason.trim().length < 3) throw new SlaDomainError("VALIDATION_ERROR", "recompute reason is required");
  if (snapshot.ruleId === rule.id && snapshot.ruleVersion === rule.version) return { snapshot: { ...snapshot }, audit: { action: "SLA_RECOMPUTE_SKIPPED", reason: input.reason.trim(), previousRuleVersion: snapshot.ruleVersion, nextRuleVersion: rule.version, occurredAt: input.at.toISOString() } };
  if (!input.allowHistoricalRewrite) throw new SlaDomainError("HISTORICAL_SNAPSHOT_IMMUTABLE", "historical SLA snapshot is immutable without explicit override");
  const next = createSlaSnapshot({ id: snapshot.id, complaintId: snapshot.complaintId, tenantId: snapshot.tenantId, departmentId: snapshot.departmentId, categoryId: snapshot.categoryId, priority: snapshot.priority, startedAt: new Date(snapshot.startedAt), rules: [rule] });
  return { snapshot: next, audit: { action: "SLA_RECOMPUTED", reason: input.reason.trim(), previousRuleVersion: snapshot.ruleVersion, nextRuleVersion: rule.version, occurredAt: input.at.toISOString() } };
};
