import { useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
  errorMessage?: string;
}

export function useRateLimit(options: RateLimitOptions) {
  const { maxAttempts, windowMs, errorMessage = 'Too many requests. Please try again later.' } = options;
  const attemptsRef = useRef<Array<number>>([]);

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    
    // Remove attempts outside the time window
    attemptsRef.current = attemptsRef.current.filter(
      timestamp => now - timestamp < windowMs
    );

    // Check if limit exceeded
    if (attemptsRef.current.length >= maxAttempts) {
      const remainingTime = Math.ceil(
        (attemptsRef.current[0] + windowMs - now) / 1000
      );
      toast.error(`${errorMessage} Try again in ${remainingTime} seconds.`);
      return false;
    }

    // Record this attempt
    attemptsRef.current.push(now);
    return true;
  }, [maxAttempts, windowMs, errorMessage]);

  const reset = useCallback(() => {
    attemptsRef.current = [];
  }, []);

  return { checkRateLimit, reset };
}

