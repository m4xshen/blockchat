import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  type PublicClient,
  type WalletClient, // Generic WalletClient type
  type Hex,
  type Address,
  type Chain,         // Added for explicit typing
  type HttpTransport  // Added for explicit typing
} from 'viem';
import { privateKeyToAccount, type Account } from 'viem/accounts'; // Added 'type Account'
import { mainnet, optimism, arbitrum, base } from 'viem/chains';
import { createAcrossClient, type AcrossClient } from '@across-protocol/app-sdk';
import { getChain, getRpcUrl } from '../chains.js';

// Cache for clients to avoid recreating them for each request
const clientCache = new Map<string, PublicClient>();
let acrossClientInstance: AcrossClient | null = null;

/**
 * Get a public client for a specific network
 */
export function getPublicClient(network = 'ethereum'): PublicClient {
  const cacheKey = String(network);
  
  // Return cached client if available
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }
  
  // Create a new client
  const chain = getChain(network);
  const rpcUrl = getRpcUrl(network);
  
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  
  // Cache the client
  clientCache.set(cacheKey, client);
  
  return client;
}

/**
 * Create a wallet client for a specific network and private key
 */
export function getWalletClient(privateKey: Hex, network: string | number = 'ethereum'): WalletClient<HttpTransport, Chain, Account> {
  const chain = getChain(network);
  const rpcUrl = getRpcUrl(network);
  const account = privateKeyToAccount(privateKey);
  
  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });
}

/**
 * Get an initialized Across Protocol SDK client
 */
export function getAcrossClient(): AcrossClient {
  if (acrossClientInstance) {
    return acrossClientInstance;
  }

  acrossClientInstance = createAcrossClient({
    chains: [mainnet, optimism, arbitrum, base],
  });

  return acrossClientInstance;
}

/**
 * Get an Ethereum address from a private key
 * @param privateKey The private key in hex format (with or without 0x prefix)
 * @returns The Ethereum address derived from the private key
 */
export function getAddressFromPrivateKey(privateKey: Hex): Address {
  const account = privateKeyToAccount(privateKey);
  return account.address;
} 