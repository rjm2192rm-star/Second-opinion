import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    const report = req.body?.report;

    if (!report || typeof report !== "string" || report.length > 20000) {
      return res.status(400).json({ error: "Missing report. Please run the scan again." });
    }

    const CHUNK_SIZE = 450;
    const chunks = [];

    for (let i = 0; i < report.length; i += CHUNK_SIZE) {
      chunks.push(report.slice(i, i + CHUNK_SIZE));
    }

    if (chunks.length > 40) {
      return res.status(400).json({
        error: "This report is too large to unlock securely. Please try a shorter document."
      });
    }

    const metadata = {
      so_version: "2",
      report_chunks: String(chunks.length)
    };

    chunks.forEach((chunk, i) => {
      metadata[`report_${i}`] = chunk;
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: 1900,
          product_data: {
            name: "Second Check It — Full Report"
          }
        },
        quantity: 1
      }],
      metadata,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      allow_promotion_codes: true
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Secure checkout is not available yet."
    });
  }
}
