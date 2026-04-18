'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const Icon = ({ path, className = "w-5 h-5" }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

interface SidebarProps {
  currentPath: string;
  onLogout: () => void;
}

export default function Sidebar({ currentPath, onLogout }: SidebarProps) {
  const router = useRouter();

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Access Records', path: '/access-records', icon: 'M9 12l2 2 4-4m7-10a9 9 0 11-18 0 9 9 0 0118 0z' },
    { name: 'Employees', path: '/employees', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { name: 'Access Control', path: '/access-control', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { name: 'Attendance', path: '/attendance', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { name: 'Devices', path: '/devices', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ];

  const settingsItems = [
    { name: 'Attendance Configuration', path: '/settings/attendance', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Device Settings', path: '/devices', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { name: 'User Management', path: '/settings/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { name: 'System Settings', path: '/settings/system', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  const handleLogout = () => {
    onLogout();
    router.push('/login');
  };

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Logo */}
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

      {/* Navigation */}
      <nav className="px-4 pb-32 overflow-visible">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              currentPath === item.path
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Icon path={item.icon} className="w-5 h-5" />
            <span className="font-medium">{item.name}</span>
          </Link>
        ))}

        {/* Settings Button */}
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors group relative ${
            currentPath === '/settings' || currentPath.startsWith('/settings/')
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <Icon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" className="w-5 h-5" />
          <span className="font-medium flex-1">Settings</span>
          <Icon path="M9 5l7 7-7 7" className="w-4 h-4" />

          {/* Hover Dropdown Menu - Shows to RIGHT */}
          <div className="hidden group-hover:block absolute left-full top-0 ml-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            {settingsItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <Icon path={item.icon} className="w-4 h-4" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            ))}
          </div>
        </Link>
      </nav>

      {/* Logout Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-5 h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
