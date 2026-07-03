import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
// In-memory store shared via global (persists across hot-reloads in dev,
// and within a single serverless instance on Vercel)
// ─────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __projects_db: Record<string, unknown>;
}
if (!global.__projects_db) {
  global.__projects_db = {};
}
const projectsDb = global.__projects_db;

// ─────────────────────────────────────────────
// Tamil → Tanglish phonetic dictionary
// ─────────────────────────────────────────────
const TANGLISH_MAP: Record<string, string> = {
  "வணக்கம்": "vanakkam", "நன்றி": "nandri", "சாப்டீங்களா": "sapteengala",
  "சூப்பர்": "super", "நண்பா": "nanba", "இல்லை": "illa", "ஆமாம்": "ama",
  "செம்ம": "semma", "வீடியோ": "video", "பார்க்கப்போறோம்": "parkapoorom",
  "இன்னைக்கு": "innaiku", "நம்ம": "namma", "ஒரு": "oru", "எல்லாரும்": "ellarum",
  "டாபிக்": "topic", "கேப்ஷன்ஸ்": "captions", "ஸ்பீடு": "speed",
  "என்ன": "enna", "பண்றீங்க": "panreenga", "எப்படி": "epdi",
  "இருக்கீங்க": "irukeenga", "இருக்கேன்": "irukken", "சரி": "sari",
  "வா": "vaa", "போ": "po", "பார்": "paar", "சொல்லு": "sollu",
  "கேளு": "kaelu", "தெரியும்": "theriyum", "தெரியாது": "theriyaathu",
  "மக்கள்": "makkal", "நாடு": "naadu", "ஊர்": "ur",
  "வீடு": "veedu", "அம்மா": "amma", "அப்பா": "appa",
  "அண்ணன்": "annan", "தம்பி": "thambi", "அக்கா": "akka", "தங்கை": "thangai",
  "நண்பன்": "nanban", "காதல்": "kaadhal", "காதலன்": "kaadhalan",
  "பெண்": "penn", "ஆண்": "aan", "குழந்தை": "kuzhandhai",
  "பள்ளி": "palli", "கல்லூரி": "kalluri", "வேலை": "velai",
  "பணம்": "panam", "சாப்பாடு": "saappaadu", "தண்ணீர்": "thanneer",
  "வண்ணம்": "vannam", "புத்தகம்": "puththagam", "திரைப்படம்": "thiraipadam",
  "பாட்டு": "paattu", "ஆட்டம்": "aattam", "விளையாட்டு": "vilaiyaattu",
  "கடை": "kadai", "ரோடு": "rodu", "காரு": "kaaru", "பஸ்": "bus",
  "ட்ரெயின்": "train", "விமானம்": "vimanam", "கடல்": "kadal",
  "மலை": "malai", "மழை": "mazhai", "வெயில்": "veyil",
  "இரவு": "iravu", "பகல்": "pagal", "காலை": "kaalai", "மாலை": "maalai",
  "நேற்று": "naetrru", "இன்று": "indru", "நாளை": "naalai",
  "ஆமா": "aama", "இல்ல": "illa", "ஓக்கே": "okay", "சூப்பர்ப்": "superb",
  "வருகிறேன்": "varugirien", "போகிறேன்": "pogirien",
  "சாப்பிட்டேன்": "saappittaen", "குடித்தேன்": "kuditthaen",
  "பார்த்தேன்": "paarthaen", "கேட்டேன்": "kaettaen",
  "சொன்னேன்": "sonnaen", "வந்தேன்": "vandaen", "போனேன்": "ponaen",
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
    // translation failed — return original
  }
  return text;
}

// ─────────────────────────────────────────────
// Language code mapping
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// POST /api/v1/projects/process
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;
    const wordsPerSegment = parseInt((formData.get("words_per_segment") as string) || "2", 10);
    const consentTraining = (formData.get("consent_training") as string) === "true";
    const sourceLanguage = (formData.get("source_language") as string) || "auto";
    const targetLanguage = (formData.get("target_language") as string) || "tanglish";
    const aspectRatio = (formData.get("aspect_ratio") as string) || "9:16";

    if (!videoFile) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const supportedExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".m4v", ".3gp"];
    const ext = videoFile.name.slice(videoFile.name.lastIndexOf(".")).toLowerCase();
    if (!supportedExts.includes(ext)) {
      return NextResponse.json({ error: `Unsupported video format: ${ext}` }, { status: 400 });
    }

    const projectId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // ── ElevenLabs Scribe STT ────────────────────────────────────────────────
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY || "sk_d02e591bd0b9eb10e5d0bdc4f05803e11de5fb85904f673c";
    const elLang = LANG_MAP[sourceLanguage.toLowerCase()] ?? null;

    let wordsList: Array<{
      word: string;
      start_time: number;
      end_time: number;
      confidence: number;
      is_emphasized: boolean;
      is_punchline: boolean;
    }> = [];

    let duration = 10.0;
    let recognizedText = "";

    console.log(`[ElevenLabs] Sending video directly to Speech-to-Text API (lang=${elLang || "auto"})...`);

    try {
      const sttForm = new FormData();
      // Send the video file directly — ElevenLabs Scribe accepts video files too
      sttForm.append("file", videoFile, videoFile.name);
      sttForm.append("model_id", "scribe_v2");
      if (elLang) sttForm.append("language_code", elLang);

      const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: sttForm,
        signal: AbortSignal.timeout(120000), // 2 min timeout
      });

      if (sttRes.ok) {
        const sttData = await sttRes.json();
        recognizedText = sttData.text || "";
        const elWords = (sttData.words || []).filter(
          (w: { type: string; text: string }) => w.type === "word" && w.text?.trim()
        );

        console.log(`[ElevenLabs] Success! Transcribed ${elWords.length} words.`);

        if (elWords.length > 0) {
          // Derive duration from last word's end time
          const lastWord = elWords[elWords.length - 1];
          duration = Math.max(duration, lastWord.end ?? duration);

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
        }
      } else {
        const errText = await sttRes.text();
        console.error(`[ElevenLabs Error] ${sttRes.status}: ${errText}`);
      }
    } catch (err) {
      console.error(`[ElevenLabs Request Failed] ${err}`);
    }

    // ── Fallback: evenly-distributed words from plain text ───────────────────
    if (wordsList.length === 0 && recognizedText.trim()) {
      const rawWords = recognizedText.trim().split(/\s+/);
      const wordSpan = duration / rawWords.length;
      rawWords.forEach((word, idx) => {
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

    // ── Hard fallback ONLY if STT completely failed ──────────────────────────
    if (wordsList.length === 0) {
      console.warn("[STT] No words transcribed — using empty segment placeholder.");
      recognizedText = "";
      // Return empty segments so the user can add captions manually
    }

    // ── Build segments ───────────────────────────────────────────────────────
    const sourceLangCode = LANG_MAP[sourceLanguage.toLowerCase()] ?? "en";

    const segments: unknown[] = [];
    let tempWords: typeof wordsList = [];

    for (let i = 0; i < wordsList.length; i++) {
      tempWords.push(wordsList[i]);

      if (tempWords.length === wordsPerSegment || i === wordsList.length - 1) {
        const segId = crypto.randomUUID().slice(0, 8);
        const segStart = tempWords[0].start_time;
        const segEnd = tempWords[tempWords.length - 1].end_time;
        const segText = tempWords.map(w => w.word).join(" ");

        // Detect Tamil characters
        const hasTamilChars = /[\u0B80-\u0BFF]/.test(segText);

        let tamilText: string;
        let englishText: string;

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
          targetLanguage === "tanglish" ? tanglishText :
          targetLanguage === "english" ? englishText :
          tamilText;

        segments.push({
          id: segId,
          speaker_id: "Speaker 1",
          start_time: Math.round(segStart * 100) / 100,
          end_time: Math.round(segEnd * 100) / 100,
          text: displayText,
          tamil_text: tamilText,
          tanglish_text: tanglishText,
          english_text: englishText,
          words: tempWords,
        });

        tempWords = [];
      }
    }

    // ── Save project ─────────────────────────────────────────────────────────
    const projectData = {
      id: projectId,
      title: videoFile.name,
      duration: Math.round(duration * 100) / 100,
      words_per_segment: wordsPerSegment,
      consent_training: consentTraining,
      aspect_ratio: aspectRatio,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      dewarp_scale_x: 1.0,
      dewarp_scale_y: 1.0,
      segments,
    };

    projectsDb[projectId] = projectData;

    return NextResponse.json({
      project_id: projectId,
      status: "completed",
      expires_at: expiresAt.toISOString(),
      duration: Math.round(duration * 100) / 100,
      consent_logged: consentTraining,
    });
  } catch (err) {
    console.error("[Process Route Error]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const maxDuration = 300; // 5 minutes for Vercel (Pro plan) — adjust as needed
export const dynamic = "force-dynamic";
