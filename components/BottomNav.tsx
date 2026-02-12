
import React from 'react';
import { Home, Eye, Wallet, Settings } from 'lucide-react';
import { View } from '../types';

interface BottomNavProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onOpenSettings: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeView, onNavigate, onOpenSettings }) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-slate-800 z-50 pb-safe">
      <div className="flex justify-around items-center h-16">
        <button 
          onClick={() => onNavigate('SCANNER')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeView === 'SCANNER' ? 'text-emerald-400' : 'text-slate-500'}`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium">Home</span>
        </button>

        <button 
          onClick={() => onNavigate('WATCHLIST')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeView === 'WATCHLIST' ? 'text-emerald-400' : 'text-slate-500'}`}
        >
          <Eye className="w-5 h-5" />
          <span className="text-[10px] font-medium">Watchlist</span>
        </button>

        <button 
          onClick={() => onNavigate('PORTFOLIO')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeView === 'PORTFOLIO' ? 'text-emerald-400' : 'text-slate-500'}`}
        >
          <Wallet className="w-5 h-5" />
          <span className="text-[10px] font-medium">Portfolio</span>
        </button>

        <button 
          onClick={onOpenSettings}
          className="flex flex-col items-center justify-center w-full h-full space-y-1 text-slate-500"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">Settings</span>
        </button>
      </div>
    </div>
  );
};

export default BottomNav;
