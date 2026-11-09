import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(process.cwd(), "public");
const fixture = fs.readFileSync("test/fixtures/garden-bot-active-mobile.html");
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp"};
function serve(req,res){
  try{
    let p = decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    if (p==="/__fixture") {
      res.writeHead(200,{"Content-Type":mime[".html"]}); return res.end(fixture);
    }
    const full = path.resolve(root, "."+p);
    if (full!==root && !full.startsWith(root+path.sep)) throw Error("Unsafe request path");
    const buf = fs.readFileSync(full);
    res.writeHead(200,{"Content-Type":mime[path.extname(full)]??"application/octet-stream"});res.end(buf);
  }catch(err){res.writeHead(404);res.end("Not found");}
}
const server = http.createServer(serve);
await new Promise(resolve=>server.listen(4176,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const sizes=[
  {width:320,height:568},
  {width:375,height:667},
  {width:390,height:844},
  {width:414,height:896},
];
const results=[];
fs.mkdirSync("qa-garden-bot-compact",{recursive:true});
let failed=false;
try{
for(const {width,height} of sizes){
 const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto("http://127.0.0.1:4176/__fixture",{waitUntil:"networkidle",timeout:25000});
  const metrics=await page.evaluate(()=>{
   const rect=e=>{const b=e.getBoundingClientRect();return {top:Math.round(b.top),bottom:Math.round(b.bottom),left:Math.round(b.left),right:Math.round(b.right),height:Math.round(b.height),width:Math.round(b.width)}};
   const get=s=>document.querySelector(s);
   const cards=Array.from(document.querySelectorAll(".gb-battle-move-card"));
   return {
    bodyScroll:document.documentElement.scrollHeight,
    docWidth:document.documentElement.scrollWidth,
    viewportWidth:window.innerWidth,
    viewportHeight:window.innerHeight,
    page:rect(get(".gb-battle-page-active")),
    arena:rect(get(".gb-battle-arena")),
    options:rect(get(".gb-battle-options")),
    turn:rect(get(".gb-turn-command")),
    cards:cards.map(c=>({name:c.querySelector("strong")?.innerText,disabled:c.disabled,...rect(c)})),
    playerGrowth:get('[data-testid="text-growth-player"]')?.innerText,
    botGrowth:get('[data-testid="text-growth-opponent"]')?.innerText,
    optionsScrollable:get(".gb-battle-options").scrollHeight>get(".gb-battle-options").clientHeight,
    bodyClass:get(".gb-battle-page-active")?.className,
   };
  });
  const problems=[];
  if(metrics.docWidth>width+1)problems.push("horizontal document overflow");
  if(metrics.bodyScroll>height+2)problems.push("page-level scrolling: "+metrics.bodyScroll+" vs "+height);
  if(metrics.cards.length!==5)problems.push("expected all five cards");
  if(metrics.cards.some(c=>c.top<0||c.bottom>height+1))problems.push("cards offscreen");
  if(metrics.cards.some(c=>c.width<44||c.height<44))problems.push("card tap target below 44px");
  if(metrics.arena.top<0||metrics.arena.bottom>height)problems.push("battle arena offscreen");
  if(metrics.arena.bottom>metrics.cards[0].top)problems.push("arena/card overlap");
  if(!metrics.playerGrowth||!metrics.botGrowth)problems.push("missing Growth values");
  if(errors.length)problems.push("page errors: "+errors.join(" | "));
  if(problems.length)throw Error(problems.join("; "));
  await page.screenshot({path:"qa-garden-bot-compact/"+width+"x"+height+".png",fullPage:false});
  await page.locator(".gb-battle-move-card").first().click();
  if((await page.locator('[data-testid="text-growth-player"]').innerText()).trim()!=="24 / 50")throw Error("Card tap did not execute test interaction");
  results.push({size:width+"x"+height,status:"PASS",metrics});
  console.log("PASS "+width+"x"+height+" all five cards and two Growth meters in viewport");
 }catch(e){
  failed=true;
  await page.screenshot({path:"qa-garden-bot-compact/error-"+width+"x"+height+".png",fullPage:true}).catch(()=>{});
  results.push({size:width+"x"+height,status:"FAIL",reason:String(e)});
  console.error("FAIL "+width+"x"+height+" "+String(e));
 }finally{await page.close();}
}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
fs.writeFileSync("qa-garden-bot-compact/report.json",JSON.stringify(results,null,2));
if(failed)process.exitCode=1;
