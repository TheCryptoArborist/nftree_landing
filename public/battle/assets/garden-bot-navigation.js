/** Cross the Garden Bot release boundary with a document navigation.
 * Other modes continue using their original browser bundle.
 */
export function isGardenBotPath(pathname) {
  return /^\/battle\/garden-bot(?:-preview)?\/?$/.test(pathname);
}
const loadedGardenBot = isGardenBotPath(window.location.pathname);
document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target?.closest?.("a[href]");
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const target = new URL(link.href, window.location.href);
  if (target.origin !== window.location.origin || isGardenBotPath(target.pathname) === loadedGardenBot) return;
  event.preventDefault(); event.stopImmediatePropagation();
  window.location.assign(target.href);
}, true);
window.addEventListener("popstate", () => {
  if (isGardenBotPath(window.location.pathname) !== loadedGardenBot) window.location.reload();
}, true);
