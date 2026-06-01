#!/usr/bin/env node

import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const WEBHOOK_URL = process.env.BITRIX24_WEBHOOK_URL;
const DEBUG = process.env.BITRIX24_DEBUG === 'true';
const PORT = Number(process.env.PORT ?? 10000);
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!WEBHOOK_URL) {
  console.error('BITRIX24_WEBHOOK_URL is required. Provide it via Render environment variables.');
  process.exit(1);
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

const baseUrl = normalizeBaseUrl(WEBHOOK_URL);

const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ])
);

const JsonObject = z.record(z.string(), JsonValue);

type JsonObjectType = z.infer<typeof JsonObject>;

type BitrixResponse = {
  result?: unknown;
  error?: string;
  error_description?: string;
  next?: number;
  total?: number;
  time?: unknown;
};

const SAFE_METHOD_RE = /^[a-z0-9_.]+$/i;

async function bitrixCall(method: string, params: JsonObjectType = {}): Promise<BitrixResponse> {
  if (!SAFE_METHOD_RE.test(method)) {
    throw new Error(`Invalid Bitrix24 method: ${method}`);
  }

  const response = await fetch(`${baseUrl}${method}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  let data: BitrixResponse;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Bitrix24 returned non-JSON response. HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (!response.ok || data.error) {
    const message = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`Bitrix24 ${method} failed: ${message}`);
  }

  return data;
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function compact(data: BitrixResponse) {
  if (DEBUG) return data;
  return {
    result: data.result,
    next: data.next,
    total: data.total,
  };
}

const listSchema = z.object({
  order: JsonObject.optional().describe('Sort order, e.g. { "ID": "DESC" }'),
  filter: JsonObject.optional().describe('Bitrix24 filter object'),
  select: z.array(z.string()).optional().describe('Fields to select'),
  start: z.number().int().optional().describe('Pagination start. Use -1 if you do not need total count.'),
});

const idSchema = z.object({
  id: z.union([z.string(), z.number()]).describe('Bitrix24 entity ID'),
});

const fieldsSchema = z.object({
  fields: JsonObject.describe('Bitrix24 fields object'),
  params: JsonObject.optional().describe('Optional Bitrix24 params object'),
});

const updateSchema = z.object({
  id: z.union([z.string(), z.number()]).describe('Bitrix24 entity ID'),
  fields: JsonObject.describe('Fields to update'),
  params: JsonObject.optional().describe('Optional Bitrix24 params object'),
});

function createMcpServer() {
  const server = new McpServer({
    name: 'bitrix24-mcp-server',
    version: '1.0.0',
  });

  server.registerTool(
    'bitrix_call',
    {
      description: 'Universal Bitrix24 REST API call through incoming webhook. Use carefully: this can read or modify CRM data depending on method.',
      inputSchema: z.object({
        method: z.string().describe('Bitrix24 REST method, e.g. crm.deal.list'),
        params: JsonObject.optional().describe('Parameters sent as JSON body'),
      }),
    },
    async ({ method, params }) => ok(compact(await bitrixCall(method, params ?? {})))
  );

  server.registerTool('crm_lead_list', { description: 'List Bitrix24 CRM leads', inputSchema: listSchema }, async (args) =>
    ok(compact(await bitrixCall('crm.lead.list', args)))
  );

  server.registerTool('crm_lead_get', { description: 'Get Bitrix24 CRM lead by ID', inputSchema: idSchema }, async ({ id }) =>
    ok(compact(await bitrixCall('crm.lead.get', { id })))
  );

  server.registerTool('crm_lead_add', { description: 'Create Bitrix24 CRM lead', inputSchema: fieldsSchema }, async ({ fields, params }) =>
    ok(compact(await bitrixCall('crm.lead.add', { fields, params: params ?? {} })))
  );

  server.registerTool('crm_lead_update', { description: 'Update Bitrix24 CRM lead', inputSchema: updateSchema }, async ({ id, fields, params }) =>
    ok(compact(await bitrixCall('crm.lead.update', { id, fields, params: params ?? {} })))
  );

  server.registerTool('crm_deal_list', { description: 'List Bitrix24 CRM deals', inputSchema: listSchema }, async (args) =>
    ok(compact(await bitrixCall('crm.deal.list', args)))
  );

  server.registerTool('crm_deal_get', { description: 'Get Bitrix24 CRM deal by ID', inputSchema: idSchema }, async ({ id }) =>
    ok(compact(await bitrixCall('crm.deal.get', { id })))
  );

  server.registerTool('crm_deal_add', { description: 'Create Bitrix24 CRM deal', inputSchema: fieldsSchema }, async ({ fields, params }) =>
    ok(compact(await bitrixCall('crm.deal.add', { fields, params: params ?? {} })))
  );

  server.registerTool('crm_deal_update', { description: 'Update Bitrix24 CRM deal', inputSchema: updateSchema }, async ({ id, fields, params }) =>
    ok(compact(await bitrixCall('crm.deal.update', { id, fields, params: params ?? {} })))
  );

  server.registerTool('crm_contact_list', { description: 'List Bitrix24 CRM contacts', inputSchema: listSchema }, async (args) =>
    ok(compact(await bitrixCall('crm.contact.list', args)))
  );

  server.registerTool('crm_contact_get', { description: 'Get Bitrix24 CRM contact by ID', inputSchema: idSchema }, async ({ id }) =>
    ok(compact(await bitrixCall('crm.contact.get', { id })))
  );

  server.registerTool('crm_contact_add', { description: 'Create Bitrix24 CRM contact', inputSchema: fieldsSchema }, async ({ fields, params }) =>
    ok(compact(await bitrixCall('crm.contact.add', { fields, params: params ?? {} })))
  );

  server.registerTool(
    'crm_timeline_comment_add',
    {
      description: 'Add comment to Bitrix24 CRM entity timeline',
      inputSchema: z.object({
        entityType: z.string().describe('Entity type, e.g. lead, deal, contact, company'),
        entityId: z.union([z.string(), z.number()]).describe('Entity ID'),
        comment: z.string().describe('Comment text'),
        files: z.array(JsonObject).optional().describe('Optional Bitrix24 file objects'),
      }),
    },
    async ({ entityType, entityId, comment, files }) =>
      ok(
        compact(
          await bitrixCall('crm.timeline.comment.add', {
            fields: {
              ENTITY_TYPE: entityType,
              ENTITY_ID: entityId,
              COMMENT: comment,
              ...(files ? { FILES: files } : {}),
            },
          })
        )
      )
  );

  server.registerTool(
    'crm_status_list',
    {
      description: 'List Bitrix24 CRM statuses/stages/sources. Example filters include SOURCE and DEAL_STAGE entity IDs.',
      inputSchema: z.object({
        order: JsonObject.optional(),
        filter: JsonObject.optional(),
      }),
    },
    async (args) => ok(compact(await bitrixCall('crm.status.list', args)))
  );

  server.registerTool(
    'crm_fields',
    {
      description: 'Get CRM fields metadata for lead/deal/contact/company',
      inputSchema: z.object({
        entity: z.enum(['lead', 'deal', 'contact', 'company']).describe('CRM entity type'),
      }),
    },
    async ({ entity }) => ok(compact(await bitrixCall(`crm.${entity}.fields`, {})))
  );

  return server;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!MCP_AUTH_TOKEN) return next();

  const authHeader = req.header('authorization') ?? '';
  const expected = `Bearer ${MCP_AUTH_TOKEN}`;

  if (authHeader !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.type('text/plain').send('Bitrix24 MCP Server is running. Use POST /mcp for MCP Streamable HTTP. Health: /health');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bitrix24-mcp-server' });
});

app.post('/mcp', requireAuth, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close().catch((error) => console.error('Transport close failed', error));
    server.close().catch((error) => console.error('Server close failed', error));
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', requireAuth, (_req, res) => {
  res.status(405).json({ error: 'Use POST /mcp for MCP Streamable HTTP.' });
});

app.delete('/mcp', requireAuth, (_req, res) => {
  res.status(405).json({ error: 'Stateless MCP server does not keep sessions.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bitrix24 MCP HTTP server listening on 0.0.0.0:${PORT}`);
});
