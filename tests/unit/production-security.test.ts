import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { config as adminLoginLimit } from "../../netlify/edge-functions/rate-limit-admin-login";
import { config as registrationLimit } from "../../netlify/edge-functions/rate-limit-registration";

describe("production security configuration", () => {
  it("limite les créations de session sensibles par domaine et adresse IP", () => {
    expect(adminLoginLimit).toMatchObject({
      path: "/api/admin/login",
      method: "POST",
      rateLimit: {
        aggregateBy: ["domain", "ip"],
        windowLimit: 8,
        windowSize: 180,
      },
    });
    expect(registrationLimit).toMatchObject({
      path: "/api/register",
      method: "POST",
      rateLimit: {
        aggregateBy: ["domain", "ip"],
        windowLimit: 1_500,
        windowSize: 60,
      },
    });
  });

  it("applique les en-têtes défensifs à toutes les routes", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(
      rules?.[0]?.headers.map(({ key, value }) => [key, value]),
    );

    expect(rules?.[0]?.source).toBe("/:path*");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
