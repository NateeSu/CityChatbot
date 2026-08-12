export type CookieEnvironment = "local" | "test" | "staging" | "production";

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

export const buildSessionCookieOptions = (
  environment: CookieEnvironment,
  maxAge = 60 * 60 * 8,
): SessionCookieOptions => {
  if (!Number.isInteger(maxAge) || maxAge <= 0) throw new Error("cookie maxAge must be a positive integer");

  return {
    httpOnly: true,
    secure: environment === "staging" || environment === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
};
