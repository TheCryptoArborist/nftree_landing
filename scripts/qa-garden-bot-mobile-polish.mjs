/** Wallet-free responsive QA for the same-origin Garden Bot preview.
 * Verifies real class structure and CSS only; does not exercise Slush signing.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root=path.resolve("public");
const samples=[
  {width:320,height:568},
  {width:375,height:667},
  {width:390,height:844},
  {width:414,height:896},
];
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,"http://127.0.0.1");
    const route=decodeURIComponent(url.pathname);
    const file=route==="/__mobile-battle"
      ?"test/fixtures/garden-bot-active-mobile.html"
      :route==="/__mobile-result"
        ?"test/fixtures/garden-bot-result-mobile.html"
        :null;
    const resolved=file?path.resolve(file):path.resolve(root,"."+route);
    if(!file && !resolved.startsWith(root+path.sep)) throw Error("Unsafe path");
    const data=fs.readFileSync(resolved);
    res.writeHead(200,{"Content-Type":mime[path.extname(resolved)]||"application/octet-stream"});
    res.end(data);
  }catch(error){res.writeHead(404);res.end("Not found")}
});
await new Promise(resolve=>server.listen(4184,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
fs.mkdirSync("qa-garden-bot-polish",{recursive:true});
let failures=0;
const report=[];
try{
for(const size of samples){
  const page=await browser.newPage({viewport:size,isMobile:true,hasTouch:true});
  const pageErrors=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  try{
    await page.goto("http://127.0.0.1:4184/__mobile-battle",{waitUntil:"networkidle",timeout:20000});
    await page.evaluate(()=>{
      const turn=document.querySelector(".gb-turn-command");
      turn?.insertAdjacentHTML("beforeend", '<div class="gb-bonus-step-help"><p>Bonus card selected. Choose your first playing card.</p><button type="button" data-testid="button-bonus-next-step">Continue to playing cards ↓</button></div>');
    });
    const m=await page.evaluate(()=>{
      const get=s=>document.querySelector(s);
      const bbox=x=>{const r=x.getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const cards=[...document.querySelectorAll(".gb-battle-move-card")];
      const jump=get('[data-testid="button-bonus-next-step"]');
      return {
        scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,
        viewportHeight:window.innerHeight,
        arena:bbox(get(".gb-battle-arena")),
        cards:cards.map(bbox),
        cardCount:cards.length,
        step2JumpDisplay:getComputedStyle(jump).display,
        rerollDisplay:getComputedStyle(get(".gb-free-bot-reroll")).display,
        reroll:bbox(get(".gb-free-bot-reroll")),
        growth:[get('[data-testid="text-growth-player"]')?.textContent,get('[data-testid="text-growth-opponent"]')?.textContent]
      };
    });
    if(m.scrollWidth>size.width+1)throw Error("Battle document horizontal overflow");
    if(m.scrollHeight>size.height+2)throw Error("Battle document scroll remains");
    if(m.cardCount!==5)throw Error("Missing five cards");
    if(m.cards.some(r=>r.bottom>size.height+1||r.top<0||r.height<44))throw Error("Card offscreen or too small");
    if(m.arena.bottom>m.cards[0].top||m.arena.top<0)throw Error("Arena overlaps cards");
    if(m.step2JumpDisplay!=="none")throw Error("Redundant Step 2 button still visible");
    if(m.rerollDisplay!=="grid")throw Error("Reroll did not use compact row");
    if(m.growth.some(v=>!v))throw Error("Missing growth values");
    await page.screenshot({path:"qa-garden-bot-polish/battle-"+size.width+"x"+size.height+".png"});
    report.push({screen:"battle",size,status:"PASS",metrics:m});
    console.log("PASS active battle mobile polish "+size.width+"x"+size.height);
  }catch(e){
    failures++;
    console.error("FAIL active battle "+size.width+"x"+size.height+" "+String(e));
    await page.screenshot({path:"qa-garden-bot-polish/battle-error-"+size.width+".png"}).catch(()=>{});
    report.push({screen:"battle",size,status:"FAIL",message:String(e)});
  }

  try{
    await page.goto("http://127.0.0.1:4184/__mobile-result",{waitUntil:"networkidle",timeout:20000});
    const m=await page.evaluate(()=>{
      const d=document.querySelector(".gb-result-modal");
      const share=document.querySelector(".gb-result-share-primary");
      const r=d.getBoundingClientRect(),s=share.getBoundingClientRect();
      return{
        docWidth:document.documentElement.scrollWidth,
        modal:{top:r.top,bottom:r.bottom,width:r.width,height:r.height},
        share:{top:s.top,bottom:s.bottom,height:s.height},
        scrollable:d.scrollHeight>d.clientHeight,
        shareButtons:document.querySelectorAll(".gb-result-modal-actions > *").length,
        imageFound:!!document.querySelector(".gb-result-modal-image"),
        heading:document.querySelector("#gb-result-modal-title")?.textContent,
        modalDisplay:getComputedStyle(d).display,
      };
    });
    if(m.docWidth>size.width+1)throw Error("Result page horizontal overflow");
    if(m.modal.top<0||m.modal.bottom>size.height+1)throw Error("Result modal outside phone viewport");
    if(m.share.height<44)throw Error("Share action too small");
    if(m.shareButtons!==5||!m.imageFound||!m.heading)throw Error("Missing expected result/share controls");
    if(m.modalDisplay!=="flex")throw Error("Result flex layout not enabled");
    await page.locator(".gb-result-share-primary").scrollIntoViewIfNeeded();
    await page.screenshot({path:"qa-garden-bot-polish/result-"+size.width+"x"+size.height+".png"});
    report.push({screen:"result",size,status:"PASS",metrics:m});
    console.log("PASS result/share mobile polish "+size.width+"x"+size.height);
  }catch(e){
    failures++;
    console.error("FAIL result screen "+size.width+"x"+size.height+" "+String(e));
    await page.screenshot({path:"qa-garden-bot-polish/result-error-"+size.width+".png"}).catch(()=>{});
    report.push({screen:"result",size,status:"FAIL",message:String(e)});
  }
  if(pageErrors.length){failures++;console.error("Browser errors "+pageErrors.join(" | "))}
  await page.close();
}
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
fs.writeFileSync("qa-garden-bot-polish/report.json",JSON.stringify(report,null,2));
if(failures)process.exitCode=1;
