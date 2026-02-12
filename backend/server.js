import express from 'express';
import cors from 'cors';
import axios from 'axios';
import http from 'http';
import { Server } from 'socket.io';
import { WebSocketV2 } from 'smartapi-javascript';
import mongoose from 'mongoose';

import Trade from './models/Trade.js';
import Instrument from './models/Instrument.js';
import Watchlist from './models/Watchlist.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT"]
  }
});

// ✅ DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://Angelone_trading:8980@algotrading.27wosv2.mongodb.net/algotrade?appName=AlgoTrading";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

let globalJwtToken = null;
let globalApiKey = null;
let globalFeedToken = null;
let globalClientCode = null;
let web_socket = null;

// ✅ FIXED: startStream with fetchData() for WebSocket 2.0
const startStream = () => {
  if (!globalClientCode || !globalFeedToken || !globalJwtToken || !globalApiKey) {
    console.log("⚠️ Missing credentials to start stream.");
    return;
  }
  if (web_socket) {
    try { web_socket.close(); } catch (e) { }
  }

  try {
    web_socket = new WebSocketV2({
      jwttoken: globalJwtToken,
      apikey: globalApiKey,
      clientcode: globalClientCode,
      feedtype: globalFeedToken
    });

    web_socket.connect().then(() => {
      console.log("⚡ Stream Connected");
      
      const json_req = {
        correlationID: "initial_sub",
        action: 1, 
        mode: 1, 
        exchangeType: 1, 
        tokens: ["99926000"] 
      };
      web_socket.fetchData(json_req);
    }).catch(err => {
      console.error("❌ WebSocket Connection Failed:", err);
    });

    web_socket.on("tick", (data) => {
      if (data && data.tk) {
        console.log("📡 Tick received for:", data.tk, "Price:", data.lp);
        io.emit("price-update", {
          token: data.tk,
          lp: data.lp,
          pc: data.pc,
        });
      }
    });

    web_socket.on("error", (error) => {
      console.error("❌ WebSocket Error:", error);
    });

  } catch (error) {
    console.error("Stream Error:", error);
  }
};

io.on("connection", (socket) => {
  console.log("🖥️ Frontend Connected");
  socket.on("subscribe", (token) => {
    if (web_socket && token) {
      console.log(`📡 Subscribing to: ${token}`);
      const json_req = {
        correlationID: `sub_${token}`,
        action: 1, 
        mode: 1, 
        exchangeType: 1, 
        tokens: [token.toString()]
      };
      web_socket.fetchData(json_req);
    }
  });
});

// --- API ROUTES ---

app.post('/api/trades', async (req, res) => {
  try {
    const trade = await Trade.create(req.body);
    console.log(`💾 Saved Trade: ${trade.symbol}`);
    res.status(201).json(trade);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/trades', async (req, res) => {
  try {
    const trades = await Trade.find().sort({ entryDate: -1 });
    res.json(trades);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/trades/:id', async (req, res) => {
  try {
    const trade = await Trade.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (trade) console.log(`💾 Trade Updated: ${trade.symbol}`);
    res.json(trade);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// ✅ RESTORED: Your original search logic with exactMatch and regexMatches
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]);
    try {
        const exactMatch = await Instrument.findOne({
            symbol: query.toUpperCase() + '-EQ',
            exch_seg: 'NSE'
        });
        const regexMatches = await Instrument.find({
            $or: [
                { symbol: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } }
            ],
            exch_seg: 'NSE'
        }).select('symbol name token exch_seg').limit(20);

        const sortedResults = regexMatches.sort((a, b) => {
            if (a.symbol === (query.toUpperCase() + '-EQ')) return -1;
            if (b.symbol === (query.toUpperCase() + '-EQ')) return 1;
            return a.symbol.length - b.symbol.length;
        });

        if (exactMatch && !sortedResults.find(r => r.token === exactMatch.token)) {
            sortedResults.unshift(exactMatch);
        }
        res.json(sortedResults.slice(0, 10)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/get-token', async (req, res) => {
  const query = req.query.symbol;
  if (!query) return res.status(400).json({ error: "Symbol required" });
  const cleanName = query.replace('.NS', '').toUpperCase();
  try {
    let item = await Instrument.findOne({ symbol: cleanName + '-EQ', exch_seg: 'NSE' });
    if (!item) item = await Instrument.findOne({ symbol: cleanName, exch_seg: 'NSE' });

    if (item) res.json({ status: true, token: item.token });
    else res.status(404).json({ status: false, message: "Not Found" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trades/:id', async (req, res) => {
  try {
    await Trade.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Trade deleted successfully' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete trade' }); }
});

app.post('/api/angel-proxy', async (req, res) => {
  const { endpoint, data } = req.body;
  const activeApiKey = req.headers['x-privatekey'] || globalApiKey;
  const authHeader = req.headers['authorization'] || (globalJwtToken ? `Bearer ${globalJwtToken}` : null);

  const ROUTES = {
    'loginByPassword': { url: '/auth/angelbroking/user/v1/loginByPassword', method: 'POST' },
    'getCandleData': { url: '/secure/angelbroking/historical/v1/getCandleData', method: 'POST' },
    'searchScrip': { url: '/secure/angelbroking/order/v1/searchScrip', method: 'POST' },
    'getLtpData': { url: '/secure/angelbroking/order/v1/getLtpData', method: 'POST' },
    'placeOrder': { url: '/secure/angelbroking/order/v1/placeOrder', method: 'POST' },
    'modifyOrder': { url: '/secure/angelbroking/order/v1/modifyOrder', method: 'POST' },
    'cancelOrder': { url: '/secure/angelbroking/order/v1/cancelOrder', method: 'POST' },
    'generateTokens': { url: '/auth/angelbroking/jwt/v1/generateTokens', method: 'POST' },
    'getOrderBook': { url: '/secure/angelbroking/order/v1/getOrderBook', method: 'GET' },
    'getTradeBook': { url: '/secure/angelbroking/order/v1/getTradeBook', method: 'GET' },
    'getHolding': { url: '/secure/angelbroking/portfolio/v1/getHolding', method: 'GET' },
    'getPosition': { url: '/secure/angelbroking/portfolio/v1/getPosition', method: 'GET' },
    'getRMS': { url: '/secure/angelbroking/user/v1/getRMS', method: 'GET' }
  };

  if (!ROUTES[endpoint]) return res.status(400).json({ error: "Invalid Endpoint" });
  const { url, method } = ROUTES[endpoint];
  const targetUrl = `https://apiconnect.angelone.in/rest${url}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER', 'X-SourceID': 'WEB', 'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '127.0.0.1', 'X-MACAddress': 'fe:80:00:00:00:00',
      'X-PrivateKey': activeApiKey,
      'User-Agent': 'Mozilla/5.0'
    };
    if (authHeader) headers['Authorization'] = authHeader;

    let response;
    if (method === 'GET') {
      response = await axios.get(targetUrl, { headers });
    } else {
      response = await axios.post(targetUrl, data, { headers });
    }

    if (endpoint === 'loginByPassword' && response.data.status) {
      const authData = response.data.data;
      globalJwtToken = authData.jwtToken;
      globalFeedToken = authData.feedToken;
      globalApiKey = activeApiKey;
      globalClientCode = authData.clientcode || authData.clientCode || data.clientcode;

      console.log(`✅ Login successful for ID: ${globalClientCode}`);
      startStream();
    }
    res.json(response.data);
  } catch (error) {
    if (error.response) res.status(error.response.status).json(error.response.data);
    else res.status(500).json({ error: error.message });
  }
});

// --- WATCHLIST MANAGEMENT ROUTES ---

app.get('/api/watchlists/names', async (req, res) => {
  try {
    const names = await Watchlist.find().select('name -_id');
    res.json(names.map(w => w.name));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/watchlists/:name', async (req, res) => {
  try {
    const list = await Watchlist.findOne({ name: req.params.name });
    if (!list) return res.status(404).json({ message: "List not found" });
    res.json(list);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/watchlists', async (req, res) => {
  const { name, items } = req.body;
  try {
    const updatedList = await Watchlist.findOneAndUpdate(
      { name: name },
      { items: items, lastUpdated: Date.now() },
      { upsert: true, new: true }
    );
    res.json(updatedList);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// backend/server.js

app.delete('/api/watchlists/:name', async (req, res) => {
    try {
        const nameToDelete = req.params.name;
        const result = await Watchlist.findOneAndDelete({ name: nameToDelete });
        
        if (result) {
            res.json({ success: true, message: `Deleted ${nameToDelete}` });
        } else {
            res.status(404).json({ error: "Watchlist not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));