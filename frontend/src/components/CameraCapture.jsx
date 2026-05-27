import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, Check, AlertCircle } from 'lucide-react';

export default function CameraCapture({ onCapture, buttonText = "Capture Photo" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [capturedImg, setCapturedImg] = useState(null);
  
  // MediaPipe state
  const [mpLoaded, setMpLoaded] = useState(false);
  const [mpError, setMpError] = useState(false);
  
  // Validation state
  const [validationMsg, setValidationMsg] = useState("Initializing camera...");
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  
  const activeCameraRef = useRef(null);
  const activeDetectionRef = useRef(null);

  // Initialize MediaPipe face detection
  useEffect(() => {
    let active = true;
    let cameraInstance = null;
    let faceDetectionInstance = null;

    const initMediaPipe = async () => {
      // Check if MediaPipe is loaded from CDN
      let retries = 0;
      while (retries < 15) {
        if (window.FaceDetection && window.Camera) {
          break;
        }
        await new Promise(r => setTimeout(r, 300));
        retries++;
      }

      if (!window.FaceDetection || !window.Camera) {
        console.warn("MediaPipe CDN scripts failed to load. Running in fallback manual-capture mode.");
        if (active) {
          setMpError(true);
          setValidationMsg("Camera active (Manual Capture Mode)");
          setIsFaceValid(true); // Allow capture in fallback mode
        }
        startCamera();
        return;
      }

      if (!active) return;
      setMpLoaded(true);

      try {
        // Instantiate MediaPipe Face Detection
        faceDetectionInstance = new window.FaceDetection({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
        });

        faceDetectionInstance.setOptions({
          model: 'short', // short-range for selfies
          minDetectionConfidence: 0.55
        });

        faceDetectionInstance.onResults((results) => {
          if (!active || capturedImg) return;
          processFaceResults(results);
        });

        activeDetectionRef.current = faceDetectionInstance;
        startCamera();
      } catch (err) {
        console.error("Error setting up MediaPipe:", err);
        setMpError(true);
        startCamera();
      }
    };

    initMediaPipe();

    return () => {
      active = false;
      stopCamera(cameraInstance);
      if (faceDetectionInstance) {
        try {
          faceDetectionInstance.close();
        } catch (e) {}
      }
    };
  }, [capturedImg]);

  const startCamera = async () => {
    try {
      // Release any existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Configure media constraints - Mobile browser ready (user facing camera)
      const constraints = {
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Start MediaPipe camera loop if loaded
        if (window.Camera && activeDetectionRef.current && !mpError) {
          const cameraInstance = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && activeDetectionRef.current && !capturedImg) {
                try {
                  await activeDetectionRef.current.send({ image: videoRef.current });
                } catch (e) {
                  // Catch frame processing errors and log
                }
              }
            },
            width: 640,
            height: 480
          });
          
          activeCameraRef.current = cameraInstance;
          cameraInstance.start();
        } else {
          // Manual play if MediaPipe is not tracking
          videoRef.current.play().catch(e => console.error("Error playing video stream:", e));
        }
      }
      
      if (!mpLoaded || mpError) {
        setValidationMsg("Camera ready. Position your face in the frame.");
        setIsFaceValid(true);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setValidationMsg("Failed to access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = (customCamera = null) => {
    const cam = customCamera || activeCameraRef.current;
    if (cam) {
      try {
        cam.stop();
      } catch (e) {}
      activeCameraRef.current = null;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const processFaceResults = (results) => {
    const detections = results.detections || [];
    setFaceCount(detections.length);

    if (detections.length === 0) {
      setIsFaceValid(false);
      setValidationMsg("No face detected. Align your face inside the circle.");
      drawOverlay(null);
      return;
    }

    if (detections.length > 1) {
      setIsFaceValid(false);
      setValidationMsg("Multiple faces detected! Please ensure only one person is visible.");
      drawOverlay(null);
      return;
    }

    // Single face detected - validate centering
    const face = detections[0];
    const bbox = face.boundingBox; // { xCenter, yCenter, width, height }
    
    const { xCenter, yCenter, width, height } = bbox;
    
    // Face Validation Criteria:
    // 1. Center of the face should be in the middle area: x [0.35, 0.65], y [0.3, 0.7]
    // 2. Face size should be reasonable: width [0.15, 0.55]
    const isCentered = xCenter > 0.35 && xCenter < 0.65 && yCenter > 0.25 && yCenter < 0.70;
    const isGoodDistance = width > 0.18 && width < 0.60;

    if (!isCentered) {
      setIsFaceValid(false);
      setValidationMsg("Center your face in the screen.");
    } else if (!isGoodDistance) {
      setIsFaceValid(false);
      if (width <= 0.18) {
        setValidationMsg("Move closer to the camera.");
      } else {
        setValidationMsg("Move slightly further away.");
      }
    } else {
      setIsFaceValid(true);
      setValidationMsg("Face properly aligned. Ready to capture!");
    }

    drawOverlay(bbox);
  };

  // Draw optional bounding box on visual canvas
  const drawOverlay = (bbox) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!bbox) return;

    // Draw box on overlay
    const x = (1 - bbox.xCenter - bbox.width / 2) * canvas.width; // Account for mirror effect
    const y = (bbox.yCenter - bbox.height / 2) * canvas.height;
    const w = bbox.width * canvas.width;
    const h = bbox.height * canvas.height;

    ctx.strokeStyle = isFaceValid ? '#10B981' : '#EF4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    // Draw corner brackets
    ctx.fillStyle = isFaceValid ? '#10B981' : '#EF4444';
    const markerLen = 15;
    // Top Left
    ctx.fillRect(x - 2, y - 2, markerLen, 4);
    ctx.fillRect(x - 2, y - 2, 4, markerLen);
    // Top Right
    ctx.fillRect(x + w - markerLen + 2, y - 2, markerLen, 4);
    ctx.fillRect(x + w - 2, y - 2, 4, markerLen);
    // Bottom Left
    ctx.fillRect(x - 2, y + h - 2, markerLen, 4);
    ctx.fillRect(x - 2, y + h - markerLen + 2, 4, markerLen);
    // Bottom Right
    ctx.fillRect(x + w - markerLen + 2, y + h - 2, markerLen, 4);
    ctx.fillRect(x + w - 2, y + h - markerLen + 2, 4, markerLen);
  };

  const handleCapture = () => {
    if (!isFaceValid) return;

    const video = videoRef.current;
    if (!video) return;

    // Create an offscreen canvas to capture the photo
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 640;
    captureCanvas.height = 480;
    
    const ctx = captureCanvas.getContext('2d');
    
    // Apply mirror effect to captured image so it matches what user sees
    ctx.translate(captureCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    
    // Convert to base64 jpeg
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.90);
    
    setCapturedImg(dataUrl);
    stopCamera();
    setValidationMsg("Selfie captured successfully! Confirm or retake.");
  };

  const handleRetake = () => {
    setCapturedImg(null);
    setIsFaceValid(false);
    setValidationMsg("Position your face inside the frame...");
    // startCamera will run automatically via the useEffect trigger
  };

  const handleConfirm = () => {
    if (capturedImg && onCapture) {
      onCapture(capturedImg);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
      
      {/* Live Stream / Captured Image Card */}
      <div className="camera-container">
        {!capturedImg ? (
          <>
            <video
              ref={videoRef}
              className="camera-stream"
              playsInline
              autoPlay
              muted
            />
            {/* Canvas overlay for face bounding boxes */}
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
            />
            
            {/* Visual Guide Overlay */}
            <div className="camera-overlay">
              <div className={`camera-guide-circle ${isFaceValid ? 'success' : faceCount > 0 ? 'error' : ''}`}>
                <div className={`scanning-bar ${stream && !capturedImg ? 'active' : ''}`} />
              </div>
            </div>
          </>
        ) : (
          <img
            src={capturedImg}
            alt="Captured Selfie Preview"
            className="photo-preview"
          />
        )}
      </div>

      {/* Validation Banner */}
      <div className={`glass-card fade-in`} style={{ 
        width: '100%', 
        maxWidth: '480px',
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.75rem', 
        borderColor: isFaceValid ? 'var(--success-border)' : 'var(--border-glass)',
        background: isFaceValid ? 'var(--success-light)' : 'rgba(255, 255, 255, 0.02)',
        padding: '0.8rem 1rem'
      }}>
        {isFaceValid ? (
          <Check style={{ color: 'var(--success)', flexShrink: 0 }} size={20} />
        ) : (
          <AlertCircle style={{ color: 'var(--danger)', flexShrink: 0 }} size={20} />
        )}
        <span style={{ fontSize: '0.9rem', fontWeight: '500', color: isFaceValid ? 'var(--text-main)' : 'var(--text-muted)' }}>
          {validationMsg}
        </span>
      </div>

      {/* Camera Capture & Navigation Controls */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', width: '100%', maxWidth: '480px' }}>
        {!capturedImg ? (
          <button
            type="button"
            className="btn-primary"
            onClick={handleCapture}
            disabled={!isFaceValid || !stream}
            style={{ width: '100%' }}
          >
            <Camera size={18} />
            {buttonText}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRetake}
              style={{ flex: 1 }}
            >
              <RefreshCw size={16} />
              Retake Selfie
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              style={{ flex: 1 }}
            >
              <Check size={16} />
              Confirm Photo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
