'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Database, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useDatabaseProvider } from '@/lib/providers/database-provider-simple';
import { toast } from 'sonner';

interface DatabaseSelectorProps {
  className?: string;
  onDatabaseChange?: (database: string) => void;
}

export function DatabaseSelector({
  className,
  onDatabaseChange,
}: DatabaseSelectorProps) {
  const {
    selectedProvider,
    availableProviders,
    switchProvider,
    isLoading,
  } = useDatabaseProvider();

  const handleDatabaseChange = async (value: string) => {
    try {
      const success = await switchProvider(value);
      if (success) {
        const providerName = availableProviders.find(p => p.id === value)?.name;
        toast.success(`Switched to ${providerName}`);
        onDatabaseChange?.(value);
      }
    } catch (err) {
      toast.error('Failed to switch database');
    }
  };

  const getStatusIcon = (provider: any) => {
    if (isLoading) {
      return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    }
    if (provider.isConnected) {
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    }
    return <XCircle className="h-3 w-3 text-gray-400" />;
  };

  return (
    <div className={`flex items-center ${className}`}>
      <Select
        value={selectedProvider?.id || ''}
        onValueChange={handleDatabaseChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full min-w-[140px] max-w-[200px] h-8 text-xs">
          <Database className="h-3 w-3 mr-1 flex-shrink-0" />
          <SelectValue placeholder="Database" className="truncate" />
          {selectedProvider && (
            <div className="ml-1 flex-shrink-0">
              {getStatusIcon(selectedProvider)}
            </div>
          )}
        </SelectTrigger>
        <SelectContent className="min-w-[200px]">
          {availableProviders.map((provider) => (
            <SelectItem
              key={provider.id}
              value={provider.id}
              disabled={!provider.isAvailable}
              className="py-2"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium truncate pr-2">
                  {provider.name}
                </span>
                <div className="flex-shrink-0">
                  {getStatusIcon(provider)}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}