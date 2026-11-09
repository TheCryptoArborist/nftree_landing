/**
 * Headless viewport QA for the mobile active-match DOM. A deterministic mock
 * provides the actual Garden Bot CSS classes and card arrangement without
 * sending mainnet transactions. This does NOT replace manual Slush QA.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve("public");
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json"};
const server = http.createServer((req,res)=>{
  try {
    const u=new URL(req.url,"http://localhost");
    let pathname=decodeURIComponent(u.pathname);
    if (pathname==="/battle/garden-bot-preview"||pathname==="/battle/garden-bot-preview/")pathname="/battle/garden-bot-preview/index.html";
    const file=path.resolve(root,"."+pathname);
    if(!file.startsWith(root+path.sep))throw Error("unsafe path");
    const b=fs.readFileSync(file);
    res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
    res.end(b);
  }catch{res.writeHead(404);res.end("not found");}
});
await new Promise(done=>server.listen(4183,"127.0.0.1",done));

const samples=[
 {width:320,height:568},{width:375,height:667},
 {width:390,height:844},{width:414,height:896}
];
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
fs.mkdirSync("qa-garden-bot-preview",{recursive:true});
let failures=0;
try {
  for(const {width,height} of samples){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    page.route(/^https:\/\/fonts\./,r=>r.abort());
    try{
      await page.goto("http://127.0.0.1:4183/battle/garden-bot-preview",{waitUntil:"domcontentloaded"});
      await page.evaluate(()=>{
        const app=document.getElementById("root");
        if(app)app.style.display="none";
        document.body.style.margin="0";
        document.body.style.overflow="hidden";
        const names=[
          ["Pruning Fury","ATTACK","Spends 4 Growth to drain 16.","/battle/assets/card-icons/v13/16-pruning-fury.png","attack"],
          ["Sap Surge","GROWTH","Gains 13 at 10 Growth or below.","/battle/assets/card-icons/v13/28-sap-surge.png","growth"],
          ["Barklash Shield","HYBRID","Gains 6 Growth and blocks next hit.","/battle/assets/card-icons/v13/08-barklash-shield.png","hybrid"],
          ["Fungal Doom","ATTACK","Drains 7 now, 4 next turn.","/battle/assets/card-icons/v13/13-fungal-doom.png","attack"],
          ["Canopy Explosion","TREE POWER","Removes a block and gains 10 Growth.","/battle/assets/card-icons/v13/35-canopy-explosion.png","growth"]
        ];
        const cards=names.map(([name,type,effect,img,kind],i)=>`
          <button data-testid="mock-card-${i}" class="gb-battle-move-card ${i===4?"gb-battle-move-card-fifth":""}" type="button"
            style="padding:12px 10px; border:2px solid ${kind==="growth"?"#00ff88":"#ff5544"}; border-radius:10px; background:rgba(0,70,30,.75); display:flex; flex-direction:column; gap:4px; text-align:left;">
            <span class="gb-move-face gb-move-face-${kind}">
              <span class="gb-move-face-visual"><img class="gb-move-face-icon gb-move-face-art" src="${img}" alt=""></span>
              <span class="gb-move-face-copy">
                <span class="gb-move-face-badges"><span>${type}</span></span>
                <strong>${name}</strong><small>${effect}</small>
              </span>
            </span>
          </button>`).join("");
        const portrait=(who,img,testid)=>`
          <div class="${who==="You"?"player-card":"opponent-card"}" style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:280px">
            <div class="gb-battle-slot-label" style="font-size:13px;padding:5px 12px;margin-bottom:8px">${who}</div>
            <div class="gb-battle-tree-portrait" style="width:100%;aspect-ratio:5/7;max-width:240px;margin-bottom:10px;display:flex;align-items:center;justify-content:center">
              <img class="growth-stage-art" src="${img}" alt="${who} growing tree" style="width:94%;height:94%;object-fit:contain">
            </div>
            <p style="font-size:13px;margin-top:4px">Growth</p>
            <div style="width:100%;height:18px;padding:2px;margin:4px 0;max-width:240px;background:black">
              <div data-testid="health-bar-${testid}" style="height:18px;width:20%;background:#00ff88"></div>
            </div>
            <p data-testid="text-growth-${testid}" style="font-size:17px;margin-top:4px">10 / 50</p>
          </div>`;
        const fixture=document.createElement("div");
        fixture.className="gb-battle-page gb-battle-page-active";
        fixture.innerHTML=`
          <header class="gb-app-header">
            <div class="gb-header-brand"><img class="gb-header-game-logo" src="/battle/assets/garden.png" alt="Garden Battles"></div>
            <div class="gb-header-actions"><button style="min-height:38px">Wallet</button><button class="gb-mobile-menu-toggle" style="min-height:38px">Menu</button></div>
          </header>
          <div class="gb-player-status-strip">Profile information hidden during active gameplay</div>
          <main class="gb-battle-main">
            <section class="gb-quick-start-tools">No active game controls here</section>
            <div class="gb-battle-hud"><div class="gb-battle-hud-center">
              <aside class="gb-match-status-bar"><div class="gb-match-status-summary"><span>Garden Bot Match</span><strong>First to 50 Growth</strong></div><div class="gb-match-status-live"><strong>Your Turn</strong></div></aside>
              <section class="gb-battle-arena"><div class="battle-grid">
                ${portrait("You","/battle/assets/battle-trees/player-stage-1.png","player")}
                <div class="vs-element" style="font-size:48px;min-width:54px;min-height:54px">VS</div>
                ${portrait("Garden Bot","/battle/assets/battle-trees/garden-bot-stage-1.png","opponent")}
              </div></section>
              <div class="gb-battle-options" data-testid="battle-options">
                <div class="gb-turn-command"><span>Your Turn</span><strong>Choose a card</strong></div>
                <div class="gb-hand-toolbar"><span><small>Your Hand</small><strong>2 Attack · 1 Growth · 1 Hybrid</strong></span><button type="button">Card Guide</button></div>
                <div class="gb-move-card-grid">${cards}</div>
                <section class="gb-free-bot-reroll"><strong>Free Garden Bot Reroll</strong><button type="button">Reroll</button></section>
                <div class="gb-battle-log-panel">Battle Log</div>
              </div>
            </div></div>
          </main>`;
        fixture.id="qa-active-match";
        document.body.append(fixture);
        fixture.querySelector('[data-testid="mock-card-0"]').addEventListener("click",()=>{
          fixture.querySelector('[data-testid="text-growth-opponent"]').textContent="7 / 50";
        });
      });
      // Wait for the actual artwork, rather than assuming it decodes in 150ms.
      await page.locator("#qa-active-match .gb-battle-tree-portrait img").evaluateAll(
        images => Promise.all(images.map(image => image.decode()))
      );
      const m=await page.evaluate(()=>{
        const bbox=x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width}};
        const root=document.getElementById("qa-active-match");
        const arena=root.querySelector(".gb-battle-arena");
        const options=root.querySelector(".gb-battle-options");
        const cards=[...root.querySelectorAll(".gb-battle-move-card")];
        const growth=[...root.querySelectorAll('[data-testid^="text-growth-"]')];
        return {
          viewport:{width:window.innerWidth,height:window.innerHeight},
          bodyHeight:document.documentElement.scrollHeight,
          bodyWidth:document.documentElement.scrollWidth,
          stage:bbox(root),arena:bbox(arena),options:bbox(options),
          optionsScroll:options.scrollHeight-options.clientHeight,
          cardRects:cards.map(bbox),
          growthRects:growth.map(bbox),
          cardCount:cards.length,
          labels:cards.map(x=>x.innerText.split("\n").join(" ").slice(0,140)),
          images: [...root.querySelectorAll(".gb-battle-tree-portrait img")].map(x=>x.complete&&x.naturalWidth>0),
          cssLoaded: [...document.styleSheets].some(x=>x.href?.includes("garden-bot-preview-compact-game.css")),
        };
      });
      if(!m.cssLoaded)throw Error("compact CSS not loaded");
      if(m.cardCount!==5)throw Error("missing a playable card");
      if(m.bodyWidth>width+1 || m.bodyHeight>height+1)throw Error("page-level scrolling still required");
      if(!m.images.every(Boolean))throw Error("tree artwork missing");
      if(m.cardRects.some(r=>r.bottom>height+1||r.top<0||r.height<44||r.width<44))throw Error("a card is outside the visible viewport");
      if(m.growthRects.some(r=>r.top<0||r.bottom>height+1))throw Error("Growth is outside the viewport");
      if(m.arena.bottom>m.cardRects[0].top)throw Error("arena overlaps card tray");
      await page.screenshot({path:`qa-garden-bot-preview/active-match-${width}x${height}.png`,fullPage:false});
      await page.locator('[data-testid="mock-card-0"]').click();
      if((await page.locator('[data-testid="text-growth-opponent"]').innerText()).trim()!=="7 / 50")throw Error("card could not be clicked");
      console.log(JSON.stringify({viewport:`${width}x${height}`,result:"PASS",metrics:m}));
    }catch(e){
      failures++;
      await page.screenshot({path:`qa-garden-bot-preview/active-match-error-${width}x${height}.png`,fullPage:false}).catch(()=>{});
      console.error(JSON.stringify({viewport:`${width}x${height}`,result:"FAIL",error:String(e)}));
    }finally{await page.close();}
  }
}finally{
 await browser.close();
 await new Promise(done=>server.close(done));
}
if(failures)process.exitCode=1;
