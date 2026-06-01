# Bitrix24 MCP Server

MCP server for connecting compatible AI clients to Bitrix24 CRM through an incoming webhook.

## Features

- Universal Bitrix24 REST call tool
- CRM leads: list, get, add, update
- CRM deals: list, get, add, update
- CRM contacts: list, get, add
- CRM timeline comments
- CRM statuses and fields

## Setup

```bash
npm install
npm run build
npm start
```

The Bitrix24 webhook must be provided through an environment variable. Do not commit real webhook values.
