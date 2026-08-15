import { describe, expect, it } from "bun:test";
import { createPagination } from "./pagination.ts";

describe("Pagination — Keyset cursor", () => {
  const { createCursor, decodeCursor, getNextCursor } = createPagination({
    secret: "test-secret-for-unit-tests",
    pageSize: 20,
  });

  it("génère un cursor avec un format valide", () => {
    const cursor = createCursor({ value: "2024-01-15T10:00:00Z", id: "abc-123" });
    expect(cursor).toMatch(/^cursor_[a-f0-9]{32}\|2024-01-15T10:00:00Z\|abc-123\.[a-f0-9]{64}$/);
  });

  it("decode correctement un cursor généré", async () => {
    const cursor = createCursor({ value: "2024-01-15T10:00:00Z", id: "550e8400-e29b-41d4-a716-446655440000" });
    const decoded = await decodeCursor(cursor);
    expect(decoded).not.toHaveProperty("code");
    expect((decoded as any).value).toBe("2024-01-15T10:00:00Z");
    expect((decoded as any).id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejette un cursor falsifié", async () => {
    const badCursor = createCursor({ value: "2024-01-15T10:00:00Z", id: "abc" }) + "x";
    const result = await decodeCursor(badCursor);
    expect(result).toHaveProperty("code");
    expect((result as any).code).toBe("INVALID_CURSOR");
  });

  it("rejette un cursor sans préfixe", async () => {
    const result = await decodeCursor("not-a-cursor");
    expect(result).toHaveProperty("code");
  });

  it("getNextCursor convertit un Date en ISO string", async () => {
    const date = new Date("2024-01-15T10:00:00Z");
    const cursor = getNextCursor({ created_at: date, id: "test-id" });
    expect(cursor).toMatch(/^cursor_/);
    const decoded = await decodeCursor(cursor!);
    expect((decoded as any).value).toBe(date.toISOString());
    expect((decoded as any).id).toBe("test-id");
  });

  it("buildQuery génère SQL sans cursor", () => {
    const { buildQuery } = createPagination({ secret: "test", pageSize: 10 });
    const { sql, params } = buildQuery(null, 20);
    expect(sql).toContain("LIMIT $1");
    expect(params).toEqual([20]);
  });

  it("buildQuery génère SQL avec cursor", () => {
    const { buildQuery } = createPagination({ secret: "test", pageSize: 10 });
    const cursor = { value: "2024-01-15T10:00:00Z", id: "abc-123" };
    const { sql, params } = buildQuery(cursor, 5);
    expect(sql).toContain("WHERE (created_at, id) < ($1, $2)");
    expect(params).toEqual(["2024-01-15T10:00:00Z", "abc-123", 6]);
  });

  it("utilise pageSize par défaut si pas de limit", () => {
    const { buildQuery } = createPagination({ secret: "test", pageSize: 15 });
    const { params } = buildQuery(null, 0);
    expect(params).toEqual([15]);
  });
});
