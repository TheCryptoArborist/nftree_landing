/** Preview-only social card renderer. No wallet access or transaction handling. */
export const WEBSITE = "www.tree-token.xyz";

function fitText(ctx, text, x, y, maxWidth, size, color) {
  ctx.fillStyle = color;
  do { ctx.font = `bold ${size--}px Arial, sans-serif`; }
  while (ctx.measureText(text).width > maxWidth && size > 16);
  ctx.fillText(text, x, y);
}

export function drawSocialCard(canvas, { title, score, image = null }) {
  canvas.width = canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable in this browser.");
  const bg = ctx.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#064d37"); bg.addColorStop(1, "#020d18");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = "#51ed9c"; ctx.lineWidth = 4; ctx.strokeRect(28, 28, 1024, 1024);
  fitText(ctx, "GARDEN BATTLES", 64, 102, 952, 36, "#9dfac2");
  fitText(ctx, title.toUpperCase(), 64, 195, 952, 74, "#ffffff");
  ctx.fillStyle = "#021b20"; ctx.fillRect(260, 230, 560, 560);
  if (image) {
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    if (!(w > 0 && h > 0)) throw new Error("Battle artwork has no usable dimensions.");
    const scale = Math.min(560 / w, 560 / h);
    ctx.drawImage(image, 540 - w * scale / 2, 510 - h * scale / 2, w * scale, h * scale);
  } else {
    fitText(ctx, "GARDEN BOT", 326, 485, 428, 52, "#9dfac2");
    fitText(ctx, "BATTLE RESULT", 326, 552, 428, 36, "#ffffff");
  }
  ctx.textAlign = "center";
  fitText(ctx, score, 540, 861, 952, 46, "#f5ce61");
  fitText(ctx, "BATTLE ARTWORK • GARDEN BOT", 540, 918, 952, 23, "#9dc4b7");
  ctx.fillStyle = "#052b26"; ctx.fillRect(32, 954, 1016, 94);
  fitText(ctx, WEBSITE, 540, 1014, 952, 42, "#ffffff");
  return canvas;
}

export function resolveCardArtwork(url, baseUrl) {
  if (!url) return null;
  const base = new URL(baseUrl);
  const fallback = new URL("/battle/assets/battle-trees/player-stage-4.png", base).href;
  try {
    const resolved = new URL(url, base);
    // A winning result may reveal a remote NFT in the modal. Until NFT artwork
    // is supported, use a shipped illustration on the card instead of failing.
    return resolved.origin === base.origin && resolved.pathname.startsWith("/battle/assets/")
      ? resolved.href : fallback;
  } catch { return fallback; }
}

async function loadArtwork(url) {
  if (!url) return null;
  const resolved = resolveCardArtwork(url, window.location.href);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ""; reject(new Error("Battle artwork timed out.")); }, 10000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("Battle artwork could not load.")); };
    image.src = resolved;
  });
}

export async function createSocialCard({ title, score, imageUrl }) {
  const image = await loadArtwork(imageUrl);
  const canvas = drawSocialCard(document.createElement("canvas"), { title, score, image });
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The card could not be created. Please try again.");
  return new File([blob], "garden-bot-result.png", { type: "image/png" });
}

/** Uses the React instance already shipped in the preview; adds no second runtime. */
export function socialCardComponent(React, jsx) {
  return function SocialCard({ title, score, imageUrl, message, open }) {
    const [card, setCard] = React.useState(null);
    const [error, setError] = React.useState("");
    const [status, setStatus] = React.useState("");
    React.useEffect(() => {
      let cancelled = false, url;
      setCard(null); setError(""); setStatus("");
      if (open) createSocialCard({ title, score, imageUrl }).then(file => {
        if (cancelled) return;
        url = URL.createObjectURL(file); setCard({ file, url });
      }).catch(e => { if (!cancelled) setError(e.message); });
      return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [title, score, imageUrl, open]);
    if (!open) return null;
    const share = async () => {
      try {
        if (navigator.share && navigator.canShare?.({ files: [card.file] })) {
          await navigator.share({ title: "Garden Bot result", text: message + "\n" + WEBSITE, files: [card.file] });
        } else setStatus("Image sharing is unavailable here. Save the card, then attach it in your social app.");
      } catch (e) {
        if (e.name !== "AbortError") setStatus("Sharing failed. Save the card and attach it in your social app.");
      }
    };
    return jsx.jsxs("section", { className: "gb-social-card", "aria-label": "Social result card", children: [
      jsx.jsx("h3", { children: "Your Battle Card" }),
      jsx.jsx("p", { children: "1080 × 1080 • Battle artwork" }),
      error ? jsx.jsx("p", { role: "alert", children: error }) : card
        ? jsx.jsx("img", { src: card.url, alt: `${title}. ${score}. ${WEBSITE}.`, width: 1080, height: 1080 })
        : jsx.jsx("p", { role: "status", children: "Creating your card…" }),
      card && jsx.jsxs("div", { className: "gb-social-card-actions", children: [
        jsx.jsx("a", { href: card.url, download: "garden-bot-result.png", target: "_blank", rel: "noopener", children: "Save Image" }),
        jsx.jsx("button", { type: "button", onClick: share, children: "Share Card" })
      ] }),
      jsx.jsx("p", { role: "status", children: status || "Save the image to attach it to X, Facebook, or a message." })
    ] });
  };
}
