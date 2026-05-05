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

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Settings...</p>
        </div>
      </div>
    );
  }

  const settingsOptions = [
    {
      title: 'General Settings',
      description: 'Configure company name, language, time zone, date/time format, theme, and data retention policy.',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
      path: '/settings/general',
      color: 'rose'
    },
    {
      title: 'Attendance Configuration',
      description: 'Manage working hours, late policies, attendance periods, and shift schedules for all employees.',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      path: '/settings/attendance',
      color: 'blue'
    },
    {
      title: 'Device Settings',
      description: 'Configure access control devices, network settings, and device capabilities.',
      icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
      path: '/devices',
      color: 'green'
    },
    {
      title: 'User Management',
      description: 'Create, modify, and manage system users, roles, permissions, and access levels.',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      path: '/settings/users',
      color: 'purple'
    },
    {
      title: 'System Settings',
      description: 'Configure system preferences, notifications, backups, and application-wide settings.',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
      path: '/settings/system',
      color: 'orange'
    },
    {
      title: 'API Tester',
      description: 'Test and debug API endpoints, view request/response details, and troubleshoot integrations.',
      icon: 'M8 9l3 3-3 3m5 0h3.586a1 1 0 001-1V5a1 1 0 00-1-1H9a1 1 0 00-1 1v12a1 1 0 001 1z',
      path: '/api-tester',
      color: 'indigo'
    },
    {
      title: 'Database Settings',
      description: 'Configure database connection (SQL Server, MySQL, PostgreSQL, MongoDB) and initialize application tables.',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
      path: '/settings/database',
      color: 'teal'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors: { [key: string]: { bg: string; text: string; icon: string; hover: string } } = {
      blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600', hover: 'hover:bg-blue-100' },
      green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-600', hover: 'hover:bg-green-100' },
      purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600', hover: 'hover:bg-purple-100' },
      orange: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-600', hover: 'hover:bg-orange-100' },
      indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-600', hover: 'hover:bg-indigo-100' },
      teal:   { bg: 'bg-teal-50',   text: 'text-teal-700',   icon: 'text-teal-600',   hover: 'hover:bg-teal-100' },
      rose:   { bg: 'bg-rose-50',   text: 'text-rose-700',   icon: 'text-rose-600',   hover: 'hover:bg-rose-100' },
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar currentPath="/settings" onLogout={logout} />

      {/* Main Content - overflow-visible to allow sidebar dropdown to show */}
      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8 overflow-visible">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2 text-sm lg:text-base">Configure your AccessPro system preferences and manage integrations</p>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible">
          {settingsOptions.map((option, index) => {
            const colorClasses = getColorClasses(option.color);
            return (
              <Link
                key={index}
                href={option.path}
                className="group relative bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all duration-300"
              >
                {/* Colored Top Bar */}
                <div className={`h-1 ${colorClasses.bg}`}></div>

                {/* Content */}
                <div className="p-6">
                  {/* Icon and Title */}
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`p-3 rounded-lg ${colorClasses.bg} ${colorClasses.hover} transition-colors`}>
                      <Icon path={option.icon} className={`w-6 h-6 ${colorClasses.icon}`} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {option.title}
                      </h2>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    {option.description}
                  </p>

                  {/* Arrow Button */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Go to {option.title}</span>
                    <Icon 
                      path="M9 5l7 7-7 7" 
                      className={`w-4 h-4 ${colorClasses.text} group-hover:translate-x-1 transition-transform`} 
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium">
              <Icon path="M12 4v16m8-8H4" className="w-4 h-4 inline mr-2" />
              Backup System Data
            </button>
            <button className="px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium">
              <Icon path="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4 inline mr-2" />
              Export Settings
            </button>
            <button className="px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium">
              <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 inline mr-2" />
              View Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
