'use client';

import { startTransition, useMemo, useOptimistic, useState } from 'react';

import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { chatModels } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { entitlementsByUserType } from '@/lib/ai/entitlements';

// Group models by provider
const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, typeof chatModels>,
);

const providerLabels = {
  xai: 'xAI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

const providerColors = {
  xai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  openai:
    'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  anthropic:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
  google: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
};

function formatPrice(price: number): string {
  if (price < 1) {
    return `$${price.toFixed(2)}`;
  }
  return `$${price.toFixed(0)}`;
}

export function ModelSelector({
  session,
  selectedModelId,
  className,
}: {
  session: any;
  selectedModelId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] =
    useOptimistic(selectedModelId);

  const userType = session?.user?.type || 'guest';
  const { availableChatModelIds } = entitlementsByUserType[userType];

  const availableChatModels = chatModels.filter((chatModel) =>
    availableChatModelIds.includes(chatModel.id),
  );

  const selectedChatModel = useMemo(
    () =>
      availableChatModels.find(
        (chatModel) => chatModel.id === optimisticModelId,
      ),
    [optimisticModelId, availableChatModels],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button
          data-testid="model-selector"
          variant="outline"
          className="md:px-2 md:h-[34px] max-w-[240px]"
        >
          <div className="flex flex-col items-start text-left">
            <span className="font-medium truncate">
              {selectedChatModel?.name || 'Select Model'}
            </span>
            {selectedChatModel && (
              <span className="text-xs text-muted-foreground">
                {providerLabels[selectedChatModel.provider]}
              </span>
            )}
          </div>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[380px] max-h-[600px] overflow-y-auto"
      >
        {Object.entries(modelsByProvider).map(([provider, models]) => {
          const availableModels = models.filter((model) =>
            availableChatModelIds.includes(model.id),
          );

          if (availableModels.length === 0) return null;

          return (
            <div key={provider}>
              <DropdownMenuLabel className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 text-xs rounded-md font-medium ${providerColors[provider as keyof typeof providerColors]}`}
                >
                  {providerLabels[provider as keyof typeof providerLabels]}
                </span>
                <div className="flex gap-1">
                  {availableModels.some((m) => m.capabilities.vision) && (
                    <span className="px-1 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 rounded">
                      Vision
                    </span>
                  )}
                  {availableModels.some((m) => m.capabilities.reasoning) && (
                    <span className="px-1 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 rounded">
                      Reasoning
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              {availableModels.map((chatModel) => (
                <DropdownMenuItem
                  key={chatModel.id}
                  data-testid={`model-selector-item-${chatModel.id}`}
                  onSelect={() => {
                    setOpen(false);
                    startTransition(() => {
                      setOptimisticModelId(chatModel.id);
                      saveChatModelAsCookie(chatModel.id);
                    });
                  }}
                  data-active={chatModel.id === optimisticModelId}
                  asChild
                >
                  <button
                    type="button"
                    className="gap-4 group/item flex flex-row justify-between items-center w-full p-3 hover:bg-accent/50"
                  >
                    <div className="flex flex-col gap-1 items-start flex-1">
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-medium">{chatModel.name}</span>
                        <div className="flex gap-1">
                          {chatModel.capabilities.vision && (
                            <span
                              className="w-2 h-2 bg-blue-500 rounded-full"
                              title="Vision capable"
                            />
                          )}
                          {chatModel.capabilities.reasoning && (
                            <span
                              className="w-2 h-2 bg-purple-500 rounded-full"
                              title="Advanced reasoning"
                            />
                          )}
                          {chatModel.capabilities.tools && (
                            <span
                              className="w-2 h-2 bg-green-500 rounded-full"
                              title="Tool use"
                            />
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-left">
                        {chatModel.description}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {(chatModel.contextWindow / 1000).toLocaleString()}K
                          context
                        </span>
                        {chatModel.pricing && (
                          <span>
                            {formatPrice(chatModel.pricing.inputTokens)}/
                            {formatPrice(chatModel.pricing.outputTokens)} per 1M
                            tokens
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                      <CheckCircleFillIcon />
                    </div>
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
