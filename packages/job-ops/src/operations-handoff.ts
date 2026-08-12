import { posix as posixPath } from "node:path";

export type HandoffDocument = {
  id: string;
  path: string;
  version: string;
  owner: string;
  required: boolean;
  links: readonly string[];
};

export type HandoffRunbookStep = {
  id: string;
  command: string;
  rollbackCommand: string;
};

export type HandoffRunbook = {
  id: string;
  owner: string;
  steps: readonly HandoffRunbookStep[];
};

export type HandoffAsset = {
  id: string;
  category: "DATABASE" | "HOSTING" | "LINE_CHANNEL" | "WEBHOOK" | "MIGRATION" | "ROLLBACK" | "OBSERVABILITY";
  environment: "production" | "preview" | "local";
  owner: string;
  reference: string;
  secretRef: boolean;
};

export type HandoffConfigContract = {
  environment: "production" | "preview" | "local";
  configuredKeys: readonly string[];
  secretReferences: Readonly<Record<string, string>>;
  featureDefaults: Readonly<Record<string, boolean>>;
};

export type HandoffValidation = {
  status: "COMPLETE" | "INCOMPLETE";
  errors: readonly string[];
  warnings: readonly string[];
};

export type OperationsHandoffInput = {
  repositoryFiles: readonly string[];
  documents: readonly HandoffDocument[];
  runbooks: readonly HandoffRunbook[];
  assets: readonly HandoffAsset[];
  config: HandoffConfigContract;
};

export class OperationsHandoffError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "OperationsHandoffError";
  }
}

export const REQUIRED_PRODUCTION_KEYS = [
  "DATABASE_URL",
  "TENANT_CREDENTIAL_KEY",
  "TENANT_CREDENTIAL_KEY_VERSION",
  "LINE_WEBHOOK_HASH_SECRET",
  "LINE_USER_HASH_SECRET",
  "LINE_WORKER_SECRET",
  "LINE_CHAT_RUNTIME_ENABLED",
] as const;

export const REQUIRED_ASSET_CATEGORIES: readonly HandoffAsset["category"][] = ["DATABASE", "HOSTING", "LINE_CHANNEL", "WEBHOOK", "MIGRATION", "ROLLBACK", "OBSERVABILITY"];

const SECRET_PATTERN = /(sk-or-v1-|service_role|password\s*=|secret\s*=|authorization\s*[:=]|bearer\s+[a-z0-9._-]{16,})/i;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const REFERENCE_PATTERN = /^(env|vault|vercel|supabase|line|git|file):[A-Za-z0-9._:/-]{2,255}$/;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const hasAll = <T extends string>(values: readonly T[], required: readonly T[]): boolean => required.every((value) => values.includes(value));

const validateDocuments = (input: OperationsHandoffInput): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  const files = new Set(input.repositoryFiles);
  for (const document of input.documents) {
    if (!DOCUMENT_ID_PATTERN.test(document.id) || ids.has(document.id)) errors.push(`DOCUMENT_ID_INVALID:${document.id}`);
    ids.add(document.id);
    if (!files.has(document.path)) errors.push(`DOCUMENT_MISSING:${document.path}`);
    if (!document.version.trim() || !document.owner.trim()) errors.push(`DOCUMENT_METADATA_MISSING:${document.id}`);
    for (const link of document.links) {
      if (SECRET_PATTERN.test(link)) errors.push(`DOCUMENT_SECRET_LINK:${document.id}`);
      if (/^(https?:|mailto:)/i.test(link)) continue;
      const target = link.split("#", 1)[0] ?? "";
      const normalized = posixPath.normalize(posixPath.join(posixPath.dirname(document.path), target));
      if (!files.has(normalized)) errors.push(`DOCUMENT_LINK_MISSING:${document.id}:${link}`);
    }
  }
  if (!input.documents.some((document) => document.required)) errors.push("DOCUMENT_REQUIRED_SET_EMPTY");
  return errors;
};

const validateRunbooks = (runbooks: readonly HandoffRunbook[]): string[] => {
  const errors: string[] = [];
  const runbookIds = new Set<string>();
  for (const runbook of runbooks) {
    if (!DOCUMENT_ID_PATTERN.test(runbook.id) || runbookIds.has(runbook.id)) errors.push(`RUNBOOK_ID_INVALID:${runbook.id}`);
    runbookIds.add(runbook.id);
    if (!runbook.owner.trim() || runbook.steps.length === 0) errors.push(`RUNBOOK_METADATA_MISSING:${runbook.id}`);
    const stepIds = new Set<string>();
    for (const step of runbook.steps) {
      if (!DOCUMENT_ID_PATTERN.test(step.id) || stepIds.has(step.id)) errors.push(`RUNBOOK_STEP_INVALID:${runbook.id}:${step.id}`);
      stepIds.add(step.id);
      if (!step.command.trim() || !step.rollbackCommand.trim()) errors.push(`RUNBOOK_ROLLBACK_MISSING:${runbook.id}:${step.id}`);
      if (SECRET_PATTERN.test(`${step.command}\n${step.rollbackCommand}`)) errors.push(`RUNBOOK_SECRET_LITERAL:${runbook.id}:${step.id}`);
      if (/git\s+(reset\s+--hard|checkout\s+--)|rm\s+-rf|format\s+c:/i.test(`${step.command}\n${step.rollbackCommand}`)) errors.push(`RUNBOOK_DESTRUCTIVE_COMMAND:${runbook.id}:${step.id}`);
    }
  }
  return errors;
};

const validateAssets = (assets: readonly HandoffAsset[]): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const asset of assets) {
    if (!DOCUMENT_ID_PATTERN.test(asset.id) || ids.has(asset.id)) errors.push(`ASSET_ID_INVALID:${asset.id}`);
    ids.add(asset.id);
    if (!asset.owner.trim() || !asset.reference.trim()) errors.push(`ASSET_METADATA_MISSING:${asset.id}`);
    if (asset.secretRef && !REFERENCE_PATTERN.test(asset.reference)) errors.push(`ASSET_SECRET_REFERENCE_INVALID:${asset.id}`);
    if (SECRET_PATTERN.test(asset.reference)) errors.push(`ASSET_SECRET_LITERAL:${asset.id}`);
  }
  const productionCategories = assets.filter((asset) => asset.environment === "production").map((asset) => asset.category);
  for (const category of REQUIRED_ASSET_CATEGORIES) if (!productionCategories.includes(category)) errors.push(`ASSET_CATEGORY_MISSING:${category}`);
  return errors;
};

const validateConfig = (config: HandoffConfigContract): string[] => {
  const errors: string[] = [];
  if (config.environment !== "production") errors.push("CONFIG_ENVIRONMENT_NOT_PRODUCTION");
  if (!hasAll(config.configuredKeys, REQUIRED_PRODUCTION_KEYS)) errors.push("CONFIG_REQUIRED_KEY_MISSING");
  for (const key of REQUIRED_PRODUCTION_KEYS.filter((candidate) => candidate !== "LINE_CHAT_RUNTIME_ENABLED")) {
    const reference = config.secretReferences[key];
    if (!reference || !REFERENCE_PATTERN.test(reference)) errors.push(`CONFIG_SECRET_REFERENCE_INVALID:${key}`);
  }
  if (config.featureDefaults.ai_chat_enabled !== false) errors.push("CONFIG_AI_CHAT_MUST_DEFAULT_OFF");
  if (SECRET_PATTERN.test(JSON.stringify(config))) errors.push("CONFIG_SECRET_LITERAL");
  return errors;
};

export class OperationsHandoffRegistry {
  validate(input: OperationsHandoffInput): HandoffValidation {
    const errors = [...validateDocuments(input), ...validateRunbooks(input.runbooks), ...validateAssets(input.assets), ...validateConfig(input.config)];
    return { status: errors.length === 0 ? "COMPLETE" : "INCOMPLETE", errors, warnings: input.config.featureDefaults.ai_chat_enabled === false ? ["AI_CHAT_DEFAULTS_FAIL_CLOSED"] : [] };
  }

  assertComplete(input: OperationsHandoffInput): HandoffValidation {
    const result = this.validate(input);
    if (result.status !== "COMPLETE") throw new OperationsHandoffError("HANDOFF_INCOMPLETE", result.errors.join(","));
    return clone(result);
  }
}
