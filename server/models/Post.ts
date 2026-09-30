import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ["image", "video"] },
    platform: [
      {
        type: String,
        enum: [
          "facebook",
          "twitter",
          "instagram",
          "linkedin",
          "facebook_page",
          "linkedin_page",
          "instagram_business",
        ],
      },
    ],
    scheduledFor: { type: Date, required: true },
    zernioIdempotencyKey: { type: String },
    claimedAt: { type: Date },
    retryAt: { type: Date },
    publishError: { type: String },
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "publishing",
        "published",
        "partial",
        "failed",
      ],
      default: "scheduled",
    },
  },
  { timestamps: true },
);

const Post = mongoose.model("Post", postSchema);

export default Post;
