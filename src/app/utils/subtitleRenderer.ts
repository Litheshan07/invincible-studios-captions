export class FontManager {
  static containsTamil(text: string): boolean {
    return /[\u0B80-\u0BFF]/.test(text);
  }

  static detectLanguage(text: string): string {
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

  static fallbackFont(text: string, defaultFont: string): string {
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

  // Preloads Google fonts dynamically in the browser
  static async preloadFonts() {
    if (typeof window === "undefined" || !("fonts" in document)) return;
    try {
      const fontsToLoad = [
        "700 12px 'Noto Sans Tamil'",
        "700 12px 'Noto Sans Malayalam'",
        "700 12px 'Noto Sans Devanagari'",
        "700 12px 'Noto Sans Telugu'",
        "700 12px 'Noto Sans Kannada'",
        "700 12px 'Noto Sans JP'",
        "700 12px 'Noto Sans KR'",
        "700 12px 'Noto Sans TC'",
        "700 12px 'Noto Sans Arabic'"
      ];
      await Promise.all(fontsToLoad.map(f => document.fonts.load(f)));
      await document.fonts.ready;
      console.log("[FontManager] Fonts preloaded successfully.");
    } catch (e) {
      console.warn("[FontManager] Failed to preload some fonts", e);
    }
  }
}

export interface SubtitleWord {
  word: string;
  start_time: number;
  end_time: number;
  confidence?: number;
  is_punchline?: boolean;
}

export interface DrawSubtitleOptions {
  text: string;
  words?: SubtitleWord[];
  currentTime: number;
  targetLang: string;
  selectedFont: string;
  selectedWeight: string;
  fontSize: number;
  fillType: "solid" | "gradient";
  fillColor: string;
  gradStart: string;
  gradEnd: string;
  strokeColor: string;
  strokeWidth: number;
  glowColor: string;
  glowRadius: number;
  glowOpacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  depth3d: number;
  depthColor: string;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  subX: number;
  subY: number;
  positionTarget: "individual" | "global";
  exportDebug?: boolean;
  scale?: number;
  opacity?: number;
}

interface WordLayout {
  word: string;
  width: number;
  isActive: boolean;
  isPunch: boolean;
  start_time: number;
  end_time: number;
}

interface LineLayout {
  words: WordLayout[];
  width: number;
}

export function drawSubtitle(
  canvas: HTMLCanvasElement | any,
  ctx: CanvasRenderingContext2D | any,
  options: DrawSubtitleOptions
) {
  const {
    text,
    words,
    currentTime,
    targetLang,
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

  // Save context state
  ctx.save();

  // Apply overall transparency
  ctx.globalAlpha = opacity;

  // Configure text properties
  const fontWeight = selectedWeight?.includes("Bold") ? "800" : "600";
  const fontStyle = selectedWeight?.includes("Italic") ? "italic" : "normal";

  const getFontFamily = (fontName: string, textStr: string) => {
    const fallback = FontManager.fallbackFont(textStr, fontName);
    switch (fallback) {
      case "Bebas Neue": return "'Bebas Neue', sans-serif";
      case "Montserrat": return "'Montserrat', sans-serif";
      case "Anton": return "'Anton', sans-serif";
      case "Space Grotesk": return "'Space Grotesk', sans-serif";
      case "Saira": return "'Saira', sans-serif";
      case "Poppins": return "'Poppins', sans-serif";
      case "Noto Sans Tamil": return "'Noto Sans Tamil', sans-serif";
      case "Noto Serif Tamil": return "'Noto Serif Tamil', sans-serif";
      case "Mukta Malar": return "'Mukta Malar', sans-serif";
      case "Liquid Glass": return "'Inter', sans-serif";
      default: return `'${fallback}', sans-serif`;
    }
  };

  // 1. Layout words and lines
  const wordsList = words && words.length > 0 ? words : [{ word: text, start_time: 0, end_time: 0 }];
  const lines: LineLayout[] = [];
  let currentLine: WordLayout[] = [];
  let currentLineWidth = 0;

  // Simple measure font config just to measure space
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px sans-serif`;
  const spaceWidth = ctx.measureText(" ").width;
  const maxLineWidth = canvas.width * 0.88;

  for (const w of wordsList) {
    const isWordActive = currentTime >= w.start_time && currentTime <= w.end_time;
    const isPunch = w.is_punchline || false;

    // Apply the correct font family to measure this word
    const fontFam = getFontFamily(selectedFont, w.word);
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFam}`;
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

  // 2. Transformations
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const baseY = canvas.height * 0.82 + subY - totalHeight / 2;

  const segmentCenterX = canvas.width / 2 + subX;
  const segmentCenterY = baseY + totalHeight / 2;

  ctx.translate(segmentCenterX, segmentCenterY);

  // Apply rotations
  if (rotationZ) {
    ctx.rotate((rotationZ * Math.PI) / 180);
  }
  if (scale && scale !== 1.0) {
    ctx.scale(scale, scale);
  }
  if (rotationY) {
    ctx.transform(1, 0, Math.tan((rotationY * Math.PI) / 180), 1, 0, 0); // Skew X
  }
  if (rotationX) {
    ctx.transform(1, Math.tan((rotationX * Math.PI) / 180), 0, 1, 0, 0); // Skew Y
  }

  ctx.translate(-segmentCenterX, -segmentCenterY);

  // 3. Render each line and word
  let currY = baseY + fontSize; // Align base line

  for (const line of lines) {
    let startX = (canvas.width - line.width) / 2 + subX;

    for (const wl of line.words) {
      const fontFam = getFontFamily(selectedFont, wl.word);
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFam}`;
      
      const isLiquidGlass = selectedFont === "Liquid Glass";
      
      // Determine colors
      let fontColor: string | CanvasGradient = fillColor;
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

      // Build shadow list
      const shadows: Array<{ x: number; y: number; blur: number; color: string }> = [];
      
      // 3D extrusion
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

      // Outer shadow
      const finalShadowBlur = wl.isActive ? shadowBlur + 8 : shadowBlur;
      shadows.push({
        x: shadowOffsetX,
        y: shadowOffsetY,
        blur: finalShadowBlur,
        color: isLiquidGlass ? "rgba(255, 255, 255, 0.1)" : shadowColor
      });

      // Glow
      if (glowRadius > 0) {
        const rgb = glowColor === "#ffffff" ? "255, 255, 255" : glowColor === "#a855f7" ? "168, 85, 247" : glowColor === "#f97316" ? "249, 115, 22" : "34, 211, 238";
        shadows.push({
          x: 0,
          y: 0,
          blur: glowRadius,
          color: `rgba(${rgb}, ${glowOpacity})`
        });
      }

      // A. Draw all shadows/glow/3D layers first
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

      // B. Draw stroke
      if (strokeWidthVal > 0) {
        ctx.save();
        ctx.strokeStyle = strokeColorVal;
        ctx.lineWidth = strokeWidthVal;
        ctx.lineJoin = "round";
        ctx.strokeText(wl.word, startX, currY);
        ctx.restore();
      }

      // C. Draw fill text
      ctx.fillStyle = fontColor;
      ctx.fillText(wl.word, startX, currY);

      // Move cursor
      startX += wl.width + spaceWidth;
    }

    currY += lineHeight;
  }

  ctx.restore();

  // 4. Draw debug overlay if enabled
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
    
    // Extract unicode codepoints
    const codepoints: string[] = [];
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
