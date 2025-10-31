export interface Frame {
  id: number;
  timestamp: number;
  dataUrl: string;
}

export type Status = 'idle' | 'extracting' | 'frames_ready' | 'generating' | 'done' | 'error';

export interface Segment {
  id: number;
  timeRange: {
    start: number;
    end: number;
  };
  frames: Frame[];
  selectedFrameRange: {
    start: number | null;
    end: number | null;
  };
  gifDescription: string;
  status: Status;
  gifUrl?: string;
  error?: string;
}