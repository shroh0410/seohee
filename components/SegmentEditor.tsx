import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type Segment, type Frame } from '../types';
import { generateDescriptionForFrames } from '../services/geminiService';
import { TrashIcon, FilmIcon, ScissorsIcon, SparklesIcon, DownloadIcon } from './icons';

declare const GIF: any;

interface SegmentEditorProps {
  videoUrl: string;
  segment: Segment;
  onUpdate: (segment: Segment) => void;
  onRemove: (id: number) => void;
  canRemove: boolean;
}

const FRAMES_PER_SECOND = 10;

// Module-level cache for the worker script blob URL to avoid re-fetching
let workerScriptBlobUrl: string | null = null;

async function getWorkerScriptUrl(): Promise<string> {
    if (workerScriptBlobUrl) {
        return workerScriptBlobUrl;
    }
    
    try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
        if (!response.ok) throw new Error('Network response was not ok.');
        const scriptText = await response.text();
        const blob = new Blob([scriptText], { type: 'application/javascript' });
        workerScriptBlobUrl = URL.createObjectURL(blob);
        return workerScriptBlobUrl;
    } catch (e) {
        console.error("Failed to create worker blob URL, falling back to CDN.", e);
        // Fallback in case of fetch error, though it might still fail due to CORS.
        return 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js';
    }
}


export const SegmentEditor: React.FC<SegmentEditorProps> = ({ videoUrl, segment, onUpdate, onRemove, canRemove }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const url = segment.gifUrl;
    return () => {
        if (url) {
            URL.revokeObjectURL(url);
        }
    };
  }, [segment.gifUrl]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
       if (segment.timeRange.end === 1) { // Set initial end time if it's default
         onUpdate({...segment, timeRange: {start: 0, end: Math.min(5, videoRef.current.duration)}});
       }
    }
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>, part: 'start' | 'end') => {
    const value = parseFloat(e.target.value);
    const { start, end } = segment.timeRange;
    if (part === 'start' && value < end) {
      onUpdate({ ...segment, timeRange: { start: value, end } });
      if (videoRef.current) videoRef.current.currentTime = value;
    }
    if (part === 'end' && value > start) {
      onUpdate({ ...segment, timeRange: { start, end: value } });
       if (videoRef.current) videoRef.current.currentTime = value;
    }
  };

  const extractFrames = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    onUpdate({ ...segment, status: 'extracting', frames: [], selectedFrameRange: {start: null, end: null}, gifDescription: '' });

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { start, end } = segment.timeRange;
    const extractedFrames: Frame[] = [];
    const interval = 1 / FRAMES_PER_SECOND;

    for (let time = start; time <= end; time += interval) {
      video.currentTime = time;
      await new Promise<void>(resolve => {
        video.onseeked = () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          extractedFrames.push({ id: Math.random(), timestamp: time, dataUrl });
          resolve();
        };
      });
    }
    onUpdate({ ...segment, frames: extractedFrames, status: 'frames_ready' });
  }, [segment, onUpdate]);
  
  const handleFrameSelection = (frameId: number) => {
      const { start, end } = segment.selectedFrameRange;
      if (start === null) {
          onUpdate({ ...segment, selectedFrameRange: { start: frameId, end: null } });
      } else if (end === null) {
          const startIndex = segment.frames.findIndex(f => f.id === start);
          const newIndex = segment.frames.findIndex(f => f.id === frameId);
          if (newIndex < startIndex) {
               onUpdate({ ...segment, selectedFrameRange: { start: frameId, end: start } });
          } else {
               onUpdate({ ...segment, selectedFrameRange: { start: start, end: frameId } });
          }
      } else {
          onUpdate({ ...segment, selectedFrameRange: { start: frameId, end: null } });
      }
  };

  const generateGif = async () => {
    const { start, end } = segment.selectedFrameRange;
    if (start === null || end === null) return;

    onUpdate({ ...segment, status: 'generating', gifUrl: undefined, error: undefined });

    const startIndex = segment.frames.findIndex(f => f.id === start);
    const endIndex = segment.frames.findIndex(f => f.id === end);
    const selectedFrames = segment.frames.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);

    try {
        const workerScriptUrl = await getWorkerScriptUrl();

        const gifPromise = new Promise<string>((resolve, reject) => {
            const gif = new GIF({
                workers: 2,
                quality: 10,
                workerScript: workerScriptUrl,
            });

            const imageLoadPromises = selectedFrames.map(frame => {
                return new Promise<HTMLImageElement>(resolveImg => {
                    const img = new Image();
                    img.onload = () => resolveImg(img);
                    img.onerror = (err) => reject(new Error(`Failed to load frame image: ${err}`));
                    img.src = frame.dataUrl;
                });
            });

            Promise.all(imageLoadPromises).then(images => {
                images.forEach(img => {
                    gif.addFrame(img, { delay: 1000 / FRAMES_PER_SECOND });
                });

                gif.on('finished', (blob: Blob) => {
                    resolve(URL.createObjectURL(blob));
                });
                
                gif.render();
            }).catch(reject);
        });
        
        const descriptionPromise = generateDescriptionForFrames(selectedFrames.map(f => f.dataUrl));

        const [gifUrl, description] = await Promise.all([gifPromise, descriptionPromise]);
        onUpdate({ 
            ...segment, 
            gifDescription: description, 
            gifUrl,
            status: 'done' 
        });
    } catch (error) {
        console.error("Error generating GIF or description:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        onUpdate({ 
            ...segment, 
            status: 'error', 
            error: `Failed to generate GIF. ${errorMessage}`
        });
    }
  };
  
  const getFrameClassName = (frameId: number) => {
      const { start, end } = segment.selectedFrameRange;
      if(start === null) return 'opacity-70 hover:opacity-100';
      
      const frameIndex = segment.frames.findIndex(f => f.id === frameId);
      
      if(end === null) {
          return frameId === start ? 'ring-4 ring-cyan-400 opacity-100' : 'opacity-70 hover:opacity-100';
      }

      const startIndex = segment.frames.findIndex(f => f.id === start);
      const endIndex = segment.frames.findIndex(f => f.id === end);
      
      if (frameIndex >= Math.min(startIndex, endIndex) && frameIndex <= Math.max(startIndex, endIndex)) {
          return 'ring-2 ring-indigo-500 opacity-100';
      }
      return 'opacity-50 hover:opacity-80';
  };

  return (
    <div className="bg-gray-800/50 p-4 sm:p-6 rounded-2xl shadow-xl border border-gray-700 space-y-6">
      <div className="flex justify-between items-start">
        <h2 className="text-xl font-semibold text-indigo-300">GIF Segment</h2>
        {canRemove && (
          <button onClick={() => onRemove(segment.id)} className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded-full bg-gray-700/50 hover:bg-gray-700">
            <TrashIcon />
          </button>
        )}
      </div>
      
      <div className="max-w-2xl mx-auto">
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoadedMetadata}
          className="w-full rounded-lg shadow-md"
          controls
          muted
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* Step 1: Select Time Range */}
      <div className="space-y-4">
        <h3 className="font-medium flex items-center gap-2 text-gray-300"><ScissorsIcon />Step 1: Select Time Range</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
                <label className="text-sm">Start: {segment.timeRange.start.toFixed(2)}s</label>
                <input type="range" min="0" max={duration} step="0.01" value={segment.timeRange.start} onChange={(e) => handleRangeChange(e, 'start')} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
            <div>
                <label className="text-sm">End: {segment.timeRange.end.toFixed(2)}s</label>
                <input type="range" min="0" max={duration} step="0.01" value={segment.timeRange.end} onChange={(e) => handleRangeChange(e, 'end')} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
            </div>
        </div>
        <button onClick={extractFrames} disabled={segment.status === 'extracting'} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed">
          {segment.status === 'extracting' ? 'Extracting...' : 'Extract Frames'} <FilmIcon />
        </button>
      </div>

      {/* Step 2: Select Frames */}
      {['extracting', 'frames_ready', 'generating', 'done', 'error'].includes(segment.status) && segment.frames.length > 0 && (
          <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2 text-gray-300"><FilmIcon />Step 2: Select Frame Range for GIF</h3>
              <div className="flex overflow-x-auto space-x-2 p-2 bg-gray-900/50 rounded-lg">
                  {segment.frames.map((frame) => (
                      <img
                          key={frame.id}
                          src={frame.dataUrl}
                          alt={`Frame at ${frame.timestamp.toFixed(2)}s`}
                          onClick={() => handleFrameSelection(frame.id)}
                          className={`h-24 rounded-md cursor-pointer transition-all duration-200 ${getFrameClassName(frame.id)}`}
                      />
                  ))}
              </div>
               <button onClick={generateGif} disabled={segment.selectedFrameRange.start === null || segment.selectedFrameRange.end === null || segment.status === 'generating'} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed">
                 {segment.status === 'generating' ? 'Generating...' : 'Create GIF!'} <SparklesIcon />
               </button>
          </div>
      )}
      
      {/* Step 3: Result */}
      {segment.status === 'generating' && <div className="text-center p-4">Generating your GIF and description with AI...</div>}
      {segment.status === 'done' && (
          <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2 text-gray-300"><SparklesIcon />Step 3: Your GIF is Ready!</h3>
              <div className="flex flex-col md:flex-row gap-4 items-start">
                  {segment.gifUrl && (
                      <div className="flex-shrink-0 relative group">
                          <img src={segment.gifUrl} alt="Generated GIF" className="max-w-xs w-full rounded-lg shadow-lg" />
                          <a 
                              href={segment.gifUrl} 
                              download={`video-to-gif-${segment.id}.gif`}
                              className="absolute bottom-2 right-2 flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 text-white rounded-md hover:bg-black/80 transition-all duration-300 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                              aria-label="Download GIF"
                          >
                              <DownloadIcon />
                              <span>Download</span>
                          </a>
                      </div>
                  )}
                  <div className="flex-grow bg-gray-700/50 p-4 rounded-lg italic border-l-4 border-indigo-400">
                      <p className="text-gray-300">{segment.gifDescription}</p>
                  </div>
              </div>
          </div>
      )}
      {segment.status === 'error' && <p className="text-red-400 text-center p-4 bg-red-900/20 rounded-lg">{segment.error}</p>}
    </div>
  );
};