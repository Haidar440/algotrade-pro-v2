import React, { useState } from 'react';
import { useAuth } from './components/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { RegisterScreen } from './components/RegisterScreen';
import Dashboard from './components/Dashboard';
import TradingChart from './components/TradingChart';

const App: React.FC = () => {
  // ✅ 1. POPUP MODE CHECK: Limit scope to essential chart logic
  // This logic runs independently of auth
  const queryParams = new URLSearchParams(window.location.search);
  const chartSymbol = queryParams.get('chartSymbol');
  const chartToken = queryParams.get('chartToken');

  if (chartSymbol && chartToken) {
    return (
      <div className="h-screen w-screen bg-slate-950 overflow-hidden">
        <TradingChart symbol={chartSymbol} token={chartToken} />
      </div>
    );
  }

  // --- AUTHENTICATION & ROUTING ---
  const { isAuthenticated, isLoading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  // Show loading spinner while AuthContext checks localStorage
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // Render Login or Register if not authenticated
  if (!isAuthenticated) {
    if (showRegister) {
      return <RegisterScreen onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginScreen onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // Render Dashboard if authenticated
  // Dashboard handles all its own hooks and state internally.
  // When isAuthenticated toggles, Dashboard mounts/unmounts cleanly.
  return <Dashboard />;
};

export default App;