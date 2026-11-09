/** Actual PvP React UI with wallet callbacks replaced on the local QA server only.
 * Never signs, deposits, refunds, claims or sends a real transaction.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve("public");
const bundle = fs.readFileSync("public/battle/assets/pvp-mobile-preview.js", "utf8");
const walletHook = 'function _A(){const e=p.useContext(SA);if(!e)throw new Error("useSuiWallet must be used within SuiWalletProvider");return e}';
const mount = 'xj(document.getElementById("root")).render(a.jsx(QQ,{}));';
assert.equal(bundle.split(walletHook).length, 2); assert.equal(bundle.split(mount).length, 2);
const qaBundle = bundle.replace(walletHook, 'function _A(){return window.qaWallet}')
  .replace(mount, 'const qaRoot=xj(document.getElementById("root"));window.qaRender=()=>qaRoot.render(a.jsx(QQ,{}));window.qaRender();');
const realHtml = fs.readFileSync("public/battle/pvp-preview/index.html", "utf8");
const html = realHtml.replace("pvp-mobile-preview.js", "__qa-pvp.js");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/battle/pvp-preview") { res.setHeader("Content-Type","text/html");res.end(url.searchParams.has("real")?realHtml:html);return; }
    if (url.pathname === "/battle/assets/__qa-pvp.js") { res.setHeader("Content-Type","text/javascript");res.end(qaBundle);return; }
    let target=path.resolve(root,"."+url.pathname); assert.ok(target.startsWith(root+path.sep));
    if(fs.statSync(target).isDirectory())target=path.join(target,"index.html");
    res.setHeader("Content-Type",mime[path.extname(target)]||"application/octet-stream");res.end(fs.readFileSync(target));
  } catch { res.writeHead(404);res.end("Not found"); }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
fs.mkdirSync("qa-pvp-mobile",{recursive:true});
let failures=0;
try {
  for(const [width,height] of [[320,568],[375,667],[390,844],[414,896]]) {
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
    const errors=[];page.on("pageerror",e=>{errors.push(e.message);console.error("PAGE ERROR",e.stack);});
    page.on("requestfailed",r=>console.error("REQUEST FAILED",r.url(),r.failure()?.errorText));
    await page.route("**/*",route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    await page.addInitScript(()=>{
      localStorage.clear();
      const owner="0x"+"a".repeat(64),opponent="0x"+"b".repeat(64);
      const scenario=new URLSearchParams(location.search).get("scenario")||"active";
      window.qaCalls={join:0,refund:0,move:0,forfeit:0,timeout:0,share:0};
      const battle={battleId:"0x"+"c".repeat(64),player1:owner,player2:opponent,
        player1Moves:[16,28,8,13,35],player2Moves:[16,28,8,13,35],player1Growth:13,player2Growth:10,
        turn:0,winner:null,finished:false,isBotBattle:false,battleVersion:"pvp-v3",targetGrowth:50,
        matchLabel:"50-Growth Match",lastMoveMs:Date.now(),player1FifthMoveEntitled:true,player2FifthMoveEntitled:true};
      const queue={queueId:"0x"+"d".repeat(64),player:owner,entryFeeMist:3000000000n,targetGrowth:50,matchLabel:"50-Growth Match",queueType:"v3"};
      const rerender=()=>window.qaRender?.();
      const wallet={address:owner,isConnected:true,battleState:battle,isWaiting:false,pvpQueueState:null,entryFeeMist:3000000000n,isMyTurn:true,
        actionLog:[],moveLifecycleStage:"idle",isMoveTransactionPending:false,treeRerollLifecycleStage:"idle",isTreeRerollTransactionPending:false,
        treeRerollCostTree:20000,isBattleRefreshPending:false,recoverableBattleError:null,
        clearActionLog(){},dismissRecoverableBattleError(){},
        getFirstValidSaplingNft:async()=>({nftId:"0x"+"e".repeat(64),nftType:"0x1::nft::NFT",location:"wallet",imageUrl:"/battle/assets/battle-trees/player-stage-4.png"}),
        joinBattle:async(nft,target)=>{window.qaCalls.join++;if(target!==50)throw Error("Wrong match target");wallet.pvpQueueState=queue;wallet.isWaiting=true;rerender();return {status:"joined"};},
        cancelQueue:async options=>{window.qaCalls.refund++;options?.onWalletApprovalRequested?.(queue);wallet.pvpQueueState=null;wallet.isWaiting=false;options?.onRefundConfirmed?.();rerender();return {queueState:queue};},
        useAbility:async()=>{window.qaCalls.move++;if(scenario==="reject")throw Error("Rejected in wallet");wallet.battleState={...battle,player1Growth:57,player2Growth:18,winner:owner,finished:true};rerender();},
        rerollHand:async()=>{},claimTimeoutWin:async()=>{window.qaCalls.timeout++;},forfeitBattle:async()=>{window.qaCalls.forfeit++;},adminForceClose:async()=>{},
        refreshPvpQueueState:async()=>wallet.pvpQueueState,refreshActivePvpBattle:async()=>true,refreshCurrentBattleState:async()=>true,
      };
      if(scenario==="landing"){wallet.isConnected=false;wallet.address=null;wallet.battleState=null;}
      if(scenario==="queue"){wallet.battleState=null;wallet.pvpQueueState=queue;wallet.isWaiting=true;}
      if(scenario==="waiting"||scenario==="timeout"){wallet.isMyTurn=false;battle.turn=1;}
      if(scenario==="timeout")battle.lastMoveMs=Date.now()-25*60*60*1000;
      if(scenario==="pending"){wallet.isMoveTransactionPending=true;wallet.moveLifecycleStage="awaiting-wallet-approval";}
      if(scenario==="bonus")battle.player1Moves=[16,28,8,13,35,36,37];
      if(scenario==="finish")battle.player1Growth=49;
      window.qaWallet=wallet;
      Object.defineProperty(navigator,"canShare",{value:data=>data.files?.[0]?.type==="image/png"});
      Object.defineProperty(navigator,"share",{value:async data=>{window.qaCalls.share++;window.qaShare={text:data.text,name:data.files[0].name,size:data.files[0].size};}});
    });
    const visit=async scenario=>{await page.goto(origin+"/battle/pvp-preview?scenario="+scenario,{waitUntil:"domcontentloaded"});};
    try {
      await page.goto(origin+"/battle/pvp-preview?real=1",{waitUntil:"domcontentloaded"});
      await page.getByTestId("button-join-battle").waitFor();
      assert.equal(await page.getByTestId("button-join-battle").isDisabled(),true);
      await visit("landing");
      const join=page.getByTestId("button-join-battle");await join.waitFor();assert.equal(await join.isDisabled(),true);
      assert.match(await join.innerText(),/3 SUI/);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`qa-pvp-mobile/landing-${width}.png`,fullPage:true});
      await visit("queue");
      const refund=page.getByTestId("button-queue-refund");await refund.waitFor();assert.ok(await refund.isEnabled());
      assert.match(await page.locator(".gb-pvp-queue-facts").innerText(),/3 SUI/);
      assert.match(await page.locator(".gb-pvp-queue-facts").innerText(),/5 SUI/);
      await page.screenshot({path:`qa-pvp-mobile/queue-${width}.png`,fullPage:true});
      await refund.click();await page.waitForFunction(()=>window.qaCalls.refund===1);
      await page.getByText(/Refund complete/).waitFor();
      for(const scenario of ["active","waiting","pending"]){
        await visit(scenario);
        const cards=page.locator(".gb-battle-move-card");await cards.first().waitFor();assert.equal(await cards.count(),5);
        await page.locator(".gb-battle-tree-portrait img").evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
        const metrics=await page.evaluate(()=>({
          height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,
          cards:[...document.querySelectorAll(".gb-battle-move-card")].map(c=>{const b=c.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,width:b.width,disabled:c.disabled};}),
          growth:[...document.querySelectorAll('[data-testid^="text-growth-"]')].map(c=>{const b=c.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}),
        }));
        assert.ok(metrics.width<=width+1 && metrics.height<=height+2,JSON.stringify(metrics));
        assert.ok(metrics.cards.every(c=>c.top>=0&&c.bottom<=height+1&&c.height>=44&&c.width>=44),JSON.stringify(metrics));
        assert.ok(metrics.growth.length===2&&metrics.growth.every(g=>g.top>=0&&g.bottom<=height));
        assert.equal(metrics.cards.every(c=>c.disabled),scenario!=="active");
        await page.screenshot({path:`qa-pvp-mobile/${scenario}-${width}.png`});
        if(scenario==="active"){
          const details=page.locator(".gb-match-terms-details");assert.ok(await details.isVisible());
          await details.locator("summary").click();assert.match(await details.innerText(),/SUI/);await details.locator("summary").click();
          await page.getByText("Match options",{exact:true}).click();
          await page.getByRole("button",{name:"Forfeit Battle",exact:true}).click();
          await page.getByRole("dialog",{name:"Confirm forfeit"}).waitFor();
          await page.getByRole("button",{name:"Keep Playing",exact:true}).click();assert.equal(await page.evaluate(()=>window.qaCalls.forfeit),0);
        }
      }
      await visit("timeout");
      const claim=page.getByRole("button",{name:"Claim Timeout Win",exact:true});await claim.waitFor();await claim.click();
      assert.equal(await page.evaluate(()=>window.qaCalls.timeout),1);
      await visit("bonus");
      await page.locator(".gb-fifth-picker-card").first().click();
      await page.locator(".gb-bonus-detail-effect").waitFor();assert.ok((await page.locator(".gb-bonus-detail-effect").innerText()).length>10);
      await page.getByRole("button",{name:"Choose this bonus",exact:true}).click();assert.equal(await page.evaluate(()=>window.qaCalls.move),0);
      assert.equal(await page.locator(".gb-battle-move-card").count(),5);
      await visit("reject");await page.locator(".gb-battle-move-card").first().click();
      await page.waitForFunction(()=>window.qaCalls.move===1);await page.getByText(/Rejected in wallet/).waitFor();
      assert.equal(await page.getByTestId("text-growth-player").innerText(),"13 / 50");
      await visit("finish");await page.locator(".gb-battle-move-card").first().click();
      const result=page.getByRole("dialog",{name:"You Win!",exact:true});await result.waitFor();
      const save=result.getByRole("link",{name:"Save Image",exact:true});await save.waitFor();assert.equal(await save.getAttribute("download"),"garden-battles-pvp-result.png");
      await result.getByRole("button",{name:"Share Card",exact:true}).click();
      assert.match((await page.evaluate(()=>window.qaShare)).text,/www\.tree-token\.xyz/);
      assert.equal((await page.evaluate(()=>window.qaShare)).name,"garden-battles-pvp-result.png");
      await result.getByRole("button",{name:/^Share to Apps/}).click();assert.equal(await page.evaluate(()=>window.qaCalls.share),2);
      await page.screenshot({path:`qa-pvp-mobile/result-${width}.png`});
      assert.deepEqual(errors,[]);
      console.log(`PASS PvP ${width}×${height}: landing, queue/refund mock, 5 cards, waiting, pending, timeout mock, bonus inspection, forfeit cancel, wallet rejection, completion/share`);
    }catch(error){failures++;await page.screenshot({path:`qa-pvp-mobile/error-${width}.png`,fullPage:true}).catch(()=>{});console.error(`FAIL PvP ${width}×${height}: ${error.stack}`);}
    finally{await page.close();}
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
if(failures)process.exitCode=1;
