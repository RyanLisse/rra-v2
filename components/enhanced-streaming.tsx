'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { SparklesIcon } from './icons';
import { cn } from '@/lib/utils';

interface StreamingIndicatorProps {
  isStreaming: boolean;
  progress?: number;
  className?: string;
}

export function StreamingIndicator({
  isStreaming,
  progress = 0,
  className,
}: StreamingIndicatorProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : `${prev}.`));
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn('flex items-center gap-2 text-muted-foreground', className)}
    >
      <div className="size-4 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        >
          <SparklesIcon size={12} />
        </motion.div>
      </div>
      <span className="text-sm">Thinking{dots}</span>
      {progress > 0 && (
        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  );
}

interface TypingIndicatorProps {
  isVisible: boolean;
}

export function TypingIndicator({ isVisible }: TypingIndicatorProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg max-w-fit"
        >
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-muted-foreground rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">AI is typing...</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MessageLoadingSkeletonProps {
  lines?: number;
}

export function MessageLoadingSkeleton({
  lines = 3,
}: MessageLoadingSkeletonProps) {
  return (
    <div className="flex gap-4 w-full">
      <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
        <div className="translate-y-px">
          <SparklesIcon size={14} />
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-2xl">
        {Array.from({ length: lines }).map((_, i) => (
          <motion.div
            key={i}
            className="h-4 bg-muted rounded animate-pulse"
            style={{
              width: i === lines - 1 ? '60%' : '100%',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}

interface StreamingMessageProps {
  content: string;
  isComplete: boolean;
  showCursor?: boolean;
}

export function StreamingMessage({
  content,
  isComplete,
  showCursor = true,
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');

  useEffect(() => {
    if (content.length === 0) {
      setDisplayedContent('');
      return;
    }

    // Simulate character-by-character streaming for better UX
    const targetLength = content.length;
    const currentLength = displayedContent.length;

    if (currentLength < targetLength) {
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentLength + 1));
      }, 10); // Adjust speed as needed

      return () => clearTimeout(timeout);
    }
  }, [content, displayedContent]);

  return (
    <div className="relative">
      <span>{displayedContent}</span>
      {!isComplete && showCursor && (
        <motion.span
          className="inline-block w-0.5 h-4 bg-foreground ml-0.5"
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: 1,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'easeInOut',
          }}
        />
      )}
    </div>
  );
}

interface ProcessingStepsProps {
  steps: Array<{
    id: string;
    label: string;
    status: 'pending' | 'processing' | 'complete' | 'error';
  }>;
}

export function ProcessingSteps({ steps }: ProcessingStepsProps) {
  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
      <h4 className="text-sm font-medium text-muted-foreground">Processing</h4>
      <div className="space-y-1">
        {steps.map((step) => (
          <motion.div
            key={step.id}
            className="flex items-center gap-2 text-sm"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div
              className={cn('w-2 h-2 rounded-full', {
                'bg-muted-foreground': step.status === 'pending',
                'bg-blue-500 animate-pulse': step.status === 'processing',
                'bg-green-500': step.status === 'complete',
                'bg-red-500': step.status === 'error',
              })}
            />
            <span
              className={cn('text-muted-foreground', {
                'text-foreground': step.status === 'processing',
                'text-green-600 dark:text-green-400':
                  step.status === 'complete',
                'text-red-600 dark:text-red-400': step.status === 'error',
              })}
            >
              {step.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
