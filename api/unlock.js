import Stripe from "stripe";
import crypto from "crypto";

function key() {
  return crypto.createHash("sha256").update(process.env.OPENAI_API_KEY + "|" + process.env.STRIPE_SECRET_KEY).digest();
}

function openSealed(token) {
  const buf = Buffer.from(token, "base64url");
  const iv = buf.subarray(0,12);
  const tag = buf.subarray(12,28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  try {
    const { sessionId, report } = req.body || {};
    if (!sessionId || !report) return res.status(400).json({ error: "Missing payment or report information." });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment has not been confirmed." });
    }

    const data = openSealed(report);
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "We couldn't unlock this report. Please return to the browser used for the original scan." });
  }
}
