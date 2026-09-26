import mongoose from "mongoose";

const accountSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    platform: {type: String, enum: ["facebook", "twitter", "instagram", "linkedin", "facebook_page", "linkedin_page", "instagram_business"], required: true},
    handle: {type: String, required: true},
    zernioAccountId: {type: String, unique: true, sparse: true},
    accessToken: {type: String},
    refreshToken: {type: String},
    tokenExpiresAt: {type: Date},
    status: {type: String, enum: ["connected", "disconnected"], default: "connected"},
    avatarurl: {type: String},
}, {timestamps: true});

const Account = mongoose.model("Account", accountSchema);

export default Account;