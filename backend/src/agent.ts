import { Client as LangSmithClient } from 'langsmith';
import { Pool } from 'pg';
import { fetchMarketPrices, scrapeRecentHeadlines, PriceData, NewsHeadline } from './tools';

// Initialize PG Pool if DB URL is defined
let pool: Pool | null = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// Initialize LangSmith client if API key is defined
let langsmithClient: LangSmithClient | null = null;
if (process.env.LANGCHAIN_API_KEY && process.env.LANGCHAIN_TRACING_V2 === 'true') {
  langsmithClient = new LangSmithClient({
    apiKey: process.env.LANGCHAIN_API_KEY,
    apiUrl: process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com'
  });
}

// Initialize Neon database table
export async function initializeDatabase() {
  if (!pool) return;
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS fusion_runs (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(10) NOT NULL,
        convergence_score NUMERIC(5, 2) NOT NULL,
        price_data JSONB NOT NULL,
        headlines JSONB NOT NULL,
        reasoning_logs TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    client.release();
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Low-level VADER-lite sentiment analyzer
function calculateHeadlineSentiment(headlines: NewsHeadline[]): number {
  if (headlines.length === 0) return 50;

  const positiveWords = new Set(['bullish', 'gain', 'profit', 'rise', 'surge', 'beat', 'growth', 'record', 'buy', 'up', 'positive', 'success', 'expand', 'strong', 'outperform']);
  const negativeWords = new Set(['bearish', 'drop', 'loss', 'fall', 'slip', 'miss', 'decline', 'plunge', 'sell', 'down', 'negative', 'fail', 'shrink', 'weak', 'underperform', 'lawsuit', 'investigation']);

  let totalScore = 0;
  for (const item of headlines) {
    const tokens = item.title.toLowerCase().split(/\W+/);
    let itemScore = 0;
    for (const token of tokens) {
      if (positiveWords.has(token)) itemScore += 1.5;
      if (negativeWords.has(token)) itemScore -= 1.5;
    }
    const normalized = itemScore > 0 ? Math.min(1, itemScore * 0.5) : Math.max(-1, itemScore * 0.5);
    totalScore += normalized;
  }
  return Math.round(((totalScore / headlines.length) + 1) * 50);
}

// Low-level technical score parser based on prices
function calculateTechnicalScore(prices: PriceData): number {
  const { currentPrice, openPrice, highPrice, lowPrice, previousClose } = prices;
  let score = 50;

  const dailyReturn = openPrice !== 0 ? (currentPrice - openPrice) / openPrice : 0;
  score += dailyReturn * 500;

  const closeReturn = previousClose !== 0 ? (currentPrice - previousClose) / previousClose : 0;
  score += closeReturn * 500;

  const dailyRange = highPrice - lowPrice;
  if (dailyRange > 0) {
    const rangePosition = (currentPrice - lowPrice) / dailyRange;
    score += (rangePosition - 0.5) * 20;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

interface AgentResult {
  ticker: string;
  convergenceScore: number;
  technicalScore: number;
  sentimentScore: number;
  priceData: PriceData;
  headlines: NewsHeadline[];
  explanation: string;
}

/**
 * True ReAct Agent Execution Loop (Thought ➔ Action ➔ Observation) using OpenRouter / LLM.
 */
export async function runAgentLoop(
  ticker: string,
  sendEvent: (event: string, data: any) => void
): Promise<AgentResult> {
  const steps: string[] = [];
  const log = (msg: string) => {
    steps.push(msg);
    sendEvent('log', { message: msg });
  };

  log(`[RE-ACT AGENT]: Initializing true agentic reasoning loop for ticker [${ticker}]`);

  // Start LangSmith trace run if enabled
  let runId = '';
  if (langsmithClient) {
    try {
      const run = await (langsmithClient as any).createRun({
        name: `Fusion Engine ReAct Loop - ${ticker}`,
        run_type: 'chain',
        inputs: { ticker },
        project_name: process.env.LANGCHAIN_PROJECT || 'financial-sentiment-fusion-engine'
      });
      runId = run?.id || '';
    } catch (e) {
      console.warn('LangSmith tracing init error:', e);
    }
  }

  // Define local tool memory variables
  let priceData: PriceData | null = null;
  let headlines: NewsHeadline[] = [];
  let technicalScore = 50;
  let sentimentScore = 50;
  let convergenceScore = 50;

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.LLM_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
  const apiBase = process.env.LLM_API_BASE || 'https://openrouter.ai/api/v1';

  let agentScratchpad = '';
  let finalResponse = '';
  let loopCount = 0;
  const maxIterations = 4;

  const systemPrompt = `You are a Senior Fintech AI Analyst operating inside a strict ReAct reasoning framework.
Your task is to analyze the ticker "${ticker}" and provide a synthesis report including a math-fused Convergence Score (0-100%).

You have access to the following tools:
1. fetch_market_prices(ticker) - Fetches stock price data.
2. scrape_news_headlines(ticker) - Scrapes recent news headlines.
3. calculate_fusion_index(ticker) - Integrates the price and news results to compute the final convergence score.

You MUST follow this EXACT format step-by-step. Output ONLY ONE Thought and ONE Action per response, then STOP. 
Do not output multiple thoughts at once. Do not write the Observation yourself. The environment will run the tool and output the Observation.

Format:
Thought: <what you need to do next. Single sentence only>
Action: <tool_name>(${ticker})

Example Turn 1:
Thought: I need to fetch the market price data for ${ticker}.
Action: fetch_market_prices(${ticker})

(Wait for Observation from environment)

Example Turn 2:
Thought: I need to scrape news headlines for ${ticker}.
Action: scrape_news_headlines(${ticker})

(Wait for Observation from environment)

Example Turn 3:
Thought: I will calculate the consolidated technical and sentiment convergence index now.
Action: calculate_fusion_index(${ticker})

(Wait for Observation from environment)

Example Turn 4:
Thought: I have synthesized the technical score and sentiment index. I am ready to formulate the final answer.
Final Answer: <concise 2 sentence report summary> [Convergence: <score>%]`;

  // True ReAct loop execution
  if (apiKey) {
    try {
      while (loopCount < maxIterations) {
        loopCount++;
        const currentPrompt = `${systemPrompt}\n\nThis is your scratchpad history:\n${agentScratchpad}\n\nNext Step (Output Thought and Action, or Thought and Final Answer):`;

        // Inform user we are querying the LLM to prevent the page from looking hung
        log(`[SYSTEM]: Querying LLM Gateway (${model}) for ReAct step ${loopCount}...`);

        // Log LLM call in LangSmith
        let llmRunId = '';
        if (langsmithClient && runId) {
          try {
            const llmRun = await (langsmithClient as any).createRun({
              name: `ReAct Iteration ${loopCount}`,
              run_type: 'llm',
              parent_run_id: runId,
              inputs: { prompt: currentPrompt },
              extra: { model: model },
              project_name: process.env.LANGCHAIN_PROJECT || 'financial-sentiment-fusion-engine'
            });
            llmRunId = llmRun?.id || '';
          } catch (e) {}
        }

        const res = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/YashChindhe/Multi-Source-Financial-Sentiment-Fusion-Engine',
            'X-Title': 'Financial Sentiment Fusion Engine'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: currentPrompt }],
            temperature: 0.1
          })
        });

        if (!res.ok) {
          throw new Error(`LLM Gateway error: ${res.status}`);
        }

        const json = await res.json();
        const outputText = json?.choices?.[0]?.message?.content || '';

        // Update LangSmith iteration output
        if (langsmithClient && llmRunId) {
          try {
            await (langsmithClient as any).updateRun(llmRunId, {
              outputs: { response: outputText }
            });
          } catch (e) {}
        }

        // Parse thoughts, actions and final answers
        const lines = outputText.split('\n');
        let thought = '';
        let action = '';
        let finalAnswer = '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Thought:')) {
            thought = trimmed;
            log(trimmed);
          } else if (trimmed.startsWith('Action:')) {
            action = trimmed;
          } else if (trimmed.startsWith('Final Answer:')) {
            finalAnswer = trimmed;
          }
        }

        // Fallbacks for unstructured LLM responses
        if (!thought && !action && !finalAnswer) {
          if (outputText.includes('Final Answer:')) {
            const index = outputText.indexOf('Final Answer:');
            finalAnswer = outputText.substring(index).split('\n')[0].trim();
            log(`Thought: Constructing final answer.`);
          } else {
            // Check if model returned a direct action in plain text
            const firstLine = lines.find((l: string) => l.trim().length > 0) || '';
            thought = `Thought: ${firstLine}`;
            log(thought);
          }
        }

        agentScratchpad += `\n${outputText}`;

        // 1. Check for Final Answer
        if (finalAnswer || outputText.includes('Final Answer:')) {
          const finalMatch = outputText.match(/Final Answer:\s*([\s\S]*)/i);
          finalResponse = finalMatch ? finalMatch[1].trim() : (finalAnswer || outputText);
          log(`[OBSERVATION]: Final Answer compiled.`);
          break;
        }

        // 2. Parse and Execute Action
        let toolName = '';
        let toolArg = ticker;

        const actionMatch = action.match(/Action:\s*(\w+)\(([^)]+)\)/i) || outputText.match(/Action:\s*(\w+)\(([^)]+)\)/i);
        
        if (actionMatch) {
          toolName = actionMatch[1].trim();
          toolArg = actionMatch[2].trim().replace(/['"]/g, '');
        } else {
          // Robust Fallback: If model missed "Action:" tag but discussed tool execution in Thought, force-trigger the logical next tool based on loopCount!
          if (loopCount === 1) {
            toolName = 'fetch_market_prices';
          } else if (loopCount === 2) {
            toolName = 'scrape_news_headlines';
          } else if (loopCount === 3) {
            toolName = 'calculate_fusion_index';
          }
          log(`[WARNING]: No explicit Action tag found. Resolving dynamically to tool call: ${toolName}(${toolArg})`);
        }

        if (toolName) {
          log(`[ACTION]: Executing backend tool ${toolName}(${toolArg})...`);
          let observation = '';

          if (toolName === 'fetch_market_prices') {
            priceData = await fetchMarketPrices(toolArg);
            observation = `Observation: Market data loaded. Current Price: $${priceData.currentPrice}, Open: $${priceData.openPrice}, High: $${priceData.highPrice}, Low: $${priceData.lowPrice}, Vol: ${priceData.volume}`;
          } else if (toolName === 'scrape_news_headlines') {
            headlines = await scrapeRecentHeadlines(toolArg);
            observation = `Observation: Scraped news data. Found ${headlines.length} headlines. Top title: "${headlines[0]?.title || 'none'}"`;
          } else if (toolName === 'calculate_fusion_index') {
            if (!priceData) priceData = await fetchMarketPrices(toolArg);
            if (headlines.length === 0) headlines = await scrapeRecentHeadlines(toolArg);
            technicalScore = calculateTechnicalScore(priceData);
            sentimentScore = calculateHeadlineSentiment(headlines);
            convergenceScore = Math.round((sentimentScore * 0.6) + (technicalScore * 0.4));
            observation = `Observation: Fusion complete. Technical Index: ${technicalScore}/100, Sentiment Index: ${sentimentScore}/100. Consolidated Convergence Score: ${convergenceScore}%`;
          } else {
            observation = `Observation: Error - unknown tool name.`;
          }

          log(`[${toolName.toUpperCase()} RESULT]: ${observation.replace('Observation: ', '')}`);
          agentScratchpad += `\n${observation}`;
        } else {
          const observation = `Observation: No actionable tool found. Proceeding.`;
          log(`[SYSTEM]: ${observation}`);
          agentScratchpad += `\n${observation}`;
        }
      }
    } catch (err: any) {
      log(`[ERROR]: ReAct execution loop failed: ${err.message}. Running fallback mode.`);
      finalResponse = '';
    }
  }

  // --- CRITICAL DATA FAIL-SAFE GUARDRAILS ---
  // If LLM bypassed tools or finished prematurely, guarantee data is scraped/fetched and never returned as 0!
  if (!priceData || headlines.length === 0 || technicalScore === 50) {
    log(`[GUARDRAIL]: Verifying data compilation. Running background tool sync...`);
    try {
      const [fetchedPrices, fetchedHeadlines] = await Promise.all([
        priceData ? Promise.resolve(priceData) : fetchMarketPrices(ticker),
        headlines.length > 0 ? Promise.resolve(headlines) : scrapeRecentHeadlines(ticker)
      ]);
      priceData = fetchedPrices;
      headlines = fetchedHeadlines;
      technicalScore = calculateTechnicalScore(priceData);
      sentimentScore = calculateHeadlineSentiment(headlines);
      convergenceScore = Math.round((sentimentScore * 0.6) + (technicalScore * 0.4));
      log(`[GUARDRAIL RESULT]: Sync complete. Loaded Quotes and ${headlines.length} news items.`);
    } catch (guardrailErr: any) {
      log(`[WARNING]: Guardrail sync failed: ${guardrailErr.message}`);
    }
  }

  // Default explanation fallback
  if (!finalResponse) {
    const trend = convergenceScore > 65 ? 'strong bullish momentum' : convergenceScore < 35 ? 'bearish pressure' : 'neutral consolidation';
    finalResponse = `The fusion engine reports a score of ${convergenceScore}% for ${ticker}, driven by a technical rating of ${technicalScore}/100 and a sentiment rating of ${sentimentScore}/100. This indicates ${trend} in the current session. [Convergence: ${convergenceScore}%]`;
  }

  // Extract score from bracket inside final answer e.g. [Convergence: 72%]
  const bracketMatch = finalResponse.match(/\[Convergence:\s*(\d+)%?\]/i) || finalResponse.match(/(\d+)%/);
  if (bracketMatch) {
    convergenceScore = parseInt(bracketMatch[1]);
  }

  // Save runs into Neon DB
  const allLogs = steps.join('\n');
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO fusion_runs (ticker, convergence_score, price_data, headlines, reasoning_logs)
         VALUES ($1, $2, $3, $4, $5)`,
        [ticker, convergenceScore, JSON.stringify(priceData), JSON.stringify(headlines), allLogs]
      );
      log(`[OBSERVATION]: Saved analysis details in database.`);
    } catch (dbErr: any) {
      console.error('Neon DB Error:', dbErr);
    }
  }

  // Update LangSmith run
  if (langsmithClient && runId) {
    try {
      await (langsmithClient as any).updateRun(runId, {
        outputs: {
          ticker,
          convergenceScore,
          explanation: finalResponse
        }
      });
    } catch (e) {}
  }

  log(`[RE-ACT AGENT]: Pipeline analysis successfully compiled.`);
  return {
    ticker,
    convergenceScore,
    technicalScore,
    sentimentScore,
    priceData: priceData!,
    headlines,
    explanation: finalResponse.replace(/\[Convergence:\s*\d+%?\]/i, '').trim()
  };
}
