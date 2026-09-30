import express from 'express';
import { createCheckoutSession, handleStripeWebhook } from '../controllers/stripeControllers.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/create-checkout-session', express.json(), protect, createCheckoutSession);

// Webhook requires raw body parsing, not express.json()
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

export default router;
