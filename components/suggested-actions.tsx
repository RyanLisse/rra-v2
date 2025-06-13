'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers['append'];
}

function PureSuggestedActions({ chatId, append }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: 'Kalibratie Procedure',
      label: 'Hoe kalibreer ik het RoboRail systeem stap voor stap?',
      action: 'Leg de volledige kalibratie procedure voor het RoboRail systeem uit, inclusief chuck alignment en verificatie stappen.',
      category: 'calibration'
    },
    {
      title: 'PMAC Troubleshooting',
      label: 'PMAC reageert niet - wat zijn de oplossingen?',
      action: 'Help me met PMAC controller problemen: geen communicatie, timeouts, en diagnostiek stappen.',
      category: 'troubleshooting'
    },
    {
      title: 'Chuck Alignment',
      label: 'Leg chuck alignment kalibratie procedure uit',
      action: 'Wat is de procedure voor chuck alignment kalibratie en hoe verifieer ik de nauwkeurigheid?',
      category: 'calibration'
    },
    {
      title: 'Meetprocedures',
      label: 'Welke stappen voor data collection en analyse?',
      action: 'Leg de meetprocedures uit voor data collection, kwaliteitscontrole en rapportage in RoboRail.',
      category: 'measurement'
    },
    {
      title: 'Veiligheid & Noodstop',
      label: 'Wat zijn de veiligheidsprocedures?',
      action: 'Wat zijn de belangrijkste veiligheidsprocedures, noodstop procedures en safety checks voor RoboRail?',
      category: 'safety'
    },
    {
      title: 'Error Codes',
      label: 'Hoe interpreteer ik error codes en alarmen?',
      action: 'Help me met het interpreteren van RoboRail error codes en alarm messages, inclusief oplossingen.',
      category: 'troubleshooting'
    }
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'calibration':
        return 'border-blue-200 hover:bg-blue-50 text-blue-800';
      case 'troubleshooting':
        return 'border-amber-200 hover:bg-amber-50 text-amber-800';
      case 'measurement':
        return 'border-green-200 hover:bg-green-50 text-green-800';
      case 'safety':
        return 'border-red-200 hover:bg-red-50 text-red-800';
      default:
        return 'border-zinc-200 hover:bg-zinc-50 text-zinc-800';
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-zinc-800 mb-2">Veelgestelde RoboRail Vragen</h3>
        <p className="text-sm text-zinc-600">Klik op een vraag om direct te beginnen</p>
      </div>
      
      <div
        data-testid="suggested-actions"
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full"
      >
        {suggestedActions.map((suggestedAction, index) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.05 * index }}
            key={`suggested-action-${suggestedAction.title}-${index}`}
            className="block"
          >
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                window.history.replaceState({}, '', `/chat/${chatId}`);

                append({
                  role: 'user',
                  content: suggestedAction.action,
                });
              }}
              className={`text-left border rounded-xl px-4 py-4 text-sm flex-1 gap-2 flex-col w-full h-auto justify-start items-start transition-all ${getCategoryColor(suggestedAction.category)}`}
            >
              <span className="font-semibold text-base">{suggestedAction.title}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {suggestedAction.label}
              </span>
            </Button>
          </motion.div>
        ))}
      </div>

      {/* Category Legend */}
      <div className="flex flex-wrap gap-2 justify-center mt-6 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-200 rounded" />
          <span className="text-zinc-600">Kalibratie</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-amber-200 rounded" />
          <span className="text-zinc-600">Troubleshooting</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-200 rounded" />
          <span className="text-zinc-600">Metingen</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-200 rounded" />
          <span className="text-zinc-600">Veiligheid</span>
        </div>
      </div>
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;

    return true;
  },
);
