import assert from "node:assert/strict";

import {
  test
} from "node:test";

import Fastify from "fastify";

import {
  LOCAL_TOKEN_HEADER,
  registerLocalSecurity
} from "../src/security/local-security.js";

const TOKEN = "a".repeat(64);
const ALLOWED_ORIGIN =
  "http://127.0.0.1:5173";

async function buildTestApp() {
  const app = Fastify({
    logger: false
  });

  await registerLocalSecurity(app, {
    token: TOKEN
  });

  app.get("/api/health", async () => ({
    status: "ok"
  }));

  app.get("/api/private", async () => ({
    protected: true
  }));

  return app;
}

test(
  "allows the public health endpoint without a token",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health"
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok"
    });
  }
);

test(
  "rejects a protected endpoint without a token",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/private"
    });

    assert.equal(response.statusCode, 401);
    assert.equal(
      response.json().error,
      "INVALID_LOCAL_TOKEN"
    );
  }
);

test(
  "accepts the correct token without an Origin header",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/private",
      headers: {
        [LOCAL_TOKEN_HEADER]: TOKEN
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      protected: true
    });
  }
);

test(
  "rejects an unauthorized browser origin",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/private",
      headers: {
        origin: "https://example.com",
        [LOCAL_TOKEN_HEADER]: TOKEN
      }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(
      response.json().error,
      "ORIGIN_NOT_ALLOWED"
    );

    assert.equal(
      response.headers[
        "access-control-allow-origin"
      ],
      undefined
    );
  }
);

test(
  "allows the dashboard origin and returns CORS headers",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/private",
      headers: {
        origin: ALLOWED_ORIGIN,
        [LOCAL_TOKEN_HEADER]: TOKEN
      }
    });

    assert.equal(response.statusCode, 200);

    assert.equal(
      response.headers[
        "access-control-allow-origin"
      ],
      ALLOWED_ORIGIN
    );
  }
);

test(
  "answers an allowed CORS preflight",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/private",
      headers: {
        origin: ALLOWED_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers":
          "x-dev-dashboard-token"
      }
    });

    assert.equal(response.statusCode, 204);

    assert.equal(
      response.headers[
        "access-control-allow-origin"
      ],
      ALLOWED_ORIGIN
    );

    assert.match(
      String(
        response.headers[
          "access-control-allow-headers"
        ]
      ).toLowerCase(),
      /x-dev-dashboard-token/
    );
  }
);

test(
  "allows preview origin and PUT preflight for server settings",
  async (context) => {
    const app = await buildTestApp();

    context.after(async () => {
      await app.close();
    });

    const previewOrigin = "http://127.0.0.1:4173";

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/private",
      headers: {
        origin: previewOrigin,
        "access-control-request-method": "PUT",
        "access-control-request-headers":
          "content-type,x-dev-dashboard-token"
      }
    });

    assert.equal(response.statusCode, 204);
    assert.equal(
      response.headers[
        "access-control-allow-origin"
      ],
      previewOrigin
    );
    assert.match(
      String(
        response.headers[
          "access-control-allow-methods"
        ]
      ),
      /PUT/
    );
  }
);
