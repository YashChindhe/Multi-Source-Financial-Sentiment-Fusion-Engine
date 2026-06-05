import { Client as LangSmithClient } from 'langsmith';
import { Pool } from 'pg';
import { fetchMarketPrices, scrapeRecentHeadlines, PriceData, NewsHeadline } from './tools';

// Initialize PG Pool if DB URL is defined
let pool: Pool | null = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
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
  if (headlines.length === 0) return 50; // Neutral fallback

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
    
    // Normalize to -1 to 1 for this headline
    const normalized = itemScore > 0 ? Math.min(1, itemScore * 0.5) : Math.max(-1, itemScore * 0.5);
    totalScore += normalized;
  }

  const average = totalScore / headlines.length; // Range: [-1, 1]
  // Map [-1, 1] to [0, 100]
  return Math.round((average + 1) * 50);
}

// Low-level technical score parser based on prices
function calculateTechnicalScore(prices: PriceData): number {
  const { currentPrice, openPrice, highPrice, lowPrice, previousClose } = prices;

  let score = 50; // start at neutral

  // 1. Daily return percentage
  const dailyReturn = openPrice !== 0 ? (currentPrice - openPrice) / openPrice : 0;
  score += dailyReturn * 500; // e.g. +2% return adds +10 to score

  // 2. Momentum relative to previous close
  const closeReturn = previousClose !== 0 ? (currentPrice - previousClose) / previousClose : 0;
  score += closeReturn * 500;

  // 3. Current position in daily range
  const dailyRange = highPrice - lowPrice;
  if (dailyRange > 0) {
    const rangePosition = (currentPrice - lowPrice) / dailyRange; // [0, 1]
    score += (rangePosition - 0.5) * 20; // e.g. closing at high adds +10, at low subtracts -10
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
 * ReAct Agent Loop utilizing low-level promises and OpenRouter/Gemini API calls.
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

  log(`[RE-ACT AGENT]: Initialized analysis request for ticker [${ticker}]`);

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

  // --- STEP 1: THOUGHT & CONCURRENT TOOLS EXECUTION ---
  log(`[THOUGHT]: I must fetch market prices and financial headlines for ${ticker} in parallel to calculate fusion sentiment.`);
  log(`[ACTION]: Spawning concurrent tasks (Promise.all) for Yahoo Finance API and Google News RSS scraper.`);

  let prices: PriceData;
  let headlines: NewsHeadline[];

  const startTime = Date.now();
  try {
    // Execute concurrent arrays
    const [priceResult, newsResult] = await Promise.all([
      fetchMarketPrices(ticker),
      scrapeRecentHeadlines(ticker)
    ]);

    prices = priceResult;
    headlines = newsResult;
    
    log(`[OBSERVATION]: Successfully retrieved data in ${Date.now() - startTime}ms.`);
    log(`[DATA]: Price metrics - Current: $${prices.currentPrice}, Open: $${prices.openPrice}, High: $${prices.highPrice}, Low: $${prices.lowPrice}`);
    log(`[DATA]: News - Extracted ${headlines.length} active headlines.`);
  } catch (err: any) {
    log(`[ERROR]: Asynchronous data collection failed. Detail: ${err.message}`);
    throw err;
  }

  // --- STEP 2: MATH FUSION CALCULATIONS ---
  log(`[THOUGHT]: Computing math convergence weights. Combining Technical indicators score and VADER sentiment score.`);
  
  const technicalScore = calculateTechnicalScore(prices);
  const sentimentScore = calculateHeadlineSentiment(headlines);
  
  // Weights: 60% sentiment, 40% technicals (custom equation)
  const convergenceScore = Math.round((sentimentScore * 0.6) + (technicalScore * 0.4));
  log(`[OBSERVATION]: Technical Indicator Score: ${technicalScore}/100. Sentiment Analysis Score: ${sentimentScore}/100.`);
  log(`[MATHEMATICAL FUSION]: Equation (Score = Sentiment * 0.6 + Tech * 0.4) => Convergence Score: ${convergenceScore}%`);

  // --- STEP 3: LLM LLING / EXPLANATION RE-ACT STEP ---
  log(`[THOUGHT]: Fetching qualitative explanation from LLM using OpenRouter API to build a complete narrative.`);
  
  let explanation = '';
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  if (apiKey) {
    try {
      const prompt = `You are a Senior Fintech AI Analyst.
Analyze the following financial metrics and recent news items for ${ticker}:
Current Price: $${prices.currentPrice}
Day Range: $${prices.lowPrice} - $${prices.highPrice}
Previous Close: $${prices.previousClose}

Headlines:
${headlines.map((h, i) => `${i + 1}. ${h.title} (Source: ${h.source})`).join('\n')}

Technical score: ${technicalScore}/100
Sentiment score: ${sentimentScore}/100
Faceted Fusion Convergence Score: ${convergenceScore}%

Generate a concise, high-impact trading report outlining:
1. The driving factors behind the convergence score.
2. Market sentiment interpretation.
3. Keep it brief (max 3 sentences).`;

      // Log start of LLM child-run in LangSmith
      let llmRunId = '';
      if (langsmithClient && runId) {
        try {
          const llmRun = await (langsmithClient as any).createRun({
            name: 'OpenRouter Model Execution',
            run_type: 'llm',
            parent_run_id: runId,
            inputs: { prompt },
            extra: { model: model }, // Use extra field instead of model top-level to fit client schema
            project_name: process.env.LANGCHAIN_PROJECT || 'financial-sentiment-fusion-engine'
          });
          llmRunId = llmRun?.id || '';
        } catch (e) {}
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/YashChindhe/Multi-Source-Financial-Sentiment-Fusion-Engine',
          'X-Title': 'Financial Sentiment Fusion Engine'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!res.ok) {
        throw new Error(`OpenRouter HTTP status: ${res.status}`);
      }

      const json = await res.json();
      explanation = json?.choices?.[0]?.message?.content || 'Unable to generate narrative analysis.';
      log(`[OBSERVATION]: Received OpenRouter analysis narrative successfully.`);

      // Update LangSmith child-run
      if (langsmithClient && llmRunId) {
        try {
          await (langsmithClient as any).updateRun(llmRunId, {
            outputs: { response: explanation }
          });
        } catch (e) {}
      }
    } catch (err: any) {
      log(`[WARNING]: OpenRouter API execution failed (${err.message}). Falling back to deterministic narrative.`);
      explanation = getDefaultExplanation(ticker, convergenceScore, technicalScore, sentimentScore);
    }
  } else {
    log(`[INFO]: OPENROUTER_API_KEY environment variable is missing. Executing local analytical narrative generator.`);
    explanation = getDefaultExplanation(ticker, convergenceScore, technicalScore, sentimentScore);
  }

  // --- STEP 4: DB STORAGE ---
  const allLogs = steps.join('\n');
  if (pool) {
    log(`[ACTION]: Saving analytics packet in Neon PostgreSQL Database.`);
    try {
      await pool.query(
        `INSERT INTO fusion_runs (ticker, convergence_score, price_data, headlines, reasoning_logs)
         VALUES ($1, $2, $3, $4, $5)`,
        [ticker, convergenceScore, JSON.stringify(prices), JSON.stringify(headlines), allLogs]
      );
      log(`[OBSERVATION]: Neon Postgres insert transaction succeeded.`);
    } catch (dbErr: any) {
      log(`[WARNING]: Database insert transaction failed: ${dbErr.message}`);
    }
  } else {
    log(`[INFO]: DATABASE_URL missing. Database persistence transaction bypassed.`);
  }

  // Update LangSmith trace run
  if (langsmithClient && runId) {
    try {
      await (langsmithClient as any).updateRun(runId, {
        outputs: {
          ticker,
          convergenceScore,
          explanation
        }
      });
    } catch (e) {}
  }

  log(`[RE-ACT AGENT]: Sequence completed successfully.`);
  return {
    ticker,
    convergenceScore,
    technicalScore,
    sentimentScore,
    priceData: prices,
    headlines,
    explanation
  };
}

function getDefaultExplanation(ticker: string, convergenceScore: number, tech: number, sent: number): string {
  const trend = convergenceScore > 65 ? 'strong bullish momentum' : convergenceScore < 35 ? 'bearish pressure' : 'neutral consolidation';
  return `The fusion engine reports a score of ${convergenceScore}% for ${ticker}, driven by a technical rating of ${tech}/100 and a sentiment rating of ${sent}/100. This indicates ${trend} in the current session.`;
}
