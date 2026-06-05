import test from 'node:test';
import assert from 'node:assert';
import { fetchMarketPrices, scrapeRecentHeadlines } from './tools';

// Mock values for math equation verification
const mockPrices = {
  ticker: 'AAPL',
  currentPrice: 150.00,
  openPrice: 148.00,
  highPrice: 152.00,
  lowPrice: 147.00,
  previousClose: 149.00,
  volume: 1000000,
  timestamp: new Date().toISOString()
};

const mockHeadlines = [
  { title: 'Bullish news on AAPL stock growth profit', link: 'http://example.com/1', source: 'Reuters', pubDate: '' },
  { title: 'AAPL slides down on bad earnings report loss', link: 'http://example.com/2', source: 'Bloomberg', pubDate: '' },
  { title: 'Record revenues beat street expectations', link: 'http://example.com/3', source: 'CNBC', pubDate: '' }
];

// Helper calculations extracted from agent.ts to test locally
function calculateHeadlineSentiment(headlines: typeof mockHeadlines): number {
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
  const average = totalScore / headlines.length;
  return Math.round((average + 1) * 50);
}

function calculateTechnicalScore(prices: typeof mockPrices): number {
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

test('Task 1: Yahoo Finance Price Fetcher Interface', async () => {
  console.log('Testing price fetcher with ticker AAPL...');
  const prices = await fetchMarketPrices('AAPL');
  
  assert.strictEqual(prices.ticker, 'AAPL');
  assert.ok(typeof prices.currentPrice === 'number' && prices.currentPrice > 0, 'currentPrice must be positive number');
  assert.ok(typeof prices.openPrice === 'number' && prices.openPrice > 0, 'openPrice must be positive number');
  assert.ok(typeof prices.highPrice === 'number' && prices.highPrice >= prices.lowPrice, 'highPrice must exceed lowPrice');
  assert.ok(typeof prices.volume === 'number', 'volume must be a number');
});

test('Task 2: RSS Scraper and Regex XML Parsing Interface', async () => {
  console.log('Testing Google News RSS scraper for AAPL...');
  const headlines = await scrapeRecentHeadlines('AAPL');
  
  assert.ok(Array.isArray(headlines), 'headlines should return an array');
  assert.ok(headlines.length > 0, 'should return at least one news headline');
  
  const sample = headlines[0];
  assert.ok(sample.title && typeof sample.title === 'string', 'headline title should be string');
  assert.ok(sample.link && sample.link.startsWith('http'), 'headline link should start with http');
});

test('Task 3: VADER Sentiment Calculator Logic', () => {
  console.log('Testing lexicon calculations...');
  const sentiment = calculateHeadlineSentiment(mockHeadlines);
  
  // Positives: "Bullish", "growth", "profit" (+3.0) -> Normalizes to +1.0
  // Negatives: "slides", "down", "loss" (-3.0) -> Normalizes to -1.0
  // Neutral/Positive: "Record", "beat" (+3.0) -> Normalizes to +1.0
  // Average: (1.0 - 1.0 + 1.0)/3 = 0.333 -> Maps to (0.333 + 1) * 50 = ~67
  assert.ok(sentiment >= 60 && sentiment <= 70, `Sentiment score calculation out of bounds: ${sentiment}`);
});

test('Task 4: Technical Price Analysis Formula Logic', () => {
  console.log('Testing technical price math indicators...');
  const techScore = calculateTechnicalScore(mockPrices);
  
  // dailyReturn: (150-148)/148 = +1.35% -> adds +6.75
  // closeReturn: (150-149)/149 = +0.67% -> adds +3.35
  // dailyRange: 152-147 = 5. rangePosition: (150-147)/5 = 0.6 -> adds +2
  // Final Score: 50 + 6.75 + 3.35 + 2 = ~62
  assert.ok(techScore >= 60 && techScore <= 65, `Technical score out of bounds: ${techScore}`);
});
