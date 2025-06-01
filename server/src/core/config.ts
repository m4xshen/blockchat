// Configuration for environment variables

/**
 * Get the private key from environment variables
 * This allows the system to use a private key without exposing it to the LLM
 */
export function getPrivateKey(): string {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('WALLET_PRIVATE_KEY environment variable is not set. Please add it to your .local.env file.');
  }
  
  // Return the private key, ensuring it has the 0x prefix
  return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
}

/**
 * Get a specific environment variable
 * @param name The name of the environment variable
 * @param required Whether the variable is required (throws error if missing)
 * @param defaultValue Default value if not required and not found
 */
export function getEnv(name: string, required = true, defaultValue?: string): string {
  const value = process.env[name];
  
  if (!value && required) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  
  return value || defaultValue || '';
}
