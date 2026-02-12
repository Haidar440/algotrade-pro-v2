
import React from 'react';
import { Menu, Bell, UserCircle, Link2, CheckCircle2, Settings } from 'lucide-react';
import { View } from '../types';

interface NavbarProps {
  onMenuClick: () => void;
  activeView: View;
  onConnectClick?: () => void;
  isConnected?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick, activeView, onConnectClick, isConnected }) => {
  const getTitle = () => {
    switch(activeView) {
      case 'SCANNER': return 'Market Scanner';
      case 'PORTFOLIO': return 'Paper Portfolio';
      case 'STRATEGIES': return 'Strategy Guide';
      case 'PYTHON_LAB': return 'Python Algo Lab';
      default: return 'Dashboard';
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 md:px-8">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-bold text-white tracking-wide">
          {getTitle()}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {onConnectClick && (
          <button 
            onClick={onConnectClick}
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            {isConnected ? <CheckCircle2 className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
            {isConnected ? 'Connected' : 'Settings'}
          </button>
        )}

        <button className="p-2 text-slate-400 hover:text-white transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-2 w-2 h-2 bg-emerald-500 rounded-full border border-[#0f172a]"></span>
        </button>
        <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>
        <div className="flex items-center gap-3">
           <div className="text-right hidden sm:block">
             <div className="text-sm font-bold text-white">Trader User</div>
             <div className="text-xs text-emerald-400 font-mono">Plan: Premium</div>
           </div>
           <UserCircle className="w-8 h-8 text-slate-400" />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
