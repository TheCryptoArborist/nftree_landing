import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "playwright";

const root=path.resolve("public");
const fixture=fs.readFileSync("test/fixtures/garden-bot-rank-landing-mobile.html");
const mime={".html":"text/html; charset=utf-8",".css":"text/css",".js":"application/javascript",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
  if(pathname==="/__rank-fixture"){res.writeHead(200,{"Content-Type":mime[".html"]});return res.end(fixture)}
  const resolved=path.resolve(root,"."+pathname);
  if(!resolved.startsWith(root+path.sep))throw Error("Unsafe path");
  const data=fs.readFileSync(resolved);
  res.writeHead(200,{"Content-Type":mime[path.extname(resolved)]||"application/octet-stream"});
  res.end(data);
 }catch{res.writeHead(404);res.end("Not found")}
});
await new Promise(done=>server.listen(4185,"127.0.0.1",done));
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const sizes=[{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:414,height:896},{width:700,height:900}];
fs.mkdirSync("qa-garden-bot-ranks",{recursive:true});
const report=[];let failed=false;
try{
for(const size of sizes){
 const page=await browser.newPage({viewport:size,isMobile:true,hasTouch:true});
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  const response=await page.goto("http://127.0.0.1:4185/__rank-fixture",{waitUntil:"networkidle",timeout:20000});
  if(!response?.ok())throw Error("Fixture HTTP "+response?.status());
  const measure=()=>page.evaluate(()=>{
   const profile=document.querySelector(".gb-player-status-strip");
   const grid=document.querySelector(".gb-player-profile-content");
   const battle=document.querySelector(".gb-player-record-card.gb-hud-rank-card");
   const tree=document.querySelector(".gb-tree-status-card");
   const sources=document.querySelector(".gb-tree-status-sources");
   const title=tree.querySelector(".gb-holder-rank-title");
   const battleTitle=battle.querySelector(".gb-battle-rank-title");
   const qualifier=tree.querySelector(".gb-tree-status-qualifying");
   const kicker=tree.querySelector(".gb-holder-rank-kicker");
   const stats=document.querySelector("#stats-toggle");
   const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   return {
     screen:{width:window.innerWidth,height:window.innerHeight},
     bodyWidth:document.documentElement.scrollWidth,
     expanded:profile.dataset.expanded,
     columns:getComputedStyle(grid).gridTemplateColumns,
     battle:rect(battle),
     tree:rect(tree),
     battleTitleFont:parseFloat(getComputedStyle(battleTitle).fontSize),
     treeTitleFont:parseFloat(getComputedStyle(title).fontSize),
     qualifierFont:parseFloat(getComputedStyle(qualifier).fontSize),
     kickerFont:parseFloat(getComputedStyle(kicker).fontSize),
     sourcesDisplay:getComputedStyle(sources).display,
     sourceRows:[...sources.children].map(el=>({bounds:rect(el),size:parseFloat(getComputedStyle(el.querySelector("span")).fontSize)})),
     statsHeight:stats.getBoundingClientRect().height,
     startCount:document.querySelectorAll('[data-testid="button-start-bot-battle"]').length,
     rankLabels:[battleTitle.textContent,title.textContent],
   };
  });
  const collapsed=await measure();
  if(collapsed.bodyWidth>size.width+1)throw Error("Horizontal overflow with Stats collapsed");
  if(collapsed.battle.width<size.width-45||collapsed.tree.width<size.width-45)throw Error("Rank card still squeezed into columns");
  if(collapsed.tree.top<=collapsed.battle.top||collapsed.tree.top<collapsed.battle.bottom-3)throw Error("Rank cards are not stacked");
  if(collapsed.battleTitleFont<15||collapsed.treeTitleFont<15||collapsed.qualifierFont<11||collapsed.kickerFont<9)throw Error("Rank text remains too small");
  if(collapsed.sourcesDisplay!=="none")throw Error("Source numbers should be behind Stats");
  if(collapsed.statsHeight<40)throw Error("Stats button touch target too small");
  if(collapsed.startCount!==1)throw Error("Start Garden Bot action missing");
  await page.screenshot({path:"qa-garden-bot-ranks/summary-"+size.width+"x"+size.height+".png",fullPage:true});
  await page.locator("#stats-toggle").click();
  const expanded=await measure();
  if(expanded.expanded!=="true")throw Error("Stats disclosure failed");
  if(expanded.bodyWidth>size.width+1)throw Error("Horizontal overflow when Stats expanded");
  if(expanded.sourcesDisplay==="none")throw Error("LP/Staking breakdown not revealed");
  if(expanded.sourceRows.length!==3||expanded.sourceRows.some(x=>x.size<11||x.bounds.width<size.width-125))throw Error("Expanded source rows unreadable or clipped");
  await page.screenshot({path:"qa-garden-bot-ranks/details-"+size.width+"x"+size.height+".png",fullPage:true});
  await page.locator("#stats-toggle").click();
  const closed=await measure();
  if(closed.expanded!=="false"||closed.sourcesDisplay!=="none")throw Error("Stats close failed");
  if(errors.length)throw Error("Runtime errors: "+errors.join(" | "));
  report.push({viewport:size,status:"PASS",collapsed,expanded});
  console.log("PASS "+size.width+"x"+size.height+" readable stacked ranks and expandable LP details");
 }catch(err){
  failed=true;
  report.push({viewport:size,status:"FAIL",reason:String(err)});
  await page.screenshot({path:"qa-garden-bot-ranks/error-"+size.width+"x"+size.height+".png",fullPage:true}).catch(()=>{});
  console.error("FAIL "+size.width+"x"+size.height+" "+String(err));
 }finally{await page.close()}
}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
fs.writeFileSync("qa-garden-bot-ranks/report.json",JSON.stringify(report,null,2));
if(failed)process.exitCode=1;
