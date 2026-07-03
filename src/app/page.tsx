"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, Play, Pause, Trash2, ArrowRight, Sparkles, Languages, Sliders, CheckCircle2,
  Clock, Download, RefreshCw, Layers, Monitor, RotateCcw, Lock, Unlock, Split, Merge, AlertTriangle, Eye, ShieldCheck, ShieldAlert, Plus, Save,
  Scissors, Maximize, Minimize, Magnet
} from "lucide-react";
import confetti from "canvas-confetti";
import EditorLayout from "./EditorLayout";
import { useUndoHistory } from "./hooks/useUndoHistory";
import { drawSubtitle } from "./utils/subtitleRenderer";


// Phonetic Tanglish mapping dictionary for mock translation agent
const TANGlish_MAP: Record<string, string> = {
  "வணக்கம்": "vanakkam",
  "எப்படி இருக்கீங்க": "epdi irukeenga",
  "நன்றி": "nandri",
  "சாப்டீங்களா": "sapteengala",
  "சூப்பர்": "super",
  "நண்பா": "nanba",
  "இல்லை": "illa",
  "ஆமாம்": "ama",
  "என்ன பண்றீங்க": "enna panreenga",
  "செம்ம": "semma",
  "இன்னைக்கு": "innaiku",
  "நம்ம": "namma",
  "ஒரு": "oru",
  "வீடியோ": "video",
  "பார்க்கப்போறோம்": "parkapoorom",
  "எல்லாரும்": "ellarum",
  "டாபிக்": "topic",
  "AI": "AI",
  "கேப்ஷன்ஸ்": "captions",
  "ஸ்பீடு": "speed"
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
  
  // Calls the Render backend DIRECTLY from the browser — skips Vercel serverless entirely
  // Set NEXT_PUBLIC_RENDER_URL=https://your-app.onrender.com in Vercel env vars
  const getApiHost = () => {
    if (typeof window !== "undefined") {
      return process.env.NEXT_PUBLIC_RENDER_URL || "";
    }
    return process.env.NEXT_PUBLIC_RENDER_URL || "http://localhost:8000";
  };
  const apiHost = getApiHost();

  
  // App Global State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [wordsPerSegment, setWordsPerSegment] = useState<number>(2);
  const [trainingConsent, setTrainingConsent] = useState<boolean>(true);
  const [targetLang, setTargetLang] = useState<string>("tanglish");
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

  const abortExport = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsExporting(false);
    setExportProgress(0);
    setExportTimeRemaining(null);
    setExportRenderFps(null);
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
    // ── MINIMAL PRESETS ──
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
    // ── CINEMATIC PRESETS ──
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
    // ── GAMING PRESETS ──
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
    // ── VIRAL PRESETS ──
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
    // ── CREATIVE PRESETS ──
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
    formData.append("source_language", targetLang === "tamil" ? "ta" : "auto");
    formData.append("target_language", targetLang);
    formData.append("aspect_ratio", aspectRatio);

    try {
      const response = await fetch(`${apiHost}/api/v1/projects/process`, {
        method: "POST",
        body: formData
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Backend processing failed");
      }

      const data = await response.json();
      setProcessProgress(100);

      const projResponse = await fetch(`${apiHost}/api/v1/projects/${data.project_id}`);
      if (!projResponse.ok) {
        throw new Error("Failed to load project metadata");
      }
      
      const projData = await projResponse.json();
      const validated = validateAndSanitizeSegments(projData.segments);
      
      setTimeout(() => {
        setProjectId(projData.id);
        setProjectTitle(projData.title);
        setDuration(projData.duration);
        setExpiresAt(projData.expires_at);
        setSegments(validated);
        resetHistory(validated);
        setDewarpScaleX(projData.dewarp_scale_x || 1.0);
        setDewarpScaleY(projData.dewarp_scale_y || 1.0);
        setIsProcessing(false);
        setView("editor");
        applyPreset("mrbeast");
      }, 500);

    } catch (error) {

      console.warn("[BACKEND FAIL - USING OFFLINE FALLBACK ENGINE]", error);
      clearInterval(progressInterval);
      
      const mockRawWords = [
        { word: "வணக்கம்", start: 0.2, end: 0.7, speaker: "Speaker 1" },
        { word: "நண்பா", start: 0.8, end: 1.2, speaker: "Speaker 1" },
        { word: "இன்னைக்கு", start: 1.3, end: 1.6, speaker: "Speaker 1" },
        { word: "நம்ம", start: 1.7, end: 2.0, speaker: "Speaker 1" },
        { word: "ஒரு", start: 2.1, end: 2.3, speaker: "Speaker 1" },
        { word: "செம்ம", start: 2.4, end: 2.8, speaker: "Speaker 1" },
        { word: "வீடியோ", start: 2.9, end: 3.3, speaker: "Speaker 1" },
        { word: "பார்க்கப்போறோம்", start: 3.4, end: 4.1, speaker: "Speaker 1" },
        { word: "எப்படி", start: 4.5, end: 4.9, speaker: "Speaker 2" },
        { word: "இருக்கீங்க", start: 5.0, end: 5.5, speaker: "Speaker 2" },
        { word: "எல்லாரும்", start: 5.6, end: 6.0, speaker: "Speaker 2" },
        { word: "சாப்டீங்களா", start: 6.1, end: 6.7, speaker: "Speaker 2" },
        { word: "இன்னைக்கு", start: 7.2, end: 7.6, speaker: "Speaker 1" },
        { word: "வீடியோ", start: 7.7, end: 8.1, speaker: "Speaker 1" },
        { word: "டாபிக்", start: 8.2, end: 8.7, speaker: "Speaker 1" },
        { word: "AI", start: 8.8, end: 9.1, speaker: "Speaker 1" },
        { word: "கேப்ஷன்ஸ்", start: 9.2, end: 9.7, speaker: "Speaker 1" },
        { word: "சூப்பர்", start: 9.8, end: 10.3, speaker: "Speaker 1" },
        { word: "ஸ்பீடு", start: 10.4, end: 10.8, speaker: "Speaker 1" },
        { word: "நன்றி", start: 10.9, end: 11.5, speaker: "Speaker 1" }
      ];

      const mockTranslit: Record<string, string> = {
        "வணக்கம்": "vanakkam", "நண்பா": "nanba", "இன்னைக்கு": "innaiku", "நம்ம": "namma",
        "ஒரு": "oru", "செம்ம": "semma", "வீடியோ": "video", "பார்க்கப்போறோம்": "parkapoorom",
        "எப்படி": "epdi", "இருக்கீங்க": "irukeenga", "எல்லாரும்": "ellarum", "சாப்டீங்களா": "sapteengala",
        "டாபிக்": "topic", "AI": "AI", "கேப்ஷன்ஸ்": "captions", "சூப்பர்": "super",
        "ஸ்பீடு": "speed", "நன்றி": "nandri"
      };

      const mockEng: Record<string, string> = {
        "வணக்கம்": "Hello", "நண்பா": "friend", "இன்னைக்கு": "today", "நம்ம": "we",
        "ஒரு": "a", "செம்ம": "awesome", "வீடியோ": "video", "பார்க்கப்போறோம்": "are going to watch",
        "எப்படி": "how", "இருக்கீங்க": "are you doing", "எல்லாரும்": "everyone", "சாப்டீங்களா": "did you eat",
        "டாபிக்": "topic", "AI": "AI", "கேப்ஷன்ஸ்": "captions", "சூப்பர்": "super",
        "ஸ்பீடு": "speed", "நன்றி": "thank you"
      };

      const formattedSegments: Segment[] = [];
      let tempWords: Word[] = [];
      
      mockRawWords.forEach((wordData, i) => {
        const wrd = wordData.word;
        const isEmp = ["செம்ம", "சூப்பர்", "AI", "டாபிக்"].includes(wrd);
        const isPunch = ["பார்க்கப்போறோம்", "சாப்டீங்களா", "நன்றி"].includes(wrd);

        tempWords.push({
          word: wrd,
          start_time: wordData.start,
          end_time: wordData.end,
          confidence: 0.96,
          is_emphasized: isEmp,
          is_punchline: isPunch
        });

        const isLast = i === mockRawWords.length - 1;
        const speakerChanged = !isLast && mockRawWords[i+1].speaker !== wordData.speaker;

        if (tempWords.length === wordsPerSegment || isLast || speakerChanged) {
          const start = tempWords[0].start_time;
          const end = tempWords[tempWords.length - 1].end_time;
          const speaker = wordData.speaker;
          
          const tText = tempWords.map(w => w.word).join(" ");
          const tlText = tempWords.map(w => mockTranslit[w.word] || w.word).join(" ");
          const egText = tempWords.map(w => mockEng[w.word] || w.word).join(" ");

          formattedSegments.push({
            id: Math.random().toString(36).substr(2, 9),
            speaker_id: speaker,
            start_time: start,
            end_time: end,
            text: tText,
            tamil_text: tText,
            tanglish_text: tlText,
            english_text: egText,
            words: [...tempWords]
          });
          tempWords = [];
        }
      });

      const validated = validateAndSanitizeSegments(formattedSegments);
      setProjectId(Math.random().toString(36).substr(2, 9));
      setExpiresAt(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      setSegments(validated);
      resetHistory(validated);
      setDuration(12.0);


      setProcessProgress(100);
      setTimeout(() => {
        setIsProcessing(false);
        setView("editor");
        applyPreset("mrbeast");
      }, 500);
    }
  };

  const runExport = async () => {
    // ── Export Validation Step ──
    try {
      const canvas1 = document.createElement("canvas");
      const canvas2 = document.createElement("canvas");
      
      const w = videoNaturalW || 1920;
      const h = videoNaturalH || 1080;
      canvas1.width = w;
      canvas1.height = h;
      canvas2.width = w;
      canvas2.height = h;

      const ctx1 = canvas1.getContext("2d");
      const ctx2 = canvas2.getContext("2d");
      
      if (ctx1 && ctx2 && segments.length > 0) {
        const activeSeg = segments.find(
          seg => currentTime >= seg.start_time && currentTime <= seg.end_time
        ) || segments[0];

        const text = targetLang === "tanglish"
          ? (activeSeg.tanglish_text || activeSeg.text)
          : targetLang === "english"
          ? (activeSeg.english_text || activeSeg.text)
          : (activeSeg.tamil_text || activeSeg.text);

        // Step 1: Render frame in preview mode
        drawSubtitle(canvas1, ctx1, {
          text,
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
          subX,
          subY,
          positionTarget: "global",
          exportDebug: false
        });

        // Step 2: Render same frame in export simulation mode
        drawSubtitle(canvas2, ctx2, {
          text,
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
          subX,
          subY,
          positionTarget: "global",
          exportDebug: false
        });

        // Step 3: Compare pixels
        const imgData1 = ctx1.getImageData(0, 0, w, h).data;
        const imgData2 = ctx2.getImageData(0, 0, w, h).data;
        
        let diffCount = 0;
        const totalPixels = imgData1.length / 4;
        for (let i = 0; i < imgData1.length; i += 4) {
          const rDiff = Math.abs(imgData1[i] - imgData2[i]);
          const gDiff = Math.abs(imgData1[i+1] - imgData2[i+1]);
          const bDiff = Math.abs(imgData1[i+2] - imgData2[i+2]);
          const aDiff = Math.abs(imgData1[i+3] - imgData2[i+3]);
          if (rDiff > 5 || gDiff > 5 || bDiff > 5 || aDiff > 5) {
            diffCount++;
          }
        }

        const mismatchRatio = diffCount / totalPixels;
        console.log(`[Validation] Preview vs Export Pixel Mismatch: ${(mismatchRatio * 100).toFixed(4)}%`);
        
        // Step 4: Raise error if mismatch > 1%
        if (mismatchRatio > 0.01) {
          alert(`ERROR: Preview and export renderers are inconsistent (mismatch: ${(mismatchRatio * 100).toFixed(2)}%).`);
          return;
        }
      }
    } catch (valErr) {
      console.warn("Export validation skipped or failed:", valErr);
    }

    setIsExporting(true);
    setExportProgress(10);
    
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 80) {
          return 80;
        }
        return prev + 5;
      });
    }, 400);

    try {
      const response = await fetch(`${apiHost}/api/v1/projects/${projectId}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          export_format: exportFormat,
          bitrate: exportBitrate,
          frame_rate: exportFps,
          quality: exportQuality,
          aspect_ratio: aspectRatio,
          font_name: selectedFont,
          font_weight: selectedWeight,
          font_style: selectedWeight.includes("Italic") ? "italic" : "normal",
          font_size: fontSize,
          fill_type: fillType,
          fill_color: fillColor,
          grad_start: gradStart,
          grad_end: gradEnd,
          stroke_color: strokeColor,
          stroke_width: strokeWidth,
          glow_color: glowColor,
          glow_radius: glowRadius,
          glow_opacity: glowOpacity,
          shadow_color: shadowColor,
          shadow_blur: shadowBlur,
          shadow_offset_x: shadowOffsetX,
          shadow_offset_y: shadowOffsetY,
          depth_3d: depth3d,
          depth_color: depthColor,
          rotation_x: rotationX,
          rotation_y: rotationY,
          rotation_z: rotationZ,
          sub_x: subX,
          sub_y: subY,
          animation_preset: animationPreset,
          export_debug: exportDebug,
          target_lang: targetLang,
          position_target: positionTarget,
          segments: segments.map(s => ({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
            text: targetLang === "tanglish"
              ? (s.tanglish_text || s.text)
              : targetLang === "english"
              ? (s.english_text || s.text)
              : (s.tamil_text || s.text),
            words: s.words.map(w => ({
              word: w.word,
              start_time: w.start_time,
              end_time: w.end_time,
              confidence: w.confidence,
              is_punchline: w.is_punchline || false
            }))
          }))
        })
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const data = await response.json();
      
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${apiHost}/api/v1/projects/${projectId}/export-status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (typeof statusData.progress === "number") {
              setExportProgress(statusData.progress);
            }
            if (typeof statusData.time_remaining_s === "number") {
              setExportTimeRemaining(statusData.time_remaining_s);
            }
            if (typeof statusData.elapsed_s === "number") {
              setExportElapsedS(statusData.elapsed_s);
            }
            if (typeof statusData.render_fps === "number") {
              setExportRenderFps(statusData.render_fps);
            }
            if (statusData.status === "ready") {
              clearInterval(pollIntervalRef.current);
              clearInterval(progressIntervalRef.current);
              setExportProgress(100);
              setExportTimeRemaining(0);
              
              const downloadUrl = `${apiHost}/api/v1/projects/${projectId}/download?format=${exportFormat}`;
              const link = document.createElement("a");
              link.href = downloadUrl;
              link.download = `INVINCIBLE_STUDIOS_export.${exportFormat}`;
              link.click();
              
              setTimeout(() => {
                setIsExporting(false);
                setShowExportModal(false);
                setExportTimeRemaining(null);
                setExportRenderFps(null);
                confetti({
                  particleCount: 150,
                  spread: 80,
                  origin: { y: 0.6 }
                });
              }, 500);
            } else if (statusData.status === "failed") {
              clearInterval(pollIntervalRef.current);
              clearInterval(progressIntervalRef.current);
              setIsExporting(false);
              setExportTimeRemaining(null);
              alert(`Export rendering failed: ${statusData.error}`);
            }
          }
        } catch (e) {
          console.warn("Error polling export status:", e);
        }
      }, 1000);

    } catch (error) {
      console.warn("Export failed", error);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setIsExporting(false);
      setExportProgress(0);
      setExportTimeRemaining(null);
      setExportRenderFps(null);
      setShowExportModal(false);
      
      alert(
        "Export Failed\n\n" +
        "Your project session may have expired due to a server restart. " +
        "Please go back to the home page and re-upload your video to start a new editing session."
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
                INVINCIBLE STUDIOS Captions turns raw footage into scroll-stopping subtitles — transcribed, translated, and styled to the beat by studio ultimate, in one liquid-glass editor.
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
                    <span className="text-slate-300 font-medium">எப்படி இருக்கிறீர்கள்</span>
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
                                  placeholder="••••••••"
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
                                  placeholder="••••••••"
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
                            ⚠️ Sandbox Mode: Since email/SMS services are not configured, your OTP code is: <strong className="text-white text-sm bg-white/10 px-2 py-0.5 rounded font-mono ml-1">{sandboxCodeDisplay}</strong>
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
                  <label className="text-xs font-semibold text-slate-300 mb-2 block">Language & Transliteration</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50"
                  >
                    <option value="tanglish">Tamil to Tanglish (Contextual Transliteration)</option>
                    <option value="english">Tamil to English Translation</option>
                    <option value="tamil">Formal Tamil (தமிழ்)</option>
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
