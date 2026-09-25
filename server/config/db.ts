import mongoose from "mongoose";

const connectDB = async () => {
  try {
    mongoose.connection.on("connected", async () => {
      console.log("MongoDB Connected");
    });
    await mongoose.connect(process.env.MONGODB_URI!);
  } catch (error: any) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

export default connectDB;
