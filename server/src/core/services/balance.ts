import { 
  formatEther,
  formatUnits,
  type Address,
  getContract
} from 'viem';
import { getPublicClient } from './clients.js';
import { resolveAddress } from './ens.js';

// Standard ERC20 ABI (minimal for reading)
const erc20Abi = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ type: 'address', name: 'account' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;


/**
 * Get the ETH balance for an address
 * @param addressOrEns Ethereum address or ENS name
 * @param network Network name or chain ID
 * @returns Balance in wei and ether
 */
export async function getETHBalance(
  addressOrEns: string, 
  network = 'ethereum'
): Promise<{ wei: bigint; ether: string }> {
  // Resolve ENS name to address if needed
  const address = await resolveAddress(addressOrEns, network);
  
  const client = getPublicClient(network);
  const balance = await client.getBalance({ address });
  
  return {
    wei: balance,
    ether: formatEther(balance)
  };
}

/**
 * Get the balance of an ERC20 token for an address
 * @param tokenAddressOrEns Token contract address or ENS name
 * @param ownerAddressOrEns Owner address or ENS name
 * @param network Network name or chain ID
 * @returns Token balance with formatting information
 */
export async function getERC20Balance(
  tokenAddressOrEns: string,
  ownerAddressOrEns: string,
  network = 'ethereum'
): Promise<{
  raw: bigint;
  formatted: string;
  token: {
    symbol: string;
    decimals: number;
  }
}> {
  // Resolve ENS names to addresses if needed
  const tokenAddress = await resolveAddress(tokenAddressOrEns, network);
  const ownerAddress = await resolveAddress(ownerAddressOrEns, network);
  
  const publicClient = getPublicClient(network);

  const contract = getContract({
    address: tokenAddress,
    abi: erc20Abi,
    client: publicClient,
  });

  const [balance, symbol, decimals] = await Promise.all([
    contract.read.balanceOf([ownerAddress]),
    contract.read.symbol(),
    contract.read.decimals()
  ]);

  return {
    raw: balance,
    formatted: formatUnits(balance, decimals),
    token: {
      symbol,
      decimals
    }
  };
}