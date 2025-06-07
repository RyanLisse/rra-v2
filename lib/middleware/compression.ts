import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { gzip, deflate } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);

interface CompressionConfig {
  threshold?: number; // Minimum response size to compress (bytes)
  algorithms?: ('gzip' | 'deflate' | 'br')[];
  level?: number; // Compression level (1-9)
}

const defaultConfig: CompressionConfig = {
  threshold: 1024, // 1KB
  algorithms: ['gzip', 'deflate'],
  level: 6,
};

export async function compressResponse(
  response: NextResponse,
  request: NextRequest,
  config: CompressionConfig = defaultConfig
): Promise<NextResponse> {
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const contentType = response.headers.get('content-type') || '';
  
  // Only compress text-based responses
  if (!shouldCompress(contentType)) {
    return response;
  }
  
  // Get response body
  const originalBody = await response.text();
  
  // Check if response meets threshold
  if (originalBody.length < (config.threshold || 1024)) {
    return new NextResponse(originalBody, {
      status: response.status,
      headers: response.headers,
    });
  }
  
  // Determine best compression algorithm
  const algorithm = getBestCompression(acceptEncoding, config.algorithms || ['gzip']);
  
  if (!algorithm) {
    return new NextResponse(originalBody, {
      status: response.status,
      headers: response.headers,
    });
  }
  
  try {
    let compressedBody: Buffer;
    const inputBuffer = Buffer.from(originalBody, 'utf8');
    
    switch (algorithm) {
      case 'gzip':
        compressedBody = await gzipAsync(inputBuffer, { level: config.level || 6 });
        break;
      case 'deflate':
        compressedBody = await deflateAsync(inputBuffer, { level: config.level || 6 });
        break;
      default:
        return new NextResponse(originalBody, {
          status: response.status,
          headers: response.headers,
        });
    }
    
    // Create new response with compressed body
    const headers = new Headers(response.headers);
    headers.set('content-encoding', algorithm);
    headers.set('content-length', compressedBody.length.toString());
    headers.set('vary', 'accept-encoding');
    
    // Add compression ratio for monitoring
    const ratio = ((originalBody.length - compressedBody.length) / originalBody.length * 100).toFixed(1);
    headers.set('x-compression-ratio', `${ratio}%`);
    
    return new NextResponse(compressedBody, {
      status: response.status,
      headers,
    });
    
  } catch (error) {
    console.error('Compression failed:', error);
    return new NextResponse(originalBody, {
      status: response.status,
      headers: response.headers,
    });
  }
}

function shouldCompress(contentType: string): boolean {
  const compressibleTypes = [
    'application/json',
    'application/javascript',
    'application/xml',
    'text/',
    'application/hal+json',
    'application/ld+json',
  ];
  
  return compressibleTypes.some(type => contentType.includes(type));
}

function getBestCompression(
  acceptEncoding: string,
  supportedAlgorithms: string[]
): string | null {
  const accepted = acceptEncoding.toLowerCase();
  
  // Order of preference
  const preferences = ['gzip', 'deflate', 'br'];
  
  for (const algorithm of preferences) {
    if (supportedAlgorithms.includes(algorithm) && accepted.includes(algorithm)) {
      return algorithm;
    }
  }
  
  return null;
}

// Utility to estimate compression savings
export function estimateCompressionSavings(text: string): {
  original: number;
  estimated: number;
  savings: string;
} {
  const original = Buffer.byteLength(text, 'utf8');
  // Rough estimation: JSON typically compresses to 60-80% of original size
  const estimated = Math.round(original * 0.7);
  const savings = ((original - estimated) / original * 100).toFixed(1);
  
  return { original, estimated, savings: `${savings}%` };
}