import cors from "@fastify/cors";

import type {
  FastifyInstance
} from "fastify";

import {
  secureTokenEqual
} from "@dev-dashboard/core";
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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
  sessionSecret?: string;
  localOrigin?: string;
  sessionTtlSeconds?: number;
  now?: () => number;
  allowedOrigins?: readonly string[];
  publicPaths?: readonly string[];
}

const SESSION_COOKIE = 'dev_dashboard_session';
const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookie(value: string | undefined): string | undefined {
  return value?.split(';').map((part) => part.trim().split('=')).find(([name]) => name === SESSION_COOKIE)?.[1];
}

function signSession(secret: string, expiresAt: number, nonce: string): string {
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function validateSession(value: string | undefined, secret: string, now: number): 'valid' | 'expired' | 'invalid' {
  if (!value) return 'invalid';
  const [expiry, nonce, signature] = value.split('.');
  if (!expiry || !nonce || !signature) return 'invalid';
  const expected = createHmac('sha256', secret).update(`${expiry}.${nonce}`).digest('hex');
  const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return 'invalid';
  return Number(expiry) > now ? 'valid' : 'expired';
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
    options.publicPaths ?? ["/api/health", '/api/auth/browser-session']
  );
  const localOrigin = options.localOrigin ?? 'http://127.0.0.1:4343';
  const sessionSecret = options.sessionSecret ?? options.token;
  const ttl = options.sessionTtlSeconds ?? 900;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  app.post('/api/auth/browser-session', {
    schema: { body: { type: 'object', additionalProperties: false } },
  }, async (request, reply) => {
    if (request.headers.origin !== localOrigin || request.headers['content-type']?.split(';')[0] !== 'application/json') {
      return reply.code(403).send({ error: 'BOOTSTRAP_NOT_ALLOWED', message: 'Bootstrap de navegador não permitido.' });
    }
    const expiresAt = now() + ttl;
    const session = signSession(sessionSecret, expiresAt, randomBytes(16).toString('hex'));
    reply.header('Set-Cookie', `${SESSION_COOKIE}=${session}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${ttl}`);
    return reply.code(204).send();
  });

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
    credentials: true,
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

      if (path !== '/api' && !path.startsWith('/api/')) {
        return;
      }

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

      const session = validateSession(parseCookie(request.headers.cookie), sessionSecret, now());
      const cookieAuthorized = session === 'valid';

      if (cookieAuthorized && MUTABLE_METHODS.has(request.method) && origin !== localOrigin) {
        return reply.code(403).send({ error: 'ORIGIN_REQUIRED', message: 'A origem local exata é obrigatória para alterações.' });
      }

      if (
        !cookieAuthorized && !secureTokenEqual(
          candidateToken,
          options.token
        )
      ) {
        return reply.code(401).send({
          error: session === 'expired' ? 'SESSION_EXPIRED' : "INVALID_LOCAL_TOKEN",
          message:
            "O token local está ausente ou é inválido."
        });
      }
    }
  );
}
