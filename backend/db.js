import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // REPLACE WITH YOUR COPIED STRING
    // REPLACE <password> with your actual password
    const MONGO_URI = "mongodb+srv://admin:@cluster0.xyz.mongodb.net/algotrade?retryWrites=true&w=majority";
    
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;