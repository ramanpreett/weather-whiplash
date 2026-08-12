# Weather Whiplash 🏎️🌧️

**Conquer the Crossover: Live Tire Strategy AI**

Weather Whiplash is a real-time track condition analytics platform built for Formula 1 teams (like the MoneyGram Haas F1 Team). It processes live trackside camera feeds through advanced Vision AI to instantly detect surface moisture, allowing race engineers to pinpoint the exact crossover moment for tire strategy (Wet vs. Intermediate vs. Slick tires).

## 🚀 System Architecture

### Frontend (Live Strategy Feed)
- **Tech Stack:** React, Vite, TailwindCSS
- **Features:** 
  - Live dashboard with real-time UI updates.
  - Video and image frame processing directly from the browser.
  - High-performance UI for pit wall engineers.

### Backend API (Inference Engine)
- **Tech Stack:** Python, FastAPI
- **Features:**
  - Fast, asynchronous API endpoints for track image analysis.
  - CORS-enabled for seamless frontend integration.

### Vision AI
- **Model:** Hugging Face Zero-Shot CLIP (`openai/clip-vit-base-patch32`)
- **Features:**
  - Classifies track conditions into categories (dry, damp, wet, drying).
  - Runs inference locally in ~250ms per frame.

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)

### Running the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   *(Note: The CLIP model will download on the first run, which may take a few moments.)*

### Running the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

## 📸 Presentation
A fully-generated, hackathon-ready PowerPoint presentation is available at `frontend/WeatherWhiplash_Hackathon_Pitch.pptx`.
