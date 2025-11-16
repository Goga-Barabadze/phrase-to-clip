'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function VideoPlayer() {
  const searchParams = useSearchParams();
  const phrase = searchParams.get('phrase');
  const language = searchParams.get('language') || 'en';
  
  interface Subtitle {
    text: string;
    start: number;
    end: number;
    words?: Array<{
      start?: number;
      end?: number;
      text?: string;
      score?: number;
      index?: number;
    }>;
  }

  const [videos, setVideos] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!phrase) {
        setError('Please provide a phrase parameter in the URL');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/videos?phrase=${encodeURIComponent(phrase)}&language=${encodeURIComponent(language)}`);
        
        if (!response.ok) {
          const errorData = await response.json() as { error?: string } | null;
          throw new Error(errorData?.error || 'Failed to fetch videos');
        }

        const data = await response.json() as { videos?: string[]; subtitles?: Subtitle[] } | null;
        if (data?.videos && data.videos.length > 0) {
          // Set videos and subtitles (will loop even if less than 5)
          setVideos(data.videos);
          setSubtitles(data.subtitles || []);
          // Reset to first video when new videos are loaded
          setCurrentIndex(0);
        } else {
          setError('No videos found for this phrase');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [phrase, language]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videos.length === 0) return;

    const handleEnded = () => {
      setCurrentIndex((prev) => {
        // Loop back to 0 when reaching the end (works for any number of videos)
        const next = (prev + 1) % videos.length;
        return next;
      });
    };

    const handleError = () => {
      // Skip to next video on error
      setCurrentIndex((prev) => {
        const next = (prev + 1) % videos.length;
        return next;
      });
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [videos, currentIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videos.length === 0) return;

    video.src = videos[currentIndex];
    video.load();
    
    // Update subtitle when video changes
    if (subtitles[currentIndex]) {
      setCurrentSubtitle(subtitles[currentIndex].text);
    }
    
    video.play().catch((err) => {
      console.error('Error playing video:', err);
    });
  }, [currentIndex, videos, subtitles]);

  // Update subtitle text and highlight current word as video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitles[currentIndex]) return;

    const updateSubtitle = () => {
      // Convert video time to milliseconds (word start/end are in milliseconds from API)
      const currentTimeMs = video.currentTime * 1000;
      const subtitle = subtitles[currentIndex];
      
      // Always show the subtitle text for this clip
      setCurrentSubtitle(subtitle.text);
      
      // Find which word is currently being spoken using word timings
      // Word timings are relative to the clip start (0), so use directly
      if (subtitle.words && subtitle.words.length > 0) {
        let wordIndex = -1;
        
        // Find the word whose timing window contains the current time
        for (let i = 0; i < subtitle.words.length; i++) {
          const word = subtitle.words[i];
          const wordStart = word.start ?? 0;
          const wordEnd = word.end ?? 0;
          
          // Check if current time is within this word's timing window
          if (currentTimeMs >= wordStart && currentTimeMs <= wordEnd) {
            wordIndex = i;
            break;
          }
        }
        
        setCurrentWordIndex(wordIndex);
      } else {
        // No word timing data available
        setCurrentWordIndex(-1);
      }
    };

    video.addEventListener('timeupdate', updateSubtitle);
    
    // Initial subtitle set
    if (subtitles[currentIndex]) {
      setCurrentSubtitle(subtitles[currentIndex].text);
      setCurrentWordIndex(-1);
    }

    return () => {
      video.removeEventListener('timeupdate', updateSubtitle);
    };
  }, [currentIndex, subtitles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const requestFullscreen = async () => {
      try {
        interface FullscreenElement extends HTMLElement {
          webkitRequestFullscreen?: () => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        }
        const fullscreenContainer = container as FullscreenElement;
        
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (fullscreenContainer.webkitRequestFullscreen) {
          await fullscreenContainer.webkitRequestFullscreen();
        } else if (fullscreenContainer.mozRequestFullScreen) {
          await fullscreenContainer.mozRequestFullScreen();
        } else if (fullscreenContainer.msRequestFullscreen) {
          await fullscreenContainer.msRequestFullscreen();
        }
      } catch (err) {
        console.error('Error requesting fullscreen:', err);
      }
    };

    if (videos.length > 0 && !loading) {
      requestFullscreen();
    }
  }, [videos, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div>Loading videos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-red-500 mb-4">Error: {error}</div>
          <div className="text-sm text-gray-400">
            Usage: ?phrase=your+phrase&language=en
          </div>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div>No videos available</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex items-center justify-center"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={false}
      />
      {currentSubtitle && subtitles[currentIndex] && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-lg text-xl font-medium max-w-4xl text-center">
          {subtitles[currentIndex].words && subtitles[currentIndex].words.length > 0 ? (
            // Render with word-by-word highlighting
            <span>
              {subtitles[currentIndex].words.map((word, index) => (
                <span
                  key={index}
                  className={index === currentWordIndex ? 'text-yellow-400 font-bold' : ''}
                >
                  {word.text || ''}
                  {index < subtitles[currentIndex].words!.length - 1 && ' '}
                </span>
              ))}
            </span>
          ) : (
            // Fallback to plain text if no word data
            currentSubtitle
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div>Loading...</div>
      </div>
    }>
      <VideoPlayer />
    </Suspense>
  );
}
