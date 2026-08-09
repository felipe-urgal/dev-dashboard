Warning: truncated output (original token count: 95502)
Total output lines: 17836

# Referência da API HTTP local

> Documento gerado automaticamente por `scripts/generate-api-docs.mjs` a partir dos JSON
> Schemas declarados nas rotas Fastify (`apps/api/src/routes/*.ts`) e dos schemas de resposta
> compartilhados em `apps/api/src/http/response-schemas.ts`. **Não edite este arquivo à mão** —
> rode `npm run docs:api` depois de alterar uma rota. `npm run docs:api:check` falha se este
> arquivo estiver desatualizado em relação ao código.

Todas as rotas abaixo (exceto `GET /api/health`) exigem o header `X-Dev-Dashboard-Token` com o
token local persistido em `~/.config/dev-dashboard/api-token`. Veja
`docs/architecture/security.md` para o modelo de segurança completo.

## Erros comuns

A maioria das rotas pode responder com o formato de erro padrão da API
(`apps/api/src/http/api-error.ts`) nos códigos 400, 401, 403, 404, 409 e/ou 500 — o schema é
sempre o mesmo:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "error",
    "message"
  ],
  "properties": {
    "error": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "details": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "message"
        ],
        "properties": {
          "path": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

Abaixo, cada rota referencia este formato como "erro padrão da API" em vez de repetir o schema.

## Activities

### `GET /api/activities`

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "projectId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "origin": {
      "type": "string",
      "enum": [
        "script",
        "test",
        "server"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "unknown"
      ]
    },
    "search": {
      "type": "string",
      "maxLength": 200
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "activities"
    ],
    "properties": {
      "activities": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "summary"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
                  ],
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "projectId": {
                      "type": "string"
                    },
                    "workspaceId": {
                      "type": "string"
                    },
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "script"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "executionId",
                        "actionId"
                      ],
                      "properties": {
                        "executionId": {
                          "type": "string"
                        },
                        "actionId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
                  ],
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "projectId": {
                      "type": "string"
                    },
                    "workspaceId": {
                      "type": "string"
                    },
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "test"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "processId"
                      ],
                      "properties": {
                        "processId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
                  ],
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "projectId": {
                      "type": "string"
                    },
                    "workspaceId": {
                      "type": "string"
                    },
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "server"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "processId"
                      ],
                      "properties": {
                        "processId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              ]
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "totalPages": {
            "type": "integer"
          },
          "summary": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "running",
              "succeeded",
              "failed",
              "total"
            ],
            "properties": {
              "running": {
                "type": "integer",
                "minimum": 0
              },
              "succeeded": {
                "type": "integer",
                "minimum": 0
              },
              "failed": {
                "type": "integer",
                "minimum": 0
              },
              "total": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Ai Assistant

### `POST /api/projects/:projectId/ai/chat`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model",
    "messages"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "messages": {
      "type": "array",
      "minItems": 1,
      "maxItems": 40,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "role",
          "content"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant",
              "system"
            ]
          },
          "content": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8000
          }
        }
      }
    }
  }
}
```

### `POST /api/projects/:projectId/ai/complete`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model",
    "prefix"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "prefix": {
      "type": "string",
      "maxLength": 4000
    },
    "suffix": {
      "type": "string",
      "maxLength": 1000
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "text"
    ],
    "properties": {
      "text": {
        "type": "string"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/ai/models/pull`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "model"
  ],
  "properties": {
    "model": {
      "type": "string",
      "enum": [
        "qwen2.5-coder:7b",
        "qwen2.5-coder:14b",
        "devstral:24b"
      ]
    }
  }
}
```

### `GET /api/projects/:projectId/ai/status`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "available",
      "models",
      "message"
    ],
    "properties": {
      "available": {
        "type": "boolean"
      },
      "baseUrl": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "models": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "capabilities"
          ],
          "properties": {
            "name": {
              "type": "string"
            },
            "capabilities": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "chat",
                  "tools",
                  "fill-in-the-middle"
                ]
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Bundler

### `GET /api/projects/:projectId/bundler`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "bundler"
    ],
    "properties": {
      "bundler": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "outdated"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "check": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "satisfied",
              "message"
            ],
            "properties": {
              "satisfied": {
                "type": "boolean"
              },
              "message": {
                "type": "string"
              }
            }
          },
          "outdated": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "installed",
                "newest"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "installed": {
                  "type": "string"
                },
                "newest": {
                  "type": "string"
                },
                "requested": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Database

### `GET /api/projects/:projectId/database`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10000
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "database"
    ],
    "properties": {
      "database": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "environments",
          "page",
          "pageSize",
          "total"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "environments": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "environment",
                "driver",
                "passwordConfigured",
                "source",
                "sourceDetail",
                "reachability",
                "serviceAvailable"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "environment": {
                  "type": "string"
                },
                "driver": {
                  "type": "string"
                },
                "host": {
                  "type": "string"
                },
                "port": {
                  "type": "integer"
                },
                "database": {
                  "type": "string"
                },
                "username": {
                  "type": "string"
                },
                "passwordConfigured": {
                  "type": "boolean"
                },
                "maskedUrl": {
                  "type": "string"
                },
                "source": {
                  "type": "string",
                  "enum": [
                    "rails-database-yml",
                    "dotenv",
                    "prisma",
                    "knex"
                  ]
                },
                "sourceDetail": {
                  "type": "string"
                },
                "reachability": {
                  "type": "string",
                  "enum": [
                    "reachable",
                    "unreachable",
                    "unknown"
                  ]
                },
                "serviceAvailable": {
                  "type": "boolean"
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/restart`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/reveal`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "secret"
    ],
    "properties": {
      "secret": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "databaseUrl"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "databaseUrl": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/stop`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/database/snapshots`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "snapshots"
    ],
    "properties": {
      "snapshots": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "snapshots",
          "total",
          "retentionLimit",
          "supportedEnvironmentIds"
        ],
        "properties": {
          "snapshots": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "environmentId",
                "environment",
                "driver",
                "database",
                "label",
                "createdAt",
                "sizeBytes"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "environmentId": {
                  "type": "string"
                },
                "environment": {
                  "type": "string"
                },
                "driver": {
                  "type": "string",
                  "enum": [
                    "mysql",
                    "postgresql"
                  ]
                },
                "database": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                },
                "createdAt": {
                  "type": "string"
                },
                "sizeBytes": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "retentionLimit": {
            "type": "integer",
            "minimum": 1
          },
          "supportedEnvironmentIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "environmentId"
  ],
  "properties": {
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "environmentId",
          "environment",
          "driver",
          "database",
          "label",
          "createdAt",
          "sizeBytes"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "environmentId": {
            "type": "string"
          },
          "environment": {
            "type": "string"
          },
          "driver": {
            "type": "string",
            "enum": [
              "mysql",
              "postgresql"
            ]
          },
          "database": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "createdAt": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "snapshotId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "snapshotId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "confirmationToken"
  ],
  "properties": {
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "restore"
    ],
    "properties": {
      "restore": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "snapshotId",
          "restored"
        ],
        "properties": {
          "snapshotId": {
            "type": "string"
          },
          "restored": {
            "type": "boolean"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore/confirmation`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "snapshotId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "snapshotId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "snapshotId",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "snapshotId": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Directories

### `GET /api/directories`

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "rootPath",
      "currentPath",
      "parentPath",
      "directories"
    ],
    "properties": {
      "rootPath": {
        "type": "string"
      },
      "currentPath": {
        "type": "string"
      },
      "parentPath": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "directories": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "path"
          ],
          "properties": {
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Branch Delete

### `POST /api/projects/:projectId/git/branches/delete`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "branch",
    "confirmationToken"
  ],
  "properties": {
    "branch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/delete/confirmations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "branch"
  ],
  "properties": {
    "branch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "operation",
          "target",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "delete-branch"
            ]
          },
          "target": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Branch Rename

### `POST /api/projects/:projectId/git/branches/rename`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currentName",
    "nextName",
    "confirmationToken"
  ],
  "properties": {
    "currentName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "nextName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/rename/confirmations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currentName",
    "nextName"
  ],
  "properties": {
    "currentName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "nextName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "operation",
          "currentName",
          "nextName",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "rename-branch"
            ]
          },
          "currentName": {
            "type": "string"
          },
          "nextName": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Commit Details

### `GET /api/projects/:projectId/git/commits`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "ref": {
      "type": "string",
      "minLength": 1,
      "maxLength": 250,
      "pattern": "^(?!-)[^\\u0000-\\u001F\\u007F]+$"
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 10
    },
    "search": {
      "type": "string",
      "maxLength": 200
    },
    "author": {
      "type": "string",
      "maxLength": 320
    },
    "kind": {
      "type": "string",
      "enum": [
        "all",
        "regular",
        "merge"
      ],
      "default": "all"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "commits"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "page": {
            "type": "integer",
            "minimum": 1
          },
          "pageSize": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "totalPages": {
            "type": "integer",
            "minimum": 0
          },
          "commits": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "hash",
                "shortHash",
                "subject",
                "authorName",
                "authorEmail",
                "authoredAt",
                "parentCount"
              ],
              "properties": {
                "hash": {
                  "type": "string"
                },
                "shortHash": {
                  "type": "string"
                },
                "subject": {
                  "type": "string"
                },
                "authorName": {
                  "type": "string"
                },
                "authorEmail": {
                  "type": "string"
                },
                "authoredAt": {
                  "type": "string"
                },
                "parentCount": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/commits/:commitHash`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commitHash"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commitHash": {
      "type": "string",
      "minLength": 7,
      "maxLength": 40,
      "pattern": "^[0-9a-fA-F]+$"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "detail"
    ],
    "properties": {
      "detail": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject",
          "body",
          "authorName",
          "authorEmail",
          "authoredAt",
          "files",
          "additions",
          "deletions",
          "patch",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "shortHash": {
            "type": "string"
          },
          "subject": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "authorName": {
            "type": "string"
          },
          "authorEmail": {
            "type": "string"
          },
          "authoredAt": {
            "type": "string"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "status",
                "additions",
                "deletions",
                "binary"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "previousPath": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "added",
                    "modified",
                    "deleted",
                    "renamed",
                    "copied",
                    "type-changed"
                  ]
                },
                "additions": {
                  "type": "integer",
                  "minimum": 0
                },
                "deletions": {
                  "type": "integer",
                  "minimum": 0
                },
                "binary": {
                  "type": "boolean"
                }
              }
            }
          },
          "additions": {
            "type": "integer",
            "minimum": 0
          },
          "deletions": {
            "type": "integer",
            "minimum": 0
          },
          "patch": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/commits/:commitHash/file`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commitHash"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commitHash": {
      "type": "string",
      "minLength": 7,
      "maxLength": 40,
      "pattern": "^[0-9a-fA-F]+$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "path",
          "status",
          "binary",
          "content",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "added",
              "modified",
              "deleted",
              "renamed",
              "copied",
              "type-changed"
            ]
          },
          "binary": {
            "type": "boolean"
          },
          "content": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Current Branch History

### `GET /api/projects/:projectId/git/current-branch-commits`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "default": 10
    },
    "search": {
      "type": "string",
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "commits"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "page": {
            "type": "integer",
            "minimum": 1
          },
          "pageSize": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "totalPages": {
            "type": "integer",
            "minimum": 0
          },
          "commits": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "hash",
                "shortHash",
                "subject",
                "authorName",
                "authorEmail",
                "authoredAt",
                "parentCount"
              ],
              "properties": {
                "hash": {
                  "type": "string"
                },
                "shortHash": {
                  "type": "string"
                },
                "subject": {
                  "type": "string"
                },
                "authorName": {
                  "type": "string"
                },
                "authorEmail": {
                  "type": "string"
                },
                "authoredAt": {
                  "type": "string"
                },
                "parentCount": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Exclusive Branch History

### `GET /api/projects/:projectId/git/exclusive-branch-commits`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "ref": {
      "type": "string",
      "minLength": 1,
      "maxLength": 250,
      "pattern": "^(?!-)[^\\u0000-\\u001F\\u007F]+$"
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 10
    },
    "search": {
      "type": "string",
      "maxLength": 200
    },
    "author": {
      "type": "string",
      "maxLength": 320
    },
    "kind": {
      "type": "string",
      "enum": [
        "all",
        "regular",
        "merge"
      ],
      "default": "all"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "commits"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "page": {
            "type": "integer",
            "minimum": 1
          },
          "pageSize": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "totalPages": {
            "type": "integer",
            "minimum": 0
          },
          "commits": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "hash",
                "shortHash",
                "subject",
                "authorName",
                "authorEmail",
                "authoredAt",
                "parentCount"
              ],
              "properties": {
                "hash": {
                  "type": "string"
                },
                "shortHash": {
                  "type": "string"
                },
                "subject": {
                  "type": "string"
                },
                "authorName": {
                  "type": "string"
                },
                "authorEmail": {
                  "type": "string"
                },
                "authoredAt": {
                  "type": "string"
                },
                "parentCount": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git File Mutations

### `POST /api/projects/:projectId/git/files/discard`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path"
        ],
        "properties": {
          "path": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

### `POST /api/projects/:projectId/git/files/remove`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path"
        ],
        "properties": {
          "path": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

### `POST /api/projects/:projectId/git/files/stage`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path"
        ],
        "properties": {
          "path": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

### `POST /api/projects/:projectId/git/files/unstage`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path"
        ],
        "properties": {
          "path": {
            "type": "string"
          }
        }
      }
    }
  }
  ```

## Git Mutation History

### `DELETE /api/projects/:projectId/git/mutation-history`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cleared"
    ],
    "properties": {
      "cleared": {
        "type": "integer",
        "minimum": 0
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/mutation-history`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "projectId",
      "page",
      "pageSize",
      "total",
      "totalPages",
      "events"
    ],
    "properties": {
      "projectId": {
        "type": "string"
      },
      "page": {
        "type": "integer",
        "minimum": 1
      },
      "pageSize": {
        "type": "integer",
        "minimum": 1
      },
      "total": {
        "type": "integer",
        "minimum": 0
      },
      "totalPages": {
        "type": "integer",
        "minimum": 0
      },
      "events": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "projectId",
            "operationId",
            "risk",
            "occurredAt",
            "result"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "projectId": {
              "type": "string"
            },
            "workspaceId": {
              "type": "string"
            },
            "operationId": {
              "type": "string"
            },
            "risk": {
              "type": "string",
              "enum": [
                "read-only",
                "write-safe",
                "write-remote",
                "destructive"
              ]
            },
            "occurredAt": {
              "type": "string"
            },
            "result": {
              "type": "string",
              "enum": [
                "succeeded",
                "failed"
              ]
            },
            "errorCode": {
              "type": "string"
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Mutations

### `POST /api/projects/:projectId/git/branches`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "confirmationToken"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "includeAllChanges": {
      "type": "boolean"
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "shortHash": {
            "type": "string"
          },
          "subject": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit/amend`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "shortHash": {
            "type": "string"
          },
          "subject": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/mutations/confirmations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "operation",
    "target"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create-branch",
        "switch-branch",
        "pull",
        "push",
        "commit",
        "amend",
        "save",
        "discard-file",
        "remove-untracked-file"
      ]
    },
    "target": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "operation",
          "target",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "create-branch",
              "switch-branch",
              "pull",
              "push",
              "commit"
            ]
          },
          "target": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "confirmationToken"
  ],
  "properties": {
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/push`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "confirmationToken"
  ],
  "properties": {
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/save`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "shortHash": {
            "type": "string"
          },
          "subject": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/switch`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "confirmationToken"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Pull Request

### `GET /api/projects/:projectId/git/pull-request-status`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "lookup"
    ],
    "properties": {
      "lookup": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "checked"
        ],
        "properties": {
          "checked": {
            "type": "boolean"
          },
          "existing": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "provider",
              "number",
              "title",
              "url",
              "sourceBranch",
              "baseBranch"
            ],
            "properties": {
              "provider": {
                "type": "string",
                "enum": [
                  "github",
                  "gitlab"
                ]
              },
              "number": {
                "type": "integer",
                "minimum": 1
              },
              "title": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "baseBranch": {
                "type": "string"
              },
              "ciStatus": {
                "type": "string",
                "enum": [
                  "success",
                  "pending",
                  "failure",
                  "unknown"
                ]
              },
              "commentsCount": {
                "type": "integer",
                "minimum": 0
              },
              "unresolvedConversationsCount": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-summary`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "lookup"
    ],
    "properties": {
      "lookup": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "checked"
        ],
        "properties": {
          "checked": {
            "type": "boolean"
          },
          "existing": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "provider",
              "number",
              "title",
              "url",
              "sourceBranch",
              "baseBranch"
            ],
            "properties": {
              "provider": {
                "type": "string",
                "enum": [
                  "github",
                  "gitlab"
                ]
              },
              "number": {
                "type": "integer",
                "minimum": 1
              },
              "title": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "baseBranch": {
                "type": "string"
              },
              "ciStatus": {
                "type": "string",
                "enum": [
                  "success",
                  "pending",
                  "failure",
                  "unknown"
                ]
              },
              "commentsCount": {
                "type": "integer",
                "minimum": 0
              },
              "unresolvedConversationsCount": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-url`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "pullRequest"
    ],
    "properties": {
      "pullRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "provider",
          "url",
          "branch",
          "defaultBranch"
        ],
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "github",
              "gitlab"
            ]
          },
          "url": {
            "type": "string"
          },
          "branch": {
            "type": "string"
          },
          "defaultBranch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request-url`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "targetRemote",
    "baseBranch",
    "title",
    "description"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "description": {
      "type": "string",
      "maxLength": 20000
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "pullRequest"
    ],
    "properties": {
      "pullRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "provider",
          "url",
          "branch",
          "defaultBranch"
        ],
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "github",
              "gitlab"
            ]
          },
          "url": {
            "type": "string"
          },
          "branch": {
            "type": "string"
          },
          "defaultBranch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request/ai-review`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "targetRemote",
    "baseBranch",
    "model"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "model": {
      "type": "string",
      "minLe…45502 tokens truncated…     "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "migrate",
              "rollback",
              "seed",
              "prepare"
            ]
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/rails/migrations/mutations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "operation",
    "confirmationToken"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "migrate",
        "rollback",
        "seed",
        "prepare"
      ]
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "result"
    ],
    "properties": {
      "result": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "operation",
          "succeeded",
          "output",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "operation": {
            "type": "string",
            "enum": [
              "migrate",
              "rollback",
              "seed",
              "prepare"
            ]
          },
          "succeeded": {
            "type": "boolean"
          },
          "output": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/rails/models`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "database": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 60
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "models"
    ],
    "properties": {
      "models": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "databases",
          "tables"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "databases": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "schemaPath": {
            "type": "string"
          },
          "tables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "columns",
                "indexes",
                "foreignKeys"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "columns": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "type",
                      "nullable",
                      "primaryKey"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "type": {
                        "type": "string"
                      },
                      "nullable": {
                        "type": "boolean"
                      },
                      "primaryKey": {
                        "type": "boolean"
                      },
                      "default": {
                        "type": "string"
                      },
                      "limit": {
                        "type": "integer"
                      },
                      "precision": {
                        "type": "integer"
                      },
                      "scale": {
                        "type": "integer"
                      }
                    }
                  }
                },
                "indexes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "columns",
                      "unique"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "columns": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "unique": {
                        "type": "boolean"
                      }
                    }
                  }
                },
                "foreignKeys": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "fromTable",
                      "toTable",
                      "column"
                    ],
                    "properties": {
                      "fromTable": {
                        "type": "string"
                      },
                      "toTable": {
                        "type": "string"
                      },
                      "column": {
                        "type": "string"
                      },
                      "primaryKey": {
                        "type": "string"
                      },
                      "name": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/rails/routes`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "routes"
    ],
    "properties": {
      "routes": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "routes"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "routes": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "verb",
                "path",
                "controllerAction"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "verb": {
                  "type": "string"
                },
                "path": {
                  "type": "string"
                },
                "controllerAction": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/rails/workers/:workerId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "worker"
    ],
    "properties": {
      "worker": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "detected",
          "process"
        ],
        "properties": {
          "id": {
            "type": "string",
            "enum": [
              "sidekiq",
              "webpack"
            ]
          },
          "detected": {
            "type": "boolean"
          },
          "process": {
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": false,
            "required": [
              "id",
              "projectId",
              "kind",
              "status"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "projectId": {
                "type": "string"
              },
              "workspaceId": {
                "type": "string"
              },
              "kind": {
                "type": "string",
                "enum": [
                  "server",
                  "webpack",
                  "worker",
                  "test",
                  "script"
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "starting",
                  "running",
                  "stopping",
                  "stopped",
                  "failed"
                ]
              },
              "pid": {
                "type": "integer"
              },
              "port": {
                "type": "integer"
              },
              "url": {
                "type": "string"
              },
              "urls": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "command": {
                "type": "string"
              },
              "args": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "startedAt": {
                "type": "string"
              },
              "stoppedAt": {
                "type": "string"
              },
              "exitCode": {
                "type": "integer"
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `DELETE /api/projects/:projectId/rails/workers/:workerId/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/rails/workers/:workerId/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "maxBytes": {
      "type": "integer",
      "minimum": 1,
      "maximum": 262144
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/rails/workers/:workerId/restart`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/rails/workers/:workerId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/rails/workers/:workerId/stop`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Script History

### `DELETE /api/projects/:projectId/scripts/executions`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cleared"
    ],
    "properties": {
      "cleared": {
        "type": "integer",
        "minimum": 0
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Scripts

### `GET /api/projects/:projectId/scripts`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
    },
    "search": {
      "type": "string",
      "maxLength": 120
    },
    "origin": {
      "type": "string",
      "enum": [
        "package-script",
        "rails-task",
        "bin"
      ]
    },
    "risk": {
      "type": "string",
      "enum": [
        "read-only",
        "mutable",
        "destructive"
      ]
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "catalog"
    ],
    "properties": {
      "catalog": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "name",
                "description",
                "command",
                "origin",
                "risk",
                "enabled"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "command": {
                  "type": "string"
                },
                "origin": {
                  "type": "string",
                  "enum": [
                    "package-script",
                    "package-manager",
                    "bundler",
                    "rails-task",
                    "bin"
                  ]
                },
                "risk": {
                  "type": "string",
                  "enum": [
                    "read-only",
                    "mutable",
                    "destructive"
                  ]
                },
                "enabled": {
                  "type": "boolean"
                },
                "variables": {
                  "type": "array",
                  "maxItems": 20,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "required"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "required": {
                        "type": "boolean"
                      },
                      "defaultValue": {
                        "type": "string"
                      },
                      "placeholder": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "totalPages": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/scripts/confirmations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "actionId"
  ],
  "properties": {
    "actionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "variables": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "maxLength": 4096,
        "pattern": "^[^\\u0000\\r\\n]*$"
      },
      "propertyNames": {
        "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
      },
      "maxProperties": 20
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "actionId",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "actionId": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/scripts/executions`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 20
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "projectId",
                "actionId",
                "actionName",
                "risk",
                "status",
                "startedAt"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "projectId": {
                  "type": "string"
                },
                "actionId": {
                  "type": "string"
                },
                "actionName": {
                  "type": "string"
                },
                "risk": {
                  "type": "string",
                  "enum": [
                    "read-only",
                    "mutable",
                    "destructive"
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "running",
                    "succeeded",
                    "failed",
                    "cancelled"
                  ]
                },
                "startedAt": {
                  "type": "string"
                },
                "finishedAt": {
                  "type": "string"
                },
                "exitCode": {
                  "type": "integer"
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "totalPages": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/scripts/executions`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "actionId"
  ],
  "properties": {
    "actionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    },
    "variables": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "maxLength": 4096,
        "pattern": "^[^\\u0000\\r\\n]*$"
      },
      "propertyNames": {
        "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
      },
      "maxProperties": 20
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "actionId",
          "actionName",
          "risk",
          "status",
          "startedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
              "failed",
              "cancelled"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "finishedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/scripts/executions/:executionId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "executionId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "executionId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "actionId",
          "actionName",
          "risk",
          "status",
          "startedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
              "failed",
              "cancelled"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "finishedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/scripts/executions/:executionId/cancel`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "executionId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "executionId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "maxProperties": 0
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "actionId",
          "actionName",
          "risk",
          "status",
          "startedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
              "failed",
              "cancelled"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "finishedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/scripts/executions/:executionId/events`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "executionId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "executionId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

### `GET /api/projects/:projectId/scripts/executions/:executionId/log`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "executionId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "executionId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "executionId",
          "content",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "executionId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/scripts/executions/latest`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execution"
    ],
    "properties": {
      "execution": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "projectId",
              "actionId",
              "actionName",
              "risk",
              "status",
              "startedAt"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "projectId": {
                "type": "string"
              },
              "actionId": {
                "type": "string"
              },
              "actionName": {
                "type": "string"
              },
              "risk": {
                "type": "string",
                "enum": [
                  "read-only",
                  "mutable",
                  "destructive"
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "running",
                  "succeeded",
                  "failed",
                  "cancelled"
                ]
              },
              "startedAt": {
                "type": "string"
              },
              "finishedAt": {
                "type": "string"
              },
              "exitCode": {
                "type": "integer"
              }
            }
          },
          {
            "type": "null"
          }
        ]
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Settings

### `GET /api/settings/environment-profiles`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profiles",
      "limits"
    ],
    "properties": {
      "profiles": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name",
            "variables",
            "createdAt",
            "updatedAt"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "variables": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "name"
                ],
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "value": {
                    "type": "string"
                  }
                }
              }
            },
            "createdAt": {
              "type": "string"
            },
            "updatedAt": {
              "type": "string"
            }
          }
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "maxProfiles",
          "maxVariablesPerProfile",
          "maxNameLength",
          "maxValueLength"
        ],
        "properties": {
          "maxProfiles": {
            "type": "integer"
          },
          "maxVariablesPerProfile": {
            "type": "integer"
          },
          "maxNameLength": {
            "type": "integer"
          },
          "maxValueLength": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/settings/environment-profiles`

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "variables"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "variables": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "value": {
            "type": "string",
            "maxLength": 4096
          }
        }
      }
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile"
    ],
    "properties": {
      "profile": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "variables",
          "createdAt",
          "updatedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "variables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "value": {
                  "type": "string"
                }
              }
            }
          },
          "createdAt": {
            "type": "string"
          },
          "updatedAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `DELETE /api/settings/environment-profiles/:profileId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "profileId"
  ],
  "properties": {
    "profileId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **204**:

  ```json
  {
    "type": "null"
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PUT /api/settings/environment-profiles/:profileId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "profileId"
  ],
  "properties": {
    "profileId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "variables"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "variables": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "value": {
            "type": "string",
            "maxLength": 4096
          }
        }
      }
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile"
    ],
    "properties": {
      "profile": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "variables",
          "createdAt",
          "updatedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "variables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "value": {
                  "type": "string"
                }
              }
            }
          },
          "createdAt": {
            "type": "string"
          },
          "updatedAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/settings/retention`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "values",
      "limits",
      "appliesAfterRestart"
    ],
    "properties": {
      "values": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "integer"
          },
          "scriptHistoryLimit": {
            "type": "integer"
          },
          "testHistoryLimit": {
            "type": "integer"
          }
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "scriptHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "testHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          }
        }
      },
      "appliesAfterRestart": {
        "type": "boolean"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PUT /api/settings/retention`

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "retentionDays",
    "scriptHistoryLimit",
    "testHistoryLimit"
  ],
  "properties": {
    "retentionDays": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    },
    "scriptHistoryLimit": {
      "type": "integer",
      "minimum": 10,
      "maximum": 1000
    },
    "testHistoryLimit": {
      "type": "integer",
      "minimum": 10,
      "maximum": 500
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "values",
      "limits",
      "appliesAfterRestart"
    ],
    "properties": {
      "values": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "integer"
          },
          "scriptHistoryLimit": {
            "type": "integer"
          },
          "testHistoryLimit": {
            "type": "integer"
          }
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "scriptHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "testHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          }
        }
      },
      "appliesAfterRestart": {
        "type": "boolean"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Test Related

### `GET /api/projects/:projectId/tests/:commandId/related`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "related"
    ],
    "properties": {
      "related": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "baseBranch",
          "currentBranch",
          "changedFiles",
          "testFiles"
        ],
        "properties": {
          "baseBranch": {
            "type": "string",
            "maxLength": 256
          },
          "currentBranch": {
            "type": "string",
            "maxLength": 256
          },
          "changedFiles": {
            "type": "array",
            "maxItems": 2000,
            "items": {
              "type": "string",
              "maxLength": 2048
            }
          },
          "testFiles": {
            "type": "array",
            "maxItems": 100,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path"
              ],
              "properties": {
                "path": {
                  "type": "string",
                  "maxLength": 2048
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/tests/:commandId/related/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Tests

### `GET /api/projects/:projectId/tests`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "refresh": {
      "type": "boolean"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "tests"
    ],
    "properties": {
      "tests": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "commands"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "commands": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "runner",
                "label",
                "description",
                "origin",
                "priority",
                "supportsFileTarget",
                "supportsCaseTarget",
                "supportsNamePatternTarget"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "runner": {
                  "type": "string",
                  "enum": [
                    "vitest",
                    "jest",
                    "node-test",
                    "rspec",
                    "rails-test",
                    "minitest",
                    "pytest"
                  ]
                },
                "label": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "origin": {
                  "type": "string",
                  "enum": [
                    "package-script",
                    "binary",
                    "gemfile",
                    "directory",
                    "python-config"
                  ]
                },
                "originDetail": {
                  "type": "string"
                },
                "priority": {
                  "type": "integer"
                },
                "supportsFileTarget": {
                  "type": "boolean"
                },
                "supportsCaseTarget": {
                  "type": "boolean"
                },
                "supportsNamePatternTarget": {
                  "type": "boolean"
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/tests/:commandId/files`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "files"
    ],
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path"
          ],
          "properties": {
            "path": {
              "type": "string"
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/tests/:commandId/files/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "line": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000000
    },
    "namePattern": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/tests/:commandId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `DELETE /api/projects/:projectId/tests/history`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "removedCount"
        ],
        "properties": {
          "removedCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/tests/history`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "projectId",
                "commandId",
                "status",
                "startedAt"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "projectId": {
                  "type": "string"
                },
                "commandId": {
                  "type": "string"
                },
                "targetFile": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "starting",
                    "running",
                    "stopping",
                    "stopped",
                    "failed"
                  ]
                },
                "startedAt": {
                  "type": "string"
                },
                "finishedAt": {
                  "type": "string"
                },
                "exitCode": {
                  "type": "integer"
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "totalPages": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/tests/process`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": [
          "object",
          "null"
        ],
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/tests/process/events`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

### `DELETE /api/projects/:projectId/tests/process/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/tests/process/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "maxBytes": {
      "type": "integer",
      "minimum": 1,
      "maximum": 262144
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/tests/process/stop`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Workspaces

### `GET /api/workspaces`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "workspaces"
    ],
    "properties": {
      "workspaces": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name",
            "path",
            "enabled",
            "recursiveScan"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
            },
            "enabled": {
              "type": "boolean"
            },
            "recursiveScan": {
              "type": "boolean"
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/workspaces`

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "path"
  ],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "path": {
      "type": "string",
      "minLength": 1
    },
    "recursiveScan": {
      "type": "boolean"
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "path",
      "enabled",
      "recursiveScan"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "path": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      },
      "recursiveScan": {
        "type": "boolean"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `DELETE /api/workspaces/:workspaceId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **204**:

  ```json
  {
    "type": "null"
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PATCH /api/workspaces/:workspaceId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "recursiveScan"
  ],
  "properties": {
    "recursiveScan": {
      "type": "boolean"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "path",
      "enabled",
      "recursiveScan"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "path": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      },
      "recursiveScan": {
        "type": "boolean"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/workspaces/:workspaceId/scan`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "restoreDismissed": {
      "type": "boolean"
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "workspaceId",
      "workspacePath",
      "projects",
      "warnings",
      "scannedAt"
    ],
    "properties": {
      "workspaceId": {
        "type": "string"
      },
      "workspacePath": {
        "type": "string"
      },
      "projects": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name",
            "path",
            "type",
            "source",
            "favorite",
            "enabled",
            "capabilities"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
            },
            "type": {
              "type": "string",
              "enum": [
                "rails",
                "node",
                "unknown"
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "workspace",
                "standalone"
              ]
            },
            "workspaceId": {
              "type": "string"
            },
            "port": {
              "type": "integer"
            },
            "favorite": {
              "type": "boolean"
            },
            "enabled": {
              "type": "boolean"
            },
            "lastAccessedAt": {
              "type": "string"
            },
            "capabilities": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "server",
                  "git",
                  "tests",
                  "database",
                  "scripts",
                  "webpack",
                  "sidekiq",
                  "rake",
                  "bundler",
                  "docker"
                ]
              }
            }
          }
        }
      },
      "warnings": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "code",
            "message"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "code": {
              "type": "string",
              "enum": [
                "UNREADABLE_DIRECTORY",
                "PROJECT_DETECTION_FAILED",
                "SCAN_DEPTH_LIMIT_REACHED",
                "SCAN_PROJECT_LIMIT_REACHED",
                "SCAN_TIMEOUT"
              ]
            },
            "message": {
              "type": "string"
            }
          }
        }
      },
      "scannedAt": {
        "type": "string"
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
