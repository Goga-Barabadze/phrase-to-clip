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

        // First, visit the homepage to establish a session (browser will handle cookies automatically)
        await fetch('https://www.playphrase.me/', {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
        }).catch(() => {
          // Ignore errors on homepage fetch - cookies might already be set
        });

        // Search for phrases
        const searchUrl = new URL('https://www.playphrase.me/api-langs/v1/phrases/search');
        searchUrl.searchParams.set('q', phrase);
        searchUrl.searchParams.set('limit', '5');
        searchUrl.searchParams.set('language', language);
        searchUrl.searchParams.set('platform', 'desktop safari');
        searchUrl.searchParams.set('skip', '0');

        const searchResponse = await fetch(searchUrl.toString(), {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text().catch(() => searchResponse.statusText);
          if (searchResponse.status === 403) {
            throw new Error(`Access denied (403). The API may require visiting playphrase.me in your browser first to establish a session. Error: ${errorText.substring(0, 100)}`);
          }
          throw new Error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}. ${errorText.substring(0, 100)}`);
        }

        const searchData = await searchResponse.json() as { results?: Array<{ video_id?: string; videoId?: string; _id?: string; id?: string }> } | Array<{ video_id?: string; videoId?: string; _id?: string; id?: string }>;
        
        const results = Array.isArray(searchData) ? searchData : (searchData?.results || []);
        
        if (results.length === 0) {
          setError('No videos found for this phrase');
          setLoading(false);
          return;
        }

        // Fetch video details for each result
        const videoPromises = results.slice(0, 5).map(async (result) => {
          const videoId = result.video_id || result.videoId || result._id || result.id;
          if (!videoId) {
            return null;
          }

          try {
            const videoUrl = new URL('https://www.playphrase.me/api/v1/phrases/video-view');
            videoUrl.searchParams.set('video-id', videoId);
            videoUrl.searchParams.set('platform', 'desktop safari');

            const videoResponse = await fetch(videoUrl.toString(), {
              method: 'GET',
              mode: 'cors',
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
              },
            });

            if (!videoResponse.ok) {
              return null;
            }

            const videoData = await videoResponse.json() as { video_url?: string; videoUrl?: string; url?: string; video?: string };
            return videoData.video_url || videoData.videoUrl || videoData.url || videoData.video || null;
          } catch {
            return null;
          }
        });

        const videoUrls = await Promise.all(videoPromises);
        const validVideos = videoUrls.filter((url): url is string => url !== null && url !== '');

        if (validVideos.length === 0) {
          setError('No videos could be loaded');
        } else {
          setVideos(validVideos);
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
