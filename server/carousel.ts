import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import Anthropic from "@anthropic-ai/sdk";

const OUTPUT_BASE = path.resolve(process.cwd(), "output/carousels");
const SLIDE_SIZE = 1080;

// Register Lato fonts — wrapped in try-catch so a missing fontconfig
// or font file doesn't crash the entire process on Railway
try {
  const fontsDir = path.resolve(process.cwd(), "fonts");
  registerFont(path.join(fontsDir, "Lato-Black.ttf"),    { family: "Lato", weight: "900" });
  registerFont(path.join(fontsDir, "Lato-Bold.ttf"),     { family: "Lato", weight: "700" });
  registerFont(path.join(fontsDir, "Lato-Semibold.ttf"), { family: "Lato", weight: "600" });
  registerFont(path.join(fontsDir, "Lato-Regular.ttf"),  { family: "Lato", weight: "400" });
  registerFont(path.join(fontsDir, "Lato-Light.ttf"),    { family: "Lato", weight: "300" });
  console.log("[carousel] Lato fonts registered from", fontsDir);
} catch (e) {
  console.warn("[carousel] Font registration failed — falling back to system fonts:", e);
}

// ─── Palette ─────────────────────────────────────────────────────────────────
// Panel colors (solid, used in bottom 1/3 strip)
const C_PANEL_DARK   = "#1A2E1F";   // very dark green — brand panel bg
const C_PANEL_MID    = "#2D4A35";   // medium dark green
const C_WHITE        = "#FFFFFF";
const C_WHITE_70     = "rgba(255,255,255,0.70)";
const C_WHITE_45     = "rgba(255,255,255,0.45)";
const C_GREEN_VIVID  = "#5DBE7A";   // bright accent green
const C_GREEN_SOFT   = "#A8D5B5";   // soft green for sub-text
const C_CREAM        = "#FFF8EE";   // warm label text

export interface CarouselResult {
  slideCount: number;
  slidePaths: string[];
  outputDir: string;
}

export interface FruitContent {
  fruitName: string;
  benefitHook: string;   // short friendly hook sentence
  benefits: string[];    // exactly 3, ≤6 words each
  chooseHook: string;
  howToChoose: string[]; // exactly 3, conversational ≤12 words
  storeHook: string;
  howToStore: string[];  // exactly 3, conversational ≤12 words
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function generateFruitContent(driveFileId: string, fileName?: string): Promise<FruitContent> {
  const client = new Anthropic();

  // Download and pass actual image to Claude for accurate fruit identification
  let imageBase64: string | null = null;
  let mediaType: "image/jpeg" | "image/png" = "image/jpeg";
  try {
    const raw = await downloadImage(
      `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w800`
    );
    imageBase64 = raw.toString("base64");
  } catch (e) {
    console.warn("Could not download image for AI, using text-only prompt");
  }

  const textPrompt = `Kamu adalah teman yang tahu banyak soal buah dan suka bercerita dengan hangat ke teman-teman di Instagram.

Lihat foto buah ini dan buat konten Instagram carousel untuk "Buah Semesta".
${fileName ? `Nama file: ${fileName}` : ""}

PENTING: Identifikasi buahnya dari foto, lalu buat konten dalam Bahasa Indonesia yang hangat dan personal seperti ngobrol dengan teman.

Balas HANYA dalam JSON berikut (tanpa markdown):
{
  "fruitName": "Nama Buah (1-2 kata, kapital, bahasa Indonesia)",
  "benefitHook": "1 kalimat pembuka hangat soal manfaat (maks 10 kata, pakai 'kamu')",
  "benefits": [
    "manfaat 1 singkat & bertenaga (maks 6 kata)",
    "manfaat 2 singkat & bertenaga (maks 6 kata)",
    "manfaat 3 singkat & bertenaga (maks 6 kata)"
  ],
  "chooseHook": "1 kalimat ajakan tips memilih, santai (maks 10 kata)",
  "howToChoose": [
    "tips pilih 1 — gaya ngobrol santai (maks 12 kata)",
    "tips pilih 2 — gaya ngobrol santai (maks 12 kata)",
    "tips pilih 3 — gaya ngobrol santai (maks 12 kata)"
  ],
  "storeHook": "1 kalimat ajakan tips menyimpan, hangat (maks 10 kata)",
  "howToStore": [
    "tips simpan 1 — gaya teman ngobrol (maks 12 kata)",
    "tips simpan 2 — gaya teman ngobrol (maks 12 kata)",
    "tips simpan 3 — gaya teman ngobrol (maks 12 kata)"
  ]
}`;

  const messages: any[] = imageBase64
    ? [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: textPrompt },
        ],
      }]
    : [{ role: "user", content: textPrompt }];

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 600,
    messages,
  });
  const raw = (res.content[0] as any).text.trim()
    .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(raw) as FruitContent;
}

/** Draw cover-fit image over entire canvas */
function drawFullBackground(ctx: CanvasRenderingContext2D, img: any, s: number) {
  const scale = Math.max(s / img.width, s / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (s - dw) / 2;
  const dy = (s - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Wrap text into lines */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draw multiline text, returns total height */
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxW: number, lineH: number,
  align: CanvasTextAlign = "left"
): number {
  const lines = wrapText(ctx, text, maxW);
  ctx.textAlign = align;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return lines.length * lineH;
}

// ─── BRAND HEADER (on top of photo — minimal, white text, NO dark overlay) ──
function drawHeader(ctx: CanvasRenderingContext2D, slideNum: number) {
  const s = SLIDE_SIZE;
  const pad = 48;

  // Very thin semi-transparent bar just behind brand text (not full-width dark bar)
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  (ctx as any).roundRect(pad - 12, 28, 260, 52, 26);
  ctx.fill();

  ctx.font = "700 26px Lato";
  ctx.fillStyle = C_WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("🌿 Buah Semesta", pad, 54);

  // Slide number pill — top right
  const label = `${slideNum} / 3`;
  ctx.font = "600 20px Lato";
  const pw = ctx.measureText(label).width + 24;
  const ph = 40;
  const px = s - pad - pw;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  (ctx as any).roundRect(px, 34, pw, ph, 20);
  ctx.fill();
  ctx.fillStyle = C_WHITE;
  ctx.textAlign = "center";
  ctx.fillText(label, px + pw / 2, 54);
}

// ─── SOLID BOTTOM PANEL (bottom 1/3 of slide) ───────────────────────────────
function drawBottomPanel(ctx: CanvasRenderingContext2D, panelY: number) {
  const s = SLIDE_SIZE;
  ctx.fillStyle = C_PANEL_DARK;
  ctx.fillRect(0, panelY, s, s - panelY);

  // Thin bright green accent line at top of panel
  ctx.fillStyle = C_GREEN_VIVID;
  ctx.fillRect(0, panelY, s, 4);
}

// ─── FOOTER TEXT inside panel ────────────────────────────────────────────────
function drawFooter(ctx: CanvasRenderingContext2D) {
  const s = SLIDE_SIZE;
  ctx.font = "400 22px Lato";
  ctx.fillStyle = C_WHITE_45;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DM kami untuk info & pemesanan  💬", s / 2, s - 34);
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 1 — Manfaat
// Top 2/3: full vivid photo  |  Bottom 1/3: dark panel with fruit name + benefit pills
// ═══════════════════════════════════════════════════════════════════════════
async function createSlide1(imageBuffer: Buffer, content: FruitContent): Promise<Buffer> {
  const s = SLIDE_SIZE;
  const canvas = createCanvas(s, s);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);

  // ── Photo — full vivid, no tint ─────────────────────────────────────
  drawFullBackground(ctx, img, s);

  // ── Tiny gradient only at very top edge (header legibility) ─────────
  const topFade = ctx.createLinearGradient(0, 0, 0, 120);
  topFade.addColorStop(0, "rgba(0,0,0,0.30)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, s, 120);

  // ── Soft transition line between photo and panel ─────────────────────
  const PANEL_Y = Math.round(s * 0.655); // panel starts at ~65% down
  const fadeH = 60;
  const fade = ctx.createLinearGradient(0, PANEL_Y - fadeH, 0, PANEL_Y);
  fade.addColorStop(0, "rgba(26,46,31,0)");
  fade.addColorStop(1, "rgba(26,46,31,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, PANEL_Y - fadeH, s, fadeH);

  drawBottomPanel(ctx, PANEL_Y);

  drawHeader(ctx, 1);
  drawFooter(ctx);

  // ── Content inside panel ─────────────────────────────────────────────
  const pad = 52;
  const panelContentTop = PANEL_Y + 22;

  // Hook line
  ctx.font = "300 27px Lato";
  ctx.fillStyle = C_GREEN_SOFT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(content.benefitHook, pad, panelContentTop + 28);

  // Fruit name — large
  const name = content.fruitName.toUpperCase();
  let nfs = 88;
  ctx.font = `900 ${nfs}px Lato`;
  while (ctx.measureText(name).width > s - pad * 2 && nfs > 48) { nfs -= 4; ctx.font = `900 ${nfs}px Lato`; }
  ctx.fillStyle = C_WHITE;
  ctx.fillText(name, pad, panelContentTop + 100);

  // Green underline
  ctx.fillStyle = C_GREEN_VIVID;
  ctx.fillRect(pad, panelContentTop + 108, 90, 4);

  // ── 3 benefit pills ──────────────────────────────────────────────────
  const pillsTop = panelContentTop + 130;
  const gap = 10;
  const pillW = Math.floor((s - pad * 2 - gap * 2) / 3);
  const pillH = s - pillsTop - 70;

  content.benefits.forEach((benefit, i) => {
    const px = pad + i * (pillW + gap);

    // Pill background
    ctx.fillStyle = i === 0 ? "rgba(93,190,122,0.22)" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    (ctx as any).roundRect(px, pillsTop, pillW, pillH, 10);
    ctx.fill();
    ctx.strokeStyle = i === 0 ? "rgba(93,190,122,0.50)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top accent bar
    ctx.fillStyle = C_GREEN_VIVID;
    ctx.fillRect(px + 12, pillsTop + 10, 28, 3);

    // Benefit text
    ctx.font = "700 30px Lato";
    ctx.fillStyle = C_WHITE;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    drawWrapped(ctx, benefit, px + 12, pillsTop + 24, pillW - 24, 36);
  });

  return canvas.toBuffer("image/jpeg", { quality: 0.93 });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Cara Memilih
// Top 2/3: vivid photo  |  Bottom 1/3: panel with 3 tips
// ═══════════════════════════════════════════════════════════════════════════
async function createSlide2(imageBuffer: Buffer, content: FruitContent): Promise<Buffer> {
  const s = SLIDE_SIZE;
  const canvas = createCanvas(s, s);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);
  drawFullBackground(ctx, img, s);

  // Top edge fade
  const topFade = ctx.createLinearGradient(0, 0, 0, 120);
  topFade.addColorStop(0, "rgba(0,0,0,0.30)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, s, 120);

  const PANEL_Y = Math.round(s * 0.655);
  const fadeH = 60;
  const fade = ctx.createLinearGradient(0, PANEL_Y - fadeH, 0, PANEL_Y);
  fade.addColorStop(0, "rgba(26,46,31,0)");
  fade.addColorStop(1, "rgba(26,46,31,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, PANEL_Y - fadeH, s, fadeH);

  drawBottomPanel(ctx, PANEL_Y);
  drawHeader(ctx, 2);
  drawFooter(ctx);

  const pad = 52;
  const panelTop = PANEL_Y + 20;
  const textW = s - pad * 2;

  // Section badge + fruit name on one row
  // Badge
  ctx.fillStyle = C_GREEN_VIVID;
  ctx.beginPath();
  (ctx as any).roundRect(pad, panelTop + 4, 190, 34, 17);
  ctx.fill();
  ctx.font = "700 18px Lato";
  ctx.fillStyle = C_PANEL_DARK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CARA MEMILIH", pad + 95, panelTop + 21);

  // Fruit name right of badge
  let nfs = 52;
  ctx.font = `900 ${nfs}px Lato`;
  while (ctx.measureText(content.fruitName.toUpperCase()).width > textW - 210 && nfs > 32) {
    nfs -= 2; ctx.font = `900 ${nfs}px Lato`;
  }
  ctx.fillStyle = C_WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(content.fruitName.toUpperCase(), pad + 206, panelTop + 30);

  // Hook
  ctx.font = "300 25px Lato";
  ctx.fillStyle = C_GREEN_SOFT;
  ctx.fillText(content.chooseHook, pad, panelTop + 66);

  // Tips row — 3 cards
  const cardTop = panelTop + 86;
  const cardGap = 10;
  const cardW = Math.floor((textW - cardGap * 2) / 3);
  const cardH = s - cardTop - 62;

  content.howToChoose.forEach((tip, i) => {
    const cx = pad + i * (cardW + cardGap);

    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    (ctx as any).roundRect(cx, cardTop, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(93,190,122,0.20)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Number
    ctx.font = "900 40px Lato";
    ctx.fillStyle = C_GREEN_VIVID;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`0${i + 1}`, cx + 12, cardTop + 46);

    // Tip
    ctx.font = "600 24px Lato";
    ctx.fillStyle = C_WHITE;
    ctx.textBaseline = "top";
    drawWrapped(ctx, tip, cx + 12, cardTop + 52, cardW - 24, 30);
  });

  return canvas.toBuffer("image/jpeg", { quality: 0.93 });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 3 — Cara Menyimpan
// Same structure as slide 2, olive/teal accent
// ═══════════════════════════════════════════════════════════════════════════
async function createSlide3(imageBuffer: Buffer, content: FruitContent): Promise<Buffer> {
  const s = SLIDE_SIZE;
  const canvas = createCanvas(s, s);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);
  drawFullBackground(ctx, img, s);

  const topFade = ctx.createLinearGradient(0, 0, 0, 120);
  topFade.addColorStop(0, "rgba(0,0,0,0.30)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, s, 120);

  const PANEL_Y = Math.round(s * 0.655);
  const fadeH = 60;
  const fade = ctx.createLinearGradient(0, PANEL_Y - fadeH, 0, PANEL_Y);
  fade.addColorStop(0, "rgba(26,46,31,0)");
  fade.addColorStop(1, "rgba(26,46,31,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, PANEL_Y - fadeH, s, fadeH);

  drawBottomPanel(ctx, PANEL_Y);
  drawHeader(ctx, 3);
  drawFooter(ctx);

  const pad = 52;
  const panelTop = PANEL_Y + 20;
  const textW = s - pad * 2;

  // Badge — olive tint
  ctx.fillStyle = "#7EC896";
  ctx.beginPath();
  (ctx as any).roundRect(pad, panelTop + 4, 218, 34, 17);
  ctx.fill();
  ctx.font = "700 18px Lato";
  ctx.fillStyle = C_PANEL_DARK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CARA MENYIMPAN", pad + 109, panelTop + 21);

  let nfs = 52;
  ctx.font = `900 ${nfs}px Lato`;
  while (ctx.measureText(content.fruitName.toUpperCase()).width > textW - 230 && nfs > 32) {
    nfs -= 2; ctx.font = `900 ${nfs}px Lato`;
  }
  ctx.fillStyle = C_WHITE;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(content.fruitName.toUpperCase(), pad + 228, panelTop + 30);

  ctx.font = "300 25px Lato";
  ctx.fillStyle = C_GREEN_SOFT;
  ctx.fillText(content.storeHook, pad, panelTop + 66);

  const cardTop = panelTop + 86;
  const cardGap = 10;
  const cardW = Math.floor((textW - cardGap * 2) / 3);
  const cardH = s - cardTop - 62;

  content.howToStore.forEach((tip, i) => {
    const cx = pad + i * (cardW + cardGap);

    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    (ctx as any).roundRect(cx, cardTop, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(126,200,150,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "900 40px Lato";
    ctx.fillStyle = "#7EC896";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`0${i + 1}`, cx + 12, cardTop + 46);

    ctx.font = "600 24px Lato";
    ctx.fillStyle = C_WHITE;
    ctx.textBaseline = "top";
    drawWrapped(ctx, tip, cx + 12, cardTop + 52, cardW - 24, 30);
  });

  return canvas.toBuffer("image/jpeg", { quality: 0.93 });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export async function generateCarousel(
  driveFileId: string,
  imageId: number,
  fileName?: string
): Promise<CarouselResult> {
  const outputDir = path.join(OUTPUT_BASE, String(imageId));
  fs.mkdirSync(outputDir, { recursive: true });

  let imageBuffer: Buffer;
  try {
    const raw = await downloadImage(
      `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2048`
    );
    imageBuffer = await sharp(raw).jpeg({ quality: 93 }).toBuffer();
  } catch (err) {
    console.error("Image download failed:", err);
    imageBuffer = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 80, g: 140, b: 80 } },
    }).jpeg().toBuffer();
  }

  let content: FruitContent;
  try {
    content = await generateFruitContent(driveFileId, fileName);
  } catch (err) {
    console.error("Content generation failed:", err);
    content = {
      fruitName: "Buah Segar",
      benefitHook: "Tahukah kamu, buah ini kaya manfaat buat kamu?",
      benefits: ["Kaya antioksidan alami", "Tingkatkan imunitas tubuh", "Sumber energi harian"],
      chooseHook: "Biar nggak salah pilih, perhatikan ini ya!",
      howToChoose: ["Pilih warna cerah dan merata", "Kulit mulus tanpa memar", "Cium aromanya, harus segar"],
      storeHook: "Simpan dengan benar biar tetap fresh!",
      howToStore: ["Simpan di kulkas 2–4°C", "Pakai wadah tertutup rapat", "Konsumsi dalam 3–5 hari"],
    };
  }

  const [buf1, buf2, buf3] = await Promise.all([
    createSlide1(imageBuffer, content),
    createSlide2(imageBuffer, content),
    createSlide3(imageBuffer, content),
  ]);

  const filenames = ["slide_1.jpg", "slide_2.jpg", "slide_3.jpg"];
  [buf1, buf2, buf3].forEach((buf, i) => {
    fs.writeFileSync(path.join(outputDir, filenames[i]), buf);
  });

  return {
    slideCount: 3,
    slidePaths: filenames.map((f) => `${imageId}/${f}`),
    outputDir,
  };
}
