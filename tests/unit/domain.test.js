import { describe, test, expect } from "@jest/globals";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { password, day } from "../../src/utils/schema.js";
import { taskCreate, taskUpdate } from "../../src/modules/tasks/task.schema.js";
import { assertTransition } from "../../src/modules/tasks/task.service.js";
import { taskScope, teamScope } from "../../src/middleware/authorize.js";
import {
  newRefreshToken,
  tokenHash,
  signAccessToken,
  verifyAccessToken,
} from "../../src/modules/auth/auth.token.js";
import { env } from "../../src/config/env.js";
describe("validation", () => {
  test.each([
    "short",
    "alllowercase123!",
    "ONLYUPPER123!",
    "NoNumberPassword!",
    "NoSymbolPassword123",
  ])("rejects weak password %s", (value) =>
    expect(password.safeParse(value).success).toBe(false),
  );
  test("checks bcrypt byte limits", () =>
    expect(password.safeParse("Aa1!" + "é".repeat(40)).success).toBe(false));
  test("rejects nonexistent dates", () =>
    expect(day.safeParse("2026-02-31").success).toBe(false));
  test("requires version and prevents protected task fields", () => {
    expect(taskUpdate.safeParse({ title: "Updated task" }).success).toBe(false);
    expect(
      taskCreate.safeParse({
        title: "New task",
        projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        assigneeId: "33333333-3333-4333-8333-333333333333",
        dueDate: "2026-10-01",
        estimatedHours: 4,
        createdBy: "spoof",
      }).success,
    ).toBe(false);
  });
});
describe("authentication primitives", () => {
  test("bcrypt hashes are salted and verify correctly", async () => {
    const [a, b] = await Promise.all([
      bcrypt.hash("TestPassword123!", 10),
      bcrypt.hash("TestPassword123!", 10),
    ]);
    expect(a).not.toBe(b);
    expect(await bcrypt.compare("TestPassword123!", a)).toBe(true);
    expect(await bcrypt.compare("wrong", a)).toBe(false);
  });
  test("refresh secrets are random and hashed", () => {
    const a = newRefreshToken();
    expect(a).not.toBe(newRefreshToken());
    expect(tokenHash(a)).not.toBe(a);
    expect(tokenHash(a)).toHaveLength(64);
  });
  test("JWT has issuer/audience/session; no client role authority", () => {
    const token = signAccessToken(
      { id: "11111111-1111-4111-8111-111111111111", tokenVersion: 1 },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const payload = verifyAccessToken(token);
    expect(payload.iss).toBe(env.JWT_ISSUER);
    expect(payload.sid).toBeTruthy();
    expect(payload.role).toBeUndefined();
  });
  test("expired JWTs are rejected", () => {
    const token = jwt.sign({}, env.JWT_ACCESS_SECRET, {
      expiresIn: -1,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    expect(() => verifyAccessToken(token)).toThrow();
  });
});
describe("RBAC and status rules", () => {
  test("employee queries are restricted to assignee", () =>
    expect(taskScope({ id: "me", role: "EMPLOYEE" })).toEqual({
      assigneeId: "me",
    }));
  test("manager scopes follow managed teams", () =>
    expect(teamScope({ id: "manager", role: "MANAGER" })).toEqual({
      managerId: "manager",
    }));
  test("employee can submit review but cannot approve completion", () => {
    expect(() =>
      assertTransition("EMPLOYEE", "IN_PROGRESS", "IN_REVIEW"),
    ).not.toThrow();
    expect(() =>
      assertTransition("EMPLOYEE", "IN_REVIEW", "COMPLETED"),
    ).toThrow();
  });
  test("manager approves completion and can reopen", () => {
    expect(() =>
      assertTransition("MANAGER", "IN_REVIEW", "COMPLETED"),
    ).not.toThrow();
    expect(() =>
      assertTransition("ADMIN", "COMPLETED", "IN_PROGRESS"),
    ).not.toThrow();
  });
  test("invalid status jump is rejected", () =>
    expect(() => assertTransition("ADMIN", "TODO", "COMPLETED")).toThrow());
});
