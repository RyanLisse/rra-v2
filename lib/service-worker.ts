'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ServiceWorkerManager {
  register(): Promise<ServiceWorkerRegistration | null>;
  unregister(): Promise<boolean>;
  update(): Promise<void>;
  isSupported(): boolean;
  sendMessage(message: any): void;
}

class ServiceWorkerManagerImpl implements ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator;
  }

  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) {
      console.warn('Service Workers are not supported in this browser');
      return null;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      console.log('Service Worker registered successfully:', this.registration);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration?.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, notify user
              this.notifyUpdate();
            }
          });
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleMessage);

      return this.registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return true;
    }

    try {
      const result = await this.registration.unregister();
      console.log('Service Worker unregistered:', result);
      this.registration = null;
      return result;
    } catch (error) {
      console.error('Service Worker unregistration failed:', error);
      return false;
    }
  }

  async update(): Promise<void> {
    if (!this.registration) {
      throw new Error('No service worker registration found');
    }

    try {
      await this.registration.update();
      console.log('Service Worker update triggered');
    } catch (error) {
      console.error('Service Worker update failed:', error);
    }
  }

  sendMessage(message: any): void {
    if (!navigator.serviceWorker.controller) {
      console.warn('No service worker controller available');
      return;
    }

    navigator.serviceWorker.controller.postMessage(message);
  }

  private handleMessage = (event: MessageEvent) => {
    const { type, payload } = event.data;
    
    switch (type) {
      case 'CACHE_UPDATED':
        console.log('Cache updated:', payload);
        break;
      case 'OFFLINE_READY':
        console.log('App is ready for offline use');
        break;
      default:
        console.log('Unknown message from service worker:', event.data);
    }
  };

  private notifyUpdate(): void {
    // Notify user about available update
    const event = new CustomEvent('sw-update-available');
    window.dispatchEvent(event);
  }

  // Utility methods for cache management
  clearCache(cacheName?: string): void {
    this.sendMessage({
      type: 'CLEAR_CACHE',
      payload: { cacheName },
    });
  }

  cacheUrls(urls: string[]): void {
    this.sendMessage({
      type: 'CACHE_URLS',
      payload: { urls },
    });
  }

  skipWaiting(): void {
    this.sendMessage({
      type: 'SKIP_WAITING',
    });
  }
}

// Singleton instance
const serviceWorkerManager = new ServiceWorkerManagerImpl();

export default serviceWorkerManager;

// React hook for service worker
export function useServiceWorker() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Register service worker
    serviceWorkerManager.register().then((registration) => {
      setIsRegistered(!!registration);
    });

    // Listen for update notifications
    const handleUpdate = () => setIsUpdateAvailable(true);
    window.addEventListener('sw-update-available', handleUpdate);

    // Listen for online/offline status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener('sw-update-available', handleUpdate);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateApp = useCallback(() => {
    serviceWorkerManager.skipWaiting();
    window.location.reload();
  }, []);

  const clearCache = useCallback((cacheName?: string) => {
    serviceWorkerManager.clearCache(cacheName);
  }, []);

  return {
    isRegistered,
    isUpdateAvailable,
    isOffline,
    updateApp,
    clearCache,
    serviceWorker: serviceWorkerManager,
  };
}

// Preload critical resources
export function preloadCriticalResources() {
  if (!serviceWorkerManager.isSupported()) return;

  const criticalUrls = [
    '/',
    '/chat',
    '/documents',
    // Add other critical routes
  ];

  serviceWorkerManager.cacheUrls(criticalUrls);
}

// Performance monitoring
export function trackServiceWorkerPerformance() {
  if (!serviceWorkerManager.isSupported()) return;

  // Track cache hit rates
  let cacheHits = 0;
  let totalRequests = 0;

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    totalRequests++;
    const response = await originalFetch(...args);
    
    if (response.headers.get('X-Cache') === 'HIT') {
      cacheHits++;
    }

    // Log cache performance periodically
    if (totalRequests % 10 === 0) {
      const hitRate = (cacheHits / totalRequests * 100).toFixed(1);
      console.log(`Cache hit rate: ${hitRate}% (${cacheHits}/${totalRequests})`);
    }

    return response;
  };
}