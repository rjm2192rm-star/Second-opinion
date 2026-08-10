import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";
import crypto from "crypto";

export const config = { api: { bodyParser: false } };

function parseForm(req) {
  const form = formidable({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
  });
}

function key() {
  if (!process.env.OPENAI_API_KEY || !process.env.STRIPE_SECRET_KEY) throw new Error("Server configuration incomplete.");
  return crypto.createHash("sha256").update(process.env.OPENAI_API_KEY + "|" + process.env.STRIPE_SECRET_KEY).digest();
}

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function scanCookie(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)so_scans=([^;]+)/);
  let state = { day: new Date().toISOString().slice(0,10), count: 0 };
  if (m) {
    try { state = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch {}
  }
  const today = new Date().toISOString().slice(0,10);
  if (state.day !== today) state = { day: today, count: 0 };
  return state;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  const usage = scanCookie(req);
  if (usage.count >= 999) {
    return res.status(429).json({ error: "Free scan limit reached for today. Please try again tomorrow." });
  }

  try {
    const { files } = await parseForm(req);
    const raw = files.file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const mime = file.mimetype || "";
    if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
      return res.status(400).json({ error: "Please upload a PDF or image." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const base64 = fs.readFileSync(file.filepath).toString("base64");

    const instructions = `You are Second Check It, a skeptical document-review system.

Your job is NOT to give professional advice. Your job is to identify concrete things in the supplied document that deserve independent verification.

Look especially for:
- arithmetic or subtotal/total errors
- duplicate or overlapping charges
- contradictions between sections
- mismatched names, dates, quantities, rates, units, or totals
- blank or missing information that appears consequential from the document itself
- fees, penalties, renewal/cancellation provisions, exclusions, assumptions, or limitations that are easy to overlook
- vague or internally inconsistent wording
- line items that deserve a question because they are unsupported elsewhere in the document

Rules:
- Never invent market prices, laws, regulations, industry standards, or facts not present in the document.
- Never say a term is illegal, invalid, fraudulent, unfair, excessive, or abnormal unless that conclusion follows directly from the document itself.
- You may say "worth clarifying" or "appears inconsistent" and explain why.
- If you cannot verify something from the document, say so.
- Do not manufacture findings to make the product seem useful.
- If no material issues are visible, return zero findings.
- estimatedStakes can contain a dollar value/range ONLY if it can be calculated directly from the document.
- Keep findings concise and specific.
- Maximum 5 findings, ranked by likely importance.

Return ONLY valid JSON:
{
  "worthInvestigating": true,
  "headline": "short, non-alarmist headline",
  "summary": "2-4 sentences",
  "findingCount": 2,
  "estimatedStakes": "$425" or null,
  "findings": [
    {
      "category": "Math / Duplicate / Contradiction / Term / Missing information / Charge / Other",
      "title": "specific short title",
      "evidence": "exactly what in the document triggered the finding, quoting only short fragments if useful",
      "whyItMatters": "plain-English explanation without professional advice",
      "nextStep": "a concrete question or verification step",
      "confidence": "high / medium / low"
    }
  ]
}`;

    const content = [{ type: "input_text", text: instructions }];

    if (mime.startsWith("image/")) {
      content.push({ type: "input_image", image_url: `data:${mime};base64,${base64}` });
    } else {
      content.push({
        type: "input_file",
        filename: file.originalFilename || "document.pdf",
        file_data: `data:${mime};base64,${base64}`
      });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content }]
    });

    const cleaned = response.output_text.trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim();
    const parsed = JSON.parse(cleaned);

    const safe = {
      worthInvestigating: Boolean(parsed.worthInvestigating && parsed.findingCount > 0),
      headline: String(parsed.headline || "Scan complete."),
      summary: String(parsed.summary || ""),
      findingCount: Math.max(0, Math.min(5, Number(parsed.findingCount || 0))),
      estimatedStakes: parsed.estimatedStakes ? String(parsed.estimatedStakes) : null,
      findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0,5) : []
    };

    const teasers = safe.findings.map(f => ({
      category: String(f.category || "Finding"),
      teaser: String(f.title || "Item worth reviewing")
    }));

    usage.count += 1;
    res.setHeader("Set-Cookie", `so_scans=${Buffer.from(JSON.stringify(usage)).toString("base64url")}; Path=/; Max-Age=86400; SameSite=Lax; Secure`);

    return res.status(200).json({
      worthInvestigating: safe.worthInvestigating,
      headline: safe.headline,
      summary: safe.summary,
      findingCount: safe.findingCount,
      estimatedStakes: safe.estimatedStakes,
      teasers,
      sealedReport: seal(safe)
    });

  } catch (err) {
    console.error(err);
    const msg = String(err?.message || "");
    if (msg.includes("credits") || msg.includes("quota")) return res.status(402).json({ error: "Document scanning is temporarily unavailable because the analysis account needs credit." });
    if (msg.includes("configuration")) return res.status(500).json({ error: "Payment setup is not finished yet." });
    return res.status(500).json({ error: "We couldn't analyze that document. Try a smaller PDF/image or another file." });
  }
}
