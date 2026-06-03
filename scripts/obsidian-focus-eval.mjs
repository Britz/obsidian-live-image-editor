#!/usr/bin/env node
// Research helper: enable CDP focus emulation (so the editor behaves as if the window
// is focused, even though it's backgrounded), then run a sequence of evals with waits
// in ONE connection. Usage: node obsidian-focus-eval.mjs '<expr1>' --wait 1200 '<expr2>' ...
import http from "node:http"; import dns from "node:dns/promises";
const HOST=process.env.CDP_HOST||"host.containers.internal"; const PORT=Number(process.env.CDP_PORT||9222);
let ip; try{ ip=(await dns.lookup(HOST)).address; }catch{ ip=HOST; }
const get=(p)=>new Promise((res,rej)=>{const r=http.get({host:ip,port:PORT,path:p,headers:{Host:`${ip}:${PORT}`},timeout:4000},(x)=>{let b="";x.on("data",c=>b+=c);x.on("end",()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})});r.on("timeout",()=>r.destroy(new Error("timeout")));r.on("error",rej)});
const targets=await get("/json"); const pages=targets.filter(t=>t.type==="page");
const chosen=pages.sort((a,b)=>((b.url||"").startsWith("app://obsidian.md")?2:0)-((a.url||"").startsWith("app://obsidian.md")?2:0))[0];
const ws=new WebSocket(chosen.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/,`ws://${ip}:${PORT}`));
let id=1; const pend=new Map();
const send=(m,p={})=>{const i=id++;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise((res,rej)=>pend.set(i,{res,rej}))};
ws.addEventListener("message",ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);return m.error?rej(new Error(JSON.stringify(m.error))):res(m.result)}});
const evalExpr=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return"EXC: "+(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result&&("value"in r.result)?r.result.value:(r.result?.description||r.result?.type)};
await new Promise(r=>ws.addEventListener("open",r));
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setFocusEmulationEnabled",{enabled:true});  // <-- the key
await send("Page.bringToFront").catch(()=>{});
// parse args: exprs separated by --wait <ms>
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==="--wait"){ await new Promise(r=>setTimeout(r,Number(args[++i])||500)); continue; }
  console.log("→ "+JSON.stringify(await evalExpr(args[i])));
}
process.exit(0);
