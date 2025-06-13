'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('App Error:', error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Er is iets misgegaan</h2>
        <p className="text-sm text-muted-foreground">
          Er is een onverwachte fout opgetreden. Probeer het opnieuw.
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Probeer opnieuw
      </Button>
    </div>
  );
}