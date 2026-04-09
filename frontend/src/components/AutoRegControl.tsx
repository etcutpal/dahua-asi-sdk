'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Loader2 } from 'lucide-react';

interface AutoRegControlProps {
  onStatusChange?: (status: boolean) => void;
}

export default function AutoRegControl({ onStatusChange }: AutoRegControlProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [port, setPort] = useState(9500);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/autoreg/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ port }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsRunning(true);
        onStatusChange?.(true);
      } else {
        console.error('Failed to start auto registration:', data.error);
      }
    } catch (error) {
      console.error('Error starting auto registration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/autoreg/stop', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsRunning(false);
        onStatusChange?.(false);
      } else {
        console.error('Failed to stop auto registration:', data.error);
      }
    } catch (error) {
      console.error('Error stopping auto registration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Status</span>
        <Badge variant={isRunning ? 'default' : 'secondary'}>
          {isRunning ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      <div className="text-xs text-gray-500">
        <p>Port: {port}</p>
        <p className="mt-1">Configure devices to connect to this port</p>
      </div>

      <div className="flex space-x-2">
        {!isRunning ? (
          <Button
            size="sm"
            onClick={handleStart}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Start
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStop}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <Square className="h-3 w-3 mr-1" />
                Stop
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
