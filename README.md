# Remote Airtable MCP Server

A remote Model Context Protocol (MCP) server that provides secure access to Airtable databases through GitHub OAuth authentication. Built on Cloudflare Workers for global edge deployment.

## Key Features

- **🗄️ Airtable Integration**: Direct connection to Airtable databases via REST API
- **🛠️ Comprehensive Tools**: Read and write operations for bases, tables, and records
- **🔐 Role-Based Access**: GitHub username-based permissions for write operations
- **📊 Schema Discovery**: Automatic base and table structure retrieval
- **🛡️ Input Validation**: Built-in validation with Zod schemas
- **📈 Monitoring**: Optional Sentry integration for production monitoring
- **☁️ Cloud Native**: Powered by [Cloudflare Workers](https://developers.cloudflare.com/workers/) for global scale

## Features

### Read Operations (All Authenticated Users)
- **listBases** - List all accessible Airtable bases
- **listTables** - List tables in a specific base
- **describeTable** - Get detailed table schema with fields and views
- **listRecords** - List records with filtering, sorting, and pagination
- **getRecord** - Get a specific record by ID
- **searchRecords** - Search records using Airtable formula filtering

### Write Operations (Privileged Users Only)
- **createRecord** - Create new records
- **updateRecords** - Update multiple records (batch operations)
- **deleteRecords** - Delete multiple records (batch operations)

## Transport Protocols

This MCP server supports both modern and legacy transport protocols:

- **`/mcp` - Streamable HTTP** (recommended): Uses a single endpoint with bidirectional communication, automatic connection upgrades, and better resilience for network interruptions
- **`/sse` - Server-Sent Events** (legacy): Uses separate endpoints for requests/responses, maintained for backward compatibility

For new implementations, use the `/mcp` endpoint as it provides better performance and reliability.

## Architecture

- **Cloudflare Workers** - Serverless runtime for global deployment
- **GitHub OAuth** - Secure authentication with role-based access control
- **Durable Objects** - Stateful MCP agent persistence
- **Airtable API** - Direct integration with Airtable's REST API

**Authentication Flow**: Users authenticate via GitHub OAuth → Server validates permissions → Tools become available based on user's GitHub username.

**Security Model**: 
- All authenticated GitHub users can read Airtable data
- Only specific GitHub usernames can write/modify data
- Input validation and error sanitization built-in

## Quick Start

### 1. Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- GitHub OAuth App configured
- Airtable Personal Access Token

### 2. Clone and Setup

```bash
git clone <this-repo>
cd remote-airtable-mcp
npm install
```

### 3. Environment Configuration

Create `.dev.vars` for local development:

```bash
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
COOKIE_ENCRYPTION_KEY=your_32_char_encryption_key
AIRTABLE_API_KEY=your_airtable_personal_access_token
```

### 4. Development

```bash
# Start local development server
npm run dev

# The server will be available at:
# - MCP endpoint: http://localhost:8792/mcp
# - SSE endpoint: http://localhost:8792/sse
# - OAuth flow: http://localhost:8792/authorize
```

### 5. Configure Privileged Users

Edit `src/tools/airtable-tools.ts` to add GitHub usernames that should have write access:

```typescript
const ALLOWED_WRITE_USERNAMES = new Set<string>([
  "your-github-username",
  "another-privileged-user"
]);
```

## Local Development & Testing

**Run the server locally**:
   ```bash
   wrangler dev
   ```
   This makes the server available at `http://localhost:8792`

### Testing with MCP Inspector

Use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) to test your server:

1. **Install and run Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector@latest
   ```

2. **Connect to your local server**:
   - **Preferred**: Enter URL: `http://localhost:8792/mcp` (streamable HTTP transport - newer, more robust)
   - **Alternative**: Enter URL: `http://localhost:8792/sse` (SSE transport - legacy support)
   - Click "Connect"
   - Follow the OAuth prompts to authenticate with GitHub
   - Once connected, you'll see the available tools

3. **Test the tools**:
   - Use `listTables` to see your database structure
   - Use `queryDatabase` to run SELECT queries
   - Use `executeDatabase` (if you have write access) for INSERT/UPDATE/DELETE operations

## Production Deployment

#### Set up a KV namespace
- Create the KV namespace: 
`wrangler kv namespace create "OAUTH_KV"`
- Update the `wrangler.jsonc` file with the KV ID (replace <Add-KV-ID>)

#### Deploy
Deploy the MCP server to make it available on your workers.dev domain

```bash
wrangler deploy
```

### Create environment variables in production
Create a new [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app): 
- For the Homepage URL, specify `https://mcp-github-oauth.<your-subdomain>.workers.dev`
- For the Authorization callback URL, specify `https://mcp-github-oauth.<your-subdomain>.workers.dev/callback`
- Note your Client ID and generate a Client secret. 
- Set all required secrets via Wrangler:
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY  # use: openssl rand -hex 32
wrangler secret put DATABASE_URL
wrangler secret put SENTRY_DSN  # optional (more on Sentry setup below)
```

#### Test

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector): 

```
npx @modelcontextprotocol/inspector@latest
```
Enter `https://mcp-github-oauth.<your-subdomain>.workers.dev/mcp` (preferred) or `https://mcp-github-oauth.<your-subdomain>.workers.dev/sse` (legacy) and hit connect. Once you go through the authentication flow, you'll see the Tools working: 

<img width="640" alt="image" src="https://github.com/user-attachments/assets/7973f392-0a9d-4712-b679-6dd23f824287" />

You now have a remote MCP server deployed! 

## Database Tools & Access Control

### Available Tools

#### 1. `listTables` (All Users)
**Purpose**: Discover database schema and structure  
**Access**: All authenticated GitHub users  
**Usage**: Always run this first to understand your database structure

```
Example output:
- Tables: users, products, orders
- Columns: id (integer), name (varchar), created_at (timestamp)
- Constraints and relationships
```

#### 2. `queryDatabase` (All Users) 
**Purpose**: Execute read-only SQL queries  
**Access**: All authenticated GitHub users  
**Restrictions**: Only SELECT statements and read operations allowed

```sql
-- Examples of allowed queries:
SELECT * FROM users WHERE created_at > '2024-01-01';
SELECT COUNT(*) FROM products;
SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id;
```

#### 3. `executeDatabase` (Privileged Users Only)
**Purpose**: Execute write operations (INSERT, UPDATE, DELETE, DDL)  
**Access**: Restricted to specific GitHub usernames  
**Capabilities**: Full database write access including schema modifications

```sql
-- Examples of allowed operations:
INSERT INTO users (name, email) VALUES ('New User', 'user@example.com');
UPDATE products SET price = 29.99 WHERE id = 1;
DELETE FROM orders WHERE status = 'cancelled';
CREATE TABLE new_table (id SERIAL PRIMARY KEY, data TEXT);
```

### Access Control Configuration

Database write access is controlled by GitHub username in the `ALLOWED_USERNAMES` configuration:

```typescript
// Add GitHub usernames for database write access
const ALLOWED_USERNAMES = new Set([
  'yourusername',    // Replace with your GitHub username
  'teammate1',       // Add team members who need write access
  'database-admin'   // Add other trusted users
]);
```

**To update access permissions**:
1. Edit `src/index.ts` and `src/index_non_sentry.ts`
2. Update the `ALLOWED_USERNAMES` set with GitHub usernames
3. Redeploy the worker: `wrangler deploy`

### Typical Workflow

1. **🔍 Discover**: Use `listTables` to understand database structure
2. **📊 Query**: Use `queryDatabase` to read and analyze data  
3. **✏️ Modify**: Use `executeDatabase` (if you have write access) to make changes

### Security Features

- **SQL Injection Protection**: All queries are validated before execution
- **Operation Type Detection**: Automatic detection of read vs write operations
- **User Context Tracking**: All operations are logged with GitHub user information
- **Connection Pooling**: Efficient database connection management
- **Error Sanitization**: Database errors are cleaned before being returned to users

### Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use. 

```
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-github-oauth.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

Once the Tools (under 🔨) show up in the interface, you can ask Claude to interact with your database. Example commands:

- **"What tables are available in the database?"** → Uses `listTables` tool
- **"Show me all users created in the last 30 days"** → Uses `queryDatabase` tool  
- **"Add a new user named John with email john@example.com"** → Uses `executeDatabase` tool (if you have write access)

### Using Claude and other MCP Clients

When using Claude to connect to your remote MCP server, you may see some error messages. This is because Claude Desktop doesn't yet support remote MCP servers, so it sometimes gets confused. To verify whether the MCP server is connected, hover over the 🔨 icon in the bottom right corner of Claude's interface. You should see your tools available there.

#### Using Cursor and other MCP Clients

To connect Cursor with your MCP server, choose `Type`: "Command" and in the `Command` field, combine the command and args fields into one (e.g. `npx mcp-remote https://<your-worker-name>.<your-subdomain>.workers.dev/sse`).

Note that while Cursor supports HTTP+SSE servers, it doesn't support authentication, so you still need to use `mcp-remote` (and to use a STDIO server, not an HTTP one).

You can connect your MCP server to other MCP clients like Windsurf by opening the client's configuration file, adding the same JSON that was used for the Claude setup, and restarting the MCP client.

## Sentry Integration (Optional)

This project includes optional Sentry integration for comprehensive error tracking, performance monitoring, and distributed tracing. There are two versions available:

- `src/index.ts` - Standard version without Sentry
- `src/index_sentry.ts` - Version with full Sentry integration

### Setting Up Sentry

1. **Create a Sentry Account**: Sign up at [sentry.io](https://sentry.io) if you don't have an account.

2. **Create a New Project**: Create a new project in Sentry and select "Cloudflare Workers" as the platform (search in the top right).

3. **Get Your DSN**: Copy the DSN from your Sentry project settings.

### Using Sentry in Production

To deploy with Sentry monitoring:

1. **Set the Sentry DSN secret**:
   ```bash
   wrangler secret put SENTRY_DSN
   ```
   Enter your Sentry DSN when prompted.

2. **Update your wrangler.toml** to use the Sentry-enabled version:
   ```toml
   main = "src/index_sentry.ts"
   ```

3. **Deploy with Sentry**:
   ```bash
   wrangler deploy
   ```

### Using Sentry in Development

1. **Add Sentry DSN to your `.dev.vars` file**:
   ```
   SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
   NODE_ENV=development
   ```

2. **Run with Sentry enabled**:
   ```bash
   wrangler dev
   ```

### Sentry Features Included

- **Error Tracking**: Automatic capture of all errors with context
- **Performance Monitoring**: Full request tracing with 100% sample rate
- **User Context**: Automatically binds GitHub user information to events
- **Tool Tracing**: Each MCP tool call is traced with parameters
- **Custom Error Handling**: User-friendly error messages with Event IDs
- **Context Enrichment**: Automatic tagging and context for better debugging

## How does it work? 

#### OAuth Provider
The OAuth Provider library serves as a complete OAuth 2.1 server implementation for Cloudflare Workers. It handles the complexities of the OAuth flow, including token issuance, validation, and management. In this project, it plays the dual role of:

- Authenticating MCP clients that connect to your server
- Managing the connection to GitHub's OAuth services
- Securely storing tokens and authentication state in KV storage

#### Durable MCP
Durable MCP extends the base MCP functionality with Cloudflare's Durable Objects, providing:
- Persistent state management for your MCP server
- Secure storage of authentication context between requests
- Access to authenticated user information via `this.props`
- Support for conditional tool availability based on user identity

#### MCP Remote
The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:
- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Maintains the Server-Sent Events (SSE) connection between clients and your server

## Testing

This project includes comprehensive unit tests covering all major functionality:

```bash
npm test        # Run all tests
npm run test:ui # Run tests with UI
```

The test suite covers database security, tool registration, permission handling, and response formatting with proper mocking of external dependencies.
