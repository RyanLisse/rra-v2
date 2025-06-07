'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { 
  Menu, 
  ChevronUp, 
  ChevronDown,
  Search,
  MessageSquare,
  FileText,
  Settings,
  Home,
  Mic,
  MicOff,
  Camera,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface MobileNavigationProps {
  children: React.ReactNode;
  onNavigate: (route: string) => void;
  currentRoute: string;
}

export function MobileNavigation({ 
  children, 
  onNavigate, 
  currentRoute 
}: MobileNavigationProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  const navigationItems = [
    { id: 'home', label: 'Home', icon: Home, route: '/' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, route: '/chat' },
    { id: 'documents', label: 'Documents', icon: FileText, route: '/documents' },
    { id: 'search', label: 'Search', icon: Search, route: '/search' },
    { id: 'settings', label: 'Settings', icon: Settings, route: '/settings' },
  ];

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Mobile Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <nav className="space-y-2 mt-6">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                    currentRoute === item.route 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  )}
                  onClick={() => {
                    onNavigate(item.route);
                    setIsOpen(false);
                  }}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <h1 className="font-semibold">RoboRail Assistant</h1>

        <div className="w-8" /> {/* Spacer for balance */}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t bg-background">
        <div className="grid grid-cols-5 gap-1 p-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                currentRoute === item.route 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onNavigate(item.route)}
            >
              <item.icon className="h-4 w-4" />
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  className?: string;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  className
}: SwipeableCardProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 100;
    
    if (info.offset.x > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (info.offset.x < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }
    
    setDragOffset(0);
  };

  return (
    <motion.div
      className={cn("touch-pan-y", className)}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onDrag={(event, info) => setDragOffset(info.offset.x)}
      style={{
        x: dragOffset,
        opacity: isDragging ? 0.8 : 1,
      }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  );
}

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function PullToRefresh({ 
  children, 
  onRefresh, 
  threshold = 80 
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      setCanRefresh(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canRefresh || isRefreshing) return;
    
    const touch = e.touches[0];
    const startY = touch.clientY;
    
    if (startY > 0 && containerRef.current?.scrollTop === 0) {
      const distance = Math.max(0, Math.min(threshold * 1.5, startY / 3));
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
    setCanRefresh(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-auto h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence>
        {(pullDistance > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 flex justify-center pt-4 z-10"
            style={{ transform: `translateY(${pullDistance}px)` }}
          >
            <div className="bg-background border rounded-full p-2 shadow-lg">
              {isRefreshing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                >
                  <ChevronUp className="h-4 w-4" />
                </motion.div>
              ) : (
                <ChevronDown 
                  className={cn(
                    "h-4 w-4 transition-transform",
                    pullDistance >= threshold && "rotate-180"
                  )} 
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div style={{ transform: `translateY(${pullDistance}px)` }}>
        {children}
      </div>
    </div>
  );
}

interface MobileChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onVoiceInput?: () => void;
  onImageCapture?: () => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function MobileChatInput({
  value,
  onChange,
  onSend,
  onVoiceInput,
  onImageCapture,
  isLoading,
  placeholder = "Type a message..."
}: MobileChatInputProps) {
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [inputHeight, setInputHeight] = useState('auto');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleVoiceToggle = () => {
    setIsVoiceRecording(!isVoiceRecording);
    onVoiceInput?.();
  };

  return (
    <div className="border-t bg-background p-3">
      <div className="flex items-end gap-2">
        {/* Voice Input Button */}
        {onVoiceInput && (
          <Button
            variant={isVoiceRecording ? "destructive" : "ghost"}
            size="sm"
            className="mb-1"
            onClick={handleVoiceToggle}
          >
            {isVoiceRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Text Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-h-32"
            rows={1}
            style={{ height: inputHeight }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
        </div>

        {/* Camera Button */}
        {onImageCapture && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-1"
            onClick={onImageCapture}
          >
            <Camera className="h-4 w-4" />
          </Button>
        )}

        {/* Send Button */}
        <Button
          size="sm"
          className="mb-1"
          onClick={onSend}
          disabled={isLoading || !value.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Voice Recording Indicator */}
      <AnimatePresence>
        {isVoiceRecording && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded-lg flex items-center gap-2"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-red-500 rounded-full"
                  animate={{
                    height: [4, 12, 4],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Number.POSITIVE_INFINITY,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>
            <span className="text-sm text-red-600 dark:text-red-400">
              Recording... Tap mic to stop
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FloatingActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}

export function FloatingActionButton({
  onClick,
  icon,
  label,
  position = 'bottom-right',
  className
}: FloatingActionButtonProps) {
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  return (
    <motion.div
      className={cn(
        "fixed z-50",
        positionClasses[position]
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Button
        onClick={onClick}
        className={cn(
          "h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow",
          className
        )}
        aria-label={label}
      >
        {icon}
      </Button>
    </motion.div>
  );
}

// Mobile-optimized virtual keyboard handler
export function useVirtualKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.clientHeight;
      const heightDifference = documentHeight - windowHeight;
      
      if (heightDifference > 150) { // Threshold for keyboard detection
        setKeyboardHeight(heightDifference);
        setIsKeyboardVisible(true);
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}