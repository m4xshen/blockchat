import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { mcpManager } from '@/lib/mcp-client-manager';

export const maxDuration = 120;

const systemMessage = `
When asked about ANY of the following, YOU MUST USE THE APPROPRIATE TOOL:
- Cryptocurrency balances or token information
- ENS name resolution
- Blockchain transactions or blocks
- Smart contract data
- Token transfers, swap, bridge or approvals
- Gas prices or network status

CRITICAL INSTRUCTIONS:
1. DO NOT make up blockchain data. ALWAYS use the tools to fetch accurate, real-time information.
2. Only answer what user asked.
3. DO NOT include introductory text like "I'll help you..." or "Let me check..." before using tools.
4. After using a tool, directly provide the result without any preamble.
5. When providing blockchain addresses or transaction hashes, render them as markdown links where the link text is the hash itself, pointing to the appropriate block explorer (e.g., Etherscan for Ethereum). Determine the correct explorer based on the context or the chain ID involved.
`;

export async function POST(req: Request) {
  const { messages } = await req.json();
  await mcpManager.getClient();
  const tools = mcpManager.getTools();

  try {
    const result = streamText({
      model: anthropic('claude-3-5-haiku-20241022'),
      system: systemMessage,
      messages,
      tools,
      maxSteps: 10,
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('Error in chat request:', error);
    return new Response(JSON.stringify({ error: error.message || 'An error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
