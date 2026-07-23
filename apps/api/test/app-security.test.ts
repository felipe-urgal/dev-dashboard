import assert from "node:assert/strict";

import {
  test
} from "node:test";

import {
  buildApp
} from "../src/app.js";

const TOKEN = "b".repeat(64);

test(
  "protects the application routes",
  async (context) => {
    const app = await buildApp({
      localToken: TOKEN
    });

    context.after(async () => {
      await app.close();
    });

    const healthResponse = await app.inject({
      method: "GET",
      url: "/api/health"
    });

    assert.equal(
      healthResponse.statusCode,
      200
    );

    const unauthorizedResponse =
      await app.inject({
        method: "GET",
        url: "/api/workspaces"
      });

    assert.equal(
      unauthorizedResponse.statusCode,
      401
    );

    const authorizedResponse =
      await app.inject({
        method: "GET",
        url: "/api/workspaces",
        headers: {
          "x-dev-dashboard-token": TOKEN
        }
      });

    assert.equal(
      authorizedResponse.statusCode,
      200
    );
  }
);
