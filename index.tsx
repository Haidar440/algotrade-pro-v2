import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './components/AuthContext';
import { BrokerProvider } from './contexts/BrokerContext';
import { EngineProvider } from './contexts/EngineContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      {/* BrokerProvider must wrap EngineProvider (engine depends on broker) */}
      <BrokerProvider>
        <EngineProvider>
          <App />
        </EngineProvider>
      </BrokerProvider>
    </AuthProvider>
  </React.StrictMode>
);