'use client';

import { motion } from 'framer-motion';
import { 
  Settings, 
  Monitor, 
  Database, 
  BarChart3, 
  Shield,
  ChevronRight,
  Info
} from 'lucide-react';

interface SystemOverviewProps {
  className?: string;
}

export function RoboRailSystemOverview({ className }: SystemOverviewProps) {
  const systemComponents = [
    {
      id: 'pmac-controller',
      title: 'PMAC Controller',
      icon: <Monitor className="h-6 w-6" />,
      description: 'Centrale besturing voor alle RoboRail bewegingen en positionering',
      keyFeatures: [
        'Motion control en positionering',
        'Real-time communicatie',
        'Status monitoring',
        'Error diagnostiek'
      ],
      commonIssues: [
        'Communicatie timeouts',
        'Position feedback errors',
        'Network connectivity'
      ]
    },
    {
      id: 'calibration-system',
      title: 'Kalibratie Systeem',
      icon: <Settings className="h-6 w-6" />,
      description: 'Precisie kalibratie voor meetnauwkeurigheid en systeembetrouwbaarheid',
      keyFeatures: [
        'Chuck alignment procedures',
        'Reference point establishment',
        'Measurement validation',
        'System verification'
      ],
      commonIssues: [
        'Alignment drift',
        'Reference errors',
        'Validation failures'
      ]
    },
    {
      id: 'measurement-system',
      title: 'Meet Systeem',
      icon: <BarChart3 className="h-6 w-6" />,
      description: 'Data collection en analyse voor kwaliteitscontrole en rapportage',
      keyFeatures: [
        'Automated data collection',
        'Real-time measurements',
        'Quality analysis',
        'Report generation'
      ],
      commonIssues: [
        'Data accuracy',
        'Collection errors',
        'Analysis failures'
      ]
    },
    {
      id: 'safety-system',
      title: 'Veiligheid Systeem',
      icon: <Shield className="h-6 w-6" />,
      description: 'Operator veiligheid en equipment bescherming protocollen',
      keyFeatures: [
        'Emergency stop procedures',
        'Safety interlocks',
        'Risk assessment',
        'Equipment protection'
      ],
      commonIssues: [
        'Safety violations',
        'Interlock failures',
        'Emergency responses'
      ]
    }
  ];

  const quickAccessAreas = [
    {
      title: 'Kalibratie Procedures',
      description: 'Chuck alignment en systeem kalibratie',
      icon: <Settings className="h-4 w-4" />,
      searchTerms: ['kalibratie', 'chuck alignment', 'reference']
    },
    {
      title: 'PMAC Troubleshooting',
      description: 'Controller communicatie en diagnostiek',
      icon: <Monitor className="h-4 w-4" />,
      searchTerms: ['PMAC', 'communicatie', 'timeout', 'connection']
    },
    {
      title: 'Meetprocedures',
      description: 'Data collection en analyse',
      icon: <BarChart3 className="h-4 w-4" />,
      searchTerms: ['meting', 'data collection', 'measurement']
    },
    {
      title: 'Operators Manual',
      description: 'Volledige systeemhandleiding',
      icon: <Database className="h-4 w-4" />,
      searchTerms: ['manual', 'procedure', 'operating']
    }
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* System Overview Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-2xl font-bold text-zinc-800 mb-2">RoboRail Systeem Overzicht</h2>
        <p className="text-zinc-600">
          Geautomatiseerd precisie meetsysteem met PMAC controller technologie
        </p>
      </motion.div>

      {/* System Components Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid md:grid-cols-2 gap-4"
      >
        {systemComponents.map((component, index) => (
          <motion.div
            key={component.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="bg-white border border-zinc-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                {component.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-zinc-800 mb-1">{component.title}</h3>
                <p className="text-sm text-zinc-600">{component.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-zinc-700 mb-2">Belangrijkste functies:</h4>
                <ul className="text-xs text-zinc-600 space-y-1">
                  {component.keyFeatures.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <ChevronRight className="h-3 w-3 text-blue-600 mr-1 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-medium text-zinc-700 mb-2">Veelvoorkomende problemen:</h4>
                <ul className="text-xs text-zinc-600 space-y-1">
                  {component.commonIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-amber-600 mr-1 mt-0.5">⚠</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Access Areas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-blue-50 border border-blue-200 rounded-lg p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-800">Snelle Toegang tot Documentatie</h3>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {quickAccessAreas.map((area, index) => (
            <motion.div
              key={area.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + index * 0.1 }}
              className="bg-white border border-blue-200 rounded-lg p-3 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="text-blue-600">{area.icon}</div>
                <h4 className="font-medium text-blue-800 text-sm">{area.title}</h4>
              </div>
              <p className="text-xs text-blue-700 mb-2">{area.description}</p>
              <div className="flex flex-wrap gap-1">
                {area.searchTerms.map((term, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Key Safety Information */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-amber-50 border border-amber-200 rounded-lg p-4"
      >
        <div className="flex items-start gap-3">
          <Shield className="h-6 w-6 text-amber-600 mt-1" />
          <div>
            <h3 className="font-semibold text-amber-800 mb-2">Belangrijke Veiligheidsinformatie</h3>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• Volg altijd de officiële veiligheidsprocedures uit de operators manual</li>
              <li>• Controleer PMAC verbindingen voordat u procedures start</li>
              <li>• Voer kalibraties uit volgens gespecificeerde procedures</li>
              <li>• Raadpleeg troubleshooting gidsen bij problemen voordat u systeem reset</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}