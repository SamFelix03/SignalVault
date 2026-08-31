/**
 * Optional LLM inference — mirrors AgentOrchestrator stage 5 (Somnia inferToolsChat)
 * via Groq's OpenAI-compatible API (cheap + fast).
 */
import { deriveRuleBasedSignal } from './signal-engine.js'
import { formatUsdCents } from './pipeline-context.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant'

function dirLabel(d, instrument = 'binary') {
  if (d === 1 || d === '1' || d === 'UP' || d === 'LONG') {
    return instrument === 'perp' ? 'LONG' : 'UP'
  }
  if (d === -1 || d === '-1' || d === 'DOWN' || d === 'SHORT') {
    return instrument === 'perp' ? 'SHORT' : 'DOWN'
  }
  return 'FLAT'
}

function buildUserMessage(ctx, current, strategyPrompt, instrument = 'binary') {
  const dir =
    current.directionNum > 0
      ? instrument === 'perp'
        ? 'LONG'
        : 'UP'
      : current.directionNum < 0
        ? instrument === 'perp'
          ? 'SHORT'
          : 'DOWN'
        : 'FLAT'
  const directionHelp =
    instrument === 'perp'
      ? 'Perpetuals: direction is LONG (bullish), SHORT (bearish), or FLAT (exit).'
      : 'Event contracts: direction is UP (bullish), DOWN (bearish), or FLAT (exit).'
  return [
    'Current market state:',
    `- ETH/USDT spot price: ${formatUsdCents(ctx.fetchedPrice)} (${ctx.fetchedPrice} cents)`,
    `- Funding rate: ${ctx.fetchedFunding.toString()} (8 decimals, raw)`,
    `- Fear & Greed Index: ${ctx.fearGreedIndex}/100`,
    `- Macro headline: ${ctx.newsSummary}`,
    `- Current position: direction=${dir} size=${current.sizeBps}bps`,
    '',
    'Call the appropriate tool with your trading decision.',
    directionHelp,
    'Limit price is chosen from the live market order book — you only decide direction and size.',
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

async function callGroq(ctx, current, strategyPrompt, instrument = 'binary') {
  const config = getGroqConfig()
  if (!config) throw new Error('GROQ_API_KEY not set')

  const isPerp = instrument === 'perp'
  const dirHelp = isPerp
    ? 'Direction: 1=LONG, -1=SHORT, 0=FLAT. sizeBps: 0-3000.'
    : 'Direction: 1=UP, -1=DOWN, 0=FLAT. sizeBps: 0-3000.'

  const body = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: [
          strategyPrompt,
          '',
          `You are an autonomous ${isPerp ? 'perpetuals' : 'event-contracts'} strategy agent. Analyze the data and call the appropriate tool.`,
          'IMPORTANT: You MUST call exactly one tool. Either updateSignal or emergencyExit.',
          dirHelp,
        ].join('\n'),
      },
      {
        role: 'user',
        content: buildUserMessage(ctx, current, strategyPrompt, instrument),
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'updateSignal',
          description:
            `Update the vault trading signal. ${isPerp ? '1=LONG, -1=SHORT' : '1=UP, -1=DOWN'}, 0=FLAT. sizeBps: 0-3000.`,
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'integer', description: isPerp ? '1 LONG, -1 SHORT, 0 FLAT' : '1 UP, -1 DOWN, 0 FLAT' },
              sizeBps: { type: 'integer' },
              reasoning: { type: 'string', description: 'one or two sentences explaining the trade' },
            },
            required: ['direction', 'sizeBps', 'reasoning'],
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
      reason: args.reason ?? 'Emergency exit',
      inferenceMode: 'groq',
    }
  }

  const directionNum = Number(args.direction)
  const sizeBps = Number(args.sizeBps)
  const reason = String(args.reasoning ?? args.reason ?? '')

  return {
    direction: dirLabel(directionNum, instrument),
    directionNum,
    sizeBps,
    reason,
    inferenceMode: 'groq',
  }
}

/**
 * Stage 5 — infer trade (Groq LLM if configured, else native rule-based fallback).
 */
export async function runInference(ctx, current, strategyPrompt, { instrument = 'binary' } = {}) {
  const mode = (process.env.INFERENCE_MODE ?? 'rules').toLowerCase()

  if (mode === 'llm' && getGroqConfig()) {
    try {
      return await callGroq(ctx, current, strategyPrompt, instrument)
    } catch (err) {
      console.warn(`  [Pipeline] Groq inference failed (${err.message}) — falling back to rules`)
    }
  }

  return deriveRuleBasedSignal(ctx, { instrument })
}

export { DEFAULT_GROQ_MODEL, getGroqConfig }
