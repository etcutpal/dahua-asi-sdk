'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PersonModal from '@/components/PersonModal';
import PersonList from '@/components/PersonList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Fingerprint,
  CreditCard,
  Image,
} from 'lucide-react';

interface Person {
  personId: string;
  name: string;
  faceImagePath: string | null;
  fingerprints: string[];
  cardNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

export default function PersonManagementPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Load persons from backend
  const loadPersons = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/persons`);
      const data = await response.json();
      
      if (data.success) {
        setPersons(data.persons || []);
      }
    } catch (error) {
      console.error('Error loading persons:', error);
      setPersons([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPersons();
  }, []);

  // Refresh persons
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPersons();
    setIsRefreshing(false);
  };

  // Filter persons by search term
  const filteredPersons = persons.filter(person =>
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    person.personId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle add person
  const handleAddPerson = () => {
    setEditingPerson(null);
    setIsModalOpen(true);
  };

  // Handle edit person
  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    setIsModalOpen(true);
  };

  // Handle delete person
  const handleDeletePerson = async (personId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/persons/${personId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (data.success) {
        await loadPersons();
      } else {
        alert('Failed to delete person: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting person:', error);
      alert('Error deleting person');
    }
  };

  // Handle send person to device
  const handleSendToDevice = async (personId: string, deviceId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/persons/${personId}/send-to-device`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deviceId }),
        }
      );

      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          message: `Person sent to device successfully!\n\n${data.result.message || ''}`,
        };
      } else {
        return {
          success: false,
          message: data.message || 'Failed to send to device',
          error: data.error,
        };
      }
    } catch (error) {
      console.error('Error sending person to device:', error);
      return {
        success: false,
        message: 'Error sending to device',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  // Handle modal save
  const handleModalSave = async (formData: FormData) => {
    try {
      const url = editingPerson
        ? `${API_URL}/api/persons/${editingPerson.personId}`
        : `${API_URL}/api/persons`;

      const method = editingPerson ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Person saved successfully!');
        setIsModalOpen(false);
        setEditingPerson(null);
        await loadPersons();
        return true;
      } else {
        alert(`❌ Error saving person:\n\n${data.error}`);
        return false;
      }
    } catch (error) {
      console.error('Error saving person:', error);
      alert(`❌ Error saving person:\n\n${error instanceof Error ? error.message : 'Unknown network error'}`);
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <div className="flex items-center space-x-3">
                <User className="h-8 w-8 text-primary-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Person Management</h1>
                  <p className="text-sm text-gray-500">Manage persons and their biometric data</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
              <Button
                onClick={handleAddPerson}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Person</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Persons</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{persons.length}</div>
              <p className="text-xs text-muted-foreground">Registered persons</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Face Images</CardTitle>
              <Image className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {persons.filter(p => p.faceImagePath).length}
              </div>
              <p className="text-xs text-muted-foreground">Have face images</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Fingerprints</CardTitle>
              <Fingerprint className="h-4 w-4 text-primary-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary-600">
                {persons.filter(p => p.fingerprints.length > 0 && p.fingerprints[0]).length}
              </div>
              <p className="text-xs text-muted-foreground">Have fingerprints</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Cards</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {persons.filter(p => p.cardNumbers.length > 0 && p.cardNumbers[0]).length}
              </div>
              <p className="text-xs text-muted-foreground">Have card numbers</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by person name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </CardContent>
        </Card>

        {/* Person List */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </CardContent>
          </Card>
        ) : (
          <PersonList
            persons={filteredPersons}
            onEdit={handleEditPerson}
            onDelete={handleDeletePerson}
            onSendToDevice={handleSendToDevice}
          />
        )}
      </main>

      {/* Person Modal */}
      <PersonModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPerson(null);
        }}
        onSave={handleModalSave}
        person={editingPerson}
      />
    </div>
  );
}
