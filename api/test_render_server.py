import subprocess
import json
import os
import struct
from PIL import Image
import numpy as np

def run_test():
    node_exe = "node"
    node_script = os.path.join(os.path.dirname(__file__), "render_subtitle_server.js")
    
    print(f"Spawning Node server: {node_exe} {node_script}")
    proc = subprocess.Popen(
        [node_exe, node_script],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Test parameters (Tamil text, gradients, shadows, strokes, 3D extrusions)
    draw_opts = {
        "text": "பிறந்தநாள் வாழ்த்துக்கள்",
        "words": [
            {"word": "பிறந்தநாள்", "start_time": 0.0, "end_time": 2.0, "is_punchline": False},
            {"word": "வாழ்த்துக்கள்", "start_time": 1.0, "end_time": 3.0, "is_punchline": True}
        ],
        "currentTime": 1.5, # word "வாழ்த்துக்கள்" will be active
        "targetLang": "tamil",
        "selectedFont": "Noto Sans Tamil",
        "selectedWeight": "Bold",
        "fontSize": 64,
        "fillType": "gradient",
        "fillColor": "#ffffff",
        "gradStart": "#ff007f", # Neon pink
        "gradEnd": "#fbbf24",   # Amber yellow
        "strokeColor": "#000000",
        "strokeWidth": 6,
        "glowColor": "#fbbf24",
        "glowRadius": 15,
        "glowOpacity": 0.8,
        "shadowColor": "rgba(0, 0, 0, 0.5)",
        "shadowBlur": 10,
        "shadowOffsetX": 8,
        "shadowOffsetY": 8,
        "depth3d": 6,
        "depthColor": "#854d0e",
        "rotationX": -10,
        "rotationY": 15,
        "rotationZ": -5,
        "subX": 0.0,
        "subY": 100.0,
        "positionTarget": "global",
        "exportDebug": True,
        "width": 1920,
        "height": 1080
    }

    try:
        # Write line to stdin
        print("Sending render command...")
        req = json.dumps(draw_opts).encode('utf-8') + b'\n'
        proc.stdin.write(req)
        proc.stdin.flush()

        # Read 4 bytes length
        print("Reading response length...")
        len_bytes = proc.stdout.read(4)
        if not len_bytes or len(len_bytes) < 4:
            print("ERROR: Did not receive valid length prefix from Node server.")
            # Print stderr if any
            stderr = proc.stderr.read()
            if stderr:
                print("Node Stderr:", stderr.decode('utf-8'))
            return

        length = struct.unpack('>I', len_bytes)[0]
        print(f"Response length: {length} bytes")
        if length == 0:
            print("ERROR: Received 0-byte frame response.")
            return

        # Read buffer bytes
        rgba_data = b""
        while len(rgba_data) < length:
            chunk = proc.stdout.read(length - len(rgba_data))
            if not chunk:
                break
            rgba_data += chunk

        if len(rgba_data) < length:
            print(f"ERROR: Received incomplete frame. Expected {length}, got {len(rgba_data)}")
            return

        print("Converting raw RGBA data to image...")
        # Convert to NumPy array
        np_arr = np.frombuffer(rgba_data, dtype=np.uint8).reshape((1080, 1920, 4))
        
        # Save as PNG
        img = Image.fromarray(np_arr, 'RGBA')
        out_path = os.path.join(os.path.dirname(__file__), "test_subtitle_render.png")
        img.save(out_path)
        print(f"SUCCESS: Rendered frame saved to {out_path}")

    finally:
        proc.stdin.close()
        stderr = proc.stderr.read()
        if stderr:
            print("\n--- Node Server Stderr ---")
            print(stderr.decode('utf-8'))
            print("--------------------------\n")
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run_test()
