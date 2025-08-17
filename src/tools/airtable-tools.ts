import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";

// Airtable service types
interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime?: string;
}

interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableField[];
  views: AirtableView[];
}

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: any;
}

interface AirtableView {
  id: string;
  name: string;
  type: string;
}

// Zod schemas for input validation
const ListBasesSchema = z.object({});

const ListTablesSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
});

const DescribeTableSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
});

const ListRecordsSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  view: z.string().optional(),
  maxRecords: z.number().int().positive().max(100).optional(),
  sort: z.array(z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]).optional(),
  })).optional(),
  filterByFormula: z.string().optional(),
});

const GetRecordSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  recordId: z.string().min(1, "Record ID is required"),
});

const CreateRecordSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  fields: z.record(z.any(), "Fields object with key-value pairs"),
});

const UpdateRecordsSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  records: z.array(z.object({
    id: z.string(),
    fields: z.record(z.any()),
  })).min(1, "At least one record is required").max(10, "Maximum 10 records allowed"),
});

const DeleteRecordsSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  recordIds: z.array(z.string()).min(1, "At least one record ID is required").max(10, "Maximum 10 record IDs allowed"),
});

const SearchRecordsSchema = z.object({
  baseId: z.string().min(1, "Base ID is required"),
  tableId: z.string().min(1, "Table ID is required"),
  filterByFormula: z.string().min(1, "Formula is required for search"),
  maxRecords: z.number().int().positive().max(100).optional(),
});

// Airtable API service class
class AirtableService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.airtable.com/v0";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Airtable API error: ${response.status} ${response.statusText} - ${error}`);
    }

    return response.json();
  }

  async listBases(): Promise<{ bases: AirtableBase[] }> {
    return this.makeRequest("/meta/bases");
  }

  async getBaseSchema(baseId: string): Promise<{ tables: AirtableTable[] }> {
    return this.makeRequest(`/meta/bases/${baseId}/tables`);
  }

  async listRecords(
    baseId: string,
    tableId: string,
    options: {
      view?: string;
      maxRecords?: number;
      sort?: Array<{ field: string; direction?: "asc" | "desc" }>;
      filterByFormula?: string;
    } = {}
  ): Promise<{ records: AirtableRecord[] }> {
    const params = new URLSearchParams();
    
    if (options.view) params.append("view", options.view);
    if (options.maxRecords) params.append("maxRecords", options.maxRecords.toString());
    if (options.filterByFormula) params.append("filterByFormula", options.filterByFormula);
    
    if (options.sort) {
      options.sort.forEach((sortItem, index) => {
        params.append(`sort[${index}][field]`, sortItem.field);
        if (sortItem.direction) {
          params.append(`sort[${index}][direction]`, sortItem.direction);
        }
      });
    }

    const queryString = params.toString();
    const endpoint = `/${baseId}/${tableId}${queryString ? `?${queryString}` : ""}`;
    
    return this.makeRequest(endpoint);
  }

  async getRecord(baseId: string, tableId: string, recordId: string): Promise<AirtableRecord> {
    return this.makeRequest(`/${baseId}/${tableId}/${recordId}`);
  }

  async createRecord(baseId: string, tableId: string, fields: Record<string, any>): Promise<AirtableRecord> {
    return this.makeRequest(`/${baseId}/${tableId}`, {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  async updateRecords(
    baseId: string,
    tableId: string,
    records: Array<{ id: string; fields: Record<string, any> }>
  ): Promise<{ records: AirtableRecord[] }> {
    return this.makeRequest(`/${baseId}/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ records }),
    });
  }

  async deleteRecords(baseId: string, tableId: string, recordIds: string[]): Promise<{ records: Array<{ id: string; deleted: boolean }> }> {
    const params = new URLSearchParams();
    recordIds.forEach(id => params.append("records[]", id));
    
    return this.makeRequest(`/${baseId}/${tableId}?${params.toString()}`, {
      method: "DELETE",
    });
  }
}

// Permission levels for write operations
const ALLOWED_WRITE_USERNAMES = new Set<string>([
  // Add GitHub usernames that should have write access
  // Example: "your-github-username"
]);

// Register all Airtable tools
export function registerAirtableTools(server: McpServer, env: Env, props: Props): void {
  const airtableService = new AirtableService(env.AIRTABLE_API_KEY);

  // List Bases - Available to all authenticated users
  server.tool(
    "listBases",
    "List all Airtable bases accessible with the provided API key",
    ListBasesSchema,
    async ({}) => {
      try {
        const result = await airtableService.listBases();
        return {
          content: [
            {
              type: "text",
              text: `**Airtable Bases**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to list bases: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // List Tables - Available to all authenticated users
  server.tool(
    "listTables",
    "List all tables in a specific Airtable base",
    ListTablesSchema,
    async ({ baseId }) => {
      try {
        const result = await airtableService.getBaseSchema(baseId);
        return {
          content: [
            {
              type: "text",
              text: `**Tables in Base ${baseId}**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to list tables: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // Describe Table - Available to all authenticated users
  server.tool(
    "describeTable",
    "Get detailed information about a specific table including fields and views",
    DescribeTableSchema,
    async ({ baseId, tableId }) => {
      try {
        const baseSchema = await airtableService.getBaseSchema(baseId);
        const table = baseSchema.tables.find(t => t.id === tableId);
        
        if (!table) {
          return {
            content: [
              {
                type: "text",
                text: `**Error**\\n\\nTable ${tableId} not found in base ${baseId}`,
                isError: true,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `**Table Details**\\n\\n\`\`\`json\\n${JSON.stringify(table, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to describe table: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // List Records - Available to all authenticated users
  server.tool(
    "listRecords",
    "List records from a specific table with optional filtering and sorting",
    ListRecordsSchema,
    async ({ baseId, tableId, view, maxRecords, sort, filterByFormula }) => {
      try {
        const result = await airtableService.listRecords(baseId, tableId, {
          view,
          maxRecords,
          sort,
          filterByFormula,
        });
        
        return {
          content: [
            {
              type: "text",
              text: `**Records from ${tableId}**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to list records: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // Get Record - Available to all authenticated users
  server.tool(
    "getRecord",
    "Get a specific record by ID",
    GetRecordSchema,
    async ({ baseId, tableId, recordId }) => {
      try {
        const result = await airtableService.getRecord(baseId, tableId, recordId);
        return {
          content: [
            {
              type: "text",
              text: `**Record ${recordId}**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to get record: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // Search Records - Available to all authenticated users
  server.tool(
    "searchRecords",
    "Search records using Airtable formula filtering",
    SearchRecordsSchema,
    async ({ baseId, tableId, filterByFormula, maxRecords }) => {
      try {
        const result = await airtableService.listRecords(baseId, tableId, {
          filterByFormula,
          maxRecords,
        });
        
        return {
          content: [
            {
              type: "text",
              text: `**Search Results**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `**Error**\\n\\nFailed to search records: ${error instanceof Error ? error.message : String(error)}`,
              isError: true,
            },
          ],
        };
      }
    }
  );

  // Write operations - Only for privileged users
  if (ALLOWED_WRITE_USERNAMES.has(props.login)) {
    // Create Record
    server.tool(
      "createRecord",
      "Create a new record in a table",
      CreateRecordSchema,
      async ({ baseId, tableId, fields }) => {
        try {
          const result = await airtableService.createRecord(baseId, tableId, fields);
          return {
            content: [
              {
                type: "text",
                text: `**Record Created**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `**Error**\\n\\nFailed to create record: ${error instanceof Error ? error.message : String(error)}`,
                isError: true,
              },
            ],
          };
        }
      }
    );

    // Update Records
    server.tool(
      "updateRecords",
      "Update multiple records in a table",
      UpdateRecordsSchema,
      async ({ baseId, tableId, records }) => {
        try {
          const result = await airtableService.updateRecords(baseId, tableId, records);
          return {
            content: [
              {
                type: "text",
                text: `**Records Updated**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `**Error**\\n\\nFailed to update records: ${error instanceof Error ? error.message : String(error)}`,
                isError: true,
              },
            ],
          };
        }
      }
    );

    // Delete Records
    server.tool(
      "deleteRecords",
      "Delete multiple records from a table",
      DeleteRecordsSchema,
      async ({ baseId, tableId, recordIds }) => {
        try {
          const result = await airtableService.deleteRecords(baseId, tableId, recordIds);
          return {
            content: [
              {
                type: "text",
                text: `**Records Deleted**\\n\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `**Error**\\n\\nFailed to delete records: ${error instanceof Error ? error.message : String(error)}`,
                isError: true,
              },
            ],
          };
        }
      }
    );
  }

  console.log(`Airtable MCP tools registered for user: ${props.login} (${props.name})`);
  console.log(`Write access: ${ALLOWED_WRITE_USERNAMES.has(props.login) ? 'enabled' : 'disabled'}`);
}