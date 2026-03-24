const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const PREMIUM_PRICE_ID = process.env.STRIPE_PRICE_ID; // Set in Railway env vars

// Create checkout session
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get or create Stripe customer
    let stripeCustomerId;
    const userResult = await query('SELECT stripe_customer_id, email, name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (user.stripe_customer_id) {
      stripeCustomerId = user.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId }
      });
      stripeCustomerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: PREMIUM_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/premium-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/premium`,
      metadata: { userId },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// Customer portal (manage subscription)
router.post('/portal', authenticate, async (req, res) => {
  try {
    const userResult = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const { stripe_customer_id } = userResult.rows[0];

    if (!stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: 'Could not open billing portal' });
  }
});

// Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        const expiresAt = new Date(subscription.current_period_end * 1000);

        const subStatus = status === 'active' ? 'premium' : 'free';

        await query(
          `UPDATE users SET
           subscription_status = $1,
           subscription_expires_at = $2,
           stripe_subscription_id = $3
           WHERE stripe_customer_id = $4`,
          [subStatus, expiresAt, subscription.id, customerId]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await query(
          `UPDATE users SET subscription_status = 'free', subscription_expires_at = NULL
           WHERE stripe_customer_id = $1`,
          [subscription.customer]
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await query(
          `UPDATE users SET subscription_status = 'free' WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

// Check subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT subscription_status, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    const isPremium = user.subscription_status === 'premium' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date();

    res.json({
      status: user.subscription_status,
      is_premium: isPremium,
      expires_at: user.subscription_expires_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
