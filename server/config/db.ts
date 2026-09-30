import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be configured");
  }

  mongoose.connection.on("connected", () => {
    console.log("MongoDB Connected");
  });
  await mongoose.connect(mongoUri);
};

export default connectDB;
