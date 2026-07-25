import cors from "@fastify/cors";

import type {
  FastifyInstance
} from "fastify";

import {
  secureTokenEqual
} from "@dev-dashboard/core";

export const LOCAL_TOKEN_HEADER =
  "x-dev-dashboard-token";

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
] as const;

export interface LocalSecurityOptions {
  token: string;
  allowedOrigins?: readonly string[];
  publicPaths?: readonly string[];
}

function requestPath(url: string): string {
  return url.split("?", 1)[0] ?? url;
}

function headerToken(
  header: string | string[] | undefined
): string | undefined {
  return typeof header === "string"
    ? header
    : undefined;
}

export async function registerLocalSecurity(
  app: FastifyInstance,
  options: LocalSecurityOptions
): Promise<void> {
  const allowedOrigins = new Set(
    options.allowedOrigins ??
      DEFAULT_ALLOWED_ORIGINS
  );

  const publicPaths = new Set(
    options.publicPaths ?? ["/api/health"]
  );

  await app.register(cors, {
    origin: [...allowedOrigins],
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "X-Dev-Dashboard-Token"
    ],
    credentials: false,
    maxAge: 600,
    strictPreflight: true
  });

  app.addHook(
    "onRequest",
    async (request, reply) => {
      if (request.method === "OPTIONS") {
        return;
      }

      const path = requestPath(request.url);

      if (publicPaths.has(path)) {
        return;
      }

      const originHeader = request.headers.origin;
      const origin = headerToken(originHeader);

      if (
        originHeader !== undefined &&
        (origin === undefined || !allowedOrigins.has(origin))
      ) {
        return reply.code(403).send({
          error: "ORIGIN_NOT_ALLOWED",
          message:
            "A origem da requisição não é permitida."
        });
      }

      const candidateToken = headerToken(
        request.headers[LOCAL_TOKEN_HEADER]
      );

      if (
        !secureTokenEqual(
          candidateToken,
          options.token
        )
      ) {
        return reply.code(401).send({
          error: "INVALID_LOCAL_TOKEN",
          message:
            "O token local está ausente ou é inválido."
        });
      }
    }
  );
}
