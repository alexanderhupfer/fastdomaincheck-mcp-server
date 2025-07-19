#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { checkDomains } from './lib/checker.js';

const argv = yargs(hideBin(process.argv))
  .option('health-check', {
    type: 'boolean',
    description: 'Enable health check server',
    default: false
  })
  .option('health-check-port', {
    type: 'number',
    description: 'Port for health check server',
    default: 8080
  })
  .help()
  .argv;

const server = new Server(
  {
    name: 'fastdomaincheck-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'check_domains',
        description: 'Check domain registration status in bulk (up to 50 domains)',
        inputSchema: {
          type: 'object',
          properties: {
            domains: {
              type: 'array',
              items: {
                type: 'string',
                description: 'Domain name to check'
              },
              maxItems: 50,
              description: 'List of domain names to check'
            }
          },
          required: ['domains']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'check_domains') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { domains } = request.params.arguments;

  if (!Array.isArray(domains)) {
    throw new Error('domains must be an array');
  }

  if (domains.length === 0) {
    throw new Error('domains array cannot be empty');
  }

  if (domains.length > 50) {
    throw new Error('Cannot check more than 50 domains at once');
  }

  try {
    const results = await checkDomains(domains);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message })
        }
      ],
      isError: true
    };
  }
});

if (argv['health-check']) {
  const app = express();
  const port = argv['health-check-port'];

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.listen(port, () => {
    console.error(`Health check server listening on port ${port}`);
  });
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FastDomainCheck MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});