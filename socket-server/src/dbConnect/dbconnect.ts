import mongoose from "mongoose";
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI!;
// console.log("MONGO_URI in function : ",MONGO_URI);

export function connectDB() {
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
}
