import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEVMResources } from "../core/resources.js";
import { registerEVMTools } from "../core/tools.js";
import { registerEVMPrompts } from "../core/prompts.js";
import { getSupportedNetworks } from "../core/chains.js";
import * as dotenv from "dotenv";
import { join } from "path";
import { existsSync } from "fs";

// Load environment variables from .local.env file
const envPath = join(process.cwd(), ".local.env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.error("Loaded environment variables from .local.env");
} else {
  console.error("Warning: .local.env file not found. Create one from .local.env.example for private key configuration.");
}

// Create and start the MCP server
async function startServer() {
  try {
    // Create a new MCP server instance
    const server = new McpServer({
      name: "EVM-Server",
      version: "1.0.0"
    });

    // Register all resources, tools, and prompts
    registerEVMResources(server);
    registerEVMTools(server);
    registerEVMPrompts(server);
    
    // Log server information
    console.error(`EVM MCP Server initialized`);
    console.error(`Supported networks: ${getSupportedNetworks().join(", ")}`);
    console.error("Server is ready to handle requests");
    
    return server;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Export the server creation function
export default startServer; 