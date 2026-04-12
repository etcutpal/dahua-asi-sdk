'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, User, Upload, Trash2, Plus, CreditCard, Fingerprint } from 'lucide-react';

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

export default function PersonModal({ isOpen, onClose, onSave, person }: PersonModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    personId: '',
    name: '',
    cardNumber: '',
  });
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [faceImagePreview, setFaceImagePreview] = useState<string | null>(null);
  const [fingerprints, setFingerprints] = useState<boolean[]>([false, false, false, false, false]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with person data when editing
  useEffect(() => {
    if (person) {
      setFormData({
        personId: person.personId || '',
        name: person.name || '',
        cardNumber: person.cardNumbers.length > 0 ? person.cardNumbers[0] : '',
      });
      setFaceImagePreview(person.faceImagePath ? `/api/persons/${person.personId}/image` : null);
      // Convert fingerprints array to boolean array
      const fpArray = [false, false, false, false, false];
      person.fingerprints.forEach((fp, i) => {
        if (i < 5 && fp) fpArray[i] = true;
      });
      setFingerprints(fpArray);
    } else {
      setFormData({
        personId: '',
        name: '',
        cardNumber: '',
      });
      setFaceImage(null);
      setFaceImagePreview(null);
      setFingerprints([false, false, false, false, false]);
    }
    setErrors({});
  }, [person, isOpen]);

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.personId.trim()) {
      newErrors.personId = 'Person ID is required';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Person name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle face image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, faceImage: 'Only image files are allowed' }));
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, faceImage: 'Image size must be less than 5MB' }));
        return;
      }

      setFaceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaceImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.faceImage;
        return newErrors;
      });
    }
  };

  // Toggle fingerprint slot
  const toggleFingerprint = (index: number) => {
    const newFingerprints = [...fingerprints];
    newFingerprints[index] = !newFingerprints[index];
    setFingerprints(newFingerprints);
  };

  // Handle card number change
  const handleCardNumberChange = (value: string) => {
    setFormData(prev => ({ ...prev, cardNumber: value }));
  };

  // Handle read card (placeholder for future implementation)
  const handleReadCard = () => {
    // TODO: Implement card reader integration
    alert('Card reader functionality will be implemented later');
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setIsSaving(true);

    // Create FormData for file upload
    const data = new FormData();
    data.append('personData', JSON.stringify({
      personId: formData.personId,
      name: formData.name,
      fingerprints: fingerprints.map((fp, i) => fp ? `fingerprint_${i + 1}` : '').filter(f => f),
      cardNumbers: formData.cardNumber.trim() ? [formData.cardNumber.trim()] : [],
    }));

    if (faceImage) {
      data.append('faceImage', faceImage);
    }

    const success = await onSave(data);

    setIsSaving(false);

    if (success) {
      // Reset form
      setFormData({ personId: '', name: '', cardNumber: '' });
      setFaceImage(null);
      setFaceImagePreview(null);
      setFingerprints([false, false, false, false, false]);
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <User className="h-6 w-6 text-primary-600" />
            <h2 className="text-xl font-bold">
              {person ? 'Edit Person' : 'Add Person'}
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
        <div className="p-6 space-y-6">
          {/* Person ID and Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Person ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.personId}
                onChange={(e) => handleChange('personId', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.personId ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., P001"
                disabled={!!person} // Disable editing when editing existing person
              />
              {errors.personId && (
                <p className="text-red-500 text-xs mt-1">{errors.personId}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Full name"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              )}
            </div>
          </div>

          {/* Face Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Face Image
            </label>
            <div className="flex items-start space-x-4">
              <div className="flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload Image</span>
                </Button>
                {faceImage && (
                  <p className="text-xs text-gray-500 mt-2">
                    Selected: {faceImage.name}
                  </p>
                )}
                {errors.faceImage && (
                  <p className="text-red-500 text-xs mt-1">{errors.faceImage}</p>
                )}
              </div>
              {faceImagePreview && (
                <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden">
                  <img
                    src={faceImagePreview}
                    alt="Face preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Fingerprints */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fingerprints (Max 5)
            </label>
            <div className="flex items-center space-x-3">
              {fingerprints.map((fp, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleFingerprint(index)}
                  className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center transition-all ${
                    fp
                      ? 'border-primary-500 bg-primary-50 text-primary-600'
                      : 'border-gray-300 bg-gray-50 text-gray-400 hover:border-primary-300'
                  }`}
                  title={`Fingerprint ${index + 1} ${fp ? '(Added)' : '(Click to add)'}`}
                >
                  <Fingerprint className="h-6 w-6" />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {fingerprints.filter(fp => fp).length}/5 fingerprints added
            </p>
          </div>

          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Card Number
            </label>
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={formData.cardNumber}
                onChange={(e) => handleCardNumberChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Enter card number"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleReadCard}
                className="flex items-center space-x-2 flex-shrink-0"
              >
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
            <span>{isSaving ? 'Saving...' : 'Save Person'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
