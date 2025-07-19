# FastDomainCheck MCP Server (JavaScript)

A Model Context Protocol (MCP) server for bulk domain name registration status checking, implemented in JavaScript.

## Features

- Bulk domain checking (up to 50 domains per request)
- Dual verification: WHOIS queries with DNS fallback
- Support for 200+ TLDs including country codes and IDNs
- Chinese domain name support
- Built-in health check endpoint
- Simple JSON output format

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd fastdomaincheck-mcp-server

# Install dependencies
npm install
```

## Usage

### As MCP Server

Run the server:

```bash
npm start
```

Or with health check enabled:

```bash
node index.js --health-check --health-check-port 8080
```

### Integration with Claude Desktop

Add to your Claude Desktop configuration (`claude-desktop-config.json`):

```json
{
  "mcpServers": {
    "fastdomaincheck": {
      "command": "node",
      "args": ["/path/to/fastdomaincheck-mcp-server/index.js"],
      "env": {}
    }
  }
}
```

## MCP Tool

The server provides one tool:

### check_domains

Check the registration status of multiple domains.

**Input:**
```json
{
  "domains": ["example.com", "test.org", "domain.cn"]
}
```

**Output:**
```json
[
  {
    "domain": "example.com",
    "available": false,
    "method": "whois"
  },
  {
    "domain": "test.org",
    "available": false,
    "method": "whois"
  },
  {
    "domain": "domain.cn",
    "available": true,
    "method": "dns"
  }
]
```

## How It Works

1. **Input Validation**: Validates domain format and length (1-253 characters)
2. **WHOIS Query**: Attempts to query the authoritative WHOIS server for the TLD
3. **DNS Fallback**: If WHOIS fails or is unavailable, checks DNS records
4. **Result Processing**: Returns availability status with the method used

## Performance

- Sequential processing: 0.3-1 second per domain
- 10-second timeout for WHOIS queries
- Automatic fallback to DNS for faster results when WHOIS is slow

## Supported TLDs

Supports 200+ TLDs including:
- Generic TLDs: .com, .net, .org, .info, etc.
- Country codes: .us, .uk, .de, .cn, .jp, etc.
- New gTLDs: .app, .dev, .xyz, etc.
- IDN TLDs: .中国, .公司, .网络, etc.

## Development

```bash
# Run in development mode with auto-reload
npm run dev
```

## License

MIT