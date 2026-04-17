# Settings Feature - Visual Architecture

## Sidebar Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     AccessPro Sidebar                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  🏠 Dashboard              → /                              │
│  📋 Access Records         → /access-records               │
│  👥 Person                 → /persons                       │
│  🔐 Access Control         → /access-control               │
│  📅 Attendance             → /attendance                    │
│  🖥️  Devices               → /devices                       │
│  ⚙️  Settings ▼            → /settings                      │
│     ├─ 📄 Attendance Config → /settings/attendance         │
│     ├─ 🖥️  Device Settings  → /devices                      │
│     ├─ 👤 User Management   → /settings/users              │
│     └─ ⚙️  System Settings   → /settings/system             │
│                                                               │
│  🚪 Logout                                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Settings Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Settings Dashboard                                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Header:                                                         │
│  Settings                                                        │
│  Configure your AccessPro system preferences...                 │
│                                                                  │
│  Grid Layout (2 columns on desktop):                            │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ 📄 Attendance Config │  │ 🖥️  Device Settings  │            │
│  │                      │  │                      │            │
│  │ Manage working hours │  │ Configure devices   │            │
│  │ late policies...     │  │ network settings... │            │
│  │                 →    │  │                 →   │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ 👤 User Management   │  │ ⚙️  System Settings  │            │
│  │                      │  │                      │            │
│  │ Create, modify users │  │ Configure general   │            │
│  │ manage permissions... │  │ preferences...      │            │
│  │                 →    │  │                 →   │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🔌 API Tester                                            │  │
│  │                                                          │  │
│  │ Test and debug API endpoints, view                      │  │
│  │ request/response details...                             │  │
│  │                                                    →     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Quick Actions:                                                  │
│  [💾 Backup Data]  [📤 Export Settings]  [❓ Documentation]    │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

## Dropdown Menu (Hover/Click)

```
Settings Button (in Sidebar)
         ↓
    ┌─────────────────────────────────┐
    │  Attendance Configuration   📄   │
    ├─────────────────────────────────┤
    │  Device Settings            🖥️  │
    ├─────────────────────────────────┤
    │  User Management            👤  │
    ├─────────────────────────────────┤
    │  System Settings            ⚙️  │
    └─────────────────────────────────┘
```

## Attendance Configuration Page Structure

```
Settings > Attendance Configuration
│
├── Tabs:
│   ├── Attendance Rules
│   │   ├── Calculation Rule
│   │   │   ├── Round Down
│   │   │   └── Round Up
│   │   ├── Must Check In/Out for Leave
│   │   └── [Save Button]
│   │
│   ├── Attendance Periods
│   │   ├── Add Period Button
│   │   └── Table:
│   │       ├── Period Name
│   │       ├── Start Time
│   │       ├── End Time
│   │       ├── Working Hours
│   │       ├── Status
│   │       └── Actions (Edit/Delete)
│   │
│   ├── Attendance Shifts
│   │   ├── Add Shift Button
│   │   └── Shift Cards Grid
│   │       ├── Morning Shift
│   │       ├── Evening Shift
│   │       └── Night Shift
│   │
│   └── Shift Schedules
│       ├── Create Schedule Button
│       └── Weekly Schedule Table
│
└── Period Details Modal
    ├── Mode Selection (Fixed/Flexible)
    ├── General/Break Tabs
    ├── Period Configuration
    └── Save/Cancel Buttons
```

## User Management Page Structure

```
Settings > User Management
│
├── Header
│   └── [Add User Button]
│
├── Users Table
│   ├── Columns:
│   │   ├── Name (with avatar)
│   │   ├── Email
│   │   ├── Role
│   │   ├── Status (toggle-able)
│   │   ├── Created Date
│   │   └── Actions (Edit/Delete)
│   │
│   └── Sample Data:
│       ├── Utpal Mandal (Admin, Active)
│       ├── John Doe (Manager, Active)
│       ├── Jane Smith (User, Active)
│       └── Mike Johnson (User, Inactive)
│
└── User Modal
    ├── Name Input
    ├── Email Input
    ├── Role Dropdown (Admin/Manager/User)
    └── Save/Cancel Buttons
```

## System Settings Page Structure

```
Settings > System Settings
│
├── General Settings
│   ├── System Name
│   ├── Timezone (Dropdown)
│   ├── Date Format (Dropdown)
│   └── Log Level (Dropdown)
│
├── Notification Settings
│   ├── ☑ Enable System Notifications
│   └── ☑ Enable Email Notifications
│
├── Backup Settings
│   ├── ☑ Enable Automatic Backups
│   ├── Backup Frequency (if enabled)
│   └── [Create Backup Now Button]
│
├── Security Settings
│   ├── Max Login Attempts (1-10)
│   └── Session Timeout (5-480 minutes)
│
├── System Information (Read-only)
│   ├── Application Version: 1.0.0
│   ├── Last Updated: April 17, 2026
│   ├── Database Status: Connected ✓
│   └── API Server Status: Running ✓
│
└── Buttons
    ├── [Cancel]
    └── [Save Settings]
```

## API Tester Integration

```
Settings Dashboard
│
└── API Tester Card
    │
    └── /api-tester
        │
        ├── Left Panel (Request)
        │   ├── Method Selector (GET/POST/PUT/DELETE/PATCH)
        │   ├── Endpoint Input
        │   ├── [Send Button]
        │   ├── Headers Section
        │   ├── Body Section (for POST/PUT/PATCH)
        │   └── Response Display
        │
        └── Right Panel (History)
            ├── Request History
            │   ├── GET /api/persons (200)
            │   ├── POST /api/persons (201)
            │   └── GET /api/devices (200)
            │
            └── Click to quick-load previous requests
```

## Color Coding System

```
┌─────────────────────────┬──────────────┬─────────────────────────┐
│ Setting                 │ Color        │ Icon Color              │
├─────────────────────────┼──────────────┼─────────────────────────┤
│ Attendance Config       │ Blue         │ bg-blue-50 / blue-600   │
│ Device Settings         │ Green        │ bg-green-50 / green-600 │
│ User Management         │ Purple       │ bg-purple-50 / purple-600 │
│ System Settings         │ Orange       │ bg-orange-50 / orange-600 │
│ API Tester              │ Indigo       │ bg-indigo-50 / indigo-600 │
└─────────────────────────┴──────────────┴─────────────────────────┘
```

## Navigation Flow Diagram

```
                    ┌─────────────────────┐
                    │   Main Dashboard    │
                    └────────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Click/Hover Settings │
                    └──────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐          ┌──────▼──────┐         ┌────▼────┐
   │Settings │          │  API Tester │         │ Devices │
   │Dashboard│          │             │         │         │
   └────┬────┘          └─────────────┘         └─────────┘
        │
        ├─ Attendance Config ──────── Attendance Periods,
        │                              Shifts, Schedules
        │
        ├─ User Management ────────── Add/Edit/Delete Users
        │
        └─ System Settings ────────── General, Notifications,
                                       Backup, Security Settings
```

## Data Flow

```
User Interaction
        │
        ▼
   Sidebar Click/Hover
        │
        ▼
   Settings Menu
        │
        ▼
   Settings Dashboard / Sub-page
        │
        ├──→ Form State Management (React useState)
        │
        ├──→ API Calls (if needed)
        │
        ├──→ Success/Error Notifications
        │
        └──→ UI Updates
```

## Responsive Design

```
Desktop (≥1024px):
┌──────────────────────────────────────────────────────┐
│ Sidebar    │ Settings Page (Full Content)           │
│  64px      │ 2-column grid layout                   │
│            │ All panels visible                      │
└──────────────────────────────────────────────────────┘

Tablet (768px - 1023px):
┌──────────────────────────────────────────┐
│ Sidebar  │ Settings (2 cols → 1 col)    │
│  64px    │ Responsive grid               │
└──────────────────────────────────────────┘

Mobile (<768px):
┌────────────────────┐
│ Settings (Hamburger│
│ menu hidden)       │
│ Single column      │
│ layout             │
└────────────────────┘
```

## Component Hierarchy

```
App Layout
│
├── Sidebar Component
│   ├── Logo Section
│   ├── Navigation Items
│   ├── Settings Button (with state)
│   │   └── Settings Dropdown Menu
│   └── Logout Button
│
├── Main Content Area (ml-64)
│   │
│   ├── Settings Page
│   │   └── Settings Grid Cards
│   │
│   ├── Attendance Config Page
│   │   ├── Tab Navigation
│   │   ├── Tab Content Sections
│   │   └── Period Details Modal
│   │
│   ├── User Management Page
│   │   ├── Users Table
│   │   └── User Modal
│   │
│   ├── System Settings Page
│   │   ├── Settings Sections
│   │   └── Form Inputs
│   │
│   └── API Tester Page
│       ├── Request Panel
│       ├── Response Panel
│       └── History Panel
│
└── Toast Notifications
    ├── Success Messages
    └── Error Messages
```

## Feature Comparison Matrix

```
┌──────────────────┬──────┬──────┬────┬────────┬────────┐
│ Feature          │ Att. │ Dev. │User│ System │ API    │
├──────────────────┼──────┼──────┼────┼────────┼────────┤
│ Create           │  ✓   │  ✗   │ ✓  │  ✗    │  ✓    │
│ Read             │  ✓   │  ✓   │ ✓  │  ✓    │  ✓    │
│ Update           │  ✓   │  ✓   │ ✓  │  ✓    │  ✓    │
│ Delete           │  ✓   │  ✗   │ ✓  │  ✗    │  ✓    │
│ Export           │  ✗   │  ✗   │ ✗  │  ✓    │  ✗    │
│ Backup           │  ✗   │  ✗   │ ✗  │  ✓    │  ✗    │
│ Modal Dialog     │  ✓   │  ✗   │ ✓  │  ✗    │  ✗    │
│ Table Display    │  ✓   │  ✓   │ ✓  │  ✗    │  ✓    │
│ Notifications    │  ✓   │  ✗   │ ✓  │  ✓    │  ✗    │
└──────────────────┴──────┴──────┴────┴────────┴────────┘
```

---
*This visual architecture provides a comprehensive overview of the Settings feature structure and data flow.*
