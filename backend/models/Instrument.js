import mongoose from 'mongoose';

const instrumentSchema = new mongoose.Schema({
  token: { type: String, required: true },
  symbol: { type: String, required: true, index: true },
  name: { type: String, required: true },
  exch_seg: { type: String, required: true },
  tick_size: { type: Number }
});

export default mongoose.model('Instrument', instrumentSchema);