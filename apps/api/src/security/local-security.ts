import cors from '@fastify/cors';

import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ApiErrorCode } from '../http/api-error.js';
import {
  apiErrorResponseSchema,
  emptyResponseSchema,
} from '../http/response-schemas.js';

import { secureTokenEqual } from '@dev-dashboard/core';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const LOCAL_TOKEN_HEADER = 'x-dev-dashboard-token';

export const BROWSER_BOOTSTRAP_HEADER = 'x-dev-dashboard-browser-bootstrap';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:4343',
  'http://localhost:4343',
] as const;

export interface LocalSecurityOptions {
  token: string;
  sessionSecret?: string;
  browserBootstrapToken?: string;
  localOrigin?: string;
  sessionTtlSeconds?: number;
  now?: () => number;
  allowedOrigins?: readonly string[];
}

const SESSION_COOKIE = 'dev_dashboard_session';
const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookie(value: string | undefined): string | undefined {
  return value
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE)?.[1];
}

function signSession(secret: string, expiresAt: number, nonce: string): string {
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function validateSession(
  value: string | undefined,
  secret: string,
  now: number,
): 'valid' | 'expired' | 'invalid' {
  if (!value) return 'invalid';
  const [expiry, nonce, signature] = value.split('.');
  if (!expiry || !nonce || !signature) return 'invalid';
  const expected = createHmac('sha256', secret)
    .update(`${expiry}.${nonce}`)
    .digest('hex');
  const valid =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return 'invalid';
  return Number(expiry) > now ? 'valid' : 'expired';
}

/**
 * Deriva a chave de assinatura de sessão a partir do token de autenticação
 * quando nenhum `sessionSecret` explícito é configurado. Não reutiliza o
 * token diretamente como chave HMAC: uma PRF com rótulo de domínio distinto
 * mantém os dois usos (comparação de token vs. assinatura de cookie de
 * sessão) criptograficamente independentes, mesmo derivando do mesmo
 * segredo armazenado.
 */
function deriveSessionSecret(token: string): string {
  return createHmac('sha256', token)
    .update('dev-dashboard:session-secret:v1')
    .digest('hex');
}

/**
 * Responde um erro local no mesmo formato de `ApiError`
 * (`{ error, message }`), mas tipando `code` contra `ApiErrorCode` — este
 * módulo roda antes de `registerApiErrorHandling` estar necessariamente
 * registrado (é testado de forma isolada, só com Fastify puro), então não
 * pode depender de lançar `ApiError` e contar com o error handler global
 * da aplicação; o ganho de tipo é obtido sem essa dependência.
 */
function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
) {
  return reply.code(statusCode).send({ error: code, message });
}

function requestPath(url: string): string {
  return url.split('?', 1)[0] ?? url;
}

function headerToken(
  header: string | string[] | undefined,
): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

export async function registerLocalSecurity(
  app: FastifyInstance,
  options: LocalSecurityOptions,
): Promise<void> {
  const allowedOrigins = new Set(
    options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
  );
  const localOrigin = options.localOrigin ?? 'http://127.0.0.1:4343';
  allowedOrigins.add(localOrigin);
  const sessionSecret =
    options.sessionSecret ?? deriveSessionSecret(options.token);
  const browserBootstrapToken =
    options.browserBootstrapToken ?? randomBytes(32).toString('hex');
  const ttl = options.sessionTtlSeconds ?? 900;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  app.post(
    '/api/auth/browser-session',
    {
      schema: {
        body: { type: 'object', additionalProperties: false },
        response: {
          204: emptyResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (
        request.headers.origin !== localOrigin ||
        request.headers['content-type']?.split(';')[0] !== 'application/json'
      ) {
        return sendApiError(
          reply,
          403,
          'BOOTSTRAP_NOT_ALLOWED',
          'Bootstrap de navegador não permitido.',
        );
      }
      const expiresAt = now() + ttl;
      const session = signSession(
        sessionSecret,
        expiresAt,
        randomBytes(16).toString('hex'),
      );
      reply.header(
        'Set-Cookie',
        `${SESSION_COOKIE}=${session}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${ttl}`,
      );
      return reply.code(204).send();
    },
  );

  await app.register(cors, {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Dev-Dashboard-Token'],
    credentials: true,
    maxAge: 600,
    strictPreflight: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const path = requestPath(request.url);

    if (path !== '/api' && !path.startsWith('/api/')) {
      return;
    }

    if (path === '/api/health') {
      return;
    }

    if (path === '/api/auth/browser-session') {
      const bootstrapCandidate = headerToken(
        request.headers[BROWSER_BOOTSTRAP_HEADER],
      );
      const candidateToken = headerToken(request.headers[LOCAL_TOKEN_HEADER]);

      if (
        !secureTokenEqual(bootstrapCandidate, browserBootstrapToken) &&
        !secureTokenEqual(candidateToken, options.token)
      ) {
        return sendApiError(
          reply,
          401,
          'INVALID_BROWSER_BOOTSTRAP',
          'A capacidade de bootstrap está ausente ou é inválida.',
        );
      }

      return;
    }

    const originHeader = request.headers.origin;
    const origin = headerToken(originHeader);

    if (
      originHeader !== undefined &&
      (origin === undefined || !allowedOrigins.has(origin))
    ) {
      return sendApiError(
        reply,
        403,
        'ORIGIN_NOT_ALLOWED',
        'A origem da requisição não é permitida.',
      );
    }

    const candidateToken = headerToken(request.headers[LOCAL_TOKEN_HEADER]);

    const session = validateSession(
      parseCookie(request.headers.cookie),
      sessionSecret,
      now(),
    );
    const cookieAuthorized = session === 'valid';

    if (
      cookieAuthorized &&
      MUTABLE_METHODS.has(request.method) &&
      origin !== localOrigin
    ) {
      return sendApiError(
        reply,
        403,
        'ORIGIN_REQUIRED',
        'A origem local exata é obrigatória para alterações.',
      );
    }

    if (!cookieAuthorized && !secureTokenEqual(candidateToken, options.token)) {
      return sendApiError(
        reply,
        401,
        session === 'expired' ? 'SESSION_EXPIRED' : 'INVALID_LOCAL_TOKEN',
        'O token local está ausente ou é inválido.',
      );
    }
  });
}
