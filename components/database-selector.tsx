'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Database, CheckCircle, XCircle, Loader2, RefreshCw, HelpCircle, FileText, Settings, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseProvider } from '@/lib/providers/database-provider-simple';
import { toast } from 'sonner';
import { useState } from 'react';
import { t } from '@/lib/translations/dutch';

interface DatabaseSelectorProps {
  className?: string;
  onDatabaseChange?: (database: string) => void;
  showRefreshButton?: boolean;
  compact?: boolean;
}

export function DatabaseSelector({
  className,
  onDatabaseChange,
  showRefreshButton = true,
  compact = false,
}: DatabaseSelectorProps) {
  const {
    selectedProvider,
    availableProviders,
    switchProvider,
    isLoading,
    error,
    refreshProviders,
  } = useDatabaseProvider();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleDatabaseChange = async (value: string) => {
    try {
      const success = await switchProvider(value);
      if (success) {
        toast.success(`Overgeschakeld naar ${availableProviders.find(p => p.id === value)?.name}`);
        onDatabaseChange?.(value);
      } else {
        toast.error('Kan niet overschakelen naar geselecteerde database');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Onbekende fout';
      toast.error(`Fout bij het schakelen: ${errorMessage}`);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProviders();
      toast.success('Database status bijgewerkt');
    } catch (err) {
      toast.error('Kan database status niet bijwerken');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = (provider: any) => {
    if (isLoading) {
      return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    }
    if (!provider.isAvailable) {
      return <XCircle className="h-3 w-3 text-red-500" />;
    }
    if (provider.isConnected) {
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    }
    return <XCircle className="h-3 w-3 text-yellow-500" />;
  };

  const getStatusText = (provider: any) => {
    if (!provider.isAvailable) return t('database_status_unavailable');
    if (provider.isConnected) return t('database_status_connected');
    return t('database_status_disconnected');
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'all_documents':
        return <Database className="h-4 w-4" />;
      case 'roborail_manuals':
        return <FileText className="h-4 w-4" />;
      case 'faq_troubleshooting':
        return <AlertTriangle className="h-4 w-4" />;
      case 'calibration_guides':
        return <Settings className="h-4 w-4" />;
      case 'openai_vector_store':
        return <Zap className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getProviderTooltip = (providerId: string) => {
    switch (providerId) {
      case 'all_documents':
        return t('database_all_tooltip');
      case 'roborail_manuals':
        return t('database_manuals_tooltip');
      case 'faq_troubleshooting':
        return t('database_faq_tooltip');
      case 'calibration_guides':
        return t('database_calibration_tooltip');
      case 'openai_vector_store':
        return 'AI-powered semantic search met geavanceerde tekstbegrip en contextuele antwoorden';
      default:
        return t('database_help');
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Select
          value={selectedProvider?.id || ''}
          onValueChange={handleDatabaseChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[180px]">
            <Database className="h-4 w-4 mr-1" />
            <SelectValue placeholder="Selecteer database" />
            {selectedProvider && getStatusIcon(selectedProvider)}
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((provider) => (
              <SelectItem
                key={provider.id}
                value={provider.id}
                disabled={!provider.isAvailable}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium">{provider.name}</span>
                  {getStatusIcon(provider)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {showRefreshButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`space-y-3 ${className}`}>
        {/* Database Selector Header */}
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-zinc-700">{t('database_selector_title')}</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-zinc-400 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p>{t('database_help')}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selectedProvider?.id || ''}
            onValueChange={handleDatabaseChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[300px]">
              {selectedProvider ? getProviderIcon(selectedProvider.id) : <Database className="h-4 w-4" />}
              <SelectValue placeholder={t('select_database')} className="ml-2" />
            </SelectTrigger>
            <SelectContent>
              {availableProviders.map((provider) => (
                <SelectItem
                  key={provider.id}
                  value={provider.id}
                  disabled={!provider.isAvailable}
                >
                  <div className="flex flex-col space-y-1 w-full">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(provider.id)}
                        <span className="font-medium">{provider.name}</span>
                      </div>
                      {getStatusIcon(provider)}
                    </div>
                    <div className="flex items-center justify-between w-full text-xs">
                      <span className="text-muted-foreground pr-2">{getProviderTooltip(provider.id)}</span>
                      <span className={`flex-shrink-0 ${
                        provider.isConnected 
                          ? 'text-green-600' 
                          : provider.isAvailable 
                            ? 'text-yellow-600' 
                            : 'text-red-600'
                      }`}>
                        {getStatusText(provider)}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showRefreshButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Vernieuwen
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('database_refresh_tooltip')}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

      {error && (
        <div className="rounded-md bg-red-50 p-2 border border-red-200">
          <div className="flex items-start">
            <XCircle className="h-4 w-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <strong>Database verbindingsfout:</strong>
              <div className="mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

        {/* Current Selection Info */}
        {selectedProvider && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {getProviderIcon(selectedProvider.id)}
              <span className="text-sm font-medium text-blue-800">
                Actieve kennisbank: {selectedProvider.name}
              </span>
              {selectedProvider.isConnected && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className="text-xs text-blue-700">
              {getProviderTooltip(selectedProvider.id)}
            </div>
          </div>
        )}

        {/* Quick Usage Guide */}
        <div className="text-xs text-zinc-600 space-y-1 bg-zinc-50 p-3 rounded-lg border">
          <div className="font-medium text-zinc-700 mb-2">Snelle gids voor kennisbank selectie:</div>
          <div className="flex items-center gap-2">
            <Database className="h-3 w-3 text-zinc-500" />
            <span><strong>Alle Documenten:</strong> Voor algemene vragen over RoboRail</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-3 w-3 text-zinc-500" />
            <span><strong>Handleidingen:</strong> Voor operationele procedures en systeeminfo</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-zinc-500" />
            <span><strong>FAQ & Troubleshooting:</strong> Voor problemen en oplossingen</span>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="h-3 w-3 text-zinc-500" />
            <span><strong>Kalibratie Gidsen:</strong> Voor kalibratie en alignment procedures</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-zinc-500" />
            <span><strong>OpenAI Vector Store:</strong> AI-aangedreven intelligente zoekfunctie</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
