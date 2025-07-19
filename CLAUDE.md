# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FastDomainCheck MCP Server is a Model Context Protocol (MCP) server that provides bulk domain name registration status checking. It's written in JavaScript/Node.js and uses the `@modelcontextprotocol/sdk` package.

## Core Architecture

The codebase follows a simple modular structure:

- **index.js**: Entry point that registers the `check_domains` tool with MCP framework and handles STDIO communication
- **lib/checker.js**: Core domain checking logic using dual verification (WHOIS queries with DNS fallback)
- **lib/config.js**: TLD-to-WHOIS server mappings and unregistered domain detection patterns

The server communicates via STDIO using the MCP protocol, allowing AI tools to check domain availability for 200+ TLDs including IDN and Chinese domains.

## Common Development Commands

```bash
# Install dependencies
npm install

# Run the server
npm start

# Run with health check enabled (for testing/debugging)
node index.js --health-check --health-check-port 8080

# Run in development mode with auto-reload
npm run dev
```

## Key Implementation Details

1. **Domain Checking Flow**:
   - Input validation (length 1-253 chars, valid format)
   - WHOIS query to authoritative server (10s timeout)
   - Fallback to DNS resolution if WHOIS fails
   - Returns simplified JSON with domain status

2. **MCP Tool Registration**:
   - Tool name: `check_domains`
   - Accepts array of domains (max 50)
   - Returns JSON array with availability status

3. **Performance Characteristics**:
   - Sequential processing (0.3-1 second per domain)
   - No caching or concurrent checking
   - 10-second timeout per WHOIS query

## Testing Approach

Currently no tests exist. When adding tests, focus on:
- Domain validation logic
- WHOIS response parsing for different TLDs
- Fallback mechanism behavior
- MCP tool integration

## Dependencies

- `@modelcontextprotocol/sdk`: MCP framework implementation
- `whois`: WHOIS query library
- `punycode`: IDN domain handling
- `express`: Health check server
- `yargs`: Command-line argument parsing