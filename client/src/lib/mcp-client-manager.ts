import { experimental_createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';

// Type for the MCP client
type MCPClientType = any; // Using any as a temporary solution for type issues

/**
 * Singleton manager for the MCP client to ensure it's only initialized once
 * and persists across multiple API requests.
 */
export class MCPClientManager {
  private static instance: MCPClientManager;
  private mcpClient: MCPClientType | undefined;
  private tools = {};
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  private constructor() { }

  /**
   * Get the singleton instance of the MCPClientManager
   */
  public static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  /**
   * Get the MCP client, initializing it if necessary
   */
  public async getClient(): Promise<MCPClientType | undefined> {
    if (!this.mcpClient && !this.isInitializing) {
      await this.initialize();
    } else if (this.isInitializing && this.initPromise) {
      // Wait for initialization to complete if it's in progress
      await this.initPromise;
    }
    return this.mcpClient;
  }

  /**
   * Get the available MCP tools
   */
  public getTools(): Record<string, any> {
    return this.tools;
  }

  /**
   * Check if any tools are available
   */
  public hasTools(): boolean {
    return Object.keys(this.tools).length > 0;
  }

  /**
   * Initialize the MCP client and fetch available tools
   */
  private async initialize(): Promise<void> {
    if (this.isInitializing) return;

    this.isInitializing = true;
    this.initPromise = new Promise<void>(async (resolve) => {
      try {
        // Connect to the MCP EVM server using stdio transport
        const transport = new Experimental_StdioMCPTransport({
          command: 'bun',
          args: ['start'],
          cwd: '../server',
        });

        this.mcpClient = await experimental_createMCPClient({
          transport,
        });

        // Get all tools provided by the MCP EVM server
        this.tools = await this.mcpClient.tools();
        console.log('Successfully connected to MCP EVM server and loaded tools');
        console.log('Available tools:', Object.keys(this.tools));
      } catch (error) {
        console.error('Failed to connect to MCP EVM server:', error);
        this.mcpClient = undefined;
        this.tools = {};
      } finally {
        this.isInitializing = false;
        resolve();
      }
    });

    return this.initPromise;
  }
}

// Create and export a singleton instance
export const mcpManager = MCPClientManager.getInstance();
