'use client';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon, } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { DatabaseSelector } from './database-selector';
import { t } from '@/lib/translations/dutch';

function PureChatHeader({
  chatId,
  selectedModelId,
  isReadonly,
  session,
}: {
  chatId: string;
  selectedModelId: string;
  isReadonly: boolean;
  session: any;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 gap-1 md:gap-2 min-h-[44px]">
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="order-3 md:order-1 h-8 px-2 ml-auto md:ml-0"
              onClick={() => {
                router.push('/');
                router.refresh();
              }}
            >
              <PlusIcon className="h-3 w-3" />
              <span className="sr-only md:not-sr-only ml-1 text-xs">{t('new_chat')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('new_chat')}</TooltipContent>
        </Tooltip>
      )}

      {!isReadonly && (
        <div className="flex items-center gap-1 md:gap-2 order-1 md:order-2 flex-1">
          <ModelSelector
            session={session}
            selectedModelId={selectedModelId}
            className="flex-1 max-w-[120px] md:max-w-[200px]"
          />
          <DatabaseSelector className="flex-1 max-w-[100px] md:max-w-[160px]" />
        </div>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
