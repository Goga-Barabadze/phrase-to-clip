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

// Try to get cookies and CSRF token from environment variables first
function getAuthFromEnv(): { cookies?: string; csrfToken?: string } {
  // In Cloudflare Workers, use globalThis or request context for env vars
  // For Next.js on Cloudflare, environment variables are available via process.env in Node.js context
  // but may need to be passed through the request context in Workers
  try {
    const cookies = typeof process !== 'undefined' && process.env ? process.env.PLAYPHRASE_COOKIES : undefined;
    const csrfToken = typeof process !== 'undefined' && process.env ? process.env.PLAYPHRASE_CSRF_TOKEN : undefined;
    return { cookies, csrfToken };
  } catch {
    return {};
  }
}

async function getSessionCookies(): Promise<{ cookies: string; csrfToken: string }> {
  // First, try to get from environment variables
  const envAuth = getAuthFromEnv();
  if (envAuth.cookies && envAuth.csrfToken) {
    return { cookies: envAuth.cookies, csrfToken: envAuth.csrfToken };
  }

  try {
    // Fetch the homepage to get cookies and CSRF token
    const response = await fetch('https://www.playphrase.me/', {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.playphrase.me/',
      },
    });

    if (!response.ok) {
      return { cookies: '', csrfToken: '' };
    }

    // Parse all Set-Cookie headers properly
    let setCookieHeaders: string[] = [];
    try {
      if (typeof response.headers.getSetCookie === 'function') {
        setCookieHeaders = response.headers.getSetCookie();
      } else {
        // Fallback: try to get set-cookie header and parse it
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
          setCookieHeaders = [setCookieHeader];
        }
      }
    } catch {
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        setCookieHeaders = [setCookieHeader];
      }
    }
    
    const cookies = setCookieHeaders
      .map(cookie => {
        const nameValue = cookie.split(';')[0].trim();
        return nameValue;
      })
      .filter(Boolean)
      .join('; ');

    // Try to extract CSRF token from HTML
    const html = await response.text();
    let csrfToken = '';
    
    // Try multiple patterns to find CSRF token
    const patterns = [
      /name=["']csrf[_-]?token["'][^>]*value=["']([^"']+)/i,
      /csrf[_-]?token['":\s]*['"]?([a-zA-Z0-9+\/=]+)/i,
      /["']_token["']:\s*["']([^"']+)/i,
      /meta[^>]*name=["']csrf[_-]?token["'][^>]*content=["']([^"']+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        csrfToken = match[1];
        break;
      }
    }

    // If we found cookies but no CSRF token, try fetching from a search page
    if (cookies && !csrfToken) {
      try {
        const searchTest = await fetch('https://www.playphrase.me/api-langs/v1/phrases/search?q=test&limit=1&language=en&platform=desktop%20safari&skip=0', {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'Cookie': cookies,
            'Referer': 'https://www.playphrase.me/',
          },
        });
        // Check if it works without CSRF token (some APIs don't need it for GET)
        if (searchTest.ok) {
          // Token might not be needed for GET requests
          csrfToken = '';
        }
      } catch {
        // Ignore
      }
    }

    return { cookies, csrfToken };
  } catch {
    return { cookies: '', csrfToken: '' };
  }
}

async function searchPhrases(q: string, language: string, limit: number = 5, cookies?: string, csrfToken?: string): Promise<PhraseResult[]> {
  const searchUrl = new URL('https://www.playphrase.me/api-langs/v1/phrases/search');
  searchUrl.searchParams.set('q', q);
  searchUrl.searchParams.set('limit', limit.toString());
  searchUrl.searchParams.set('language', language);
  searchUrl.searchParams.set('platform', 'desktop safari');
  searchUrl.searchParams.set('skip', '0');

  const headers: Record<string, string> = {
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
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }
  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(searchUrl.toString(), {
    method: 'GET',
    headers,
    cf: {
      cacheTtl: 3600,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    // Try to get more details from the response
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Search API failed: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 200)}`);
  }

  const responseText = await response.text();
  console.log('Search API raw response:', responseText.substring(0, 500));
  
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Failed to parse JSON response:', responseText.substring(0, 200));
    return [];
  }

  console.log('Search API parsed data type:', typeof data, 'Is array:', Array.isArray(data));
  if (Array.isArray(data)) {
    console.log('Search API returned array with', data.length, 'items');
    if (data.length > 0) {
      console.log('First item structure:', JSON.stringify(data[0]).substring(0, 300));
    }
    return data as PhraseResult[];
  }
  
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    console.log('Search API returned object with keys:', Object.keys(obj));
    
    if ('results' in obj && Array.isArray(obj.results)) {
      console.log('Found results array with', obj.results.length, 'items');
      if (obj.results.length > 0) {
        console.log('First result structure:', JSON.stringify(obj.results[0]).substring(0, 300));
      }
      return obj.results as PhraseResult[];
    }
    
    // Try other common property names
    if ('data' in obj && Array.isArray(obj.data)) {
      console.log('Found data array with', obj.data.length, 'items');
      return obj.data as PhraseResult[];
    }
    if ('items' in obj && Array.isArray(obj.items)) {
      console.log('Found items array with', obj.items.length, 'items');
      return obj.items as PhraseResult[];
    }
  }
  
  console.log('No valid results found in response structure');
  return [];
}

async function getVideoDetails(videoId: string, cookies?: string, csrfToken?: string): Promise<string> {
  const videoUrl = new URL('https://www.playphrase.me/api/v1/phrases/video-view');
  videoUrl.searchParams.set('video-id', videoId);
  videoUrl.searchParams.set('platform', 'desktop safari');

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': USER_AGENT,
    'Referer': 'https://www.playphrase.me/',
    'Origin': 'https://www.playphrase.me',
    'Content-Type': 'application/json',
    'Authorization': 'Token',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }
  if (csrfToken) {
    headers['X-Csrf-Token'] = csrfToken;
  }

  const response = await fetch(videoUrl.toString(), {
    method: 'GET',
    headers,
    cf: {
      cacheTtl: 3600,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Video API failed: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 200)}`);
  }

  const responseText = await response.text();
  console.log('Video details API raw response:', responseText.substring(0, 500));
  
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Failed to parse video details JSON:', responseText.substring(0, 200));
    return '';
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    console.log('Video details object keys:', Object.keys(obj));
    
    // Try different possible field names for video URL
    const videoUrl = obj.video_url || obj.videoUrl || obj.url || obj.video || obj.video_src || obj.src;
    if (videoUrl && typeof videoUrl === 'string') {
      return videoUrl;
    }
  }
  
  console.log('No video URL found in response');
  return '';
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

    // Get session cookies and CSRF token first
    const { cookies, csrfToken } = await getSessionCookies();

    // Search for phrases
    const results: PhraseResult[] = await searchPhrases(phrase, language, 5, cookies, csrfToken);

    if (results.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    console.log('Processing', results.length, 'search results');
    
    // Fetch video details for each result
    const videoPromises = results.map((result, index) => {
      console.log(`Result ${index}:`, JSON.stringify(result).substring(0, 200));
      
      // Try different possible field names for video ID
      const videoId = result.video_id || result.videoId || result._id || result.id;
      if (!videoId) {
        console.error('No video ID found in result:', JSON.stringify(result));
        return Promise.resolve(null);
      }
      
      console.log(`Fetching video details for ID: ${videoId}`);
      return getVideoDetails(videoId, cookies, csrfToken).then((url) => {
        console.log(`Got video URL for ${videoId}:`, url ? url.substring(0, 100) : 'null');
        return url;
      }).catch((error) => {
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

