import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  entryPrice: Number,
  quantity: Number,
  type: { type: String, default: 'SWING' },
  status: { type: String, default: 'OPEN' },
  entryDate: { type: Date, default: Date.now },
  exitDate: Date,
  exitPrice: Number,
  pnl: Number,
  strategy: String,
  notes: String
});

export default mongoose.model('Trade', tradeSchema);