import { describe, expect, it } from "vitest";

import { getServerEnv } from "../../src/lib/env/server";

const validEnv = {
  DATABASE_URL: "postgresql://user:password@example-pooler.neon.tech/database",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "session-secret-with-at-least-32-characters",
  ADMIN_AUTH_SECRET: "admin-secret-with-at-least-32-characters",
};

describe("getServerEnv", () => {
  it("valide les variables serveur attendues", () => {
    expect(getServerEnv(validEnv)).toMatchObject(validEnv);
  });

  it("refuse une configuration incomplète sans afficher de valeur", () => {
    expect(() => getServerEnv({ APP_URL: "http://localhost:3000" })).toThrow(
      /DATABASE_URL/,
    );
  });
});
