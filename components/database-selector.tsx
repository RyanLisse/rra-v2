'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Database } from 'lucide-react';
import { useState } from 'react';

interface DatabaseSelectorProps {
  className?: string;
  onDatabaseChange?: (database: string) => void;
}

export function DatabaseSelector({
  className,
  onDatabaseChange,
}: DatabaseSelectorProps) {
  const [selectedDatabase, setSelectedDatabase] = useState(
    'roborail-production',
  );

  const databases = [
    {
      id: 'roborail-production',
      name: 'RoboRail Production',
      description: 'Live production data',
    },
    {
      id: 'roborail-testing',
      name: 'RoboRail Testing',
      description: 'Test environment',
    },
    {
      id: 'roborail-calibration',
      name: 'Calibration Data',
      description: 'Calibration history',
    },
    {
      id: 'roborail-maintenance',
      name: 'Maintenance Logs',
      description: 'Service records',
    },
  ];

  const handleDatabaseChange = (value: string) => {
    setSelectedDatabase(value);
    onDatabaseChange?.(value);
  };

  return (
    <Select value={selectedDatabase} onValueChange={handleDatabaseChange}>
      <SelectTrigger className={`w-[200px] ${className}`}>
        <Database className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Select database" />
      </SelectTrigger>
      <SelectContent>
        {databases.map((db) => (
          <SelectItem key={db.id} value={db.id}>
            <div className="flex flex-col">
              <span className="font-medium">{db.name}</span>
              <span className="text-xs text-muted-foreground">
                {db.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
