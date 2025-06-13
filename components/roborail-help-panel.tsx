'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HelpCircle, 
  X, 
  ChevronDown, 
  ChevronRight,
  Settings, 
  AlertTriangle, 
  Database,
  Monitor,
  BarChart3,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RoboRailHelpPanelProps {
  className?: string;
  compact?: boolean;
}

export function RoboRailHelpPanel({ className, compact = false }: RoboRailHelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const helpSections = [
    {
      id: 'quick-start',
      title: 'Snel aan de slag',
      icon: <Database className="h-4 w-4" />,
      content: [
        'Selecteer de juiste kennisbank rechtsboven',
        'Stel specifieke vragen over procedures of problemen',
        'Vermeld error codes of stap waar u zich bevindt',
        'Gebruik technische termen in het Engels voor precisie'
      ]
    },
    {
      id: 'calibration',
      title: 'Kalibratie Procedures',
      icon: <Settings className="h-4 w-4" />,
      content: [
        'Chuck alignment kalibratie stap-voor-stap',
        'RoboRail systeemkalibratie procedures',
        'Kalibratie verificatie en validatie',
        'Troubleshooting kalibratie problemen'
      ]
    },
    {
      id: 'pmac',
      title: 'PMAC Controller',
      icon: <Monitor className="h-4 w-4" />,
      content: [
        'PMAC communicatie troubleshooting',
        'Verbindingsproblemen oplossen',
        'Controller status controles',
        'PMAC configuratie verificatie'
      ]
    },
    {
      id: 'measurement',
      title: 'Meetprocedures',
      icon: <BarChart3 className="h-4 w-4" />,
      content: [
        'Data collection procedures',
        'Meetnauwkeurigheid verificatie',
        'Resultaten interpretatie',
        'Kwaliteitscontrole protocols'
      ]
    },
    {
      id: 'troubleshooting',
      title: 'Probleemoplossing',
      icon: <AlertTriangle className="h-4 w-4" />,
      content: [
        'Stap-voor-stap troubleshooting gidsen',
        'Veelvoorkomende error codes',
        'System reset procedures',
        'Preventief onderhoud'
      ]
    },
    {
      id: 'safety',
      title: 'Veiligheid',
      icon: <Shield className="h-4 w-4" />,
      content: [
        'Veiligheidsprocedures voor operators',
        'Noodstop procedures',
        'Equipment safety checks',
        'Werkplaats veiligheidsrichtlijnen'
      ]
    }
  ];

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="p-2"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
        
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="absolute top-full right-0 mt-2 w-80 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-zinc-800">RoboRail Hulp</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="p-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {helpSections.slice(0, 3).map((section) => (
                  <div key={section.id} className="border-b border-zinc-100 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      {section.icon}
                      <span className="text-sm font-medium text-zinc-700">{section.title}</span>
                    </div>
                    <ul className="text-xs text-zinc-600 space-y-1 ml-6">
                      {section.content.slice(0, 2).map((item, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="mr-1">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-zinc-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-zinc-800">RoboRail Assistentie</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {helpSections.map((section) => (
              <div key={section.id} className="border border-zinc-100 rounded-lg p-3">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    {section.icon}
                    <span className="font-medium text-zinc-700">{section.title}</span>
                  </div>
                  {expandedSections.has(section.id) ? 
                    <ChevronDown className="h-4 w-4 text-zinc-500" /> : 
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  }
                </button>
                
                <AnimatePresence>
                  {expandedSections.has(section.id) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 ml-6"
                    >
                      <ul className="text-sm text-zinc-600 space-y-2">
                        {section.content.map((item, idx) => (
                          <li key={idx} className="flex items-start">
                            <span className="text-blue-600 mr-2 mt-1">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Quick Tips Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <h3 className="font-semibold text-blue-800 mb-2">💡 Snelle Tips</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Begin vragen met &quot;Hoe...&quot; voor stap-voor-stap procedures</li>
                <li>• Vermeld error codes of specifieke situaties</li>
                <li>• Gebruik &quot;PMAC&quot;, &quot;Chuck alignment&quot;, &quot;Kalibratie&quot; als zoektermen</li>
                <li>• Selecteer de juiste kennisbank voor gedetailleerde antwoorden</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}