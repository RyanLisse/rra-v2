'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Keyboard,
  Command,
  Search,
  MessageSquare,
  Settings,
  Moon,
  Copy,
  Edit,
  RotateCcw,
} from 'lucide-react';

interface KeyboardShortcut {
  id: string;
  key: string[];
  description: string;
  category: 'navigation' | 'chat' | 'editing' | 'search' | 'general';
  action: () => void;
  icon?: React.ReactNode;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.contentEditable === 'true';

      for (const shortcut of shortcuts) {
        const keys = shortcut.key;
        const isMatch = keys.every((key) => {
          switch (key) {
            case 'cmd':
            case 'ctrl':
              return event.metaKey || event.ctrlKey;
            case 'shift':
              return event.shiftKey;
            case 'alt':
              return event.altKey;
            case 'escape':
              return event.key === 'Escape';
            default:
              return event.key.toLowerCase() === key.toLowerCase();
          }
        });

        if (isMatch) {
          // Don't prevent default for some shortcuts when input is focused
          const allowInInput =
            ['cmd', 'ctrl'].some((modifier) => keys.includes(modifier)) &&
            ['c', 'v', 'x', 'z', 'y', 'a'].includes(event.key.toLowerCase());

          if (isInputFocused && !allowInInput) {
            continue;
          }

          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
}

export function KeyboardShortcutsDialog({
  isOpen,
  onClose,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  const categoryIcons = {
    navigation: <Command className="h-4 w-4" />,
    chat: <MessageSquare className="h-4 w-4" />,
    editing: <Edit className="h-4 w-4" />,
    search: <Search className="h-4 w-4" />,
    general: <Settings className="h-4 w-4" />,
  };

  const categoryLabels = {
    navigation: 'Navigation',
    chat: 'Chat & Messages',
    editing: 'Editing',
    search: 'Search',
    general: 'General',
  };

  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcut[]>,
  );

  const formatKey = (key: string) => {
    const keyMap: Record<string, string> = {
      cmd: '⌘',
      ctrl: 'Ctrl',
      shift: '⇧',
      alt: '⌥',
      escape: 'Esc',
      enter: '↵',
      space: 'Space',
      tab: 'Tab',
      arrowup: '↑',
      arrowdown: '↓',
      arrowleft: '←',
      arrowright: '→',
    };

    return keyMap[key.toLowerCase()] || key.toUpperCase();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-6">
          {Object.entries(groupedShortcuts).map(
            ([category, categoryShortcuts]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  {categoryIcons[category as keyof typeof categoryIcons]}
                  <h3 className="font-medium">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </h3>
                </div>

                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {shortcut.icon}
                        <span className="text-sm">{shortcut.description}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {shortcut.key.map((key, index) => (
                          <div key={index} className="flex items-center">
                            <Badge
                              variant="outline"
                              className="text-xs px-2 py-1"
                            >
                              {formatKey(key)}
                            </Badge>
                            {index < shortcut.key.length - 1 && (
                              <span className="mx-1 text-muted-foreground">
                                +
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Press{' '}
            <Badge variant="outline" className="text-xs">
              ?
            </Badge>{' '}
            anytime to view shortcuts
          </p>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Toast notification for keyboard shortcuts
export function ShortcutToast({
  message,
  keys,
  isVisible,
}: {
  message: string;
  keys: string[];
  isVisible: boolean;
}) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-4 right-4 z-50"
        >
          <Card className="p-3 bg-background/95 backdrop-blur shadow-lg border">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{message}</span>
              <div className="flex items-center gap-1 ml-2">
                {keys.map((key, index) => (
                  <div key={index} className="flex items-center">
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      {key}
                    </Badge>
                    {index < keys.length - 1 && (
                      <span className="mx-1 text-muted-foreground text-xs">
                        +
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Default shortcuts for the application
export function useDefaultShortcuts({
  onNewChat,
  onSearch,
  onToggleTheme,
  onCopyMessage,
  onEditMessage,
  onRegenerateMessage,
  onShowShortcuts,
  onNavigateUp,
  onNavigateDown,
  onFocusInput,
}: {
  onNewChat?: () => void;
  onSearch?: () => void;
  onToggleTheme?: () => void;
  onCopyMessage?: () => void;
  onEditMessage?: () => void;
  onRegenerateMessage?: () => void;
  onShowShortcuts?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onFocusInput?: () => void;
}) {
  const shortcuts: KeyboardShortcut[] = [
    // Navigation
    {
      id: 'new-chat',
      key: ['cmd', 'n'],
      description: 'Start new chat',
      category: 'navigation',
      action: onNewChat || (() => {}),
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: 'focus-input',
      key: ['cmd', 'k'],
      description: 'Focus chat input',
      category: 'navigation',
      action: onFocusInput || (() => {}),
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: 'navigate-up',
      key: ['arrowup'],
      description: 'Navigate up in chat',
      category: 'navigation',
      action: onNavigateUp || (() => {}),
    },
    {
      id: 'navigate-down',
      key: ['arrowdown'],
      description: 'Navigate down in chat',
      category: 'navigation',
      action: onNavigateDown || (() => {}),
    },

    // Search
    {
      id: 'search',
      key: ['cmd', 'f'],
      description: 'Search documents',
      category: 'search',
      action: onSearch || (() => {}),
      icon: <Search className="h-4 w-4" />,
    },

    // Chat & Messages
    {
      id: 'copy-message',
      key: ['cmd', 'c'],
      description: 'Copy selected message',
      category: 'chat',
      action: onCopyMessage || (() => {}),
      icon: <Copy className="h-4 w-4" />,
    },
    {
      id: 'edit-message',
      key: ['e'],
      description: 'Edit message',
      category: 'editing',
      action: onEditMessage || (() => {}),
      icon: <Edit className="h-4 w-4" />,
    },
    {
      id: 'regenerate',
      key: ['cmd', 'r'],
      description: 'Regenerate response',
      category: 'chat',
      action: onRegenerateMessage || (() => {}),
      icon: <RotateCcw className="h-4 w-4" />,
    },

    // General
    {
      id: 'toggle-theme',
      key: ['cmd', 'shift', 't'],
      description: 'Toggle dark/light theme',
      category: 'general',
      action: onToggleTheme || (() => {}),
      icon: <Moon className="h-4 w-4" />,
    },
    {
      id: 'show-shortcuts',
      key: ['?'],
      description: 'Show keyboard shortcuts',
      category: 'general',
      action: onShowShortcuts || (() => {}),
      icon: <Keyboard className="h-4 w-4" />,
    },
  ];

  return shortcuts;
}

// Accessibility improvements hook
export function useAccessibilityAnnouncements() {
  const [announcer, setAnnouncer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create screen reader announcer element
    const div = document.createElement('div');
    div.setAttribute('aria-live', 'polite');
    div.setAttribute('aria-atomic', 'true');
    div.className = 'sr-only';
    document.body.appendChild(div);
    setAnnouncer(div);

    return () => {
      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }
    };
  }, []);

  const announce = (message: string) => {
    if (announcer) {
      announcer.textContent = message;
    }
  };

  return { announce };
}
