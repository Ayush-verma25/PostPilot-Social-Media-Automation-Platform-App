import { Request, Response } from "express";
import Stripe from "stripe";
import User from "../models/User.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";

let stripeClient: Stripe | undefined;

const getStripe = (): Stripe => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
};

const stripeId = (value: string | { id: string } | null): string | undefined =>
  typeof value === "string" ? value : value?.id;

const getAppUrl = (): string =>
  (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

export const createCheckoutSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      res.status(503).json({ message: "Stripe Pro pricing is not configured" });
      return;
    }

    const appUrl = getAppUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { userId: user.id, plan: "pro" },
      subscription_data: { metadata: { userId: user.id, plan: "pro" } },
      success_url: `${appUrl}/?subscription=success`,
      cancel_url: `${appUrl}/?subscription=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Unable to create checkout session" });
  }
};

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!webhookSecret || typeof signature !== "string") {
    res.status(400).json({ message: "Stripe webhook is not configured" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error: any) {
    res.status(400).json({ message: error?.message || "Invalid Stripe webhook signature" });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || session.client_reference_id;
      const subscriptionId = stripeId(session.subscription);
      const customerId = stripeId(session.customer);

      if (userId && subscriptionId) {
        await User.findByIdAndUpdate(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          plan: "pro",
          subscriptionStatus: "active",
        });
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = stripeId(subscription.customer);
      const status =
        subscription.status === "active"
          ? "active"
          : subscription.status === "past_due"
            ? "past_due"
            : subscription.status === "canceled"
              ? "canceled"
              : "none";

      if (customerId) {
        await User.findOneAndUpdate(
          { stripeCustomerId: customerId },
          {
            stripeSubscriptionId: status === "canceled" ? undefined : subscription.id,
            plan: status === "canceled" || status === "none" ? "starter" : "pro",
            subscriptionStatus: status,
          },
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Unable to process Stripe webhook" });
  }
};