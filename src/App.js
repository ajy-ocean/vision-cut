import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import { removeBackground, preload } from "@imgly/background-removal";
import "react-image-crop/dist/ReactCrop.css";
import "./App.css";

const DEFAULT_ADJ = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  vignette: 0,
};

function App() {
  const [imgSrc, setImgSrc] = useState("");
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [aspect, setAspect] = useState(16 / 9);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adj, setAdj] = useState(DEFAULT_ADJ);

  const imgRef = useRef(null);
  const downloadCanvasRef = useRef(null);

  // Preload models for faster AI processing
  useEffect(() => {
    preload().catch(err => console.error("AI Preload failed:", err));
  }, []);

  const onSelectFile = (e) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        setImgSrc(reader.result.toString());
        setAdj(DEFAULT_ADJ);
        setCompletedCrop(null); // Reset crop on new file
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 100 }, aspect, width, height),
      width,
      height
    );
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  };

  const handleRemoveBG = async () => {
    if (!imgSrc) return;
    setIsProcessing(true);
    try {
      // Configuration for GitHub Pages / Production environments
      const config = {
        model: "medium",
        progress: (key, current, total) => {
          console.log(`Downloading AI Model: ${key} ${(current / total * 100).toFixed(0)}%`);
        }
      };
      const blob = await removeBackground(imgSrc, config);
      const newUrl = URL.createObjectURL(blob);
      setImgSrc(newUrl);
    } catch (err) {
      console.error("BG removal error:", err);
      alert("AI Processing failed. Ensure you have a stable connection for the initial model download.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAspectChange = (newAspect) => {
    setAspect(newAspect);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const newCrop = centerCrop(
        makeAspectCrop({ unit: "%", width: 90 }, newAspect, width, height),
        width,
        height
      );
      setCrop(newCrop);
      setCompletedCrop(newCrop);
    }
  };

  const handleExport = useCallback(() => {
    const image = imgRef.current;
    const canvas = downloadCanvasRef.current;

    if (!image || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    // 1. High-Resolution Scaling
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // 2. Logic to handle "Export without manual crop"
    const isCropValid = completedCrop && completedCrop.width > 0 && completedCrop.height > 0;
    
    const sourceX = isCropValid ? completedCrop.x * scaleX : 0;
    const sourceY = isCropValid ? completedCrop.y * scaleY : 0;
    const sourceWidth = isCropValid ? completedCrop.width * scaleX : image.naturalWidth;
    const sourceHeight = isCropValid ? completedCrop.height * scaleY : image.naturalHeight;

    canvas.width = Math.floor(sourceWidth);
    canvas.height = Math.floor(sourceHeight);

    // 3. Apply Filters - Using a more robust string construction
    const { brightness, contrast, saturation, temperature } = adj;
    const sepia = temperature > 0 ? temperature : 0;
    const hue = temperature < 0 ? temperature * 1.5 : 0;
    
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) hue-rotate(${hue}deg)`;

    try {
      // 4. Draw the High-Res Data
      ctx.drawImage(
        image,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height
      );

      // 5. Apply Vignette (Baked into pixels)
      if (adj.vignette > 0) {
        ctx.filter = "none";
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.sqrt(centerX ** 2 + centerY ** 2) * (1.2 - adj.vignette / 100);
        
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(1, radius));
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(0,0,0,${Math.min(adj.vignette / 100, 0.85)})`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 6. Export as high-quality PNG
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `VISION-CUT-${Date.now()}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png", 1.0);
      
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [adj, completedCrop]);

  return (
    <div className="vision-app">
      <nav className="navbar">
        <div className="logo" onClick={() => window.location.reload()}>VISION<span>CUT</span></div>
        {imgSrc && (
          <div className="nav-actions">
            <input type="file" id="re-up" hidden onChange={onSelectFile} />
            <label htmlFor="re-up" className="upload-label">Change</label>
            <button className="dl-btn" onClick={handleExport}>Download PNG</button>
          </div>
        )}
      </nav>

      {!imgSrc ? (
        <div className="hero-centered">
          <h1 className="logo-main">VISION<span>CUT</span></h1>
          <input type="file" id="up-main" hidden onChange={onSelectFile} />
          <label htmlFor="up-main" className="btn-hero-upload">Upload Photo</label>
        </div>
      ) : (
        <div className="studio-container">
          <aside className="toolbar">
            <div className="top-tools">
              <button onClick={handleRemoveBG} className="magic-btn" disabled={isProcessing}>
                {isProcessing ? "🧠 AI Processing..." : "✨ Remove Background"}
              </button>
              <div className="adj-section">
                <div className="section-header">
                  <label>Tuning</label>
                  <button className="reset-link" onClick={() => setAdj(DEFAULT_ADJ)}>Default</button>
                </div>
                {Object.keys(DEFAULT_ADJ).map((key) => (
                  <div className="control-item" key={key}>
                    <div className="val-row"><span className="capitalize">{key}</span><span>{adj[key]}</span></div>
                    <input 
                      type="range" 
                      min={key === "temperature" ? "-100" : "0"} 
                      max="200" 
                      value={adj[key]} 
                      onChange={(e) => setAdj({ ...adj, [key]: parseFloat(e.target.value) })} 
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="ratio-section">
              <label className="section-label">Presets</label>
              <div className="ratio-group">
                <button className={aspect === 16/9 ? "active" : ""} onClick={() => handleAspectChange(16 / 9)}>16:9</button>
                <button className={aspect === 1 ? "active" : ""} onClick={() => handleAspectChange(1)}>1:1</button>
                <button className={aspect === 9/16 ? "active" : ""} onClick={() => handleAspectChange(9 / 16)}>9:16</button>
              </div>
            </div>
          </aside>

          <main className="workspace">
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={aspect}>
              <div className="canvas-wrapper">
                <div className="vignette-overlay" style={{ 
                  background: `radial-gradient(circle, transparent ${Math.max(0, 60 - adj.vignette / 2)}%, rgba(0,0,0,${Math.min(adj.vignette / 100, 0.85)}) 100%)` 
                }}></div>
                <img 
                  ref={imgRef} 
                  src={imgSrc} 
                  alt="editor" 
                  onLoad={onImageLoad} 
                  crossOrigin="anonymous" 
                  style={{ filter: `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) sepia(${adj.temperature > 0 ? adj.temperature : 0}%) hue-rotate(${adj.temperature < 0 ? adj.temperature * 1.5 : 0}deg)` }} 
                />
              </div>
            </ReactCrop>
          </main>
        </div>
      )}
      <canvas ref={downloadCanvasRef} style={{ display: "none" }} />
    </div>
  );
}

export default App;