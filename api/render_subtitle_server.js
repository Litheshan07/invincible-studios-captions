const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

// local font directory
const FONTS_DIR = path.join(__dirname, 'fonts');
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Font URLs mapping
const FONT_URLS = {
  "Noto Sans Tamil": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstamil/NotoSansTamil%5Bwdth,wght%5D.ttf",
  "Noto Sans Malayalam": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansmalayalam/NotoSansMalayalam%5Bwdth,wght%5D.ttf",
  "Noto Sans Devanagari": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth,wght%5D.ttf",
  "Noto Sans Telugu": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstelugu/NotoSansTelugu%5Bwdth,wght%5D.ttf",
  "Noto Sans Kannada": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskannada/NotoSansKannada%5Bwdth,wght%5D.ttf",
  "Noto Sans JP": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  "Noto Sans KR": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf",
  "Noto Sans TC": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf",
  "Noto Sans Arabic": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth,wght%5D.ttf"
};


// Track registered fonts to avoid duplicate registration warnings
const registeredFonts = new Set();

// Synchronous or asynchronous download helper
function downloadFont(fontFamily, destPath) {
  return new Promise((resolve, reject) => {
    const url = FONT_URLS[fontFamily];
    if (!url) return resolve(false);

    console.error(`[FontLoader] Downloading ${fontFamily} from ${url} ...`);
    const file = fs.createWriteStream(destPath);
    
    // Follow redirects
    const get = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          get(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.error(`[FontLoader] Downloaded ${fontFamily} successfully.`);
            resolve(true);
          });
        } else {
          fs.unlink(destPath, () => {});
          reject(new Error(`Failed to download: ${response.statusCode}`));
        }
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    get(url);
  });
}

// Check and load font
async function ensureFontRegistered(fontFamily) {
  if (registeredFonts.has(fontFamily)) return true;

  const fontFilename = fontFamily.replace(/\s+/g, '') + '.ttf';
  const localPath = path.join(FONTS_DIR, fontFilename);

  if (!fs.existsSync(localPath)) {
    if (FONT_URLS[fontFamily]) {
      try {
        await downloadFont(fontFamily, localPath);
      } catch (err) {
        console.error(`[FontLoader] Failed to download font ${fontFamily}:`, err);
        return false;
      }
    } else {
      return false; // Not a supported downloadable font
    }
  }

  // Register font file with node-canvas
  if (fs.existsSync(localPath)) {
    try {
      registerFont(localPath, { family: fontFamily, weight: 'bold' });
      registeredFonts.add(fontFamily);
      console.error(`[FontLoader] Registered font: ${fontFamily}`);
      return true;
    } catch (err) {
      console.error(`[FontLoader] Failed to register font ${fontFamily}:`, err);
      return false;
    }
  }
  return false;
}

// Duplicate the language detection & fallback logic to be fully self-contained
class FontManager {
  static containsTamil(text) {
    return /[\u0B80-\u0BFF]/.test(text);
  }

  static detectLanguage(text) {
    if (this.containsTamil(text)) return "tamil";
    if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
    if (/[\u0900-\u097F]/.test(text)) return "hindi";
    if (/[\u0C00-\u0C7F]/.test(text)) return "telugu";
    if (/[\u0C80-\u0CFF]/.test(text)) return "kannada";
    if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text)) return "japanese";
    if (/[\uAC00-\uD7AF]/.test(text)) return "korean";
    if (/[\u4E00-\u9FFF]/.test(text)) return "chinese";
    if (/[\u0600-\u06FF]/.test(text)) return "arabic";
    return "english";
  }

  static fallbackFont(text, defaultFont) {
    const lang = this.detectLanguage(text);
    switch (lang) {
      case "tamil": return "Noto Sans Tamil";
      case "malayalam": return "Noto Sans Malayalam";
      case "hindi": return "Noto Sans Devanagari";
      case "telugu": return "Noto Sans Telugu";
      case "kannada": return "Noto Sans Kannada";
      case "japanese": return "Noto Sans JP";
      case "korean": return "Noto Sans KR";
      case "chinese": return "Noto Sans TC";
      case "arabic": return "Noto Sans Arabic";
      default: return defaultFont;
    }
  }
}

// Shared HTML5 Canvas rendering algorithm implementation (adapted to Node.js / canvas package)
function drawSubtitleNode(canvas, ctx, options) {
  const {
    text,
    words,
    currentTime,
    selectedFont,
    selectedWeight,
    fontSize,
    fillType,
    fillColor,
    gradStart,
    gradEnd,
    strokeColor,
    strokeWidth,
    glowColor,
    glowRadius,
    glowOpacity,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    depth3d,
    depthColor,
    rotationX,
    rotationY,
    rotationZ,
    subX,
    subY,
    exportDebug = false,
    scale = 1.0,
    opacity = 1.0
  } = options;

  if (!text || text.trim() === "") return;

  ctx.save();
  ctx.globalAlpha = opacity;

  const fontWeight = selectedWeight?.includes("Bold") ? "800" : "600";
  const fontStyle = selectedWeight?.includes("Italic") ? "italic" : "normal";

  const getFontFamily = (fontName, textStr) => {
    const fallback = FontManager.fallbackFont(textStr, fontName);
    const isWin = process.platform === 'win32';
    switch (fallback) {
      case "Bebas Neue": return "Bebas Neue";
      case "Montserrat": return "Montserrat";
      case "Anton": return "Anton";
      case "Space Grotesk": return "Space Grotesk";
      case "Saira": return "Saira";
      case "Poppins": return "Poppins";
      case "Noto Sans Tamil": return isWin ? "Nirmala UI" : "Noto Sans Tamil";
      case "Noto Serif Tamil": return isWin ? "Nirmala UI" : "Noto Serif Tamil";
      case "Mukta Malar": return isWin ? "Nirmala UI" : "Mukta Malar";
      case "Liquid Glass": return "Inter";
      case "Noto Sans Malayalam": return isWin ? "Nirmala UI" : "Noto Sans Malayalam";
      case "Noto Sans Devanagari": return isWin ? "Nirmala UI" : "Noto Sans Devanagari";
      case "Noto Sans Telugu": return isWin ? "Nirmala UI" : "Noto Sans Telugu";
      case "Noto Sans Kannada": return isWin ? "Nirmala UI" : "Noto Sans Kannada";
      case "Noto Sans JP": return isWin ? "Yu Gothic" : "Noto Sans JP";
      case "Noto Sans KR": return isWin ? "Malgun Gothic" : "Noto Sans KR";
      case "Noto Sans TC": return isWin ? "Microsoft JhengHei" : "Noto Sans TC";
      case "Noto Sans Arabic": return isWin ? "Segoe UI" : "Noto Sans Arabic";
      default: return fallback;
    }
  };

  const wordsList = words && words.length > 0 ? words : [{ word: text, start_time: 0, end_time: 0 }];
  const lines = [];
  let currentLine = [];
  let currentLineWidth = 0;

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px sans-serif`;
  const spaceWidth = ctx.measureText(" ").width;
  const maxLineWidth = canvas.width * 0.88;

  for (const w of wordsList) {
    const isWordActive = currentTime >= w.start_time && currentTime <= w.end_time;
    const isPunch = w.is_punchline || false;

    const fontFam = getFontFamily(selectedFont, w.word);
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFam}"`;
    const wWidth = ctx.measureText(w.word).width;

    const neededWidth = currentLineWidth === 0 ? wWidth : wWidth + spaceWidth;

    if (currentLineWidth > 0 && currentLineWidth + neededWidth > maxLineWidth) {
      lines.push({ words: currentLine, width: currentLineWidth });
      currentLine = [{ word: w.word, width: wWidth, isActive: isWordActive, isPunch, start_time: w.start_time, end_time: w.end_time }];
      currentLineWidth = wWidth;
    } else {
      currentLine.push({ word: w.word, width: wWidth, isActive: isWordActive, isPunch, start_time: w.start_time, end_time: w.end_time });
      currentLineWidth += neededWidth;
    }
  }
  if (currentLine.length > 0) {
    lines.push({ words: currentLine, width: currentLineWidth });
  }

  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const baseY = canvas.height * 0.82 + subY - totalHeight / 2;

  const segmentCenterX = canvas.width / 2 + subX;
  const segmentCenterY = baseY + totalHeight / 2;

  ctx.translate(segmentCenterX, segmentCenterY);

  if (rotationZ) {
    ctx.rotate((rotationZ * Math.PI) / 180);
  }
  if (scale && scale !== 1.0) {
    ctx.scale(scale, scale);
  }
  if (rotationY) {
    ctx.transform(1, 0, Math.tan((rotationY * Math.PI) / 180), 1, 0, 0);
  }
  if (rotationX) {
    ctx.transform(1, Math.tan((rotationX * Math.PI) / 180), 0, 1, 0, 0);
  }

  ctx.translate(-segmentCenterX, -segmentCenterY);

  let currY = baseY + fontSize;

  for (const line of lines) {
    let startX = (canvas.width - line.width) / 2 + subX;

    for (const wl of line.words) {
      const fontFam = getFontFamily(selectedFont, wl.word);
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFam}"`;
      
      const isLiquidGlass = selectedFont === "Liquid Glass";
      
      let fontColor = fillColor;
      if (isLiquidGlass) {
        fontColor = wl.isActive ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.2)";
      } else {
        if (wl.isActive) {
          if (fillType === "gradient") {
            const grad = ctx.createLinearGradient(startX, currY - fontSize, startX, currY);
            grad.addColorStop(0, gradStart || fillColor);
            grad.addColorStop(1, gradEnd || fillColor);
            fontColor = grad;
          } else {
            fontColor = gradStart || fillColor;
          }
        } else if (wl.isPunch) {
          fontColor = "#22d3ee";
        } else {
          fontColor = fillColor;
        }
      }

      const strokeColorVal = isLiquidGlass ? "rgba(255, 255, 255, 0.65)" : strokeColor;
      const strokeWidthVal = strokeWidth;

      const shadows = [];
      if (depth3d > 0) {
        for (let i = 1; i <= depth3d; i++) {
          shadows.push({
            x: 0,
            y: i,
            blur: 0,
            color: isLiquidGlass ? "rgba(255, 255, 255, 0.15)" : depthColor
          });
        }
      }

      const finalShadowBlur = wl.isActive ? shadowBlur + 8 : shadowBlur;
      shadows.push({
        x: shadowOffsetX,
        y: shadowOffsetY,
        blur: finalShadowBlur,
        color: isLiquidGlass ? "rgba(255, 255, 255, 0.1)" : shadowColor
      });

      if (glowRadius > 0) {
        const rgb = glowColor === "#ffffff" ? "255, 255, 255" : glowColor === "#a855f7" ? "168, 85, 247" : glowColor === "#f97316" ? "249, 115, 22" : "34, 211, 238";
        shadows.push({
          x: 0,
          y: 0,
          blur: glowRadius,
          color: `rgba(${rgb}, ${glowOpacity})`
        });
      }

      for (const s of shadows) {
        ctx.save();
        ctx.shadowColor = s.color;
        ctx.shadowBlur = s.blur;
        ctx.shadowOffsetX = s.x;
        ctx.shadowOffsetY = s.y;
        ctx.fillStyle = isLiquidGlass ? "transparent" : fontColor;
        ctx.fillText(wl.word, startX, currY);
        ctx.restore();
      }

      if (strokeWidthVal > 0) {
        ctx.save();
        ctx.strokeStyle = strokeColorVal;
        ctx.lineWidth = strokeWidthVal;
        ctx.lineJoin = "round";
        ctx.strokeText(wl.word, startX, currY);
        ctx.restore();
      }

      ctx.fillStyle = fontColor;
      ctx.fillText(wl.word, startX, currY);

      startX += wl.width + spaceWidth;
    }

    currY += lineHeight;
  }

  ctx.restore();

  if (exportDebug) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(15, 15, 340, 230);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, 340, 230);

    ctx.fillStyle = "#22d3ee";
    ctx.font = "bold 12px monospace, Nirmala UI";
    ctx.fillText("=== STUDIO ULTIMATE CAPTION DEBUG ===", 30, 35);

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px monospace, Nirmala UI";

    const detectLang = FontManager.detectLanguage(text);
    const usedFont = FontManager.fallbackFont(text, selectedFont);
    
    const codepoints = [];
    for (let i = 0; i < Math.min(text.length, 12); i++) {
      const code = text.codePointAt(i);
      if (code) codepoints.push(`U+${code.toString(16).toUpperCase()}`);
    }
    if (text.length > 12) codepoints.push("...");

    const debugLines = [
      `Font requested : ${selectedFont}`,
      `Font fallback  : ${usedFont}`,
      `Detected lang  : ${detectLang.toUpperCase()}`,
      `Unicode pts    : ${codepoints.join(" ")}`,
      `Gradient status: ${fillType === "gradient" ? "Enabled" : "Disabled"}`,
      `Stroke status  : ${strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : "Disabled"}`,
      `Glow status    : ${glowRadius > 0 ? `${glowRadius}px ${glowColor}` : "Disabled"}`,
      `Shadow status  : ${shadowBlur > 0 ? `Blur ${shadowBlur}px (${shadowOffsetX},${shadowOffsetY})` : "Disabled"}`,
      `3D Extrusion   : ${depth3d > 0 ? `${depth3d}px color:${depthColor}` : "Disabled"}`,
      `Active text    : "${text.substring(0, 28)}${text.length > 28 ? "..." : ""}"`
    ];

    let dy = 55;
    for (const dl of debugLines) {
      ctx.fillText(dl, 30, dy);
      dy += 17;
    }

    ctx.restore();
  }
}

// CLI persistent stdin loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let canvas = null;
let ctx = null;

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const cmd = JSON.parse(line);
    
    // Setup canvas size
    const width = cmd.width || 1920;
    const height = cmd.height || 1080;
    
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = createCanvas(width, height);
      ctx = canvas.getContext('2d');
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    // Preload font if needed
    const usedFont = FontManager.fallbackFont(cmd.text || "", cmd.selectedFont || "Inter");
    if (FONT_URLS[usedFont]) {
      await ensureFontRegistered(usedFont);
    }

    // Render subtitle
    drawSubtitleNode(canvas, ctx, cmd);

    // Get raw RGBA buffer and output size info
    const imgData = ctx.getImageData(0, 0, width, height);
    const rgbaBuffer = Buffer.from(imgData.data.buffer);

    // Write size descriptor first to prevent framing issues: 4 bytes (uint32) length, then raw buffer
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(rgbaBuffer.length, 0);

    process.stdout.write(lengthBuf);
    process.stdout.write(rgbaBuffer);
  } catch (err) {
    console.error('[NodeRenderServer Error]', err);
    // Write an empty response (length 0) on failure
    const emptyBuf = Buffer.alloc(4);
    emptyBuf.writeUInt32BE(0, 0);
    process.stdout.write(emptyBuf);
  }
});

console.error('[NodeRenderServer] Ready to receive render commands.');
