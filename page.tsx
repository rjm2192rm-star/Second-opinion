"use client";
import {useState} from "react";
export default function Home(){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[r,setR]=useState<any>(null),[err,setErr]=useState("");
 async function scan(){
  if(!file)return; setBusy(true);setErr("");setR(null);
  const f=new FormData();f.append("file",file);
  try{const x=await fetch("/api/analyze",{method:"POST",body:f});const j=await x.json();if(!x.ok)throw Error(j.error||"Scan failed");setR(j)}
  catch(e:any){setErr(e.message)}finally{setBusy(false)}
 }
 return <main>
  <nav><b>SECOND OPINION</b><span>Private document check</span></nav>
  <section className="hero"><div className="eyebrow">AI-POWERED DOCUMENT REVIEW</div>
   <h1>Before you pay it,<br/>sign it, or accept it—<br/><i>check it.</i></h1>
   <p>Drop in a quote, invoice, estimate, contract, lease, or statement. We look for contradictions, math errors, duplicate charges, unusual terms, and things worth questioning.</p>
   <div className="card">
    <label className="drop"><input type="file" accept=".pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/>
    <strong>{file?file.name:"Choose a PDF or image"}</strong><small>{file?"Ready to scan":"Your document is sent only for analysis."}</small></label>
    <button disabled={!file||busy} onClick={scan}>{busy?"Scanning every line…":"Run free scan"}</button>
    {err&&<p className="error">{err}</p>}
   </div>
  </section>
  {r&&<section className="result">
   <div className={"signal "+(r.worthInvestigating?"hot":"clear")}>{r.worthInvestigating?"WORTH A CLOSER LOOK":"NO MAJOR FLAGS FOUND"}</div>
   <h2>{r.headline}</h2><p>{r.summary}</p>
   <div className="stats"><div><b>{r.findingCount}</b><span>potential issues</span></div><div><b>{r.estimatedStakes||"—"}</b><span>estimated stakes</span></div></div>
   {r.worthInvestigating&&<div className="unlock"><b>Full Second Opinion</b><p>See each flagged item, where it appears, why it matters, and what to ask next.</p><button onClick={()=>alert("Connect Stripe Checkout here before launch.")}>Unlock report — $19</button></div>}
  </section>}
  <section className="trust"><h2>One job: find what you might have missed.</h2><p>Second Opinion does not provide legal, financial, medical, or professional advice. It identifies potential inconsistencies and questions for you to independently verify.</p></section>
 </main>
}