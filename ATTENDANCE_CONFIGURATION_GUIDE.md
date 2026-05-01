# Attendance Configuration — Complete Reference Guide

> **Location in app:** Settings → Attendance Configuration (`/settings/attendance`)  
> **Backend route file:** `backend/src/routes/attendance/periods.ts`  
> **Repository interface:** `backend/src/repositories/IAttendanceRepository.ts`  
> **Frontend page:** `frontend/src/app/settings/attendance/page.tsx`

---

## Overview

The Attendance Configuration page is the **central settings hub** for all attendance-related rules in the system. It has **7 tabs**, each controlling a different aspect of how employee attendance is tracked, calculated, and managed.

```
Attendance Configuration
├── Tab 1 — Attendance Rules     (global calculation rules)
├── Tab 2 — Attendance Periods   (work time windows + per-period rules)
├── Tab 3 — Attendance Shifts    (shift definitions with loop cycles)
├── Tab 4 — Shift Schedules      (assign shifts to employees/groups)
├── Tab 5 — Holidays             (public & company holidays)
├── Tab 6 — Leave Types          (leave type definitions + employee assignments)
└── Tab 7 — Leave Records        (manager-assigned leave records per employee)
```

---

## Tab 1 — Attendance Rules

### What it does
Defines **global** calculation behaviour that applies across the entire system, regardless of which period or shift an employee belongs to.

### Settings

| Setting | UI Label | Type | Default | Description |
|---|---|---|---|---|
| `roundingRule` | Attendance Calculation Accuracy | Radio | `roundDown` | How sub-minute card swipes are rounded |
| `mustCheckInOutForLeave` | Must Check In/Out for Leave | Checkbox | `true` | Whether employees on approved leave must still swipe in/out |

#### Rounding Rule — detail

| Value | Label | Behaviour | Example |
|---|---|---|---|
| `roundDown` | Round Down | Rounds the swipe time **up** to the next minute | Swipe at 9:00:01 → recorded as **9:01:00** |
| `roundUp` | Round Up | Rounds the swipe time **down** to the current minute | Swipe at 9:00:01 → recorded as **9:00:00** |

> **Note on naming confusion:** The UI label "Round Down" actually rounds attendance *down* (i.e. the system is less generous — it moves the check-in time forward). "Round Up" moves check-in time backward (more generous). The names refer to the direction of attendance benefit, not clock direction.

---

### Database Table: `attendance_rules_settings`

There is always exactly **one row** in this table (singleton). The system auto-seeds it with defaults on first GET if the table is empty.

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Fixed primary key, e.g. `"rules_settings_singleton"` |
| `rounding_rule` | VARCHAR(32) | YES | `'roundDown'` | Either `'roundDown'` or `'roundUp'`. Controls how sub-minute swipes are rounded |
| `must_check_in_out_for_leave` | TINYINT / BOOLEAN | YES | `1` (true) | `1` = employees on leave must still check in/out. `0` = not required |
| `updated_at` | DATETIME | YES | — | Timestamp of the last save |

**API endpoints:**
```
GET  /api/attendance/rulesSettings   → returns { success, rulesSettings }
PUT  /api/attendance/rulesSettings   → body: { roundingRule, mustCheckInOutForLeave }
```

---

## Tab 2 — Attendance Periods

### What it does
An **Attendance Period** is a named work-time window (e.g. "Standard Day", "Night Shift"). It defines:
- What hours constitute a working day
- How late/early-leave is tolerated before penalties
- Overtime thresholds
- Which **breaks** occur during that period

Each period can be in **Fixed** or **Flexible** mode:

| Mode | Description |
|---|---|
| **Fixed** | Employees must arrive and leave at specific times. Late/early-leave rules apply strictly |
| **Flexible** | Employees only need to work the total required hours; no fixed start/end time enforcement |

### Period Fields (UI → what they mean)

| UI Field | Internal Name | Description |
|---|---|---|
| Period Name | `name` | Display name, e.g. "Standard 9-to-5" |
| Working Time (Start) | `startTime` | Expected check-in time, e.g. `09:00` |
| Working Time (End) | `endTime` | Expected check-out time, e.g. `18:00` |
| Required Work Time | `requiredWorkTime` | Auto-calculated total minutes between start and end (minus breaks). Read-only |
| Mode | `mode` | `'fixed'` or `'flexible'` |
| Status | `status` | `'ACTIVE'` or `'INACTIVE'`. Inactive periods still exist but won't be used in calculations |

### Per-Period Attendance Rules (`rules` JSON column)

These rules are stored as a JSON blob in the `rules` column of `attendance_periods`. Each period can have different thresholds.

| Rule Field | UI Text | Default | Description |
|---|---|---|---|
| `overtimeFromMinutes` | "Overtime work is calculated from ___ minutes after end of work" | 60 | How many minutes past end-time before overtime starts counting. e.g. `60` means the employee must work 60+ minutes past 18:00 before OT is recorded |
| `allowedLateMinutes` | "Allowed to be ___ minutes late" | 15 | Grace period. Arriving within this many minutes after start time is not marked as late |
| `lateForAbsentMinutes` | "Being late for more than ___ minutes is considered as absent" | 120 | If the employee is this many minutes late, the entire day is marked Absent instead of Late |
| `allowedLeaveEarlyMinutes` | "Allowed to leave ___ minutes early" | 15 | Grace period for leaving before end time |
| `earlyLeaveForAbsentMinutes` | "Leaving early for more than ___ minutes is considered as absent" | 120 | If the employee leaves this many minutes early, the day is marked Absent |
| `overtimeEnabled` | "Overtime Rule" toggle | true | Master switch for overtime tracking in this period |
| `minOvertimeMinutes` | "The minimum overtime is ___ minutes" | 60 | OT less than this threshold is discarded (recorded as 0) |
| `maxOvertimeMinutes` | "The maximum overtime is ___ minutes" | 300 | OT exceeding this cap is clamped to this value |

> **Example flow:** Employee's period is 09:00–18:00, `allowedLateMinutes = 15`:
> - Arrives 09:10 → **On time** (within grace period)
> - Arrives 09:20 → **Late** (exceeds grace)
> - Arrives 11:15 → **Absent** (exceeds `lateForAbsentMinutes = 120`)

### Breaks (within a Period)

Breaks are sub-windows within a period where the employee is not counted as working. Breaks can be either:
- Created fresh ("Add New Break")
- Picked from the **Break Library** ("Select Break") — reusable across multiple periods

Each break has:

| Break Field | Description |
|---|---|
| `name` | Display name, e.g. "Lunch Break" |
| `startTime` | Scheduled break start, e.g. `12:00` |
| `endTime` | Scheduled break end, e.g. `13:00` |
| `mustCheckInOut` | Whether employees must swipe in/out for the break specifically |
| `validStartTime` | Earliest allowed start of the break (flexible window), e.g. `11:30` |
| `validEndTime` | Latest allowed end of the break, e.g. `13:30` |
| `durationLimit` | Whether the break has a maximum duration cap |
| `durationMinutes` | Maximum allowed break duration if `durationLimit = true`, e.g. `120` |
| `lateType` | How to classify returning late from break (e.g. `"Late"`) |

---

### Database Table: `attendance_periods`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `period_` e.g. `period_1714567890123` |
| `name` | VARCHAR(255) | NO | — | Human-readable period name |
| `mode` | VARCHAR(32) | YES | — | `'fixed'` or `'flexible'` |
| `start_time` | VARCHAR(10) | YES | — | Work start time as `HH:MM` string |
| `end_time` | VARCHAR(10) | YES | — | Work end time as `HH:MM` string |
| `required_work_time` | INT | YES | — | Total required work minutes (auto-calculated from start/end minus break durations) |
| `rules` | TEXT / NVARCHAR(MAX) | YES | — | **JSON blob** of `PeriodRuleValues` (all 8 rule fields above) |
| `breaks` | TEXT / NVARCHAR(MAX) | YES | — | **JSON array** of break objects assigned to this period |
| `status` | VARCHAR(32) | YES | `'ACTIVE'` | `'ACTIVE'` or `'INACTIVE'` |
| `created_at` | DATETIME | NO | — | Record creation timestamp |
| `updated_at` | DATETIME | NO | — | Last modification timestamp |

**Example `rules` JSON stored in the column:**
```json
{
  "overtimeFromMinutes": 60,
  "allowedLateMinutes": 15,
  "lateForAbsentMinutes": 120,
  "allowedLeaveEarlyMinutes": 15,
  "earlyLeaveForAbsentMinutes": 120,
  "overtimeEnabled": true,
  "minOvertimeMinutes": 60,
  "maxOvertimeMinutes": 300
}
```

**API endpoints:**
```
GET    /api/attendance/periods          → { success, periods[] }
POST   /api/attendance/periods          → create period
PUT    /api/attendance/periods/:id      → update period
DELETE /api/attendance/periods/:id      → delete period
```

---

### Database Table: `attendance_breaks` (Break Library)

The Break Library stores **reusable break definitions** that can be selected and attached to any period. When a break is attached to a period, a copy is stored in the `breaks` JSON column of `attendance_periods`.

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `break_` |
| `name` | VARCHAR(255) | NO | — | Break name, e.g. "Lunch Break" |
| `start_time` | VARCHAR(10) | NO | — | Scheduled break start `HH:MM` |
| `end_time` | VARCHAR(10) | NO | — | Scheduled break end `HH:MM` |
| `must_check_in_out` | TINYINT / BOOLEAN | YES | `TRUE` | `1` = employees must swipe for break |
| `valid_start_time` | VARCHAR(10) | YES | — | Earliest the break can start |
| `valid_end_time` | VARCHAR(10) | YES | — | Latest the break can end |
| `duration_limit` | TINYINT / BOOLEAN | YES | `FALSE` | `1` = break has a max duration cap |
| `duration_minutes` | INT | YES | 120 | Max break duration in minutes (used only if `duration_limit = 1`) |
| `late_type` | VARCHAR(32) | YES | — | How returning late from break is classified, e.g. `"Late"` |
| `created_at` | DATETIME | NO | — | When this break was added to the library |

**API endpoints:**
```
GET    /api/attendance/breaks           → { success, breaks[] }
POST   /api/attendance/breaks           → add to library
PUT    /api/attendance/breaks/:id       → update in library
DELETE /api/attendance/breaks/:id       → remove from library
```

---

## Tab 3 — Attendance Shifts

### What it does
A **Shift** links a **Period** to a repeating weekly/daily cycle. It defines *which days of the week* an employee works, and how many cycles to repeat.

### Shift Fields

| Field | Description |
|---|---|
| `name` | Shift name, e.g. "Standard Week", "Mon-Sat Rotating" |
| `periodId` / `periodName` | Which Attendance Period applies to this shift (links to `attendance_periods`) |
| `loopMode` | `'day'` = cycle repeats every N days; `'week'` = cycle repeats every week |
| `numberOfCycles` | How many times the shift cycle repeats before it resets |
| `workDays` | JSON object with 7 boolean keys: `{ mon, tue, wed, thu, fri, sat, sun }` — which days are working days |

> **Example:** A Monday-Friday standard shift:
> ```json
> { "mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false }
> ```

---

### Database Table: `attendance_shifts`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `shift_` |
| `name` | VARCHAR(255) | NO | — | Shift display name |
| `period_id` | VARCHAR(64) | YES | — | FK reference to `attendance_periods.id` |
| `period_name` | VARCHAR(255) | YES | — | Denormalized copy of the period name (for display without a JOIN) |
| `loop_mode` | VARCHAR(32) | YES | — | `'day'` or `'week'` |
| `number_of_cycles` | INT | YES | — | Number of repeat cycles |
| `work_days` | TEXT / NVARCHAR(MAX) | YES | — | **JSON object** `{ mon, tue, wed, thu, fri, sat, sun }` with boolean values |
| `created_at` | DATETIME | NO | — | Creation timestamp |
| `updated_at` | DATETIME | NO | — | Last update timestamp |

**API endpoints:**
```
GET    /api/attendance/shifts           → { success, shifts[] }
POST   /api/attendance/shifts           → create shift
PUT    /api/attendance/shifts/:id       → update shift
DELETE /api/attendance/shifts/:id       → delete shift
```

---

## Tab 4 — Shift Schedules

### What it does
A **Schedule** is a time-bound assignment of a **Shift** to one or more **employees and/or groups**. It answers: "Who works which shift, and from when to when?"

### Schedule Fields

| Field | Description |
|---|---|
| `shiftId` / `shiftName` | Which Shift this schedule runs (links to `attendance_shifts`) |
| `startDate` | First date this schedule is active (`YYYY-MM-DD`) |
| `endDate` | Last date this schedule is active (`YYYY-MM-DD`) |
| `members` | Array of employee/group assignments (see below) |

#### Members Format

Each member in the `members` array is:
```json
{ "id": "emp_abc123", "name": "John Smith", "type": "employee" }
// or
{ "id": "grp_xyz456", "name": "Sales Team", "type": "group" }
```

- `type: "employee"` — directly assigns an individual employee  
- `type: "group"` — assigns all members of an employee group

---

### Database Table: `attendance_schedules`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `sched_` |
| `shift_id` | VARCHAR(64) | YES | — | FK reference to `attendance_shifts.id` |
| `shift_name` | VARCHAR(255) | YES | — | Denormalized shift name for display |
| `start_date` | VARCHAR(32) | YES | — | Schedule start date `YYYY-MM-DD` |
| `end_date` | VARCHAR(32) | YES | — | Schedule end date `YYYY-MM-DD` |
| `members` | TEXT / NVARCHAR(MAX) | YES | — | **JSON array** of `{ id, name, type }` objects |
| `created_at` | DATETIME | NO | — | Creation timestamp |
| `updated_at` | DATETIME | NO | — | Last update timestamp |

**API endpoints:**
```
GET    /api/attendance/schedules        → { success, schedules[] }
POST   /api/attendance/schedules        → create schedule
PUT    /api/attendance/schedules/:id    → update schedule (incl. members)
DELETE /api/attendance/schedules/:id    → delete schedule
```

---

## Tab 5 — Holidays

### What it does
Defines dates that are **non-working days** for the entire organisation. When a date matches a holiday, attendance calculations skip that day (employees are not marked absent).

### Holiday Types

| Type | Description |
|---|---|
| `public` | National/government holiday (e.g. New Year's Day, Independence Day) |
| `company` | Internal company holiday (e.g. Company Anniversary, Team Day) |

### Recurring Holidays
If `recurring = true`, the holiday repeats on the **same month/day every year** (year is ignored in matching). This is useful for fixed-date national holidays.

If `recurring = false`, it applies only to the **exact date** specified.

---

### Database Table: `attendance_holidays`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `holiday_` |
| `name` | VARCHAR(255) | NO | — | Holiday name, e.g. "New Year's Day" |
| `date` | VARCHAR(32) | NO | — | Date as `YYYY-MM-DD` string |
| `recurring` | TINYINT / BOOLEAN | YES | `0` | `1` = repeats every year on same MM-DD. `0` = one-time only |
| `type` | VARCHAR(32) | YES | — | `'public'` or `'company'` |
| `created_at` | DATETIME | NO | — | Creation timestamp |

**API endpoints:**
```
GET    /api/attendance/holidays         → { success, holidays[] }
POST   /api/attendance/holidays         → create holiday
PUT    /api/attendance/holidays/:id     → update holiday
DELETE /api/attendance/holidays/:id     → delete holiday
```

---

## Tab 6 — Leave Types

### What it does
Defines the **catalogue of leave types** available in the organisation (e.g. Annual Leave, Sick Leave, Maternity Leave). These are the options that managers and employees can choose from when assigning leave records.

Leave types can optionally be **restricted** to specific employees or groups (`assignedTo`). If the list is empty, the leave type is available to all employees.

### Leave Type Fields

| Field | UI Label | Description |
|---|---|---|
| `name` | Name | Display name, e.g. "Annual Leave", "Sick Leave" |
| `paidLeave` | Paid Leave toggle | `true` = employee is paid during this leave. `false` = unpaid leave |
| `daysPerYear` | Days Per Year | Yearly entitlement limit, e.g. `14` days. `0` = unlimited |
| `carryOver` | Carry Over | `true` = unused days from this year roll over to the next year |
| `requiresApproval` | Approval Required | `true` = leave must be formally approved before being used. `false` = self-service |
| `color` | Color | Hex color code used as a badge in UI, e.g. `#3B82F6` (blue) |
| `assignedTo` | Assigned to | Array of employees/groups this leave type is restricted to. Empty = all employees |

---

### Database Table: `attendance_leave_types`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `leave_` |
| `name` | VARCHAR(255) | NO | — | Leave type name |
| `paid_leave` | TINYINT / BOOLEAN | YES | `1` | `1` = paid, `0` = unpaid |
| `days_per_year` | INT | YES | `0` | Annual entitlement. `0` = no cap |
| `carry_over` | TINYINT / BOOLEAN | YES | `0` | `1` = unused days carry to next year |
| `requires_approval` | TINYINT / BOOLEAN | YES | `1` | `1` = approval required before use |
| `color` | VARCHAR(32) | YES | — | Hex color string e.g. `#10B981` |
| `assigned_to` | TEXT / NVARCHAR(MAX) | YES | `'[]'` | **JSON array** of `{ id, name, type }` objects. Empty array = available to all |
| `created_at` | DATETIME | NO | — | Creation timestamp |

**Example `assigned_to` JSON:**
```json
[
  { "id": "emp_abc123", "name": "John Smith", "type": "employee" },
  { "id": "grp_xyz456", "name": "Management", "type": "group" }
]
```

**API endpoints:**
```
GET    /api/attendance/leave-types           → { success, leaveTypes[] }
POST   /api/attendance/leave-types           → create leave type
PUT    /api/attendance/leave-types/:id       → update leave type (incl. assignedTo)
DELETE /api/attendance/leave-types/:id       → delete leave type
```

---

## Tab 7 — Leave Records

### What it does
Stores **actual leave assignments** — a specific employee, on specific dates, using a specific leave type. This is where a **manager directly assigns leave** to an employee without needing an approval workflow.

This is different from Leave Types (which are the catalogue). Leave Records are the **actual instances** of leave being used.

### Leave Record Lifecycle

```
approved  →  taken       (manager marks leave as used after the dates pass)
approved  →  cancelled   (leave was cancelled before it was taken)
taken     →  cancelled   (retrospective cancellation)
```

### Leave Record Fields

| Field | Description |
|---|---|
| `employeeId` | ID of the employee this leave is assigned to |
| `employeeName` | Denormalized employee name for display (no JOIN needed) |
| `leaveTypeId` | ID of the leave type used (links to `attendance_leave_types`) |
| `leaveTypeName` | Denormalized leave type name for display |
| `leaveTypeColor` | Denormalized hex color for badge rendering |
| `startDate` | First day of leave `YYYY-MM-DD` |
| `endDate` | Last day of leave `YYYY-MM-DD` |
| `days` | Total calendar days from start to end inclusive. Auto-calculated: `(endDate - startDate) + 1` |
| `notes` | Optional free-text notes (reason, remarks, etc.) |
| `status` | Current status: `'approved'`, `'taken'`, or `'cancelled'` |

---

### Database Table: `attendance_leave_records`

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | VARCHAR(64) | NO | — | Unique ID, prefixed `lr_` |
| `employee_id` | VARCHAR(64) | NO | — | FK to `employees.id` — who the leave belongs to |
| `employee_name` | VARCHAR(255) | NO | — | Denormalized employee name (snapshot at time of assignment) |
| `leave_type_id` | VARCHAR(64) | NO | — | FK to `attendance_leave_types.id` |
| `leave_type_name` | VARCHAR(255) | NO | — | Denormalized leave type name (snapshot at assignment time) |
| `leave_type_color` | VARCHAR(32) | YES | — | Denormalized hex color for UI badges |
| `start_date` | VARCHAR(32) | NO | — | Leave start date `YYYY-MM-DD` |
| `end_date` | VARCHAR(32) | NO | — | Leave end date `YYYY-MM-DD` |
| `days` | INT | NO | `1` | Total days count. Minimum 1. Calculated as `(endDate - startDate) + 1` |
| `notes` | TEXT / NVARCHAR(MAX) | YES | — | Optional notes/reason for leave |
| `status` | VARCHAR(32) | YES | `'approved'` | `'approved'` / `'taken'` / `'cancelled'` |
| `created_at` | DATETIME | NO | — | When this record was created |
| `updated_at` | DATETIME | NO | — | When this record was last modified |

**API endpoints:**
```
GET    /api/attendance/leave-records              → { success, leaveRecords[] }
GET    /api/attendance/leave-records?employeeId=X → filtered by employee
POST   /api/attendance/leave-records              → create record
PUT    /api/attendance/leave-records/:id          → update record (incl. status change)
DELETE /api/attendance/leave-records/:id          → delete record
```

---

## Data Architecture — How Everything Connects

```
attendance_rules_settings    (1 row — global calculation rules)

attendance_periods           (N rows — work time windows)
    └── rules (JSON)         ← per-period overtime/late thresholds
    └── breaks (JSON array)  ← break windows embedded in period

attendance_breaks            (N rows — Break Library, reusable breaks)

attendance_shifts            (N rows — work day pattern + cycle)
    └── period_id ──────────→ attendance_periods.id
    └── work_days (JSON)     ← { mon, tue, wed, thu, fri, sat, sun }

attendance_schedules         (N rows — who works which shift, when)
    └── shift_id ───────────→ attendance_shifts.id
    └── members (JSON array) ← [{ id, name, type: 'employee'|'group' }]

attendance_holidays          (N rows — non-working dates)

attendance_leave_types       (N rows — leave type catalogue)
    └── assigned_to (JSON)   ← [] = all employees, or specific list

attendance_leave_records     (N rows — actual leave assignments)
    └── employee_id ────────→ employees.id
    └── leave_type_id ──────→ attendance_leave_types.id
```

---

## Storage Backends

The system supports two storage backends, selected by `RepositoryFactory`:

| Backend | Class | Storage | When used |
|---|---|---|---|
| **JSON** | `JsonAttendanceRepository` | `backend/data/attendance/attendance-period.json` | When no SQL database is configured |
| **SQL** | `SqlAttendanceRepository` | SQL Server / MySQL / PostgreSQL | When DB connection is configured in Database Settings |

The factory automatically picks the correct backend:
```typescript
// backend/src/repositories/RepositoryFactory.ts
attendance(): IAttendanceRepository {
  return conn && backend === 'sql'
    ? new SqlAttendanceRepository(conn)
    : new JsonAttendanceRepository();
}
```

To create all attendance tables in SQL, use the **Database Settings** page → **Run Migration** button, or call:
```
POST /api/database/migrate
```

---

## Leave Management Page (separate from Configuration)

> **Location:** Attendance → Leave Management (`/attendance/leave`)

This is a **standalone operational page** (not part of Settings) where managers assign and track leave day-by-day. It provides:

- Employee sidebar showing total leave days used per employee
- Leave type usage breakdown (days used per type)
- Full filterable table of leave records (by employee, type, status, date range)
- **Inline status editing** — click the status badge in the table to switch between Approved / Taken / Cancelled
- Assign Leave modal with:
  - Searchable employee picker
  - Visual leave type card picker (color + paid/unpaid badge + days/yr info)
  - Start/End date pickers with auto day count
  - Status selector
  - Notes field

---

## Attendance Records Page (separate from Configuration)

> **Location:** Attendance → Attendance Records (`/attendance/records`)

Displays the **historical daily attendance log** per employee. Columns include:
- Employee, Date, Status (Present/Absent/Late/On Leave/Holiday)
- Check In / Check Out times
- Work Time, Overtime, Late minutes

Data source: `GET /api/attendance/records` (backend endpoint to be wired to device check-in events).

---

## Default Values Reference

### Period Rules Defaults (applied when creating a new period)

| Field | Default Value | Unit |
|---|---|---|
| `overtimeFromMinutes` | 60 | minutes |
| `allowedLateMinutes` | 15 | minutes |
| `lateForAbsentMinutes` | 120 | minutes |
| `allowedLeaveEarlyMinutes` | 15 | minutes |
| `earlyLeaveForAbsentMinutes` | 120 | minutes |
| `overtimeEnabled` | true | — |
| `minOvertimeMinutes` | 60 | minutes |
| `maxOvertimeMinutes` | 300 | minutes |

### Rules Settings Defaults

| Field | Default Value |
|---|---|
| `roundingRule` | `'roundDown'` |
| `mustCheckInOutForLeave` | `true` |

---

## ID Prefix Convention

All IDs are generated as `prefix_timestamp` to be human-readable in logs and debugging:

| Entity | Prefix | Example |
|---|---|---|
| Period | `period_` | `period_1714567890123` |
| Break | `break_` | `break_1714567891234` |
| Shift | `shift_` | `shift_1714567892345` |
| Schedule | `sched_` | `sched_1714567893456` |
| Holiday | `holiday_` | `holiday_1714567894567` |
| Leave Type | `leave_` | `leave_1714567895678` |
| Leave Record | `lr_` | `lr_1714567896789` |

---

## Files Quick Reference

| File | Purpose |
|---|---|
| `frontend/src/app/settings/attendance/page.tsx` | Full Attendance Configuration UI (7 tabs) |
| `frontend/src/app/attendance/leave/page.tsx` | Leave Management operational page |
| `frontend/src/app/attendance/records/page.tsx` | Attendance Records viewer page |
| `backend/src/routes/attendance/periods.ts` | All attendance API routes |
| `backend/src/repositories/IAttendanceRepository.ts` | TypeScript interface (all methods + types) |
| `backend/src/repositories/JsonAttendanceRepository.ts` | JSON file backend implementation |
| `backend/src/repositories/SqlAttendanceRepository.ts` | SQL backend implementation |
| `backend/src/repositories/RepositoryFactory.ts` | Auto-selects JSON vs SQL backend |
| `backend/src/routes/database-settings.ts` | SQL `CREATE TABLE` definitions for all attendance tables |
| `backend/data/attendance/attendance-period.json` | JSON data file (used when no SQL DB configured) |
