import "dotenv/config";
import { z } from "zod";
const boolean = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true");
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/)
    .default("15m"),
  JWT_ISSUER: z.string().default("orbit-api"),
  JWT_AUDIENCE: z.string().default("orbit-web"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  REDIS_URL: z.string().url(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: boolean.default("false"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
  OVERDUE_CRON: z.string().default("0 8 * * *"),
  JOB_TIMEZONE: z.string().default("Asia/Karachi"),
  EMAIL_ENABLED: boolean.default("false"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: boolean.default("false"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM: z.string().default(""),
  ONESIGNAL_ENABLED: boolean.default("false"),
  ONESIGNAL_APP_ID: z.string().default(""),
  ONESIGNAL_REST_API_KEY: z.string().default(""),
  ONESIGNAL_ID_SECRET: z.string().default(""),
  OUTBOX_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(2000),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    "Invalid environment variable(s): " +
      [...new Set(parsed.error.issues.map((i) => i.path[0]))].join(", "),
  );
export const env = parsed.data;
const configured = (value) =>
  value.length > 0 && !/replace[-_ ]|your[-_ ]/i.test(value);
if (
  env.EMAIL_ENABLED &&
  (![env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.EMAIL_FROM].every(
    configured,
  ) ||
    !z.email().safeParse(env.EMAIL_FROM).success)
)
  throw new Error(
    "EMAIL_ENABLED requires real SMTP_HOST, SMTP_USER, SMTP_PASS and an EMAIL_FROM address.",
  );
if (
  env.ONESIGNAL_ENABLED &&
  (!z.uuid().safeParse(env.ONESIGNAL_APP_ID).success ||
    !configured(env.ONESIGNAL_REST_API_KEY) ||
    !configured(env.ONESIGNAL_ID_SECRET) ||
    env.ONESIGNAL_ID_SECRET.length < 32)
)
  throw new Error(
    "ONESIGNAL_ENABLED requires a valid App ID, real API key and a generated ONESIGNAL_ID_SECRET (32+ characters).",
  );
if (
  env.NODE_ENV === "production" &&
  (!env.COOKIE_SECURE || env.JWT_ACCESS_SECRET.includes("replace-with"))
)
  throw new Error(
    "Production requires secure cookies and a generated JWT secret.",
  );
if (env.COOKIE_SAME_SITE === "none" && !env.COOKIE_SECURE)
  throw new Error("SameSite=None requires COOKIE_SECURE=true.");
export const allowedOrigins = env.CORS_ORIGINS.split(",")
  .map((v) => v.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, ""))
  .filter(Boolean);
if (env.NODE_ENV !== "production") {
  if (allowedOrigins.includes("http://localhost:3000") && !allowedOrigins.includes("http://127.0.0.1:3000")) {
    allowedOrigins.push("http://127.0.0.1:3000");
  }
}
if (
  allowedOrigins.some((v) => {
    try {
      return new URL(v).origin !== v;
    } catch {
      return true;
    }
  })
)
  throw new Error("CORS_ORIGINS must contain exact URL origins.");
