import dotenv from 'dotenv';
dotenv.config();

export interface PriceData {
  ticker: string;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  previousClose: number;
  volume: number;
  timestamp: string;
}

export interface NewsHeadline {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

/**
 * Task 1: Fetch live ticker market prices using unauthenticated Yahoo Finance endpoints.
 */
export async function fetchMarketPrices(ticker: string): Promise<PriceData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch market data for ticker ${ticker}: Status ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No market data found for ticker ${ticker}`);
  }

  const meta = result.meta;
  const indicators = result.indicators?.quote?.[0] || {};
  
  const open = meta.regularMarketOpen || indicators.open?.[0] || 0;
  const current = meta.regularMarketPrice || 0;
  const previousClose = meta.chartPreviousClose || meta.previousClose || 0;
  const high = indicators.high?.reduce((max: number, val: number) => (val > max ? val : max), current) || current;
  const low = indicators.low?.reduce((min: number, val: number) => (val < min ? val : min), current) || current;
  const volume = indicators.volume?.[0] || 0;

  return {
    ticker,
    currentPrice: parseFloat(current.toFixed(2)),
    openPrice: parseFloat(open.toFixed(2)),
    highPrice: parseFloat(high.toFixed(2)),
    lowPrice: parseFloat(low.toFixed(2)),
    previousClose: parseFloat(previousClose.toFixed(2)),
    volume,
    timestamp: new Date().toISOString()
  };
}

/**
 * Task 2: Concurrently scrape recent text headlines using Google News RSS and Regex parser.
 */
export async function scrapeRecentHeadlines(ticker: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${ticker} stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch headlines RSS for ${ticker}: Status ${response.status}`);
  }

  const xmlText = await response.text();
  
  // Custom framework-free Regex parsing for XML elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>([\s\S]*?)<\/title>/;
  const linkRegex = /<link>([\s\S]*?)<\/link>/;
  const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;

  const headlines: NewsHeadline[] = [];
  let match;
  
  // Extract up to 10 items
  while ((match = itemRegex.exec(xmlText)) !== null && headlines.length < 10) {
    const itemContent = match[1];
    
    const titleMatch = titleRegex.exec(itemContent);
    const linkMatch = linkRegex.exec(itemContent);
    const sourceMatch = sourceRegex.exec(itemContent);
    const pubDateMatch = pubDateRegex.exec(itemContent);

    if (titleMatch && linkMatch) {
      // Decode HTML entities commonly found in title XML
      const title = titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
        
      headlines.push({
        title,
        link: linkMatch[1].trim(),
        source: sourceMatch ? sourceMatch[1].trim() : 'Unknown',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : ''
      });
    }
  }

  return headlines;
}
