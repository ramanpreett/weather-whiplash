import os
import io
import base64
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import requests

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

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def query_gemini(image_bytes):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in environment")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    
    prompt = """
    You are an AI analyzing a racing track surface.
    Analyze the image and return ONLY a valid JSON array. Do not include markdown formatting or backticks.
    The array must contain exactly four objects representing these exact classifications: 
    'dry race track', 'damp race track', 'drying race track', and 'wet race track'.
    Each object must have 'label' (string) and 'score' (float between 0.0 and 1.0 representing your confidence).
    The scores must add up to exactly 1.0.
    Example output: 
    [
        {"label": "dry race track", "score": 0.05},
        {"label": "damp race track", "score": 0.15},
        {"label": "drying race track", "score": 0.05},
        {"label": "wet race track", "score": 0.75}
    ]
    """

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}
            ]
        }]
    }
    
    response = requests.post(url, json=payload, timeout=15)
    
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {response.text}")
        
    data = response.json()
    try:
        # Extract the raw text from the Gemini response
        text_response = data['candidates'][0]['content']['parts'][0]['text']
        # Clean any markdown formatting if present
        text_response = text_response.strip().removeprefix('```json').removesuffix('```').strip()
        import json
        results = json.loads(text_response)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Gemini response: {str(e)} - Raw: {data}")

@app.post("/analyze-track")
async def analyze_track(file: UploadFile = File(...)):
    try:
        # Read image bytes
        image_bytes = await file.read()
        
        # Call Gemini API
        results = query_gemini(image_bytes)
        
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
        # Call Gemini API
        results = query_gemini(image_bytes)
        
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
