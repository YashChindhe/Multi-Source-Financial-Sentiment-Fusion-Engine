import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Terminal as TerminalIcon, 
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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';

// Get Backend URL from env or fallback to local port
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:8080';

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
              <Button variant="ghost" size="sm" onClick={checkHealth} className="flex items-center text-rose-500 font-semibold gap-1.5 hover:bg-transparent p-0">
                <span className="w-2 h-2 bg-rose-500 rounded-full" />
                OFFLINE (RETRY)
              </Button>
            )}
            {backendStatus === 'checking' && (
              <span className="flex items-center text-cyan-400 font-semibold gap-1.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                CHECKING
              </span>
            )}
          </div>
          
          <Button 
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(!showSettings)} 
            className={showSettings ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'bg-darkCard border-gray-800 text-gray-400'}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Settings Drawer (Conditional) */}
        {showSettings && (
          <Card className="col-span-12 border-cyan-500/20 bg-darkSurface/90 animate-fadeIn">
            <CardHeader className="pb-3">
              <CardTitle className="text-cyan-400 flex items-center gap-2 text-sm uppercase tracking-wider font-mono">
                <Settings className="w-4 h-4" /> Env & Integration Settings
              </CardTitle>
              <CardDescription className="text-xs text-gray-400 leading-relaxed max-w-2xl">
                The frontend connects directly to the backend SSE endpoint defined below. In production, define <code className="text-cyan-300 font-mono">VITE_BACKEND_URL</code> in your Vercel deployment variables to point to your Railway service.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3 md:items-end justify-between">
              <div className="flex-1 min-w-[300px]">
                <label className="block text-[10px] text-gray-500 font-mono uppercase mb-1">Backend Connection URL</label>
                <Input 
                  type="text" 
                  value={BACKEND_URL} 
                  disabled
                  className="text-cyan-300 font-mono cursor-not-allowed border-gray-800"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Column 1: Control Panel, Tickers & Gauge (LHS: 4 Columns) */}
        <section className="lg:col-span-4 space-y-6 flex flex-col">
          
          {/* Ticker Taskbar & Custom Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" /> Ticker Taskbar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Grid Ticker Selectors */}
              <div className="grid grid-cols-4 gap-2">
                {DEFAULT_TICKERS.map((ticker) => (
                  <Button
                    key={ticker}
                    variant={selectedTicker === ticker ? 'neon' : 'ticker'}
                    size="tickerSize"
                    onClick={() => handleTickerSelect(ticker)}
                    disabled={isRunning}
                  >
                    {ticker}
                  </Button>
                ))}
              </div>

              {/* Custom Ticker Search Form */}
              <form onSubmit={handleCustomSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder="CUSTOM TICKER (E.G. NVDA)"
                    value={customTicker}
                    onChange={(e) => setCustomTicker(e.target.value)}
                    disabled={isRunning}
                    className="pl-9 font-mono uppercase"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  disabled={isRunning || !customTicker.trim()}
                  className="hover:text-cyan-400 border-gray-800 bg-darkCard"
                >
                  <Play className="w-3.5 h-3.5" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Sentiment Convergence Wheel Panel */}
          <Card className="flex flex-col items-center justify-center relative flex-1 min-h-[300px] p-6">
            <h2 className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase absolute top-4 left-5 flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-neonPurple" /> Convergence Wheel
            </h2>

            {/* Animated Ring Gauge */}
            <div className="relative w-48 h-48 mt-6 flex items-center justify-center">
              
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
                    <span className={`text-3xl font-extrabold tracking-tight font-mono ${getTextColorClass(score)}`}>
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
            <Button
              variant="neon"
              onClick={() => runFusionEngine(selectedTicker)}
              disabled={isRunning}
              className="w-full mt-5 py-6 rounded-xl text-xs font-mono font-bold"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? `PROCESSING ${selectedTicker}` : `EXECUTE FUSION RUN`}
            </Button>
          </Card>
        </section>

        {/* Column 2: Logging Terminal, Ticker Stats & News (RHS: 8 Columns) */}
        <section className="lg:col-span-8 space-y-6 flex flex-col min-h-0">
          
          {/* Live Mock-Terminal Logs */}
          <Card className="flex flex-col flex-1 min-h-[350px] max-h-[500px]">
            <CardHeader className="border-b border-gray-800 pb-3 mb-3 flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 text-emerald-400" /> Live Asynchronous Monitor
              </CardTitle>
              <div className="flex items-center space-x-1.5 !mt-0">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-[10px] text-gray-500 font-mono">STREAMING SESSION</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-6">
              {/* Console Screen */}
              <div className="h-full bg-gray-950/80 rounded-xl p-4 font-mono text-xs overflow-y-auto terminal-scroll space-y-2.5 border border-gray-900/80">
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
            </CardContent>
          </Card>

          {/* Results Summary Box */}
          {result && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Numerical Price Metrics Card */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Current Price</span>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-lg font-bold font-mono text-white">${result.priceData.currentPrice}</span>
                    <span className={`text-xs font-mono flex items-center ${priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {priceChangePercent >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {priceChangePercent.toFixed(2)}%
                    </span>
                  </div>
                </Card>

                <Card className="p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Session Open</span>
                  <span className="block text-lg font-bold font-mono text-gray-300 mt-1">${result.priceData.openPrice}</span>
                </Card>

                <Card className="p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">High / Low Range</span>
                  <span className="block text-sm font-bold font-mono text-gray-300 mt-1.5">
                    ${result.priceData.lowPrice} - ${result.priceData.highPrice}
                  </span>
                </Card>

                <Card className="p-4 rounded-xl">
                  <span className="block text-[10px] text-gray-500 font-mono uppercase">Volume</span>
                  <span className="block text-lg font-bold font-mono text-gray-300 mt-1">{result.priceData.volume.toLocaleString()}</span>
                </Card>
              </div>

              {/* Agent Narrative Analysis */}
              <Card className="border-l-4 border-l-neonPurple">
                <CardContent className="p-5">
                  <h3 className="text-xs font-bold text-purple-400 font-mono tracking-wider uppercase mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" /> Fusion Engine Narrative Interpretation
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "{result.explanation}"
                  </p>
                </CardContent>
              </Card>

              {/* News Feed Grid */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-bold text-gray-400 font-mono tracking-wider uppercase flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" /> Scraped Feeds (HTML/RSS Parsed)
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>

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
