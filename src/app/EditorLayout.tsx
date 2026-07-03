"use client";
import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Plus, Trash2, Split, Merge, Scissors, Magnet,
  Maximize, Minimize, ChevronLeft, ChevronRight, RotateCcw, RotateCw,
  Search, Sliders, Download, Layers, Clock, Monitor, Lock, Unlock,
  RefreshCw, AlertTriangle
} from "lucide-react";
import { drawSubtitle, FontManager } from "./utils/subtitleRenderer";


/* ─── Types ────────────────────────────────────────────────────────────── */
interface Word {
  word: string;
  start_time: number;
  end_time: number;
  confidence: number;
  is_emphasized?: boolean;
  is_punchline?: boolean;
}
interface Segment {
  id: string;
  speaker_id: string;
  start_time: number;
  end_time: number;
  text: string;
  tamil_text?: string;
  tanglish_text?: string;
  english_text?: string;
  words: Word[];
  xOffset?: number;
  yOffset?: number;
}

/* ─── useResizablePanel hook ───────────────────────────────────────────── */
function useResizablePanel(
  side: "left" | "right",
  defaultW: number,
  min: number,
  max: number,
  storageKey: string
) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (stored) return Math.min(max, Math.max(min, parseInt(stored)));
    }
    return defaultW;
  });
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const rafId = useRef<number>(0);
  const currentW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = currentW.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const delta = side === "left"
          ? ev.clientX - startX.current
          : startX.current - ev.clientX;
        const newW = Math.min(max, Math.max(min, startW.current + delta));
        currentW.current = newW;
        setWidth(newW);
      });
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem(storageKey, String(currentW.current));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [side, min, max, storageKey]);

  const onDoubleClick = useCallback(() => {
    currentW.current = defaultW;
    setWidth(defaultW);
    localStorage.setItem(storageKey, String(defaultW));
  }, [defaultW, storageKey]);

  return { width: collapsed ? 0 : width, collapsed, setCollapsed, onMouseDown, onDoubleClick };
}

/* ─── formatTime helper ────────────────────────────────────────────────── */
function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${ms}`;
}
function parseTimeStr(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  const parts = trimmed.split(":");
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const sec = parseFloat(parts[1]);
    if (isNaN(min) || isNaN(sec)) return null;
    return min * 60 + sec;
  } else if (parts.length === 3) {
    const hr = parseInt(parts[0], 10);
    const min = parseInt(parts[1], 10);
    const sec = parseFloat(parts[2]);
    if (isNaN(hr) || isNaN(min) || isNaN(sec)) return null;
    return hr * 3600 + min * 60 + sec;
  }
  return null;
}
function fmtS(s: number | null) {

  if (s === null || s < 0) return "--";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* ─── TimeInput ────────────────────────────────────────────────────────── */
function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [tempVal, setTempVal] = useState(fmt(value));
  
  useEffect(() => {
    setTempVal(fmt(value));
  }, [value]);
  
  const handleBlur = () => {
    const parsed = parseTimeStr(tempVal);
    if (parsed !== null && !isNaN(parsed)) {
      onChange(parsed);
    } else {
      setTempVal(fmt(value));
    }
  };
  
  return (
    <input
      type="text"
      value={tempVal}
      onChange={e => setTempVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => {
        if (e.key === "Enter") {
          handleBlur();
          e.currentTarget.blur();
        }
      }}
      onClick={e => e.stopPropagation()}
      className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono text-slate-300 text-center outline-none focus:border-rose-500/40 focus:bg-slate-950/80 transition"
    />
  );
}


/* ─── LiquidSlider ─────────────────────────────────────────────────────── */
function LiquidSlider({
  label, value, min, max, step = 1, unit = "", onChange
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center text-[11px] text-slate-400 font-semibold mb-1">
        <span>{label}</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-rose-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ "--value-percent": `${pct}%` } as React.CSSProperties}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer liquid-range"
      />
    </div>
  );
}

/* ─── ColorRow ─────────────────────────────────────────────────────────── */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-400 font-semibold">{label}</span>
      <div className="flex items-center space-x-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
        <span className="text-[10px] font-mono text-slate-500 uppercase">{value}</span>
      </div>
    </div>
  );
}

/* ─── SectionHeader ────────────────────────────────────────────────────── */
function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition">
      <span>{label}</span>
      <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>›</span>
    </button>
  );
}

/* ─── Main EditorLayout ────────────────────────────────────────────────── */
interface EditorLayoutProps {
  videoUrl: string;
  videoNaturalW: number;
  videoNaturalH: number;
  dewarpScaleX?: number;
  dewarpScaleY?: number;
  onVideoMeta: (w: number, h: number) => void;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  setAspectRatio: (v: "9:16" | "16:9" | "1:1" | "4:5") => void;
  isPlayerFullscreen: boolean;
  setIsPlayerFullscreen: (v: boolean) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  currentTime: number;
  setCurrentTime: (v: number) => void;
  duration: number;
  segments: Segment[];
  setSegments: (v: Segment[]) => void;
  activeSegmentId: string | null;
  setActiveSegmentId: (v: string | null) => void;
  addNewSegment: () => void;
  deleteSegment: (id: string) => void;
  splitSegment: (id: string) => void;
  mergeSegmentWithNext: (id: string) => void;
  updateSegmentText: (id: string, text: string) => void;
  timelineActiveTool: "select" | "blade";
  setTimelineActiveTool: (v: "select" | "blade") => void;
  isMagneticEnabled: boolean;
  setIsMagneticEnabled: (v: boolean) => void;
  handleTimelineCut: () => void;
  handleTimelineTrim: (d: "left" | "right") => void;
  selectedFont: string; setSelectedFont: (v: string) => void;
  selectedWeight: string; setSelectedWeight: (v: string) => void;
  fontSize: number; setFontSize: (v: number) => void;
  fillType: "solid" | "gradient"; setFillType: (v: "solid" | "gradient") => void;
  fillColor: string; setFillColor: (v: string) => void;
  gradStart: string; setGradStart: (v: string) => void;
  gradEnd: string; setGradEnd: (v: string) => void;
  strokeColor: string; setStrokeColor: (v: string) => void;
  strokeWidth: number; setStrokeWidth: (v: number) => void;
  glowColor: string; setGlowColor: (v: string) => void;
  glowRadius: number; setGlowRadius: (v: number) => void;
  glowOpacity: number; setGlowOpacity: (v: number) => void;
  shadowColor: string; setShadowColor: (v: string) => void;
  shadowBlur: number; setShadowBlur: (v: number) => void;
  shadowOffsetX: number; setShadowOffsetX: (v: number) => void;
  shadowOffsetY: number; setShadowOffsetY: (v: number) => void;
  depth3d: number; setDepth3d: (v: number) => void;
  depthColor: string; setDepthColor: (v: string) => void;
  rotationX: number; setRotationX: (v: number) => void;
  rotationY: number; setRotationY: (v: number) => void;
  rotationZ: number; setRotationZ: (v: number) => void;
  animationPreset: string; setAnimationPreset: (v: string) => void;
  subX: number; setSubX: (v: number) => void;
  subY: number; setSubY: (v: number) => void;
  positionTarget: "all" | "individual"; setPositionTarget: (v: "all" | "individual") => void;
  exportFormat: "mp4" | "mov"; setExportFormat: (v: "mp4" | "mov") => void;
  exportQuality: "720p" | "1080p" | "4k"; setExportQuality: (v: "720p" | "1080p" | "4k") => void;
  exportFps: number; setExportFps: (v: number) => void;
  exportBitrate: "1m" | "5m" | "15m"; setExportBitrate: (v: "1m" | "5m" | "15m") => void;
  exportProgress: number;
  exportTimeRemaining: number | null;
  exportRenderFps: number | null;
  exportElapsedS: number;
  isExporting: boolean;
  onExport: () => void;
  applyPreset: (name: string) => void;
  buildTextStyle: (isHighlighted: boolean, isPunch: boolean) => React.CSSProperties;
  targetLang: string; setTargetLang: (v: string) => void;
  exportDebug: boolean; setExportDebug: (v: boolean) => void;
}

export default function EditorLayout(props: EditorLayoutProps) {
  const {
    videoUrl, videoNaturalW, videoNaturalH,
    dewarpScaleX: _dewarpScaleX = 1.0, dewarpScaleY: _dewarpScaleY = 1.0, // eslint-disable-line @typescript-eslint/no-unused-vars
    onVideoMeta,
    aspectRatio, setAspectRatio, isPlayerFullscreen, setIsPlayerFullscreen,
    isPlaying, setIsPlaying, currentTime, setCurrentTime, duration,
    segments, setSegments, activeSegmentId, setActiveSegmentId,
    addNewSegment, deleteSegment, splitSegment, mergeSegmentWithNext, updateSegmentText,
    timelineActiveTool, setTimelineActiveTool, isMagneticEnabled, setIsMagneticEnabled,
    handleTimelineCut, handleTimelineTrim,
    selectedFont, setSelectedFont, selectedWeight, setSelectedWeight,
    fontSize, setFontSize, fillType, setFillType,
    fillColor, setFillColor, gradStart, setGradStart, gradEnd, setGradEnd,
    strokeColor, setStrokeColor, strokeWidth, setStrokeWidth,
    glowColor, setGlowColor, glowRadius, setGlowRadius, glowOpacity, setGlowOpacity,
    shadowColor, setShadowColor, shadowBlur, setShadowBlur,
    shadowOffsetX, setShadowOffsetX, shadowOffsetY, setShadowOffsetY,
    depth3d, setDepth3d, depthColor, setDepthColor, rotationX, setRotationX, rotationY, setRotationY, rotationZ, setRotationZ,
    animationPreset, setAnimationPreset,
    subX, setSubX, subY, setSubY, positionTarget, setPositionTarget,
    exportFormat, setExportFormat, exportQuality, setExportQuality,
    exportFps, setExportFps, exportBitrate, setExportBitrate,
    exportProgress, exportTimeRemaining, exportRenderFps, exportElapsedS,
    isExporting, onExport, applyPreset, buildTextStyle, targetLang, setTargetLang,
    exportDebug, setExportDebug
  } = props;

  const handleStartTimeChange = useCallback((segId: string, newStart: number) => {
    const updated = segments.map(s => {
      if (s.id === segId) {
        const start = Math.min(s.end_time - 0.1, Math.max(0, newStart));
        return { ...s, start_time: start };
      }
      return s;
    });
    setSegments(updated);
  }, [segments, setSegments]);

  const handleEndTimeChange = useCallback((segId: string, newEnd: number) => {
    const updated = segments.map(s => {
      if (s.id === segId) {
        const end = Math.max(s.start_time + 0.1, Math.min(duration || 9999, newEnd));
        return { ...s, end_time: end };
      }
      return s;
    });
    setSegments(updated);
  }, [segments, duration, setSegments]);

  /* ── Panel resize hooks ── */
  const left = useResizablePanel("left", 320, 250, 550, "editor-left-w");
  const right = useResizablePanel("right", 350, 300, 700, "editor-right-w");


  /* ── Caption search ── */
  const [captionSearch, setCaptionSearch] = useState("");

  // ── Unified subtitle canvas rendering hook ──
  const subtitleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Preload Noto Sans Tamil and other fonts in browser
    FontManager.preloadFonts();
  }, []);

  useEffect(() => {
    const canvas = subtitleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = videoNaturalW || 1920;
    const h = videoNaturalH || 1080;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    // Find active segment
    const activeSeg = segments.find(
      seg => currentTime >= seg.start_time && currentTime <= seg.end_time
    );

    if (!activeSeg) return;

    const ox = positionTarget === "individual" ? (activeSeg.xOffset || 0) : subX;
    const oy = positionTarget === "individual" ? (activeSeg.yOffset || 0) : subY;

    // Draw using unified text engine
    drawSubtitle(canvas, ctx, {
      text: targetLang === "tanglish" ? (activeSeg.tanglish_text || activeSeg.text) : (activeSeg.tamil_text || activeSeg.text),
      words: activeSeg.words,
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
      subX: ox,
      subY: oy,
      positionTarget: "global",
      exportDebug
    });
  }, [
    currentTime,
    segments,
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
    positionTarget,
    videoNaturalW,
    videoNaturalH,
    exportDebug
  ]);
  const filteredSegs = useMemo(() =>
    captionSearch
      ? segments.filter(s => s.text.toLowerCase().includes(captionSearch.toLowerCase()))
      : segments,
    [segments, captionSearch]
  );

  /* ── Inspector accordion open sections ── */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    presets: true, typography: true, style: true, position: false, animation: false, export: true
  });
  const toggleSection = (key: string) =>
    setOpenSections(p => ({ ...p, [key]: !p[key] }));

  /* ── rAF playhead ── */
  const rafRef = useRef<number>(0);
  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    const videoEl = document.getElementById("preview-video") as HTMLVideoElement;
    if (!videoEl) return;
    const tick = () => {
      setCurrentTime(videoEl.currentTime);
      const active = segmentsRef.current.find(s => videoEl.currentTime >= s.start_time && videoEl.currentTime <= s.end_time);
      setActiveSegmentId(active ? active.id : null);
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPlay = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick); };
    const onPause = () => cancelAnimationFrame(rafRef.current);
    const onEnded = () => { cancelAnimationFrame(rafRef.current); setIsPlaying(false); };
    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("ended", onEnded);
    return () => {
      cancelAnimationFrame(rafRef.current);
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("ended", onEnded);
    };
  }, [videoUrl]);


  /* ── Sync play/pause state to video element ── */
  useEffect(() => {
    const el = document.getElementById("preview-video") as HTMLVideoElement;
    if (!el) return;
    if (isPlaying) el.play().catch(() => setIsPlaying(false));
    else el.pause();
  }, [isPlaying]);

  /* ── Seek video when currentTime changes externally ── */
  useEffect(() => {
    const el = document.getElementById("preview-video") as HTMLVideoElement;
    if (!el || Math.abs(el.currentTime - currentTime) < 0.1) return;
    el.currentTime = currentTime;
  }, [currentTime]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["INPUT","TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 10/30 : (e.ctrlKey || e.metaKey ? 1.0 : 1/30);
        setCurrentTime(Math.max(0, currentTime - step));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 10/30 : (e.ctrlKey || e.metaKey ? 1.0 : 1/30);
        setCurrentTime(Math.min(duration, currentTime + step));
      } else if (e.code === "KeyS") {
        e.preventDefault();
        handleTimelineCut();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        if (activeSegmentId) {
          e.preventDefault();
          deleteSegment(activeSegmentId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlaying, currentTime, duration, activeSegmentId, handleTimelineCut, deleteSegment, setCurrentTime, setIsPlaying]);


  /* ── Video Player States ── */
  const [videoStatus, setVideoStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [videoErrorMsg, setVideoErrorMsg] = useState("");
  const [videoMetaInfo, setVideoMetaInfo] = useState<{ width: number; height: number; duration: number } | null>(null);

  /* ── Timeline state ── */
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineScrollX, setTimelineScrollX] = useState(0);
  const timelineScrollRef = useRef<HTMLDivElement>(null);


  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);

  useEffect(() => {
    const el = document.getElementById("preview-video") as HTMLVideoElement;
    if (!el) return;
    el.playbackRate = playbackSpeed;
    el.loop = isLoopEnabled;
  }, [playbackSpeed, isLoopEnabled, videoUrl]);


  /* ── Timeline drag & resize ── */
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    type: "left" | "right" | "move";
    startX: number;
    initialStart: number;
    initialEnd: number;
    trackWidth: number;
  } | null>(null);

  const snapTime = useCallback((time: number, excludeId: string) => {
    if (!isMagneticEnabled) return time;
    const threshold = 0.08; // 80ms snap threshold
    
    // 1. Snap to playhead
    if (Math.abs(time - currentTime) < threshold) {
      return currentTime;
    }
    
    // 2. Snap to adjacent segments
    for (const s of segments) {
      if (s.id === excludeId) continue;
      if (Math.abs(time - s.start_time) < threshold) return s.start_time;
      if (Math.abs(time - s.end_time) < threshold) return s.end_time;
    }
    
    // 3. Snap to frame boundaries (30fps grid)
    const fps = 30;
    const frameTime = Math.round(time * fps) / fps;
    if (Math.abs(time - frameTime) < 0.02) {
      return frameTime;
    }
    
    return time;
  }, [isMagneticEnabled, currentTime, segments]);

  const handlePointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    segId: string,
    type: "left" | "right" | "move"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Select the segment and seek video player to start
    setActiveSegmentId(segId);
    
    const seg = segments.find(s => s.id === segId);
    if (!seg) return;
    
    const trackElement = e.currentTarget.closest(".caption-track-container") as HTMLElement;
    if (!trackElement) return;
    const trackWidth = trackElement.scrollWidth;
    
    setActiveDrag({
      id: segId,
      type,
      startX: e.clientX,
      initialStart: seg.start_time,
      initialEnd: seg.end_time,
      trackWidth,
    });
    
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [segments, setActiveSegmentId]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDrag) return;
    e.stopPropagation();
    e.preventDefault();
    
    const deltaX = e.clientX - activeDrag.startX;
    const deltaT = deltaX * (duration / activeDrag.trackWidth);
    
    const seg = segments.find(s => s.id === activeDrag.id);
    if (!seg) return;
    
    let newStart = seg.start_time;
    let newEnd = seg.end_time;
    
    if (activeDrag.type === "left") {
      newStart = snapTime(activeDrag.initialStart + deltaT, activeDrag.id);
      if (newStart < 0) newStart = 0;
      if (newStart >= activeDrag.initialEnd - 0.1) {
        newStart = activeDrag.initialEnd - 0.1;
      }
    } else if (activeDrag.type === "right") {
      newEnd = snapTime(activeDrag.initialEnd + deltaT, activeDrag.id);
      if (newEnd > duration) newEnd = duration;
      if (newEnd <= activeDrag.initialStart + 0.1) {
        newEnd = activeDrag.initialStart + 0.1;
      }
    } else if (activeDrag.type === "move") {
      const segLen = activeDrag.initialEnd - activeDrag.initialStart;
      newStart = snapTime(activeDrag.initialStart + deltaT, activeDrag.id);
      newEnd = newStart + segLen;
      
      if (newStart < 0) {
        newStart = 0;
        newEnd = segLen;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - segLen;
      }
    }
    
    const updated = segments.map(s => {
      if (s.id === activeDrag.id) {
        const oldLen = s.end_time - s.start_time;
        const newLen = newEnd - newStart;
        const scale = newLen / (oldLen || 1.0);
        const updatedWords = s.words.map(w => {
          const wStartRel = w.start_time - s.start_time;
          const wEndRel = w.end_time - s.start_time;
          return {
            ...w,
            start_time: newStart + wStartRel * scale,
            end_time: newStart + wEndRel * scale,
          };
        });
        
        return {
          ...s,
          start_time: newStart,
          end_time: newEnd,
          words: updatedWords,
        };
      }
      return s;
    });
    
    setSegments(updated);
    if (activeDrag.type === "move" || activeDrag.type === "left") {
      setCurrentTime(newStart);
    } else {
      setCurrentTime(newEnd);
    }
  }, [activeDrag, segments, duration, snapTime, setSegments, setCurrentTime]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDrag) return;
    e.stopPropagation();
    e.preventDefault();
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    setActiveDrag(null);
  }, [activeDrag]);


  // Auto-follow playhead while playing
  useEffect(() => {
    if (!isPlaying || !duration) return;
    const pct = currentTime / duration;
    setTimelineScrollX(pct);
  }, [currentTime, isPlaying, duration]);

  // Apply scrollLeft from timelineScrollX
  useEffect(() => {
    if (!timelineScrollRef.current) return;
    const el = timelineScrollRef.current;
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollLeft = timelineScrollX * maxScroll;
  }, [timelineScrollX]);

  /* ── audioMotion-analyzer ── */
  const audioMotionRef = useRef<any>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !videoUrl) return;
    let active = true;
    const videoEl = document.getElementById("preview-video") as HTMLVideoElement;
    if (!videoEl) return;
    const initAM = () => {
      import("audiomotion-analyzer").then(mod => {
        if (!active) return;
        const AudioMotionAnalyzer = mod.default;
        const container = document.getElementById("audiomotion-container");
        if (!container || !videoEl) return;
        if (audioMotionRef.current) {
          try { audioMotionRef.current.destroy(); } catch {}
          audioMotionRef.current = null;
        }
        try {
          audioMotionRef.current = new AudioMotionAnalyzer(container, {
            source: videoEl, mode: 10, showScaleY: false, showScaleX: false,
            bgAlpha: 0, overlay: true, colorMode: "gradient",
            gradient: "prism", fillAlpha: 0.35, lineWidth: 1.5, radial: false
          });
        } catch (err) { console.warn("[audioMotion]", err); }
      });
    };
    videoEl.addEventListener("play", initAM, { once: true });
    return () => {
      active = false;
      videoEl.removeEventListener("play", initAM);
      if (audioMotionRef.current) { try { audioMotionRef.current.destroy(); } catch {} audioMotionRef.current = null; }
    };
  }, [videoUrl]);

  /* ── Draw scrolling waveform ── */
  useEffect(() => {
    const canvas = document.getElementById("scrolling-waveform") as HTMLCanvasElement;
    if (!canvas || !duration) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    
    // Draw background grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    
    // Generate pseudo-random bar heights based on duration
    const barWidth = 3;
    const gap = 1;
    const totalBars = Math.floor(w / (barWidth + gap));
    
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(52, 211, 153, 0.7)"); // green-400
    gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.5)"); // green-500
    gradient.addColorStop(1, "rgba(4, 120, 87, 0.2)"); // green-700
    
    ctx.fillStyle = gradient;
    
    let seed = 12345;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    for (let i = 0; i < totalBars; i++) {
      const scaleFactor = 0.3 + 0.7 * Math.sin((i / totalBars) * Math.PI * 4) * random();
      const barHeight = Math.max(4, h * 0.75 * scaleFactor);
      const x = i * (barWidth + gap);
      const y = (h - barHeight) / 2;
      
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    }
  }, [duration, timelineZoom, videoUrl]);


  /* ── Timeline seek click ── */
  const handleTimelineSeek = useCallback((e: React.MouseEvent) => {
    if (timelineActiveTool === "blade") { handleTimelineCut(); return; }
    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const trackW = container.scrollWidth;
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const ratio = clickX / trackW;
    const t = Math.max(0, Math.min(duration, ratio * duration));
    setCurrentTime(t);
  }, [timelineActiveTool, duration, handleTimelineCut]);

  /* ── Playhead % for timeline ── */
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trackW = `${Math.max(100, timelineZoom * 100)}%`;

  /* ── Video aspect ratio style: match the user-selected export ratio ── */
  const videoAspectStyle: React.CSSProperties = useMemo(() => {
    const AR_MAP: Record<string, [number, number]> = {
      "16:9": [16, 9],
      "9:16": [9, 16],
      "1:1": [1, 1],
      "4:5": [4, 5],
    };
    const [arW, arH] = AR_MAP[aspectRatio] ?? [16, 9];
    return {
      aspectRatio: `${arW} / ${arH}`,
      maxWidth: "100%",
      maxHeight: "100%",
      position: "relative" as const,
      flex: "0 0 auto",
    };
  }, [aspectRatio]);

  /* ── RENDER ── */
  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: `${left.collapsed ? 40 : left.width}px 1fr ${right.collapsed ? 40 : right.width}px`,
        gridTemplateRows: "1fr",
      }}
    >
      {/* ━━━━━━━━━━━━━━ LEFT PANEL — Caption Editor ━━━━━━━━━━━━━━ */}
      <div className="flex h-full overflow-hidden border-r border-white/5">
        {/* Collapsed icon strip */}
        {left.collapsed ? (
          <div className="w-10 h-full flex flex-col items-center pt-4 bg-slate-950/60">
            <button onClick={() => left.setCollapsed(false)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full bg-slate-950/50 backdrop-blur-md overflow-hidden">
            {/* Panel header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-rose-500" />
                <span>Captions</span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-bold">{segments.length}</span>
              </h3>
              <div className="flex items-center space-x-1">
                <button onClick={addNewSegment}
                  className="w-6 h-6 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 flex items-center justify-center text-rose-400 transition"
                  title="Add caption">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => left.setCollapsed(true)}
                  className="w-6 h-6 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-500 transition">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Search */}
            <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input
                  value={captionSearch}
                  onChange={e => setCaptionSearch(e.target.value)}
                  placeholder="Search captions…"
                  className="w-full bg-white/5 border border-white/8 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-rose-500/50"
                />
              </div>
            </div>
            {/* Caption cards */}
            <div className="flex-1 overflow-y-auto panel-scroll p-2 space-y-1.5">
              {filteredSegs.length === 0 && (
                <div className="text-center text-slate-600 text-xs py-8">No captions yet</div>
              )}
              {filteredSegs.map((seg, idx) => {
                const isActive = seg.id === activeSegmentId;
                const isCurrentlyPlaying = currentTime >= seg.start_time && currentTime <= seg.end_time;
                return (
                  <div
                    key={seg.id}
                    onClick={() => { setActiveSegmentId(seg.id); setCurrentTime(seg.start_time); }}
                    className={`group rounded-xl border p-2.5 cursor-pointer transition-all duration-150 ${
                      isActive
                        ? "bg-rose-500/10 border-rose-500/30"
                        : isCurrentlyPlaying
                        ? "bg-emerald-500/8 border-emerald-500/20"
                        : "bg-white/3 border-white/5 hover:border-white/12"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center space-x-1">
                        <TimeInput
                          value={seg.start_time}
                          onChange={val => handleStartTimeChange(seg.id, val)}
                        />
                        <span className="text-slate-700 text-[9px] font-mono">&rarr;</span>
                        <TimeInput
                          value={seg.end_time}
                          onChange={val => handleEndTimeChange(seg.id, val)}
                        />
                      </div>

                      <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={e => { e.stopPropagation(); splitSegment(seg.id); }}
                          className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-slate-500 hover:text-slate-300"
                          title="Split">
                          <Split className="w-3 h-3" />
                        </button>
                        {idx < segments.length - 1 && (
                          <button onClick={e => { e.stopPropagation(); mergeSegmentWithNext(seg.id); }}
                            className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-slate-500 hover:text-slate-300"
                            title="Merge with next">
                            <Merge className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteSegment(seg.id); }}
                          className="w-5 h-5 rounded flex items-center justify-center hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"
                          title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={targetLang === "tanglish" ? (seg.tanglish_text || seg.text) : seg.text}
                      onChange={e => { e.stopPropagation(); updateSegmentText(seg.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      rows={2}
                      className="w-full bg-transparent text-xs text-slate-200 resize-none outline-none leading-relaxed"
                    />
                    {isCurrentlyPlaying && (
                      <div className="mt-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${((currentTime - seg.start_time) / Math.max(0.001, seg.end_time - seg.start_time)) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Resize handle (left) */}
        {!left.collapsed && (
          <div
            onMouseDown={left.onMouseDown}
            onDoubleClick={left.onDoubleClick}
            className="w-1 cursor-ew-resize hover:bg-rose-500/40 bg-white/5 transition-colors flex-shrink-0"
            title="Double-click to reset width"
          />
        )}
      </div>

      {/* ━━━━━━━━━━━━━━ CENTER PANEL — Video + Timeline ━━━━━━━━━━━━━━ */}
      <div className="flex flex-col h-full overflow-hidden bg-slate-950/20">
        {/* Aspect ratio selector */}
        <div className="flex items-center justify-center space-x-1.5 px-4 py-1.5 border-b border-white/5 flex-shrink-0 bg-black/30">
          {(["16:9", "9:16", "1:1", "4:5"] as const).map(r => (
            <button
              key={r}
              onClick={() => setAspectRatio(r)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                aspectRatio === r ? "bg-rose-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={() => setIsPlayerFullscreen(!isPlayerFullscreen)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-slate-400 hover:text-white transition flex items-center space-x-1"
          >
            {isPlayerFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
            <span>Full</span>
          </button>
        </div>

        {/* Video workspace — fills remaining space above timeline */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-3 relative bg-slate-950/10 min-h-0">
          {isPlayerFullscreen && (
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setIsPlayerFullscreen(false)}>
              <video
                src={videoUrl}
                id="preview-video-fs"
                className="max-h-screen max-w-screen"
                crossOrigin="anonymous"
                style={{
                  objectFit: "contain",
                  width: "100%",
                  height: "100%",
                }}
              />
              <button className="absolute top-4 right-4 text-white bg-white/10 rounded-lg px-3 py-1.5 text-xs">
                Close (Esc)
              </button>
            </div>
          )}

          {/* Aspect-ratio-preserving video container */}
          <div
            className="relative bg-black rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center"
            style={videoAspectStyle}
          >
            {videoUrl ? (
              <>
                <video
                  src={videoUrl}
                  id="preview-video"
                  crossOrigin="anonymous"
                  onLoadStart={() => setVideoStatus("loading")}
                  onCanPlay={() => setVideoStatus("ready")}
                  onError={e => {
                    const v = e.currentTarget;
                    setVideoStatus("error");
                    let msg = "Failed to load video file.";
                    if (v.error) {
                      switch (v.error.code) {
                        case 1: msg = "Video loading aborted."; break;
                        case 2: msg = "Network error while loading video."; break;
                        case 3: msg = "Video decoding failed. The file may be corrupted or unsupported codec."; break;
                        case 4: msg = "Video format/codec not supported by your browser."; break;
                      }
                    }
                    setVideoErrorMsg(msg);
                  }}
                  onLoadedMetadata={e => {
                    const v = e.currentTarget;
                    onVideoMeta(v.videoWidth, v.videoHeight);
                    setVideoMetaInfo({
                      width: v.videoWidth,
                      height: v.videoHeight,
                      duration: v.duration,
                    });
                    if (v.duration > 1800) {
                      console.warn("Large video duration: " + v.duration + "s");
                    }
                  }}
                  className="w-full h-full"
                  style={{
                    objectFit: "contain",
                    display: "block",
                  }}
                />
                {videoStatus === "loading" && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center space-y-3 z-30 pointer-events-none">
                    <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
                    <span className="text-xs font-bold text-slate-300">Loading Video Pipeline...</span>
                  </div>
                )}
                {videoStatus === "error" && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
                    <AlertTriangle className="w-10 h-10 text-rose-500" />
                    <div className="text-sm font-bold text-slate-200">Playback Initialization Failed</div>
                    <div className="text-xs text-slate-400 max-w-xs">{videoErrorMsg}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Supported formats: MP4, WebM, MOV. Recommended codec: H.264 (AVC)
                    </div>
                  </div>
                )}

                {/* Subtitle overlay */}
                <canvas
                  ref={subtitleCanvasRef}
                  id="subtitle-preview-canvas"
                  className="absolute inset-0 w-full h-full pointer-events-none select-none z-20"
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-700 p-8">
                <Monitor className="w-16 h-16 mb-3" />
                <p className="text-sm">Import a video to begin</p>
              </div>
            )}
          </div>
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-center space-x-4 py-2 border-t border-white/5 bg-black/30 flex-shrink-0">
          {/* Loop toggle */}
          <button
            onClick={() => setIsLoopEnabled(!isLoopEnabled)}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${isLoopEnabled ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-white/5 text-slate-500 border border-white/5"}`}
            title="Loop Playback"
          >
            Loop
          </button>

          {/* 5s back */}
          <button onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}
            className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-slate-400 transition"
            title="Rewind 5s"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Frame back */}
          <button onClick={() => setCurrentTime(Math.max(0, currentTime - 1/30))}
            className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-slate-400 transition text-[10px] font-bold"
            title="Backward 1 Frame (Left Arrow)"
          >
            ◀ F
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-xl bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30 transition active:scale-95"
          >
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>

          {/* Frame forward */}
          <button onClick={() => setCurrentTime(Math.min(duration, currentTime + 1/30))}
            className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-slate-400 transition text-[10px] font-bold"
            title="Forward 1 Frame (Right Arrow)"
          >
            F ▶
          </button>

          {/* 5s forward */}
          <button onClick={() => setCurrentTime(Math.min(duration, currentTime + 5))}
            className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-slate-400 transition"
            title="Forward 5s"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Speed selector */}
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-300 outline-none cursor-pointer"
            title="Playback Speed"
          >
            {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
              <option key={s} value={s} className="bg-slate-950 text-slate-300">{s.toFixed(2)}x</option>
            ))}
          </select>

          <span className="text-xs font-mono text-slate-400 select-none">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <span className="text-[10px] text-slate-600 hidden sm:block">Space = Play/Pause</span>
        </div>


        {/* ── TIMELINE ── */}
        <div className="h-[220px] border-t border-white/5 bg-slate-950/80 flex flex-col flex-shrink-0">
          {/* Timeline toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-black/40 flex-shrink-0">
            <div className="flex items-center space-x-2">
              {/* Tool selector */}
              <div className="flex p-0.5 rounded-lg bg-slate-900 border border-white/5">
                <button
                  onClick={() => setTimelineActiveTool("select")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition ${timelineActiveTool === "select" ? "bg-rose-500 text-white" : "text-slate-400 hover:text-white"}`}
                >Select</button>
                <button
                  onClick={() => setTimelineActiveTool("blade")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center space-x-1 transition ${timelineActiveTool === "blade" ? "bg-rose-500 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  <Scissors className="w-3 h-3" /><span>Blade</span>
                </button>
              </div>
              {/* Magnetic toggle */}
              <button
                onClick={() => setIsMagneticEnabled(!isMagneticEnabled)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${isMagneticEnabled ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-slate-500 border border-white/5"}`}
              >
                <Magnet className="w-3 h-3" />
                <span>{isMagneticEnabled ? "Magnetic ON" : "Magnetic OFF"}</span>
              </button>
              {/* Trim buttons */}
              <button onClick={() => handleTimelineTrim("left")}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:bg-white/8 transition">Trim ◂</button>
              <button onClick={() => handleTimelineTrim("right")}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:bg-white/8 transition">▸ Trim</button>
            </div>
            {/* Zoom controls */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-slate-600">Zoom</span>
              <button onClick={() => setTimelineZoom(z => Math.max(1, z - 0.5))}
                className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 text-slate-400 flex items-center justify-center text-xs transition">−</button>
              <span className="text-[10px] font-mono text-slate-500 w-8 text-center">{timelineZoom.toFixed(1)}×</span>
              <button onClick={() => setTimelineZoom(z => Math.min(8, z + 0.5))}
                className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 text-slate-400 flex items-center justify-center text-xs transition">+</button>
            </div>
          </div>

          {/* Scrollable tracks */}
          <div ref={timelineScrollRef} className="flex-1 overflow-x-auto overflow-y-hidden panel-scroll relative">
            <div style={{ width: trackW, minWidth: "100%", height: "100%", position: "relative" }}>
              {/* Time ruler */}
              <div className="h-5 border-b border-white/5 relative bg-black/30 flex-shrink-0 overflow-hidden">
                {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                    style={{ left: `${(i / Math.max(1, duration)) * 100}%` }}>
                    <div className="w-px h-3 bg-white/10" />
                    <span className="text-[8px] text-slate-600 font-mono mt-0.5">{i}s</span>
                  </div>
                ))}
              </div>

              {/* Video track */}
              <div className="h-8 border-b border-white/5 bg-blue-950/10 relative overflow-hidden">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-blue-400/40 uppercase tracking-widest pointer-events-none">VIDEO</span>
                {videoUrl && duration > 0 && (
                  <div className="absolute top-1 bottom-1 left-0 bg-blue-500/20 border border-blue-500/30 rounded-sm mx-0.5"
                    style={{ width: "calc(100% - 4px)" }} />
                )}
              </div>

              {/* Audio waveform track */}
              <div className="h-12 border-b border-white/5 bg-emerald-950/10 relative overflow-hidden">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-emerald-400/40 uppercase tracking-widest pointer-events-none z-10">AUDIO</span>
                <div id="audiomotion-container" className="absolute inset-0 w-full h-full pointer-events-none opacity-40" />
                <canvas id="scrolling-waveform" className="absolute inset-0 w-full h-full pointer-events-none opacity-60" />
              </div>


              {/* Captions track */}
              <div
                className="h-10 border-b border-white/5 bg-rose-950/10 relative cursor-pointer caption-track-container"
                onClick={handleTimelineSeek}
              >
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-rose-400/40 uppercase tracking-widest pointer-events-none z-10">CAPTIONS</span>
                {segments.map(seg => {
                  const left = duration > 0 ? (seg.start_time / duration) * 100 : 0;
                  const width = duration > 0 ? ((seg.end_time - seg.start_time) / duration) * 100 : 0;
                  const isActive = seg.id === activeSegmentId;
                  return (
                    <div
                      key={seg.id}
                      onPointerDown={e => handlePointerDown(e, seg.id, "move")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className={`absolute top-1 bottom-1 rounded-md border cursor-grab select-none overflow-hidden transition-all duration-75 ${
                        isActive ? "bg-rose-500/30 border-rose-400/80 shadow-lg shadow-rose-500/10" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%` }}
                      title={seg.text}
                    >
                      {/* Left Resize Handle */}
                      <div
                        onPointerDown={e => handlePointerDown(e, seg.id, "left")}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-rose-400/80 active:bg-rose-400 z-30"
                      />
                      
                      {/* Subtitle text */}
                      <span className="absolute inset-x-2 inset-y-0 flex items-center px-1 text-[8px] font-semibold text-rose-200 truncate pointer-events-none z-10">
                        {seg.text}
                      </span>
                      
                      {/* Right Resize Handle */}
                      <div
                        onPointerDown={e => handlePointerDown(e, seg.id, "right")}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-rose-400/80 active:bg-rose-400 z-30"
                      />
                    </div>
                  );
                })}
              </div>


              {/* Red playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              >
                <div className="w-3 h-3 -ml-[5px] -mt-0.5 absolute top-0 rounded-sm bg-rose-500 border border-white/55 shadow-lg" />
              </div>
            </div>
          </div>

          {/* Horizontal scroll slider */}
          <div className="px-3 py-1.5 border-t border-white/5 bg-black/30 flex items-center space-x-2 flex-shrink-0">
            <span className="text-[9px] text-slate-600 font-mono w-14 text-right">{fmt(currentTime)}</span>
            <input
              type="range" min={0} max={1} step={0.001} value={timelineScrollX}
              onChange={e => setTimelineScrollX(Number(e.target.value))}
              style={{ "--value-percent": `${timelineScrollX * 100}%` } as React.CSSProperties}
              className="flex-1 timeline-hscroll"
            />
            <span className="text-[9px] text-slate-600 font-mono w-14">{fmt(duration)}</span>
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━ RIGHT PANEL — Inspector ━━━━━━━━━━━━━━ */}
      <div className="flex h-full overflow-hidden border-l border-white/5">
        {/* Resize handle (right) */}
        {!right.collapsed && (
          <div
            onMouseDown={right.onMouseDown}
            onDoubleClick={right.onDoubleClick}
            className="w-1 cursor-ew-resize hover:bg-rose-500/40 bg-white/5 transition-colors flex-shrink-0"
          />
        )}
        {right.collapsed ? (
          <div className="w-10 h-full flex flex-col items-center pt-4 bg-slate-950/60">
            <button onClick={() => right.setCollapsed(false)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full bg-slate-950/50 backdrop-blur-md overflow-hidden">
            {/* Inspector header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-rose-500" />
                <span>Inspector</span>
              </h3>
              <button onClick={() => right.setCollapsed(true)}
                className="w-6 h-6 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-500 transition">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Inspector body */}
            <div className="flex-1 overflow-y-auto panel-scroll p-3 space-y-1">

              {/* ── Style Presets ── */}
              <SectionHeader label="Style Presets" open={openSections.presets} onToggle={() => toggleSection("presets")} />
              {openSections.presets && (
                <div className="space-y-3 pb-3">
                  {/* Minimal Category */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Minimal</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["apple", "finalcut", "netflix"].map(p => (
                        <button key={p} onClick={() => applyPreset(p)}
                          className="glassy-tool-segment px-1.5 py-1 rounded-md text-[9px] font-semibold capitalize text-center truncate">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cinematic Category */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Cinematic</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["movie", "trailer", "documentary"].map(p => (
                        <button key={p} onClick={() => applyPreset(p)}
                          className="glassy-tool-segment px-1.5 py-1 rounded-md text-[9px] font-semibold capitalize text-center truncate">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gaming Category */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Gaming</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["twitch", "stream", "esports"].map(p => (
                        <button key={p} onClick={() => applyPreset(p)}
                          className="glassy-tool-segment px-1.5 py-1 rounded-md text-[9px] font-semibold capitalize text-center truncate">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Viral Category */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Viral</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["shorts", "reels", "tiktok"].map(p => (
                        <button key={p} onClick={() => applyPreset(p)}
                          className="glassy-tool-segment px-1.5 py-1 rounded-md text-[9px] font-semibold capitalize text-center truncate">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Creative / Liquid Glass Category */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Creative</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["anime", "retro", "handwritten", "luxury", "corporate", "liquidglass"].map(p => (
                        <button key={p} onClick={() => applyPreset(p)}
                          className="glassy-tool-segment px-1.5 py-1 rounded-md text-[9px] font-semibold capitalize text-center truncate">
                          {p === "liquidglass" ? "Glass" : p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}


              <div className="border-t border-white/5 pt-1" />

              {/* ── Typography ── */}
              <SectionHeader label="Typography" open={openSections.typography} onToggle={() => toggleSection("typography")} />
              {openSections.typography && (
                <div className="space-y-3 pb-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-1">Font Family</label>
                    <select value={selectedFont} onChange={e => setSelectedFont(e.target.value)}
                      className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none">
                      {["Saira","Outfit","Inter","Roboto","Poppins","Montserrat","Bebas Neue"].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold block mb-1">Weight</label>
                    <select value={selectedWeight} onChange={e => setSelectedWeight(e.target.value)}
                      className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none">
                      {["Regular","Bold","ExtraBold","ExtraBoldItalic","Black","BoldItalic"].map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <LiquidSlider label="Font Size" value={fontSize} min={12} max={120} unit="px" onChange={setFontSize} />
                </div>
              )}

              <div className="border-t border-white/5 pt-1" />

              {/* ── Text Style ── */}
              <SectionHeader label="Text Style" open={openSections.style} onToggle={() => toggleSection("style")} />
              {openSections.style && (
                <div className="space-y-3 pb-2">
                  <div className="flex p-0.5 rounded-lg bg-slate-900 border border-white/5">
                    <button onClick={() => setFillType("solid")}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition ${fillType === "solid" ? "bg-white/10 text-white" : "text-slate-500"}`}>Solid</button>
                    <button onClick={() => setFillType("gradient")}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition ${fillType === "gradient" ? "bg-white/10 text-white" : "text-slate-500"}`}>Gradient</button>
                  </div>
                  {fillType === "solid"
                    ? <ColorRow label="Fill Color" value={fillColor} onChange={setFillColor} />
                    : <>
                        <ColorRow label="Grad Start" value={gradStart} onChange={setGradStart} />
                        <ColorRow label="Grad End" value={gradEnd} onChange={setGradEnd} />
                      </>
                  }
                  <ColorRow label="Stroke Color" value={strokeColor} onChange={setStrokeColor} />
                  <LiquidSlider label="Stroke Width" value={strokeWidth} min={0} max={20} unit="px" onChange={setStrokeWidth} />
                  <ColorRow label="Glow Color" value={glowColor} onChange={setGlowColor} />
                  <LiquidSlider label="Glow Radius" value={glowRadius} min={0} max={40} unit="px" onChange={setGlowRadius} />
                  <LiquidSlider label="Glow Opacity" value={Math.round(glowOpacity * 100)} min={0} max={100} unit="%" onChange={v => setGlowOpacity(v / 100)} />
                  <ColorRow label="Shadow Color" value={shadowColor} onChange={setShadowColor} />
                  <LiquidSlider label="Shadow Blur" value={shadowBlur} min={0} max={40} unit="px" onChange={setShadowBlur} />
                  <LiquidSlider label="Shadow X" value={shadowOffsetX} min={-20} max={20} unit="px" onChange={setShadowOffsetX} />
                  <LiquidSlider label="Shadow Y" value={shadowOffsetY} min={-20} max={20} unit="px" onChange={setShadowOffsetY} />
                </div>
              )}

              <div className="border-t border-white/5 pt-1" />

              {/* ── Position ── */}
              <SectionHeader label="Position" open={openSections.position} onToggle={() => toggleSection("position")} />
              {openSections.position && (
                <div className="space-y-3 pb-2">
                  <div className="flex p-0.5 rounded-lg bg-slate-900 border border-white/5">
                    <button onClick={() => setPositionTarget("all")}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition ${positionTarget === "all" ? "bg-white/10 text-white" : "text-slate-500"}`}>All</button>
                    <button onClick={() => setPositionTarget("individual")}
                      className={`flex-1 py-1 rounded-md text-[10px] font-bold transition ${positionTarget === "individual" ? "bg-white/10 text-white" : "text-slate-500"}`}>Card</button>
                  </div>
                  {positionTarget === "all" ? (
                    <>
                      <LiquidSlider label="Horizontal" value={subX} min={-500} max={500} unit="px" onChange={setSubX} />
                      <LiquidSlider label="Vertical" value={subY} min={-400} max={400} unit="px" onChange={setSubY} />
                    </>
                  ) : activeSegmentId ? (
                    <>
                      <LiquidSlider
                        label="Card X"
                        value={segments.find(s => s.id === activeSegmentId)?.xOffset || 0}
                        min={-500} max={500} unit="px"
                        onChange={v => setSegments(segments.map(s => s.id === activeSegmentId ? { ...s, xOffset: v } : s))}
                      />
                      <LiquidSlider
                        label="Card Y"
                        value={segments.find(s => s.id === activeSegmentId)?.yOffset || 0}
                        min={-400} max={400} unit="px"
                        onChange={v => setSegments(segments.map(s => s.id === activeSegmentId ? { ...s, yOffset: v } : s))}
                      />
                    </>
                  ) : (
                    <p className="text-[10px] text-slate-600 text-center py-2">Select a caption card first</p>
                  )}
                  <LiquidSlider label="Rotate X" value={rotationX} min={-45} max={45} unit="°" onChange={setRotationX} />
                  <LiquidSlider label="Rotate Y" value={rotationY} min={-45} max={45} unit="°" onChange={setRotationY} />
                  <LiquidSlider label="Rotate Z" value={rotationZ} min={-180} max={180} unit="°" onChange={setRotationZ} />
                  <LiquidSlider label="3D Depth" value={depth3d} min={0} max={30} unit="px" onChange={setDepth3d} />
                </div>
              )}

              <div className="border-t border-white/5 pt-1" />

              {/* ── Animation ── */}
              <SectionHeader label="Animation" open={openSections.animation} onToggle={() => toggleSection("animation")} />
              {openSections.animation && (
                <div className="space-y-2 pb-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {["karaoke-pop","fade","slide-up","bounce","typewriter","none"].map(anim => (
                      <button key={anim} onClick={() => setAnimationPreset(anim)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold transition capitalize ${
                          animationPreset === anim ? "bg-rose-500/20 border border-rose-500/40 text-rose-300" : "bg-white/5 border border-white/5 text-slate-400 hover:border-white/15"
                        }`}>
                        {anim.replace(/-/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-white/5 pt-1" />

              {/* ── Export ── */}
              <SectionHeader label="Export" open={openSections.export} onToggle={() => toggleSection("export")} />
              {openSections.export && (
                <div className="space-y-3 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block mb-1">Format</label>
                      <select value={exportFormat} onChange={e => setExportFormat(e.target.value as any)}
                        className="w-full bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                        <option value="mp4">MP4</option>
                        <option value="mov">MOV</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block mb-1">Quality</label>
                      <select value={exportQuality} onChange={e => setExportQuality(e.target.value as any)}
                        className="w-full bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="4k">4K</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block mb-1">FPS</label>
                      <select value={exportFps} onChange={e => setExportFps(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                        {[24,30,60].map(f => <option key={f} value={f}>{f} fps</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block mb-1">Bitrate</label>
                      <select value={exportBitrate} onChange={e => setExportBitrate(e.target.value as any)}
                        className="w-full bg-white/5 border border-white/8 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                        <option value="1m">1 Mbps</option>
                        <option value="5m">5 Mbps</option>
                        <option value="15m">15 Mbps</option>
                      </select>
                    </div>
                  </div>

                  {/* Export Debug Mode Toggle */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/8">
                    <div>
                      <span className="text-xs font-bold text-slate-300 block">Export Debug Overlay</span>
                      <span className="text-[10px] text-slate-500">Overlay codepoints & styling metrics</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportDebug}
                        onChange={e => setExportDebug(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                    </label>
                  </div>

                  {/* Export button */}
                  {!isExporting ? (
                    <button
                      onClick={onExport}
                      disabled={!videoUrl}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-bold text-xs shadow-lg shadow-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95 flex items-center justify-center space-x-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Video with Subtitles</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {/* Progress bar */}
                      <div className="relative h-7 bg-slate-800/80 rounded-xl overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-700 rounded-xl"
                          style={{ width: `${exportProgress}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
                          {exportProgress >= 100 ? "✓ Done!" : `${exportProgress}% — Burning subtitles…`}
                        </span>
                      </div>
                      {/* Time remaining row */}
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center space-x-1 text-rose-300">
                          <Clock className="w-3 h-3" />
                          <span className="font-semibold">
                            {exportProgress >= 100
                              ? "Export complete!"
                              : exportTimeRemaining !== null && exportTimeRemaining > 0
                              ? `~${fmtS(exportTimeRemaining)} remaining`
                              : "Calculating…"}
                          </span>
                        </div>
                        {exportRenderFps && (
                          <span className="font-mono text-slate-400">{exportRenderFps} fps</span>
                        )}
                      </div>
                      {/* Elapsed time */}
                      <div className="text-[9px] text-slate-600 text-center">
                        Elapsed: {fmtS(exportElapsedS)}{exportRenderFps ? ` · ${exportRenderFps} fps render speed` : ""}
                      </div>
                      {exportProgress < 100 && (
                        <div className="text-[9px] text-slate-700 text-center">Frame-by-frame subtitle burning in progress…</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
