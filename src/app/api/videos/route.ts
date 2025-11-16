import { NextRequest, NextResponse } from 'next/server';

interface PhraseResult {
  _id?: string;
  video_id?: string;
  videoId?: string;
  id?: string;
  [key: string]: string | undefined;
}

interface VideoResponse {
  video_url?: string;
  videoUrl?: string;
  url?: string;
  video?: string;
  [key: string]: string | undefined;
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15';

async function searchPhrases(q: string, language: string, limit: number = 5): Promise<PhraseResult[]> {
  const searchUrl = new URL('https://www.playphrase.me/api-langs/v1/phrases/search');
  searchUrl.searchParams.set('q', q);
  searchUrl.searchParams.set('limit', limit.toString());
  searchUrl.searchParams.set('language', language);
  searchUrl.searchParams.set('platform', 'desktop safari');
  searchUrl.searchParams.set('skip', '0');

  const response = await fetch(searchUrl.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Token',
      'Sec-Fetch-Site': 'same-origin',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Mode': 'cors',
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.playphrase.me/',
      'Sec-Fetch-Dest': 'empty',
    },
  });

  if (!response.ok) {
    throw new Error(`Search API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { results?: PhraseResult[] } | PhraseResult[] | PhraseResult;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

async function getVideoDetails(videoId: string): Promise<string> {
  const videoUrl = new URL('https://www.playphrase.me/api/v1/phrases/video-view');
  videoUrl.searchParams.set('video-id', videoId);
  videoUrl.searchParams.set('platform', 'desktop safari');

  const response = await fetch(videoUrl.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Token',
      'Sec-Fetch-Site': 'same-origin',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Mode': 'cors',
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.playphrase.me/',
      'Sec-Fetch-Dest': 'empty',
    },
  });

  if (!response.ok) {
    throw new Error(`Video API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as VideoResponse;
  // Try different possible field names for video URL
  return data.video_url || data.videoUrl || data.url || data.video || '';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phrase = searchParams.get('phrase');
    const language = searchParams.get('language') || 'en';

    if (!phrase) {
      return NextResponse.json(
        { error: 'Missing required parameter: phrase' },
        { status: 400 }
      );
    }

    // Search for phrases
    const results: PhraseResult[] = await searchPhrases(phrase, language, 5);

    if (results.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    // Fetch video details for each result
    const videoPromises = results.map((result) => {
      // Try different possible field names for video ID
      const videoId = result.video_id || result.videoId || result._id || result.id;
      if (!videoId) {
        console.error('No video ID found in result:', result);
        return Promise.resolve(null);
      }
      return getVideoDetails(videoId).catch((error) => {
        console.error(`Failed to fetch video ${videoId}:`, error);
        return null;
      });
    });

    const videoUrls = await Promise.all(videoPromises);
    const validVideos = videoUrls.filter((url): url is string => url !== null && url !== '');

    return NextResponse.json({ videos: validVideos });
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

