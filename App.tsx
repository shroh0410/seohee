
import React, { useState, useCallback } from 'react';
import { type Segment } from './types';
import { VideoUploader } from './components/VideoUploader';
import { SegmentEditor } from './components/SegmentEditor';
import { PlusIcon } from './components/icons';

const App: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);

  const handleVideoUpload = (file: File) => {
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    // Initialize with one segment
    setSegments([{
      id: Date.now(),
      timeRange: { start: 0, end: 1 },
      frames: [],
      selectedFrameRange: { start: null, end: null },
      gifDescription: '',
      status: 'idle',
    }]);
  };

  const addSegment = () => {
    setSegments(prev => [...prev, {
      id: Date.now(),
      timeRange: { start: 0, end: 1 },
      frames: [],
      selectedFrameRange: { start: null, end: null },
      gifDescription: '',
      status: 'idle',
    }]);
  };

  const updateSegment = useCallback((updatedSegment: Segment) => {
    setSegments(prev => prev.map(s => s.id === updatedSegment.id ? updatedSegment : s));
  }, []);

  const removeSegment = (id: number) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            Video to GIF Creator
          </h1>
          <p className="text-gray-400 mt-1">
            Upload a video, select segments, and generate animated GIFs.
          </p>
        </div>
      </header>
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!videoFile ? (
          <VideoUploader onVideoUpload={handleVideoUpload} />
        ) : (
          <div className="space-y-8">
            {segments.map((segment) => (
              <SegmentEditor
                key={segment.id}
                videoUrl={videoUrl!}
                segment={segment}
                onUpdate={updateSegment}
                onRemove={removeSegment}
                canRemove={segments.length > 1}
              />
            ))}
            <div className="flex justify-center">
              <button
                onClick={addSegment}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 shadow-lg"
              >
                <PlusIcon />
                Add Another GIF Segment
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
