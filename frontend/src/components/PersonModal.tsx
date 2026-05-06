'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, User, Upload, Trash2, Plus, CreditCard, Fingerprint, Settings, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface Person {
  personId: string;
  name: string;
  faceImagePath: string | null;
  fingerprints: string[];
  cardNumbers: string[];
}

interface PersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (personData: FormData) => Promise<boolean>;
  person: Person | null;
}

interface DeviceOption {
  deviceId: string;
  name: string;
  status: string;
}

export default function PersonModal({ isOpen, onClose, onSave, person }: PersonModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    personId: '',
    name: '',
    cardNumber: '',
  });
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [faceImagePreview, setFaceImagePreview] = useState<string | null>(null);

  // Fingerprint state — null = empty, string = base64 template
  const [fingerprintTemplates, setFingerprintTemplates] = useState<(string | null)[]>([null, null, null, null, null]);
  const [capturingSlot, setCapturingSlot] = useState<number | null>(null);
  const [captureErrors, setCaptureErrors] = useState<(string | null)[]>([null, null, null, null, null]);
  const [scanMethod, setScanMethod] = useState<'builtin'>('builtin');
  const [showMethodMenu, setShowMethodMenu] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [captureBlockedMsg, setCaptureBlockedMsg] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Load online devices when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/devices')
      .then(r => r.json())
      .then((data: any) => {
        const online: DeviceOption[] = (data.devices || data || [])
          .filter((d: any) => d.status === 'Online' || d.Status === 'Online')
          .map((d: any) => ({ deviceId: d.deviceId || d.registrationId, name: d.name || d.deviceId || d.registrationId, status: 'Online' }));
        setDevices(online);
        if (online.length > 0 && !selectedDeviceId) setSelectedDeviceId(online[0].deviceId);
      })
      .catch(() => setDevices([]));
  }, [isOpen]);

  // Initialize form with person data when editing
  useEffect(() => {
    if (person) {
      setFormData({
        personId: person.personId || '',
        name: person.name || '',
        cardNumber: person.cardNumbers.length > 0 ? person.cardNumbers[0] : '',
      });
      setFaceImagePreview(person.faceImagePath ? `/api/persons/${person.personId}/image` : null);
      // Map existing fingerprint strings to template slots
      const tpl: (string | null)[] = [null, null, null, null, null];
      person.fingerprints.forEach((fp, i) => {
        if (i < 5 && fp) tpl[i] = fp;
      });
      setFingerprintTemplates(tpl);
    } else {
      setFormData({ personId: '', name: '', cardNumber: '' });
      setFaceImage(null);
      setFaceImagePreview(null);
      setFingerprintTemplates([null, null, null, null, null]);
    }
    setCaptureErrors([null, null, null, null, null]);
    setCapturingSlot(null);
    setCaptureBlockedMsg(null);
    setErrors({});
  }, [person, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.personId.trim()) newErrors.personId = 'Person ID is required';
    if (!formData.name.trim()) newErrors.name = 'Person name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { setErrors(prev => ({ ...prev, faceImage: 'Only image files are allowed' })); return; }
      if (file.size > 5 * 1024 * 1024) { setErrors(prev => ({ ...prev, faceImage: 'Image size must be less than 5MB' })); return; }
      setFaceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setFaceImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setErrors(prev => { const e = { ...prev }; delete e.faceImage; return e; });
    }
  };

  // Capture fingerprint for a given slot with up to 3 retries
  const captureFingerprint = async (index: number) => {
    setCaptureBlockedMsg(null);
    if (!selectedDeviceId) {
      setCaptureBlockedMsg('Select a device before capturing.');
      return;
    }
    if (!formData.personId.trim()) {
      setCaptureBlockedMsg('Enter a Person ID before capturing.');
      return;
    }

    setCapturingSlot(index);
    setCaptureErrors(prev => { const e = [...prev]; e[index] = null; return e; });

    const NON_RETRYABLE = [7, 9];
    let lastError = 'Capture failed';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/scanner/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: selectedDeviceId,
            slot: index + 1,
            userID: formData.personId.trim(),
            timeoutMs: 30000,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setFingerprintTemplates(prev => { const t = [...prev]; t[index] = data.template; return t; });
          setCapturingSlot(null);
          return;
        }
        lastError = data.error || 'Capture failed';
        if (NON_RETRYABLE.includes(data.errorCode)) break;
        if (attempt < 3) await new Promise(r => setTimeout(r, 500));
      } catch {
        lastError = 'Network error';
        if (attempt < 3) await new Promise(r => setTimeout(r, 500));
      }
    }

    setCaptureErrors(prev => { const e = [...prev]; e[index] = lastError; return e; });
    setCapturingSlot(null);
  };

  const removeFingerprint = (index: number) => {
    setFingerprintTemplates(prev => { const t = [...prev]; t[index] = null; return t; });
    setCaptureErrors(prev => { const e = [...prev]; e[index] = null; return e; });
  };

  const handleCardNumberChange = (value: string) => setFormData(prev => ({ ...prev, cardNumber: value }));
  const handleReadCard = () => alert('Card reader functionality will be implemented later');

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    const data = new FormData();
    data.append('personData', JSON.stringify({
      personId: formData.personId,
      name: formData.name,
      fingerprints: fingerprintTemplates.filter(t => t !== null) as string[],
      cardNumbers: formData.cardNumber.trim() ? [formData.cardNumber.trim()] : [],
    }));
    if (faceImage) data.append('faceImage', faceImage);
    const success = await onSave(data);
    setIsSaving(false);
    if (success) {
      setFormData({ personId: '', name: '', cardNumber: '' });
      setFaceImage(null);
      setFaceImagePreview(null);
      setFingerprintTemplates([null, null, null, null, null]);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  if (!isOpen) return null;

  const capturedCount = fingerprintTemplates.filter(t => t !== null).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <User className="h-6 w-6 text-primary-600" />
            <h2 className="text-xl font-bold">{person ? 'Edit Person' : 'Add Person'}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Person ID and Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Person ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.personId}
                onChange={(e) => handleChange('personId', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${errors.personId ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., P001"
                disabled={!!person}
              />
              {errors.personId && <p className="text-red-500 text-xs mt-1">{errors.personId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Full name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
          </div>

          {/* Face Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Face Image</label>
            <div className="flex items-start space-x-4">
              <div className="flex-1">
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center space-x-2">
                  <Upload className="h-4 w-4" />
                  <span>Upload Image</span>
                </Button>
                {faceImage && <p className="text-xs text-gray-500 mt-2">Selected: {faceImage.name}</p>}
                {errors.faceImage && <p className="text-red-500 text-xs mt-1">{errors.faceImage}</p>}
              </div>
              {faceImagePreview && (
                <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden">
                  <img src={faceImagePreview} alt="Face preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Fingerprints */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Fingerprints (Max 5)</label>
              {/* Gear menu — future: switch methods */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMethodMenu(v => !v)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                  title="Scan method"
                >
                  <Settings className="h-4 w-4" />
                </button>
                {showMethodMenu && (
                  <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-max">
                    <button
                      type="button"
                      className="block w-full text-left px-4 py-2 text-sm font-semibold text-primary-600 hover:bg-gray-50"
                      onClick={() => { setScanMethod('builtin'); setShowMethodMenu(false); }}
                    >
                      ✓ Access Control Built-in Scanner
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Device selector — always visible */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">Device:</span>
              {devices.length === 0 ? (
                <span className="text-xs text-amber-600">No online devices found — connect a device first</span>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={e => setSelectedDeviceId(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                >
                  {devices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Inline validation message */}
            {captureBlockedMsg && (
              <p className="text-xs text-amber-600 mb-2">⚠️ {captureBlockedMsg}</p>
            )}

            {/* Slot buttons */}
            <div className="flex items-center space-x-3">
              {fingerprintTemplates.map((tpl, index) => {
                const isCapturing = capturingSlot === index;
                const hasTemplate = tpl !== null;
                const hasError = captureErrors[index] !== null;

                return (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (hasTemplate) {
                          if (confirm(`Remove Finger ${index + 1}?`)) removeFingerprint(index);
                        } else if (!isCapturing) {
                          captureFingerprint(index);
                        }
                      }}
                      disabled={isCapturing || (capturingSlot !== null && capturingSlot !== index)}
                      title={
                        hasTemplate ? `Finger ${index + 1} captured — click to remove` :
                        hasError ? `Error: ${captureErrors[index]} — click to retry` :
                        `Capture Finger ${index + 1}`
                      }
                      className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center transition-all relative
                        ${isCapturing ? 'border-blue-400 bg-blue-50 animate-pulse cursor-wait' :
                          hasTemplate ? 'border-green-500 bg-green-50 text-green-600 hover:border-red-400 hover:bg-red-50 hover:text-red-500' :
                          hasError ? 'border-red-400 bg-red-50 text-red-500 hover:border-red-500' :
                          'border-gray-300 bg-gray-50 text-gray-400 hover:border-primary-400 hover:text-primary-500'
                        }`}
                    >
                      {isCapturing ? (
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      ) : hasTemplate ? (
                        <CheckCircle className="h-6 w-6" />
                      ) : hasError ? (
                        <XCircle className="h-6 w-6" />
                      ) : (
                        <Fingerprint className="h-6 w-6" />
                      )}
                    </button>
                    <span className="text-xs text-gray-400">F{index + 1}</span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 mt-2">{capturedCount}/5 fingerprints captured</p>

            {/* Per-slot errors */}
            {captureErrors.map((err, i) => err && (
              <p key={i} className="text-xs text-red-500 mt-1">F{i + 1}: {err}</p>
            ))}

            {capturingSlot !== null && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Place finger on device scanner — touch 3 times (Finger {capturingSlot + 1})
              </p>
            )}
          </div>

          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Card Number</label>
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={formData.cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Enter card number"
              />
              <Button type="button" variant="outline" onClick={handleReadCard} className="flex items-center space-x-2 flex-shrink-0">
                <CreditCard className="h-4 w-4" />
                <span>Read Card</span>
              </Button>
            </div>
          </div>

          {/* Info note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>Note:</strong> Face image will be stored securely. Person ID cannot be changed after creation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex items-center space-x-2">
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save Person'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}