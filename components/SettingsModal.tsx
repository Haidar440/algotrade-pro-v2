import React, { useState } from 'react';
import { BrokerState } from '../types';
import { AngelOne } from '../services/angel';
import { X, Save, AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brokerState: BrokerState;
  onSaveBrokerState: (state: BrokerState) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, brokerState, onSaveBrokerState }) => {
  const [activeTab, setActiveTab] = useState<'ANGEL' | 'GENERAL'>('ANGEL');
  
  const [apiKey, setApiKey] = useState(brokerState.angel?.apiKey || '');
  const [clientCode, setClientCode] = useState(brokerState.angel?.clientCode || '');
  const [pin, setPin] = useState('');
  const [totp, setTotp] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);

  if (!isOpen) return null;

  const handleConnectAngel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const angel = new AngelOne({ apiKey });
      const session = await angel.login(clientCode, pin, totp);

      onSaveBrokerState({
        ...brokerState,
        angel: {
          apiKey,
          clientCode,
          jwtToken: session.jwtToken,
          refreshToken: session.refreshToken,
          feedToken: session.feedToken,
        }
      });

      setSuccess("Successfully connected to Angel One!");
      setPin(''); 
      setTotp('');
    } catch (err: any) {
      setError(err.message || "Connection Failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
      onSaveBrokerState({ ...brokerState, angel: undefined }); // Clear State
      setApiKey('');
      setClientCode('');
      setSuccess("Disconnected successfully.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-4 mb-6 border-b border-slate-800">
            <button onClick={() => setActiveTab('ANGEL')} className={`pb-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ANGEL' ? 'text-emerald-400 border-emerald-400' : 'text-slate-400 border-transparent hover:text-white'}`}>Angel One API</button>
            <button onClick={() => setActiveTab('GENERAL')} className={`pb-2 text-sm font-bold transition-colors border-b-2 ${activeTab === 'GENERAL' ? 'text-emerald-400 border-emerald-400' : 'text-slate-400 border-transparent hover:text-white'}`}>General</button>
          </div>

          {activeTab === 'ANGEL' && (
            <form onSubmit={handleConnectAngel} className="space-y-4">
              
              {brokerState.angel?.jwtToken ? (
                 <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <div>
                           <p className="text-sm font-bold text-emerald-400">Connected</p>
                           <p className="text-xs text-slate-400">Client: {brokerState.angel.clientCode}</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleDisconnect} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 text-xs font-bold rounded hover:bg-rose-500/20 transition-colors">
                        Disconnect
                    </button>
                 </div>
              ) : (
                 <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <div>
                       <p className="text-sm font-bold text-amber-400">Not Connected</p>
                       <p className="text-xs text-slate-400">Enter credentials to enable live scanning.</p>
                    </div>
                 </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">SmartAPI Key (X-PrivateKey)</label>
                  <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter your API Key" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Client ID</label>
                  <input type="text" value={clientCode} onChange={e => setClientCode(e.target.value)} placeholder="e.g. S123456" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none uppercase" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">PIN</label>
                      <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="****" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">TOTP Secret</label>
                      <div className="relative">
                        <input type={showSensitive ? "text" : "password"} value={totp} onChange={e => setTotp(e.target.value)} placeholder="Secret Key (JBSWY...)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                        <button type="button" onClick={() => setShowSensitive(!showSensitive)} className="absolute right-3 top-2.5 text-slate-500 hover:text-white">
                           {showSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                   </div>
                </div>
              </div>

              {error && <p className="text-xs text-rose-400 font-bold mt-2">{error}</p>}
              {success && <p className="text-xs text-emerald-400 font-bold mt-2">{success}</p>}

              <div className="pt-4 flex justify-end gap-3">
                 <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                 <button type="submit" disabled={loading || !apiKey || !clientCode || !pin || !totp} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {loading ? 'Connecting...' : 'Save & Connect'}
                 </button>
              </div>
            </form>
          )}
          {activeTab === 'GENERAL' && <div className="text-center py-10 text-slate-500">General settings coming soon.</div>}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;