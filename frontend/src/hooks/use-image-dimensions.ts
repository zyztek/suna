import { useState, useEffect } from 'react';

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

export function useImageDimensions(src?: string): {
  dimensions: ImageDimensions | null;
  isLoading: boolean;
  error: string | null;
} {
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setDimensions(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const img = new Image();
    
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const aspectRatio = width / height;
      
      let orientation: 'portrait' | 'landscape' | 'square';
      if (aspectRatio > 1.1) {
        orientation = 'landscape';
      } else if (aspectRatio < 0.9) {
        orientation = 'portrait';
      } else {
        orientation = 'square';
      }

      setDimensions({
        width,
        height,
        aspectRatio,
        orientation,
      });
      setIsLoading(false);
    };

    img.onerror = () => {
      setError('Failed to load image');
      setIsLoading(false);
      setDimensions(null);
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return { dimensions, isLoading, error };
} 