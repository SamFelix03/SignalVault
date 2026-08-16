/**
 * Optional LLM inference — mirrors AgentOrchestrator stage 5 (Somnia inferToolsChat)
 * via Groq's OpenAI-compatible API (cheap + fast).
 */
import { deriveRuleBasedSignal } from './signal-engine.js'
import { formatUsdCents } from './pipeline-context.js'
import { deriveStopPriceCents, normalizeStopPriceCents } from './stop-price.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant'

function dirLabel(d) {
  if (d === 1 || d === '1' || d === 'LONG') return 'LONG'
  if (d === -1 || d === '-1' || d === 'SHORT') return 'SHORT'
  return 'FLAT'
}

function buildUserMessage(ctx, current, strategyPrompt) {
  const dir =
    current.directionNum > 0 ? 'LONG' : current.directionNum < 0 ? 'SHORT' : 'FLAT'
  return [
    'Current market state:',
    `- ETH/USDT spot price: ${formatUsdCents(ctx.fetchedPrice)} (${ctx.fetchedPrice} cents)`,
    `- Funding rate: ${ctx.fetchedFunding.toString()} (8 decimals, raw)`,
    `- Fear & Greed Index: ${ctx.fearGreedIndex}/100`,
    `- Macro headline: ${ctx.newsSummary}`,
    `- Current position: direction=${dir} size=${current.sizeBps}bps`,
    '',
    'Call the appropriate tool with your trading decision.',
    `stopPrice MUST be in USD cents (e.g. ETH at $1,860 → 186000). Long stop ≈ ${deriveStopPriceCents(1, ctx.fetchedPrice)}, short stop ≈ ${deriveStopPriceCents(-1, ctx.fetchedPrice)}.`,
    '',
    `Strategy context: ${strategyPrompt}`,
  ].join('\n')
}

function getGroqConfig() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  return {
    apiKey,
    baseUrl: (process.env.GROQ_BASE_URL ?? GROQ_BASE_URL).replace(/\/$/, ''),
    model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
  }
}

async function callGroq(ctx, current, strategyPrompt) {
  const config = getGroqConfig()
  if (!config) throw new Error('GROQ_API_KEY not set')

  const body = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: [
          strategyPrompt,
          '',
          'You are an autonomous trading strategy agent. Analyze the data and call the appropriate tool.',
          'IMPORTANT: You MUST call exactly one tool. Either updateSignal or emergencyExit.',
          'stopPrice must be USD cents (integer). Example: ETH at $1,860.00 → stopPrice 186000, not 1860.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: buildUserMessage(ctx, current, strategyPrompt),
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'updateSignal',
          description:
            'Update the vault trading signal. direction: 1=LONG, -1=SHORT, 0=FLAT. sizeBps: 0-3000. stopPrice: cents.',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'integer', description: '1 LONG, -1 SHORT, 0 FLAT' },
              sizeBps: { type: 'integer' },
              stopPrice: { type: 'integer', description: 'stop in cents' },
              reasoning: { type: 'string', description: 'one or two sentences explaining the trade' },
            },
            required: ['direction', 'sizeBps', 'stopPrice', 'reasoning'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'emergencyExit',
          description: 'Emergency exit — FLAT all exposure',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string' },
            },
            required: ['reason'],
          },
        },
      },
    ],
    tool_choice: 'required',
    temperature: 0.2,
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
  if (!toolCall?.function?.name) {
    throw new Error('Groq returned no tool call')
  }

  const args = JSON.parse(toolCall.function.arguments)

  if (toolCall.function.name === 'emergencyExit') {
    return {
      direction: 'FLAT',
      directionNum: 0,
      sizeBps: 0,
      stopPrice: BigInt(ctx.fetchedPrice),
      reason: args.reason ?? 'Emergency exit',
      inferenceMode: 'groq',
    }
  }

  const directionNum = Number(args.direction)
  const sizeBps = Number(args.sizeBps)
  const stopPrice = normalizeStopPriceCents(args.stopPrice, ctx.fetchedPrice, directionNum)
  const reason = String(args.reasoning ?? args.reason ?? '')

  return {
    direction: dirLabel(directionNum),
    directionNum,
    sizeBps,
    stopPrice,
    reason,
    inferenceMode: 'groq',
  }
}

/**
 * Stage 5 — infer trade (Groq LLM if configured, else native rule-based fallback).
 */
export async function runInference(ctx, current, strategyPrompt) {
  const mode = (process.env.INFERENCE_MODE ?? 'rules').toLowerCase()

  if (mode === 'llm' && getGroqConfig()) {
    try {
      return await callGroq(ctx, current, strategyPrompt)
    } catch (err) {
      console.warn(`  [Pipeline] Groq inference failed (${err.message}) — falling back to rules`)
    }
  }

  return deriveRuleBasedSignal(ctx)
}

export { DEFAULT_GROQ_MODEL, getGroqConfig }
