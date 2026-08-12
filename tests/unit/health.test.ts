import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/health/route";

describe("GET /api/health", () => {
  it("retourne un statut minimal sans information sensible", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      service: "meste-heritage-congo",
      status: "ok",
    });
  });
});
