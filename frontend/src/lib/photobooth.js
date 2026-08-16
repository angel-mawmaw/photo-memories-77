// Photobooth composition helpers
export const layoutConfig = {
  strip4: { slots: 4, name: "Four-photo strip" },
  strip3: { slots: 3, name: "Three-photo strip" },
  single: { slots: 1, name: "Single photo" },
};

export const frameColors = {
  white: "#ffffff",
  black: "#171519",
  pink: "#f49ab7",
  lightpink: "#f8d8e2",
  purple: "#b39ae8",
  blue: "#9ed6eb",
  maroon: "#73112f",
  gold: "#e7b83f",
};

export const formatSizes = {
  "2x6": (dpi) => ({ w: 2 * dpi, h: 6 * dpi }),
  "4x6": (dpi) => ({ w: 4 * dpi, h: 6 * dpi }),
  "a4": (dpi) => ({ w: Math.round(8.27 * dpi), h: Math.round(11.69 * dpi) }),
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fitCrop(ctx, img, x, y, w, h) {
  const target = w / h;
  const source = img.width / img.height;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (source > target) { sw = img.height * target; sx = (img.width - sw) / 2; }
  else { sh = img.width / target; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getFrameBackground(ctx, w, h, frame) {
  if (frame === "gradient") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f2a0bc");
    g.addColorStop(0.38, "#c5a7ec");
    g.addColorStop(0.68, "#a5d9e9");
    g.addColorStop(1, "#f5dd77");
    return g;
  }
  return frameColors[frame] || "#fff";
}

export async function renderComposition({ layout, frame, photos, stickers, text, format = "2x6", dpi = 240 }) {
  const size = (formatSizes[format] || formatSizes["2x6"])(dpi);
  const c = document.createElement("canvas");
  c.width = size.w;
  c.height = size.h;
  const ctx = c.getContext("2d");

  // background
  ctx.fillStyle = getFrameBackground(ctx, c.width, c.height, frame);
  ctx.fillRect(0, 0, c.width, c.height);

  const margin = Math.round(c.width * 0.075);
  const top = Math.round(c.height * 0.065);
  const bottom = Math.round(c.height * 0.14);
  const gap = Math.max(8, Math.round(c.width * 0.018));

  const imgs = [];
  for (const src of photos) {
    try { imgs.push(await loadImage(src)); } catch (e) { imgs.push(null); }
  }

  const usableW = c.width - margin * 2;
  const usableH = c.height - top - bottom;

  let slots = [];
  if (layout === "strip4" || layout === "strip3") {
    const count = layout === "strip4" ? 4 : 3;
    const photoH = (usableH - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      slots.push({ x: margin, y: top + i * (photoH + gap), w: usableW, h: photoH });
    }
  } else {
    // single
    slots.push({ x: margin, y: top, w: usableW, h: usableH });
  }

  const radius = Math.max(5, c.width * 0.012);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    // shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.10)";
    roundRect(ctx, s.x + 4, s.y + 5, s.w, s.h, radius);
    ctx.fill();
    ctx.restore();

    if (imgs[i]) {
      ctx.save();
      roundRect(ctx, s.x, s.y, s.w, s.h, radius);
      ctx.clip();
      fitCrop(ctx, imgs[i], s.x, s.y, s.w, s.h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.45)";
      roundRect(ctx, s.x, s.y, s.w, s.h, radius);
      ctx.fill();
      ctx.fillStyle = (frame === "maroon" || frame === "black") ? "#fff" : "#6e6065";
      ctx.font = `700 ${Math.max(12, c.width * 0.035)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`PHOTO ${i + 1}`, s.x + s.w / 2, s.y + s.h / 2);
      ctx.restore();
    }
  }

  // decorative border
  ctx.save();
  ctx.strokeStyle = frame === "maroon" ? "rgba(255,255,255,.55)" : "rgba(115,17,47,.18)";
  ctx.lineWidth = Math.max(2, c.width * 0.008);
  roundRect(ctx, margin / 2, margin / 2, c.width - margin, c.height - margin, Math.max(8, c.width * 0.025));
  ctx.stroke();
  ctx.restore();

  // stickers
  (stickers || []).forEach((st) => {
    ctx.save();
    ctx.translate(c.width * st.x, c.height * st.y);
    ctx.rotate((st.rotation * Math.PI) / 180);
    ctx.font = `${st.size * (c.width / 600)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.char, 0, 0);
    ctx.restore();
  });

  // text
  const { eventName = "", caption = "", section = "", message = "" } = text || {};
  const date = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" }).format(new Date());
  const darkFrame = frame === "maroon" || frame === "black";
  const textColor = darkFrame ? "#fff" : "#73112f";
  const secondary = darkFrame ? "rgba(255,255,255,.82)" : "#705f65";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = c.height - bottom * 0.7;

  if (eventName) {
    ctx.fillStyle = textColor;
    ctx.font = `900 ${Math.max(16, c.width * 0.032)}px Arial`;
    ctx.fillText(eventName, c.width / 2, y);
    y += Math.max(19, c.width * 0.038);
  }
  if (caption) {
    ctx.fillStyle = secondary;
    ctx.font = `700 ${Math.max(12, c.width * 0.022)}px Arial`;
    ctx.fillText(caption, c.width / 2, y);
    y += Math.max(17, c.width * 0.028);
  }
  if (section || message) {
    ctx.fillStyle = secondary;
    ctx.font = `600 ${Math.max(9, c.width * 0.017)}px Arial`;
    ctx.fillText([section, message].filter(Boolean).join("  •  "), c.width / 2, y);
    y += Math.max(15, c.width * 0.025);
  }
  ctx.fillStyle = secondary;
  ctx.font = `600 ${Math.max(8, c.width * 0.014)}px Arial`;
  ctx.fillText(date, c.width / 2, y);

  return c.toDataURL("image/png");
}


