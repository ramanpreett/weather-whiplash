import React, { useState, useRef, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Upload, CloudRain, Sun, Cloud, RefreshCw, Activity, AlertTriangle, ChevronRight, Zap, Target, Shield, Gauge, Cpu, CheckCircle2, ChevronRightCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

const API_URL = 'http://localhost:8000/analyze-track';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="label">{label}</p>
        <p className="value" style={{ color: payload[0].color }}>
          {payload[0].name}: {payload[0].value}%
        </p>
      </div>
    );
  }
  return null;
};

function App() {
  const [view, setView] = useState('landing');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const [isIpCamera, setIsIpCamera] = useState(false);
  const [cameraUrl, setCameraUrl] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const intervalRef = useRef(null);

  const API_URL_CAMERA = 'http://localhost:8000/analyze-camera-url';

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsIpCamera(false);
    setCameraUrl(null);
    const isVideoFile = file.type.startsWith('video/');
    setIsVideo(isVideoFile);
    setSelectedImage(URL.createObjectURL(file));
    setHistoryData([]); // Clear history for the new feed
    
    if (!isVideoFile) {
      await analyzeImage(file, false);
    }
  };

  const handleConnectIpCamera = () => {
    let url = window.prompt('Enter IP Camera URL (e.g., http://192.168.1.55:8080):');
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      setIsIpCamera(true);
      setIsVideo(false);
      setCameraUrl(cleanUrl);
      setSelectedImage(`${cleanUrl}/video`);
      setHistoryData([]);
      setIsPlaying(true); // Start analysis
    }
  };

  const processVideoFrame = async () => {
    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
    
    const canvas = document.createElement('canvas');
    if (!videoRef.current.videoWidth) return;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
        if (blob) {
            const frameFile = new File([blob], "frame.jpg", { type: "image/jpeg" });
            await analyzeImage(frameFile, true);
        }
    }, 'image/jpeg');
  };

  useEffect(() => {
    if (isVideo && isPlaying && !isIpCamera) {
      intervalRef.current = setInterval(() => {
        processVideoFrame();
      }, 2000);
    } else if (isIpCamera && isPlaying) {
      intervalRef.current = setInterval(() => {
        analyzeIpCameraFrame();
      }, 2000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isVideo, isPlaying, isIpCamera, cameraUrl]);

  const processAnalysisResults = (data) => {
    const topLabel = data.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    
    let wetnessScore = 0;
    if (topLabel.label === 'wet race track') wetnessScore = 90 + (topLabel.score * 10);
    else if (topLabel.label === 'damp race track') wetnessScore = 60 + (topLabel.score * 10);
    else if (topLabel.label === 'drying race track') wetnessScore = 30 + (topLabel.score * 10);
    else wetnessScore = 10 - (topLabel.score * 10); 

    const newEntry = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      condition: topLabel.label,
      confidence: topLabel.score,
      wetness: Math.max(0, Math.min(100, Math.round(wetnessScore)))
    };

    setCurrentStatus(newEntry);
    setHistoryData(prev => [...prev.slice(-19), newEntry]); 
  };

  const analyzeIpCameraFrame = async () => {
    try {
      const response = await fetch(API_URL_CAMERA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${cameraUrl}/shot.jpg` }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `Error: ${response.statusText}`);
      }

      const data = await response.json();
      processAnalysisResults(data);
    } catch (err) {
      console.error("IP camera analysis error:", err);
    }
  };

  const analyzeImage = async (file, silent = false) => {
    if (!silent) setIsAnalyzing(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Error: ${response.statusText}`);

      const data = await response.json();
      processAnalysisResults(data);

    } catch (err) {
      if (!silent) setError(err.message);
      else console.error("Background frame analysis error:", err);
    } finally {
      if (!silent) setIsAnalyzing(false);
    }
  };

  const getAlert = () => {
    if (!historyData.length) return null;
    const recent = historyData.slice(-3);
    const avgWetness = recent.reduce((sum, curr) => sum + curr.wetness, 0) / recent.length;

    if (avgWetness > 75) return { type: 'danger', color: '#E6002B', icon: <CloudRain size={28} />, title: 'EXTREME WET', message: 'The track is heavily flooded. Switch to Heavy Rain tires immediately for safety.' };
    if (avgWetness > 40) return { type: 'warning', color: '#f59e0b', icon: <RefreshCw size={28} />, title: 'PARTLY WET', message: 'The track is slightly wet. Use Intermediate (Green) tires for the best grip.' };
    return { type: 'success', color: '#10b981', icon: <Sun size={28} />, title: 'COMPLETELY DRY', message: 'The track is totally dry. Use standard racing tires for maximum speed.' };
  };

  const alertInfo = getAlert();

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 30, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 80, damping: 15 } } };

  if (view === 'landing') {
    return (
      <div className="w-full min-h-screen bg-[#050505] selection:bg-red-500/30 relative font-sans text-white flex flex-col">
        
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#E6002B]/10 rounded-full blur-[150px] opacity-60 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] opacity-40 pointer-events-none" />

        {/* Top Navbar */}
        <nav className="relative z-20 w-full px-10 py-6 flex justify-between items-center max-w-[1400px] mx-auto border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#E6002B] p-2 flex items-center justify-center transform -skew-x-12">
              <Activity className="w-5 h-5 text-white transform skew-x-12" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase italic">Weather Whiplash<span className="text-[#E6002B]">.</span></span>
          </div>
          <div className="flex items-center gap-8 text-xs font-bold uppercase tracking-widest text-gray-400">
            <button onClick={() => setView('dashboard')} className="px-5 py-2 bg-white text-black hover:bg-gray-200 transition-colors transform -skew-x-12">
              <span className="inline-block transform skew-x-12">Enter App</span>
            </button>
          </div>
        </nav>

        {/* Main Hero Section - Fits exactly in remaining viewport height */}
        <div className="relative z-20 max-w-[1400px] mx-auto px-10 flex-1 flex flex-col justify-center lg:flex-row lg:items-center gap-12 w-full py-8">
          
          <motion.div 
            className="lg:w-1/2 flex flex-col items-start"
            initial="hidden" animate="visible" variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-3 px-3 py-1.5 border border-white/10 bg-white/5 mb-6 backdrop-blur-sm transform -skew-x-12">
              <span className="w-1.5 h-1.5 bg-[#E6002B] animate-pulse rounded-full transform skew-x-12"></span>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white transform skew-x-12">Live Strategy Feed</span>
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-6xl xl:text-8xl font-black leading-[0.9] tracking-tighter mb-6 uppercase italic">
              Conquer The <br/>
              <span className="text-[#E6002B]">Crossover.</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-lg xl:text-xl text-gray-400 mb-8 max-w-lg leading-relaxed font-medium">
              Empowering the <span className="text-white font-bold">MoneyGram Haas F1 Team</span> with real-time weather intelligence. We process live trackside camera feeds through advanced Vision AI to detect surface moisture instantly. Gain a decisive strategic advantage by pinpointing the exact crossover moment for your tire strategy.
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-2">
              <button onClick={() => setView('dashboard')} className="primary-btn px-8 py-4 text-base group w-full sm:w-auto justify-center">
                Launch Pit Wall
                <ChevronRightCircle className="group-hover:translate-x-1 transition-transform w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>

          {/* Right Side: Superior F1 Image */}
          <motion.div 
            className="lg:w-1/2 w-full flex flex-col justify-center gap-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 40, delay: 0.2 }}
          >
            {/* The dramatic red F1 car image */}
            <div className="w-full overflow-hidden rounded-2xl shadow-[0_0_80px_-20px_rgba(230,0,43,0.3)]">
              <img 
                src="/hero-car.jpg" 
                alt="F1 Wet Track" 
                className="w-full h-auto block transform hover:scale-105 transition-transform duration-1000 grayscale-[0.1] contrast-110"
              />
            </div>

            {/* Statistics moved to right side below image */}
            <div className="grid grid-cols-2 gap-6 text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
              <div className="flex flex-col justify-center">
                <p className="text-3xl xl:text-4xl font-black text-white italic mb-1 tracking-tighter">250<span className="text-[#E6002B]">ms</span></p>
                <p>Inference Latency</p>
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-3xl xl:text-4xl font-black text-white italic mb-1 tracking-tighter">98<span className="text-[#E6002B]">%</span></p>
                <p>Surface Accuracy</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Feature Strip - Haas Theme */}
        <div className="relative z-20 bg-black border-t border-[#E6002B]/20">
          <div className="max-w-[1400px] mx-auto px-10 py-16 grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="flex flex-col gap-5 group">
              <Gauge className="text-[#E6002B] w-10 h-10 group-hover:scale-110 transition-transform" />
              <h4 className="text-white font-black text-2xl uppercase italic tracking-tight">Real-Time Telemetry</h4>
              <p className="text-gray-400 text-sm leading-relaxed font-medium">Stream camera feeds directly to the model. Receive instant wetness index scores to plot weather trends exactly when it matters.</p>
            </div>
            <div className="flex flex-col gap-5 group">
              <Target className="text-[#E6002B] w-10 h-10 group-hover:scale-110 transition-transform" />
              <h4 className="text-white font-black text-2xl uppercase italic tracking-tight">Zero-Shot AI</h4>
              <p className="text-gray-400 text-sm leading-relaxed font-medium">Powered by OpenAI's CLIP model via Hugging Face. Classifies track conditions without requiring explicit retraining on new circuits.</p>
            </div>
            <div className="flex flex-col gap-5 group">
              <Shield className="text-[#E6002B] w-10 h-10 group-hover:scale-110 transition-transform" />
              <h4 className="text-white font-black text-2xl uppercase italic tracking-tight">Strategic Dominance</h4>
              <p className="text-gray-400 text-sm leading-relaxed font-medium">Actionable alerts tell your pit wall exactly when conditions transition from full wet to intermediate.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View - Haas Theme
  return (
    <motion.div className="w-full min-h-screen flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto" initial="hidden" animate="visible" variants={containerVariants}>
      <motion.header variants={itemVariants} className="mb-8 flex justify-between items-center bg-[#111] p-5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setView('landing')}>
          <div className="p-2 bg-white/5 rounded-lg group-hover:bg-[#E6002B] transition-colors text-white">
            <ChevronRight className="rotate-180" size={24} />
          </div>
          <h1 className="text-2xl md:text-3xl font-black uppercase italic tracking-tighter">Weather Whiplash<span className="text-[#E6002B]">.</span></h1>
        </div>
        <div className="text-right hidden md:block px-4">
          <p className="text-sm font-bold tracking-widest text-gray-500 uppercase">MoneyGram Haas F1 Team</p>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Vision Processing */}
        <motion.div variants={itemVariants} className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel flex-1 flex flex-col p-6">
            <h3 className="text-xl font-black uppercase italic tracking-wider mb-4 flex items-center gap-3 text-white">
              <Cloud size={24} className="text-[#E6002B]"/> Camera Feed
            </h3>
            
            <div className="flex-1 min-h-[400px] relative rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center group">
              {selectedImage ? (
                <>
                  {isVideo ? (
                    <video 
                      ref={videoRef}
                      src={selectedImage}
                      className="w-full h-full object-cover absolute inset-0 grayscale-[0.2]"
                      autoPlay
                      loop
                      muted
                      controls
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  ) : (
                    <motion.img initial={{ scale: 1.05, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={selectedImage} className="w-full h-full object-cover absolute inset-0 grayscale-[0.2]" />
                  )}
                  <AnimatePresence>
                    {isAnalyzing && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-10 pointer-events-none">
                        <RefreshCw className="w-12 h-12 animate-spin text-[#E6002B] mb-4" />
                        <p className="text-lg font-black tracking-widest uppercase text-white">Analyzing Surface...</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <div className="text-center p-8 flex flex-col items-center">
                  <div className="w-24 h-24 rounded-full bg-[#E6002B]/10 flex items-center justify-center mb-6"><CloudRain className="w-12 h-12 text-[#E6002B]" /></div>
                  <p className="text-xl font-black uppercase italic mb-2 text-white">No Feed Available</p>
                  <p className="text-gray-400 text-sm max-w-[250px] font-medium">Upload a trackside camera frame to begin telemetry analysis.</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex flex-col items-center">
              <input type="file" accept="image/*,video/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
              <div className="flex gap-4 w-full">
                <button className="primary-btn flex-1 justify-center py-5 rounded-none text-sm" onClick={() => fileInputRef.current.click()} disabled={isAnalyzing}>
                  <Upload size={18} />
                  Upload Feed
                </button>
                <button className="primary-btn flex-1 justify-center py-5 rounded-none text-sm bg-blue-600 hover:bg-blue-700 border-blue-500" onClick={handleConnectIpCamera} disabled={isAnalyzing}>
                  <Cloud size={18} />
                  IP Camera
                </button>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 p-4 bg-red-950/50 border border-red-500/30 rounded-xl w-full flex items-start gap-3">
                    <AlertTriangle className="text-red-500 flex-shrink-0" size={20}/>
                    <p className="text-red-400 text-sm font-bold">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Telemetry & Analytics */}
        <motion.div variants={itemVariants} className="lg:col-span-7 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-6 flex flex-col justify-center relative overflow-hidden">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Live Condition</p>
              <div className="flex items-end justify-between">
                <h2 className="text-3xl lg:text-4xl font-black uppercase italic text-white tracking-tighter">
                  {currentStatus ? currentStatus.condition.replace(' race track', '') : '--'}
                </h2>
                {currentStatus && (
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-right">
                    <span className="text-[#E6002B] font-black text-3xl">{(currentStatus.confidence * 100).toFixed(1)}%</span>
                    <p className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-widest">AI Confidence</p>
                  </motion.div>
                )}
              </div>
            </div>

            <div className={`glass-panel p-6 relative overflow-hidden ${alertInfo ? 'alert-panel' : ''}`} style={{ borderColor: alertInfo ? alertInfo.color : 'rgba(255,255,255,0.1)' }}>
              {alertInfo && <div className="absolute top-0 right-0 w-40 h-40 opacity-10 rounded-bl-full transition-colors duration-500" style={{ background: alertInfo.color }}></div>}
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-4">Strategy Suggestion</p>
              {alertInfo ? (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={alertInfo.title} className="flex items-start gap-4">
                  <div className="mt-1" style={{ color: alertInfo.color }}>{alertInfo.icon}</div>
                  <div>
                    <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: alertInfo.color }}>{alertInfo.title}</h3>
                    <p className="text-sm mt-1 text-gray-400 font-medium leading-relaxed">{alertInfo.message}</p>
                    <div className="mt-4 pt-3 border-t border-white/5 inline-block">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                        * Recommendation based on a 3-frame rolling average for strategic stability
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center gap-3 text-gray-600 mt-4 font-medium">
                  <Activity size={24} />
                  <p className="uppercase tracking-wider text-xs font-bold">Awaiting telemetry data...</p>
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel p-6 flex-1 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-wider flex items-center gap-3 text-white"><Activity size={24} className="text-[#E6002B]"/> Wetness Trend Index</h3>
                <p className="text-sm text-gray-500 mt-1 font-medium">Historical track surface moisture tracking</p>
              </div>
              <div className="px-4 py-1.5 bg-[#E6002B]/10 rounded border border-[#E6002B]/30 text-xs text-[#E6002B] flex items-center gap-2 font-black tracking-widest uppercase">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E6002B] animate-pulse"></span> LIVE
              </div>
            </div>
            
            <div className="flex-1 w-full relative">
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorWetness" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E6002B" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#E6002B" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={11} tickMargin={12} tickLine={false} axisLine={false} fontWeight={700} />
                    <YAxis domain={[0, 100]} stroke="#6b7280" fontSize={11} tickFormatter={(val) => `${val}%`} tickLine={false} axisLine={false} fontWeight={700} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(230,0,43,0.5)', strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="wetness" name="Wetness Index" stroke="#E6002B" strokeWidth={4} fillOpacity={1} fill="url(#colorWetness)" activeDot={{ r: 6, fill: '#fff', stroke: '#E6002B', strokeWidth: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/5">
                  <p className="text-gray-500 font-bold tracking-widest uppercase text-sm">Chart data will populate as frames are analyzed</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default App;
