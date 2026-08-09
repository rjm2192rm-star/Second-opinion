import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

function parseForm(req) {
  const form = formidable({ maxFileSize: 10 * 1024 * 1024, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { files } = await parseForm(req);
    const raw = files.file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const mime = file.mimetype || "";
    if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
      return res.status(400).json({ error: "Use a PDF or image." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const base64 = fs.readFileSync(file.filepath).toString("base64");

    const prompt = `You are a skeptical document checker. Review the supplied document and identify ONLY concrete, independently verifiable anomalies such as arithmetic errors, duplicate charges, internal contradictions, date or quantity mismatches, missing expected information, unusual or consequential terms, and charges worth questioning.

Do not invent market benchmarks. Do not state that something is legally invalid. Distinguish uncertainty. If nothing material is visible, say so.

Return ONLY valid JSON with this exact shape:
{
  "worthInvestigating": true,
  "headline": "short headline",
  "summary": "2-4 sentence plain-English summary",
  "findingCount": 0,
  "estimatedStakes": null
}

estimatedStakes must be a dollar amount or range ONLY when directly supportable from the document; otherwise null.`;

    const content = [{ type: "input_text", text: prompt }];

    if (mime.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${base64}`
      });
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

    const text = response.output_text.trim();
    const cleaned = text.replace(/^```json\s*/i,"").replace(/```$/,"").trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not analyze this document." });
  }
}
