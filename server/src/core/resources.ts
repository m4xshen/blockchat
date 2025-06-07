import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSupportedNetworks, getRpcUrl } from "./chains.js";
import * as services from "./services/index.js";
import type { Address, Hash } from "viem";

/**
 * Register all EVM-related resources
 * @param server The MCP server instance
 */
export function registerEVMResources(server: McpServer) {
  // Get EVM info for a specific network
  server.resource(
    "chain_info_by_network", 
    new ResourceTemplate("evm://{network}/chain", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const chainId = await services.getChainId(network);
        const blockNumber = await services.getBlockNumber(network);
        const rpcUrl = getRpcUrl(network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              chainId,
              blockNumber: blockNumber.toString(),
              rpcUrl
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching chain info: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Default chain info (Ethereum mainnet)
  server.resource(
    "ethereum_chain_info", 
    "evm://chain",
    async (uri) => {
      try {
        const network = "ethereum";
        const chainId = await services.getChainId(network);
        const blockNumber = await services.getBlockNumber(network);
        const rpcUrl = getRpcUrl(network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              chainId,
              blockNumber: blockNumber.toString(),
              rpcUrl
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching chain info: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get block by number for a specific network
  server.resource(
    "evm_block_by_number",
    new ResourceTemplate("evm://{network}/block/{blockNumber}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const blockNumber = params.blockNumber as string;
        const block = await services.getBlockByNumber(parseInt(blockNumber), network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching block: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get block by hash for a specific network
  server.resource(
    "block_by_hash",
    new ResourceTemplate("evm://{network}/block/hash/{blockHash}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const blockHash = params.blockHash as string;
        const block = await services.getBlockByHash(blockHash as Hash, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching block with hash: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get latest block for a specific network
  server.resource(
    "evm_latest_block",
    new ResourceTemplate("evm://{network}/block/latest", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const block = await services.getLatestBlock(network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching latest block: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Default latest block (Ethereum mainnet)
  server.resource(
    "default_latest_block",
    "evm://block/latest",
    async (uri) => {
      try {
        const network = "ethereum";
        const block = await services.getLatestBlock(network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching latest block: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get ETH balance for a specific network
  server.resource(
    "evm_address_native_balance",
    new ResourceTemplate("evm://{network}/address/{address}/balance", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const address = params.address as string;
        const balance = await services.getETHBalance(address as Address, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              address,
              balance: {
                wei: balance.wei.toString(),
                ether: balance.ether
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ETH balance: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Default ETH balance (Ethereum mainnet)
  server.resource(
    "default_eth_balance",
    new ResourceTemplate("evm://address/{address}/eth-balance", { list: undefined }),
    async (uri, params) => {
      try {
        const network = "ethereum";
        const address = params.address as string;
        const balance = await services.getETHBalance(address as Address, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              address,
              balance: {
                wei: balance.wei.toString(),
                ether: balance.ether
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ETH balance: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get ERC20 balance for a specific network
  server.resource(
    "erc20_balance",
    new ResourceTemplate("evm://{network}/address/{address}/token/{tokenAddress}/balance", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const address = params.address as string;
        const tokenAddress = params.tokenAddress as string;
        
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              address,
              tokenAddress,
              balance: {
                raw: balance.raw.toString(),
                formatted: balance.formatted,
                decimals: balance.token.decimals
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ERC20 balance: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Default ERC20 balance (Ethereum mainnet)
  server.resource(
    "default_erc20_balance",
    new ResourceTemplate("evm://address/{address}/token/{tokenAddress}/balance", { list: undefined }),
    async (uri, params) => {
      try {
        const network = "ethereum";
        const address = params.address as string;
        const tokenAddress = params.tokenAddress as string;
        
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              network,
              address,
              tokenAddress,
              balance: {
                raw: balance.raw.toString(),
                formatted: balance.formatted,
                decimals: balance.token.decimals
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ERC20 balance: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get transaction by hash for a specific network
  server.resource(
    "evm_transaction_details",
    new ResourceTemplate("evm://{network}/tx/{txHash}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const txHash = params.txHash as string;
        const tx = await services.getTransaction(txHash as Hash, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(tx)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching transaction: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Default transaction by hash (Ethereum mainnet)
  server.resource(
    "default_transaction_by_hash",
    new ResourceTemplate("evm://tx/{txHash}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = "ethereum";
        const txHash = params.txHash as string;
        const tx = await services.getTransaction(txHash as Hash, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: services.helpers.formatJson(tx)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching transaction: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Get supported networks
  server.resource(
    "supported_networks",
    "evm://networks",
    async (uri) => {
      try {
        const networks = getSupportedNetworks();
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              supportedNetworks: networks
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching supported networks: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Add ERC20 token info resource
  server.resource(
    "erc20_token_details",
    new ResourceTemplate("evm://{network}/token/{tokenAddress}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const tokenAddress = params.tokenAddress as Address;
        
        const tokenInfo = await services.getERC20TokenInfo(tokenAddress, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              address: tokenAddress,
              network,
              ...tokenInfo
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ERC20 token info: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  // Add ERC20 token balance resource
  server.resource(
    "erc20_token_address_balance",
    new ResourceTemplate("evm://{network}/token/{tokenAddress}/balanceOf/{address}", { list: undefined }),
    async (uri, params) => {
      try {
        const network = params.network as string;
        const tokenAddress = params.tokenAddress as Address;
        const address = params.address as Address;
        
        const balance = await services.getERC20Balance(tokenAddress, address, network);
        
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              tokenAddress,
              owner: address,
              network,
              raw: balance.raw.toString(),
              formatted: balance.formatted,
              symbol: balance.token.symbol,
              decimals: balance.token.decimals
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            text: `Error fetching ERC20 token balance: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}