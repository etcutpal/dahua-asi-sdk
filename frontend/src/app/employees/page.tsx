'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import { useRouter } from 'next/navigation';
import React from 'react';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface PersonGroup {
  id: string;
  name: string;
  parentId: string | null;
  isDefault?: boolean;
}

interface Employee {
  id: string;
  personId: string;
  name: string;
  department: string;
  gender: string;
  effectiveStart: string;
  effectiveEnd: string;
  profilePicture: string;
  facePicture: string;
  cardNumbers: string[];   // up to 5 cards
  password: string;        // door-open PIN
  fingerprints: any[];     // string (SVG data-URL) or device object { index, dataBase64, packetLen, packetCount }
  // Additional Info
  title: string;
  nickname: string;
  dateOfBirth: string;
  phone: string;
  occupation: string;
  email: string;
  address: string;
  remarks: string;
}

export default function EmployeesPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  
  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [searchType, setSearchType] = useState<'personId' | 'name' | 'group' | 'cardNumber'>('personId');
  const [searchText, setSearchText] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']));
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMoveToModal, setShowMoveToModal] = useState(false);
  const [moveToGroupId, setMoveToGroupId] = useState<string>('all');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  
  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Success message
  const [successMessage, setSuccessMessage] = useState('');

  // Send to Device
  const [showSendToDeviceModal, setShowSendToDeviceModal] = useState(false);
  const [sendToDeviceEmployee, setSendToDeviceEmployee] = useState<Employee | null>(null);
  const [sendToDeviceList, setSendToDeviceList] = useState<{ deviceId: string; name: string; registrationId: string; status?: string }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isSendingToDevice, setIsSendingToDevice] = useState(false);
  const [sendToDeviceStatus, setSendToDeviceStatus] = useState<{ success: boolean; message: string; error?: string } | null>(null);

  // Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Import from Device — multi-step modal
  const [showImportFromDeviceModal, setShowImportFromDeviceModal] = useState(false);
  const [importFromDeviceId, setImportFromDeviceId] = useState('');
  const [importFromDeviceConflict, setImportFromDeviceConflict] = useState<'skip' | 'overwrite'>('skip');
  const [importFromDeviceLoading, setImportFromDeviceLoading] = useState(false);
  const [importFromDeviceResult, setImportFromDeviceResult] = useState<{ totalOnDevice: number; totalSelected: number; imported: number; updated: number; skipped: number; failed: number; errors: string[] } | null>(null);
  // Step 2: search results & selection
  const [importDeviceSearchLoading, setImportDeviceSearchLoading] = useState(false);
  const [importDeviceUsers, setImportDeviceUsers] = useState<{ userId: string; name: string; userType: string; validBegin: string; validEnd: string }[]>([]);
  const [importDeviceFilter, setImportDeviceFilter] = useState('');
  const [importSelectedIds, setImportSelectedIds] = useState<Set<string>>(new Set());
  const [importTargetGroup, setImportTargetGroup] = useState('all');
  // step: 'config' | 'select' | 'done'
  const [importStep, setImportStep] = useState<'config' | 'select' | 'done'>('config');

  // Employee Form
  const [employeeForm, setEmployeeForm] = useState({
    personId: '',
    name: '',
    department: 'all',
    gender: '',
    effectiveStart: '',
    effectiveEnd: '',
    profilePicture: '',
    facePicture: '',
    cardNumbers: [] as string[],
    password: '',
    fingerprints: [] as any[],
    // Additional Info
    title: 'Mr.',
    nickname: '',
    dateOfBirth: '',
    phone: '',
    occupation: '',
    email: '',
    address: '',
    remarks: '',
  });

  // Person Group Management
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupParentId, setNewGroupParentId] = useState<string>('all');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      setIsLoading(false);
      loadDefaultEmployee();
      loadInitialData();
    }
  }, [isAuthenticated, router]);

  // Close More menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMoreMenu) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMoreMenu]);

  const loadInitialData = async () => {
    // Always start with "All Person" default group
    const defaultGroups: PersonGroup[] = [
      { id: 'all', name: 'All Person', parentId: null, isDefault: true }
    ];

    try {
      // Load person groups from API
      const groupsResponse = await fetch('http://localhost:3001/api/employees/groups');
      if (groupsResponse.ok) {
        const apiData = await groupsResponse.json();
        const apiGroups: PersonGroup[] = apiData.groups || apiData || [];
        // Combine default "All Person" with API groups
        const allGroups = [...defaultGroups, ...apiGroups.filter((g: PersonGroup) => g.id !== 'all')];
        setPersonGroups(allGroups);
      }
      // If not ok, keep current state (don't reset — avoids wiping locally-created groups)

      // Load employees
      const employeesResponse = await fetch('http://localhost:3001/api/employees');
      if (employeesResponse.ok) {
        const employeesData = await employeesResponse.json();
        // Backend returns { success: true, data: [...] }
        const list = employeesData.data || employeesData;
        setEmployees(Array.isArray(list) ? list : []);
      }

      // Make sure "All Person" is always expanded
      setExpandedGroups(new Set(['all']));
    } catch (error) {
      console.error('Error loading initial data:', error);
      // On error, only set default groups if we currently have none
      setPersonGroups(prev => prev.length === 0 ? defaultGroups : prev);
    }
  };

  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  /**
   * Normalize any date string (ISO UTC, ISO with seconds, or already datetime-local)
   * to the "YYYY-MM-DDTHH:mm" format required by <input type="datetime-local">.
   * Returns '' for invalid/missing dates or dates before year 2000 (SDK sentinel values).
   */
  const toDateTimeLocal = (value: string | null | undefined): string => {
    if (!value) return '';
    // Already in datetime-local format (no Z, no seconds beyond HH:mm)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      const year = parseInt(value.substring(0, 4), 10);
      return year >= 2000 ? value : '';
    }
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      if (d.getFullYear() < 2000) return '';   // reject SDK sentinel dates (1970, 1900, 0000…)
      return formatDateTimeLocal(d);
    } catch {
      return '';
    }
  };

  // Helper to get full image URL
  const getImageUrl = (imagePath: string) => {
    if (!imagePath) return '';
    // If it's already a full URL or base64, return as is
    if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
      return imagePath;
    }
    // Otherwise prepend backend URL
    return `http://localhost:3001${imagePath}`;
  };

  const loadDefaultEmployee = () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endDate = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate(), 23, 59, 59);
    
    setEmployeeForm({
      personId: '',
      name: '',
      department: 'all',
      gender: '',
      effectiveStart: formatDateTimeLocal(startDate),
      effectiveEnd: formatDateTimeLocal(endDate),
      profilePicture: '',
      facePicture: '',
      cardNumbers: [],
      password: '',
      fingerprints: [],
      title: 'Mr.',
      nickname: '',
      dateOfBirth: '',
      phone: '',
      occupation: '',
      email: '',
      address: '',
      remarks: '',
    });
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const getChildGroups = (parentId: string | null) => {
    return personGroups.filter(g => g.parentId === parentId);
  };

  // Get groups in hierarchical order with depth level
  const getHierarchicalGroups = (parentId: string | null = null, level: number = 0): Array<PersonGroup & { level: number }> => {
    const children = getChildGroups(parentId);
    let result: Array<PersonGroup & { level: number }> = [];
    
    children.forEach(child => {
      result.push({ ...child, level });
      // Recursively add children
      result = [...result, ...getHierarchicalGroups(child.id, level + 1)];
    });
    
    return result;
  };

  // Check if a group is the last child of its parent
  const isLastChild = (group: PersonGroup): boolean => {
    const siblings = getChildGroups(group.parentId);
    return siblings[siblings.length - 1]?.id === group.id;
  };

  // Custom Tree Dropdown Component
  const TreeDropdown = ({
    value,
    onChange,
    label
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const hierarchicalGroups = getHierarchicalGroups();

    return (
      <div className="relative" ref={dropdownRef}>
        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">{label}</label>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between text-sm text-gray-700 hover:border-gray-300 transition-colors"
        >
          <span className="text-gray-900">
            {personGroups.find(g => g.id === value)?.name || 'Select...'}
          </span>
          <Icon className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} path="M19 9l-7 7-7-7" />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            <div className="p-3">
              {hierarchicalGroups.map((group, index) => {
                const isSelected = value === group.id;

                return (
                  <div key={group.id} className="relative">
                    {/* Tree visualization with dotted lines */}
                    <div className="flex items-center">
                      {/* Dotted tree lines container */}
                      <div className="flex-shrink-0 relative" style={{ width: `${group.level * 24}px`, height: '32px' }}>
                        {Array.from({ length: group.level }).map((_, levelIdx) => {
                          // Check if there's a sibling below at this level
                          const hasSiblingBelow = hierarchicalGroups.slice(index + 1).some(
                            g => g.level === levelIdx
                          );
                          
                          return (
                            <React.Fragment key={levelIdx}>
                              {/* Vertical dotted line */}
                              {hasSiblingBelow && (
                                <div
                                  className="absolute top-0 bottom-0"
                                  style={{
                                    left: `${levelIdx * 24}px`,
                                    width: '1px',
                                    borderLeft: '2px dotted #d1d5db'
                                  }}
                                />
                              )}
                              {/* Horizontal dotted line at corner */}
                              {levelIdx === group.level - 1 && (
                                <div
                                  className="absolute"
                                  style={{
                                    top: '50%',
                                    left: `${levelIdx * 24}px`,
                                    width: '24px',
                                    borderTop: '2px dotted #d1d5db'
                                  }}
                                />
                              )}
                              {/* Corner dot */}
                              {levelIdx === group.level - 1 && (
                                <div
                                  className="absolute rounded-full bg-gray-300"
                                  style={{
                                    top: 'calc(50% - 2px)',
                                    left: `${levelIdx * 24 - 2}px`,
                                    width: '4px',
                                    height: '4px'
                                  }}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Clickable area */}
                      <button
                        type="button"
                        onClick={() => {
                          onChange(group.id);
                          setIsOpen(false);
                        }}
                        className={`flex-1 flex items-center py-1.5 px-2 rounded-md transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {/* Dot before name */}
                        {group.level > 0 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-2 flex-shrink-0" />
                        )}
                        <span className="text-sm">{group.name}</span>
                        {group.isDefault && (
                          <span className="ml-2 text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const getGroupEmployeeCount = (groupId: string) => {
    if (groupId === 'all') {
      return employees.length;
    }
    return employees.filter(e => e.department === groupId).length;
  };

  const getFilteredEmployees = () => {
    let filtered = employees;
    
    // Filter by group
    if (selectedGroupId !== 'all') {
      filtered = filtered.filter(e => e.department === selectedGroupId);
    }
    
    // Filter by search
    if (searchText.trim()) {
      const search = searchText.trim().toLowerCase();
      
      switch (searchType) {
        case 'personId':
          filtered = filtered.filter(e => e.personId.toLowerCase().includes(search));
          break;
        case 'name':
          filtered = filtered.filter(e => e.name.toLowerCase().includes(search));
          break;
        case 'group':
          filtered = filtered.filter(e => {
            const groupName = personGroups.find(g => g.id === e.department)?.name || '';
            return groupName.toLowerCase().includes(search);
          });
          break;
        case 'cardNumber':
          filtered = filtered.filter(e => e.cardNumbers && e.cardNumbers.some(c => c.toLowerCase().includes(search)));
          break;
      }
    }
    
    return filtered;
  };

  // Pagination logic
  const filteredEmployees = getFilteredEmployees();
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentEmployees = filteredEmployees.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredEmployees.length / recordsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleRecordsPerPageChange = (newLimit: number) => {
    setRecordsPerPage(newLimit);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Group Management
  const handleAddGroup = async () => {
    if (newGroupName.trim()) {
      const newGroup: PersonGroup = {
        id: `group_${Date.now()}`,
        name: newGroupName,
        parentId: newGroupParentId,
      };

      // Save to backend first — update local state with the server-confirmed group
      try {
        const res = await fetch('http://localhost:3001/api/employees/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newGroup),
        });
        if (res.ok) {
          const data = await res.json();
          // Use the group returned by the server (it may have been adjusted)
          const savedGroup: PersonGroup = data.group || newGroup;
          setPersonGroups(prev => [...prev, savedGroup]);
        } else {
          // Save failed — still add locally so UI is not broken
          console.error('Failed to save group to backend');
          setPersonGroups(prev => [...prev, newGroup]);
        }
      } catch (error) {
        console.error('Error adding group:', error);
        // Fallback: still add locally
        setPersonGroups(prev => [...prev, newGroup]);
      }

      // Expand the parent group
      setExpandedGroups(prev => new Set([...prev, newGroupParentId]));

      setNewGroupName('');
      setShowAddGroupModal(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const group = personGroups.find(g => g.id === groupId);
    if (group?.isDefault) {
      alert('Cannot delete the default "All Person" group');
      return;
    }

    const hasChildren = personGroups.some(g => g.parentId === groupId);
    if (hasChildren) {
      alert('Cannot delete a group that has child groups');
      return;
    }

    try {
      await fetch(`http://localhost:3001/api/employees/groups/${groupId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error deleting group:', error);
    }

    // Always update local state
    setPersonGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // Employee Management
  const handleNewEmployee = () => {
    setEditingEmployee(null);
    loadDefaultEmployee();
    setShowModal(true);
  };

  // Selection Management
  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployees(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  const selectAllEmployees = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const clearSelection = () => {
    setSelectedEmployees(new Set());
    setShowMoreMenu(false);
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedEmployees.size === 0) return;

    setShowBulkDeleteModal(true);
    setShowMoreMenu(false);
  };

  const confirmBulkDelete = async () => {
    if (selectedEmployees.size === 0) return;

    try {
      // Delete from backend
      for (const employeeId of selectedEmployees) {
        await fetch(`http://localhost:3001/api/employees/${employeeId}`, { method: 'DELETE' });
      }

      // Update local state
      setEmployees(prev => prev.filter(e => !selectedEmployees.has(e.id)));
      setSuccessMessage(`Successfully deleted ${selectedEmployees.size} employee(s)!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting employees:', error);
    }

    setSelectedEmployees(new Set());
    setShowBulkDeleteModal(false);
  };

  // Bulk Move to Group
  const handleBulkMove = async () => {
    if (selectedEmployees.size === 0) return;

    try {
      // Update employees in backend
      for (const employeeId of selectedEmployees) {
        const employee = employees.find(e => e.id === employeeId);
        if (employee) {
          const updatedEmployee = { ...employee, department: moveToGroupId };
          await fetch('http://localhost:3001/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEmployee),
          });
        }
      }

      // Update local state
      setEmployees(prev => prev.map(e => 
        selectedEmployees.has(e.id) ? { ...e, department: moveToGroupId } : e
      ));

      const groupName = personGroups.find(g => g.id === moveToGroupId)?.name || moveToGroupId;
      setSuccessMessage(`Successfully moved ${selectedEmployees.size} employee(s) to ${groupName}!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error moving employees:', error);
    }

    setSelectedEmployees(new Set());
    setShowMoreMenu(false);
    setShowMoveToModal(false);
    setMoveToGroupId('all');
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    // Use default dates when the stored value is missing or an SDK sentinel (1970/1900/0000)
    const now = new Date();
    const defaultStart = formatDateTimeLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
    const defaultEnd   = formatDateTimeLocal(new Date(now.getFullYear() + 10, now.getMonth(), now.getDate(), 23, 59, 0));
    setEmployeeForm({
      personId: employee.personId,
      name: employee.name,
      department: employee.department,
      gender: employee.gender || '',
      effectiveStart: toDateTimeLocal(employee.effectiveStart) || defaultStart,
      effectiveEnd:   toDateTimeLocal(employee.effectiveEnd)   || defaultEnd,
      profilePicture: employee.profilePicture,
      facePicture: employee.facePicture,
      cardNumbers: employee.cardNumbers || [],
      password: employee.password || '',
      fingerprints: employee.fingerprints || [],
      title: employee.title || 'Mr.',
      nickname: employee.nickname || '',
      dateOfBirth: employee.dateOfBirth || '',
      phone: employee.phone || '',
      occupation: employee.occupation || '',
      email: employee.email || '',
      address: employee.address || '',
      remarks: employee.remarks || '',
    });
    setShowModal(true);
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    setDeleteConfirmId(employeeId);
  };

  const confirmDeleteEmployee = async () => {
    if (!deleteConfirmId) return;

    try {
      await fetch(`http://localhost:3001/api/employees/${deleteConfirmId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error deleting employee:', error);
    }

    // Always update local state
    setEmployees(prev => prev.filter(e => e.id !== deleteConfirmId));
    setDeleteConfirmId(null);
    setSuccessMessage('Employee deleted successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleSaveEmployee = async () => {
    if (!employeeForm.personId || !employeeForm.name) {
      alert('Person ID and Name are required');
      return;
    }

    // Check for unique Person ID
    const exists = employees.some(e => e.personId === employeeForm.personId && e.id !== editingEmployee?.id);
    if (exists) {
      alert('Person ID must be unique');
      return;
    }

    try {
      const employeeData: Employee = {
        id: editingEmployee?.id || `emp_${Date.now()}`,
        ...employeeForm,
      };

      const response = await fetch('http://localhost:3001/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employeeData),
      });

      if (response.ok) {
        const result = await response.json();
        const savedEmployee = result.data || employeeData;
        
        if (editingEmployee) {
          // Update existing employee
          setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? savedEmployee : e));
          setSuccessMessage('Employee updated successfully!');
        } else {
          // Add new employee
          setEmployees(prev => [...prev, savedEmployee]);
          setSuccessMessage('Employee added successfully!');
        }
        
        // Close modal and reset form
        setShowModal(false);
        setEditingEmployee(null);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        throw new Error('Failed to save employee');
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      // Fallback: Update local state even if API fails
      const employeeData: Employee = {
        id: editingEmployee?.id || `emp_${Date.now()}`,
        ...employeeForm,
      };
      
      if (editingEmployee) {
        setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? employeeData : e));
      } else {
        setEmployees(prev => [...prev, employeeData]);
      }
      
      setShowModal(false);
      setEditingEmployee(null);
      setSuccessMessage(editingEmployee ? 'Employee updated successfully!' : 'Employee added successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Send to Device
  const handleSendToDeviceClick = async (employee: Employee) => {
    setSendToDeviceEmployee(employee);
    setShowSendToDeviceModal(true);
    setSendToDeviceStatus(null);
    setSelectedDeviceId('');

    try {
      const PERSONS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${PERSONS_API}/api/devices`);
      const data = await response.json();
      if (data.success) {
        setSendToDeviceList(data.devices || []);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      setSendToDeviceList([]);
    }
  };

  const confirmSendToDevice = async () => {
    if (!sendToDeviceEmployee || !selectedDeviceId) return;

    setIsSendingToDevice(true);
    setSendToDeviceStatus(null);

    try {
      const PERSONS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${PERSONS_API}/api/employees/${sendToDeviceEmployee.id}/send-to-device`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: selectedDeviceId }),
        }
      );
      const data = await response.json();

      if (data.success) {
        setSendToDeviceStatus({
          success: true,
          message: `"${sendToDeviceEmployee.name}" sent to device successfully!\n${data.result?.message || ''}`,
        });
      } else {
        setSendToDeviceStatus({
          success: false,
          message: data.message || data.error || 'Failed to send to device',
          error: data.error,
        });
      }
    } catch (error) {
      setSendToDeviceStatus({
        success: false,
        message: 'Error sending to device',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSendingToDevice(false);
    }
  };

  const handleCloseSendToDeviceModal = () => {
    setShowSendToDeviceModal(false);
    setSendToDeviceEmployee(null);
    setSelectedDeviceId('');
    setSendToDeviceStatus(null);
    setSendToDeviceList([]);
  };

  // File uploads
  const handleProfilePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEmployeeForm({ ...employeeForm, profilePicture: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFacePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEmployeeForm({ ...employeeForm, facePicture: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFingerprintUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEmployeeForm({ ...employeeForm, fingerprints: [...employeeForm.fingerprints, reader.result as string] });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFingerprint = (index: number) => {
    setEmployeeForm({ ...employeeForm, fingerprints: employeeForm.fingerprints.filter((_, i) => i !== index) });
  };

  // TODO: Implement generic fingerprint scanner integration - Replace simulated capture with real scanner SDK
  // Required: Install fingerprint scanner SDK (e.g., Digital Persona, ZKTeco, Futronic)
  // Create local service that communicates with scanner via HTTP/WebSocket
  // Update handleSimulatedFingerprintCapture to call the local scanner API
  const [isCapturingFingerprint, setIsCapturingFingerprint] = useState(false);
  const [fingerprintCaptureProgress, setFingerprintCaptureProgress] = useState(0);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fingerprint scanner type selection
  const [showScannerDropdown, setShowScannerDropdown] = useState(false);
  const [selectedScannerType, setSelectedScannerType] = useState<string>('simulated');
  const scannerDropdownRef = useRef<HTMLDivElement>(null);

  const scannerTypes = [
    { id: 'simulated', name: 'Simulated (Demo)', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { id: 'usb', name: 'External USB Scanner', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { id: 'access-control', name: 'Access Control Built-in Scanner', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ];

  // Card reader type selection
  const [showCardReaderDropdown, setShowCardReaderDropdown] = useState(false);
  const [selectedCardReaderType, setSelectedCardReaderType] = useState<string>('manual');
  const cardReaderDropdownRef = useRef<HTMLDivElement>(null);

  const cardReaderTypes = [
    { id: 'manual', name: 'Manual Entry', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'usb', name: 'External USB Reader', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { id: 'access-control', name: 'Access Control Built-in Reader', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scannerDropdownRef.current && !scannerDropdownRef.current.contains(event.target as Node)) {
        setShowScannerDropdown(false);
      }
      if (cardReaderDropdownRef.current && !cardReaderDropdownRef.current.contains(event.target as Node)) {
        setShowCardReaderDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSimulatedFingerprintCapture = () => {
    // TODO: Replace with actual scanner SDK call when implementing generic fingerprint scanner integration
    setIsCapturingFingerprint(true);
    setFingerprintCaptureProgress(0);

    // Simulate capture progress
    let progress = 0;
    captureTimerRef.current = setInterval(() => {
      progress += 10;
      setFingerprintCaptureProgress(progress);
      if (progress >= 100) {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        // Simulate successful capture with a placeholder fingerprint template
        const simulatedFingerprint = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" stroke-width="2"/><path d="M30 50 Q50 30 70 50 Q50 70 30 50" fill="none" stroke="#3b82f6" stroke-width="1.5"/><path d="M25 45 Q50 20 75 45 Q50 70 25 45" fill="none" stroke="#3b82f6" stroke-width="1.5"/><path d="M35 55 Q50 35 65 55 Q50 65 35 55" fill="none" stroke="#3b82f6" stroke-width="1.5"/></svg>`)}`;
        setEmployeeForm({ ...employeeForm, fingerprints: [...employeeForm.fingerprints, simulatedFingerprint] });
        setIsCapturingFingerprint(false);
        setFingerprintCaptureProgress(0);
      }
    }, 200);
  };

  const stopFingerprintCapture = () => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
    }
    setIsCapturingFingerprint(false);
    setFingerprintCaptureProgress(0);
  };

  useEffect(() => {
    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
      }
    };
  }, []);

  const handleLogout = () => logout();

  // Import from Device handler
  // Step 1 → 2: Search persons on the device
  const handleSearchDevicePersons = async () => {
    if (!importFromDeviceId) return;
    setImportDeviceSearchLoading(true);
    setImportDeviceUsers([]);
    setImportSelectedIds(new Set());
    setImportDeviceFilter('');
    try {
      const PERSONS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${PERSONS_API}/api/devices/${importFromDeviceId}/users`);
      const data = await res.json();
      if (data.success) {
        setImportDeviceUsers(data.users || []);
        setImportStep('select');
      } else {
        alert(data.error || 'Failed to fetch persons from device');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to fetch persons from device');
    } finally {
      setImportDeviceSearchLoading(false);
    }
  };

  // Step 3: Execute import for selected persons
  const handleImportFromDevice = async () => {
    if (!importFromDeviceId || importSelectedIds.size === 0) return;
    setImportFromDeviceLoading(true);
    setImportFromDeviceResult(null);
    try {
      const PERSONS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${PERSONS_API}/api/employees/import-from-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: importFromDeviceId,
          conflictMode: importFromDeviceConflict,
          selectedPersonIds: Array.from(importSelectedIds),
          targetGroup: importTargetGroup,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImportFromDeviceResult(data);
        setImportStep('done');
        // Reload employees list
        const resp = await fetch(`${PERSONS_API}/api/employees`);
        if (resp.ok) {
          const d = await resp.json();
          const list = d.data || d;
          setEmployees(Array.isArray(list) ? list : []);
        }
      } else {
        alert(data.error || 'Import failed');
      }
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImportFromDeviceLoading(false);
    }
  };

  // Import employees from zip file
  const handleImportFromZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      alert('Please select a valid zip file');
      return;
    }

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);
      
      // Find the Excel file
      const excelFile = Object.values(zipContent.files).find((f: any) => f.name.endsWith('.xlsx')) as any;
      if (!excelFile) {
        alert('No Excel file found in the zip archive');
        return;
      }

      // Read Excel file
      const excelData = await excelFile.async('arraybuffer');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(excelData);
      
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        alert('No worksheet found in the Excel file');
        return;
      }

      // Read image folders
      const profilePicturesFolder = zipContent.folder('profile_pictures');
      const facePicturesFolder = zipContent.folder('face_pictures');

      // Load existing employees to check for duplicate Person IDs
      const existingPersonIds = new Set(employees.map(emp => emp.personId));

      const results = { success: 0, failed: 0, errors: [] as string[] };
      const newEmployees: Employee[] = [];

      // Helper function to convert Excel cell value to string (non-date columns)
      const getCellValue = (cellValue: any): string => {
        if (!cellValue) return '';
        
        // If it's already a string, return it
        if (typeof cellValue === 'string') return cellValue.trim();
        
        // If it's a Date object
        if (cellValue instanceof Date) {
          const year = cellValue.getFullYear();
          const month = String(cellValue.getMonth() + 1).padStart(2, '0');
          const day = String(cellValue.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        
        // If it's an object (rich text, formula result, etc.)
        if (typeof cellValue === 'object') {
          // Rich text or text object
          if (cellValue.text !== undefined) {
            return getCellValue(cellValue.text);
          }
          // Formula result or error
          if (cellValue.result !== undefined) {
            return getCellValue(cellValue.result);
          }
          // Hyperlink or other special types with value property
          if (cellValue.value !== undefined) {
            return getCellValue(cellValue.value);
          }
          // Check if it has toDate method (ExcelJS date object)
          if (cellValue.toDate instanceof Function) {
            try {
              const date = cellValue.toDate();
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            } catch (e) {
              // Ignore conversion errors
            }
          }
          // Fallback
          return String(cellValue).trim();
        }
        
        // For numbers and other types, just convert to string
        return String(cellValue).trim();
      };

      // Helper function specifically for date cells
      const getDateCellValue = (cellValue: any): string => {
        if (!cellValue) return '';
        
        // If it's already a string, return it
        if (typeof cellValue === 'string') return cellValue.trim();
        
        // If it's a Date object
        if (cellValue instanceof Date) {
          const year = cellValue.getFullYear();
          const month = String(cellValue.getMonth() + 1).padStart(2, '0');
          const day = String(cellValue.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        
        // If it's a number (Excel dates are stored as numbers)
        if (typeof cellValue === 'number') {
          const excelEpoch = new Date(1900, 0, 1);
          const actualDate = new Date(excelEpoch.getTime() + (cellValue - 2) * 24 * 60 * 60 * 1000);
          const year = actualDate.getFullYear();
          const month = String(actualDate.getMonth() + 1).padStart(2, '0');
          const day = String(actualDate.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        
        // If it's an object
        if (typeof cellValue === 'object') {
          // Check if it has toDate method (ExcelJS date object)
          if (cellValue.toDate instanceof Function) {
            try {
              const date = cellValue.toDate();
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            } catch (e) {
              // Ignore conversion errors
            }
          }
          // Formula result
          if (cellValue.result !== undefined) {
            return getDateCellValue(cellValue.result);
          }
          // Value property
          if (cellValue.value !== undefined) {
            return getDateCellValue(cellValue.value);
          }
          return String(cellValue).trim();
        }
        
        // Fallback
        return String(cellValue).trim();
      };

      // Skip header row (row 1)
      for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
        const row = worksheet.getRow(rowIndex);
        const personId = getCellValue(row.getCell(1).value);
        const title = getCellValue(row.getCell(2).value) || 'Mr.';
        const name = getCellValue(row.getCell(3).value);
        const nickname = getCellValue(row.getCell(4).value);
        const departmentName = getCellValue(row.getCell(5).value) || 'all';
        const gender = getCellValue(row.getCell(6).value);
        const profilePictureFile = getCellValue(row.getCell(7).value);
        const faceImageFile = getCellValue(row.getCell(8).value);
        const fingerprint1 = getCellValue(row.getCell(9).value);
        const fingerprint2 = getCellValue(row.getCell(10).value);
        const fingerprint3 = getCellValue(row.getCell(11).value);
        const fingerprint4 = getCellValue(row.getCell(12).value);
        const fingerprint5 = getCellValue(row.getCell(13).value);
        const dateOfBirth = getDateCellValue(row.getCell(14).value);
        const phone = getCellValue(row.getCell(15).value);
        const email = getCellValue(row.getCell(16).value);
        const occupation = getCellValue(row.getCell(17).value);
        const address = getCellValue(row.getCell(18).value);
        const cardNumbers = getCellValue(row.getCell(19).value).split(',').map((s: string) => s.trim()).filter(Boolean);
        const effectiveStart = getDateCellValue(row.getCell(20).value);
        const effectiveEnd = getDateCellValue(row.getCell(21).value);
        const remarks = getCellValue(row.getCell(22).value);

        // Validate required fields
        if (!personId) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Person ID is required`);
          continue;
        }

        if (!name) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Name is required`);
          continue;
        }

        // Check for duplicate Person ID
        if (existingPersonIds.has(personId)) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Person ID "${personId}" already exists`);
          continue;
        }

        // Find department ID from name
        const department = personGroups.find(g => g.name === departmentName)?.id || 'all';

        // Validate and process profile picture
        let profilePicture = '';
        if (profilePictureFile) {
          // Check if folder exists and file exists in it
          if (!profilePicturesFolder) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Profile picture "${profilePictureFile}" referenced but profile_pictures folder not found in zip`);
            continue;
          }
          const profileFile = profilePicturesFolder.file(profilePictureFile);
          if (!profileFile) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Profile picture file "${profilePictureFile}" not found in profile_pictures folder`);
            continue;
          }
          try {
            const profileData = await profileFile.async('base64');
            const extension = profilePictureFile.split('.').pop() || 'jpg';
            const mimeType = extension === 'png' ? 'image/png' : extension === 'svg' ? 'image/svg+xml' : 'image/jpeg';
            profilePicture = `data:${mimeType};base64,${profileData}`;
          } catch (error) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to read profile picture "${profilePictureFile}" - ${error}`);
            continue;
          }
        }

        // Validate and process face picture
        let facePicture = '';
        if (faceImageFile) {
          // Check if folder exists and file exists in it
          if (!facePicturesFolder) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Face picture "${faceImageFile}" referenced but face_pictures folder not found in zip`);
            continue;
          }
          const faceFile = facePicturesFolder.file(faceImageFile);
          if (!faceFile) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Face picture file "${faceImageFile}" not found in face_pictures folder`);
            continue;
          }
          try {
            const faceData = await faceFile.async('base64');
            const extension = faceImageFile.split('.').pop() || 'jpg';
            const mimeType = extension === 'png' ? 'image/png' : extension === 'svg' ? 'image/svg+xml' : 'image/jpeg';
            facePicture = `data:${mimeType};base64,${faceData}`;
          } catch (error) {
            results.failed++;
            results.errors.push(`Row ${rowIndex}: Failed to read face picture "${faceImageFile}" - ${error}`);
            continue;
          }
        }

        // Validate fingerprints (must be valid base64 if provided)
        const fingerprints = [];
        let hasFingerprintError = false;
        for (let i = 1; i <= 5; i++) {
          const fpValue = [fingerprint1, fingerprint2, fingerprint3, fingerprint4, fingerprint5][i - 1];
          if (fpValue) {
            if (fpValue.startsWith('data:')) {
              fingerprints.push(fpValue);
            } else {
              results.failed++;
              results.errors.push(`Row ${rowIndex}: Fingerprint ${i} has invalid format (not a valid base64 data URI)`);
              hasFingerprintError = true;
              break;
            }
          }
        }

        // If we already have errors for this row, skip it
        if (hasFingerprintError) {
          continue;
        }

        // Create new employee
        const newEmployee: Employee = {
          id: `emp_${Date.now()}_${rowIndex}`,
          personId,
          name,
          department,
          gender,
          effectiveStart: effectiveStart || formatDateTimeLocal(new Date()),
          effectiveEnd: effectiveEnd || formatDateTimeLocal(new Date(new Date().getFullYear() + 10, 11, 31)),
          profilePicture,
          facePicture,
          cardNumbers,
          password: '',
          fingerprints: [],
          title,
          nickname,
          dateOfBirth,
          phone,
          occupation,
          email,
          address,
          remarks,
        };

        newEmployees.push(newEmployee);
        existingPersonIds.add(personId);
        results.success++;
      }

      // Add all new employees
      setEmployees(prev => [...prev, ...newEmployees]);

      // Save to backend
      for (const employee of newEmployees) {
        try {
          await fetch('http://localhost:3001/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(employee),
          });
        } catch (error) {
          console.error('Error saving employee to backend:', employee.name, error);
        }
      }

      setImportStatus(results);
      setShowImportModal(true);
      setSuccessMessage(`Successfully imported ${results.success} employee(s)!`);
      setTimeout(() => setSuccessMessage(''), 3000);

    } catch (error) {
      console.error('Error importing zip file:', error);
      alert('Failed to import file. Please ensure it is a valid employee export zip file.');
    }

    // Reset file input
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  };

  // Export employees to Excel with images in zip
  const handleExportToExcel = async () => {
    try {
      // Helper to fetch image and convert to base64
      const fetchImageAsBase64 = async (imageData: string): Promise<{ base64: string; extension: string } | null> => {
        if (!imageData) return null;
        
        // If already base64, return as is
        if (imageData.startsWith('data:')) {
          const mimeMatch = imageData.match(/^data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const extension = mimeType.includes('png') ? 'png' : mimeType.includes('svg') ? 'svg' : 'jpg';
          return { base64: imageData, extension };
        }
        
        // If server path, fetch it
        try {
          const imageUrl = imageData.startsWith('http') ? imageData : `http://localhost:3001${imageData}`;
          const response = await fetch(imageUrl);
          if (!response.ok) return null;
          
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              const extension = blob.type.includes('png') ? 'png' : blob.type.includes('svg') ? 'svg' : 'jpg';
              resolve({ base64, extension });
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Failed to fetch image from server path:', error);
          return null;
        }
      };

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Employees');

      // Define columns (with image name columns instead of embedded images)
      worksheet.columns = [
        { header: 'Person ID', key: 'personId', width: 20 },
        { header: 'Title', key: 'title', width: 10 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Nickname', key: 'nickname', width: 20 },
        { header: 'Department', key: 'department', width: 25 },
        { header: 'Gender', key: 'gender', width: 12 },
        { header: 'Profile Picture', key: 'profilePicture', width: 30 },
        { header: 'Face Image 1', key: 'faceImage', width: 30 },
        { header: 'Fingerprint 1', key: 'fingerprint1', width: 40 },
        { header: 'Fingerprint 2', key: 'fingerprint2', width: 40 },
        { header: 'Fingerprint 3', key: 'fingerprint3', width: 40 },
        { header: 'Fingerprint 4', key: 'fingerprint4', width: 40 },
        { header: 'Fingerprint 5', key: 'fingerprint5', width: 40 },
        { header: 'Date Of Birth', key: 'dateOfBirth', width: 15 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Occupation', key: 'occupation', width: 25 },
        { header: 'Address', key: 'address', width: 35 },
        { header: 'Card Number', key: 'cardNumber', width: 20 },
        { header: 'Effective Start', key: 'effectiveStart', width: 20 },
        { header: 'Effective End', key: 'effectiveEnd', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 30 },
      ];

      // Style headers
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2563EB' },
      };
      worksheet.getRow(1).alignment = { vertical: 'middle' };

      // Create JSZip instance
      const zip = new JSZip();
      const profilePicturesFolder = zip.folder('profile_pictures');
      const facePicturesFolder = zip.folder('face_pictures');

      // Track which images to add to zip
      let profileImageCount = 0;
      let faceImageCount = 0;

      // Add employee data
      for (const employee of employees) {
        const departmentName = personGroups.find(g => g.id === employee.department)?.name || employee.department;

        let profilePictureName = '';
        let faceImageName = '';

        // Fetch profile image
        if (employee.profilePicture && profilePicturesFolder) {
          try {
            const imageData = await fetchImageAsBase64(employee.profilePicture);
            if (imageData) {
              const extension = imageData.extension;
              const timestamp = Date.now() + profileImageCount;
              profilePictureName = `${employee.personId}_profile_${timestamp}.${extension}`;
              profileImageCount++;

              if (extension === 'svg') {
                const svgContent = decodeURIComponent(atob(imageData.base64.split(',')[1]));
                profilePicturesFolder.file(profilePictureName, svgContent);
              } else {
                const base64Data = imageData.base64.split(',')[1].replace(/\s/g, '');
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                profilePicturesFolder.file(profilePictureName, bytes);
              }
            }
          } catch (error) {
            console.error('Error adding profile image for', employee.name, error);
          }
        }

        // Fetch face image
        if (employee.facePicture && facePicturesFolder) {
          try {
            const imageData = await fetchImageAsBase64(employee.facePicture);
            if (imageData) {
              const extension = imageData.extension;
              const timestamp = Date.now() + faceImageCount;
              faceImageName = `${employee.personId}_face_${timestamp}.${extension}`;
              faceImageCount++;

              if (extension === 'svg') {
                const svgContent = decodeURIComponent(atob(imageData.base64.split(',')[1]));
                facePicturesFolder.file(faceImageName, svgContent);
              } else {
                const base64Data = imageData.base64.split(',')[1].replace(/\s/g, '');
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                facePicturesFolder.file(faceImageName, bytes);
              }
            }
          } catch (error) {
            console.error('Error adding face image for', employee.name, error);
          }
        }

        // Add row to Excel with the fetched filenames
        worksheet.addRow({
          personId: employee.personId,
          title: employee.title || '',
          name: employee.name,
          nickname: employee.nickname || '',
          department: departmentName,
          gender: employee.gender || '',
          profilePicture: profilePictureName,
          faceImage: faceImageName,
          fingerprint1: (employee.fingerprints || [])[0] || '',
          fingerprint2: (employee.fingerprints || [])[1] || '',
          fingerprint3: (employee.fingerprints || [])[2] || '',
          fingerprint4: (employee.fingerprints || [])[3] || '',
          fingerprint5: (employee.fingerprints || [])[4] || '',
          dateOfBirth: employee.dateOfBirth || '',
          phone: employee.phone || '',
          email: employee.email || '',
          occupation: employee.occupation || '',
          address: employee.address || '',
          cardNumber: (employee.cardNumbers || []).join(', '),
          effectiveStart: employee.effectiveStart || '',
          effectiveEnd: employee.effectiveEnd || '',
          remarks: employee.remarks || '',
        });
      }

      // Generate Excel file
      const excelBuffer = await workbook.xlsx.writeBuffer();
      zip.file('employees.xlsx', excelBuffer);

      // Generate and download zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      link.download = `employees_${timestamp}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export. Please try again.');
    }
  };

  // Recursive group tree renderer
  const renderGroupTree = (parentId: string | null, level: number = 0) => {
    const childGroups = getChildGroups(parentId);
    
    return childGroups.map(group => {
      const hasChildren = personGroups.some(g => g.parentId === group.id);
      const isExpanded = expandedGroups.has(group.id);
      const isSelected = selectedGroupId === group.id;
      const employeeCount = getGroupEmployeeCount(group.id);

      return (
        <div key={group.id} className="group">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {/* Expand/Collapse Arrow */}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleGroup(group.id); }}
                className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                <Icon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} path="M9 5l7 7-7 7" />
              </button>
            ) : (
              <div className="w-5" />
            )}

            {/* Group Icon */}
            <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" path="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />

            {/* Group Name and Count */}
            <span
              className={`flex-1 text-sm ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}
              onClick={() => {
                setSelectedGroupId(group.id);
                setCurrentPage(1);
              }}
            >
              {group.name}
            </span>
            
            {/* Default Badge */}
            {group.isDefault && (
              <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                Default
              </span>
            )}
            
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {employeeCount}
            </span>

            {/* Delete Button (not for default group) */}
            {!group.isDefault && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors group-hover:opacity-100 opacity-0"
              >
                <Icon className="w-3 h-3" path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </button>
            )}
          </div>

          {/* Render Children */}
          {hasChildren && isExpanded && (
            <div className="mt-1">
              {renderGroupTree(group.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading employees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 px-6 py-3 bg-green-50 border border-green-200 rounded-lg shadow-lg flex items-center gap-2">
          <Icon className="w-5 h-5 text-green-600" path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          <span className="text-sm text-green-800 font-medium">{successMessage}</span>
        </div>
      )}

      {/* Sidebar (reusable) */}
      <Sidebar currentPath="/employees" onLogout={handleLogout} />

      {/* Sidebar */}
      {/* <aside className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-2xl z-50">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">AccessPro</h1>
          <p className="text-sm text-gray-400 mt-1">Time & Attendance</p>
        </div>

        <nav className="mt-8">
          <Link href="/" className="flex items-center px-6 py-3 text-gray-300 hover:bg-slate-700/50 hover:text-white transition-colors">
            <Icon className="w-5 h-5 mr-3" path="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            Dashboard
          </Link>

          <Link href="/employees" className="flex items-center px-6 py-3 bg-blue-600/20 border-l-4 border-blue-500 text-white">
            <Icon className="w-5 h-5 mr-3" path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            Employees
          </Link>

          <div className="group relative">
            <Link href="/settings" className="flex items-center px-6 py-3 text-gray-300 hover:bg-slate-700/50 hover:text-white transition-colors">
              <Icon className="w-5 h-5 mr-3" path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              Settings
              <Icon className="w-4 h-4 ml-auto" path="M9 5l7 7-7 7" />
            </Link>
            <div className="hidden group-hover:block absolute left-full top-0 ml-0 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
              <Link href="/settings/attendance" className="flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                <Icon className="w-4 h-4 mr-3" path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                Attendance Configuration
              </Link>
              <Link href="/settings/devices" className="flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                <Icon className="w-4 h-4 mr-3" path="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                Device Settings
              </Link>
              <Link href="/settings/users" className="flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                <Icon className="w-4 h-4 mr-3" path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                User Management
              </Link>
              <Link href="/settings/system" className="flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                <Icon className="w-4 h-4 mr-3" path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                System Settings
              </Link>
            </div>
          </div>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <button onClick={handleLogout} className="flex items-center text-gray-300 hover:text-white transition-colors w-full">
            <Icon className="w-5 h-5 mr-3" path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            Logout
          </button>
        </div>
      </aside> */}

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8 overflow-visible">
        {/* Header */}
        <header className="mb-6 lg:mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">Employees</h2>
              <p className="text-sm text-gray-500 mt-1">Manage employee information and access credentials</p>
            </div>
            <div className="flex gap-3 relative flex-wrap">
              <input
                type="file"
                accept=".zip"
                ref={importFileInputRef}
                onChange={handleImportFromZip}
                className="hidden"
              />
              
              {/* More Button */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreMenu(!showMoreMenu);
                  }}
                  disabled={selectedEmployees.size === 0}
                  className={`px-5 py-2.5 rounded-lg font-medium transition-all flex items-center text-sm ${
                    selectedEmployees.size === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-800 text-white hover:bg-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" path="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  More
                  {selectedEmployees.size > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-white/20 text-white rounded text-xs">
                      {selectedEmployees.size}
                    </span>
                  )}
                </button>
                
                {/* More Menu Dropdown */}
                {showMoreMenu && selectedEmployees.size > 0 && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={handleBulkDelete}
                      className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors flex items-center"
                    >
                      <Icon className="w-4 h-4 mr-2" path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      Delete Selected
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowMoveToModal(true);
                      }}
                      className="w-full px-4 py-3 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center"
                    >
                      <Icon className="w-4 h-4 mr-2" path="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      Move to Group
                    </button>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => importFileInputRef.current?.click()}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all flex items-center text-sm"
              >
                <Icon className="w-4 h-4 mr-2" path="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                Import from Zip
              </button>
              <button
                onClick={handleExportToExcel}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-all flex items-center text-sm"
              >
                <Icon className="w-4 h-4 mr-2" path="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                Export to Excel
              </button>
              <button
                onClick={async () => {
                  setImportFromDeviceResult(null);
                  setImportFromDeviceId('');
                  setImportDeviceUsers([]);
                  setImportSelectedIds(new Set());
                  setImportDeviceFilter('');
                  setImportStep('config');
                  setShowImportFromDeviceModal(true);
                  // Load device list
                  try {
                    const PERSONS_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                    const response = await fetch(`${PERSONS_API}/api/devices`);
                    const data = await response.json();
                    if (data.success) {
                      setSendToDeviceList(data.devices || []);
                    }
                  } catch (err) {
                    console.error('Error loading devices for import:', err);
                    setSendToDeviceList([]);
                  }
                }}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all flex items-center text-sm"
              >
                <Icon className="w-4 h-4 mr-2" path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                Import from Device
              </button>
              <button
                onClick={handleNewEmployee}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center text-sm"
              >
                <Icon className="w-4 h-4 mr-2" path="M12 4v16m8-8H4" />
                New Employee
              </button>
            </div>
          </div>
        </header>

        <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 160px)' }}>
          {/* Left Column - Person Groups Tree */}
          <div className="w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 160px)' }}>
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Person Groups</h3>
              <button
                onClick={() => setShowAddGroupModal(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium flex items-center"
              >
                <Icon className="w-4 h-4 mr-1" path="M12 4v16m8-8H4" />
                Add Group
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-1">
                {renderGroupTree(null)}
              </div>
            </div>
          </div>

          {/* Right Column - Employee List */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 160px)' }}>
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between gap-6">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center uppercase tracking-wide">
                  {personGroups.find(g => g.id === selectedGroupId)?.name || 'Employees'}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                
                {/* Search Bar */}
                <div className="flex items-center gap-3">
                  <select
                    value={searchType}
                    onChange={(e) => {
                      setSearchType(e.target.value as 'personId' | 'name' | 'group' | 'cardNumber');
                      setSearchText('');
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white text-gray-700"
                  >
                    <option value="personId">Person ID</option>
                    <option value="name">Name</option>
                    <option value="group">Group</option>
                    <option value="cardNumber">Card Number</option>
                  </select>
                  
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Icon className="w-4 h-4 text-gray-400" path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </div>
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder={`Search by ${searchType === 'personId' ? 'Person ID' : searchType === 'name' ? 'Name' : searchType === 'group' ? 'Group' : 'Card Number'}...`}
                      className="w-64 pl-10 pr-10 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                    />
                    {searchText && (
                      <button
                        onClick={() => setSearchText('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        <Icon className="w-4 h-4" path="M6 18L18 6M6 6l12 12" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden flex-1 flex flex-col">
              {currentEmployees.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="p-12 text-center">
                    <Icon className="w-14 h-14 mx-auto text-gray-300 mb-3" path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    <p className="text-gray-500 text-sm">No employees found</p>
                    <button
                      onClick={handleNewEmployee}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Add Employee
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Employee Table */}
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                            <input
                              type="checkbox"
                              checked={selectedEmployees.size === currentEmployees.length && currentEmployees.length > 0}
                              onChange={selectAllEmployees}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Person ID</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Card Number</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {currentEmployees.map((employee) => (
                          <tr key={employee.id} className={`hover:bg-gray-50 transition-colors ${selectedEmployees.has(employee.id) ? 'bg-blue-50' : ''}`}>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedEmployees.has(employee.id)}
                                onChange={() => toggleEmployeeSelection(employee.id)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                  {employee.profilePicture ? (
                                    <img src={getImageUrl(employee.profilePicture)} alt="" className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                    employee.name.charAt(0).toUpperCase()
                                  )}
                                </div>
                                <div className="ml-3">
                                  <p className="text-sm font-medium text-gray-900">{employee.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="text-sm text-gray-600 font-mono">{employee.personId}</span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="text-sm text-gray-500">
                                {personGroups.find(g => g.id === employee.department)?.name || '-'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="text-sm text-gray-600 font-mono">
                                {employee.cardNumbers && employee.cardNumbers.length > 0 ? employee.cardNumbers.join(', ') : '-'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleEditEmployee(employee)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Edit"
                                >
                                  <Icon className="w-4 h-4" path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </button>
                                <button
                                  onClick={() => handleSendToDeviceClick(employee)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Send to Device"
                                >
                                  <Icon className="w-4 h-4" path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(employee.id)}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="Delete"
                                >
                                  <Icon className="w-4 h-4" path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-100 sm:px-6 flex-shrink-0">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-200 text-sm font-medium rounded-md text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-200 text-sm font-medium rounded-md text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <p className="text-sm text-gray-600">
                          {filteredEmployees.length > 0 ? (
                            <>
                              Showing <span className="font-medium text-gray-900">{indexOfFirstRecord + 1}</span> to{' '}
                              <span className="font-medium text-gray-900">{Math.min(indexOfLastRecord, filteredEmployees.length)}</span>{' '}
                              of <span className="font-medium text-gray-900">{filteredEmployees.length}</span> results
                            </>
                          ) : (
                            <span>No results</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">Show:</label>
                          <select
                            value={recordsPerPage}
                            onChange={(e) => handleRecordsPerPageChange(Number(e.target.value))}
                            className="border border-gray-200 rounded-md text-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                          <span className="text-sm text-gray-600">per page</span>
                        </div>
                      </div>
                      {totalPages > 1 && (
                        <div>
                          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                            <button
                              onClick={() => paginate(currentPage - 1)}
                              disabled={currentPage === 1}
                              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-200 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Icon className="w-4 h-4" path="M15 19l-7-7 7-7" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum;
                              if (totalPages <= 5) pageNum = i + 1;
                              else if (currentPage <= 3) pageNum = i + 1;
                              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                              else pageNum = currentPage - 2 + i;

                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => paginate(pageNum)}
                                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                    currentPage === pageNum
                                      ? 'z-10 bg-blue-600 border-blue-600 text-white'
                                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => paginate(currentPage + 1)}
                              disabled={currentPage === totalPages}
                              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-200 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Icon className="w-4 h-4" path="M9 5l7 7-7 7" />
                            </button>
                          </nav>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Import Status Modal */}
      {showImportModal && importStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Import Results</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Icon className="w-5 h-5" path="M6 18L18 6M6 6l12 12" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">Successfully Imported</p>
                    <p className="text-3xl font-bold text-green-700">{importStatus.success}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-600 font-medium">Failed</p>
                    <p className="text-3xl font-bold text-red-700">{importStatus.failed}</p>
                  </div>
                </div>

                {/* Errors */}
                {importStatus.errors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Errors:</h4>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                      {importStatus.errors.map((error, index) => (
                        <div key={index} className="px-4 py-2 border-b border-gray-200 last:border-b-0">
                          <p className="text-sm text-red-600">{error}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import from Device Modal */}
      {showImportFromDeviceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg flex flex-col"
            style={{ width: importStep === 'select' ? 640 : 500, maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Import Persons from Device</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {importStep === 'config' && 'Step 1 — Select device and search'}
                  {importStep === 'select' && `Step 2 — Select persons to import (${importDeviceUsers.length} found)`}
                  {importStep === 'done' && 'Import complete'}
                </p>
              </div>
              <button
                onClick={() => { setShowImportFromDeviceModal(false); setImportFromDeviceResult(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <Icon className="w-5 h-5" path="M6 18L18 6M6 6l12 12" />
              </button>
            </div>

            {/* ── STEP 1: Config ───────────────────────────────── */}
            {importStep === 'config' && (
              <div className="px-6 py-5 space-y-5 overflow-y-auto">
                {/* Device selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Device</label>
                  {sendToDeviceList.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 border border-gray-200 rounded-lg px-3 py-2">
                      <svg className="animate-spin w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading devices…
                    </div>
                  ) : (
                    <>
                      <select
                        value={importFromDeviceId}
                        onChange={e => setImportFromDeviceId(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">— choose a device —</option>
                        {sendToDeviceList.map(d => {
                          const isOnline = d.status === 'Online' || d.status === 'online';
                          return (
                            <option key={d.registrationId} value={d.registrationId} disabled={!isOnline}>
                              {isOnline ? '🟢' : '🔴'} {d.name || d.registrationId} ({d.registrationId}){!isOnline ? ' — Offline' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {sendToDeviceList.length > 0 && sendToDeviceList.filter(d => d.status === 'Online' || d.status === 'online').length === 0 && (
                        <p className="mt-1 text-xs text-red-500">No devices are currently online.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: Select persons ───────────────────────── */}
            {importStep === 'select' && (
              <div className="flex flex-col overflow-hidden flex-1">
                {/* Filter bar */}
                <div className="px-6 pt-4 pb-3 flex-shrink-0 space-y-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Icon className="w-4 h-4 text-gray-400" path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </div>
                    <input
                      type="text"
                      value={importDeviceFilter}
                      onChange={e => setImportDeviceFilter(e.target.value)}
                      placeholder="Search by Person ID or Name…"
                      className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {importDeviceFilter && (
                      <button onClick={() => setImportDeviceFilter('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                        <Icon className="w-4 h-4" path="M6 18L18 6M6 6l12 12" />
                      </button>
                    )}
                  </div>
                  {/* Select all / count */}
                  {(() => {
                    const filtered = importDeviceUsers.filter(u =>
                      !importDeviceFilter ||
                      u.userId.toLowerCase().includes(importDeviceFilter.toLowerCase()) ||
                      u.name.toLowerCase().includes(importDeviceFilter.toLowerCase())
                    );
                    const allFilteredSelected = filtered.length > 0 && filtered.every(u => importSelectedIds.has(u.userId));
                    return (
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={() => {
                              if (allFilteredSelected) {
                                setImportSelectedIds(prev => {
                                  const next = new Set(prev);
                                  filtered.forEach(u => next.delete(u.userId));
                                  return next;
                                });
                              } else {
                                setImportSelectedIds(prev => {
                                  const next = new Set(prev);
                                  filtered.forEach(u => next.add(u.userId));
                                  return next;
                                });
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          Select all ({filtered.length})
                        </label>
                        <span className="text-xs text-indigo-600 font-medium">{importSelectedIds.size} selected</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Person list */}
                <div className="overflow-y-auto flex-1 px-6 pb-4 min-h-0">
                  {importDeviceUsers.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">No persons found on device</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {importDeviceUsers
                        .filter(u =>
                          !importDeviceFilter ||
                          u.userId.toLowerCase().includes(importDeviceFilter.toLowerCase()) ||
                          u.name.toLowerCase().includes(importDeviceFilter.toLowerCase())
                        )
                        .map(u => (
                          <label key={u.userId}
                            className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded px-1 select-none">
                            <input
                              type="checkbox"
                              checked={importSelectedIds.has(u.userId)}
                              onChange={() => {
                                setImportSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(u.userId)) next.delete(u.userId);
                                  else next.add(u.userId);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 flex-shrink-0"
                            />
                            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                              {u.name ? u.name.charAt(0).toUpperCase() : '#'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{u.name || '—'}</p>
                              <p className="text-xs text-gray-400">ID: {u.userId} · {u.userType}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-gray-400">{u.validBegin}</p>
                              <p className="text-xs text-gray-400">→ {u.validEnd}</p>
                            </div>
                          </label>
                        ))}
                    </div>
                  )}
                </div>

                {/* Import options */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0 space-y-3">
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Target Person Group</label>
                      <select
                        value={importTargetGroup}
                        onChange={e => setImportTargetGroup(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Persons (default)</option>
                        {personGroups.filter(g => g.id !== 'all').map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">If already exists locally</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input type="radio" name="importConflict" value="skip"
                            checked={importFromDeviceConflict === 'skip'}
                            onChange={() => setImportFromDeviceConflict('skip')}
                            className="accent-indigo-600" />
                          Skip
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input type="radio" name="importConflict" value="overwrite"
                            checked={importFromDeviceConflict === 'overwrite'}
                            onChange={() => setImportFromDeviceConflict('overwrite')}
                            className="accent-indigo-600" />
                          Overwrite
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Done ─────────────────────────────────── */}
            {importStep === 'done' && importFromDeviceResult && (
              <div className="px-6 py-5 overflow-y-auto">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="font-semibold text-green-800">Import complete!</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-gray-500 text-xs">Total on device</p>
                      <p className="text-xl font-bold text-gray-800">{importFromDeviceResult.totalOnDevice}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-gray-500 text-xs">Selected</p>
                      <p className="text-xl font-bold text-gray-800">{importFromDeviceResult.totalSelected}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-gray-500 text-xs">✅ Imported</p>
                      <p className="text-xl font-bold text-green-700">{importFromDeviceResult.imported}</p>
                    </div>
                    {importFromDeviceResult.updated > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <p className="text-gray-500 text-xs">🔄 Updated</p>
                        <p className="text-xl font-bold text-blue-600">{importFromDeviceResult.updated}</p>
                      </div>
                    )}
                    {importFromDeviceResult.skipped > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <p className="text-gray-500 text-xs">⏭ Skipped</p>
                        <p className="text-xl font-bold text-gray-500">{importFromDeviceResult.skipped}</p>
                      </div>
                    )}
                    {importFromDeviceResult.failed > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-red-100">
                        <p className="text-gray-500 text-xs">❌ Failed</p>
                        <p className="text-xl font-bold text-red-600">{importFromDeviceResult.failed}</p>
                      </div>
                    )}
                  </div>
                  {importFromDeviceResult.errors.length > 0 && (
                    <div className="mt-2 text-red-600 text-xs space-y-0.5 bg-red-50 rounded p-2">
                      {importFromDeviceResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center gap-3 flex-shrink-0">
              <div>
                {importStep === 'select' && (
                  <button
                    onClick={() => { setImportStep('config'); setImportDeviceUsers([]); setImportSelectedIds(new Set()); }}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
                  >
                    ← Back
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowImportFromDeviceModal(false); setImportFromDeviceResult(null); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  {importStep === 'done' ? 'Close' : 'Cancel'}
                </button>

                {importStep === 'config' && (
                  <button
                    onClick={handleSearchDevicePersons}
                    disabled={!importFromDeviceId || importDeviceSearchLoading}
                    className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {importDeviceSearchLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Searching…
                      </>
                    ) : (
                      <>
                        <Icon className="w-4 h-4" path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        Search Persons
                      </>
                    )}
                  </button>
                )}

                {importStep === 'select' && (
                  <button
                    onClick={handleImportFromDevice}
                    disabled={importSelectedIds.size === 0 || importFromDeviceLoading}
                    className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {importFromDeviceLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Importing…
                      </>
                    ) : (
                      <>
                        <Icon className="w-4 h-4" path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        Import {importSelectedIds.size} Person{importSelectedIds.size !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Person Group</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter group name"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                />
              </div>

              <div>
                <TreeDropdown
                  value={newGroupParentId}
                  onChange={setNewGroupParentId}
                  label="Parent Group"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowAddGroupModal(false); setNewGroupName(''); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGroup}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Group Modal */}
      {showMoveToModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Move to Group</h3>
            <p className="text-sm text-gray-600 mb-4">
              Move {selectedEmployees.size} selected employee(s) to:
            </p>

            <div className="space-y-4">
              <div>
                <TreeDropdown
                  value={moveToGroupId}
                  onChange={setMoveToGroupId}
                  label="Select Group"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowMoveToModal(false); setMoveToGroupId('all'); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkMove}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Device Modal */}
      {showSendToDeviceModal && sendToDeviceEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-600" path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Send to Device</h3>
              </div>
              <button
                onClick={handleCloseSendToDeviceModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Icon className="w-5 h-5" path="M6 18L18 6M6 6l12 12" />
              </button>
            </div>

            {/* Person Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {sendToDeviceEmployee.profilePicture ? (
                    <img src={getImageUrl(sendToDeviceEmployee.profilePicture)} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    sendToDeviceEmployee.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{sendToDeviceEmployee.name}</p>
                  <p className="text-xs text-gray-500">Person ID: {sendToDeviceEmployee.personId}</p>
                </div>
              </div>
            </div>

            {/* Device Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Device <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={isSendingToDevice}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Choose a device...</option>
                {sendToDeviceList
                  .filter(d => d.status === 'Online' || d.status === 'online')
                  .map(device => (
                    <option key={device.registrationId || device.deviceId} value={device.registrationId || device.deviceId}>
                      {device.name} ({device.registrationId})
                    </option>
                  ))}
              </select>
              {sendToDeviceList.filter(d => d.status === 'Online' || d.status === 'online').length === 0 && !isSendingToDevice && (
                <p className="text-xs text-orange-600 mt-1.5">⚠ No online devices found</p>
              )}
            </div>

            {/* Status Result */}
            {sendToDeviceStatus && (
              <div className={`mb-4 p-3 rounded-lg border text-sm ${
                sendToDeviceStatus.success
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <p className="font-medium">{sendToDeviceStatus.success ? '✅' : '❌'} {sendToDeviceStatus.message}</p>
                {sendToDeviceStatus.error && (
                  <p className="text-xs mt-1 opacity-80">{sendToDeviceStatus.error}</p>
                )}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCloseSendToDeviceModal}
                disabled={isSendingToDevice}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                {sendToDeviceStatus ? 'Close' : 'Cancel'}
              </button>
              {!sendToDeviceStatus && (
                <button
                  onClick={confirmSendToDevice}
                  disabled={isSendingToDevice || !selectedDeviceId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon className="w-4 h-4" path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  {isSendingToDevice ? 'Sending...' : 'Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-red-600" path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Confirm Delete</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this employee? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteEmployee}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-96 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-red-600" path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Confirm Delete</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Are you sure you want to delete <span className="font-semibold text-gray-800">{selectedEmployees.size} employee(s)</span>? This action cannot be undone.
            </p>
            {selectedEmployees.size <= 5 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-xs text-gray-500 mb-2">Selected employees:</p>
                <ul className="space-y-1">
                  {Array.from(selectedEmployees).map(id => {
                    const emp = employees.find(e => e.id === id);
                    return emp ? (
                      <li key={id} className="text-sm text-gray-700">
                        • {emp.name} (ID: {emp.personId})
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                {editingEmployee ? 'Edit Employee' : 'New Employee'}
              </h3>
              <button
                onClick={() => { setShowModal(false); setEditingEmployee(null); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Icon className="w-5 h-5" path="M6 18L18 6M6 6l12 12" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={(e) => e.preventDefault()}>
                {/* Basic Info */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 uppercase tracking-wide">Basic Info</h4>

                  <div className="flex gap-6">
                    {/* Profile Picture */}
                    <div className="flex-shrink-0">
                      <div className="w-28 h-28 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-300 mb-2">
                        {employeeForm.profilePicture ? (
                          <img src={getImageUrl(employeeForm.profilePicture)} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <Icon className="w-16 h-16 text-gray-400" path="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        )}
                      </div>
                      <label className="block text-center">
                        <input type="file" accept="image/*" onChange={handleProfilePictureUpload} className="hidden" />
                        <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer font-medium">Upload Photo</span>
                      </label>
                    </div>

                    {/* Form Fields */}
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                          Person ID <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={employeeForm.personId}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, personId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                          placeholder="Enter unique ID"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                          Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={employeeForm.name}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                          placeholder="Enter full name"
                        />
                      </div>

                      <div>
                        <TreeDropdown
                          value={employeeForm.department}
                          onChange={(value) => setEmployeeForm({ ...employeeForm, department: value })}
                          label="Department"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Gender</label>
                        <select
                          value={employeeForm.gender}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, gender: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm text-gray-700"
                        >
                          <option value="">Select gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Effective Start Time</label>
                        <input
                          type="datetime-local"
                          value={employeeForm.effectiveStart}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, effectiveStart: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Effective End Time</label>
                        <input
                          type="datetime-local"
                          value={employeeForm.effectiveEnd}
                          onChange={(e) => setEmployeeForm({ ...employeeForm, effectiveEnd: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Authentication Methods */}
                <div>
                  <h4 className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">Authentication Methods</h4>

                  <div className="space-y-6">
                    {/* Face Picture and Fingerprints - Side by Side */}
                    <div className="grid grid-cols-[30%_70%] gap-6">
                      {/* Face Picture */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Face Picture</label>
                        <div className="flex items-center gap-4">
                          {employeeForm.facePicture ? (
                            <div className="relative group">
                              <img src={getImageUrl(employeeForm.facePicture)} alt="Face" className="w-24 h-24 rounded-lg object-cover border-2 border-gray-300" />
                              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                <input type="file" accept="image/*" onChange={handleFacePictureUpload} className="hidden" />
                                <span className="text-white text-xs font-medium">Change</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setEmployeeForm({ ...employeeForm, facePicture: '' })}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-sm"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                              <input type="file" accept="image/*" onChange={handleFacePictureUpload} className="hidden" />
                              <Icon className="w-8 h-8 text-gray-400" path="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <span className="text-xs text-gray-500 mt-1">Upload</span>
                            </label>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Upload one face image for facial recognition. Click image to change.</p>
                      </div>

                      {/* Fingerprints */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-medium text-gray-700">Fingerprints</label>
                          <div className="relative" ref={scannerDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setShowScannerDropdown(!showScannerDropdown)}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title="Select fingerprint scanner"
                            >
                              <Icon className="w-4 h-4" path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </button>

                            {showScannerDropdown && (
                              <div className="absolute z-50 left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
                                <div className="p-2">
                                  <p className="text-xs font-medium text-gray-500 px-2 py-1">Select Scanner</p>
                                  {scannerTypes.map((scanner) => (
                                    <button
                                      key={scanner.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedScannerType(scanner.id);
                                        setShowScannerDropdown(false);
                                      }}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                                        selectedScannerType === scanner.id
                                          ? 'bg-blue-50 text-blue-700'
                                          : 'text-gray-700 hover:bg-gray-50'
                                      }`}
                                    >
                                      <Icon className="w-4 h-4" path={scanner.icon} />
                                      <span>{scanner.name}</span>
                                      {selectedScannerType === scanner.id && (
                                        <Icon className="w-4 h-4 ml-auto text-blue-600" path="M5 13l4 4L19 7" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {employeeForm.fingerprints.map((fingerprint, index) => {
                            // fingerprint may be a string (SVG data-URL from manual capture)
                            // or an object { index, dataBase64, packetLen, packetCount } from device import
                            const isImageUrl = typeof fingerprint === 'string' && fingerprint.startsWith('data:image/svg');
                            const isDeviceTemplate = typeof fingerprint === 'object' && fingerprint !== null;
                            return (
                            <div key={index} className="relative group">
                              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 flex flex-col items-center justify-center overflow-hidden">
                                {isImageUrl ? (
                                  <img src={fingerprint} alt={`Finger ${index + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                  <Icon className="w-8 h-8 text-blue-600" path="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.116 6.807l.054-.09A13.916 13.916 0 0016 11a4 4 0 10-8 0c0 1.017.07 2.019.203 3" />
                                )}
                                <span className="text-xs text-blue-600 mt-1">
                                  {isDeviceTemplate ? `#${fingerprint.index + 1}` : index + 1}
                                </span>
                                {isDeviceTemplate && (
                                  <span className="text-[9px] text-blue-400 leading-tight">device</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFingerprint(index)}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                            );
                          })}

                          {/* Capture Button */}
                          {!isCapturingFingerprint && employeeForm.fingerprints.length < 5 && (
                            <button
                              type="button"
                              onClick={handleSimulatedFingerprintCapture}
                              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                            >
                              <Icon className="w-6 h-6 text-gray-400" path="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.116 6.807l.054-.09A13.916 13.916 0 0016 11a4 4 0 10-8 0c0 1.017.07 2.019.203 3" />
                              <span className="text-xs text-gray-500 mt-1">Add</span>
                            </button>
                          )}

                          {/* Capturing State */}
                          {isCapturingFingerprint && (
                            <div className="w-20 h-20 rounded-lg border-2 border-blue-400 bg-blue-50 flex flex-col items-center justify-center relative">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                              </div>
                              <div className="absolute bottom-1 text-xs font-medium text-blue-600">
                                {fingerprintCaptureProgress}%
                              </div>
                              <button
                                type="button"
                                onClick={stopFingerprintCapture}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-xs"
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Using: {scannerTypes.find(s => s.id === selectedScannerType)?.name}. Max 5 fingers.
                        </p>
                      </div>
                    </div>

                    {/* Cards (dynamic, up to 5) + Password */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-medium text-gray-700">Cards</label>
                        <span className="text-xs text-gray-400">(max 5)</span>
                        <div className="relative ml-auto" ref={cardReaderDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setShowCardReaderDropdown(!showCardReaderDropdown)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Select card reader"
                          >
                            <Icon className="w-4 h-4" path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </button>
                          {showCardReaderDropdown && (
                            <div className="absolute z-50 right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                              <div className="p-2">
                                <p className="text-xs font-medium text-gray-500 px-2 py-1">Select Card Reader</p>
                                {cardReaderTypes.map((reader) => (
                                  <button key={reader.id} type="button"
                                    onClick={() => { setSelectedCardReaderType(reader.id); setShowCardReaderDropdown(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${selectedCardReaderType === reader.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                  >
                                    <Icon className="w-4 h-4" path={reader.icon} />
                                    <span>{reader.name}</span>
                                    {selectedCardReaderType === reader.id && <Icon className="w-4 h-4 ml-auto text-blue-600" path="M5 13l4 4L19 7" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Saved cards */}
                      <div className="space-y-2 mb-2">
                        {employeeForm.cardNumbers.map((card, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-3.5 h-3.5 text-blue-600" path="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </div>
                            <input
                              type="text"
                              value={card}
                              onChange={(e) => {
                                const updated = [...employeeForm.cardNumbers];
                                updated[idx] = e.target.value;
                                setEmployeeForm({ ...employeeForm, cardNumbers: updated });
                              }}
                              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Card number"
                            />
                            <button type="button"
                              onClick={() => setEmployeeForm({ ...employeeForm, cardNumbers: employeeForm.cardNumbers.filter((_, i) => i !== idx) })}
                              className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >×</button>
                          </div>
                        ))}
                      </div>

                      {/* Add card slot */}
                      {employeeForm.cardNumbers.length < 5 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEmployeeForm({ ...employeeForm, cardNumbers: [...employeeForm.cardNumbers, ''] })}
                            className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          >
                            <Icon className="w-4 h-4" path="M12 4v16m8-8H4" />
                            Add Card
                          </button>
                          {selectedCardReaderType !== 'manual' && (
                            <button type="button"
                              className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-md text-sm hover:from-blue-700 hover:to-cyan-700 transition-all"
                            >
                              <Icon className="w-3.5 h-3.5" path="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                              Read Card
                            </button>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-gray-500 mt-2">
                        Using: {cardReaderTypes.find(r => r.id === selectedCardReaderType)?.name}. {employeeForm.cardNumbers.length}/5 cards.
                      </p>
                    </div>

                    {/* Password */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">Door Password</label>
                      <input
                        type="text"
                        value={employeeForm.password}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="Enter door-open PIN"
                        maxLength={64}
                      />
                      <p className="text-xs text-gray-500 mt-1">Used for UserID+password door access.</p>
                    </div>
                  </div>
                </div>

                {/* More Info */}
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 uppercase tracking-wide">More Info</h4>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Title */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Title</label>
                      <select
                        value={employeeForm.title}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm text-gray-700"
                      >
                        <option value="Mr.">Mr.</option>
                        <option value="Ms.">Ms.</option>
                        <option value="Mrs.">Mrs.</option>
                      </select>
                    </div>

                    {/* Nickname */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Nickname</label>
                      <input
                        type="text"
                        value={employeeForm.nickname}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, nickname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        placeholder="Enter nickname"
                      />
                    </div>

                    {/* Date Of Birth */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Date Of Birth</label>
                      <input
                        type="date"
                        value={employeeForm.dateOfBirth}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Phone</label>
                      <input
                        type="tel"
                        value={employeeForm.phone}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          setEmployeeForm({ ...employeeForm, phone: value });
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        placeholder="Enter phone number"
                      />
                    </div>

                    {/* Occupation */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Occupation</label>
                      <input
                        type="text"
                        value={employeeForm.occupation}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, occupation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        placeholder="Enter occupation"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Email</label>
                      <input
                        type="email"
                        value={employeeForm.email}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        placeholder="Enter email address"
                      />
                    </div>

                    {/* Address */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Address</label>
                      <input
                        type="text"
                        value={employeeForm.address}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700"
                        placeholder="Enter address"
                      />
                    </div>

                    {/* Remarks */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Remarks</label>
                      <textarea
                        value={employeeForm.remarks}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, remarks: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-700 resize-none"
                        rows={3}
                        placeholder="Enter remarks"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setEditingEmployee(null); }}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEmployee}
                className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors text-sm"
              >
                {editingEmployee ? 'Update Employee' : 'Save Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
