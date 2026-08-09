import {generateObject} from "ai";
import {openai} from "@ai-sdk/openai";
import {z} from "zod";
export const runtime="nodejs";
const schema=z.object({
 worthInvestigating:z.boolean(),
 headline:z.string(),
 summary:z.string(),
 findingCount:z.number(),
 estimatedStakes:z.string().nullable(),
 findings:z.array(z.object({title:z.string(),evidence:z.string(),why:z.string(),nextStep:z.string(),confidence:z.enum(["low","medium","high"])}))
});
export async function POST(req:Request){
 try{
  const data=await req.formData(); const file=data.get("file");
  if(!(file instanceof File)) return Response.json({error:"No file uploaded"},{status:400});
  if(file.size>10_000_000)return Response.json({error:"Maximum file size is 10 MB"},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer());
  const type=file.type||"application/pdf";
  const base64=bytes.toString("base64");
  const prompt=`Act as a skeptical document checker. Identify ONLY concrete, independently verifiable anomalies: arithmetic errors, duplicates, internal contradictions, missing expected information, unusual or potentially consequential terms, date/quantity mismatches, and charges worth questioning. Never invent benchmarks or claim something is legally invalid. Distinguish uncertainty. If nothing material is visible, say so. estimatedStakes must only contain a dollar amount/range directly supportable by the document, otherwise null.`;
  const content:any[]=[{type:"text",text:prompt}];
  if(type==="application/pdf") content.push({type:"file",data:base64,mimeType:type});
  else if(type.startsWith("image/")) content.push({type:"image",image:base64,mimeType:type});
  else return Response.json({error:"Use a PDF or image."},{status:400});
  const {object}=await generateObject({model:openai("gpt-4.1-mini"),schema,messages:[{role:"user",content}]});
  // MVP intentionally withholds detailed findings from client until billing is added.
  return Response.json({...object,findings:undefined});
 }catch(e:any){console.error(e);return Response.json({error:"Could not analyze this document."},{status:500})}
}