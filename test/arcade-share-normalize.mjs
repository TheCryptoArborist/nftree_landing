// Preserve historical whole-bundle security assertions while allowing the
// explicitly reviewed result-only insertions. Unknown insertions fail closed.
import assert from 'node:assert/strict';
export function beforeArcadeHandoff(source){
 const prefix='import{EndSharePrompt as ArcadeEndSharePrompt}from"./arcade-end-share-prompt.js";\n';
 if(!source.startsWith(prefix))return source;
 let original=source.slice(prefix.length);
 const edits=[['function TY({open:e,arcadeRun=null,title:t,','function TY({open:e,title:t,'],['a.jsx(TY,{open:NP,arcadeRun:!K&&!yP&&(R?.finished||R?.winner)?{gameId:Ye?"garden-bot":"pvp",runId:R.battleId,wallet:n,ready:true}:null,title:O1,','a.jsx(TY,{open:NP,title:O1,'],['a.jsx("p",{className:"gb-result-modal-summary",children:r}),arcadeRun&&a.jsx(ArcadeEndSharePrompt,{React:p,...arcadeRun}),','a.jsx("p",{className:"gb-result-modal-summary",children:r}),']];
 for(const [a,b]of edits){assert.equal(original.split(a).length,2,'Unexpected ending UI scope');original=original.replace(a,b);}
 return original;
}
