import React from 'react';
import { 
  LayoutDashboard, 
  LineChart, 
  BookOpen, 
  FlaskConical, 
  Newspaper, 
  X, 
  Briefcase, 
  FileText,
  Terminal,
  Bot,
  Calendar
} from 'lucide-react';
import { View } from '../types';

interface SidebarProps {
  activeView: View;
  onSelectView: (view: View) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView, isOpen, onClose }) => {
  
  return (
    <>
      {/* 1. Mobile Overlay (Backdrop) */}
      {/* Only visible on mobile (md:hidden) when open */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* 2. Sidebar Container */}
      <aside 
        className={`
          fixed md:relative inset-y-0 left-0 z-50 
          w-64 bg-[#0b1120] border-r border-slate-800 
          flex flex-col shadow-2xl md:shadow-none
          transform transition-transform duration-300 ease-in-out 
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        
        {/* Header */}
        <div className="p-6 flex justify-between items-center shrink-0 border-b border-slate-800/50">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-gradient-to-tr from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <LayoutDashboard className="w-5 h-5 text-white" />
             </div>
             <h1 className="text-xl font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">
               ALGO.PRO
             </h1>
          </div>
          {/* Close Button (Mobile Only) */}
          <button 
            onClick={onClose} 
            className="md:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="px-3 space-y-1.5 mt-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          
          {/* Main Scanner */}
          <button
             onClick={() => { onSelectView('SCANNER'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold ${
               activeView === 'SCANNER' 
                 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40' 
                 : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <LayoutDashboard className="w-5 h-5" /> Market Scanner
           </button>

           <div className="px-4 pt-4 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trading Desk</div>

           {/* Auto-Bot */}
           <button
             onClick={() => { onSelectView('AUTO_TRADER'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'AUTO_TRADER' 
                 ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' 
                 : 'text-slate-400 hover:bg-slate-800 hover:text-amber-400'
             }`}
           >
             <Bot className="w-5 h-5" /> Auto-Bot 
             <span className="ml-auto text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded uppercase font-bold">Beta</span>
           </button>

           {/* Real Portfolio */}
           <button
             onClick={() => { onSelectView('REAL_PORTFOLIO'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'REAL_PORTFOLIO' 
                 ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' 
                 : 'text-slate-400 hover:bg-slate-800 hover:text-blue-400'
             }`}
           >
             <Briefcase className="w-5 h-5" /> Real Portfolio
             <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
           </button>

           {/* Paper Trading */}
           <button
             onClick={() => { onSelectView('PAPER_TRADING'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'PAPER_TRADING' 
                 ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' 
                 : 'text-slate-400 hover:bg-slate-800 hover:text-purple-400'
             }`}
           >
             <FileText className="w-5 h-5" /> Paper Simulator
           </button>
                <button 
                    onClick={() => { onSelectView('TRADE_HISTORY'); onClose(); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                      activeView === 'TRADE_HISTORY' 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-5 h-5" />
                    <span className="block">Trade History</span>
                  </button>

           <div className="px-4 pt-4 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Analysis Tools</div>

           {/* Watchlist */}
           <button
             onClick={() => { onSelectView('WATCHLIST'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'WATCHLIST' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <LineChart className="w-5 h-5" /> Watchlist
           </button>

           {/* Backtest */}
           <button
             onClick={() => { onSelectView('BACKTEST'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'BACKTEST' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <FlaskConical className="w-5 h-5" /> Backtest Engine
           </button>
           
      

           {/* News */}
           <button
             onClick={() => { onSelectView('NEWS'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'NEWS' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <Newspaper className="w-5 h-5" /> News Intelligence
           </button>

           {/* Python Lab */}
           <button
             onClick={() => { onSelectView('PYTHON_LAB'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'PYTHON_LAB' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <Terminal className="w-5 h-5" /> Python Lab
           </button>

           {/* Strategy Guide */}
           <button
             onClick={() => { onSelectView('STRATEGIES'); onClose(); }}
             className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
               activeView === 'STRATEGIES' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
             }`}
           >
             <BookOpen className="w-5 h-5" /> Strategy Guide
           </button>

        </nav>

        {/* Bottom Status */}
        <div className="p-4 shrink-0 mt-auto border-t border-slate-800/50">
           <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                 <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <div>
                 <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Status</div>
                 <div className="text-xs font-bold text-emerald-400">Engine Online</div>
              </div>
           </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;