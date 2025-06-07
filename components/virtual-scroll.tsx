'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { cn } from '@/lib/utils';

interface VirtualScrollProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string | number;
  className?: string;
  overscan?: number; // Number of items to render outside visible area
  onScroll?: (scrollTop: number) => void;
  loading?: boolean;
  loadingComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
}

export function VirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  getItemKey,
  className,
  overscan = 5,
  onScroll,
  loading = false,
  loadingComponent,
  emptyComponent,
}: VirtualScrollProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = e.currentTarget.scrollTop;
      setScrollTop(scrollTop);
      onScroll?.(scrollTop);
    },
    [onScroll],
  );

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / itemHeight) - overscan,
    );
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  // Auto-scroll to bottom when new items are added (useful for chat)
  const scrollToBottom = useCallback(() => {
    if (scrollElementRef.current) {
      scrollElementRef.current.scrollTop =
        scrollElementRef.current.scrollHeight;
    }
  }, []);

  // Scroll to specific item
  const scrollToItem = useCallback(
    (index: number) => {
      if (scrollElementRef.current) {
        const targetScrollTop = index * itemHeight;
        scrollElementRef.current.scrollTop = targetScrollTop;
      }
    },
    [itemHeight],
  );

  // Show loading state
  if (loading) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        style={{ height: containerHeight }}
      >
        {loadingComponent || <div>Loading...</div>}
      </div>
    );
  }

  // Show empty state
  if (items.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        style={{ height: containerHeight }}
      >
        {emptyComponent || <div>No items</div>}
      </div>
    );
  }

  return (
    <div
      ref={scrollElementRef}
      className={cn('overflow-auto', className)}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => {
            const actualIndex = visibleRange.startIndex + index;
            return (
              <div
                key={getItemKey(item, actualIndex)}
                style={{ height: itemHeight }}
                className="virtual-scroll-item"
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Hook for virtual scroll utilities
export function useVirtualScroll<T>(items: T[]) {
  const [scrollTop, setScrollTop] = useState(0);

  const scrollToBottom = useCallback(
    (containerRef: React.RefObject<HTMLElement>) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    },
    [],
  );

  const scrollToItem = useCallback(
    (
      index: number,
      itemHeight: number,
      containerRef: React.RefObject<HTMLElement>,
    ) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = index * itemHeight;
      }
    },
    [],
  );

  return {
    scrollTop,
    setScrollTop,
    scrollToBottom,
    scrollToItem,
  };
}

// Enhanced virtual scroll with variable item heights
interface VariableVirtualScrollProps<T> {
  items: T[];
  estimatedItemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string | number;
  getItemHeight?: (item: T, index: number) => number;
  className?: string;
  overscan?: number;
}

export function VariableVirtualScroll<T>({
  items,
  estimatedItemHeight,
  containerHeight,
  renderItem,
  getItemKey,
  getItemHeight,
  className,
  overscan = 5,
}: VariableVirtualScrollProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [itemHeights, setItemHeights] = useState<number[]>([]);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<HTMLDivElement[]>([]);

  // Measure item heights
  useEffect(() => {
    const heights = items.map((item, index) => {
      if (getItemHeight) {
        return getItemHeight(item, index);
      }
      // Use measured height from DOM if available
      const element = itemRefs.current[index];
      return element?.getBoundingClientRect().height || estimatedItemHeight;
    });
    setItemHeights(heights);
  }, [items, estimatedItemHeight, getItemHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible range based on actual heights
  const visibleRange = useMemo(() => {
    let currentHeight = 0;
    let startIndex = 0;
    let endIndex = items.length - 1;

    // Find start index
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights[i] || estimatedItemHeight;
      if (currentHeight + height > scrollTop) {
        startIndex = Math.max(0, i - overscan);
        break;
      }
      currentHeight += height;
    }

    // Find end index
    currentHeight = 0;
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights[i] || estimatedItemHeight;
      currentHeight += height;
      if (currentHeight > scrollTop + containerHeight) {
        endIndex = Math.min(items.length - 1, i + overscan);
        break;
      }
    }

    return { startIndex, endIndex };
  }, [
    scrollTop,
    containerHeight,
    itemHeights,
    estimatedItemHeight,
    overscan,
    items.length,
  ]);

  const visibleItems = items.slice(
    visibleRange.startIndex,
    visibleRange.endIndex + 1,
  );

  // Calculate total height and offset
  const totalHeight = itemHeights.reduce(
    (sum, height) => sum + (height || estimatedItemHeight),
    0,
  );
  const offsetY = itemHeights
    .slice(0, visibleRange.startIndex)
    .reduce((sum, height) => sum + (height || estimatedItemHeight), 0);

  return (
    <div
      ref={scrollElementRef}
      className={cn('overflow-auto', className)}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => {
            const actualIndex = visibleRange.startIndex + index;
            return (
              <div
                key={getItemKey(item, actualIndex)}
                ref={(el) => {
                  if (el) itemRefs.current[actualIndex] = el;
                }}
                className="variable-virtual-scroll-item"
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
