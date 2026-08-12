import { describe, expect, it } from "vitest";

import { buildSessionCookieOptions } from "./cookies";

describe("session cookie policy", () => {
  it("uses HTTP-only, same-site cookies and enables Secure outside local/test", () => {
    expect(buildSessionCookieOptions("local")).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
    expect(buildSessionCookieOptions("staging", 900)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 900,
    });
  });

  it("rejects non-positive or non-integer lifetimes", () => {
    expect(() => buildSessionCookieOptions("production", 0)).toThrow();
    expect(() => buildSessionCookieOptions("production", 1.5)).toThrow();
  });
});
