'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

type TabType = 'rules' | 'periods' | 'shifts' | 'schedules';
type AttendanceRuleKey = 'overtimeFrom' | 'allowedLate' | 'lateForAbsent' | 'allowedLeave' | 'leaveForAbsent' | 'minOvertime' | 'maxOvertime';

// PeriodDetailsModal Component
function PeriodDetailsModal({
  show,
  isEditing,
  attendanceMode,
  setAttendanceMode,
  generalTab,
  setGeneralTab,
  periodName,
  setPeriodName,
  attendanceRules,
  toggleAttendanceRule,
  overtimeEnabled,
  setOvertimeEnabled,
  handleSavePeriod,
  onClose,
}: {
  show: boolean;
  isEditing: boolean;
  attendanceMode: 'fixed' | 'flexible';
  setAttendanceMode: (mode: 'fixed' | 'flexible') => void;
  generalTab: 'general' | 'break';
  setGeneralTab: (tab: 'general' | 'break') => void;
  periodName: string;
  setPeriodName: (name: string) => void;
  attendanceRules: Record<AttendanceRuleKey, boolean>;
  toggleAttendanceRule: (key: AttendanceRuleKey) => void;
  overtimeEnabled: boolean;
  setOvertimeEnabled: (enabled: boolean) => void;
  handleSavePeriod: () => void;
  onClose: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95%] max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Period' : 'Add Period'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
          {/* Attendance Mode Tabs */}
          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setAttendanceMode('fixed')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  attendanceMode === 'fixed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Fixed Attendance
              </button>
              <button
                onClick={() => setAttendanceMode('flexible')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  attendanceMode === 'flexible'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Flexible Attendance
              </button>
            </div>
          </div>

          {/* General / Break Tabs */}
          {attendanceMode === 'fixed' && (
            <div className="px-4 pt-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setGeneralTab('general')}
                  className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors ${
                    generalTab === 'general'
                      ? 'bg-white text-blue-600 border border-gray-200 border-b-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  General
                </button>
                <button
                  onClick={() => setGeneralTab('break')}
                  className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors ${
                    generalTab === 'break'
                      ? 'bg-white text-blue-600 border border-gray-200 border-b-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Break
                </button>
              </div>
            </div>
          )}

          {/* General Tab Content */}
          {attendanceMode === 'fixed' && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Basic Info</h4>

              <div className="space-y-4">
                {/* Period Name & Color */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">
                      Period Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={periodName}
                      onChange={(e) => setPeriodName(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Attendance Period */}
                <div>
                  <label className="text-sm text-gray-700 block mb-2">Attendance Period:</label>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm text-gray-600">Working Time:</span>
                    <input
                      type="time"
                      defaultValue="10:00"
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-28 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="time"
                      defaultValue="19:00"
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-28 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Required Work Time */}
                <div className="flex items-center gap-2 ml-4">
                  <label className="text-sm text-gray-700">Required Work Time:</label>
                  <input
                    type="number"
                    defaultValue="540"
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-24 bg-gray-100"
                    readOnly
                  />
                  <span className="text-sm text-gray-600">minutes</span>
                </div>

                {/* Attendance Rule Section */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Attendance Rule:</h4>
                  <div className="ml-4 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attendanceRules.overtimeFrom}
                        onChange={() => toggleAttendanceRule('overtimeFrom')}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Overtime work is calculated from</span>
                      <input
                        type="number"
                        defaultValue="58"
                        step="0.01"
                        disabled={!attendanceRules.overtimeFrom}
                        className={`px-2 py-1 border border-gray-300 rounded-md text-sm w-20 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          !attendanceRules.overtimeFrom ? 'bg-gray-100 text-gray-400' : ''
                        }`}
                      />
                      <span className="text-sm text-gray-600">minutes after the end of work.</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Flexible Attendance Tab Content */}
          {attendanceMode === 'flexible' && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-4">Basic Info</h4>

              <div className="space-y-4">
                {/* Period Name */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">
                    Period Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Required Work Time */}
                <div className="flex items-center justify-center gap-2">
                  <label className="text-sm text-gray-700">Required Work Time:</label>
                  <input
                    type="number"
                    defaultValue="480"
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm w-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-600">minutes</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleSavePeriod}
            className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="ml-3 px-6 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceConfigPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('rules');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(1);
  const [attendanceMode, setAttendanceMode] = useState<'fixed' | 'flexible'>('fixed');
  const [generalTab, setGeneralTab] = useState<'general' | 'break'>('general');
  const [periodName, setPeriodName] = useState('General');
  const [overtimeEnabled, setOvertimeEnabled] = useState(true);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [attendancePeriods, setAttendancePeriods] = useState([
    {
      id: 1,
      name: 'Morning Shift',
      startTime: '09:00',
      endTime: '18:00',
      workingHours: 8,
      status: 'ACTIVE',
    },
    {
      id: 2,
      name: 'Evening Shift',
      startTime: '14:00',
      endTime: '22:00',
      workingHours: 7.5,
      status: 'ACTIVE',
    },
    {
      id: 3,
      name: 'Night Shift',
      startTime: '22:00',
      endTime: '06:00',
      workingHours: 8,
      status: 'INACTIVE',
    },
  ]);
  const [attendanceRules, setAttendanceRules] = useState({
    overtimeFrom: true,
    allowedLate: true,
    lateForAbsent: true,
    allowedLeave: true,
    leaveForAbsent: true,
    minOvertime: true,
    maxOvertime: true,
  });

  const handleSaveRules = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleSavePeriod = () => {
    setShowPeriodModal(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const toggleAttendanceRule = (key: keyof typeof attendanceRules) => {
    setAttendanceRules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeletePeriod = (id: number) => {
    setAttendancePeriods(prev => prev.filter(p => p.id !== id));
    if (selectedPeriod === id) {
      setSelectedPeriod(null);
    }
  };

  const handleEditPeriod = (id: number) => {
    setSelectedPeriod(id);
    setIsEditing(true);
    setShowPeriodModal(true);
    const period = attendancePeriods.find(p => p.id === id);
    if (period) {
      setPeriodName(period.name);
    }
  };

  const handleAddPeriod = () => {
    setIsEditing(false);
    setShowPeriodModal(true);
    setPeriodName('');
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, router]);

  const tabs = [
    { id: 'rules' as TabType, label: 'Attendance Rules', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'periods' as TabType, label: 'Attendance Periods', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'shifts' as TabType, label: 'Attendance Shifts', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'schedules' as TabType, label: 'Shift Schedules', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Attendance Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/settings/attendance" onLogout={logout} />

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <Icon path="M9 5l7 7-7 7" className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Attendance Configuration</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Attendance Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage attendance rules, periods, shifts, and schedules</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon path={tab.icon} className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Attendance Rules Tab */}
            {activeTab === 'rules' && (
              <div>
                {/* Calculation Rule Section */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200">Calculation Rule</h3>
                  
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Attendance Calculation Accuracy Config</h4>
                    <p className="text-sm text-gray-500 mb-4">Minimum attendance unit is 1 minute.</p>

                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="roundingRule"
                          defaultChecked
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">Round Down</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Swiping the card at 9:00:01 will be recorded as 9:01:00.
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="roundingRule"
                          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">Round Up</span>
                          <p className="text-xs text-gray-500 mt-1">
                            Swiping the card at 9:00:01 will be recorded as 9:00:00.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Must Check In/Out for Leave</span>
                    </label>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveRules}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Attendance Periods Tab */}
            {activeTab === 'periods' && (
              <div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <button 
                      onClick={handleAddPeriod}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <Icon path="M12 4v16m8-8H4" className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Period Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Start Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">End Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Working Hours</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {attendancePeriods.map((period) => (
                          <tr
                            key={period.id}
                            className={`${selectedPeriod === period.id ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
                          >
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-900">{period.name}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.startTime}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.endTime}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{period.workingHours}h</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                period.status === 'ACTIVE' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {period.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditPeriod(period.id)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                                  title="Edit"
                                >
                                  <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePeriod(period.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors p-1"
                                  title="Delete"
                                >
                                  <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <PeriodDetailsModal
                  show={showPeriodModal}
                  isEditing={isEditing}
                  attendanceMode={attendanceMode}
                  setAttendanceMode={setAttendanceMode}
                  generalTab={generalTab}
                  setGeneralTab={setGeneralTab}
                  periodName={periodName}
                  setPeriodName={setPeriodName}
                  attendanceRules={attendanceRules}
                  toggleAttendanceRule={toggleAttendanceRule}
                  overtimeEnabled={overtimeEnabled}
                  setOvertimeEnabled={setOvertimeEnabled}
                  handleSavePeriod={handleSavePeriod}
                  onClose={() => setShowPeriodModal(false)}
                />
              </div>
            )}

            {/* Attendance Shifts Tab */}
            {activeTab === 'shifts' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Attendance Shifts</h2>
                    <p className="text-sm text-gray-500 mt-1">Create and manage shift definitions with specific working hours</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                    Add Shift
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Morning Shift</h3>
                        <p className="text-xs text-gray-500 mt-1">Standard day shift</p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Start Time</span>
                        <span className="font-medium text-gray-900">09:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">End Time</span>
                        <span className="font-medium text-gray-900">18:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Break</span>
                        <span className="font-medium text-gray-900">1 hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Working Hours</span>
                        <span className="font-medium text-gray-900">8 hours</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Evening Shift</h3>
                        <p className="text-xs text-gray-500 mt-1">Extended evening coverage</p>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Inactive</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Start Time</span>
                        <span className="font-medium text-gray-900">14:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">End Time</span>
                        <span className="font-medium text-gray-900">23:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Break</span>
                        <span className="font-medium text-gray-900">1 hour</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Working Hours</span>
                        <span className="font-medium text-gray-900">8 hours</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shift Schedules Tab */}
            {activeTab === 'schedules' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Shift Schedules</h2>
                    <p className="text-sm text-gray-500 mt-1">Assign shifts to employees or departments on a weekly/monthly basis</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                    Create Schedule
                  </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Weekly Schedule - April 2026</h3>
                  </div>
                  <p className="p-6 text-gray-500 text-center">Schedule information will be displayed here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
