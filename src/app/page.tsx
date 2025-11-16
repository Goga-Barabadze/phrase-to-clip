'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function VideoPlayer() {
  const searchParams = useSearchParams();
  const phrase = searchParams.get('phrase');
  const language = searchParams.get('language') || 'en';
  
  const [videos, setVideos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
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

        const data = await response.json() as { videos?: string[] } | null;
        if (data?.videos && data.videos.length > 0) {
          setVideos(data.videos);
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
    video.play().catch((err) => {
      console.error('Error playing video:', err);
    });
  }, [currentIndex, videos]);

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
