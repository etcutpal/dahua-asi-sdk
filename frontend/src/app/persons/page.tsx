'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
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

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

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
  const { isAuthenticated, logout } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Navigation items
  const navItems = [
    { name: 'Dashboard', path: '/', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Persons', path: '/persons', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { name: 'Access Records', path: '/access-records', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { name: 'Devices', path: '/devices', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

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
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
              <Icon path="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AccessPro</h1>
              <p className="text-xs text-slate-400">Access Control</p>
            </div>
          </div>
        </div>

        <nav className="px-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                item.path === '/persons'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Icon path={item.icon} className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Person Management</h1>
              <p className="text-gray-500 mt-1">Manage persons and their biometric data</p>
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

        <main>
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
      </div>

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
