"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, Play, Pause, Trash2, ArrowRight, Sparkles, Languages, Sliders, CheckCircle2,
  Clock, Download, RefreshCw, Layers, Monitor, RotateCcw, Lock, Unlock, Split, Merge, AlertTriangle, Eye, ShieldCheck, ShieldAlert, Plus, Save,
  Scissors, Maximize, Minimize, Magnet
} from "lucide-react";
import confetti from "canvas-confetti";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import EditorLayout from "./EditorLayout";
import { useUndoHistory } from "./hooks/useUndoHistory";
import { drawSubtitle } from "./utils/subtitleRenderer";


// ─────────────────────────────────────────────
// Tamil → Tanglish phonetic dictionary & transliteration helpers
// ─────────────────────────────────────────────
const TANGLISH_MAP: Record<string, string> = {
  "வணக்கம்": "vanakkam", "நன்றி": "nandri", "சாப்டீங்களா": "sapteengala",
  "சூப்பர்": "super", "நண்பா": "nanba", "இல்லை": "illa", "ஆமாம்": "ama",
  "செம்ம": "semma", "வீடியோ": "video", "பார்க்கப்போறோம்": "parkapoorom",
  "இன்னைக்கு": "innaiku", "நம்ம": "namma", "ஒரு": "oru", "எல்லாரும்": "ellarum",
  "டாபிக்": "topic", "கேப்ஷன்ஸ்": "captions", "ஆமா": "aama", "இல்ல": "illa",
  "என்ன": "enna", "பண்றீங்க": "panreenga", "எப்படி": "epdi",
  "இருக்கீங்க": "irukeenga", "இருக்கேன்": "irukken", "சரி": "sari",
  "வா": "vaa", "போ": "po", "பார்": "paar", "சொல்லு": "sollu",
  "கேளு": "kaelu", "தெரியும்": "theriyum", "தெரியாது": "theriyaathu",
  "மக்கள்": "makkal", "நாடு": "naadu", "ஊர்": "ur",
  "வீடு": "veedu", "அம்மா": "amma", "அப்பா": "appa",
};

function transliterateTamil(text: string): string {
  return text.split(" ").map(w => {
    const match = w.match(/^([\w\u0B80-\u0BFF]+)([.,!?"']*)$/);
    if (match) {
      const core = match[1];
      const punct = match[2];
      return (TANGLISH_MAP[core] ?? core) + punct;
    }
    return w;
  }).join(" ");
}

async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!text.trim() || sourceLang === targetLang) return text;
  try {
    const params = new URLSearchParams({
      client: "gtx",
      sl: sourceLang,
      tl: targetLang,
      dt: "t",
      q: text,
    });
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const parts: string[] = [];
      for (const chunk of data[0]) {
        if (chunk && chunk[0]) parts.push(chunk[0]);
      }
      const result = parts.join(" ").trim();
      if (result) return result;
    }
  } catch {
    // fallback to original
  }
  return text;
}

const LANG_MAP: Record<string, string> = {
  tamil: "ta", ta: "ta",
  hindi: "hi", hi: "hi",
  telugu: "te", te: "te",
  kannada: "kn", kn: "kn",
  malayalam: "ml", ml: "ml",
  bengali: "bn", bn: "bn",
  marathi: "mr", mr: "mr",
  gujarati: "gu", gu: "gu",
  punjabi: "pa", pa: "pa",
  urdu: "ur", ur: "ur",
  english: "en", en: "en",
};

// Interfaces
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

export default function Home() {
  const [view, setView] = useState<"landing" | "login" | "editor">("landing");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  // Auth Form State
  const [authMethod, setAuthMethod] = useState<"google" | "email">("email"); // Default to email/phone credentials
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [secondName, setSecondName] = useState<string>("");
  const [dob, setDob] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [otpIdentifier, setOtpIdentifier] = useState<string>("");
  const [otp, setOtp] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string>("");
  const [sandboxCodeDisplay, setSandboxCodeDisplay] = useState<string>("");
  
  // Subtitle positioning offsets
  const [subX, setSubX] = useState<number>(0);
  const [subY, setSubY] = useState<number>(0);
  const [positionTarget, setPositionTarget] = useState<"all" | "individual">("all");

  // Timeline Pro Tools
  const [isMagneticEnabled, setIsMagneticEnabled] = useState<boolean>(true);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState<boolean>(false);
  const [timelineActiveTool, setTimelineActiveTool] = useState<"select" | "blade">("select");

  // Pending actions prior to authentication
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingResumeProject, setPendingResumeProject] = useState<any | null>(null);

  // Google OAuth credentials & user profiles
  const [googleClientId, setGoogleClientId] = useState<string>("");
  const [userProfile, setUserProfile] = useState<any>(null);

  // Saved Progress projects database
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  
  // Calls the Render backend DIRECTLY from the browser â€” skips Vercel serverless entirely
  // Set NEXT_PUBLIC_RENDER_URL=https://your-app.onrender.com in Vercel env vars
  const getApiHost = () => {
    if (typeof window !== "undefined") {
      return process.env.NEXT_PUBLIC_RENDER_URL || process.env.NEXT_PUBLIC_API_URL || "";
    }
    return process.env.NEXT_PUBLIC_RENDER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  };
  const apiHost = getApiHost();

  
  // App Global State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [wordsPerSegment, setWordsPerSegment] = useState<number>(2);
  const [trainingConsent, setTrainingConsent] = useState<boolean>(true);
  const [targetLang, setTargetLang] = useState<string>("tanglish");
  // spokenLanguage = the actual audio language sent to ElevenLabs STT
  // "ta" = Tamil, "en" = English, "auto" = auto-detect
  const [spokenLanguage, setSpokenLanguage] = useState<string>("auto");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:5">("9:16");
  
  // Cookie states
  const [cookieConsent, setCookieConsent] = useState<"accepted" | "declined" | "custom" | null>(null);
  const [cookieSettings, setCookieSettings] = useState({ necessary: true, analytics: true, marketing: false });
  const [showCookieOptions, setShowCookieOptions] = useState<boolean>(false);
  
  // Google Minimal OAuth modal
  const [showGoogleOAuth, setShowGoogleOAuth] = useState<boolean>(false);

  // Project State
  const [projectId, setProjectId] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [duration, setDuration] = useState<number>(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const { pushState, undo, redo, resetHistory, canUndo, canRedo } = useUndoHistory(segments);

  const updateSegments = (newSegments: Segment[], shouldPush = true) => {
    setSegments(newSegments);
    if (shouldPush) {
      pushState(newSegments);
    }
  };

  // Keyboard undo/redo shortcuts
  useEffect(() => {
    const handleUndoRedoShortcuts = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        const prevState = undo();
        if (prevState) {
          setSegments(prevState);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        const nextState = redo();
        if (nextState) {
          setSegments(nextState);
        }
      }
    };
    window.addEventListener("keydown", handleUndoRedoShortcuts);
    return () => window.removeEventListener("keydown", handleUndoRedoShortcuts);
  }, [undo, redo]);

  
  // Expiration State
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<string>("24h 00m");
  
  // Style Inspector State
  const [selectedFont, setSelectedFont] = useState<string>("Saira");
  const [selectedWeight, setSelectedWeight] = useState<string>("ExtraBoldItalic");
  const [fontSize, setFontSize] = useState<number>(44);
  const [fillType, setFillType] = useState<"solid" | "gradient">("gradient");
  const [fillColor, setFillColor] = useState<string>("#ffffff");
  const [gradStart, setGradStart] = useState<string>("#facc15"); // yellow-400
  const [gradEnd, setGradEnd] = useState<string>("#f97316"); // orange-500
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [glowColor, setGlowColor] = useState<string>("#a855f7"); // purple
  const [glowRadius, setGlowRadius] = useState<number>(8);
  const [glowOpacity, setGlowOpacity] = useState<number>(0.6);
  const [shadowColor, setShadowColor] = useState<string>("#000000");
  const [shadowBlur, setShadowBlur] = useState<number>(10);
  const [shadowOffsetX, setShadowOffsetX] = useState<number>(4);
  const [shadowOffsetY, setShadowOffsetY] = useState<number>(4);
  
  // 3D Text Parameters
  const [depth3d, setDepth3d] = useState<number>(5); // Extrusion depth
  const [depthColor, setDepthColor] = useState<string>("#854d0e"); // dark olive/yellow
  const [rotationX, setRotationX] = useState<number>(-10); // 3D tilt X
  const [rotationY, setRotationY] = useState<number>(15);  // 3D tilt Y
  const [rotationZ, setRotationZ] = useState<number>(0);   // 3D tilt Z
  const [animationPreset, setAnimationPreset] = useState<string>("karaoke-pop");
  
  // Modals / Dialogs
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<"mp4" | "mov">("mp4");
  
  // Detailed export settings
  const [exportQuality, setExportQuality] = useState<"720p" | "1080p" | "4k">("1080p");
  const [exportFps, setExportFps] = useState<number>(30);
  const [exportBitrate, setExportBitrate] = useState<"1m" | "5m" | "15m">("5m");
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportTimeRemaining, setExportTimeRemaining] = useState<number | null>(null);
  const [exportRenderFps, setExportRenderFps] = useState<number | null>(null);
  const [exportElapsedS, setExportElapsedS] = useState<number>(0);
  const [exportDebug, setExportDebug] = useState<boolean>(false);
  // Natural video dimensions (to preserve aspect ratio in player)
  const [videoNaturalW, setVideoNaturalW] = useState<number>(16);
  const [videoNaturalH, setVideoNaturalH] = useState<number>(9);

  const [dewarpScaleX, setDewarpScaleX] = useState<number>(1.0);
  const [dewarpScaleY, setDewarpScaleY] = useState<number>(1.0);

  // Refs
  const audioIntervalRef = useRef<any>(null);
  const audioMotionRef = useRef<any>(null);
  const pollIntervalRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);
  // Export-specific refs (canvas MediaRecorder export)
  const exportVideoRef = useRef<HTMLVideoElement | null>(null);
  const exportAbortRef = useRef<boolean>(false);

  const abortExport = () => {
    // Signal the client-side MediaRecorder loop to stop
    exportAbortRef.current = true;
    
    // Clean up DOM video element if aborted
    if (exportVideoRef.current && exportVideoRef.current.parentNode) {
      exportVideoRef.current.parentNode.removeChild(exportVideoRef.current);
    }
    
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsExporting(false);
    setExportProgress(0);
    setExportTimeRemaining(null);
    setExportRenderFps(null);
    setShowExportModal(false);
  };

  
  // Load cookie consent status from local storage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cookieConsent");
      if (stored) {
        setCookieConsent(stored as any);
      }
    }
  }, []);

  // Auth view protection guard: enforce login view before allowing editor access
  useEffect(() => {
    if (!isAuthenticated && view === "editor") {
      setView("login");
    }
  }, [isAuthenticated, view]);

  const handleGoogleCredentialResponse = async (response: any) => {
    try {
      const base64Url = response.credential.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      
      const payload = JSON.parse(jsonPayload);
      
      // Save Google account data to local database
      try {
        const dbRes = await fetch(`${apiHost}/api/v1/auth/google-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: payload.email,
            first_name: payload.given_name || payload.name.split(" ")[0],
            second_name: payload.family_name || payload.name.split(" ")[1] || null,
            picture: payload.picture
          })
        });
        
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          console.log("Google profile collected and saved to DB:", dbData);
        }
      } catch (dbErr) {
        console.error("Failed to save Google profile to DB:", dbErr);
      }
      
      completeLoginFlow({
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      });
    } catch (e) {
      console.error("Google ID Token decode failed", e);
    }
  };

  // Dynamically load Google GSI client SDK
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    
    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {}
    };
  }, []);

  // Initialize and Render native Google button
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).google && googleClientId) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        (window as any).google.accounts.id.renderButton(
          document.getElementById("google-signin-btn-div"),
          { theme: "outline", size: "large", width: "100%" }
        );
      } catch (e) {
        console.warn("GSI Button initialization failed: ", e);
      }
    }
  }, [googleClientId, view, authMethod]);

  // Keep a stable ref of savedProjects to prevent infinite useEffect loops
  const savedProjectsRef = useRef<any[]>([]);
  useEffect(() => {
    savedProjectsRef.current = savedProjects;
  }, [savedProjects]);

  // Load Saved Progress database from local storage on user shift
  useEffect(() => {
    if (typeof window !== "undefined") {
      const emailKey = userProfile?.email || "sandbox_user";
      const stored = localStorage.getItem(`saved_progress_${emailKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (JSON.stringify(parsed) !== JSON.stringify(savedProjectsRef.current)) {
          setSavedProjects(parsed);
        }
      }
    }
  }, [userProfile]);

  // Automatically save project progress to localStorage on any segment modification
  useEffect(() => {
    if (typeof window !== "undefined" && projectId && segments.length > 0) {
      const emailKey = userProfile?.email || "sandbox_user";
      const projectItem = {
        id: projectId,
        title: projectTitle,
        duration: duration,
        segments: segments,
        dewarp_scale_x: dewarpScaleX,
        dewarp_scale_y: dewarpScaleY,
        expires_at: expiresAt,
        last_updated: new Date().toISOString()
      };
      
      const stored = localStorage.getItem(`saved_progress_${emailKey}`);
      let list = stored ? JSON.parse(stored) : [];
      list = list.filter((p: any) => p.id !== projectId);
      list.unshift(projectItem);
      list = list.slice(0, 6);
      
      localStorage.setItem(`saved_progress_${emailKey}`, JSON.stringify(list));
      
      // Prevent render loop by comparing contents except last_updated
      const currentSaved = savedProjectsRef.current.find((p: any) => p.id === projectId);
      const hasChanged = !currentSaved || 
        JSON.stringify(currentSaved.segments) !== JSON.stringify(segments) ||
        currentSaved.title !== projectTitle ||
        currentSaved.dewarp_scale_x !== dewarpScaleX ||
        currentSaved.dewarp_scale_y !== dewarpScaleY;
      
      if (hasChanged) {
        setSavedProjects(list);
      }
    }
  }, [segments, projectId, dewarpScaleX, dewarpScaleY]);



  // Timer calculation for 24 hours expiry
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const target = new Date(expiresAt).getTime();
      const now = new Date().getTime();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Expired");
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Apply visual style presets
  const applyPreset = (presetName: string) => {
    // â”€â”€ MINIMAL PRESETS â”€â”€
    if (presetName === "apple") {
      setSelectedFont("Inter");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#ffffff");
      setStrokeWidth(0);
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("fade");
    } else if (presetName === "finalcut") {
      setSelectedFont("Outfit");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#fbbf24"); // yellow-400
      setStrokeWidth(3.5);
      setStrokeColor("#000000");
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("none");
    } else if (presetName === "netflix") {
      setSelectedFont("Inter");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#ffffff");
      setStrokeWidth(1);
      setStrokeColor("#18181b");
      setGlowRadius(0);
      setDepth3d(0);
      setShadowColor("rgba(0, 0, 0, 0.85)");
      setShadowBlur(8);
      setShadowOffsetX(2);
      setShadowOffsetY(3);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("none");
    }
    // â”€â”€ CINEMATIC PRESETS â”€â”€
    else if (presetName === "movie") {
      setSelectedFont("Poppins");
      setSelectedWeight("Regular");
      setFillType("solid");
      setFillColor("#f1f5f9");
      setStrokeWidth(1.5);
      setStrokeColor("#0f172a");
      setGlowRadius(0);
      setDepth3d(0);
      setShadowColor("#000000");
      setShadowBlur(4);
      setShadowOffsetX(1);
      setShadowOffsetY(2);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("fade");
    } else if (presetName === "trailer") {
      setSelectedFont("Montserrat");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#ffffff");
      setStrokeWidth(3);
      setStrokeColor("#000000");
      setGlowRadius(8);
      setGlowColor("#ffffff");
      setGlowOpacity(0.3);
      setDepth3d(2);
      setDepthColor("#1e293b");
      setRotationX(-5);
      setRotationY(5);
      setRotationZ(0);
      setAnimationPreset("slide-up");
    } else if (presetName === "documentary") {
      setSelectedFont("Poppins");
      setSelectedWeight("Regular");
      setFillType("solid");
      setFillColor("#e2e8f0");
      setStrokeWidth(0);
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("fade");
    }
    // â”€â”€ GAMING PRESETS â”€â”€
    else if (presetName === "twitch") {
      setSelectedFont("Space Grotesk");
      setSelectedWeight("Bold");
      setFillType("gradient");
      setGradStart("#a855f7"); // purple-500
      setGradEnd("#d946ef"); // fuchsia-500
      setStrokeWidth(4);
      setStrokeColor("#090514");
      setGlowRadius(15);
      setGlowColor("#a855f7");
      setGlowOpacity(0.8);
      setDepth3d(5);
      setDepthColor("#4c1d95");
      setRotationX(-10);
      setRotationY(10);
      setRotationZ(2);
      setAnimationPreset("shake-active");
    } else if (presetName === "stream") {
      setSelectedFont("Bebas Neue");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#22c55e"); // green-500
      setStrokeWidth(5);
      setStrokeColor("#000000");
      setGlowRadius(8);
      setGlowColor("#22c55e");
      setGlowOpacity(0.5);
      setDepth3d(3);
      setDepthColor("#14532d");
      setRotationX(-8);
      setRotationY(-8);
      setRotationZ(-2);
      setAnimationPreset("zoom-bounce");
    } else if (presetName === "esports") {
      setSelectedFont("Anton");
      setSelectedWeight("Regular");
      setFillType("gradient");
      setGradStart("#06b6d4"); // cyan-500
      setGradEnd("#3b82f6"); // blue-500
      setStrokeWidth(5);
      setStrokeColor("#030712");
      setGlowRadius(10);
      setGlowColor("#06b6d4");
      setGlowOpacity(0.6);
      setDepth3d(6);
      setDepthColor("#1e3a8a");
      setRotationX(-12);
      setRotationY(12);
      setRotationZ(0);
      setAnimationPreset("bounce");
    }
    // â”€â”€ VIRAL PRESETS â”€â”€
    else if (presetName === "shorts") {
      setSelectedFont("Saira");
      setSelectedWeight("ExtraBoldItalic");
      setFillType("gradient");
      setGradStart("#facc15"); // yellow-400
      setGradEnd("#f97316"); // orange-500
      setStrokeWidth(6);
      setStrokeColor("#000000");
      setGlowRadius(0);
      setDepth3d(6);
      setDepthColor("#7c2d12");
      setRotationX(-12);
      setRotationY(8);
      setRotationZ(-3);
      setAnimationPreset("karaoke-pop");
    } else if (presetName === "reels") {
      setSelectedFont("Montserrat");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#ffffff");
      setStrokeWidth(4);
      setStrokeColor("#000000");
      setGlowRadius(0);
      setDepth3d(2);
      setDepthColor("#334155");
      setRotationX(-6);
      setRotationY(-6);
      setRotationZ(0);
      setAnimationPreset("zoom-bounce");
    } else if (presetName === "tiktok") {
      setSelectedFont("Space Grotesk");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#ffffff");
      setStrokeWidth(4);
      setStrokeColor("#00f2fe"); // tiktok cyan glow
      setGlowRadius(12);
      setGlowColor("#ff007f"); // tiktok red glow
      setGlowOpacity(0.85);
      setDepth3d(0);
      setRotationX(-5);
      setRotationY(5);
      setRotationZ(1);
      setAnimationPreset("karaoke-pop");
    }
    // â”€â”€ CREATIVE PRESETS â”€â”€
    else if (presetName === "anime") {
      setSelectedFont("Mukta Malar");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("#fde047"); // yellow-300
      setStrokeWidth(4.5);
      setStrokeColor("#000000");
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("none");
    } else if (presetName === "retro") {
      setSelectedFont("Bebas Neue");
      setSelectedWeight("Bold");
      setFillType("gradient");
      setGradStart("#f43f5e"); // rose-500
      setGradEnd("#f59e0b"); // amber-500
      setStrokeWidth(5);
      setStrokeColor("#27272a");
      setGlowRadius(0);
      setDepth3d(8);
      setDepthColor("#4c0519");
      setRotationX(-15);
      setRotationY(-10);
      setRotationZ(-4);
      setAnimationPreset("zoom-bounce");
    } else if (presetName === "handwritten") {
      setSelectedFont("Outfit");
      setSelectedWeight("Regular");
      setFillType("solid");
      setFillColor("#fbcfe8"); // pink-200
      setStrokeWidth(1.5);
      setStrokeColor("#500724");
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(-5);
      setRotationY(10);
      setRotationZ(-2);
      setAnimationPreset("fade");
    } else if (presetName === "luxury") {
      setSelectedFont("Poppins");
      setSelectedWeight("SemiBold");
      setFillType("gradient");
      setGradStart("#fbbf24"); // gold start
      setGradEnd("#d97706"); // gold end
      setStrokeWidth(2.5);
      setStrokeColor("#1e1b4b");
      setGlowRadius(8);
      setGlowColor("#fbbf24");
      setGlowOpacity(0.4);
      setDepth3d(3);
      setDepthColor("#78350f");
      setRotationX(-6);
      setRotationY(6);
      setRotationZ(0);
      setAnimationPreset("fade");
    } else if (presetName === "corporate") {
      setSelectedFont("Inter");
      setSelectedWeight("Regular");
      setFillType("solid");
      setFillColor("#f8fafc");
      setStrokeWidth(1.5);
      setStrokeColor("#334155");
      setGlowRadius(0);
      setDepth3d(0);
      setRotationX(0);
      setRotationY(0);
      setRotationZ(0);
      setAnimationPreset("none");
    } else if (presetName === "liquidglass") {
      setSelectedFont("Liquid Glass");
      setSelectedWeight("Bold");
      setFillType("solid");
      setFillColor("rgba(255, 255, 255, 0.2)");
      setStrokeWidth(1.5);
      setStrokeColor("rgba(255, 255, 255, 0.65)");
      setGlowRadius(10);
      setGlowColor("#ffffff");
      setGlowOpacity(0.4);
      setDepth3d(2);
      setDepthColor("rgba(255, 255, 255, 0.15)");
      setRotationX(-10);
      setRotationY(10);
      setRotationZ(0);
      setAnimationPreset("zoom-bounce");
    }
  };


  // Mock upload and processing event
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Intercept upload to login first if not authenticated
      if (!isAuthenticated) {
        setPendingUpload(file);
        setView("login");
      } else {
        setVideoFile(file);
        setProjectTitle(file.name);
        setVideoUrl(URL.createObjectURL(file));
        setShowUploadModal(true);
      }
    }
  };

  const completeLoginFlow = (user: any) => {
    setIsAuthenticated(true);
    setUserProfile(user);
    
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.8 }
    });

    if (pendingResumeProject) {
      setProjectId(pendingResumeProject.id);
      setProjectTitle(pendingResumeProject.title);
      setDuration(pendingResumeProject.duration);
      setSegments(pendingResumeProject.segments);
      resetHistory(pendingResumeProject.segments);

      setExpiresAt(pendingResumeProject.expires_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString());
      setView("editor");
      setPendingResumeProject(null);
    } else if (pendingUpload || videoFile) {
      const activeFile = pendingUpload || videoFile;
      if (activeFile) {
        setVideoFile(activeFile);
        setProjectTitle(activeFile.name);
        setVideoUrl(URL.createObjectURL(activeFile));
      }
      setView("landing");
      setShowUploadModal(true);
      setPendingUpload(null);
    } else {
      setView("landing");
    }
  };

  const handleGoogleLogin = () => {
    completeLoginFlow({
      name: "Invincible Studio User",
      email: "creator@invinciblestudios.com",
      picture: "https://lh3.googleusercontent.com/a/ACg8ocL"
    });
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    setSandboxCodeDisplay("");
    
    if (authMode === "signup") {
      if (!email || !phone || !firstName || !dob || !gender || !password || !confirmPassword) {
        setOtpError("Please fill out all required fields.");
        return;
      }
      if (!phone.startsWith("+")) {
        setOtpError("Phone number must include country code starting with '+' (e.g. +919876543210 or +15550000000).");
        return;
      }
      if (password !== confirmPassword) {
        setOtpError("Passwords do not match. You must enter your password 2 times identically.");
        return;
      }
      
      try {
        const response = await fetch(`${apiHost}/api/v1/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: firstName,
            second_name: secondName || null,
            email,
            phone,
            dob,
            gender,
            password,
            confirm_password: confirmPassword
          })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Sign up failed.");
        }
        
        const data = await response.json();
        setOtpIdentifier(data.identifier);
        if (data.sandbox_otp) {
          setSandboxCodeDisplay(data.sandbox_otp);
        }
        setOtpSent(true);
        alert(`Verification code sent to email: ${email} and phone: ${phone}`);
      } catch (error: any) {
        console.error("Signup error:", error);
        setOtpError(error.message || "Sign up failed.");
      }
    } else {
      if (!email || !password) {
        setOtpError("Please enter your email/phone and password.");
        return;
      }
      
      try {
        const response = await fetch(`${apiHost}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            login_identifier: email,
            password: password
          })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Authentication failed.");
        }
        
        const data = await response.json();
        setOtpIdentifier(data.identifier);
        if (data.sandbox_otp) {
          setSandboxCodeDisplay(data.sandbox_otp);
        }
        setOtpSent(true);
        alert(`Verification code sent!`);
      } catch (error: any) {
        console.error("Login error:", error);
        setOtpError(error.message || "Invalid email/phone or password.");
      }
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length === 6) {
      setOtpError("");
      try {
        const response = await fetch(`${apiHost}/api/v1/auth/verify-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            identifier: otpIdentifier || email,
            otp
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Invalid verification code.");
        }

        const data = await response.json();
        completeLoginFlow({
          name: `${data.user?.first_name} ${data.user?.second_name || ""}`.trim(),
          email: data.user?.email,
          phone: data.user?.phone,
          picture: "https://lh3.googleusercontent.com/a/ACg8ocL"
        });
      } catch (error: any) {
        console.error("OTP verification failed", error);
        setOtpError(error.message || "Invalid verification code. Please try again.");
      }
    } else {
      setOtpError("Invalid code. Please enter the 6-digit code.");
    }
  };

  const validateAndSanitizeSegments = (rawSegments: any[]): Segment[] => {
    if (!rawSegments) return [];
    
    // 1. Filter out empty or invalid segments
    let filtered = rawSegments.filter(s => {
      if (!s.text || !s.text.trim()) return false;
      if (s.start_time >= s.end_time) return false;
      return true;
    });

    // 2. Adjust overlaps chronologically
    filtered = filtered.map((s, idx) => {
      if (idx < filtered.length - 1) {
        const next = filtered[idx + 1];
        if (s.end_time > next.start_time) {
          const newEnd = next.start_time;
          const updatedWords = s.words.map((w: any) => {
            if (w.start_time >= newEnd) return null;
            if (w.end_time > newEnd) return { ...w, end_time: newEnd };
            return w;
          }).filter(Boolean) as any[];
          
          return {
            ...s,
            end_time: newEnd,
            words: updatedWords
          };
        }
      }
      return s;
    });

    return filtered;
  };

  const startProcessing = async () => {
    if (!videoFile) return;
    setShowUploadModal(false);
    setIsProcessing(true);
    setProcessProgress(5);
    
    const progressInterval = setInterval(() => {
      setProcessProgress((prev) => {
        if (prev >= 85) {
          clearInterval(progressInterval);
          return 85;
        }
        return prev + 5;
      });
    }, 200);

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("words_per_segment", wordsPerSegment.toString());
    formData.append("consent_training", trainingConsent.toString());
    // Use the explicit spoken language the user selected (never derive from output format)
    formData.append("source_language", spokenLanguage);
    formData.append("target_language", targetLang);
    formData.append("aspect_ratio", aspectRatio);

    let segmentsData: Segment[] = [];
    let projId = "";
    let projTitle = videoFile.name;
    let projDuration = 10.0;
    let projExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let dewarpX = 1.0;
    let dewarpY = 1.0;

    try {
      let isUploaded = false;
      try {
        console.log(`[Upload] Attempting server processing via ${apiHost}...`);
        const response = await fetch(`${apiHost}/api/v1/projects/process`, {
          method: "POST",
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          const projResponse = await fetch(`${apiHost}/api/v1/projects/${data.project_id}`);
          if (projResponse.ok) {
            const projData = await projResponse.json();
            projId = projData.id;
            projTitle = projData.title;
            projDuration = projData.duration;
            projExpiresAt = projData.expires_at;
            segmentsData = projData.segments || [];
            dewarpX = projData.dewarp_scale_x || 1.0;
            dewarpY = projData.dewarp_scale_y || 1.0;
            isUploaded = true;
          }
        }
      } catch (uploadErr) {
        console.warn("[Upload] Server endpoint failed or timed out. Falling back to direct browser-side transcription...", uploadErr);
      }

      if (!isUploaded) {
        // ── Direct Browser-side ElevenLabs Speech-to-Text Fallback ────────────
        console.log("[ElevenLabs] Uploading video directly from browser to ElevenLabs API...");
        const elevenLabsKey = "sk_d02e591bd0b9eb10e5d0bdc4f05803e11de5fb85904f673c";
        const elLang = LANG_MAP[spokenLanguage.toLowerCase()] ?? null;

        const sttForm = new FormData();
        sttForm.append("file", videoFile);
        sttForm.append("model_id", "scribe_v2");
        if (elLang) sttForm.append("language_code", elLang);

        const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": elevenLabsKey },
          body: sttForm,
        });

        if (!sttRes.ok) {
          const errText = await sttRes.text();
          throw new Error(`ElevenLabs API failed with status ${sttRes.status}: ${errText}`);
        }

        const sttData = await sttRes.json();
        const recognizedText = sttData.text || "";
        const elWords = (sttData.words || []).filter(
          (w: any) => w.type === "word" && w.text?.trim()
        );

        console.log(`[ElevenLabs] Success! Browser transcribed ${elWords.length} words.`);

        let wordsList: Word[] = [];
        if (elWords.length > 0) {
          const lastWord = elWords[elWords.length - 1];
          projDuration = Math.max(projDuration, lastWord.end ?? projDuration);

          for (const w of elWords) {
            const wordText = (w.text || "").trim();
            const start = parseFloat(w.start ?? 0);
            const end = parseFloat(w.end ?? 0);
            wordsList.push({
              word: wordText,
              start_time: Math.round(start * 100) / 100,
              end_time: Math.round(end * 100) / 100,
              confidence: 0.98,
              is_emphasized: wordText.length > 5,
              is_punchline: wordText.endsWith("!") || wordText.endsWith("?"),
            });
          }
        } else if (recognizedText.trim()) {
          const rawWords = recognizedText.trim().split(/\s+/);
          const wordSpan = projDuration / rawWords.length;
          rawWords.forEach((word: string, idx: number) => {
            const start = idx * wordSpan;
            wordsList.push({
              word,
              start_time: Math.round(start * 100) / 100,
              end_time: Math.round((start + wordSpan) * 100) / 100,
              confidence: 0.9,
              is_emphasized: false,
              is_punchline: false,
            });
          });
        }

        if (wordsList.length === 0) {
          throw new Error("No speech or audio words were detected in your video file.");
        }

        // ── Group segments and translate/transliterate ───────────────────────
        const sourceLangCode = LANG_MAP[spokenLanguage.toLowerCase()] ?? "en";
        let tempWords: Word[] = [];

        for (let i = 0; i < wordsList.length; i++) {
          tempWords.push(wordsList[i]);

          if (tempWords.length === wordsPerSegment || i === wordsList.length - 1) {
            const segId = Math.random().toString(36).substring(2, 9);
            const segStart = tempWords[0].start_time;
            const segEnd = tempWords[tempWords.length - 1].end_time;
            const segText = tempWords.map(w => w.word).join(" ");

            const hasTamilChars = /[\u0B80-\u0BFF]/.test(segText);
            let tamilText = "";
            let englishText = "";

            if (hasTamilChars) {
              tamilText = segText;
              englishText = await translateText(segText, "ta", "en");
            } else {
              englishText = segText;
              tamilText = sourceLangCode === "ta"
                ? segText
                : await translateText(segText, sourceLangCode === "en" ? "en" : sourceLangCode, "ta");
            }

            const tanglishText = transliterateTamil(tamilText);
            const displayText =
              targetLang === "tanglish" ? tanglishText :
              targetLang === "english" ? englishText :
              tamilText;

            segmentsData.push({
              id: segId,
              speaker_id: "Speaker 1",
              start_time: Math.round(segStart * 100) / 100,
              end_time: Math.round(segEnd * 100) / 100,
              text: displayText,
              tamil_text: tamilText,
              tanglish_text: tanglishText,
              english_text: englishText,
              words: [...tempWords],
            });

            tempWords = [];
          }
        }
        projId = Math.random().toString(36).substring(2, 9);
      }

      clearInterval(progressInterval);
      setProcessProgress(100);

      const validated = validateAndSanitizeSegments(segmentsData);
      setTimeout(() => {
        setProjectId(projId);
        setProjectTitle(projTitle);
        setDuration(projDuration);
        setExpiresAt(projExpiresAt);
        setSegments(validated);
        resetHistory(validated);
        setDewarpScaleX(dewarpX);
        setDewarpScaleY(dewarpY);
        setIsProcessing(false);
        setView("editor");
        applyPreset("mrbeast");
      }, 500);

    } catch (error) {
      console.error("[Transcription Error]", error);
      clearInterval(progressInterval);
      setIsProcessing(false);
      setProcessProgress(0);
      alert(
        "Transcription Failed\n\n" +
        "The audio could not be transcribed. Please check:\n" +
        "â€¢ Your video has clear audio\n" +
        "â€¢ The correct spoken language is selected\n" +
        "â€¢ Your internet connection is stable\n\n" +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // â”€â”€ Client-side Canvas+MediaRecorder Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // (exportVideoRef and exportAbortRef are declared in the refs block above)

  const runExport = async () => {
    if (!videoUrl || !videoFile) {
      alert("No video loaded. Please upload a video first.");
      return;
    }
    if (segments.length === 0) {
      alert("No captions to export. Please process the video first.");
      return;
    }

    setIsExporting(true);
    setExportProgress(2);
    exportAbortRef.current = false;

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    let vid: HTMLVideoElement | null = null;

    try {
      // ── Step 1: Prepare canvas & hidden video element ──────────────────────
      const totalDuration = duration || segments[segments.length - 1].end_time;
      const targetFps = exportFps || 30;

      const canvas = document.createElement("canvas");
      const qualityMap: Record<string, { w: number; h: number }> = {
        "720p": { w: 1280, h: 720 },
        "1080p": { w: 1920, h: 1080 },
        "4k": { w: 3840, h: 2160 },
      };
      const { w: outW, h: outH } = qualityMap[exportQuality] || { w: 1920, h: 1080 };

      // For portrait (9:16) swap dimensions
      const isPortrait = aspectRatio === "9:16";
      canvas.width = isPortrait ? Math.min(outW, outH) : outW;
      canvas.height = isPortrait ? Math.max(outW, outH) : outH;
      const ctx = canvas.getContext("2d")!;

      // Hidden video for frame source — must be appended to the body
      vid = document.createElement("video");
      vid.src = videoUrl;
      vid.muted = true; // MUST be true so it doesn't play audio during export
      vid.preload = "auto";
      vid.crossOrigin = "anonymous";
      vid.style.position = "fixed";
      vid.style.bottom = "15px";
      vid.style.right = "15px";
      vid.style.width = "280px";
      vid.style.height = "160px";
      vid.style.zIndex = "999999";
      vid.style.border = "3px solid #f43f5e";
      vid.style.borderRadius = "12px";
      vid.style.background = "#000";
      vid.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.7)";
      vid.style.pointerEvents = "none";
      document.body.appendChild(vid);

      await new Promise<void>((resolve, reject) => {
        vid!.onloadedmetadata = () => resolve();
        vid!.onerror = reject;
        setTimeout(reject, 10000);
      });
      exportVideoRef.current = vid;

      // ── Step 2: Set up WebCodecs and mp4-muxer ───────────────────────────
      const bitrateMap: Record<string, number> = { "1m": 1_000_000, "5m": 5_000_000, "15m": 15_000_000 };
      const videoBitrate = bitrateMap[exportBitrate] || 5_000_000;

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: "avc",
          width: canvas.width,
          height: canvas.height,
        },
        audio: {
          codec: "aac",
          sampleRate: 44100,
          numberOfChannels: 2,
        },
        fastStart: "in-memory",
      });

      // ── Audio Processing ──────────────────────────────────────────────────
      setExportProgress(5);
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      const audioRes = await fetch(videoUrl);
      const audioArrayBuffer = await audioRes.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);

      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder error", e),
      });
      audioEncoder.configure({
        codec: "mp4a.40.2",
        sampleRate: 44100,
        numberOfChannels: audioBuffer.numberOfChannels,
        bitrate: 128000,
      });

      const numberOfFrames = audioBuffer.length;
      const numberOfChannels = audioBuffer.numberOfChannels;
      const chunkSize = 44100; // 1 second chunks

      for (let i = 0; i < numberOfFrames; i += chunkSize) {
        if (exportAbortRef.current) break;
        const frames = Math.min(chunkSize, numberOfFrames - i);
        const planarData = new Float32Array(frames * numberOfChannels);
        for (let c = 0; c < numberOfChannels; c++) {
          const channelData = audioBuffer.getChannelData(c);
          planarData.set(channelData.subarray(i, i + frames), c * frames);
        }
        
        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate: 44100,
          numberOfFrames: frames,
          numberOfChannels,
          timestamp: (i / 44100) * 1_000_000,
          data: planarData,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
      
      if (exportAbortRef.current) throw new Error("Export cancelled");

      // ── Video Processing ──────────────────────────────────────────────────
      const codecStr = canvas.width >= 3840 ? "avc1.640034" : "avc1.640028";
      const videoConfig = {
        codec: codecStr, // avc1.640034 supports 4K, avc1.640028 is 1080p limit
        width: canvas.width,
        height: canvas.height,
        bitrate: videoBitrate,
        framerate: targetFps,
      };

      const support = await VideoEncoder.isConfigSupported(videoConfig);
      if (!support.supported) {
        throw new Error(`Your device does not support hardware encoding for this resolution (${canvas.width}x${canvas.height}). Please select a lower quality like 1080p.`);
      }

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error", e),
      });
      videoEncoder.configure(videoConfig);

      vid.currentTime = 0;
      vid.playbackRate = 0.5; // Play slower to give GPU/encoder plenty of time without dropping frames

      let lastMediaTime = -1;
      let frameCount = 0;
      const startTime = performance.now();
      
      await new Promise<void>((resolveExport, rejectExport) => {
        const processFrame = async (now: number, metadata: any) => {
          try {
            if (exportAbortRef.current) {
              vid!.pause();
              return rejectExport(new Error("Export cancelled"));
            }

            // Dynamically throttle playback if the WebCodecs encoder queue gets backed up
            if (videoEncoder.encodeQueueSize > 15 && !vid!.paused) {
              vid!.pause();
            } else if (videoEncoder.encodeQueueSize <= 5 && vid!.paused && vid!.currentTime < totalDuration) {
              vid!.play().catch(() => {});
            }

            // Only process NEW frames (requestVideoFrameCallback fires perfectly synchronized with source frames)
            if (metadata.mediaTime !== lastMediaTime) {
              lastMediaTime = metadata.mediaTime;
              const t = metadata.mediaTime; // Perfect precise timestamp from the source video!
              
              // Draw video frame to canvas
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(vid!, 0, 0, canvas.width, canvas.height);

              // Find active segment and draw text
              const activeSeg = segments.find(s => t >= s.start_time && t <= s.end_time);
              if (activeSeg) {
                const text = targetLang === "tanglish"
                  ? (activeSeg.tanglish_text || activeSeg.text)
                  : targetLang === "english"
                  ? (activeSeg.english_text || activeSeg.text)
                  : (activeSeg.tamil_text || activeSeg.text);

                drawSubtitle(canvas, ctx, {
                  text,
                  words: activeSeg.words,
                  currentTime: t,
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
                  positionTarget: "global",
                  exportDebug: false,
                });
              }

              const videoFrame = new VideoFrame(canvas, { timestamp: t * 1_000_000 });
              videoEncoder.encode(videoFrame, { keyFrame: frameCount % 60 === 0 });
              videoFrame.close();
              
              frameCount++;

              const progress = Math.min(99, Math.round((t / totalDuration) * 90) + 10);
              setExportProgress(progress);
              
              const elapsed = (performance.now() - startTime) / 1000;
              const fps = frameCount / elapsed;
              const estRemainingFrames = (totalDuration - t) * (exportFps || 30); 
              setExportRenderFps(Math.round(fps));
              setExportTimeRemaining(Math.max(0, Math.round(estRemainingFrames / fps)));
            }

            if (vid!.currentTime >= totalDuration || vid!.ended) {
              vid!.pause();
              resolveExport();
            } else {
              (vid as any).requestVideoFrameCallback(processFrame);
            }
          } catch (err) {
            vid!.pause();
            rejectExport(err);
          }
        };

        vid!.play().then(() => {
          (vid as any).requestVideoFrameCallback(processFrame);
        }).catch(rejectExport);
      });
      
      if (exportAbortRef.current) {
        throw new Error("Export cancelled");
      }

      await videoEncoder.flush();
      
      // ── Step 3: Finalize and Download ─────────────────────────────────────
      muxer.finalize();
      const buffer = muxer.target.buffer;
      
      if (vid && vid.parentNode) {
        vid.parentNode.removeChild(vid);
      }

      const blob = new Blob([buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `INVINCIBLE_STUDIOS_export.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setExportProgress(100);
      setExportTimeRemaining(0);
      
      setTimeout(() => {
        setIsExporting(false);
        setShowExportModal(false);
        setExportTimeRemaining(null);
        setExportRenderFps(null);
        if (!exportAbortRef.current) {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
        exportAbortRef.current = false;
      }, 500);

    } catch (error) {
      if (typeof vid !== "undefined" && vid && vid.parentNode) {
        vid.parentNode.removeChild(vid);
      }
      console.error("[Export Error]", error);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setIsExporting(false);
      setExportProgress(0);
      setExportTimeRemaining(null);
      setExportRenderFps(null);
      setShowExportModal(false);
      
      if (error instanceof Error && error.message === "Export cancelled") return;
      
      alert(
        "Export Failed\n\n" +
        `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
        "Please try using Chrome or Edge for full WebCodecs support."
      );
    }
  };


  const addNewSegment = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    let lastEnd = 0;
    if (segments.length > 0) {
      lastEnd = segments[segments.length - 1].end_time;
    }
    const newSeg: Segment = {
      id: newId,
      speaker_id: "Speaker 1",
      start_time: lastEnd,
      end_time: lastEnd + 2.0,
      text: "New Caption Card",
      tamil_text: "New Caption Card",
      tanglish_text: "New Caption Card",
      words: [
        { word: "New", start_time: lastEnd, end_time: lastEnd + 1.0, confidence: 1.0 },
        { word: "Caption", start_time: lastEnd + 1.0, end_time: lastEnd + 2.0, confidence: 1.0 }
      ]
    };
    updateSegments([...segments, newSeg]);
    setActiveSegmentId(newId);
    setCurrentTime(lastEnd);
  };

  const handleTimelineCut = () => {
    const cutPoint = currentTime;
    const activeSeg = segments.find(s => cutPoint >= s.start_time && cutPoint <= s.end_time);
    
    if (activeSeg) {
      splitSegmentAtTime(activeSeg.id, cutPoint);
    }
  };

  const splitSegmentAtTime = (id: string, time: number) => {
    const targetIdx = segments.findIndex(s => s.id === id);
    if (targetIdx === -1) return;
    const target = segments[targetIdx];
    
    const words1 = target.words.filter(w => w.start_time < time);
    const words2 = target.words.filter(w => w.start_time >= time);
    
    if (words1.length === 0 || words2.length === 0) {
      const midPoint = Math.floor(target.words.length / 2);
      const w1 = target.words.slice(0, midPoint);
      const w2 = target.words.slice(midPoint);
      const newS1: Segment = {
        ...target,
        id: Math.random().toString(36).substr(2, 9),
        end_time: time,
        text: w1.map(w => w.word).join(" "),
        tamil_text: w1.map(w => w.word).join(" "),
        tanglish_text: w1.map(w => w.word).join(" "),
        words: w1
      };
      const newS2: Segment = {
        ...target,
        id: Math.random().toString(36).substr(2, 9),
        start_time: time,
        text: w2.map(w => w.word).join(" "),
        tamil_text: w2.map(w => w.word).join(" "),
        tanglish_text: w2.map(w => w.word).join(" "),
        words: w2
      };
      const updated = [...segments];
      updated.splice(targetIdx, 1, newS1, newS2);
      updateSegments(updated);
      return;
    }

    const seg1: Segment = {
      ...target,
      id: Math.random().toString(36).substr(2, 9),
      end_time: time,
      text: words1.map(w => w.word).join(" "),
      tamil_text: words1.map(w => w.word).join(" "),
      tanglish_text: words1.map(w => w.word).join(" "),
      words: words1
    };
    
    const seg2: Segment = {
      ...target,
      id: Math.random().toString(36).substr(2, 9),
      start_time: time,
      text: words2.map(w => w.word).join(" "),
      tamil_text: words2.map(w => w.word).join(" "),
      tanglish_text: words2.map(w => w.word).join(" "),
      words: words2
    };
    
    const updated = [...segments];
    updated.splice(targetIdx, 1, seg1, seg2);
    updateSegments(updated);
  };

  const handleTimelineTrim = (direction: "left" | "right") => {
    if (!activeSegmentId) return;
    const target = segments.find(s => s.id === activeSegmentId);
    if (!target) return;

    if (direction === "left") {
      if (currentTime >= target.end_time) return;
      updateSegments(segments.map(s => s.id === activeSegmentId ? { ...s, start_time: currentTime } : s));
    } else {
      if (currentTime <= target.start_time) return;
      updateSegments(segments.map(s => s.id === activeSegmentId ? { ...s, end_time: currentTime } : s));
    }
  };

  const deleteSegment = (id: string) => {
    updateSegments(segments.filter(s => s.id !== id));
  };

  const splitSegment = (segId: string) => {
    const segIdx = segments.findIndex(s => s.id === segId);
    if (segIdx === -1) return;
    const seg = segments[segIdx];
    if (seg.words.length <= 1) return;

    const midPoint = Math.floor(seg.words.length / 2);
    const words1 = seg.words.slice(0, midPoint);
    const words2 = seg.words.slice(midPoint);

    const newSeg1: Segment = {
      ...seg,
      id: Math.random().toString(36).substr(2, 9),
      end_time: words1[words1.length - 1].end_time,
      text: words1.map(w => w.word).join(" "),
      tamil_text: words1.map(w => w.word).join(" "),
      tanglish_text: words1.map(w => w.word).join(" "),
      words: words1
    };

    const newSeg2: Segment = {
      ...seg,
      id: Math.random().toString(36).substr(2, 9),
      start_time: words2[0].start_time,
      text: words2.map(w => w.word).join(" "),
      tamil_text: words2.map(w => w.word).join(" "),
      tanglish_text: words2.map(w => w.word).join(" "),
      words: words2
    };

    const updated = [...segments];
    updated.splice(segIdx, 1, newSeg1, newSeg2);
    updateSegments(updated);
  };

  const mergeSegmentWithNext = (segId: string) => {
    const segIdx = segments.findIndex(s => s.id === segId);
    if (segIdx === -1 || segIdx === segments.length - 1) return;
    
    const curr = segments[segIdx];
    const next = segments[segIdx + 1];

    const mergedWords = [...curr.words, ...next.words];
    const mergedSeg: Segment = {
      ...curr,
      end_time: next.end_time,
      text: curr.text + " " + next.text,
      tamil_text: (curr.tamil_text || "") + " " + (next.tamil_text || ""),
      tanglish_text: (curr.tanglish_text || "") + " " + (next.tanglish_text || ""),
      english_text: (curr.english_text || "") + " " + (next.english_text || ""),
      words: mergedWords
    };

    const updated = [...segments];
    updated.splice(segIdx, 2, mergedSeg);
    updateSegments(updated);
  };

  const updateSegmentText = (id: string, newText: string) => {
    updateSegments(segments.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          text: newText,
          tanglish_text: newText
        };
      }
      return s;
    }));
  };


  // Helper function to build 3D text styling dynamically
  const buildTextStyle = (isHighlighted: boolean, isPunch: boolean) => {
    const shadows = [];
    const isLiquidGlass = selectedFont === "Liquid Glass";
    
    if (depth3d > 0) {
      for (let i = 1; i <= depth3d; i++) {
        shadows.push(`0 ${i}px 0 ${isLiquidGlass ? "rgba(255, 255, 255, 0.15)" : depthColor}`);
      }
    }
    
    const finalShadowBlur = isHighlighted ? shadowBlur + 8 : shadowBlur;
    shadows.push(`${shadowOffsetX}px ${shadowOffsetY}px ${finalShadowBlur}px ${isLiquidGlass ? "rgba(255, 255, 255, 0.1)" : shadowColor}`);
    
    if (glowRadius > 0) {
      const rgb = glowColor === "#ffffff" ? "255, 255, 255" : glowColor === "#a855f7" ? "168, 85, 247" : glowColor === "#f97316" ? "249, 115, 22" : "34, 211, 238";
      shadows.push(`0 0 ${glowRadius}px rgba(${rgb}, ${glowOpacity})`);
    }

    const fontColor = isLiquidGlass 
      ? (isHighlighted ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.2)") 
      : (isHighlighted ? gradStart : isPunch ? "#22d3ee" : fillColor);

    return {
      fontFamily: (() => {
        switch (selectedFont) {
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
          default: return "'Inter', sans-serif";
        }
      })(),
      fontWeight: selectedWeight.includes("Bold") ? "800" : "600",
      fontStyle: selectedWeight.includes("Italic") ? "italic" : "normal",
      fontSize: `${fontSize}px`,
      WebkitTextStroke: isLiquidGlass ? `${strokeWidth}px rgba(255, 255, 255, 0.65)` : `${strokeWidth}px ${strokeColor}`,
      color: fontColor,
      textShadow: shadows.join(", "),
      transform: `perspective(300px) rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotateZ(${rotationZ}deg)`,
      display: "inline-block",
      backdropFilter: isLiquidGlass ? "blur(4px)" : "none",
      transition: "all 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
    };
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-[#030308] text-slate-100 overflow-hidden">
      
      {/* Dynamic Liquid Glow Background blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-rose-600/10 blur-[120px] animate-blob-1 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[120px] animate-blob-2 pointer-events-none" />
      <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-cyan-600/5 blur-[120px] animate-blob-3 pointer-events-none" />

      {/* HEADER NAVBAR */}
      <header className="w-full border-b border-white/5 py-4 px-6 flex items-center justify-between z-40 liquid-glass sticky top-0">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView("landing")}>
          <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg shadow-orange-500/30 bg-slate-950 flex items-center justify-center border border-white/10">
            <img src="/logo.png" alt="INVINCIBLE STUDIOS Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-base sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent uppercase">
            INVINCIBLE STUDIOS <span className="bg-gradient-to-r from-orange-400 to-rose-500 bg-clip-text text-transparent font-black">Captions</span>
          </span>
        </div>
        
        {view === "landing" && (
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <button
                onClick={() => setView("editor")}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-200 font-semibold text-xs apple-transition active:scale-95"
              >
                Go to Editor
              </button>
            ) : (
              <button
                onClick={() => setView("login")}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold text-xs shadow-md shadow-rose-500/10 apple-transition active:scale-95"
              >
                Start free
              </button>
            )}
          </div>
        )}

        {view === "login" && (
          <button
            onClick={() => setView("landing")}
            className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-semibold text-xs apple-transition active:scale-95"
          >
            Back to Home
          </button>
        )}

        {view === "editor" && (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/5 text-rose-300 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>Autodelete in: {timeLeft}</span>
            </div>
            
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold text-sm flex items-center space-x-2 shadow-lg shadow-rose-500/15 apple-transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Export Subtitles</span>
            </button>
          </div>
        )}
      </header>

      {/* APP VIEWS */}
      <main className="flex-1 flex flex-col relative z-20">
        <AnimatePresence mode="wait">
          
          {/* 1. LANDING PAGE VIEW */}
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col items-center justify-center px-4 py-16 max-w-6xl mx-auto w-full"
            >
              <div className="mb-6 flex items-center space-x-2 px-4 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/5 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs font-bold text-rose-300 tracking-widest uppercase">Powered by studio ultimate AI</span>
              </div>

              <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-center leading-[1.1] max-w-4xl">
                Give every video a <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-orange-400 via-rose-500 to-purple-600 bg-clip-text text-transparent">
                  voice that burns.
                </span>
              </h1>
              
              <p className="mt-6 text-lg sm:text-xl text-slate-400 text-center max-w-2xl font-light">
                INVINCIBLE STUDIOS Captions turns raw footage into scroll-stopping subtitles â€” transcribed, translated, and styled to the beat by studio ultimate, in one liquid-glass editor.
              </p>

              <div className="mt-12 w-full max-w-xl p-8 rounded-3xl liquid-glass-premium border-white/10 text-center relative metallic-border">
                <div className="absolute -top-3 -right-3 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] text-purple-300 font-bold uppercase tracking-widest">
                  High Quality
                </div>
                
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner">
                    <Upload className="w-8 h-8 text-rose-500" />
                  </div>
                  
                  <h3 className="text-lg font-bold">Import your video asset</h3>
                  <p className="text-xs text-slate-400 mt-2 mb-6 max-w-xs mx-auto">
                    Supports MP4, MOV, MKV, AVI, and all standard formats.
                  </p>

                  <label className="px-6 py-3 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 transition cursor-pointer shadow-lg shadow-white/5 active:scale-95 text-sm inline-flex items-center space-x-2">
                    <input 
                      type="file" 
                      accept="video/*" 
                      className="hidden" 
                      onChange={handleFileUpload}
                    />
                    <span>Choose Video File</span>
                    <ArrowRight className="w-4 h-4" />
                  </label>
                </div>
              </div>

              {savedProjects.length > 0 && (
                <div className="mt-12 w-full max-w-xl text-left">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-rose-500 animate-pulse" />
                    <span>Saved Progress</span>
                  </h3>
                  
                  <div className="space-y-3">
                    {savedProjects.map((p) => (
                      <div 
                        key={p.id}
                        className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 hover:border-white/10 transition active:scale-[0.99] cursor-pointer"
                        onClick={() => {
                          if (!isAuthenticated) {
                            setPendingResumeProject(p);
                            setView("login");
                          } else {
                            setProjectId(p.id);
                            setProjectTitle(p.title);
                            setDuration(p.duration);
                            setSegments(p.segments);
                            setDewarpScaleX(p.dewarp_scale_x || 1.0);
                            setDewarpScaleY(p.dewarp_scale_y || 1.0);
                            setExpiresAt(p.expires_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString());
                            setView("editor");
                            confetti({
                              particleCount: 40,
                              spread: 50,
                              origin: { y: 0.8 }
                            });
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <span className="text-xs font-bold text-slate-200 block truncate">{p.title}</span>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            Last updated: {new Date(p.last_updated).toLocaleTimeString()} ({p.duration.toFixed(1)}s)
                          </span>
                        </div>
                        <button className="px-3.5 py-1.5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-bold text-[11px] transition shadow">
                          Resume
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-20 w-full">
                <h3 className="text-center text-sm font-semibold tracking-widest text-slate-500 uppercase mb-8">
                  Featured Cinematic Caption Styles
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 rounded-2xl liquid-glass border-white/5 flex flex-col justify-between items-center h-48 relative overflow-hidden">
                    <div className="absolute top-3 left-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Preset: Beast Glow
                    </div>
                    <div className="flex flex-col items-center justify-center h-full">
                      <span 
                        className="text-4xl sm:text-5xl font-black italic select-none"
                        style={{
                          fontFamily: "Saira",
                          color: "#facc15",
                          WebkitTextStroke: "4px #000000",
                          textShadow: "0 1px 0 #854d0e, 0 2px 0 #854d0e, 0 3px 0 #854d0e, 0 4px 0 #854d0e, 0 5px 0 #854d0e, 3px 3px 10px rgba(0,0,0,0.8)",
                          transform: "perspective(300px) rotateX(-10deg) rotateY(12deg) scale(1.05)"
                        }}
                      >
                        STEAL THESE
                      </span>
                      <span 
                        className="text-3xl sm:text-4xl font-black italic mt-1 select-none"
                        style={{
                          fontFamily: "Saira",
                          color: "#f97316",
                          WebkitTextStroke: "4px #000000",
                          textShadow: "0 1px 0 #7c2d12, 0 2px 0 #7c2d12, 0 3px 0 #7c2d12, 0 4px 0 #7c2d12, 3px 3px 10px rgba(0,0,0,0.8)",
                          transform: "perspective(300px) rotateX(-10deg) rotateY(12deg)"
                        }}
                      >
                        BEST WEBSITES
                      </span>
                    </div>
                  </div>

                  <div className="p-8 rounded-2xl liquid-glass border-white/5 flex flex-col justify-between items-center h-48 relative overflow-hidden">
                    <div className="absolute top-3 left-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Preset: Cyber Extrude
                    </div>
                    <div className="flex flex-col items-center justify-center h-full">
                      <span 
                        className="text-3xl sm:text-4xl font-extrabold select-none"
                        style={{
                          fontFamily: "Poppins",
                          color: "#a855f7",
                          WebkitTextStroke: "3px #000000",
                          textShadow: "0 1px 0 #581c87, 0 2px 0 #581c87, 0 3px 0 #581c87, 0 4px 0 #581c87, 0 0 15px rgba(168,85,247,0.7), 4px 4px 12px rgba(0,0,0,0.9)",
                          transform: "perspective(300px) rotateX(-8deg) rotateY(-8deg)"
                        }}
                      >
                        POV: I EDIT YOUR
                      </span>
                      <span 
                        className="text-4xl sm:text-5xl font-black mt-1 select-none"
                        style={{
                          fontFamily: "Poppins",
                          color: "#c084fc",
                          WebkitTextStroke: "3px #000000",
                          textShadow: "0 1px 0 #581c87, 0 2px 0 #581c87, 0 3px 0 #581c87, 0 4px 0 #581c87, 0 5px 0 #581c87, 0 0 15px rgba(168,85,247,0.7), 4px 4px 12px rgba(0,0,0,0.9)",
                          transform: "perspective(300px) rotateX(-8deg) rotateY(-8deg) scale(1.08)"
                        }}
                      >
                        VIDEOS
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-16 w-full max-w-4xl p-6 rounded-2xl border border-white/5 bg-slate-900/20 backdrop-blur-md">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Languages className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Contextual Tamil &rarr; Tanglish Agent</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Captures natural speech pronunciation, slang, and social media spellings.</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 bg-black/40 px-5 py-3.5 rounded-xl border border-white/5 text-sm">
                    <span className="text-slate-400 font-mono">Formal:</span>
                    <span className="text-slate-300 font-medium">à®Žà®ªà¯à®ªà®Ÿà®¿ à®‡à®°à¯à®•à¯à®•à®¿à®±à¯€à®°à¯à®•à®³à¯</span>
                    <span className="text-slate-500 font-mono">&rarr;</span>
                    <span className="text-orange-400 font-extrabold font-mono">epdi irukeenga</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 1.5 LOGIN VIEW */}
          {view === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex items-center justify-center p-6"
            >
              <div className="w-full max-w-md p-8 rounded-3xl liquid-glass-premium border-white/10 shadow-2xl relative">
                
                <div className="text-center mb-8">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-lg shadow-orange-500/10">
                    <img src="/logo.png" alt="INVINCIBLE STUDIOS Logo" className="w-full h-full object-contain" />
                  </div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent font-extrabold tracking-tight">
                    Welcome to INVINCIBLE STUDIOS
                  </h2>
                  <p className="text-xs text-slate-400 mt-2">
                    Log in or create an account to start creating captions with studio ultimate.
                  </p>
                </div>

                <div className="flex space-x-2 mb-6 p-1 rounded-xl bg-black/40 border border-white/5">
                  <button
                    onClick={() => { setAuthMethod("google"); setOtpSent(false); setOtpError(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                      authMethod === "google" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Google Sign-In
                  </button>
                  <button
                    onClick={() => { setAuthMethod("email"); setOtpError(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                      authMethod === "email" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Email Login
                  </button>
                </div>

                {authMethod === "google" ? (
                  <div className="space-y-5 text-left">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3.5">
                      <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Google Client ID Config</label>
                      <input 
                        type="text" 
                        placeholder="Paste Google OAuth Client ID here..." 
                        value={googleClientId}
                        onChange={(e) => setGoogleClientId(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50"
                      />
                    </div>

                    {googleClientId ? (
                      <div className="space-y-3.5">
                        <div className="text-[10px] text-slate-400 font-bold text-center">
                          Click below to choose Google account:
                        </div>
                        <div id="google-signin-btn-div" className="w-full min-h-[40px] flex justify-center" />
                      </div>
                    ) : (
                      <div className="text-center p-4 rounded-2xl border border-dashed border-white/10 text-slate-500 text-xs">
                        Enter a Client ID above to enable Google Sign-In, or use sandbox below
                      </div>
                    )}

                    <div className="border-t border-white/5 pt-4">
                      <button
                        onClick={handleGoogleLogin}
                        className="w-full py-3 px-4 rounded-xl border border-dashed border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-rose-300 flex items-center justify-center space-x-2 transition active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                        <span>Simulate Sandbox Login</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex p-1 rounded-xl bg-black/40 border border-white/5 mb-4">
                      <button
                        onClick={() => { setAuthMode("signin"); setOtpError(""); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                          authMode === "signin" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        onClick={() => { setAuthMode("signup"); setOtpError(""); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                          authMode === "signup" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Create Account
                      </button>
                    </div>

                    {otpError && (
                      <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-xs text-rose-400 font-semibold">
                        {otpError}
                      </div>
                    )}
                    
                    {!otpSent ? (
                      <form onSubmit={handleSendOtp} className="space-y-4">
                        {authMode === "signup" ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">First Name *</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="First name"
                                  value={firstName}
                                  onChange={(e) => setFirstName(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Second Name</label>
                                <input
                                  type="text"
                                  placeholder="Second name"
                                  value={secondName}
                                  onChange={(e) => setSecondName(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Email Address *</label>
                                <input
                                  type="email"
                                  required
                                  placeholder="you@example.com"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Phone Number *</label>
                                <input
                                  type="tel"
                                  required
                                  placeholder="+919876543210"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Date of Birth *</label>
                                <input
                                  type="date"
                                  required
                                  value={dob}
                                  onChange={(e) => setDob(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Gender *</label>
                                <select
                                  required
                                  value={gender}
                                  onChange={(e) => setGender(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                >
                                  <option value="">Select gender</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Password *</label>
                                <input
                                  type="password"
                                  required
                                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Confirm Password *</label>
                                <input
                                  type="password"
                                  required
                                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Email or Phone Number *</label>
                              <input
                                type="text"
                                required
                                placeholder="you@example.com or phone"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-slate-400 font-semibold mb-1 block">Password *</label>
                              <input
                                type="password"
                                required
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                              />
                            </div>
                          </>
                        )}

                        <button
                          type="submit"
                          className="w-full py-3.5 mt-2 rounded-xl bg-white hover:bg-slate-100 font-bold text-xs text-slate-950 transition active:scale-95 shadow-lg shadow-white/5 flex items-center justify-center space-x-2"
                        >
                          <span>{authMode === "signup" ? "Create Account & Send OTP" : "Sign In & Send OTP"}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <div className="text-center text-xs text-slate-400 mb-2">
                          We sent a 6-digit OTP code to <strong className="text-slate-200">{email}</strong>. Please enter it below.
                        </div>
                        
                        {sandboxCodeDisplay && (
                          <div className="p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/5 text-center text-xs text-orange-400 font-semibold leading-relaxed">
                            âš ï¸ Sandbox Mode: Since email/SMS services are not configured, your OTP code is: <strong className="text-white text-sm bg-white/10 px-2 py-0.5 rounded font-mono ml-1">{sandboxCodeDisplay}</strong>
                          </div>
                        )}
                        
                        <div>
                          <label className="text-[11px] text-slate-400 font-semibold mb-1 block text-center">Verification OTP Code</label>
                          <input
                            type="text"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-rose-500/50"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 font-bold text-xs text-white transition active:scale-95 shadow-lg shadow-rose-500/15"
                        >
                          Verify & Log In
                        </button>

                        <div className="text-center mt-4">
                          <button
                            type="button"
                            onClick={() => { setOtp(""); setOtpSent(false); }}
                            className="text-[11px] text-rose-400 hover:underline font-semibold"
                          >
                            Edit account info
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          )}

          {/* 2. CAPTION STUDIO EDITOR VIEW */}
          {view === "editor" && (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col h-[calc(100vh-69px)] overflow-hidden"
            >
              <EditorLayout
                videoUrl={videoUrl}
                videoNaturalW={videoNaturalW}
                videoNaturalH={videoNaturalH}
                dewarpScaleX={dewarpScaleX}
                dewarpScaleY={dewarpScaleY}
                onVideoMeta={(w, h) => {
                  setVideoNaturalW(w);
                  setVideoNaturalH(h);
                }}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                isPlayerFullscreen={isPlayerFullscreen}
                setIsPlayerFullscreen={setIsPlayerFullscreen}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                duration={duration}
                segments={segments}
                setSegments={updateSegments}

                activeSegmentId={activeSegmentId}
                setActiveSegmentId={setActiveSegmentId}
                addNewSegment={addNewSegment}
                deleteSegment={deleteSegment}
                splitSegment={splitSegment}
                mergeSegmentWithNext={mergeSegmentWithNext}
                updateSegmentText={updateSegmentText}
                timelineActiveTool={timelineActiveTool}
                setTimelineActiveTool={setTimelineActiveTool}
                isMagneticEnabled={isMagneticEnabled}
                setIsMagneticEnabled={setIsMagneticEnabled}
                handleTimelineCut={handleTimelineCut}
                handleTimelineTrim={handleTimelineTrim}
                selectedFont={selectedFont}
                setSelectedFont={setSelectedFont}
                selectedWeight={selectedWeight}
                setSelectedWeight={setSelectedWeight}
                fontSize={fontSize}
                setFontSize={setFontSize}
                fillType={fillType}
                setFillType={setFillType}
                fillColor={fillColor}
                setFillColor={setFillColor}
                gradStart={gradStart}
                setGradStart={setGradStart}
                gradEnd={gradEnd}
                setGradEnd={setGradEnd}
                strokeColor={strokeColor}
                setStrokeColor={setStrokeColor}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                glowColor={glowColor}
                setGlowColor={setGlowColor}
                glowRadius={glowRadius}
                setGlowRadius={setGlowRadius}
                glowOpacity={glowOpacity}
                setGlowOpacity={setGlowOpacity}
                shadowColor={shadowColor}
                setShadowColor={setShadowColor}
                shadowBlur={shadowBlur}
                setShadowBlur={setShadowBlur}
                shadowOffsetX={shadowOffsetX}
                setShadowOffsetX={setShadowOffsetX}
                shadowOffsetY={shadowOffsetY}
                setShadowOffsetY={setShadowOffsetY}
                depth3d={depth3d}
                setDepth3d={setDepth3d}
                depthColor={depthColor}
                setDepthColor={setDepthColor}
                rotationX={rotationX}
                setRotationX={setRotationX}
                rotationY={rotationY}
                setRotationY={setRotationY}
                rotationZ={rotationZ}
                setRotationZ={setRotationZ}
                animationPreset={animationPreset}
                setAnimationPreset={setAnimationPreset}
                subX={subX}
                setSubX={setSubX}
                subY={subY}
                setSubY={setSubY}
                positionTarget={positionTarget}
                setPositionTarget={setPositionTarget}
                exportFormat={exportFormat}
                setExportFormat={setExportFormat}
                exportQuality={exportQuality}
                setExportQuality={setExportQuality}
                exportFps={exportFps}
                setExportFps={setExportFps}
                exportBitrate={exportBitrate}
                setExportBitrate={setExportBitrate}
                exportProgress={exportProgress}
                exportTimeRemaining={exportTimeRemaining}
                exportRenderFps={exportRenderFps}
                exportElapsedS={exportElapsedS}
                isExporting={isExporting}
                onExport={runExport}
                applyPreset={applyPreset}
                buildTextStyle={buildTextStyle}
                targetLang={targetLang}
                setTargetLang={setTargetLang}
                exportDebug={exportDebug}
                setExportDebug={setExportDebug}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* UPLOADER SETUP & AI CONSENT MODAL */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg p-6 rounded-3xl liquid-glass-premium border-white/10 shadow-2xl relative"
            >
              <div className="flex items-center space-x-3 mb-4">
                <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
                <h2 className="text-xl font-bold">Configure INVINCIBLE STUDIOS Captions</h2>
              </div>
              
              <p className="text-xs text-slate-400 mb-6">
                Prepare your media workspace settings. studio ultimate analyzes dialects, segment timestamps, and speech rhythms.
              </p>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-2">
                    <span>Words per sentence block</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-rose-400 font-mono font-bold">
                      {wordsPerSegment} {wordsPerSegment === 1 ? "word" : "words"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2.5">
                    Recommended: 1-2 words for MrBeast/Shorts pop styles, 3-4 words for podcast clips.
                  </p>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    value={wordsPerSegment}
                    onChange={(e) => setWordsPerSegment(parseInt(e.target.value))}
                    style={{"--value-percent": `${((wordsPerSegment - 1) / 3) * 100}%`} as React.CSSProperties}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-2 block">ðŸŽ™ï¸ Spoken Language in Video</label>
                  <select
                    value={spokenLanguage}
                    onChange={(e) => setSpokenLanguage(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50 mb-3"
                  >
                    <option value="auto">Auto Detect (Recommended)</option>
                    <option value="ta">Tamil (à®¤à®®à®¿à®´à¯)</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi (à¤¹à¤¿à¤¨à¥à¤¦à¥€)</option>
                    <option value="te">Telugu (à°¤à±†à°²à±à°—à±)</option>
                    <option value="kn">Kannada (à²•à²¨à³à²¨à²¡)</option>
                    <option value="ml">Malayalam (à´®à´²à´¯à´¾à´³à´‚)</option>
                  </select>
                  <label className="text-xs font-semibold text-slate-300 mb-2 block">ðŸ“ Caption Output Format</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50"
                  >
                    <option value="tanglish">Tamil â†’ Tanglish (Contextual Transliteration)</option>
                    <option value="english">Tamil â†’ English Translation</option>
                    <option value="tamil">Formal Tamil (à®¤à®®à®¿à®´à¯)</option>
                    <option value="multilingual">Multilingual Source Classification</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-2 block">Project Aspect Ratio</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "9:16", label: "9:16", desc: "Reels / TikTok" },
                      { value: "16:9", label: "16:9", desc: "YouTube" },
                      { value: "1:1", label: "1:1", desc: "Instagram" },
                      { value: "4:5", label: "4:5", desc: "Portrait Feed" }
                    ].map((ratio) => (
                      <button
                        key={ratio.value}
                        type="button"
                        onClick={() => setAspectRatio(ratio.value as any)}
                        className={`p-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                          aspectRatio === ratio.value 
                            ? "bg-rose-500/10 border-rose-500 text-rose-300" 
                            : "bg-black/20 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10"
                        }`}
                      >
                        <span className="text-[10px] font-bold font-mono">{ratio.label}</span>
                        <span className="text-[8px] text-slate-500 mt-0.5 truncate max-w-full">{ratio.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-start space-x-3">
                    <input 
                      type="checkbox" 
                      id="training-consent"
                      checked={trainingConsent}
                      onChange={(e) => setTrainingConsent(e.target.checked)}
                      className="mt-1 rounded border-slate-700 bg-black text-rose-500 focus:ring-rose-500 cursor-pointer w-4 h-4"
                    />
                    <label htmlFor="training-consent" className="cursor-pointer select-none">
                      <span className="text-xs font-bold text-slate-200 block flex items-center space-x-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Allow model training usage</span>
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Allow studio ultimate to use this video file to train and enhance transcription models. We will never share or sell your data.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex items-start space-x-3 text-rose-300">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-rose-200">24-Hour Secure Purge Active</h5>
                    <p className="text-[10px] text-rose-400/80 mt-1">
                      Your uploaded videos are saved on a secure, encrypted local volume and will be deleted automatically 24 hours from processing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-8">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 font-semibold text-xs text-slate-300 transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={startProcessing}
                  className="flex-1 py-3 rounded-xl bg-white hover:bg-slate-100 font-bold text-xs text-slate-950 transition active:scale-95"
                >
                  Generate Subtitles
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EXPORT SETUP DIALOG */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm p-6 rounded-3xl liquid-glass-premium border-white/10 shadow-2xl text-center"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <Download className="w-6 h-6 text-rose-500" />
              </div>
              
              <h3 className="text-lg font-bold">Export Subtitled Video</h3>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                Choose the container format for your export. The final output is rendered in maximum uploaded video quality.
              </p>

              <div className="flex space-x-3 mb-6">
                <button
                  onClick={() => setExportFormat("mp4")}
                  className={`flex-1 py-3 rounded-xl border font-bold text-xs transition flex flex-col items-center justify-center space-y-1 ${
                    exportFormat === "mp4" ? "bg-white/10 border-white/20 text-white" : "border-transparent text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <span className="text-sm">.MP4</span>
                  <span className="text-[9px] text-slate-400 font-medium">Burned captions (Standard)</span>
                </button>
                <button
                  onClick={() => setExportFormat("mov")}
                  className={`flex-1 py-3 rounded-xl border font-bold text-xs transition flex flex-col items-center justify-center space-y-1 ${
                    exportFormat === "mov" ? "bg-white/10 border-white/20 text-white" : "border-transparent text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <span className="text-sm">.MOV</span>
                  <span className="text-[9px] text-slate-400 font-medium">Transparent alpha channel</span>
                </button>
              </div>
              
              <div className="space-y-3 text-left mb-6">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mb-1 block">Output Resolution</label>
                  <select
                    value={exportQuality}
                    onChange={(e) => setExportQuality(e.target.value as any)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="720p">720p (HD Ready)</option>
                    <option value="1080p">1080p (Full HD - Reels standard)</option>
                    <option value="4k">4K (Ultra HD - Max Quality)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mb-1 block">Frame Rate</label>
                    <select
                      value={exportFps}
                      onChange={(e) => setExportFps(parseInt(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value={24}>24 FPS (Cinematic)</option>
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Ultra Smooth)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-bold tracking-wide uppercase mb-1 block">Target Bitrate</label>
                    <select
                      value={exportBitrate}
                      onChange={(e) => setExportBitrate(e.target.value as any)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="1m">1 Mbps (Low Size)</option>
                      <option value="5m">5 Mbps (Recommended)</option>
                      <option value="15m">15 Mbps (High Quality)</option>
                    </select>
                  </div>
                </div>
              </div>

              {isExporting ? (
                <div className="space-y-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                      <span>Stitching frames & audio...</span>
                      <span>{exportProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    {exportTimeRemaining !== null && (
                      <span>Time remaining: {exportTimeRemaining}s</span>
                    )}
                    {exportRenderFps !== null && (
                      <span>Speed: {exportRenderFps} fps</span>
                    )}
                  </div>
                  <button
                    onClick={abortExport}
                    className="w-full py-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold text-rose-300 transition active:scale-95"
                  >
                    Cancel Render
                  </button>
                </div>

              ) : (
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 py-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 font-semibold text-xs text-slate-300 transition active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runExport}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 font-bold text-xs text-white transition active:scale-95 shadow-lg shadow-rose-500/15"
                  >
                    Start Rendering
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BACKGROUND PROCESSING OVERLAY */}
      <AnimatePresence>
        {isProcessing && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="text-center max-w-sm w-full">
              <div className="relative w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" />
                <Sparkles className="w-6 h-6 text-rose-500 animate-pulse" />
              </div>
              
              <h3 className="text-lg font-bold">Analyzing speech and timelines</h3>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                Executing Whisper Large v3 ASR, speaker segmentation, and Tamil transliteration...
              </p>

              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-300"
                  style={{ width: `${processProgress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2 font-mono">
                <span>Status: Process proxy</span>
                <span>{processProgress}%</span>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* GOOGLE MINIMAL OAUTH MODAL */}
      <AnimatePresence>
        {showGoogleOAuth && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm p-6 rounded-3xl liquid-glass-premium border-white/10 shadow-2xl text-center"
            >
              <div className="flex items-center justify-center space-x-2 mb-4">
                <svg className="w-5 h-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-sm font-bold text-slate-300">Sign in with Google</span>
              </div>

              <h4 className="text-sm font-bold text-slate-200">Permissions Requested</h4>
              <p className="text-[11px] text-slate-400 mt-2">
                <strong>INVINCIBLE STUDIOS Captions</strong> requests permission to access only the following details from your Google Account:
              </p>

              <div className="my-4 p-3 bg-black/40 border border-white/5 rounded-2xl text-left space-y-2">
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-slate-200 block">Your Email Address</span>
                    <span className="text-[9px] text-slate-500 block">To create and verify your user profile.</span>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-slate-200 block">Basic Profile Info (Name & Avatar)</span>
                    <span className="text-[9px] text-slate-500 block">To personalize your workspace layouts.</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 text-left text-[10px] text-orange-300 mb-6 flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Minimal Scopes Active:</strong> This application will NOT be allowed to view, edit, or delete any files from your Google Drive or secondary account settings.
                </span>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowGoogleOAuth(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 font-semibold text-xs text-slate-300 transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowGoogleOAuth(false);
                    handleGoogleLogin();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white hover:bg-slate-100 font-bold text-xs text-slate-950 transition active:scale-95 shadow-lg shadow-white/5"
                >
                  Approve & Log In
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COOKIE CONSENT BANNER */}
      <AnimatePresence>
        {!cookieConsent && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-[420px] p-6 rounded-3xl liquid-glass-premium border-white/10 shadow-2xl z-40"
          >
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-200">Cookie & Privacy Consent</h4>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-3">
                  We use cookies to analyze traffic, manage secure login sessions, and optimize the studio ultimate transcription interface. Choose your preferences below.
                </p>

                {showCookieOptions && (
                  <div className="mt-4 space-y-2 bg-black/35 p-3 rounded-2xl border border-white/5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Necessary Cookies</span>
                      <span className="text-[9px] text-slate-500 uppercase font-bold text-slate-400">Always Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Analytics Cookies</span>
                      <input 
                        type="checkbox"
                        checked={cookieSettings.analytics}
                        onChange={(e) => setCookieSettings({ ...cookieSettings, analytics: e.target.checked })}
                        className="rounded border-slate-700 bg-black text-rose-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Marketing Cookies</span>
                      <input 
                        type="checkbox"
                        checked={cookieSettings.marketing}
                        onChange={(e) => setCookieSettings({ ...cookieSettings, marketing: e.target.checked })}
                        className="rounded border-slate-700 bg-black text-rose-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                <div className="flex space-x-2 mt-4">
                  {showCookieOptions ? (
                    <button
                      onClick={() => {
                        setCookieConsent("custom");
                        localStorage.setItem("cookieConsent", "custom");
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-white text-slate-950 font-bold text-xs active:scale-95 transition"
                    >
                      Save Settings
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setShowCookieOptions(true);
                        }}
                        className="px-3 py-2 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs transition"
                      >
                        Options
                      </button>
                      <button
                        onClick={() => {
                          setCookieConsent("accepted");
                          localStorage.setItem("cookieConsent", "accepted");
                        }}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-bold text-xs active:scale-95 transition shadow-lg shadow-rose-500/10"
                      >
                        Accept All
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
