'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, User, CreditCard, Fingerprint, FaceId, Thermometer, DoorOpen, Clock } from 'lucide-react';

interface AccessControlEvent {
  id?: string;
  type: string;
  deviceId: string;
  timestamp: string;
  data: {
    eventType: string;
    userId: string;
    cardNumber: string;
    cardName: string;
    isSuccess: boolean;
    door: number;
    readerId: string;
    errorCode: number;
    temperature: string;
    hasSnapshot: boolean;
    snapshotSize: number;
    source?: string;
  };
}

interface AccessControlEventListProps {
  events: AccessControlEvent[];
}

const getOpenMethodIcon = (method: string) => {
  const methodLower = method.toLowerCase();
  
  if (methodLower.includes('face')) return <FaceId className="h-4 w-4 text-purple-600" />;
  if (methodLower.includes('card')) return <CreditCard className="h-4 w-4 text-blue-600" />;
  if (methodLower.includes('fingerprint')) return <Fingerprint className="h-4 w-4 text-green-600" />;
  if (methodLower.includes('password') || methodLower.includes('pin')) return <User className="h-4 w-4 text-orange-600" />;
  
  return <DoorOpen className="h-4 w-4 text-gray-600" />;
};

const formatTimestamp = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
};

export default function AccessControlEventList({ events }: AccessControlEventListProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <DoorOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>No access control events yet</p>
        <p className="text-sm mt-1">Events will appear here when devices authorize users</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
      {events.map((event, index) => (
        <Card
          key={event.id || index}
          className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              {/* Icon based on event type */}
              <div className="flex-shrink-0 mt-1">
                {getOpenMethodIcon(event.data?.eventType || '')}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center space-x-2 mb-1">
                  <Badge variant={event.data?.isSuccess ? "default" : "destructive"} className="text-xs">
                    {event.data?.isSuccess ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Success
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                      </>
                    )}
                  </Badge>

                  <span className="text-sm font-medium text-gray-900">
                    {event.data?.eventType || 'Unknown'}
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div className="flex items-center space-x-1">
                    <User className="h-3 w-3" />
                    <span className="truncate">{event.data?.userId || 'N/A'}</span>
                  </div>

                  {event.data?.cardNumber && (
                    <div className="flex items-center space-x-1">
                      <CreditCard className="h-3 w-3" />
                      <span className="truncate">{event.data.cardNumber}</span>
                    </div>
                  )}

                  {event.data?.cardName && (
                    <div className="col-span-2">
                      Name: {event.data.cardName}
                    </div>
                  )}

                  <div className="flex items-center space-x-1">
                    <DoorOpen className="h-3 w-3" />
                    <span>Door {event.data?.door || 'N/A'}</span>
                  </div>

                  {event.data?.temperature && (
                    <div className="flex items-center space-x-1">
                      <Thermometer className="h-3 w-3" />
                      <span>{event.data.temperature}°C</span>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="flex items-center space-x-1 mt-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{formatTimestamp(event.timestamp)}</span>
                  {event.data?.source && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {event.data.source}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Device ID */}
            <div className="flex-shrink-0 ml-4 text-right">
              <Badge variant="secondary" className="text-xs">
                {event.deviceId}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
