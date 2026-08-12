import { z } from "zod";

const environmentSchema = z.enum(["local", "test", "staging", "production"]);

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CITYCHATBOT_ENV: environmentSchema.default("local"),
    APP_BASE_URL: z.string().url().optional(),
    TENANT_ID: z.string().uuid().optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).optional(),
    DATABASE_URL: z.string().url().optional(),
    LINE_WEBHOOK_HASH_SECRET: z.string().min(32).optional(),
    CSRF_SECRET: z.string().min(32).optional(),
    TENANT_CREDENTIAL_KEY: z.string().min(32).optional(),
    TENANT_CREDENTIAL_KEY_VERSION: z.string().min(1).optional(),
    LIFF_SESSION_SECRET: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    if (value.CITYCHATBOT_ENV === "production" && !value.APP_BASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL is required outside local/test environments",
      });
    }
    if (value.TENANT_CREDENTIAL_KEY && !value.TENANT_CREDENTIAL_KEY_VERSION) {
      context.addIssue({
        code: "custom",
        path: ["TENANT_CREDENTIAL_KEY_VERSION"],
        message: "TENANT_CREDENTIAL_KEY_VERSION is required when credential encryption is enabled",
      });
    }
    if (value.CITYCHATBOT_ENV === "production" && !value.LIFF_SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["LIFF_SESSION_SECRET"],
        message: "LIFF_SESSION_SECRET is required outside local/test environments",
      });
    }
    const lineDependencies = [value.DATABASE_URL, value.LINE_WEBHOOK_HASH_SECRET, value.TENANT_CREDENTIAL_KEY];
    if ((value.DATABASE_URL || value.LINE_WEBHOOK_HASH_SECRET) && !lineDependencies.every(Boolean)) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL, LINE_WEBHOOK_HASH_SECRET and TENANT_CREDENTIAL_KEY must be configured together",
      });
    }
  });

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: environmentSchema.default("local"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function formatValidationError(error: z.ZodError): string {
  const fields = error.issues.map((issue) => issue.path.join(".") || "environment");
  return `Invalid environment configuration: ${[...new Set(fields)].join(", ")}`;
}

export function parseServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatValidationError(result.error));
  }
  return result.data;
}

export function parsePublicEnv(input: NodeJS.ProcessEnv = process.env): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatValidationError(result.error));
  }
  return result.data;
}
