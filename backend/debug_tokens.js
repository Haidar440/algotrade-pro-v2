import mongoose from 'mongoose';
import Instrument from './models/Instrument.js';

// ✅ PASTE YOUR CONNECTION STRING
const MONGO_URI = "mongodb+srv://Angelone_trading:8980@algotrading.27wosv2.mongodb.net/algotrade?appName=AlgoTrading";

const check = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("🔍 Checking Database...");

        // Check IDEA
        const idea = await Instrument.find({ symbol: 'IDEA-EQ', exch_seg: 'NSE' });
        console.log("\n--- IDEA (Should be Token ~14366) ---");
        console.log(idea);

        // Check SCI
        const sci = await Instrument.find({ symbol: 'SCI-EQ', exch_seg: 'NSE' });
        console.log("\n--- SCI (Should be Token ~3369) ---");
        console.log(sci);

        process.exit();
    } catch (e) { console.error(e); }
};
check();