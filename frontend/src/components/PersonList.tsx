'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Fingerprint, CreditCard, Trash2, Edit, Image, Upload, X } from 'lucide-react';

interface Person {
  personId: string;
  name: string;
  faceImagePath: string | null;
  fingerprints: string[];
  cardNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
  status?: string;
}

interface PersonListProps {
  persons: Person[];
  onEdit: (person: Person) => void;
  onDelete: (personId: string) => void;
  onSendToDevice: (personId: string, deviceId: string) => Promise<{ success: boolean; message: string; error?: string }>;
}

export default function PersonList({ persons, onEdit, onDelete, onSendToDevice }: PersonListProps) {
  const [sendToDeviceModalOpen, setSendToDeviceModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ success: boolean; message: string; error?: string } | null>(null);
  const handleDelete = async (personId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    onDelete(personId);
  };

  const handleSendToDeviceClick = async (person: Person) => {
    setSelectedPerson(person);
    setSendToDeviceModalOpen(true);
    setSendStatus(null);
    setSelectedDeviceId('');
    await loadDevices();
  };

  const loadDevices = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/devices`);
      const data = await response.json();
      if (data.success) {
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const handleSendToDevice = async () => {
    if (!selectedPerson || !selectedDeviceId) {
      return;
    }

    setIsSending(true);
    setSendStatus(null);

    try {
      const result = await onSendToDevice(selectedPerson.personId, selectedDeviceId);
      setSendStatus(result);
    } catch (error) {
      setSendStatus({
        success: false,
        message: 'Failed to send to device',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseSendToDeviceModal = () => {
    setSendToDeviceModalOpen(false);
    setSelectedPerson(null);
    setSelectedDeviceId('');
    setSendStatus(null);
  };

  if (persons.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Persons</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <User className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No persons added</p>
            <p className="text-sm">Click "Add Person" to get started</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Persons ({persons.length})</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {persons.map((person) => (
            <div
              key={person.personId}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 flex items-start space-x-4">
                  {/* Face Image */}
                  <div className="w-20 h-20 border-2 border-gray-300 rounded-lg overflow-hidden flex-shrink-0">
                    {person.faceImagePath ? (
                      <img
                        src={`/api/persons/${person.personId}/image?v=${new Date(person.updatedAt).getTime()}`}
                        alt={person.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <User className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Person Info */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-lg">{person.name}</h3>
                      <Badge variant="outline">ID: {person.personId}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <Fingerprint className="h-4 w-4 text-primary-600" />
                        <span>
                          <span className="font-medium">Fingerprints:</span>{' '}
                          {person.fingerprints.length > 0 && person.fingerprints[0] 
                            ? person.fingerprints.filter(fp => fp).length 
                            : 0}/5
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CreditCard className="h-4 w-4 text-primary-600" />
                        <span>
                          <span className="font-medium">Cards:</span>{' '}
                          {person.cardNumbers.length > 0 && person.cardNumbers[0] 
                            ? person.cardNumbers.filter(card => card).length 
                            : 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(person)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendToDeviceClick(person)}
                    className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Send to Device
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(person.personId, person.name)}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Send to Device Modal */}
    {sendToDeviceModalOpen && selectedPerson && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center space-x-3">
              <Upload className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-bold">Send to Device</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseSendToDeviceModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Person Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700 mb-1">Person:</p>
              <p className="text-sm text-gray-900">{selectedPerson.name}</p>
              <p className="text-xs text-gray-500">ID: {selectedPerson.personId}</p>
            </div>

            {/* Device Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Device <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSending}
              >
                <option value="">Choose a device...</option>
                {devices
                  .filter(d => d.status === 'Online' || d.status === 'online')
                  .map(device => {
                    const deviceValue = device.registrationId || device.deviceId;
                    return (
                      <option key={deviceValue} value={deviceValue}>
                        {device.name} ({device.registrationId})
                      </option>
                    );
                  })}
              </select>
              {devices.filter(d => d.status === 'Online' || d.status === 'online').length === 0 && (
                <p className="text-xs text-orange-600 mt-2">
                  No online devices available
                </p>
              )}
            </div>

            {/* Send Status */}
            {sendStatus && (
              <div className={`p-3 rounded-lg border ${
                sendStatus.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm font-medium ${
                  sendStatus.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {sendStatus.message}
                </p>
                {sendStatus.error && (
                  <p className="text-xs text-red-600 mt-1">{sendStatus.error}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
            <Button
              variant="outline"
              onClick={handleCloseSendToDeviceModal}
              disabled={isSending}
            >
              {sendStatus ? 'Close' : 'Cancel'}
            </Button>
            {!sendStatus && (
              <Button
                onClick={handleSendToDevice}
                disabled={isSending || !selectedDeviceId}
                className="flex items-center space-x-2"
              >
                <Upload className="h-4 w-4" />
                <span>{isSending ? 'Sending...' : 'Send'}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    )}
  </>
  );
}
