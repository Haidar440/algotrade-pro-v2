import mongoose from 'mongoose';

const WatchlistSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  owner: { type: String, default: "Haidar ali" }, // Set to your project metadata
  items: { type: Array, default: [] }, // Array of stock objects {symbol, price, strategy}
  lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model('Watchlist', WatchlistSchema);