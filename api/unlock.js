import Stripe from "stripe";
import crypto from "crypto";

function key() {
  if (!process.env.OPENAI_API_KEY || !process.env.STRIPE_SECRET_KEY) {
    throw new Error("Server configuration incomplete.");
  }
  return crypto
    .createHash("sha256")
    .update(process.env.OPENAI_API_KEY + "|" + process.env.STRIPE_SECRET_KEY)
    .digest();
}

function openSealed(token) {
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("Invalid report token.");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(plain.toString("utf8"));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  try {
    const { sessionId } = req.body || {};

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Missing payment information." });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment has not been confirmed." });
    }

    const count = Number(session.metadata?.report_chunks || 0);
    if (!Number.isInteger(count) || count < 1 || count > 40) {
      return res.status(400).json({ error: "This payment does not contain a recoverable report." });
    }

    let sealedReport = "";
    for (let i = 0; i < count; i++) {
      const chunk = session.metadata?.[`report_${i}`];
      if (!chunk) throw new Error(`Missing report chunk ${i}.`);
      sealedReport += chunk;
    }

    const data = openSealed(sealedReport);
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "We couldn't unlock this report. Please contact support with your payment receipt."
    });
  }
}
