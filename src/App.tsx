import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Eye, Scan, Navigation, FileText, Loader2, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processImage, chatWithLume, LumeModule } from './lib/gemini';
import { useSpeech } from './hooks/useSpeech';
import { useShake } from './hooks/useShake';

export default function App() {
  const [module, setModule] = useState<LumeModule>('EYE_FEEL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { speak, listen, isSpeaking, isListening } = useSpeech();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      speak("I couldn't access your camera. Please check permissions.");
    }
  };

  const captureAndProcess = useCallback(async (isAutomated = false) => {
    if (isProcessing || isListening || isSpeaking || isQuotaExhausted || !videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);
    if (!isAutomated) {
      setResult('');
      speak("Processing...");
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Canvas context is unavailable.');
      setIsProcessing(false);
      return;
    }

    const maxWidth = 800;
    const maxHeight = 800;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width === 0 || height === 0) {
      console.warn('Video feed not ready yet (dimensions 0). Waiting briefly.');
      await new Promise(resolve => setTimeout(resolve, 500));
      width = video.videoWidth;
      height = video.videoHeight;
    }

    if (width === 0 || height === 0) {
      console.error('Unable to capture image: video dimensions are not ready.');
      if (!isAutomated) {
        speak('The camera feed is not ready yet. Please try again in a moment.');
      }
      setIsProcessing(false);
      return;
    }

    if (width > height) {
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
    }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.5);
      
      const startTime = Date.now();
      try {
        const description = await processImage(module, base64Image);
        
        // Ensure at least 4 seconds of "thinking" time
        const elapsed = Date.now() - startTime;
        if (elapsed < 4000) {
          await new Promise(resolve => setTimeout(resolve, 4000 - elapsed));
        }

        setResult(description);
        speak(description);
        lastScanTimeRef.current = Date.now(); // Reset scan timer after any scan
      } catch (error: any) {
        console.error("Processing error:", error);
        const errorStr = JSON.stringify(error).toUpperCase();
        const isQuotaError = 
          error?.status === 429 || 
          error?.error?.code === 429 ||
          errorStr.includes('429') || 
          errorStr.includes('RESOURCE_EXHAUSTED') ||
          errorStr.includes('QUOTA') ||
          errorStr.includes('EXCEEDED QUOTA');

        const isRpcError = 
          error?.status === 500 || 
          error?.error?.code === 500 ||
          errorStr.includes('500') || 
          errorStr.includes('RPC FAILED') ||
          errorStr.includes('XHR ERROR') ||
          errorStr.includes('UNKNOWN');

        if (isQuotaError) {
          setIsQuotaExhausted(true);
          setTimeout(() => setIsQuotaExhausted(false), 30000); // 30s cooldown
        }

        if (!isAutomated) {
          if (isQuotaError) {
            speak("I've reached my limit for now. Please wait 30 seconds before trying again.");
          } else if (isRpcError) {
            speak("I'm having trouble connecting to my brain. Please try again in a moment.");
          } else {
            speak("I encountered an error while processing the image.");
          }
        }
      } finally {
        setIsProcessing(false);
      }
  }, [module, isProcessing, speak, isSpeaking, isListening]);

  useShake(() => captureAndProcess(false));

  const switchModule = useCallback((newModule: LumeModule) => {
    setModule(newModule);
    setResult(''); // Clear text immediately
    if (newModule === 'READ_LUME') {
      speak("This is read mode. You can upload a document or a text-based image, then I will summarize it for you.");
    } else {
      speak("Switched to eye and feel mode for scene and navigation updates.");
    }
  }, [speak]);

  const handleVoiceCommand = useCallback(async (command: string) => {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('read') || lowerCommand.includes('document') || lowerCommand.includes('file') || lowerCommand.includes('upload')) {
      switchModule('READ_LUME');
      setTimeout(() => document.getElementById('file-upload')?.click(), 2000);
    } else if (lowerCommand.includes('eye') || lowerCommand.includes('feel') || lowerCommand.includes('describe') || lowerCommand.includes('navigate') || lowerCommand.includes('direction')) {
      switchModule('EYE_FEEL');
    } else if (lowerCommand.includes('capture') || lowerCommand.includes('take') || lowerCommand.includes('what')) {
      captureAndProcess(false);
    } else {
      // General question handling
      setIsProcessing(true);
      const startTime = Date.now();
      try {
        const answer = await chatWithLume(command, result);
        
        // Ensure at least 4 seconds of "thinking" time
        const elapsed = Date.now() - startTime;
        if (elapsed < 4000) {
          await new Promise(resolve => setTimeout(resolve, 4000 - elapsed));
        }

        setResult(answer);
        speak(answer);
      } catch (error: any) {
        console.error("Chat error:", error);
        const errorStr = JSON.stringify(error).toUpperCase();
        const isQuotaError = 
          error?.status === 429 || 
          error?.error?.code === 429 ||
          errorStr.includes('429') || 
          errorStr.includes('RESOURCE_EXHAUSTED') ||
          errorStr.includes('QUOTA') ||
          errorStr.includes('EXCEEDED QUOTA');

        const isRpcError = 
          error?.status === 500 || 
          error?.error?.code === 500 ||
          errorStr.includes('500') || 
          errorStr.includes('RPC FAILED') ||
          errorStr.includes('XHR ERROR') ||
          errorStr.includes('UNKNOWN');

        if (isQuotaError) {
          setIsQuotaExhausted(true);
          setTimeout(() => setIsQuotaExhausted(false), 30000); // 30s cooldown
        }

        if (isQuotaError) {
          speak("I've reached my limit for now. Please wait 30 seconds before trying again.");
        } else if (isRpcError) {
          speak("I'm having trouble connecting to my brain. Please try again in a moment.");
        } else {
          speak("I'm sorry, I couldn't answer that right now.");
        }
      } finally {
        setIsProcessing(false);
      }
    }
  }, [captureAndProcess, speak, result, isListening]);

  const prevIsSpeaking = useRef(false);
  const lastScanTimeRef = useRef<number>(Date.now());
  const lastBusyTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (prevIsSpeaking.current && !isSpeaking && result && !isProcessing && !isListening) {
      // Clear the text after LUME finishes speaking
      const timeout = setTimeout(() => {
        setResult('');
      }, 1500);
      return () => clearTimeout(timeout);
    }
    prevIsSpeaking.current = isSpeaking;
  }, [isSpeaking, result, isProcessing, isListening]);

  const startApp = useCallback(() => {
    setHasStarted(true);
    startCamera();
    speak("Welcome to LUME. Tap anywhere to describe your surroundings. I will automatically tell you about any food, drinks, allergens when you capture them, and navigation cues. If you want to ask a question, hold the screen then ask.");
  }, [speak]);

  useEffect(() => {
    if (!hasStarted) {
      const timer = setTimeout(() => {
        startApp();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [hasStarted, startApp]);

  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const handleLoaded = () => {
      console.log('Video metadata loaded:', video.videoWidth, video.videoHeight);
    };
    video.addEventListener('loadedmetadata', handleLoaded);
    return () => video.removeEventListener('loadedmetadata', handleLoaded);
  }, []);

  useEffect(() => {
    if (!hasStarted || module !== 'EYE_FEEL') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastScan = now - lastScanTimeRef.current;
      const timeSinceLastBusy = now - lastBusyTimeRef.current;

      // Automated scan logic:
      // 1. Must not be currently busy (speaking, processing, or listening)
      // 2. Must have been at least 60 seconds since the last automated scan
      // 3. Must have been at least 5 seconds since LUME last finished an interaction (speaking/processing/listening)
      if (!isSpeaking && !isProcessing && !isListening && 
          timeSinceLastScan >= 60000 && 
          timeSinceLastBusy >= 5000) {
        lastScanTimeRef.current = now;
        captureAndProcess(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hasStarted, module, isSpeaking, isProcessing, isListening, captureAndProcess]);

  const toggleListening = useCallback(() => {
    if (isListening || isSpeaking || isProcessing) return;
    if (isQuotaExhausted) {
      speak("I'm cooling down. Please wait 30 seconds.");
      return;
    }
    speak("Listening...");
    setTimeout(() => listen(handleVoiceCommand), 1000);
  }, [isListening, isSpeaking, isProcessing, isQuotaExhausted, speak, listen, handleVoiceCommand]);

  const [isLongPress, setIsLongPress] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = useCallback(() => {
    setIsLongPress(false);
    timerRef.current = setTimeout(() => {
      setIsLongPress(true);
      toggleListening();
    }, 600) as unknown as NodeJS.Timeout;
  }, [toggleListening]);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (!isLongPress) {
      captureAndProcess(false);
    }
  }, [isLongPress, captureAndProcess]);

  if (!hasStarted) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 font-sans">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center space-y-6"
        >
          <div className="w-32 h-32 bg-orange-500 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20">
            <Eye className="w-16 h-16 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-7xl font-black text-white tracking-tighter">LUME</h1>
            <p className="text-orange-500 font-bold tracking-[0.3em] uppercase text-sm">Your AI Companion</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden font-sans">
      {/* Full Screen Interaction Zone */}
      <div 
        className="flex-1 relative cursor-pointer"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        
        <canvas ref={canvasRef} className="hidden" />

        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          id="file-upload"
          aria-label="Upload document or text image"
          onChange={async (e) => {
            const input = e.target as HTMLInputElement | null;
            const file = input?.files?.[0];

            if (!file) {
              setIsProcessing(false);
              return;
            }

            setIsProcessing(true);
            const startTime = Date.now();
            speak("Reading document...");
            const reader = new FileReader();
              reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                try {
                  const summary = await processImage('READ_LUME', base64);
                  
                  // Ensure at least 4 seconds of "thinking" time
                  const elapsed = Date.now() - startTime;
                  if (elapsed < 4000) {
                    await new Promise(resolve => setTimeout(resolve, 4000 - elapsed));
                  }

                  setResult(summary);
                  speak(summary);
                } catch (error: any) {
                  console.error("Upload processing error:", error);
                  const errorStr = JSON.stringify(error).toUpperCase();
                  const isQuotaError = 
                    error?.status === 429 || 
                    error?.error?.code === 429 ||
                    errorStr.includes('429') || 
                    errorStr.includes('RESOURCE_EXHAUSTED') ||
                    errorStr.includes('QUOTA') ||
                    errorStr.includes('EXCEEDED QUOTA');

                  const isRpcError = 
                    error?.status === 500 || 
                    error?.error?.code === 500 ||
                    errorStr.includes('500') || 
                    errorStr.includes('RPC FAILED') ||
                    errorStr.includes('XHR ERROR') ||
                    errorStr.includes('UNKNOWN');

                  if (isQuotaError) {
                    setIsQuotaExhausted(true);
                    setTimeout(() => setIsQuotaExhausted(false), 30000); // 30s cooldown
                  }

                  if (isQuotaError) {
                    speak("I've reached my limit for now. Please wait 30 seconds before trying again.");
                  } else if (isRpcError) {
                    speak("I'm having trouble connecting to my brain. Please try again in a moment.");
                  } else {
                    speak("I encountered an error while processing the document.");
                  }
                } finally {
                  setIsProcessing(false);
                }
              };
              reader.onerror = () => {
                speak("I couldn't read the file. Please try again.");
                setIsProcessing(false);
              };
              reader.readAsDataURL(file);

          }}
        />

        <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10"
          >
            <div className={`w-2 h-2 rounded-full animate-pulse ${isQuotaExhausted ? 'bg-red-500' : 'bg-green-500'}`} />
            <span className="text-white text-xs font-bold tracking-widest uppercase">
              {isQuotaExhausted ? 'Quota Exhausted' : (module === 'EYE_FEEL' ? 'Eye Mode' : 'Read Mode')}
            </span>
          </motion.div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
          <AnimatePresence mode="wait">
            {isQuotaExhausted ? (
              <motion.div
                key="quota"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-red-500/20 backdrop-blur-md p-8 rounded-3xl border border-red-500/50 space-y-4 max-w-xs"
              >
                <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto" />
                <h2 className="text-xl font-bold text-white">Cooling Down</h2>
                <p className="text-red-200 text-sm">I've reached my limit. Please wait 30 seconds while I reset.</p>
              </motion.div>
            ) : isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <Loader2 className="w-16 h-16 text-orange-500 animate-spin mx-auto" />
                <p className="text-2xl font-medium text-white">LUME is thinking...</p>
              </motion.div>
            ) : isListening ? (
              <motion.div
                key="listening"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-4"
              >
                <div className="w-24 h-24 bg-red-500 rounded-full animate-pulse mx-auto flex items-center justify-center">
                  <Mic className="w-12 h-12 text-white" />
                </div>
                <p className="text-2xl font-medium text-white">Listening to you...</p>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6"
              >
                <p className="text-xl text-white leading-relaxed">{result}</p>
              </motion.div>
            ) : module === 'READ_LUME' ? (
              <motion.div
                key="read-mode-idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8 pointer-events-auto"
              >
                <div className="space-y-4">
                  <FileText className="w-20 h-20 text-blue-400 mx-auto" />
                  <h2 className="text-3xl font-bold text-white">Read Mode</h2>
                  <p className="text-gray-400 max-w-xs mx-auto">Upload a document or an image with text for a simple summary.</p>
                </div>
                
                <button
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-2xl font-bold py-6 px-12 rounded-2xl shadow-2xl transition-all active:scale-95 flex items-center gap-4 mx-auto"
                >
                  <Scan className="w-8 h-8" />
                  Upload Document
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <p className="text-2xl font-medium text-white">LUME is Ready</p>
                <p className="text-gray-400">Tap for scene, Hold for question</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-4 flex justify-around items-center">
        <button
          onClick={() => switchModule('EYE_FEEL')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            module === 'EYE_FEEL' ? 'text-orange-500' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Eye className="w-8 h-8" />
          <span className="text-sm font-medium">Eye Mode</span>
        </button>

        <button
          onClick={() => switchModule('READ_LUME')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            module === 'READ_LUME' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <FileText className="w-8 h-8" />
          <span className="text-sm font-medium">Read Mode</span>
        </button>
      </div>
    </div>
  );
}
