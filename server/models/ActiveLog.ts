import mongoose from "mongoose";

const activeLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actionType: {
      type: String,
      enum: ["POST_PUBLISHED", "AI_REPLY"],
      required: true,
    },
    description: { type: String, required: true },
    relatedPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
    platform: { type: String },
    aiGeneratedText: { type: String },
  },
  { timestamps: true },
);

const ActiveLog = mongoose.model("ActiveLog", activeLogSchema);

export default ActiveLog;
