#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerBaizeMcpTools } from "./mcp-tools.js";

export function createBaizeMcpServer(): McpServer {
  const server = new McpServer({
    name: "baize",
    version: "0.1.0",
  });

  registerBaizeMcpTools(server);
  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createBaizeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Baize MCP server is running on stdio.");
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === entryFile) {
  startMcpServer().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`Baize MCP server failed: ${message}`);
    process.exit(1);
  });
}
