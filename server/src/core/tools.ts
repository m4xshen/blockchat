import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as services from "./services/index.js";
import { type Address, type Hex, type Hash, parseEther, getAddress } from 'viem';
import { getChain, getRpcUrl, getSupportedNetworks } from "./chains.js"; // Assuming getChain is exported from chains.js
import { normalize } from 'viem/ens';
import axios from 'axios';
import { type RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { type TokenInfo } from '@across-protocol/app-sdk';

const acrossClient = services.getAcrossClient();
const chains = await acrossClient.getSupportedChains({});

// Omit type helper if not available from a project-wide utility library
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Register all EVM-related tools with the MCP server
 * 
 * All tools that accept Ethereum addresses also support ENS names (e.g., 'vitalik.eth').
 * ENS names are automatically resolved to addresses using the Ethereum Name Service.
 * 
 * @param server The MCP server instance
 */
export function registerEVMTools(server: McpServer) {
  // NETWORK INFORMATION TOOLS

  // Bridge Native ETH Tool
  server.tool(
    "bridge_native_eth_across",
    "Bridges native ETH between mainnet and L2s (Optimism, Arbitrum) using Across Protocol.",
    {
      originNetwork: z.string().min(1, 'Origin network is required'),
      destinationNetwork: z.string().min(1, 'Destination network is required'),
      amountInEth: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: "Amount must be a positive number string (e.g., '0.1')",
      }),
    },
    async (input): Promise<{ content: { type: 'text', text: string }[], isError?: boolean, depositTxHash?: Hash }> => {
      // Input validation is expected to be handled by the MCP server based on the schema above.
      const { originNetwork, destinationNetwork, amountInEth } = input;

      const privateKey = process.env.WALLET_PRIVATE_KEY;
      if (!privateKey) {
        return { content: [{ type: 'text', text: "WALLET_PRIVATE_KEY environment variable is not set." }], isError: true };
      }
      const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;

      const acrossClient = services.getAcrossClient();
      const originChain = getChain(originNetwork);
      const destinationChain = getChain(destinationNetwork);

      if (!originChain) {
        return { content: [{ type: 'text', text: `Unsupported origin network: ${originNetwork}` }], isError: true };
      }
      if (!destinationChain) {
        return { content: [{ type: 'text', text: `Unsupported destination network: ${destinationNetwork}` }], isError: true };
      }

      const wethAddresses: Record<number, Address> = {
        [1]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Mainnet WETH
        [10]: "0x4200000000000000000000000000000000000006", // Optimism WETH
        [42161]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum WETH
      };

      const inputTokenAddress = wethAddresses[originChain.id];
      const outputTokenAddress = wethAddresses[destinationChain.id];

      if (!inputTokenAddress) {
        return { content: [{ type: 'text', text: `WETH address not configured for origin chain ID: ${originChain.id}` }], isError: true };
      }
      if (!outputTokenAddress) {
        return { content: [{ type: 'text', text: `WETH address not configured for destination chain ID: ${destinationChain.id}` }], isError: true };
      }

      console.log(`Attempting to bridge ${amountInEth} ETH from ${originNetwork} to ${destinationNetwork}`);

      const quote = await acrossClient.getQuote({
        route: {
          originChainId: originChain.id,
          destinationChainId: destinationChain.id,
          inputToken: inputTokenAddress,
          outputToken: outputTokenAddress,
          isNative: true, 
        },
        inputAmount: parseEther(amountInEth),
      });

      console.log('Quote received:', quote);

      const walletClient = services.getWalletClient(formattedKey, originChain.id);
      if (!walletClient.account) {
        return { content: [{ type: 'text', text: "Failed to initialize wallet client with an account." }], isError: true };
      }

      return new Promise((resolve, reject) => {
        acrossClient.executeQuote({
          walletClient: walletClient, 
          deposit: quote.deposit,
          onProgress: (progress) => {
            console.log(`Bridging progress: step=${progress.step}, status=${progress.status}`);
            if (progress.step === "approve" && progress.status === "txSuccess") {
              console.log('Approval successful. Tx:', progress.txReceipt?.transactionHash);
            }
            if (progress.step === "deposit" && progress.status === "txSuccess") {
              console.log('Deposit successful. Tx:', progress.txReceipt?.transactionHash, 'Deposit ID:', progress.depositId);
              if (progress.txReceipt?.transactionHash) {
                resolve({
                  content: [{ type: 'text', text: `Successfully initiated ETH bridge. Deposit Tx: ${progress.txReceipt.transactionHash}` }],
                  depositTxHash: progress.txReceipt.transactionHash
                });
              } else {
                reject({ content: [{ type: 'text', text: "Deposit transaction successful but no transaction hash found." }], isError: true });
              }
            }
            if (progress.step === "fill" && progress.status === "txSuccess") {
              console.log('Fill successful. Tx:', progress.txReceipt?.transactionHash, 'Action Success:', progress.actionSuccess);
            }
            if (progress.status === "txError" || progress.status === "error") {
              console.error('Bridging error:', progress);
              reject({ content: [{ type: 'text', text: `Bridging failed at step ${progress.step}. Reason: ${progress.error || 'Unknown error'}` }], isError: true });
            }
          },
        }).catch(error => {
          console.error('Error executing quote:', error);
          reject({ content: [{ type: 'text', text: `Error executing quote: ${error instanceof Error ? error.message : String(error)}` }], isError: true });
        });
      });
    }
  );
  
  // Get chain information
  server.tool(
    "get_chain_info",
    "Get information about an EVM network",
    {
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ network = "ethereum" }) => {
      try {
        const chainId = await services.getChainId(network);
        const blockNumber = await services.getBlockNumber(network);
        const rpcUrl = getRpcUrl(network);
        
        return {
          content: [{
            type: "text",
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
          content: [{
            type: "text",
            text: `Error fetching chain info: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // ENS LOOKUP TOOL
  
  // Resolve ENS name to address
  server.tool(
    "resolve_ens",
    "Resolve an ENS name to an Ethereum address",
    {
      ensName: z.string().describe("ENS name to resolve (e.g., 'vitalik.eth')"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. ENS resolution works best on Ethereum mainnet. Defaults to Ethereum mainnet.")
    },
    async ({ ensName, network = "ethereum" }) => {
      try {
        // Validate that the input is an ENS name
        if (!ensName.includes('.')) {
          return {
            content: [{
              type: "text",
              text: `Error: Input "${ensName}" is not a valid ENS name. ENS names must contain a dot (e.g., 'name.eth').`
            }],
            isError: true
          };
        }
        
        // Normalize the ENS name
        const normalizedEns = normalize(ensName);
        
        // Resolve the ENS name to an address
        const address = await services.resolveAddress(ensName, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ensName: ensName,
              normalizedName: normalizedEns,
              resolvedAddress: address,
              network
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error resolving ENS name: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get supported networks
  server.tool(
    "get_supported_networks",
    "Get a list of supported EVM networks",
    {},
    async () => {
      try {
        const networks = getSupportedNetworks();
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              supportedNetworks: networks
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching supported networks: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // BLOCK TOOLS
  
  // Get block by number
  server.tool(
    "get_block_by_number",
    "Get a block by its block number",
    {
      blockNumber: z.number().describe("The block number to fetch"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ blockNumber, network = "ethereum" }) => {
      try {
        const block = await services.getBlockByNumber(blockNumber, network);
        
        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching block ${blockNumber}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get latest block
  server.tool(
    "get_latest_block",
    "Get the latest block from the EVM",
    {
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ network = "ethereum" }) => {
      try {
        const block = await services.getLatestBlock(network);
        
        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching latest block: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // BALANCE TOOLS
  
  // Get ETH balance
  server.tool(
    "get_balance",
    "Get the native token balance (ETH, MATIC, etc.) for an address", 
    {
      address: z.string().describe("The wallet address or ENS name (e.g., '0x1234...' or 'vitalik.eth') to check the balance for"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ address, network = "ethereum" }) => {
      try {
        const balance = await services.getETHBalance(address, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              network,
              wei: balance.wei.toString(),
              ether: balance.ether
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 balance
  server.tool(
    "get_erc20_balance",
    "Get the ERC20 token balance of an Ethereum address",
    {
      address: z.string().describe("The Ethereum address to check"),
      tokenAddress: z.string().describe("The ERC20 token contract address"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ address, tokenAddress, network = "ethereum" }) => {
      try {
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              tokenAddress,
              network,
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
          content: [{
            type: "text",
            text: `Error fetching ERC20 balance for ${address}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token balance
  server.tool(
    "get_token_balance",
    "Get the balance of an ERC20 token for an address",
    {
      tokenAddress: z.string().describe("The contract address or ENS name of the ERC20 token (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' for USDC or 'uniswap.eth')"),
      ownerAddress: z.string().describe("The wallet address or ENS name to check the balance for (e.g., '0x1234...' or 'vitalik.eth')"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ tokenAddress, ownerAddress, network = "ethereum" }) => {
      try {
        const balance = await services.getERC20Balance(tokenAddress, ownerAddress, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tokenAddress,
              owner: ownerAddress,
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
          content: [{
            type: "text",
            text: `Error fetching token balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // TRANSACTION TOOLS
  
  // Get transaction by hash
  server.tool(
    "get_transaction",
    "Get detailed information about a specific transaction by its hash. Includes sender, recipient, value, data, and more.",
    {
      txHash: z.string().describe("The transaction hash to look up (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', 'polygon') or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ txHash, network = "ethereum" }) => {
      try {
        const tx = await services.getTransaction(txHash as Hash, network);
        
        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(tx)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching transaction ${txHash}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get transaction receipt
  server.tool(
    "get_transaction_receipt",
    "Get a transaction receipt by its hash",
    {
      txHash: z.string().describe("The transaction hash to look up"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ txHash, network = "ethereum" }) => {
      try {
        const receipt = await services.getTransactionReceipt(txHash as Hash, network);
        
        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(receipt)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching transaction receipt ${txHash}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Estimate gas
  server.tool(
    "estimate_gas",
    "Estimate the gas cost for a transaction",
    {
      to: z.string().describe("The recipient address"),
      value: z.string().optional().describe("The amount of ETH to send in ether (e.g., '0.1')"),
      data: z.string().optional().describe("The transaction data as a hex string"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ to, value, data, network = "ethereum" }) => {
      try {
        const params: any = { to: to as Address };
        
        if (value) {
          params.value = services.helpers.parseEther(value);
        }
        
        if (data) {
          params.data = data as `0x${string}`;
        }
        
        const gas = await services.estimateGas(params, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              network,
              estimatedGas: gas.toString()
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error estimating gas: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // TRANSFER TOOLS
  
  // Transfer ETH
  server.tool(
    "transfer_eth",
    "Transfer native tokens (ETH, MATIC, etc.) to an address",
    {
      to: z.string().describe("The recipient address or ENS name (e.g., '0x1234...' or 'vitalik.eth')"),
      amount: z.string().describe("Amount to send in ETH (or the native token of the network), as a string (e.g., '0.1')"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ to, amount, network = "ethereum" }) => {
      try {
        // Get private key from environment variable
        const privateKey = process.env.WALLET_PRIVATE_KEY;
        if (!privateKey) {
          return {
            content: [{
              type: "text",
              text: `Error: WALLET_PRIVATE_KEY environment variable is not set. Please add it to your .local.env file.`
            }],
            isError: true
          };
        }
        
        const txHash = await services.transferETH(privateKey, to, amount, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash,
              to,
              amount,
              network
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring ETH: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer ERC20
  server.tool(
    "transfer_erc20",
    "Transfer ERC20 tokens to another address",
    {
      tokenAddress: z.string().describe("The address of the ERC20 token contract"),
      toAddress: z.string().describe("The recipient address"),
      amount: z.string().describe("The amount of tokens to send (in token units, e.g., '10' for 10 tokens)"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ tokenAddress, toAddress, amount, network = "ethereum" }) => {
      try {
        // Get private key from environment variable
        const privateKey = process.env.WALLET_PRIVATE_KEY;
        if (!privateKey) {
          return {
            content: [{
              type: "text",
              text: `Error: WALLET_PRIVATE_KEY environment variable is not set. Please add it to your .local.env file.`
            }],
            isError: true
          };
        }
        
        // Get the formattedKey with 0x prefix
        const formattedKey = privateKey.startsWith('0x') 
          ? privateKey as `0x${string}` 
          : `0x${privateKey}` as `0x${string}`;
        
        const result = await services.transferERC20(
          tokenAddress as Address, 
          toAddress as Address, 
          amount,
          formattedKey,
          network
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              tokenAddress,
              recipient: toAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring ERC20 tokens: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Approve ERC20 token spending
  server.tool(
    "approve_token_spending",
    "Approve another address (like a DeFi protocol or exchange) to spend your ERC20 tokens. This is often required before interacting with DeFi protocols.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC20 token to approve for spending (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' for USDC on Ethereum)"),
      spenderAddress: z.string().describe("The contract address being approved to spend your tokens (e.g., a DEX or lending protocol)"),
      amount: z.string().describe("The amount of tokens to approve in token units, not wei (e.g., '1000' to approve spending 1000 tokens). Use a very large number for unlimited approval."),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', 'polygon') or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ tokenAddress, spenderAddress, amount, network = "ethereum" }) => {
      try {
        // Get private key from environment variable
        const privateKey = process.env.WALLET_PRIVATE_KEY;
        if (!privateKey) {
          return {
            content: [{
              type: "text",
              text: `Error: WALLET_PRIVATE_KEY environment variable is not set. Please add it to your .local.env file.`
            }],
            isError: true
          };
        }
        
        // Get the formattedKey with 0x prefix
        const formattedKey = privateKey.startsWith('0x') 
          ? privateKey as `0x${string}` 
          : `0x${privateKey}` as `0x${string}`;
        
        const result = await services.approveERC20(
          tokenAddress as Address, 
          spenderAddress as Address, 
          amount,
          formattedKey,
          network
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              tokenAddress,
              spender: spenderAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error approving token spending: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer ERC20 tokens
  server.tool(
    "transfer_token",
    "Transfer ERC20 tokens to an address",
    {
      privateKey: z.string().describe("Private key of the sender account in hex format (with or without 0x prefix). SECURITY: This is used only for transaction signing and is not stored."),
      tokenAddress: z.string().describe("The contract address or ENS name of the ERC20 token to transfer (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' for USDC or 'uniswap.eth')"),
      toAddress: z.string().describe("The recipient address or ENS name that will receive the tokens (e.g., '0x1234...' or 'vitalik.eth')"),
      amount: z.string().describe("Amount of tokens to send as a string (e.g., '100' for 100 tokens). This will be adjusted for the token's decimals."),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', etc.) or chain ID. Supports all EVM-compatible networks. Defaults to Ethereum mainnet.")
    },
    async ({ privateKey, tokenAddress, toAddress, amount, network = "ethereum" }) => {
      try {
        const result = await services.transferERC20(
          tokenAddress,
          toAddress,
          amount,
          privateKey,
          network
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              tokenAddress,
              toAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol,
              network
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring tokens: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );


  server.tool(
    "swap_tokens_1inch",
    "Swaps tokens on a given EVM network using the 1inch Aggregation Protocol to find the best rates. Requires ONEINCH_API_KEY and WALLET_PRIVATE_KEY environment variables.",
    {
      fromTokenAddress: z.string().describe("Contract address of the token to swap from (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' for USDC). Use '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' for native ETH."),
      toTokenAddress: z.string().describe("Contract address of the token to swap to. Use '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' for native ETH."),
      amount: z.string().describe("The amount of the fromToken to swap, in its smallest units (e.g., wei for ETH, or amount * 10^decimals for ERC20 tokens)."),
      network: z.string().optional().default("ethereum").describe("Network name (e.g., 'ethereum', 'polygon', 'bsc', 'optimism', 'arbitrum') or chain ID. Defaults to Ethereum mainnet."),
      slippage: z.number().min(0.01).max(50).default(1).describe("Slippage tolerance percentage (e.g., 1 for 1%). Min 0.01, Max 50. Defaults to 1%."),
    },
    async function (
      this: RequestHandlerExtra, // Ensure 'this' is typed, even if not using this.progress
      input
    ): Promise<{ content: { type: 'text', text: string }[], isError?: boolean, transactionHash?: Hash }> {
      const { fromTokenAddress, toTokenAddress, amount, network, slippage } = input;

      const { ONEINCH_API_KEY, WALLET_PRIVATE_KEY } = process.env;
      if (!ONEINCH_API_KEY) {
        console.error('swap_tokens_1inch: ONEINCH_API_KEY is not set.');
        return { content: [{ type: 'text', text: 'Server configuration error: Missing 1inch API key.' }], isError: true };
      }
      if (!WALLET_PRIVATE_KEY) {
        console.error('swap_tokens_1inch: WALLET_PRIVATE_KEY is not set.');
        return { content: [{ type: 'text', text: 'Server configuration error: Missing wallet private key.' }], isError: true };
      }
      const formattedPk = (WALLET_PRIVATE_KEY.startsWith('0x') ? WALLET_PRIVATE_KEY : `0x${WALLET_PRIVATE_KEY}`) as Hex;

      const apiKey = process.env.ONEINCH_API_KEY;
      if (!apiKey) {
        console.error('swap_tokens_1inch: ONEINCH_API_KEY is not set.');
        return { content: [{ type: 'text', text: 'Server configuration error: Missing 1inch API key.' }], isError: true };
      }

      const chain = getChain(network);
      if (!chain) {
        const errorMsg = `Unsupported network: ${network}`;
        console.error(`swap_tokens_1inch: ${errorMsg}`);
        return { content: [{ type: 'text', text: errorMsg }], isError: true };
      }
      const chainId = chain.id;

      const walletClient = services.getWalletClient(formattedPk, chainId);
      if (!walletClient.account) {
        const errorMsg = "Failed to initialize wallet client with an account.";
        console.error(`swap_tokens_1inch: ${errorMsg}`);
        return { content: [{ type: 'text', text: errorMsg }], isError: true };
      }
      const fromWalletAddress = walletClient.account.address;

      const API_BASE_URL = `https://api.1inch.dev/swap/v6.0/${chainId}`;
      const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      };

      try {
        let spenderAddress: Address;
        try {
          const spenderResponse = await axios.get(`${API_BASE_URL}/approve/spender`, { headers });
          spenderAddress = spenderResponse.data.address as Address;
        } catch (e: any) {
          const errorMsg = e.response?.data?.description || e.message || "Unknown error fetching 1inch spender address";
          console.error(`swap_tokens_1inch: Failed to fetch 1inch spender address: ${e instanceof Error ? e.message : String(e)}`);
          return { content: [{ type: 'text', text: `Error fetching 1inch spender: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }

        // Add a delay to potentially help with rate limiting
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await delay(1100); // 2-second delay

        if (fromTokenAddress.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          // In a full implementation, you would call your services.getERC20Allowance here.
          // For now, we'll log that this step is important.
          console.log(`swap_tokens_1inch: Note: Actual allowance check and approval transaction are not implemented in this version. Ensure ${spenderAddress} has sufficient allowance.`);
        } else {
          console.log('swap_tokens_1inch: Skipping allowance check for native ETH.');
        }

        const swapApiParams = {
          src: fromTokenAddress,
          dst: toTokenAddress,
          amount: amount,
          from: fromWalletAddress,
          slippage: slippage,
          // Add other necessary params like: 
          // origin: 'your_project_name', // helps 1inch track usage
          // disableEstimate: true, // if you don't want 1inch to estimate gas, and prefer to do it yourself or let wallet do it
        };

        let swapApiResponseData;
        try {
          const response = await axios.get(`${API_BASE_URL}/swap`, { params: swapApiParams, headers });
          swapApiResponseData = response.data;
        } catch (e: any) {
          const errorDetail = e.response?.data?.description || e.response?.data?.error || e.message;
          const errorMsg = `Error fetching swap data from 1inch: ${errorDetail || 'Unknown error'}`;
          console.error(`swap_tokens_1inch: ${errorMsg}`);
          return { content: [{ type: 'text', text: errorMsg }], isError: true };
        }

        const txData = swapApiResponseData.tx;
        if (!txData || !txData.to || !txData.data || typeof txData.value === 'undefined') {
          const errorMsg = 'Invalid swap data received from 1inch (missing tx fields).';
          console.error(`swap_tokens_1inch: ${errorMsg}`);
          return { content: [{ type: 'text', text: errorMsg }], isError: true };
        }

        const transactionRequest = {
          to: txData.to as Address,
          data: txData.data as Hex,
          value: BigInt(txData.value),
          gas: txData.gas ? BigInt(txData.gas) : undefined,
          // gasPrice: txData.gasPrice ? BigInt(txData.gasPrice) : undefined, // For legacy tx
          // maxFeePerGas, maxPriorityFeePerGas for EIP-1559 if provided by 1inch or estimated separately
          account: walletClient.account,
          chain: chain,
        };

        const hash = await walletClient.sendTransaction(transactionRequest);

        console.log(`swap_tokens_1inch: Swap transaction submitted. Hash: ${hash}`);
        console.log('DEBUG: swap_tokens_1inch - swapApiResponseData:', JSON.stringify(swapApiResponseData, null, 2)); // Log the response for debugging
        
        const toTokenSymbol = swapApiResponseData?.toToken?.symbol || 'Unknown Token';
        const toTokenDecimals = swapApiResponseData?.toToken?.decimals !== undefined ? swapApiResponseData.toToken.decimals : 'N/A';

        return {
          content: [{
            type: 'text',
            text: `Swap transaction submitted. Hash: ${hash}. Expected output: ${swapApiResponseData.toAmount} ${toTokenSymbol} (raw amount, decimals: ${toTokenDecimals})`
          }],
          // To format nicely, you'd use: services.formatTokenAmount(swapApiResponseData.toAmount, swapApiResponseData.toToken.decimals) if available
          transactionHash: hash
        };

      } catch (error: any) {
        const errorMsg = error.shortMessage || error.message || "An unknown error occurred during the swap process.";
        console.error(`swap_tokens_1inch: Swap failed: ${errorMsg}`, error);
        return {
          content: [{ type: 'text', text: `Swap failed: ${errorMsg}` }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token information
  server.tool(
    "get_token_info",
    "Get comprehensive information about an ERC20 token including name, symbol, decimals, total supply, and other metadata. Use this to analyze any token on EVM chains.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC20 token (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' for USDC on Ethereum)"),
      network: z.string().optional().describe("Network name (e.g., 'ethereum', 'optimism', 'arbitrum', 'base', 'polygon') or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ tokenAddress, network = "ethereum" }) => {
      try {
        const tokenInfo = await services.getERC20TokenInfo(tokenAddress as Address, network);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address: tokenAddress,
              network,
              name: tokenInfo.name,
              symbol: tokenInfo.symbol,
              decimals: tokenInfo.decimals,
              totalSupply: tokenInfo.totalSupply.toString(), // Convert BigInt to string
              formattedTotalSupply: tokenInfo.formattedTotalSupply
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching token info: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token balance
  server.tool(
    "get_token_balance_erc20",
    "Get ERC20 token balance for an address",
    {
      address: z.string().describe("The address to check balance for"),
      tokenAddress: z.string().describe("The ERC20 token contract address"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Ethereum mainnet.")
    },
    async ({ address, tokenAddress, network = "ethereum" }) => {
      try {
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              tokenAddress,
              network,
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
          content: [{
            type: "text",
            text: `Error fetching ERC20 balance for ${address}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get Token Contract Address
  server.tool(
    "get_token_contract_address",
    "Gets the ERC20 contract address for a given token symbol on a specified chain.",
    {
      chainIdentifier: z.union([z.string(), z.number()]).describe("The chain name (e.g., 'Ethereum', 'Optimism') or chain ID (e.g., 1, 10)"),
      tokenSymbol: z.string().min(1, 'Token symbol is required').describe("The token symbol (e.g., 'USDC', 'WETH')"),
    },
    async (input): Promise<{ content: { type: 'text', text: string }[], isError?: boolean, contractAddress?: Address }> => {
      const { chainIdentifier, tokenSymbol } = input;

      // The 'chains' variable is available from the module scope, loaded when the module initializes.
      // It contains data from acrossClient.getSupportedChains({})
      const targetChain = chains.find(chain =>
        (typeof chainIdentifier === 'number' && chain.chainId === chainIdentifier) ||
        (typeof chainIdentifier === 'string' && chain.name.toLowerCase() === chainIdentifier.toLowerCase())
      );

      if (!targetChain) {
        return {
          content: [{ type: 'text', text: `Chain '${chainIdentifier}' not found or not supported by Across.` }],
          isError: true
        };
      }

      const normalizedTokenSymbol = tokenSymbol.toLowerCase();
      let foundToken: TokenInfo | undefined = undefined;

      // Search in inputTokens first
      foundToken = targetChain.inputTokens.find(token => token.symbol.toLowerCase() === normalizedTokenSymbol);

      // If not found in inputTokens, search in outputTokens
      if (!foundToken) {
        foundToken = targetChain.outputTokens.find(token => token.symbol.toLowerCase() === normalizedTokenSymbol);
      }

      if (!foundToken) {
        return {
          content: [{ type: 'text', text: `Token symbol '${tokenSymbol}' not found on chain '${targetChain.name}' (ID: ${targetChain.chainId}).` }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: `Contract address for ${tokenSymbol} on ${targetChain.name} (Chain ID: ${targetChain.chainId}) is ${foundToken.address}` }],
        contractAddress: foundToken.address
      };
    }
  );

  // WALLET TOOLS

  // Get address from private key
  server.tool(
    "get_address_from_private_key",
    "Get the EVM address derived from the private key configured in the .local.env file",
    {},
    async () => {
      try {
        // Get private key from environment variable
        const privateKey = process.env.WALLET_PRIVATE_KEY;
        if (!privateKey) {
          return {
            content: [{
              type: "text",
              text: `Error: WALLET_PRIVATE_KEY environment variable is not set. Please add it to your .local.env file.`
            }],
            isError: true
          };
        }
        
        // Ensure the private key has 0x prefix
        const formattedKey = privateKey.startsWith('0x') ? privateKey as Hex : `0x${privateKey}` as Hex;
        
        const address = services.getAddressFromPrivateKey(formattedKey);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deriving address from private key: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
} 