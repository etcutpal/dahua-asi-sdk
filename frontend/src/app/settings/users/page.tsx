'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

const Icon = ({ path, className = 'w-5 h-5' }: { path: string; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

// --- Types --------------------------------------------------------------------

type UserStatus = 'active' | 'locked' | 'inactive';

interface SystemUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  status: UserStatus;
  isDefault: boolean;
  lastLogin: string | null;
  createdAt: string;
  mustChangePassword: boolean;
}

type PermissionKey = string;

interface Role {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  permissions: PermissionKey[];
  userCount?: number;
}

// --- Permission definitions ---------------------------------------------------

interface PermissionGroup {
  group: string;
  icon: string;
  items: { key: PermissionKey; label: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    items: [
      { key: 'dashboard:view', label: 'View Dashboard' },
    ],
  },
  {
    group: 'Employees',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    items: [
      { key: 'employees:view',   label: 'View Employees' },
      { key: 'employees:add',    label: 'Add Employee' },
      { key: 'employees:edit',   label: 'Edit Employee' },
      { key: 'employees:delete', label: 'Delete Employee' },
      { key: 'employees:export', label: 'Export Employees' },
    ],
  },
  {
    group: 'Access Records',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    items: [
      { key: 'access_records:view',   label: 'View Access Records' },
      { key: 'access_records:export', label: 'Export Records' },
      { key: 'access_records:delete', label: 'Delete Records' },
    ],
  },
  {
    group: 'Attendance',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    items: [
      { key: 'attendance:view',      label: 'View Attendance' },
      { key: 'attendance:configure', label: 'Configure Attendance' },
      { key: 'attendance:reports',   label: 'Attendance Reports' },
      { key: 'attendance:export',    label: 'Export Attendance' },
    ],
  },
  {
    group: 'Devices',
    icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
    items: [
      { key: 'devices:view',    label: 'View Devices' },
      { key: 'devices:add',     label: 'Add Device' },
      { key: 'devices:edit',    label: 'Edit Device' },
      { key: 'devices:delete',  label: 'Delete Device' },
      { key: 'devices:control', label: 'Remote Control (Open Door)' },
    ],
  },
  {
    group: 'Access Control',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    items: [
      { key: 'access_control:view',      label: 'View Access Rules' },
      { key: 'access_control:configure', label: 'Configure Access Rules' },
    ],
  },
  {
    group: 'Settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    items: [
      { key: 'settings:general',    label: 'General Settings' },
      { key: 'settings:system',     label: 'System Settings' },
      { key: 'settings:database',   label: 'Database Settings' },
      { key: 'settings:attendance', label: 'Attendance Configuration' },
      { key: 'settings:users',      label: 'User Management' },
      { key: 'settings:api_tester', label: 'API Tester' },
    ],
  },
];

const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

// --- Seed data ----------------------------------------------------------------

const SEED_ROLES: Role[] = [
  {
    id: 'role_admin',
    name: 'Administrator',
    description: 'Full access to all features and settings.',
    isDefault: true,
    permissions: ALL_PERMISSIONS,
    userCount: 1,
  },
  {
    id: 'role_manager',
    name: 'Manager',
    description: 'Full access except System Settings and Database Settings. Cannot edit or delete Administrator accounts.',
    isDefault: false,
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== 'settings:system' && p !== 'settings:database'
    ),
    userCount: 0,
  },
  {
    id: 'role_operator',
    name: 'Operator',
    description: 'Day-to-day operations: attendance and access records.',
    isDefault: false,
    permissions: [
      'dashboard:view',
      'employees:view',
      'attendance:view', 'attendance:reports',
      'access_records:view',
      'devices:view',
      'devices:control',
    ],
    userCount: 0,
  },
  {
    id: 'role_viewer',
    name: 'Viewer',
    description: 'Read-only access to dashboard and reports.',
    isDefault: false,
    permissions: [
      'dashboard:view',
      'employees:view',
      'attendance:view',
      'access_records:view',
    ],
    userCount: 0,
  },
];

const SEED_USERS: SystemUser[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    fullName: 'System Administrator',
    email: 'admin@localhost',
    roleId: 'role_admin',
    status: 'active',
    isDefault: true,
    lastLogin: new Date().toISOString(),
    createdAt: '2024-01-01',
    mustChangePassword: false,
  },
];

// --- Helpers ------------------------------------------------------------------

const statusConfig: Record<UserStatus, { label: string; classes: string; dot: string }> = {
  active:   { label: 'Active',   classes: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  locked:   { label: 'Locked',   classes: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  inactive: { label: 'Inactive', classes: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
};

const avatarColors = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-green-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-red-500 to-rose-500',
  'from-indigo-500 to-blue-500',
];

const getAvatarColor = (name: string) =>
  avatarColors[name.charCodeAt(0) % avatarColors.length];

const formatDate = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// --- Page Component -----------------------------------------------------------

export default function UserManagementPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<'users' | 'roles'>('users');

  const [users, setUsers] = useState<SystemUser[]>(SEED_USERS);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  const [roles, setRoles] = useState<Role[]>(SEED_ROLES);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('role_admin');

  const [userModal, setUserModal] = useState<'closed' | 'add' | 'edit' | 'resetpw' | 'delete'>('closed');
  const [roleModal, setRoleModal] = useState<'closed' | 'add' | 'edit' | 'delete'>('closed');
  const [targetUser, setTargetUser] = useState<SystemUser | null>(null);
  const [targetRole, setTargetRole] = useState<Role | null>(null);

  const blankUserForm = { username: '', fullName: '', email: '', roleId: 'role_admin', password: '', confirmPassword: '', mustChangePassword: true };
  const [userForm, setUserForm] = useState(blankUserForm);
  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });
  const [formError, setFormError] = useState('');

  const blankRoleForm = { name: '', description: '' };
  const [roleForm, setRoleForm] = useState(blankRoleForm);

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showAlert = (type: 'success' | 'error', msg: string) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    setIsLoading(false);
  }, [isAuthenticated, router]);

  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));
  const selectedRole = roleMap[selectedRoleId] ?? roles[0];

  const rolesWithCount = roles.map((r) => ({
    ...r,
    userCount: users.filter((u) => u.roleId === r.id).length,
  }));

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    const matchQ = !q || u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = userRoleFilter === 'all' || u.roleId === userRoleFilter;
    return matchQ && matchR;
  });

  const stats = {
    total:  users.length,
    active: users.filter((u) => u.status === 'active').length,
    locked: users.filter((u) => u.status === 'locked').length,
    admins: users.filter((u) => u.roleId === 'role_admin').length,
  };

  // -- User actions ------------------------------------------------------------

  const openAddUser = () => {
    setUserForm(blankUserForm);
    setFormError('');
    setTargetUser(null);
    setUserModal('add');
  };

  const openEditUser = (u: SystemUser) => {
    setTargetUser(u);
    setUserForm({ ...blankUserForm, username: u.username, fullName: u.fullName, email: u.email, roleId: u.roleId, password: '', confirmPassword: '', mustChangePassword: u.mustChangePassword });
    setFormError('');
    setUserModal('edit');
  };

  const openResetPw = (u: SystemUser) => {
    setTargetUser(u);
    setPwForm({ newPassword: '', confirmPassword: '' });
    setFormError('');
    setUserModal('resetpw');
  };

  const openDeleteUser = (u: SystemUser) => { setTargetUser(u); setUserModal('delete'); };

  const toggleLock = (id: string) => {
    const u = users.find((x) => x.id === id)!;
    setUsers((prev) => prev.map((x) => x.id !== id ? x : { ...x, status: x.status === 'locked' ? 'active' : 'locked' }));
    showAlert('success', `${u.fullName} has been ${u.status === 'locked' ? 'unlocked' : 'locked'}.`);
  };

  const saveUser = () => {
    setFormError('');
    if (!userForm.username.trim()) return setFormError('Username is required.');
    if (!userForm.fullName.trim()) return setFormError('Full name is required.');
    if (userModal === 'add') {
      if (!userForm.password) return setFormError('Password is required.');
      if (userForm.password !== userForm.confirmPassword) return setFormError('Passwords do not match.');
      if (users.some((u) => u.username.toLowerCase() === userForm.username.toLowerCase()))
        return setFormError('Username already exists.');
    }
    if (userModal === 'add') {
      const newUser: SystemUser = {
        id: `usr_${Date.now()}`,
        username: userForm.username.trim(),
        fullName: userForm.fullName.trim(),
        email: userForm.email.trim(),
        roleId: userForm.roleId,
        status: 'active',
        isDefault: false,
        lastLogin: null,
        createdAt: new Date().toISOString().split('T')[0],
        mustChangePassword: userForm.mustChangePassword,
      };
      setUsers((p) => [...p, newUser]);
      showAlert('success', `User "${newUser.username}" created successfully.`);
    } else {
      setUsers((p) => p.map((u) => u.id !== targetUser!.id ? u : { ...u, fullName: userForm.fullName.trim(), email: userForm.email.trim(), roleId: userForm.roleId, mustChangePassword: userForm.mustChangePassword }));
      showAlert('success', 'User updated successfully.');
    }
    setUserModal('closed');
  };

  const saveResetPw = () => {
    setFormError('');
    if (!pwForm.newPassword) return setFormError('Password is required.');
    if (pwForm.newPassword.length < 6) return setFormError('Password must be at least 6 characters.');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setFormError('Passwords do not match.');
    showAlert('success', `Password reset for "${targetUser!.username}".`);
    setUserModal('closed');
  };

  const confirmDelete = () => {
    setUsers((p) => p.filter((u) => u.id !== targetUser!.id));
    showAlert('success', `User "${targetUser!.username}" deleted.`);
    setUserModal('closed');
  };

  // -- Role actions ------------------------------------------------------------

  const openAddRole = () => { setRoleForm(blankRoleForm); setFormError(''); setTargetRole(null); setRoleModal('add'); };
  const openEditRole = (r: Role) => { setTargetRole(r); setRoleForm({ name: r.name, description: r.description }); setFormError(''); setRoleModal('edit'); };
  const openDeleteRole = (r: Role) => { setTargetRole(r); setRoleModal('delete'); };

  const saveRole = () => {
    setFormError('');
    if (!roleForm.name.trim()) return setFormError('Role name is required.');
    if (roleModal === 'add') {
      if (roles.some((r) => r.name.toLowerCase() === roleForm.name.toLowerCase())) return setFormError('Role name already exists.');
      const newRole: Role = {
        id: `role_${Date.now()}`,
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        isDefault: false,
        permissions: [],
        userCount: 0,
      };
      setRoles((p) => [...p, newRole]);
      setSelectedRoleId(newRole.id);
      showAlert('success', `Role "${newRole.name}" created.`);
    } else {
      setRoles((p) => p.map((r) => r.id !== targetRole!.id ? r : { ...r, name: roleForm.name.trim(), description: roleForm.description.trim() }));
      showAlert('success', 'Role updated.');
    }
    setRoleModal('closed');
  };

  const confirmDeleteRole = () => {
    setRoles((p) => p.filter((r) => r.id !== targetRole!.id));
    if (selectedRoleId === targetRole!.id) setSelectedRoleId(roles[0].id);
    showAlert('success', `Role "${targetRole!.name}" deleted.`);
    setRoleModal('closed');
  };

  const togglePermission = (key: PermissionKey) => {
    setRoles((prev) => prev.map((r) => {
      if (r.id !== selectedRoleId) return r;
      const has = r.permissions.includes(key);
      return { ...r, permissions: has ? r.permissions.filter((p) => p !== key) : [...r.permissions, key] };
    }));
  };

  const toggleGroup = (group: PermissionGroup) => {
    const keys = group.items.map((i) => i.key);
    const allOn = keys.every((k) => selectedRole.permissions.includes(k));
    setRoles((prev) => prev.map((r) => {
      if (r.id !== selectedRoleId) return r;
      return {
        ...r,
        permissions: allOn
          ? r.permissions.filter((p) => !keys.includes(p))
          : [...new Set([...r.permissions, ...keys])],
      };
    }));
  };

  const selectAllPermissions = () => {
    setRoles((prev) => prev.map((r) => r.id !== selectedRoleId ? r : { ...r, permissions: ALL_PERMISSIONS }));
  };

  const clearAllPermissions = () => {
    setRoles((prev) => prev.map((r) => r.id !== selectedRoleId ? r : { ...r, permissions: [] }));
  };

  // -- Styles ------------------------------------------------------------------
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';
  const sec = 'bg-white rounded-lg shadow-sm border border-gray-200 dark:border-gray-700';

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Loading User Management...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <Sidebar currentPath="/settings/users" onLogout={logout} />

      <div className="lg:ml-64 p-4 lg:p-8 pt-16 lg:pt-8">

        {/* Alert */}
        {alert && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 border ${alert.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <Icon path={alert.type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}
              className={`w-5 h-5 flex-shrink-0 ${alert.type === 'success' ? 'text-green-600' : 'text-red-600'}`} />
            <span className={`text-sm ${alert.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{alert.msg}</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
            <span>›</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">User Management</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">User Management</h1>
              <p className="text-gray-600 mt-1 text-sm lg:text-base">Manage system users, roles, and access permissions</p>
            </div>
            {tab === 'users' && (
              <button onClick={openAddUser} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium">
                <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                Add User
              </button>
            )}
            {tab === 'roles' && (
              <button onClick={openAddRole} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium">
                <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                New Role
              </button>
            )}
          </div>
        </div>

        {/* Stats (users tab) */}
        {tab === 'users' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Users',    value: stats.total,  color: 'blue',   icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
              { label: 'Active',         value: stats.active, color: 'green',  icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
              { label: 'Locked',         value: stats.locked, color: 'red',    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
              { label: 'Administrators', value: stats.admins, color: 'purple', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${s.color}-50`}>
                  <Icon path={s.icon} className={`w-5 h-5 text-${s.color}-600`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {([
            { key: 'users', label: 'System Users',         icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            { key: 'roles', label: 'Roles & Permissions',  icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon path={icon} className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ------- USERS TAB ------- */}
        {tab === 'users' && (
          <div className={sec}>
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, username or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Roles</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Last Login</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No users match your search.</td></tr>
                  )}
                  {filteredUsers.map((user) => {
                    const role = roleMap[user.roleId];
                    const sc = statusConfig[user.status];
                    return (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(user.username)} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{user.fullName}</span>
                                {user.isDefault && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Default</span>}
                                {user.mustChangePassword && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Change PW</span>}
                              </div>
                              <span className="text-xs text-gray-400">@{user.username}&nbsp;·&nbsp;{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            <Icon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" className="w-3 h-3" />
                            {role?.name ?? 'Unknown'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.classes}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-xs text-gray-500">{formatDate(user.lastLogin)}</span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-xs text-gray-500">{user.createdAt}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditUser(user)} title="Edit user"
                              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                              <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => openResetPw(user)} title="Reset password"
                              className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors">
                              <Icon path="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggleLock(user.id)} title={user.status === 'locked' ? 'Unlock user' : 'Lock user'}
                              disabled={user.isDefault}
                              className={`p-1.5 rounded transition-colors ${user.isDefault ? 'opacity-30 cursor-not-allowed' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}>
                              <Icon path={user.status === 'locked'
                                ? 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z'
                                : 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'}
                                className="w-4 h-4" />
                            </button>
                            <button onClick={() => openDeleteUser(user)} title="Delete user"
                              disabled={user.isDefault}
                              className={`p-1.5 rounded transition-colors ${user.isDefault ? 'opacity-30 cursor-not-allowed' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}>
                              <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
              <p className="text-xs text-gray-400">
                Showing {filteredUsers.length} of {users.length} users
                {' · '}Default user <code className="font-mono">admin</code> cannot be deleted.
              </p>
            </div>
          </div>
        )}

        {/* ------- ROLES TAB ------- */}
        {tab === 'roles' && (
          <div className="flex gap-5 flex-col lg:flex-row">

            {/* Role list */}
            <div className={`${sec} lg:w-72 flex-shrink-0 h-fit`}>
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Roles</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {rolesWithCount.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`w-full text-left px-4 py-3.5 transition-colors flex items-start justify-between gap-2 ${
                        selectedRoleId === r.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${selectedRoleId === r.id ? 'text-blue-700' : 'text-gray-900'}`}>{r.name}</span>
                          {r.isDefault && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Default</span>}
                        </div>
                        <span className="text-xs text-gray-400 mt-0.5 block truncate">{r.userCount} user{r.userCount !== 1 ? 's' : ''}</span>
                      </div>
                      {selectedRoleId === r.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-3 border-t border-gray-100">
                <button onClick={openAddRole} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors font-medium">
                  <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
                  New Role
                </button>
              </div>
            </div>

            {/* Permission matrix */}
            {selectedRole && (
              <div className={`${sec} flex-1`}>
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">{selectedRole.name}</h2>
                      {selectedRole.isDefault && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Default</span>}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{selectedRole.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={selectAllPermissions} disabled={selectedRole.isDefault}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Select All
                    </button>
                    <button onClick={clearAllPermissions} disabled={selectedRole.isDefault}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Clear All
                    </button>
                    <button onClick={() => openEditRole(selectedRole)} disabled={selectedRole.isDefault}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                      <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3 h-3" />
                      Rename
                    </button>
                    <button onClick={() => openDeleteRole(selectedRole)}
                      disabled={selectedRole.isDefault || (selectedRole.userCount ?? 0) > 0}
                      title={selectedRole.isDefault ? 'Default role cannot be deleted' : (selectedRole.userCount ?? 0) > 0 ? 'Remove all users first' : 'Delete role'}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                      <Icon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>

                {selectedRole.isDefault && (
                  <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 flex items-center gap-2">
                    <Icon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-4 h-4 flex-shrink-0" />
                    The Administrator role always has full access. Permissions cannot be modified.
                  </div>
                )}

                <div className="p-6 space-y-5">
                  {PERMISSION_GROUPS.map((group) => {
                    const keys = group.items.map((i) => i.key);
                    const allOn = keys.every((k) => selectedRole.permissions.includes(k));
                    const someOn = keys.some((k) => selectedRole.permissions.includes(k));
                    return (
                      <div key={group.group} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 dark:border-gray-700">
                          <Icon path={group.icon} className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-semibold text-gray-700 flex-1">{group.group}</span>
                          <label className={`flex items-center gap-1.5 text-xs text-gray-500 ${selectedRole.isDefault ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={allOn}
                              ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                              disabled={selectedRole.isDefault}
                              onChange={() => toggleGroup(group)}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                            />
                            All
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                          {group.items.map((item) => {
                            const checked = selectedRole.permissions.includes(item.key);
                            return (
                              <label
                                key={item.key}
                                className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                                  selectedRole.isDefault ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={selectedRole.isDefault}
                                  onChange={() => togglePermission(item.key)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className={checked ? 'text-gray-800' : 'text-gray-400'}>{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!selectedRole.isDefault && (
                  <div className="px-6 pb-6 flex justify-end">
                    <button
                      onClick={() => showAlert('success', `Permissions saved for "${selectedRole.name}".`)}
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
                    >
                      <Icon path="M5 13l4 4L19 7" className="w-4 h-4" />
                      Save Permissions
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------- ADD / EDIT USER MODAL ------- */}
      {(userModal === 'add' || userModal === 'edit') && (
        <Modal title={userModal === 'add' ? 'Add New User' : 'Edit User'} onClose={() => setUserModal('closed')}>
          <div className="p-6 space-y-4">
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Username <span className="text-red-500">*</span></label>
                <input type="text" className={inp} value={userForm.username}
                  disabled={userModal === 'edit'}
                  onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="e.g. jdoe" />
                {userModal === 'edit' && <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>}
              </div>
              <div>
                <label className={lbl}>Full Name <span className="text-red-500">*</span></label>
                <input type="text" className={inp} value={userForm.fullName}
                  onChange={(e) => setUserForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="e.g. John Doe" />
              </div>
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input type="email" className={inp} value={userForm.email}
                onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com" />
            </div>
            <div>
              <label className={lbl}>Role <span className="text-red-500">*</span></label>
              <select className={inp} value={userForm.roleId}
                onChange={(e) => setUserForm((f) => ({ ...f, roleId: e.target.value }))}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {userModal === 'add' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Password <span className="text-red-500">*</span></label>
                  <input type="password" className={inp} value={userForm.password}
                    onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters" />
                </div>
                <div>
                  <label className={lbl}>Confirm Password <span className="text-red-500">*</span></label>
                  <input type="password" className={inp} value={userForm.confirmPassword}
                    onChange={(e) => setUserForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Repeat password" />
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={userForm.mustChangePassword}
                onChange={(e) => setUserForm((f) => ({ ...f, mustChangePassword: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded" />
              <span className="text-sm text-gray-700">Require password change on first login</span>
            </label>
          </div>
          <ModalFooter onCancel={() => setUserModal('closed')} onConfirm={saveUser} confirmLabel={userModal === 'add' ? 'Create User' : 'Save Changes'} />
        </Modal>
      )}

      {/* ------- RESET PASSWORD MODAL ------- */}
      {userModal === 'resetpw' && targetUser && (
        <Modal title="Reset Password" onClose={() => setUserModal('closed')}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Reset password for <strong>{targetUser.fullName}</strong> (<code className="font-mono text-xs">@{targetUser.username}</code>)
            </p>
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
            <div>
              <label className={lbl}>New Password <span className="text-red-500">*</span></label>
              <input type="password" className={inp} value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Min. 6 characters" />
            </div>
            <div>
              <label className={lbl}>Confirm New Password <span className="text-red-500">*</span></label>
              <input type="password" className={inp} value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Repeat password" />
            </div>
          </div>
          <ModalFooter onCancel={() => setUserModal('closed')} onConfirm={saveResetPw} confirmLabel="Reset Password" confirmClass="bg-amber-600 hover:bg-amber-700" />
        </Modal>
      )}

      {/* ------- DELETE USER MODAL ------- */}
      {userModal === 'delete' && targetUser && (
        <Modal title="Delete User" onClose={() => setUserModal('closed')}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Icon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Delete &ldquo;{targetUser.fullName}&rdquo;?</p>
                <p className="text-sm text-gray-500 mt-1">This will permanently remove user <code className="font-mono text-xs">@{targetUser.username}</code>. This action cannot be undone.</p>
              </div>
            </div>
          </div>
          <ModalFooter onCancel={() => setUserModal('closed')} onConfirm={confirmDelete} confirmLabel="Delete User" confirmClass="bg-red-600 hover:bg-red-700" />
        </Modal>
      )}

      {/* ------- ADD / EDIT ROLE MODAL ------- */}
      {(roleModal === 'add' || roleModal === 'edit') && (
        <Modal title={roleModal === 'add' ? 'New Role' : 'Edit Role'} onClose={() => setRoleModal('closed')}>
          <div className="p-6 space-y-4">
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
            <div>
              <label className={lbl}>Role Name <span className="text-red-500">*</span></label>
              <input type="text" className={inp} value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Supervisor" />
            </div>
            <div>
              <label className={lbl}>Description</label>
              <textarea rows={3} className={`${inp} resize-none`} value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Briefly describe what this role is for…" />
            </div>
          </div>
          <ModalFooter onCancel={() => setRoleModal('closed')} onConfirm={saveRole} confirmLabel={roleModal === 'add' ? 'Create Role' : 'Save'} />
        </Modal>
      )}

      {/* ------- DELETE ROLE MODAL ------- */}
      {roleModal === 'delete' && targetRole && (
        <Modal title="Delete Role" onClose={() => setRoleModal('closed')}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Icon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Delete role &ldquo;{targetRole.name}&rdquo;?</p>
                <p className="text-sm text-gray-500 mt-1">All permissions configured for this role will be lost. Make sure no users are assigned to it first.</p>
              </div>
            </div>
          </div>
          <ModalFooter onCancel={() => setRoleModal('closed')} onConfirm={confirmDeleteRole} confirmLabel="Delete Role" confirmClass="bg-red-600 hover:bg-red-700" />
        </Modal>
      )}
    </div>
  );
}

// --- Modal shell --------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel, onConfirm, confirmLabel, confirmClass = 'bg-blue-600 hover:bg-blue-700',
}: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmClass?: string }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl flex-shrink-0">
      <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
        Cancel
      </button>
      <button onClick={onConfirm} className={`px-4 py-2 text-sm text-white rounded-lg font-medium ${confirmClass}`}>
        {confirmLabel}
      </button>
    </div>
  );
}
