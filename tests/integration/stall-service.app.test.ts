import { healthResponseSchema } from "@polivo/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/stall-service/src/app.ts";

type StallApp = ReturnType<typeof buildApp>;

const openApps: StallApp[] = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app !== undefined) {
      await app.close();
    }
  }
});

function createApp(): StallApp {
  const app = buildApp();
  openApps.push(app);
  return app;
}

describe("stall-service application boundary", () => {
  it("returns HTTP 200 for GET /health with the shared health contract", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(healthResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({
      service: "polivo-stall-service",
      status: "ok",
    });
  });

  it("returns HTTP 404 for an unknown route", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/does-not-exist",
    });

    expect(response.statusCode).toBe(404);
  });

  it("creates applications without starting a network listener", () => {
    const app = createApp();
    expect(app.server.listening).toBe(false);
  });

  it("creates and closes multiple application instances independently", async () => {
    const first = createApp();
    const second = createApp();

    const firstHealth = await first.inject({ method: "GET", url: "/health" });
    const secondHealth = await second.inject({ method: "GET", url: "/health" });

    expect(firstHealth.statusCode).toBe(200);
    expect(secondHealth.statusCode).toBe(200);

    await first.close();
    openApps.splice(openApps.indexOf(first), 1);

    const secondAfterClose = await second.inject({ method: "GET", url: "/health" });
    expect(secondAfterClose.statusCode).toBe(200);
  });
});
