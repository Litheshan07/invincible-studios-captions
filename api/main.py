import os
import uuid
import time
import tempfile
from dotenv import load_dotenv

# Load env file configurations
load_dotenv()
import smtplib
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.request
import urllib.parse
import hashlib
import json

import subprocess
import traceback
import re

# Import speech libraries safely — supports MoviePy v1 and v2
try:
    try:
        # MoviePy v2.x (no moviepy.editor module)
        from moviepy import VideoFileClip
    except ImportError:
        # MoviePy v1.x fallback
        from moviepy.editor import VideoFileClip
    import speech_recognition as sr
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np
    HAS_LIBS = True
except ImportError:
    HAS_LIBS = False

# Resolve FFmpeg binary path (bundled with imageio-ffmpeg if not in PATH)
def get_ffmpeg_path() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"  # fallback: assume it's on PATH

app = FastAPI(
    title="INVINCIBLE STUDIOS Captions API",
    description="SaaS agentic subtitle processing backend powered by studio ultimate",
    version="1.1.0"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory databases
projects_db = {}
otps_db = {}
cleanup_logs = []

USERS_FILE = "users_db.json"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def load_users() -> dict:
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_users(users: dict):
    try:
        with open(USERS_FILE, "w") as f:
            json.dump(users, f, indent=4)
    except Exception as e:
        print(f"[DB ERROR] Failed to save users database: {e}")

def send_sms_otp(phone: str, otp: str) -> bool:
    api_key = os.getenv("TEXTBELT_API_KEY", "textbelt")
    
    try:
        import requests
        url = "https://textbelt.com/text"
        payload = {
            "phone": phone,
            "message": f"Your INVINCIBLE STUDIOS verification code is {otp}. Powered by studio ultimate.",
            "key": api_key
        }
        
        response = requests.post(url, data=payload)
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get("success"):
                print(f"[SMS Textbelt] Successfully sent SMS to {phone}")
                return True
            else:
                print(f"[SMS Textbelt Fail] {res_json.get('error')}")
        else:
            print(f"[SMS Textbelt Error] {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[SMS Textbelt Request Failed] {e}")
            
    # Fallback log output for sandbox testing
    print(f"\n==========================================")
    print(f"[SMS SANDBOX CODE] Code for {phone} is: {otp}")
    print(f"==========================================\n")
    return False

class WordModel(BaseModel):
    word: str
    start_time: float
    end_time: float
    confidence: float
    is_emphasized: bool = False
    is_punchline: bool = False

class SegmentModel(BaseModel):
    id: str
    speaker_id: str
    start_time: float
    end_time: float
    text: str
    tamil_text: Optional[str] = None
    tanglish_text: Optional[str] = None
    english_text: Optional[str] = None
    words: List[WordModel]

class SignUpRequest(BaseModel):
    first_name: str
    second_name: Optional[str] = None
    email: str
    phone: str
    dob: str
    gender: str
    password: str
    confirm_password: str

class LoginRequest(BaseModel):
    login_identifier: str  # email or phone
    password: str

class VerifyOtpRequest(BaseModel):
    identifier: str  # email or phone
    otp: str

class GoogleLoginRequest(BaseModel):
    email: str
    first_name: str
    second_name: Optional[str] = None
    picture: Optional[str] = None

# Extended Tamil→Tanglish phonetic dictionary
TANGlish_MAP = {
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
}

def transliterate_tamil(text: str) -> str:
    """Convert Tamil script words to Tanglish (Tamil phonetics in English letters)."""
    words = text.split()
    transliterated = []
    for w in words:
        punct_match = re.match(r'^([\w\u0B80-\u0BFF]+)([.,!?\"\']*)$', w)
        if punct_match:
            core = punct_match.group(1)
            punct = punct_match.group(2)
            if core in TANGlish_MAP:
                transliterated.append(TANGlish_MAP[core] + punct)
            else:
                transliterated.append(w)  # keep original if no mapping found
        else:
            transliterated.append(w)
    return " ".join(transliterated)

def translate_to_english_free(text: str, source_lang: str = "ta") -> str:
    """
    Translate text to English using Google Translate free (unofficial) endpoint.
    Works for Tamil (ta), Hindi (hi), Telugu (te), Kannada (kn), Malayalam (ml), etc.
    """
    try:
        import requests as _req
        # Google Translate unofficial endpoint (no API key needed for small requests)
        url = "https://translate.googleapis.com/translate_a/single"
        params = {
            "client": "gtx",
            "sl": source_lang,  # source language code
            "tl": "en",          # target: English
            "dt": "t",
            "q": text
        }
        resp = _req.get(url, params=params, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            # Response format: [[[translated, original, ...], ...], ...]
            translated_parts = []
            for chunk in data[0]:
                if chunk and chunk[0]:
                    translated_parts.append(chunk[0])
            result = " ".join(translated_parts).strip()
            if result:
                return result
    except Exception as e:
        print(f"[TRANSLATE] Free Google Translate failed: {e}")
    return text  # fallback: return original text if translation fails

# Background task to clean up uploaded projects after 24 hours
def schedule_project_cleanup():
    now = datetime.utcnow()
    to_delete = []
    for pid, proj in projects_db.items():
        exp_time = datetime.fromisoformat(proj["expires_at"].replace("Z", "+00:00")).replace(tzinfo=None)
        if now > exp_time:
            to_delete.append(pid)
            
    for pid in to_delete:
        # Delete local copy if saved
        if "local_path" in projects_db[pid] and os.path.exists(projects_db[pid]["local_path"]):
            try:
                os.remove(projects_db[pid]["local_path"])
            except Exception:
                pass
        del projects_db[pid]
        cleanup_logs.append(f"Purged project {pid} at {now.isoformat()}")

def send_email_otp_raw(email: str, name: str, otp: str) -> bool:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    subject = f"{otp} is your INVINCIBLE STUDIOS verification code"
    body = f"""
    <html>
      <body style="font-family: sans-serif; background-color: #030308; color: #f8fafc; padding: 40px; border-radius: 16px; max-width: 500px; margin: auto; border: 1px solid rgba(255,255,255,0.08);">
        <h2 style="color: #f97316; text-align: center; margin-bottom: 20px; font-weight: 800; letter-spacing: -0.5px;">INVINCIBLE STUDIOS</h2>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">Hi {name},</p>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">Use the verification code below to log in to <strong>INVINCIBLE STUDIOS Captions</strong>. This code is powered by the <strong>studio ultimate</strong> AI security network:</p>
        <div style="font-size: 36px; font-weight: bold; text-align: center; letter-spacing: 8px; color: #ffffff; padding: 20px; margin: 30px 0; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-family: monospace;">
          {otp}
        </div>
        <p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 40px; line-height: 1.4;">
          This code will expire in 10 minutes. If you did not request this email, you can safely ignore it.
        </p>
      </body>
    </html>
    """

    sent = False
    if smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"INVINCIBLE STUDIOS Captions <{smtp_user}>"
            msg["To"] = email
            msg.attach(MIMEText(body, "html"))

            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, email, msg.as_string())
            server.quit()
            sent = True
        except Exception as e:
            print(f"[SMTP ERROR] Failed to send email via SMTP: {e}")

    if not sent:
        print(f"\n==========================================")
        print(f"[SMTP SANDBOX CODE] Code for {email} is: {otp}")
        print(f"==========================================\n")
    return sent

@app.post("/api/v1/auth/signup")
async def signup(request: SignUpRequest):
    if request.password != request.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
        
    if not request.phone.startswith("+"):
        raise HTTPException(
            status_code=400,
            detail="Phone number must include country code starting with '+' (e.g. +919876543210 or +15550000000)."
        )
        
    users = load_users()
    if request.email in users:
        raise HTTPException(status_code=400, detail="Account with this Email already exists.")
    for u in users.values():
        if u.get("phone") == request.phone:
            raise HTTPException(status_code=400, detail="Account with this Phone Number already exists.")
            
    users[request.email] = {
        "email": request.email,
        "phone": request.phone,
        "first_name": request.first_name,
        "second_name": request.second_name,
        "dob": request.dob,
        "gender": request.gender,
        "password_hash": hash_password(request.password)
    }
    save_users(users)
    
    otp = str(uuid.uuid4().int)[:6]
    otps_db[request.email] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }
    
    send_email_otp_raw(request.email, request.first_name, otp)
    send_sms_otp(request.phone, otp)
    
    # Return sandbox_otp if SMTP and Twilio are not fully configured
    sandbox_otp = None
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not (smtp_user and smtp_pass) or not (account_sid and auth_token):
        sandbox_otp = otp
        
    return {
        "status": "success",
        "message": "Account created. Verification code sent.",
        "identifier": request.email,
        "sandbox_otp": sandbox_otp
    }

@app.post("/api/v1/auth/login")
async def login(request: LoginRequest):
    users = load_users()
    user = None
    
    if request.login_identifier in users:
        user = users[request.login_identifier]
    else:
        for u in users.values():
            if u.get("phone") == request.login_identifier:
                user = u
                break
                
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email/phone or password.")
        
    if user.get("password_hash") != hash_password(request.password):
        raise HTTPException(status_code=400, detail="Invalid email/phone or password.")
        
    otp = str(uuid.uuid4().int)[:6]
    otps_db[user["email"]] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }
    
    send_email_otp_raw(user["email"], user["first_name"], otp)
    send_sms_otp(user["phone"], otp)
    
    # Return sandbox_otp if SMTP and Twilio are not fully configured
    sandbox_otp = None
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not (smtp_user and smtp_pass) or not (account_sid and auth_token):
        sandbox_otp = otp
        
    return {
        "status": "success",
        "message": "Password verified. Verification code sent.",
        "identifier": user["email"],
        "sandbox_otp": sandbox_otp
    }

@app.post("/api/v1/auth/verify-otp")
async def verify_otp(request: VerifyOtpRequest):
    users = load_users()
    
    email_key = request.identifier
    if request.identifier not in otps_db:
        for u in users.values():
            if u.get("phone") == request.identifier:
                email_key = u["email"]
                break
                
    if email_key not in otps_db:
        raise HTTPException(status_code=400, detail="No verification code requested for this user.")
        
    stored = otps_db[email_key]
    if datetime.utcnow() > stored["expires_at"]:
        raise HTTPException(status_code=400, detail="Verification code has expired.")
        
    if stored["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
        
    del otps_db[email_key]
    user = users.get(email_key, {})
    if not user:
        raise HTTPException(status_code=400, detail="User account not found. Please register first.")
        
    return {
        "status": "success",
        "message": "Verified successfully.",
        "user": {
            "first_name": user.get("first_name", "Creator"),
            "second_name": user.get("second_name", ""),
            "email": user.get("email", ""),
            "phone": user.get("phone", ""),
            "dob": user.get("dob", ""),
            "gender": user.get("gender", "")
        }
    }

@app.post("/api/v1/auth/google-login")
async def google_login(request: GoogleLoginRequest):
    users = load_users()
    
    if request.email not in users:
        # Register new Google user in DB
        users[request.email] = {
            "email": request.email,
            "phone": "",
            "first_name": request.first_name,
            "second_name": request.second_name,
            "dob": "",
            "gender": "",
            "picture": request.picture,
            "password_hash": "", # Social sign-in
            "social_provider": "google"
        }
        save_users(users)
    else:
        # Update details
        if request.picture:
            users[request.email]["picture"] = request.picture
            save_users(users)
            
    user = users[request.email]
    return {
        "status": "success",
        "message": "Social login saved successfully.",
        "user": {
            "first_name": user.get("first_name", "Google User"),
            "second_name": user.get("second_name", ""),
            "email": request.email,
            "phone": user.get("phone", ""),
            "dob": user.get("dob", ""),
            "gender": user.get("gender", "")
        }
    }

def detect_dewarp_parameters(video_path: str) -> tuple[float, float]:
    """
    AI-based dewarping and aspect ratio correction parameter detector.
    Analyzes sampled frames using face aspect ratio probing and contour fallback
    to identify horizontal/vertical elongation and calculate correction scale factors.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return 1.0, 1.0

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 1.0, 1.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        cap.release()
        return 1.0, 1.0

    # Sample up to 5 frames
    sample_indices = [int(total_frames * p) for p in [0.1, 0.3, 0.5, 0.7, 0.9]]
    sample_frames = []

    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret and frame is not None:
            sample_frames.append(frame)

    cap.release()

    if not sample_frames:
        return 1.0, 1.0

    # Initialize Haar Cascade face detector
    face_cascade = None
    try:
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        if os.path.exists(cascade_path):
            face_cascade = cv2.CascadeClassifier(cascade_path)
    except Exception as e:
        print(f"[DEWARP] Failed to load cascade classifier: {e}")

    # 1. Face Probe Grid Search
    # We test a range of scaling/aspect ratios to see which one restores normal square face shapes
    best_aspect_ratio = 1.0
    max_score = 0
    ratio_candidates = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]

    if face_cascade is not None and not face_cascade.empty():
        ratio_scores = {r: 0 for r in ratio_candidates}
        for frame in sample_frames:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Resize image to smaller height for faster processing
            h, w = gray.shape[:2]
            target_h = 240
            scale_factor = target_h / h
            gray_small = cv2.resize(gray, (int(w * scale_factor), target_h))
            sh, sw = gray_small.shape[:2]

            for r in ratio_candidates:
                # Apply stretch factor r to width
                resized = cv2.resize(gray_small, (int(sw * r), sh))
                faces = face_cascade.detectMultiScale(resized, 1.1, 2)
                # Score based on number and size of faces detected
                score = 0
                for (fx, fy, fw, fh) in faces:
                    score += fw * fh # area of detected face
                ratio_scores[r] += score

        best_ratio = max(ratio_scores, key=ratio_scores.get)
        if ratio_scores[best_ratio] > 0:
            print(f"[DEWARP] Face probe detected best aspect ratio adjustment factor: {best_ratio}")
            if best_ratio > 1.05:
                # Vertically stretched (narrow faces), so we scale height down to keep width.
                return 1.0, 1.0 / best_ratio
            elif best_ratio < 0.95:
                # Horizontally stretched (fat faces), so we scale width down to keep height.
                return best_ratio, 1.0
            return 1.0, 1.0

    # 2. Contour Fallback Probe
    # We find contours, fit ellipses, and look at the aspect ratios of vertical/horizontal ellipses
    ellipse_ratios = []
    for frame in sample_frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Apply slight blur and threshold
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        
        for c in contours:
            area = cv2.contourArea(c)
            if 500 <= area <= 20000 and len(c) >= 5:
                try:
                    (cx, cy), (ma, MA), angle = cv2.fitEllipse(c)
                    if ma > 0:
                        ratio = MA / ma
                        is_vertical = (angle < 20 or angle > 160)
                        is_horizontal = (70 < angle < 110)
                        if (is_vertical or is_horizontal) and 1.1 <= ratio <= 2.0:
                            ellipse_ratios.append((ratio, is_vertical))
                except Exception:
                    pass

    if ellipse_ratios:
        # Calculate median ratio of vertical elongation vs horizontal elongation
        vertical_ratios = [r for r, is_v in ellipse_ratios if is_v]
        horizontal_ratios = [r for r, is_v in ellipse_ratios if not is_v]
        
        print(f"[DEWARP] Contour probe found {len(vertical_ratios)} vertical, {len(horizontal_ratios)} horizontal ellipses.")
        if len(vertical_ratios) > len(horizontal_ratios) and len(vertical_ratios) >= 3:
            median_v = float(np.median(vertical_ratios))
            print(f"[DEWARP] Vertical stretching detected from ellipses (median ratio: {median_v:.2f})")
            correction = min(1.8, max(1.0, median_v))
            return 1.0, 1.0 / correction
        elif len(horizontal_ratios) > len(vertical_ratios) and len(horizontal_ratios) >= 3:
            median_h = float(np.median(horizontal_ratios))
            print(f"[DEWARP] Horizontal stretching detected from ellipses (median ratio: {median_h:.2f})")
            correction = min(1.8, max(1.0, median_h))
            return 1.0 / correction, 1.0

    print("[DEWARP] Probes yielded no elongation. Defaulting to 1.0 scale.")
    return 1.0, 1.0

@app.post("/api/v1/projects/process")
async def process_media(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    words_per_segment: int = Form(2),
    consent_training: bool = Form(False),
    source_language: str = Form("auto"),
    target_language: str = Form("tanglish"),
    aspect_ratio: str = Form("9:16")
):
    filename = video.filename
    file_ext = os.path.splitext(filename)[1].lower()
    
    supported_formats = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".m4v", ".3gp"]
    if file_ext not in supported_formats:
        raise HTTPException(status_code=400, detail=f"Unsupported video format: {file_ext}")
        
    project_id = str(uuid.uuid4())
    created_at = datetime.utcnow()
    expires_at = created_at + timedelta(hours=24)

    # Setup temp path to save uploaded video
    temp_dir = tempfile.gettempdir()
    video_path = os.path.join(temp_dir, f"{project_id}{file_ext}")
    wav_path = os.path.join(temp_dir, f"{project_id}.wav")

    # Save uploaded file
    with open(video_path, "wb") as f:
        f.write(await video.read())

    # Run dewarp detection
    dewarp_x, dewarp_y = 1.0, 1.0
    try:
        print(f"[DEWARP] Analyzing video stretch ratio for file: {filename}")
        dewarp_x, dewarp_y = detect_dewarp_parameters(video_path)
        print(f"[DEWARP] Detected dewarp correction factors: scale_x={dewarp_x:.2f}, scale_y={dewarp_y:.2f}")
    except Exception as dewarp_err:
        print(f"[DEWARP ERROR] Failed to analyze dewarp parameters: {dewarp_err}")

    # Speech Recognition Engine
    recognized_text = ""
    duration = 10.0 # Default fallback duration
    words_list = [] # Store parsed WordModel list
    
    if HAS_LIBS:
        try:
            # Extract audio track
            clip = VideoFileClip(video_path)
            duration = clip.duration
            if clip.audio is not None:
                try:
                    clip.audio.write_audiofile(wav_path, fps=16000, codec='pcm_s16le', nbytes=2, logger=None)
                except Exception as audio_err:
                    print(f"[STT] Audio write failed: {audio_err}")
            clip.close()
            
            # 1. Attempt OpenRouter Audio Transcription
            openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
            if openrouter_key:
                try:
                    import requests
                    import base64
                    with open(wav_path, "rb") as audio_file:
                        audio_b64 = base64.b64encode(audio_file.read()).decode("utf-8")
                    
                    url = "https://openrouter.ai/api/v1/audio/transcriptions"
                    headers = {
                        "Authorization": f"Bearer {openrouter_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": "openai/whisper-1",
                        "audio": audio_b64,
                        "format": "wav"
                    }
                    print("[OpenRouter STT] Transcribing audio...")
                    response = requests.post(url, json=payload, headers=headers, timeout=60)
                    if response.status_code == 200:
                        res_data = response.json()
                        recognized_text = res_data.get("text", "")
                        print(f"[OpenRouter STT] Transcribed: {recognized_text[:60]}...")
                        
                        raw_words = recognized_text.split()
                        total_words = len(raw_words)
                        if total_words > 0:
                            word_span = duration / total_words
                            for idx, word in enumerate(raw_words):
                                start = idx * word_span
                                end = start + word_span
                                
                                is_emp = word in ["செம்ம", "சூப்பர்", "AI", "டாபிக்", "important", "best", "viral"]
                                is_punch = word in ["பார்க்கப்போறோம்", "சாப்டீங்களா", "நன்றி", "video", "subscribe"]
                                
                                words_list.append(WordModel(
                                    word=word,
                                    start_time=round(start, 2),
                                    end_time=round(end, 2),
                                    confidence=0.97,
                                    is_emphasized=is_emp,
                                    is_punchline=is_punch
                                ))
                    else:
                        print(f"[OpenRouter STT Error] {response.status_code}: {response.text}")
                except Exception as or_err:
                    print(f"[OpenRouter STT Request Failed] {or_err}")

            # 2. Attempt ElevenLabs Scribe STT with language hint
            if not words_list:
                try:
                    import requests
                    url = "https://api.elevenlabs.io/v1/speech-to-text"
                    api_key = "sk_0c26c9ab908ad30bb8446ac621dcc38964974e63c4b3bd78"

                    # Map source_language to BCP-47 language code for ElevenLabs
                    lang_map = {
                        "tamil": "ta", "ta": "ta",
                        "hindi": "hi", "hi": "hi",
                        "telugu": "te", "te": "te",
                        "kannada": "kn", "kn": "kn",
                        "malayalam": "ml", "ml": "ml",
                        "bengali": "bn", "bn": "bn",
                        "marathi": "mr", "mr": "mr",
                        "gujarati": "gu", "gu": "gu",
                        "punjabi": "pa", "pa": "pa",
                        "urdu": "ur", "ur": "ur",
                        "english": "en", "en": "en",
                    }
                    el_lang = lang_map.get(source_language.lower(), None)  # None = auto-detect

                    with open(wav_path, "rb") as audio_file:
                        files = {
                            "file": (os.path.basename(wav_path), audio_file, "audio/wav")
                        }
                        data_payload = {"model_id": "scribe_v2"}
                        if el_lang:
                            data_payload["language_code"] = el_lang
                        headers = {"xi-api-key": api_key}

                        print(f"[ElevenLabs] Sending request to Speech-to-Text API (lang={el_lang or 'auto'})...")
                        response = requests.post(url, headers=headers, files=files, data=data_payload)

                    if response.status_code == 200:
                        res_data = response.json()
                        recognized_text = res_data.get("text", "")
                        el_words = [w for w in res_data.get("words", []) if w.get("type") == "word" and w.get("text", "").strip()]
                        print(f"[ElevenLabs] Success! Transcribed {len(el_words)} words in lang={el_lang or 'auto'}.")

                        for w in el_words:
                            word_text = w.get("text", "").strip()
                            start = w.get("start", 0.0)
                            end = w.get("end", 0.0)

                            is_emp = len(word_text) > 5
                            is_punch = word_text.endswith(("!", "?"))

                            words_list.append(WordModel(
                                word=word_text,
                                start_time=round(start, 2),
                                end_time=round(end, 2),
                                confidence=0.98,
                                is_emphasized=is_emp,
                                is_punchline=is_punch
                            ))
                    else:
                        print(f"[ElevenLabs Error] {response.status_code}: {response.text}")
                except Exception as el_err:
                    print(f"[ElevenLabs Request Failed] {el_err}")
                
            # 2. Fallback to local Google Speech Recognition if ElevenLabs didn't yield words
            if not words_list:
                print("[STT] Falling back to local SpeechRecognition...")
                recognizer = sr.Recognizer()
                with sr.AudioFile(wav_path) as source:
                    audio_data = recognizer.record(source)
                    
                lang = "ta-IN" if source_language in ["tamil", "ta", "auto"] else "en-US"
                try:
                    recognized_text = recognizer.recognize_google(audio_data, language=lang)
                except Exception:
                    # Fallback to English
                    recognized_text = recognizer.recognize_google(audio_data, language="en-US")
                
                # Format raw words chronologically
                raw_words = recognized_text.split()
                total_words = len(raw_words)
                if total_words > 0:
                    word_span = duration / total_words
                    for idx, word in enumerate(raw_words):
                        start = idx * word_span
                        end = start + word_span
                        
                        is_emp = word in ["செம்ம", "சூப்பர்", "AI", "டாபிக்", "important", "best", "viral"]
                        is_punch = word in ["பார்க்கப்போறோம்", "சாப்டீங்களா", "நன்றி", "video", "subscribe"]
                        
                        words_list.append(WordModel(
                            word=word,
                            start_time=round(start, 2),
                            end_time=round(end, 2),
                            confidence=0.96,
                            is_emphasized=is_emp,
                            is_punchline=is_punch
                        ))
        except Exception as err:
            print(f"[TRANSCRIPTION FAILED] falling back to dummy speech: {err}")
        finally:
            # Clean up temp WAV file
            if os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass
                    
    # Fallback to default captions if all Speech Recognition engines fail
    if not recognized_text.strip() and not words_list:
        print("[STT] No words transcribed. Creating fallback subtitle segment.")
        recognized_text = "வணக்கம்! AI கேப்ஷன்ஸ்-க்கு வரவேற்கிறோம்."
        words_list = [
            WordModel(
                word="வணக்கம்!",
                start_time=0.0,
                end_time=round(max(0.5, duration / 2), 2),
                confidence=1.0,
                is_emphasized=True
            ),
            WordModel(
                word="AI",
                start_time=round(max(0.5, duration / 2), 2),
                end_time=round(duration, 2),
                confidence=1.0,
                is_emphasized=True
            ),
            WordModel(
                word="கேப்ஷன்ஸ்-க்கு",
                start_time=round(max(0.5, duration / 2), 2),
                end_time=round(duration, 2),
                confidence=1.0,
                is_emphasized=False
            ),
            WordModel(
                word="வரவேற்கிறோம்.",
                start_time=round(max(0.5, duration / 2), 2),
                end_time=round(duration, 2),
                confidence=1.0,
                is_emphasized=False
            )
        ]

    # Alignment and Chunking Algorithm (Word-by-word)
    segments = []
    if words_list:
        temp_words = []
        for idx, word_obj in enumerate(words_list):
            temp_words.append(word_obj)
            
            # Chunk words based on requested limit
            if len(temp_words) == words_per_segment or idx == len(words_list) - 1:
                seg_id = str(uuid.uuid4())[:8]
                seg_start = temp_words[0].start_time
                seg_end = temp_words[-1].end_time
                seg_text = " ".join([w.word for w in temp_words])
                
                # Dynamic translation / transliteration
                original_text = seg_text
                tamil_text = seg_text  # raw transcribed text (could be Tamil or any language)

                # Tanglish: try to phonetically map Tamil words; keep others as-is
                tanglish_text = transliterate_tamil(seg_text)

                # English translation: call Google Translate for non-English source audio
                source_lang_code = {
                    "tamil": "ta", "ta": "ta",
                    "hindi": "hi", "hi": "hi",
                    "telugu": "te", "te": "te",
                    "kannada": "kn", "kn": "kn",
                    "malayalam": "ml", "ml": "ml",
                    "bengali": "bn", "bengali": "bn",
                    "marathi": "mr", "mr": "mr",
                    "gujarati": "gu", "gu": "gu",
                    "punjabi": "pa", "pa": "pa",
                    "urdu": "ur", "ur": "ur",
                }.get(source_language.lower(), None)

                english_text = seg_text  # default: same as original
                if source_lang_code and source_lang_code != "en" and seg_text.strip():
                    english_text = translate_to_english_free(seg_text, source_lang_code)

                segments.append(SegmentModel(
                    id=seg_id,
                    speaker_id="Speaker 1",
                    start_time=round(seg_start, 2),
                    end_time=round(seg_end, 2),
                    text=tanglish_text if target_language == "tanglish" else (
                        english_text if target_language == "english" else tamil_text
                    ),
                    tamil_text=tamil_text,
                    tanglish_text=tanglish_text,
                    english_text=english_text,
                    words=temp_words
                ))
                temp_words = []

    project_data = {
        "id": project_id,
        "title": filename,
        "duration": round(duration, 2),
        "words_per_segment": words_per_segment,
        "consent_training": consent_training,
        "aspect_ratio": aspect_ratio,
        "created_at": created_at.isoformat() + "Z",
        "expires_at": expires_at.isoformat() + "Z",
        "local_path": video_path,
        "dewarp_scale_x": dewarp_x,
        "dewarp_scale_y": dewarp_y,
        "segments": [seg.dict() for seg in segments]
    }
    
    projects_db[project_id] = project_data
    background_tasks.add_task(schedule_project_cleanup)
    
    return {
        "project_id": project_id,
        "status": "completed",
        "expires_at": expires_at.isoformat() + "Z",
        "duration": round(duration, 2),
        "consent_logged": consent_training
    }

@app.get("/api/v1/projects/{project_id}")
async def get_project(project_id: str):
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found or expired after 24 hours")
    return projects_db[project_id]

class ExportWordModel(BaseModel):
    word: str
    start_time: float
    end_time: float
    confidence: Optional[float] = 1.0
    is_punchline: Optional[bool] = False

class ExportSegmentModel(BaseModel):
    id: Optional[str] = None
    start_time: float
    end_time: float
    text: str
    words: Optional[List[ExportWordModel]] = None

class ExportRequestModel(BaseModel):
    export_format: str = "mp4"
    bitrate: str = "5m"
    frame_rate: int = 30
    quality: str = "1080p"
    aspect_ratio: str = "16:9"
    font_name: str = "Inter"
    font_weight: str = "Regular"
    font_style: str = "normal"
    font_size: int = 32
    fill_type: str = "solid"
    fill_color: str = "#ffffff"
    grad_start: Optional[str] = "#ffffff"
    grad_end: Optional[str] = "#ffffff"
    stroke_color: str = "#000000"
    stroke_width: int = 2
    glow_color: Optional[str] = "#a855f7"
    glow_radius: Optional[int] = 0
    glow_opacity: Optional[float] = 1.0
    shadow_color: Optional[str] = "#000000"
    shadow_blur: Optional[int] = 0
    shadow_offset_x: Optional[int] = 0
    shadow_offset_y: Optional[int] = 0
    depth_3d: Optional[int] = 0
    depth_color: Optional[str] = "#000000"
    rotation_x: Optional[int] = 0
    rotation_y: Optional[int] = 0
    rotation_z: Optional[int] = 0
    sub_x: float = 0.0
    sub_y: float = 0.0
    animation_preset: Optional[str] = "none"
    export_debug: Optional[bool] = False
    target_lang: Optional[str] = "english"
    position_target: str = "global"
    segments: List[ExportSegmentModel] = []

def seconds_to_srt_time(seconds: float) -> str:
    """Convert float seconds to SRT timestamp format HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def build_srt_content(segments: list) -> str:
    """Generate SRT subtitle file content from segment list."""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = seconds_to_srt_time(seg["start_time"])
        end = seconds_to_srt_time(seg["end_time"])
        text = seg["text"].strip()
        if text:
            lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(lines)

def download_tamil_font_if_missing() -> str | None:
    """Download NotoSansTamil font for Tamil script rendering."""
    try:
        temp_dir = tempfile.gettempdir()
        font_path = os.path.join(temp_dir, "NotoSansTamil-Bold.ttf")
        if not os.path.exists(font_path):
            url = "https://github.com/google/fonts/raw/main/ofl/notosanstamil/NotoSansTamil-Bold.ttf"
            urllib.request.urlretrieve(url, font_path)
            print("[FONT] Downloaded NotoSansTamil-Bold.ttf successfully")
        return font_path
    except Exception as e:
        print(f"[FONT] Download failed: {e}")
        return None

def find_best_font_for_text(text: str, font_size: int) -> str | None:
    """Find the best available font file that can render the given text."""
    # Tamil script range check
    has_tamil = any('\u0B80' <= c <= '\u0BFF' for c in text)
    # Indian language scripts
    has_devanagari = any('\u0900' <= c <= '\u097F' for c in text)
    has_other_indic = any('\u0C00' <= c <= '\u0DFF' for c in text)

    candidates = []
    if has_tamil:
        candidates.append(download_tamil_font_if_missing())
        candidates += [
            "C:\\Windows\\Fonts\\NotoSansTamil-Bold.ttf",
        ]
    if has_devanagari or has_other_indic:
        candidates += [
            "C:\\Windows\\Fonts\\NotoSansDevanagari-Bold.ttf",
            "C:\\Windows\\Fonts\\Mangal.ttf",
        ]
    # Universal fallbacks
    candidates += [
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeui.ttf",
        "C:\\Windows\\Fonts\\tahoma.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    from PIL import ImageFont as _IF
    for fp in candidates:
        if fp and os.path.exists(fp):
            try:
                _IF.truetype(fp, font_size)
                return fp
            except Exception:
                pass
    return None

def upload_to_telegram(file_path: str) -> str:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    
    if not token:
        print("[TELEGRAM STORAGE] No bot token configured.")
        return None
        
    # Auto-discover chat_id if not explicitly set
    if not chat_id:
        try:
            import requests
            resp = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=5).json()
            if resp.get("ok"):
                updates = resp.get("result", [])
                if updates:
                    last_update = updates[-1]
                    if "message" in last_update:
                        chat_id = last_update["message"]["chat"]["id"]
                    elif "channel_post" in last_update:
                        chat_id = last_update["channel_post"]["chat"]["id"]
        except Exception as e:
            print(f"[TELEGRAM STORAGE] Auto-discovery of chat ID failed: {e}")

    if not chat_id:
        print("[TELEGRAM STORAGE] No chat ID found. Please send a message to the bot first or configure TELEGRAM_CHAT_ID.")
        return None

    print(f"[TELEGRAM STORAGE] Uploading {file_path} to Telegram chat {chat_id}...")
    try:
        import requests
        with open(file_path, "rb") as f:
            files = {"document": f}
            data = {"chat_id": chat_id}
            resp = requests.post(f"https://api.telegram.org/bot{token}/sendDocument", files=files, data=data, timeout=60).json()
            
        if not resp.get("ok"):
            print(f"[TELEGRAM STORAGE] Send document failed: {resp.get('description')}")
            return None
            
        file_id = resp["result"]["document"]["file_id"]
        
        path_resp = requests.get(f"https://api.telegram.org/bot{token}/getFile", params={"file_id": file_id}, timeout=10).json()
        if not path_resp.get("ok"):
            print(f"[TELEGRAM STORAGE] Get file path failed: {path_resp.get('description')}")
            return None
            
        file_path_tg = path_resp["result"]["file_path"]
        download_url = f"https://api.telegram.org/file/bot{token}/{file_path_tg}"
        print(f"[TELEGRAM STORAGE] Upload successful! URL: {download_url}")
        return download_url
    except Exception as e:
        print(f"[TELEGRAM STORAGE] Upload failed: {e}")
        return None

def run_burn_subtitles(
    project_id: str,
    input_path: str,
    output_path: str,
    segments: list,
    font_name: str,
    font_size: int,
    fill_color: str,
    stroke_color: str,
    stroke_width: int,
    x_offset: float,
    y_offset: float,
    fps: int,
    bitrate: str,
    resolution: str,
    aspect_ratio: str = "16:9",
    style_params: dict = None
):
    """
    Burns subtitles into the video using a unified Canvas rendering engine.
    This spawns a persistent Node process running render_subtitle_server.js
    and pipes rendering commands, reading back raw RGBA pixel arrays.
    """
    import time as _time
    import struct
    _start_ts = _time.time()
    import tempfile
    temp_dir = tempfile.gettempdir()

    # Populate style_params if not present (for backward compatibility)
    if style_params is None:
        style_params = {
            "font_name": font_name,
            "font_size": font_size,
            "fill_color": fill_color,
            "stroke_color": stroke_color,
            "stroke_width": stroke_width,
            "sub_x": x_offset,
            "sub_y": y_offset,
            "fill_type": "solid",
            "font_weight": "Regular",
            "font_style": "normal",
            "glow_radius": 0,
            "shadow_blur": 0,
            "depth_3d": 0,
            "export_debug": False,
            "target_lang": "english"
        }

    node_proc = None
    try:
        projects_db[project_id]["export_status"] = "rendering"
        projects_db[project_id]["export_progress"] = 2
        projects_db[project_id]["export_start_time"] = _start_ts
        projects_db[project_id]["export_frames_done"] = 0
        projects_db[project_id]["export_total_frames"] = 1
        projects_db[project_id]["time_remaining_s"] = None

        ffmpeg_exe = get_ffmpeg_path()

        # ── Determine output canvas dimensions ──────────────────────────────
        base_long = {"720p": 1280, "4k": 3840}.get(resolution, 1920)
        ar_map = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1), "4:5": (4, 5)}
        ar_w, ar_h = ar_map.get(aspect_ratio, (16, 9))
        if ar_w >= ar_h:
            out_w, out_h = base_long, int(round(base_long * ar_h / ar_w))
        else:
            out_h, out_w = base_long, int(round(base_long * ar_w / ar_h))
        # Ensure even dimensions for H.264
        out_w += out_w % 2
        out_h += out_h % 2
        print(f"[EXPORT] Canvas: {out_w}x{out_h}  AR: {aspect_ratio}  Res: {resolution}")

        # ── Spawn persistent Node.js render server ───────────────────────────
        node_exe = "node"
        node_script = os.path.join(os.path.dirname(__file__), "render_subtitle_server.js")
        print(f"[EXPORT] Spawning Node rendering server: {node_exe} {node_script}")
        node_proc = subprocess.Popen(
            [node_exe, node_script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None  # Allow console.error logging directly to uvicorn console
        )

        # ── Get video properties via FFprobe ─────────────────────────────────
        probe_cmd = [
            ffmpeg_exe.replace("ffmpeg", "ffprobe") if os.path.exists(ffmpeg_exe.replace("ffmpeg", "ffprobe"))
            else ffmpeg_exe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-of", "json",
            input_path
        ]
        src_info = {"width": 1920, "height": 1080, "duration": 10.0}
        try:
            import json as _json
            if "ffprobe" in probe_cmd[0]:
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=15)
                if probe_result.returncode == 0:
                    pdata = _json.loads(probe_result.stdout)
                    s = pdata.get("streams", [{}])[0]
                    src_info["width"] = int(s.get("width", 1920))
                    src_info["height"] = int(s.get("height", 1080))
        except Exception as pe:
            print(f"[EXPORT] ffprobe skipped: {pe}")

        # Get duration via MoviePy
        src_duration = 10.0
        try:
            clip = VideoFileClip(input_path)
            src_duration = clip.duration
            has_audio = clip.audio is not None
            src_w = clip.w
            src_h = clip.h
            clip.close()
        except Exception as clip_err:
            print(f"[EXPORT] MoviePy clip read failed: {clip_err}")
            src_duration = 10.0
            has_audio = False
            src_w = src_info["width"]
            src_h = src_info["height"]

        total_frames = max(1, int(src_duration * fps))
        projects_db[project_id]["export_total_frames"] = total_frames
        projects_db[project_id]["export_progress"] = 5

        # ── Dewarp correction factors ────────────────────────────────────────
        dewarp_x = projects_db[project_id].get("dewarp_scale_x", 1.0)
        dewarp_y = projects_db[project_id].get("dewarp_scale_y", 1.0)

        # ── Subtitle renderer using Node process ──────────────────────────────
        def render_frame_with_subtitle(raw_frame_rgb: np.ndarray, t: float, canvas_cache: np.ndarray = None) -> np.ndarray:
            if dewarp_x != 1.0 or dewarp_y != 1.0:
                try:
                    import cv2
                    dw = int(raw_frame_rgb.shape[1] * dewarp_x)
                    dh = int(raw_frame_rgb.shape[0] * dewarp_y)
                    raw_frame_rgb = cv2.resize(raw_frame_rgb, (dw, dh), interpolation=cv2.INTER_LINEAR)
                except ImportError:
                    pass

            fh, fw = raw_frame_rgb.shape[:2]
            scale_fac = min(out_w / fw, out_h / fh)
            nw, nh = int(fw * scale_fac), int(fh * scale_fac)
            try:
                import cv2
                interp = cv2.INTER_AREA if scale_fac < 1.0 else cv2.INTER_LINEAR
                scaled = cv2.resize(raw_frame_rgb, (nw, nh), interpolation=interp)
            except ImportError:
                from PIL import Image as _Im
                scaled = np.array(_Im.fromarray(raw_frame_rgb).resize((nw, nh), _Im.BILINEAR))

            if canvas_cache is not None:
                canvas_cache.fill(0)
                canvas = canvas_cache
            else:
                canvas = np.zeros((out_h, out_w, 3), dtype=np.uint8)

            px = (out_w - nw) // 2
            py = (out_h - nh) // 2
            canvas[py:py+nh, px:px+nw] = scaled

            # Find active subtitle segment
            active_text = ""
            active_words = []
            for seg in segments:
                if seg["start_time"] <= t <= seg["end_time"]:
                    active_text = seg["text"].strip()
                    active_words = seg.get("words", [])
                    break

            if not active_text:
                return canvas

            # Construct drawing options
            draw_opts = {
                "text": active_text,
                "words": active_words,
                "currentTime": t,
                "targetLang": style_params.get("target_lang", "english"),
                "selectedFont": style_params.get("font_name", "Inter"),
                "selectedWeight": style_params.get("font_weight", "Regular"),
                "fontSize": style_params.get("font_size", 32),
                "fillType": style_params.get("fill_type", "solid"),
                "fillColor": style_params.get("fill_color", "#ffffff"),
                "gradStart": style_params.get("grad_start", "#ffffff"),
                "gradEnd": style_params.get("grad_end", "#ffffff"),
                "strokeColor": style_params.get("stroke_color", "#000000"),
                "strokeWidth": style_params.get("stroke_width", 2),
                "glowColor": style_params.get("glow_color", "#a855f7"),
                "glowRadius": style_params.get("glow_radius", 0),
                "glowOpacity": style_params.get("glow_opacity", 1.0),
                "shadowColor": style_params.get("shadow_color", "#000000"),
                "shadowBlur": style_params.get("shadow_blur", 0),
                "shadowOffsetX": style_params.get("shadow_offset_x", 0),
                "shadowOffsetY": style_params.get("shadow_offset_y", 0),
                "depth3d": style_params.get("depth_3d", 0),
                "depthColor": style_params.get("depth_color", "#000000"),
                "rotationX": style_params.get("rotation_x", 0),
                "rotationY": style_params.get("rotation_y", 0),
                "rotationZ": style_params.get("rotation_z", 0),
                "subX": style_params.get("sub_x", 0.0),
                "subY": style_params.get("sub_y", 0.0),
                "positionTarget": style_params.get("position_target", "global"),
                "exportDebug": style_params.get("export_debug", False),
                "width": out_w,
                "height": out_h
            }

            try:
                # Write command to stdin
                req_line = _json.dumps(draw_opts).encode('utf-8') + b'\n'
                node_proc.stdin.write(req_line)
                node_proc.stdin.flush()

                # Read 4 bytes length descriptor
                len_bytes = node_proc.stdout.read(4)
                if not len_bytes or len(len_bytes) < 4:
                    return canvas
                
                length = struct.unpack('>I', len_bytes)[0]
                if length == 0:
                    return canvas

                # Read raw RGBA bytes
                rgba_data = b""
                while len(rgba_data) < length:
                    chunk = node_proc.stdout.read(length - len(rgba_data))
                    if not chunk:
                        break
                    rgba_data += chunk
                
                if len(rgba_data) < length:
                    return canvas

                # Alpha blend overlay onto video frame canvas
                rgba_np = np.frombuffer(rgba_data, dtype=np.uint8).reshape((out_h, out_w, 4))
                alpha = rgba_np[:, :, 3:4] / 255.0
                rgb_overlay = rgba_np[:, :, 0:3]
                canvas = (rgb_overlay * alpha + canvas * (1.0 - alpha)).astype(np.uint8)

            except Exception as render_err:
                print(f"[EXPORT ERROR] Failed to draw subtitle via Node server: {render_err}")

            return canvas

        # ── PASS 1: pipe rendered frames to FFmpeg stdin ─────────────────────
        # FFmpeg reads raw RGB24 frames from stdin, encodes + muxes with audio
        temp_video_path = os.path.join(temp_dir, f"temp_no_audio_{project_id}.mp4")
        ffmpeg_cmd = [
            ffmpeg_exe,
            "-y",                              # overwrite output
            # Raw video input from pipe
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{out_w}x{out_h}",
            "-pix_fmt", "rgb24",
            "-r", str(fps),
            "-i", "pipe:0",                    # stdin
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-r", str(fps),
            "-an",                             # No audio in Pass 1
            temp_video_path
        ]

        print(f"[EXPORT] Launching FFmpeg: {' '.join(ffmpeg_cmd[:8])} ...")

        import tempfile
        ffmpeg_log_path = os.path.join(tempfile.gettempdir(), f"ffmpeg_export_{project_id}.log")
        ffmpeg_log_file = open(ffmpeg_log_path, "wb")

        ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=ffmpeg_log_file
        )

        # Stream frames from MoviePy into FFmpeg stdin
        clip = VideoFileClip(input_path)
        render_start = _time.time()
        frames_done = 0

        try:
            # Pre-allocate canvas buffer to prevent memory leakage
            canvas_cache = np.zeros((out_h, out_w, 3), dtype=np.uint8)
            
            # Iterate sequentially to prevent get_frame(t) memory accumulation
            for frame_idx, raw_frame in enumerate(clip.iter_frames(fps=fps, dtype='uint8')):
                if frame_idx >= total_frames:
                    break
                t = frame_idx / fps
                rendered = render_frame_with_subtitle(raw_frame, t, canvas_cache)
                ffmpeg_proc.stdin.write(rendered.tobytes())
                frames_done += 1

                # Update progress every 10 frames
                if frames_done % 10 == 0 or frames_done == total_frames:
                    pct = min(99, int(frames_done / total_frames * 100))
                    elapsed = _time.time() - render_start
                    fps_rate = frames_done / elapsed if elapsed > 0 else 0
                    remaining = (total_frames - frames_done) / fps_rate if fps_rate > 0 else None
                    projects_db[project_id]["export_progress"] = pct
                    projects_db[project_id]["export_frames_done"] = frames_done
                    projects_db[project_id]["render_fps"] = round(fps_rate, 1)
                    if remaining is not None:
                        projects_db[project_id]["time_remaining_s"] = int(remaining)

        finally:
            if node_proc:
                try:
                    node_proc.stdin.close()
                except Exception:
                    pass
                try:
                    node_proc.terminate()
                    node_proc.wait(timeout=5)
                except Exception:
                    pass
            
            if 'clip' in locals():
                try:
                    clip.close()
                except Exception:
                    pass
            try:
                ffmpeg_proc.stdin.close()
            except Exception:
                pass
            if 'ffmpeg_log_file' in locals() and not ffmpeg_log_file.closed:
                ffmpeg_log_file.close()

        # Wait for FFmpeg to finish encoding
        ffmpeg_proc.wait(timeout=300)
        retcode = ffmpeg_proc.returncode

        if retcode != 0:
            try:
                with open(ffmpeg_log_path, "r", errors="replace") as lf:
                    stderr_text = lf.read()
            except Exception:
                stderr_text = "Could not read FFmpeg log file"
            print(f"[EXPORT] FFmpeg exited with code {retcode}:\n{stderr_text}")
            raise RuntimeError(f"FFmpeg encoding failed (exit {retcode}): {stderr_text}")

        # Clean up log file on success
        try:
            os.remove(ffmpeg_log_path)
        except Exception:
            pass

        # ── PASS 2: Mux original audio with captioned video ──────────────────
        if has_audio:
            print(f"[EXPORT] Pass 2: Muxing audio from {input_path} to {output_path}...")
            ffmpeg_mux_cmd = [
                ffmpeg_exe,
                "-y",
                "-i", temp_video_path,
                "-i", input_path,
                "-c:v", "copy",          # Copy video stream directly
                "-c:a", "aac",           # Re-encode audio to AAC
                "-b:a", "192k",
                "-map", "0:v",
                "-map", "1:a?",          # Optional mapping
                "-shortest",
                output_path
            ]
            
            mux_log_path = os.path.join(temp_dir, f"ffmpeg_mux_{project_id}.log")
            try:
                with open(mux_log_path, "wb") as ml:
                    mux_proc = subprocess.Popen(
                        ffmpeg_mux_cmd,
                        stdout=subprocess.DEVNULL,
                        stderr=ml
                    )
                mux_proc.wait(timeout=60)
                mux_ret = mux_proc.returncode
                if mux_ret != 0:
                    with open(mux_log_path, "r", errors="replace") as lf:
                        mux_stderr = lf.read()
                    print(f"[EXPORT WARNING] Muxing failed (exit {mux_ret}): {mux_stderr}. Falling back to copy video only.")
                    import shutil
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    shutil.move(temp_video_path, output_path)
                else:
                    try:
                        os.remove(temp_video_path)
                        os.remove(mux_log_path)
                    except Exception:
                        pass
            except Exception as mux_err:
                print(f"[EXPORT ERROR] Muxing exception: {mux_err}. Falling back to copy video only.")
                import shutil
                if os.path.exists(output_path):
                    os.remove(output_path)
                shutil.move(temp_video_path, output_path)
        else:
            import shutil
            if os.path.exists(output_path):
                os.remove(output_path)
            shutil.move(temp_video_path, output_path)

        # Try to upload to Telegram for unlimited storage
        try:
            telegram_url = upload_to_telegram(output_path)
            if telegram_url:
                projects_db[project_id]["telegram_url"] = telegram_url
        except Exception as tg_err:
            print(f"[EXPORT WARNING] Telegram storage upload failed: {tg_err}")

        projects_db[project_id]["export_progress"] = 100
        projects_db[project_id]["time_remaining_s"] = 0
        projects_db[project_id]["export_status"] = "ready"
        projects_db[project_id]["export_path"] = output_path
        elapsed_total = round(_time.time() - _start_ts, 1)
        print(f"[EXPORT] Done! {frames_done} frames burned in {elapsed_total}s -> {output_path}")

    except Exception as e:
        stderr_text = ""
        try:
            if 'ffmpeg_log_path' in locals() and os.path.exists(ffmpeg_log_path):
                with open(ffmpeg_log_path, "r", errors="replace") as lf:
                    stderr_text = lf.read()
                # Do not delete file on failure for manual inspection
        except Exception:
            pass

        tb = traceback.format_exc()
        err_msg = str(e)
        if stderr_text:
            err_msg += f"\nFFmpeg Log:\n{stderr_text}"
        print(f"[EXPORT ERROR]\n{tb}\nFFmpeg Stderr:\n{stderr_text}")
        projects_db[project_id]["export_status"] = "failed"
        projects_db[project_id]["export_error"] = err_msg

        # Do NOT fall back to copying raw video — surface the real error so user knows

@app.post("/api/v1/projects/{project_id}/export")
async def export_project(
    project_id: str,
    config: ExportRequestModel,
    background_tasks: BackgroundTasks
):
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project expired or not found")

    # Prefer aspect_ratio from request; fall back to stored project value
    aspect_ratio = config.aspect_ratio or projects_db[project_id].get("aspect_ratio", "16:9")

    temp_dir = tempfile.gettempdir()
    exports_dir = os.path.join(temp_dir, "exports")
    os.makedirs(exports_dir, exist_ok=True)

    export_filename = f"{project_id}.{config.export_format}"
    export_path = os.path.join(exports_dir, export_filename)

    input_path = projects_db[project_id]["local_path"]

    background_tasks.add_task(
        run_burn_subtitles,
        project_id=project_id,
        input_path=input_path,
        output_path=export_path,
        segments=[s.dict() for s in config.segments],
        font_name=config.font_name,
        font_size=config.font_size,
        fill_color=config.fill_color,
        stroke_color=config.stroke_color,
        stroke_width=config.stroke_width,
        x_offset=config.sub_x,
        y_offset=config.sub_y,
        fps=config.frame_rate,
        bitrate=config.bitrate,
        resolution=config.quality,
        aspect_ratio=aspect_ratio,
        style_params=config.dict()
    )

    return {
        "status": "processing",
        "aspect_ratio": aspect_ratio,
        "download_url": f"/api/v1/projects/{project_id}/download?format={config.export_format}"
    }

@app.get("/api/v1/projects/{project_id}/export-status")
async def get_export_status(project_id: str):
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    proj = projects_db[project_id]
    status = proj.get("export_status", "idle")
    error = proj.get("export_error", None)
    progress = proj.get("export_progress", 0)
    time_remaining_s = proj.get("time_remaining_s", None)
    render_fps = proj.get("render_fps", None)
    import time as _t
    start_ts = proj.get("export_start_time", None)
    elapsed_s = int(_t.time() - start_ts) if start_ts else 0
    return {
        "status": status,
        "error": error,
        "progress": progress,
        "time_remaining_s": time_remaining_s,
        "elapsed_s": elapsed_s,
        "render_fps": render_fps
    }

@app.get("/api/v1/projects/{project_id}/download")
async def download_exported_file(project_id: str, format: str = "mp4"):
    if project_id not in projects_db:
        raise HTTPException(status_code=404, detail="Export file expired or not found")
        
    tg_url = projects_db[project_id].get("telegram_url", None)
    if tg_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=tg_url)

    export_path = projects_db[project_id].get("export_path", None)
    if export_path and os.path.exists(export_path):
        from fastapi.responses import FileResponse
        filename = f"INVINCIBLE_STUDIOS_export.{format}"
        return FileResponse(
            path=export_path,
            filename=filename,
            media_type="video/mp4" if format == "mp4" else "video/quicktime"
        )
    
    local_path = projects_db[project_id]["local_path"]
    if os.path.exists(local_path):
        from fastapi.responses import FileResponse
        filename = f"INVINCIBLE_STUDIOS_source.{format}"
        return FileResponse(
            path=local_path,
            filename=filename,
            media_type="video/mp4" if format == "mp4" else "video/quicktime"
        )
    else:
        raise HTTPException(status_code=410, detail="Video source file cleaned up")

@app.get("/api/v1/cleanup-logs")
async def get_cleanup_logs():
    return {"logs": cleanup_logs}
