import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    name: {type: String, required: true},
    zernioProfileId: {type: String},
    plan: { type: String, enum: ['starter', 'pro', 'agency'], default: 'starter' },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: { type: String, enum: ['active', 'past_due', 'canceled', 'none'], default: 'none' }
}, {timestamps: true});

const User = mongoose.model("User", UserSchema);

export default User;