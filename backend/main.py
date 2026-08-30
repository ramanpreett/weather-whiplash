import os
import io
import base64
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import requests
import socket

# --- DNS BYPASS HACK FOR RENDER ---
# Render's free tier has a known DNS bug resolving Hugging Face.
# We bypass this by manually resolving it via Google's DNS over HTTPS.
try:
    print("Attempting to resolve Hugging Face API via Google DoH...")
    doh_resp = requests.get('https://dns.google/resolve?name=api-inference.huggingface.co&type=A', timeout=5)
    data = doh_resp.json()
    ips = [answer['data'] for answer in data.get('Answer', []) if answer['type'] == 1]
    if ips:
        hf_ip = ips[0]
        print(f"Successfully resolved api-inference.huggingface.co to {hf_ip}")
        
        # Patch python's socket resolution AND urllib3's cached reference
        import urllib3.util.connection
        original_getaddrinfo = socket.getaddrinfo
        def new_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
            if host == 'api-inference.huggingface.co':
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (hf_ip, port))]
            return original_getaddrinfo(host, port, family, type, proto, flags)
        socket.getaddrinfo = new_getaddrinfo
        urllib3.util.connection.getaddrinfo = new_getaddrinfo
except Exception as e:
    print(f"DNS Bypass failed, falling back to system DNS: {e}")
# ----------------------------------

load_dotenv()


app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
HF_API_URL = "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32"

label_map = {
    "a photo of a completely dry motorsport race track, even with dark shadows cast on the asphalt": "dry race track",
    "a photo of a slightly damp motorsport race track with some wet patches": "damp race track",
    "a photo of a wet motorsport race track with heavy rain and standing water": "wet race track",
    "a photo of a drying motorsport race track with a clear dry racing line": "drying race track"
}
candidate_prompts = list(label_map.keys())

def query_huggingface(image_bytes):
    if not HF_API_KEY:
        raise HTTPException(status_code=500, detail="HUGGINGFACE_API_KEY not set in environment")
    
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    
    # Send image as base64 and parameters as JSON for zero-shot classification
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "inputs": image_base64,
        "parameters": {"candidate_labels": candidate_prompts}
    }
    
    response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=15)
    
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Hugging Face API returned error: {response.text}")
        
    return response.json()

@app.post("/analyze-track")
async def analyze_track(file: UploadFile = File(...)):
    try:
        # Read image bytes
        image_bytes = await file.read()
        
        # Call Hugging Face API
        hf_response = query_huggingface(image_bytes)
        
        # Format results: HF API returns a list of dictionaries like [{"score": 0.9, "label": "prompt..."}, ...]
        results = []
        for item in hf_response:
            prompt = item.get("label", "")
            score = item.get("score", 0.0)
            # Map the full prompt back to the shorter label
            results.append({"label": label_map.get(prompt, prompt), "score": score})
            
        return results
        
    except HTTPException as he:
        print(f"HTTPException in analyze_track: {he.detail}")
        raise
    except Exception as e:
        print(f"Server Error in analyze_track: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

class CameraRequest(BaseModel):
    url: str

@app.post("/analyze-camera-url")
async def analyze_camera_url(request: CameraRequest):
    try:
        # Download image from IP camera
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(request.url, headers=headers, timeout=5)
        response.raise_for_status()
        
        image_bytes = response.content
        
        # Call Hugging Face API
        hf_response = query_huggingface(image_bytes)
        
        # Format results
        results = []
        for item in hf_response:
            prompt = item.get("label", "")
            score = item.get("score", 0.0)
            results.append({"label": label_map.get(prompt, prompt), "score": score})
            
        return results
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch image from camera: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
