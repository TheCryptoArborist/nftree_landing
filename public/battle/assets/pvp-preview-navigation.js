// Leave the isolated preview through a full navigation, never the live PvP SPA.
const preview = /^\/battle\/pvp-preview\/?$/;
document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target?.closest?.("a[href]");
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || preview.test(url.pathname)) return;
  event.preventDefault(); event.stopImmediatePropagation(); location.assign(url.href);
}, true);
window.addEventListener("popstate", () => { if (!preview.test(location.pathname)) location.reload(); }, true);
