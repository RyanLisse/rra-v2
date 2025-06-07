'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Edit2,
  RotateCcw,
  Copy,
  Trash2,
  GitBranch,
  Check,
  X,
} from 'lucide-react';
import type { UIMessage } from 'ai';
import { toast } from './toast';

interface MessageActionsMenuProps {
  message: UIMessage;
  onEdit: () => void;
  onRegenerate: () => void;
  onBranch: () => void;
  onDelete: () => void;
  isLoading: boolean;
}

export function MessageActionsMenu({
  message,
  onEdit,
  onRegenerate,
  onBranch,
  onDelete,
  isLoading,
}: MessageActionsMenuProps) {
  const handleCopy = async () => {
    try {
      const text =
        message.parts?.find((part) => part.type === 'text')?.text || '';
      await navigator.clipboard.writeText(text);
      toast({
        type: 'success',
        description: 'Message copied to clipboard',
      });
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to copy message',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={isLoading}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {message.role === 'user' && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit message
          </DropdownMenuItem>
        )}
        {message.role === 'assistant' && (
          <DropdownMenuItem onClick={onRegenerate} disabled={isLoading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Regenerate
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onBranch}>
          <GitBranch className="h-4 w-4 mr-2" />
          Branch conversation
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-2" />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface EditMessageFormProps {
  message: UIMessage;
  onSave: (newContent: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function EditMessageForm({
  message,
  onSave,
  onCancel,
  isLoading,
}: EditMessageFormProps) {
  const [content, setContent] = useState(
    message.parts?.find((part) => part.type === 'text')?.text || '',
  );

  const handleSave = () => {
    if (content.trim()) {
      onSave(content.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3"
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[100px]"
        placeholder="Edit your message..."
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isLoading || !content.trim()}
        >
          <Check className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}

interface ConversationBranchProps {
  fromMessageId: string;
  onCreateBranch: (newMessage: string) => void;
  onCancel: () => void;
}

export function ConversationBranch({
  fromMessageId,
  onCreateBranch,
  onCancel,
}: ConversationBranchProps) {
  const [message, setMessage] = useState('');

  const handleCreate = () => {
    if (message.trim()) {
      onCreateBranch(message.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-4 border rounded-lg bg-muted/50 space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <GitBranch className="h-4 w-4" />
        Create conversation branch
      </div>
      <p className="text-sm text-muted-foreground">
        Start a new conversation thread from this point.
      </p>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What would you like to explore instead?"
        className="min-h-[80px]"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleCreate} disabled={!message.trim()}>
          Create branch
        </Button>
      </div>
    </motion.div>
  );
}

interface MessageVersionSelectorProps {
  versions: Array<{
    id: string;
    content: string;
    timestamp: Date;
    isActive: boolean;
  }>;
  onSelectVersion: (versionId: string) => void;
}

export function MessageVersionSelector({
  versions,
  onSelectVersion,
}: MessageVersionSelectorProps) {
  if (versions.length <= 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span>Version:</span>
      <div className="flex gap-1">
        {versions.map((version, index) => (
          <Button
            key={version.id}
            variant={version.isActive ? 'default' : 'outline'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onSelectVersion(version.id)}
          >
            {index + 1}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}

interface RegenerateOptionsProps {
  onRegenerate: (options: RegenerateOptions) => void;
  onCancel: () => void;
}

interface RegenerateOptions {
  temperature?: number;
  model?: string;
  prompt?: string;
}

export function RegenerateOptions({
  onRegenerate,
  onCancel,
}: RegenerateOptionsProps) {
  const [temperature, setTemperature] = useState(0.7);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleRegenerate = () => {
    onRegenerate({
      temperature,
      prompt: customPrompt || undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-4 border rounded-lg bg-muted/50 space-y-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <RotateCcw className="h-4 w-4" />
        Regenerate options
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">
            Temperature: {temperature}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(Number.parseFloat(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>More focused</span>
            <span>More creative</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">
            Custom prompt (optional)
          </label>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Add specific instructions for regeneration..."
            className="mt-1"
            rows={2}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleRegenerate}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Regenerate
        </Button>
      </div>
    </motion.div>
  );
}
