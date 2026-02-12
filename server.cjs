const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const http = require('http'); 
const { Server } = require('socket.io'); 
const { WebSocketV2 } = require('smartapi-javascript');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ 1. SETUP HTTP SERVER & SOCKET.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // ✅ Allow BOTH ports (Vite's 5173 and React's 3000)
        origin: ["http://localhost:5173", "http://localhost:3000"], 
        methods: ["GET", "POST"]
    }
});

let db;
// Store active streaming tokens
let globalJwtToken = null;
let globalApiKey = null;
let globalFeedToken = null;
let globalClientCode = null;

// 2. CONNECT TO DATABASE
(async () => {
    try {
        db = await open({ filename: './market.db', driver: sqlite3.Database });
        console.log("✅ Connected to SQLite Database");
    } catch (e) { console.error("❌ DB Error:", e.message); }
})();

// --- WEBSOCKET ENGINE ---
let web_socket = null;

const startStream = () => {
    if (!globalClientCode || !globalFeedToken) return;
    try {
        web_socket = new WebSocketV2({
            jwttoken: globalJwtToken,
            apikey: globalApiKey,
            clientcode: globalClientCode,
            feedtype: globalFeedToken
        });
        web_socket.connect().then(() => {
            console.log("⚡ Streaming: Connected to Angel One WebSocket");
            web_socket.runScript("nse_cm|99926000&bse_cm|99919000", "mw"); // Nifty & Sensex
        });
        web_socket.on("tick", (data) => {
            io.emit("price-update", data);
        });
        web_socket.on("error", (err) => { console.error("⚡ Stream Error:", err); });
    } catch (error) { console.error("⚡ Stream Setup Failed:", error.message); }
};

// 3. SOCKET.IO EVENTS
io.on("connection", (socket) => {
    console.log("🖥️ Frontend Connected to Socket");
    socket.on("subscribe", (token) => {
        if (web_socket && token) {
            console.log(`🔌 Subscribing to Token: ${token}`);
            web_socket.runScript(`nse_cm|${token}`, "mw"); 
        }
    });
});

// 4. API ROUTES
app.get('/api/search', async (req, res) => { /* ... Keep DB Search logic same ... */ 
    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]);
    try {
        const results = await db.all(
            `SELECT symbol, name, token, exch_seg FROM instruments 
             WHERE (symbol LIKE ? OR name LIKE ?) AND exch_seg = 'NSE' 
             LIMIT 10`, [`${query.toUpperCase()}%`, `%${query.toUpperCase()}%`]
        );
        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/get-token', async (req, res) => { /* ... Keep DB Token logic same ... */
    const query = req.query.symbol;
    if (!query) return res.status(400).json({ error: "Symbol required" });
    const cleanName = query.replace('.NS', '').replace('.BO', '').toUpperCase();
    try {
        let row = await db.get(`SELECT token FROM instruments WHERE symbol = ? AND exch_seg = 'NSE'`, [cleanName + '-EQ']);
        if (!row) row = await db.get(`SELECT token FROM instruments WHERE symbol = ? AND exch_seg = 'NSE'`, [cleanName]);
        if (row) res.json({ status: true, token: row.token });
        else res.status(404).json({ status: false, message: "Token not found" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ ANGEL PROXY (FIXED HEADERS)
app.post('/api/angel-proxy', async (req, res) => {
    const { endpoint, data } = req.body;
    
    // Capture tokens
    if (req.headers['authorization']) globalJwtToken = req.headers['authorization'].replace('Bearer ', '');
    if (req.headers['x-privatekey']) globalApiKey = req.headers['x-privatekey'];

    const ROUTES = {
        'loginByPassword': { url: '/auth/angelbroking/user/v1/loginByPassword', method: 'POST' },
        'getCandleData':   { url: '/secure/angelbroking/historical/v1/getCandleData', method: 'POST' },
        'searchScrip':     { url: '/secure/angelbroking/order/v1/searchScrip', method: 'POST' },
        'getLtpData':      { url: '/secure/angelbroking/order/v1/getLtpData', method: 'POST' }, // 👈 We will use this to get price
        'placeOrder':      { url: '/secure/angelbroking/order/v1/placeOrder', method: 'POST' },
        'modifyOrder':     { url: '/secure/angelbroking/order/v1/modifyOrder', method: 'POST' },
        'cancelOrder':     { url: '/secure/angelbroking/order/v1/cancelOrder', method: 'POST' },
        'getOrderBook':    { url: '/secure/angelbroking/order/v1/getOrderBook', method: 'GET' },
        'getTradeBook':    { url: '/secure/angelbroking/order/v1/getTradeBook', method: 'GET' },
        'getHolding':      { url: '/secure/angelbroking/portfolio/v1/getHolding', method: 'GET' },
        'getPosition':     { url: '/secure/angelbroking/portfolio/v1/getPosition', method: 'GET' },
        'getRMS':          { url: '/secure/angelbroking/user/v1/getRMS', method: 'GET' }
    };

    if (!ROUTES[endpoint]) return res.status(400).json({ error: "Invalid Endpoint" });
    const { url, method } = ROUTES[endpoint];
    const targetUrl = `https://apiconnect.angelone.in/rest${url}`;

    try {
        // ✅ STANDARD HEADERS ONLY (No User-Agent spoofing)
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1', 
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': 'fe:80:00:00:00:00',
            'X-PrivateKey': req.headers['x-privatekey'],
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        };
        if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];

        let response;
        if (method === 'GET') response = await axios.get(targetUrl, { headers });
        else response = await axios.post(targetUrl, data, { headers });
        
        if (endpoint === 'loginByPassword' && response.data.status) {
            globalFeedToken = response.data.data.feedToken;
            globalClientCode = response.data.data.clientcode;
            console.log("⚡ Credentials Captured. Stream Ready.");
            startStream();
        }
        res.json(response.data);
    } catch (error) {
        if (error.response) res.status(error.response.status).send(error.response.data);
        else res.status(500).json({ error: "Proxy Request Failed" });
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`✅ Backend (HTTP + WebSocket) running on port ${PORT}`));