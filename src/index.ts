import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";
import { GitHubHandler } from "./auth/github-handler";
import { registerAirtableTools } from "./tools/airtable-tools";

export class AirtableMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Airtable MCP Server",
		version: "1.0.0",
	});

	/**
	 * Cleanup resources when Durable Object is shutting down
	 */
	async cleanup(): Promise<void> {
		try {
			console.log('Airtable MCP server cleanup completed successfully');
		} catch (error) {
			console.error('Error during cleanup:', error);
		}
	}

	/**
	 * Durable Objects alarm handler - used for cleanup
	 */
	async alarm(): Promise<void> {
		await this.cleanup();
	}

	async init() {
		// Register all Airtable tools based on user permissions
		registerAirtableTools(this.server, this.env, this.props);
	}
}

export default new OAuthProvider({
	apiHandlers: {
		'/sse': AirtableMCP.serveSSE('/sse') as any,
		'/mcp': AirtableMCP.serve('/mcp') as any,
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});