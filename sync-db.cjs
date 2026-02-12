const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const axios = require('axios');

// Angel One's Master JSON URL
const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

async function sync() {
    console.log("📥 Downloading Scrip Master...");
    try {
        const response = await axios.get(SCRIP_MASTER_URL);
        const scrips = response.data; 

        console.log(`✅ Downloaded ${scrips.length} instruments. Initializing DB...`);

        // Open (or create) database file
        const db = await open({
            filename: './market.db',
            driver: sqlite3.Database
        });

        // 1. Drop existing table to start fresh
        await db.exec(`DROP TABLE IF EXISTS instruments`);

        // 2. Create Table WITHOUT "PRIMARY KEY" on token
        await db.exec(`
            CREATE TABLE instruments (
                token TEXT, 
                symbol TEXT,
                name TEXT,
                expiry TEXT,
                strike TEXT,
                lotsize TEXT,
                instrumenttype TEXT,
                exch_seg TEXT,
                tick_size TEXT
            );
            
            -- Create Indexes for super-fast search
            CREATE INDEX idx_token ON instruments(token);
            CREATE INDEX idx_symbol ON instruments(symbol);
            CREATE INDEX idx_name ON instruments(name);
        `);

        console.log("🚀 Inserting data (this takes ~10-20 seconds)...");

        // Prepare insert statement
        const stmt = await db.prepare(`INSERT INTO instruments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        // Batch Insert
        await db.exec('BEGIN TRANSACTION');
        for (const s of scrips) {
            await stmt.run(
                s.token, s.symbol, s.name, s.expiry, s.strike, 
                s.lotsize, s.instrumenttype, s.exch_seg, s.tick_size
            );
        }
        await db.exec('COMMIT');
        await stmt.finalize();

        console.log("🎉 Database Sync Complete! File saved as 'market.db'");
    } catch (err) {
        console.error("❌ Error syncing database:", err.message);
    }
}

sync();