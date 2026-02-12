import mongoose from 'mongoose';
import axios from 'axios';
import Instrument from './models/Instrument.js';

// ✅ THIS IS YOUR CORRECT CONNECTION STRING
const MONGO_URI = "mongodb+srv://Angelone_trading:8980@algotrading.27wosv2.mongodb.net/algotrade?appName=AlgoTrading";

const seed = async () => {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected! Downloading Data...");
        
        const res = await axios.get('https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json');
        
        // Filter only NSE/BSE
        const data = res.data.filter(i => i.exch_seg === 'NSE' || i.exch_seg === 'BSE');
        
        console.log(`⚡ Inserting ${data.length} records...`);
        
        await Instrument.deleteMany({});
        await Instrument.insertMany(data);
        
        console.log("🎉 Done! Database Seeded.");
        process.exit();
    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
};
seed();