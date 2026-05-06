'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, User, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface Event {
  eventName: string;
  data: {
    deviceID?: string;
    deviceId?: string;
    eventType?: string;
    eventData?: string;
    timestamp: string;
    [key: string]: any;
  };
}

interface EventLogProps {
  events: Event[];
}

export default function EventLog({ events }: EventLogProps) {
  const getEventIcon = (eventType: string) => {
    if (eventType.includes('Face') || eventType.includes('Recognition')) {
      return <User className="h-4 w-4 text-blue-600" />;
    }
    if (eventType.includes('Alarm') || eventType.includes('Error')) {
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
    if (eventType.includes('Success') || eventType.includes('Online')) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    if (eventType.includes('Offline') || eventType.includes('Disconnect')) {
      return <XCircle className="h-4 w-4 text-gray-600" />;
    }
    return <Bell className="h-4 w-4 text-gray-600" />;
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes('Face') || eventType.includes('Recognition')) {
      return 'bg-blue-50 border-blue-200';
    }
    if (eventType.includes('Alarm') || eventType.includes('Error')) {
      return 'bg-red-50 border-red-200';
    }
    if (eventType.includes('Success') || eventType.includes('Online')) {
      return 'bg-green-50 border-green-200';
    }
    return 'bg-gray-50 border-gray-200 dark:border-gray-700';
  };

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Event Log</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Bell className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No events yet</p>
            <p className="text-sm">Events will appear here in real-time</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Event Log ({events.length})</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {events.map((event, index) => {
            const eventType = event.data.eventType || event.eventName || 'Unknown';
            const timestamp = event.data.timestamp;
            
            return (
              <div
                key={index}
                className={`border rounded-lg p-3 ${getEventColor(eventType)}`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getEventIcon(eventType)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">
                        {eventType}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-700 truncate">
                      {event.data.eventData || JSON.stringify(event.data)}
                    </p>
                    
                    {event.data.deviceID && (
                      <p className="text-xs text-gray-500 mt-1">
                        Device: {event.data.deviceID}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
