'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Monitor } from 'lucide-react';

interface Device {
  deviceId: string;
  name: string;
  registrationId: string;
  username: string;
  password: string;
  ip: string;
  serial: string;
  groupId?: string;
}

interface DeviceGroup {
  id: string;
  name: string;
}

interface DeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (deviceData: Partial<Device>) => Promise<boolean>;
  device: Device | null;
  deviceGroups?: DeviceGroup[];
}

export default function DeviceModal({ isOpen, onClose, onSave, device, deviceGroups = [] }: DeviceModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    registrationId: '',
    username: 'admin',
    password: '',
    ip: '',
    serial: '',
    groupId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with device data when editing
  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name || '',
        registrationId: device.registrationId || '',
        username: device.username || 'admin',
        password: device.password || '',
        ip: device.ip || '',
        serial: device.serial || '',
        groupId: device.groupId || '',
      });
    } else {
      setFormData({
        name: '',
        registrationId: '',
        username: 'admin',
        password: '',
        ip: '',
        serial: '',
        groupId: '',
      });
    }
    setErrors({});
  }, [device, isOpen]);

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Device name is required';
    }

    if (!formData.registrationId.trim()) {
      newErrors.registrationId = 'Registration ID is required';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setIsSaving(true);
    const success = await onSave(formData);
    setIsSaving(false);

    if (success) {
      // Form will be closed by parent
    }
  };

  // Handle input change
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Monitor className="h-6 w-6 text-primary-600" />
            <h2 className="text-xl font-bold">
              {device ? 'Edit Device' : 'Add Device'}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Device Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., Main Entrance"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Registration ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Registration ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.registrationId}
              onChange={(e) => handleChange('registrationId', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                errors.registrationId ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., ASI11"
            />
            {errors.registrationId && (
              <p className="text-red-500 text-xs mt-1">{errors.registrationId}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Device serial number used for auto-registration
            </p>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="e.g., admin"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                errors.password ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Device password"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            )}
          </div>

          {/* Info note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>Note:</strong> Local IP is optional — enter the device&apos;s LAN IP (e.g. 192.168.1.100) for your reference. Serial Number will be automatically detected when the device connects online.
            </p>
          </div>

          {/* Local IP (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Local IP <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.ip}
              onChange={(e) => handleChange('ip', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="e.g., 192.168.1.100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Device&apos;s LAN IP address (for reference only)
            </p>
          </div>

          {/* Device Group (optional) */}
          {deviceGroups.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Device Group <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <select
                value={formData.groupId}
                onChange={(e) => handleChange('groupId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
              >
                <option value="">— No Group (All Devices) —</option>
                {deviceGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save Device'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
