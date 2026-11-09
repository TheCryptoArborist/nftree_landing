/** Reproducible UI-only adaptation of the current shipped PvP bundle. */
export function buildPvpPreview(original, garden) {
  let result = original;
  function replaceOnce(before, after) {
    if (result.split(before).length !== 2) throw new Error("PvP patch no longer matches: " + before.slice(0, 80));
    result = result.replace(before, after);
  }
  function section(source, start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error("Missing approved UI section: " + start);
    return source.slice(a, b);
  }
  result = 'import {socialCardComponent} from "./garden-bot-social-card.js";\nimport {TREE_RANK_SOURCES as rankSourceDefinitions,formatTreeRankSource as formatRankSource} from "./garden-bot-tree-rank-sources.js";\n' + result;
  const modal = section(garden, "const PreviewSocialCard=", "const CY=")
    .replace('open:e,nftIdentity,identityStatus,onShareReady:receiveShare}', 'open:e,nftIdentity,identityStatus,onShareReady:receiveShare,mode:"PvP Battle"}');
  replaceOnce(section(original, "function TY(", "const CY="), modal);
  replaceOnce(section(original, "function $A(", "function SY("), section(garden, "function $A(", "function SY("));
  replaceOnce('function R2(e){return e==="suidex-v2"||e==="suidex-v3"||e==="moonbags-staking"}', 'function R2(e){return e==="suidex-v2"||e==="suidex-v3"||e==="tree-lock"}');
  replaceOnce('[lr,_l]=p.useState(null),', '[lr,_l]=p.useState(null),[previewBonusDetails,setPreviewBonusDetails]=p.useState(null),[forfeitConfirm,setForfeitConfirm]=p.useState(!1),');
  const escape = section(garden, 'p.useEffect(()=>{if(previewBonusDetails===null', 'const previewBattleNft=');
  replaceOnce('const sP=async()=>', escape + 'const sP=async()=>');
  replaceOnce('onClick:()=>_l(I),disabled:St||th,', 'onClick:()=>setPreviewBonusDetails(I),disabled:St||th,');
  const oldForfeit = section(original, 'a.jsx("button",{className:"gb-battle-forfeit-button"', ',eh&&a.jsx');
  const newForfeit = section(garden, 'a.jsxs("details",{className:"gb-match-options-disclosure"', ',eh&&a.jsx');
  replaceOnce(oldForfeit, newForfeit);
  const dialogs = section(garden, 'previewBonusDetails!==null&&a.jsx', 'a.jsx(sY,{isOpen:U');
  replaceOnce('a.jsx(sY,{isOpen:U', dialogs + 'a.jsx(sY,{isOpen:U');
  replaceOnce('a.jsx(Bs,{path:"/battle/pvp",children:', 'a.jsx(Bs,{path:"/battle/pvp-preview",children:a.jsx(B2,{pageMode:"pvp"})}),a.jsx(Bs,{path:"/battle/pvp",children:');
  return result;
}
