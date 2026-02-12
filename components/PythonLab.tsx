
import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResult, BrokerState } from '../types';
import { Play, RotateCcw, Terminal, AlertTriangle, Check, Loader2, Lock } from 'lucide-react';

declare global {
  interface Window {
    loadPyodide: any;
  }
}

interface PythonLabProps {
  data: AnalysisResult | null;
  brokerState: BrokerState;
}

// Updated Default Code to demonstrate Algo Trading concepts
const DEFAULT_CODE = `# --- ALGO TRADING ENGINE (PYTHON) ---
import json
from js import console

# 1. Load Scanner Data
if 'DATA' not in globals():
    print("Error: No market data. Go to Scanner tab first.")
else:
    stock = json.loads(DATA)
    symbol = stock['symbol']
    price = stock['current_price']
    signal = stock['primary_recommendation']['signal']
    
    print(f"Analyzing {symbol} @ ₹{price}")
    print(f"Algo Signal: {signal}")

    # 2. Strategy Logic Example
    if signal == 'BUY':
        qty = 10 
        target = price * 1.05
        stop_loss = price * 0.98
        
        print(f"\\n--- Trade Signal Generated ---")
        print(f"ACTION: BUY {qty} Qty")
        print(f"TARGET: {target:.2f}")
        print(f"STOP: {stop_loss:.2f}")
        
    elif signal == 'NO-TRADE':
        print("\\nNo valid setup detected. Algo sleeping.")
`;

const INITIALIZATION_SCRIPT = `
import json
import pyodide.http

# Initialize any required helper classes here
print("Python Environment Ready.")
`;

const PythonLab: React.FC<PythonLabProps> = ({ data, brokerState }) => {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState<string[]>([]);
  const [pyodide, setPyodide] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Pyodide
  useEffect(() => {
    const initPyodide = async () => {
      try {
        if (!window.loadPyodide) {
          throw new Error("Pyodide script not loaded properly.");
        }
        const py = await window.loadPyodide();
        
        // Load required packages
        await py.loadPackage("micropip");
        
        // Pass Credentials to Python Global Scope (if needed for other brokers)
        py.globals.set("CREDENTIALS", JSON.stringify(brokerState));
        
        // Run Init Script
        await py.runPythonAsync(INITIALIZATION_SCRIPT);

        setPyodide(py);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load Pyodide:", err);
        setError("Failed to load Python environment. Check your internet connection.");
        setIsLoading(false);
      }
    };
    initPyodide();
  }, [brokerState]);

  const runCode = async () => {
    if (!pyodide) return;
    setIsRunning(true);
    setOutput([]);
    
    try {
      // Setup stdout capture
      pyodide.setStdout({ batched: (msg: string) => setOutput(prev => [...prev, msg]) });
      
      // Inject Data (Update every run)
      if (data) {
        pyodide.globals.set("DATA", JSON.stringify(data));
      } else {
        pyodide.globals.set("DATA", "{}");
      }

      // Run user code
      await pyodide.runPythonAsync(code);
    } catch (err) {
      setOutput(prev => [...prev, `Error: ${err}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const resetCode = () => {
    setCode(DEFAULT_CODE);
    setOutput([]);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-white flex items-center gap-2">
             <Terminal className="text-amber-400" /> Python Algo Lab
           </h1>
           <p className="text-slate-400 text-sm">
             Write real-time algo strategies in Python.
           </p>
        </div>
        
        <div className="flex gap-2">
           {isLoading ? (
             <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-800 px-3 py-1.5 rounded-full">
               <Loader2 className="w-4 h-4 animate-spin" /> Loading Runtime...
             </div>
           ) : (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <Check className="w-4 h-4" /> System Ready
              </div>
           )}
        </div>
      </div>

      {!data && !isLoading && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-center gap-3 text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span>No market data. Go to "Scanner" tab and analyze a stock first to populate the `DATA` variable.</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg text-rose-200">
           {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Editor */}
        <div className="flex flex-col bg-[#0f172a] border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
           <div className="bg-slate-800/50 p-2 border-b border-slate-700 flex justify-between items-center">
             <span className="text-xs font-bold text-slate-400 px-2">STRATEGY.PY</span>
             <div className="flex gap-2">
                <button 
                  onClick={resetCode}
                  className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  title="Reset Code"
                >
                   <RotateCcw className="w-4 h-4" />
                </button>
                <button 
                   onClick={runCode}
                   disabled={isLoading || isRunning}
                   className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                   {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                   EXECUTE
                </button>
             </div>
           </div>
           <textarea
             value={code}
             onChange={(e) => setCode(e.target.value)}
             className="flex-1 w-full bg-[#0f172a] text-slate-200 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
             spellCheck={false}
           />
        </div>

        {/* Output Console */}
        <div className="flex flex-col bg-black border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
           <div className="bg-slate-900/50 p-2 border-b border-slate-800">
             <span className="text-xs font-bold text-slate-500 px-2">TERMINAL OUTPUT</span>
           </div>
           <div className="flex-1 p-4 font-mono text-sm overflow-y-auto space-y-1">
             {output.length === 0 ? (
               <span className="text-slate-600 italic">// Output from print() calls will appear here...</span>
             ) : (
               output.map((line, i) => (
                 <div key={i} className="text-emerald-400 break-words border-b border-slate-900/50 pb-1 mb-1 last:border-0">
                    <span className="text-slate-600 mr-2 select-none">&gt;</span>
                    {line}
                 </div>
               ))
             )}
             {isRunning && (
               <div className="text-emerald-500/50 animate-pulse">_</div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default PythonLab;
