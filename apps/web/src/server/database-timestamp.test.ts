import { describe, expect, it } from "vitest";

import { databaseTimestamp, optionalDatabaseTimestamp } from "./database-timestamp";

describe("databaseTimestamp", () => {
  it("normalizes PostgreSQL Date values to canonical ISO strings", () => {
    expect(databaseTimestamp(new Date("2026-08-14T02:13:57.775Z"), "valid_from"))
      .toBe("2026-08-14T02:13:57.775Z");
  });

  it("normalizes timestamp strings with an explicit offset", () => {
    expect(databaseTimestamp("2026-08-14T09:13:57.775+07:00", "valid_from"))
      .toBe("2026-08-14T02:13:57.775Z");
  });

  it("preserves null optional timestamps as undefined", () => {
    expect(optionalDatabaseTimestamp(null, "valid_until")).toBeUndefined();
  });

  it("rejects invalid timestamp values without logging their content", () => {
    expect(() => databaseTimestamp("not-a-timestamp", "valid_from"))
      .toThrow("valid_from contains an invalid database timestamp");
  });
});
