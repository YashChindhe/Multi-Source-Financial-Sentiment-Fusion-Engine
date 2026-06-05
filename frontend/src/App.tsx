import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Terminal, 
  Settings, 
  RefreshCw, 
  ExternalLink, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Database,
  Search,
  BookOpen
} from 'lucide-react';

// Get Backend URL from env or fallback to local port
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

interface PriceData {
  ticker: string;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  previousClose: number;
  volume: number;
  timestamp: string;
}

interface NewsHeadline {
  title: string;
  link: string;
  source: string;
  pubDate: string;
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

interface LogMessage {
  id: string;
  text: string;
  timestamp: string;
  type: 'thought' | 'action' | 'observation' | 'error' | 'info' | 'data' | 'system';
}

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'BTC-USD', 'ETH-USD'];

export default function App() {
  const [selectedTicker, setSelectedTicker] = useState('AAPL');
  const [customTicker, setCustomTicker] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Check backend server health on mount
  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    setBackendStatus('checking');
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch {
      setBackendStatus('offline');
    }
  };

  const getLogType = (text: string): LogMessage['type'] => {
    if (text.startsWith('[THOUGHT]')) return 'thought';
    if (text.startsWith('[ACTION]')) return 'action';
    if (text.startsWith('[OBSERVATION]') || text.startsWith('[MATHEMATICAL FUSION]')) return 'observation';
    if (text.startsWith('[ERROR]')) return 'error';
    if (text.startsWith('[DATA]')) return 'data';
    if (text.startsWith('[INFO]')) return 'info';
    return 'system';
  };

  // Run the ReAct Agent SSE pipeline
  const runFusionEngine = (tickerToRun: string) => {
    if (isRunning) return;
    
    setIsRunning(true);
    setResult(null);
    setLogs([
      {
        id: 'init',
        text: `🚀 Initializing SSE connection to ${BACKEND_URL}/api/stream?ticker=${tickerToRun}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'system'
      }
    ]);

    const eventSource = new EventSource(`${BACKEND_URL}/api/stream?ticker=${encodeURIComponent(tickerToRun)}`);

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, {
        id: Math.random().toString(),
        text: `[SYSTEM]: Backend SSE channel established. Ticker: ${data.ticker}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'system'
      }]);
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, {
        id: Math.random().toString(),
        text: data.message,
        timestamp: new Date().toLocaleTimeString(),
        type: getLogType(data.message)
      }]);
    });

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data) as AgentResult;
      setResult(data);
      setLogs(prev => [...prev, {
        id: Math.random().toString(),
        text: `[SYSTEM]: Optimization completed. Convergence Score: ${data.convergenceScore}%`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'info'
      }]);
      eventSource.close();
      setIsRunning(false);
    });

    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse((e as any).data || '{"message": "SSE pipeline connection error"}');
      setLogs(prev => [...prev, {
        id: Math.random().toString(),
        text: `[ERROR]: Agent run aborted: ${data.message}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
      eventSource.close();
      setIsRunning(false);
    });

    eventSource.onerror = () => {
      setLogs(prev => [...prev, {
        id: Math.random().toString(),
        text: `[ERROR]: SSE feed closed unexpectedly. Ready to scan again.`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
      eventSource.close();
      setIsRunning(false);
    };
  };

  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    setCustomTicker('');
    runFusionEngine(ticker);
  };

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTicker.trim()) return;
    const ticker = customTicker.toUpperCase().trim();
    setSelectedTicker(ticker);
    runFusionEngine(ticker);
  };

  // SVG parameters for the Convergence Wheel
  const score = result ? result.convergenceScore : 0;
  const radius = 80;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  // Determine pointer color based on the convergence score
  const getGlowColorClass = (val: number) => {
    if (val >= 65) return 'stroke-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]';
    if (val <= 35) return 'stroke-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]';
    return 'stroke-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]';
  };

  const getTextColorClass = (val: number) => {
    if (val >= 65) return 'text-emerald-400';
    if (val <= 35) return 'text-rose-500';
    return 'text-cyan-400';
  };

  const priceChangePercent = result 
    ? ((result.priceData.currentPrice - result.priceData.previousClose) / result.priceData.previousClose) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-darkBg text-gray-100 flex flex-col selection:bg-neonBlue/30 selection:text-white relative overflow-hidden">
      
      {/* Background Neon Glow Dots */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-neonBlue/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-neonPurple/5 blur-[120px] pointer-events-none" />

      {/* Header Bar */}
      <header className="border-b border-gray-800 bg-darkSurface/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-neonBlue to-neonPurple rounded-xl shadow-lg shadow-neonBlue/10 animate-pulse-glow">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Multi-Source Financial Sentiment Fusion Engine
            </h1>
            <p className="text-xs text-gray-400 font-mono">Framework-Free ReAct Agent Loop</p>
          </div>
        </div>

        {/* Server Status Indicators */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-gray-900/60 px-3 py-1.5 rounded-lg border border-gray-800 text-xs">
            <span className="text-gray-400">Backend:</span>
            {backendStatus === 'online' && (
              <span className="flex items-center text-emerald-400 font-semibold gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                ONLINE
              </span>
            )}
            {backendStatus === 'offline' && (
              <button onClick={checkHealth} className="flex items-center text-rose-500 font-semibold gap-1.5 hover:underline">
                <span className="w-2 h-2 bg-rose-500 rounded-full" />
                OFFLINE (RETRY)
              </button>
            )}
            {backendStatus === 'checking' && (
              <span className="flex items-center text-cyan-400 font-semibold gap-1.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                CHECKING
              </span>
            )}
          </div>
          
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`p-2 rounded-lg border transition-all ${showSettings ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-darkCard border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'}`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Settings Drawer (Conditional) */}
        {showSettings && (
          <div className="col-span-12 glass-panel p-5 rounded-2xl border-cyan-500/20 bg-darkSurface/90 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex-1 space-y-2">
              <h3 className="font-bold text-cyan-400 flex items-center gap-2 text-sm uppercase tracking-wider font-mono">
                <Settings className="w-4 h-4" /> Env & Integration Settings
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">
                The frontend connects directly to the backend SSE endpoint defined below. In production, define <code className="text-cyan-300 font-mono">VITE_BACKEND_URL</code> in your Vercel deployment variables to point to your Railway service.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 min-w-[300px]">
              <div className="flex-1">
                <label className="block text-[10px] text-gray-500 font-mono uppercase mb-1">Backend Connection URL</label>
                <input 
                  type="text" 
                  value={BACKEND_URL} 
                  disabled
                  className="w-full text-xs bg-darkBg border border-gray-800 rounded-lg p-2.5 text-cyan-300 font-mono cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}

        {/* Column 1: Control Panel, Tickers & Gauge (LHS: 4 Columns) */}
        <section className="lg:col-span-4 space-y-6 flex flex-col">
          
          {/* Ticker Taskbar & Custom Search */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col space-y-4">
            <h2 className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> Ticker Taskbar
            </h2>
            
            {/* Quick Grid Ticker Selectors */}
            <div className="grid grid-cols-4 gap-2">
              {DEFAULT_TICKERS.map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => handleTickerSelect(ticker)}
                  disabled={isRunning}
                  className={`py-2 px-1 text-center font-mono font-bold text-xs rounded-lg transition-all ${
                    selectedTicker === ticker
                      ? 'bg-gradient-to-r from-neonBlue to-neonPurple text-white shadow-md shadow-neonBlue/10 scale-105'
                      : 'bg-darkCard border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {ticker}
                </button>
              ))}
            </div>

            {/* Custom Ticker Search Form */}
            <form onSubmit={handleCustomSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="CUSTOM TICKER (E.G. NVDA)"
                  value={customTicker}
                  onChange={(e) => setCustomTicker(e.target.value)}
                  disabled={isRunning}
                  className="w-full pl-9 pr-3 py-2 bg-darkBg border border-gray-800 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isRunning || !customTicker.trim()}
                className="bg-darkCard border border-gray-800 hover:border-gray-700 hover:text-cyan-400 p-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Sentiment Convergence Wheel Panel */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col items-center justify-center relative flex-1 min-h-[300px]">
            <h2 className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase absolute top-4 left-5 flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-neonPurple" /> Convergence Wheel
            </h2>

            {/* Animated Ring Gauge */}
            <div className="relative w-48 h-48 mt-4 flex items-center justify-center">
              
              {/* Spinning background dots */}
              <div className="absolute inset-0 rounded-full border border-dashed border-gray-800/80 animate-spin-slow" />

              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                {/* Track Ring */}
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  className="stroke-gray-800"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {/* Dynamic Value Ring */}
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  className={`transition-all duration-1000 ease-out ${getGlowColorClass(score)}`}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>

              {/* Absolute Central Score Indicator */}
              <div className="absolute text-center">
                {isRunning ? (
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400 font-mono animate-pulse block">ANALYZING</span>
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <span className="text-3xl font-extrabold tracking-tight font-mono">
                      {score}%
                    </span>
                    <span className="block text-[10px] text-gray-500 font-mono tracking-widest uppercase">CONVERGENCE</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-Indicators: Technical vs Sentiment split */}
            <div className="w-full mt-6 grid grid-cols-2 gap-4 border-t border-gray-800/80 pt-5">
              <div className="text-center border-r border-gray-800/80">
                <span className="block text-[10px] text-gray-500 font-mono uppercase">Technical (40%)</span>
                <span className="text-sm font-bold font-mono text-gray-300">
                  {result ? `${result.technicalScore}/100` : '--'}
                </span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] text-gray-500 font-mono uppercase">Sentiment (60%)</span>
                <span className="text-sm font-bold font-mono text-gray-300">
                  {result ? `${result.sentimentScore}/100` : '--'}
                </span>
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={() => runFusionEngine(selectedTicker)}
              disabled={isRunning}
              className="w-full mt-5 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/10 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? `PROCESSING ${selectedTicker}` : `EXECUTE FUSION RUN`}
            </button>
          </div>
        </section>

        {/* Column 2: Logging Terminal, Ticker Stats & News (RHS: 8 Columns) */}
        <section className="lg:col-span-8 space-y-6 flex flex-col min-h-0">
          
          {/* Live Mock-Terminal Logs */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col flex-1 min-h-[350px] max-h-[500px]">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-3">
              <h2 className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" /> Live Asynchronous Monitor
              </h2>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-[10px] text-gray-500 font-mono">STREAMING SESSION</span>
              </div>
            </div>

            {/* Console Screen */}
            <div className="flex-1 bg-gray-950/80 rounded-xl p-4 font-mono text-xs overflow-y-auto terminal-scroll space-y-2.5 border border-gray-900/80">
              {logs.length === 0 ? (
                <div className="text-gray-600 italic h-full flex items-center justify-center">
                  System idle. Select a ticker to initiate concurrent pipeline.
                </div>
              ) : (
                logs.map((log) => {
                  let textClass = 'text-gray-400';
                  if (log.type === 'thought') textClass = 'text-purple-300 font-medium';
                  if (log.type === 'action') textClass = 'text-cyan-300';
                  if (log.type === 'observation') textClass = 'text-emerald-300';
                  if (log.type === 'error') textClass = 'text-rose-400 font-bold';
                  if (log.type === 'data') textClass = 'text-amber-300';
                  if (log.type === 'system') textClass = 'text-cyan-400/70 italic';

                  return (
                    <div key={log.id} className="leading-relaxed border-l-2 border-gray-800 pl-2">
                      <span className="text-[10px] text-gray-600 mr-2">[{log.timestamp}]</span>
                      <span className={textClass}>{log.text}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Results Summary Box */}
          {result && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Numerical Price Metrics Card */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Current Price</span>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-lg font-bold font-mono text-white">${result.priceData.currentPrice}</span>
                    <span className={`text-xs font-mono flex items-center ${priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {priceChangePercent >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {priceChangePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Session Open</span>
                  <span className="block text-lg font-bold font-mono text-gray-300 mt-1">${result.priceData.openPrice}</span>
                </div>

                <div className="glass-panel p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">High / Low Range</span>
                  <span className="block text-sm font-bold font-mono text-gray-300 mt-1.5">
                    ${result.priceData.lowPrice} - ${result.priceData.highPrice}
                  </span>
                </div>

                <div className="glass-panel p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Volume</span>
                  <span className="block text-lg font-bold font-mono text-gray-300 mt-1">{result.priceData.volume.toLocaleString()}</span>
                </div>
              </div>

              {/* Agent Narrative Analysis */}
              <div className="glass-panel p-5 rounded-2xl border-l-4 border-l-neonPurple">
                <h3 className="text-xs font-bold text-purple-400 font-mono tracking-wider uppercase mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Fusion Engine Narrative Interpretation
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed italic">
                  "{result.explanation}"
                </p>
              </div>

              {/* News Feed Grid */}
              <div className="glass-panel p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" /> Scraped Feeds (HTML/RSS Parsed)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.headlines.slice(0, 6).map((item, idx) => (
                    <a
                      key={idx}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-darkCard/50 border border-gray-800/50 hover:border-cyan-500/30 hover:bg-darkCard rounded-xl transition-all flex flex-col justify-between group"
                    >
                      <h4 className="text-xs font-medium text-gray-200 group-hover:text-white line-clamp-2 leading-relaxed">
                        {item.title}
                      </h4>
                      <div className="flex items-center justify-between mt-3 text-[10px] text-gray-500 font-mono">
                        <span>{item.source}</span>
                        <span className="flex items-center gap-1">
                          Source <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

            </div>
          )}

        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-4 text-center text-[10px] text-gray-500 font-mono bg-darkSurface/30 backdrop-blur-md">
        © 2026 Multi-Source Financial Sentiment Fusion Engine. Realized dynamically via ReAct Loop.
      </footer>
    </div>
  );
}
