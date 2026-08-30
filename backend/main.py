import os
import io
import base64
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import requests
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

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

print("Loading Hugging Face CLIP model locally (this may take a few seconds)...")
# Using the local transformer model bypasses all DNS and API endpoint issues!
model_id = "openai/clip-vit-base-patch32"
processor = CLIPProcessor.from_pretrained(model_id)
model = CLIPModel.from_pretrained(model_id)
print("Model loaded successfully!")

label_map = {
    "a photo of a completely dry motorsport race track, even with dark shadows cast on the asphalt": "dry race track",
    "a photo of a slightly damp motorsport race track with some wet patches": "damp race track",
    "a photo of a wet motorsport race track with heavy rain and standing water": "wet race track",
    "a photo of a drying motorsport race track with a clear dry racing line": "drying race track"
}
candidate_prompts = list(label_map.keys())

@app.post("/analyze-track")
async def analyze_track(file: UploadFile = File(...)):
    try:
        # Read image bytes
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Process image and labels
        inputs = processor(text=candidate_prompts, images=image, return_tensors="pt", padding=True)
        
        # Run inference
        outputs = model(**inputs)
        logits_per_image = outputs.logits_per_image
        probs = logits_per_image.softmax(dim=1).detach().numpy()[0]
        
        # Format results
        results = []
        for prompt, prob in zip(candidate_prompts, probs):
            results.append({"label": label_map[prompt], "score": float(prob)})
            
        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local Model Error: {str(e)}")

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
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Process image and labels
        inputs = processor(text=candidate_prompts, images=image, return_tensors="pt", padding=True)
        
        # Run inference
        outputs = model(**inputs)
        logits_per_image = outputs.logits_per_image
        probs = logits_per_image.softmax(dim=1).detach().numpy()[0]
        
        # Format results
        results = []
        for prompt, prob in zip(candidate_prompts, probs):
            results.append({"label": label_map[prompt], "score": float(prob)})
            
        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch image from camera: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local Model Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
