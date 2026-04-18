# Employee Page — Send to Device Feature

## Overview

The **Send to Device** feature was added to the Employee Management page (`/employee`).  
It mirrors the same functionality available on the Person Management page (`/persons`), allowing an employee's biometric data to be pushed to an access control device directly from the employee list.

---

## What Was Done

### File Modified
**`frontend/src/app/employee/page.tsx`**

No files in the `persons` folder were changed.

---

## New State Variables Added

Located near the top of `EmployeesPage()`, just below the existing `successMessage` state:

| State Variable | Type | Purpose |
|---|---|---|
| `showSendToDeviceModal` | `boolean` | Controls visibility of the Send to Device modal |
| `sendToDeviceEmployee` | `Employee \| null` | The employee selected to send |
| `sendToDeviceList` | `Device[]` | List of devices fetched from the API |
| `selectedDeviceId` | `string` | The device chosen by the user in the dropdown |
| `isSendingToDevice` | `boolean` | Loading state while the API call is in progress |
| `sendToDeviceStatus` | `{ success, message, error? } \| null` | Result of the send operation (success or failure) |

---

## New Functions Added

### 1. `handleSendToDeviceClick(employee: Employee)`
**Location:** `frontend/src/app/employee/page.tsx` — above the `handleProfilePictureUpload` function

**What it does:**
- Sets the selected employee in state
- Opens the Send to Device modal
- Resets all previous status/device selection
- Fetches the list of online devices from the backend API:
  ```
  GET http://localhost:3001/api/devices
  ```

---

### 2. `confirmSendToDevice()`
**Location:** `frontend/src/app/employee/page.tsx` — immediately after `handleSendToDeviceClick`

**What it does:**
- Sends the employee's `personId` to the selected device via the same API endpoint used by the Person Management page:
  ```
  POST http://localhost:3001/api/persons/{personId}/send-to-device
  Body: { deviceId: string }
  ```
- Updates `sendToDeviceStatus` with success or error message
- Uses the employee's `personId` field (shared field between Employee and Person data models)

---

### 3. `handleCloseSendToDeviceModal()`
**Location:** `frontend/src/app/employee/page.tsx` — immediately after `confirmSendToDevice`

**What it does:**
- Resets all Send to Device state (modal visibility, employee, device list, status)
- Called when user clicks Cancel, Close, or the X button

---

## UI Changes

### Send to Device Button in Table Row
Added a new icon button (upload arrow icon) in the **Actions column** of the employee table, between the Edit and Delete buttons:

```
[Edit]  [Send to Device ↑]  [Delete]
```

- Icon: Upload arrow (`M4 16v1a3...`)
- Title tooltip: `Send to Device`
- On click: calls `handleSendToDeviceClick(employee)`

---

### Send to Device Modal
A new modal was added just before the existing **Delete Confirmation Modal** in the JSX:

**Modal contents:**
1. **Header** — Title "Send to Device" with close (X) button
2. **Person Info Card** — Shows employee avatar/initial, name, and Person ID
3. **Device Dropdown** — Lists only **Online** devices fetched from the API; shows warning if no online devices found
4. **Status Block** — Shows success ✅ or error ❌ message after the send attempt
5. **Footer Buttons:**
   - `Cancel` / `Close` (after result) — closes modal
   - `Send` — triggers `confirmSendToDevice()`, disabled until a device is selected

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `http://localhost:3001/api/devices` | Fetch device list for the dropdown |
| `POST` | `http://localhost:3001/api/persons/{personId}/send-to-device` | Send employee biometric data to selected device |

> **Note:** These are the same endpoints used by the Person Management page. The Employee page reuses `personId` as the shared identifier to call the same backend service.

---

## Data Flow

```
User clicks "Send to Device" button (table row)
         ↓
handleSendToDeviceClick(employee)
  → sets sendToDeviceEmployee
  → opens modal (showSendToDeviceModal = true)
  → fetches GET /api/devices → populates sendToDeviceList
         ↓
User selects a device from dropdown
         ↓
User clicks "Send" button
         ↓
confirmSendToDevice()
  → POST /api/persons/{personId}/send-to-device
  → updates sendToDeviceStatus (success / error)
         ↓
Modal shows result message
User clicks "Close"
         ↓
handleCloseSendToDeviceModal()
  → resets all state
```

---

## Notes

- The `persons` folder and all its files are **untouched**.
- The Employee page uses the **same backend API** as the Person page for the send-to-device operation, since both share the `personId` field.
- Only **Online** devices are shown in the dropdown (filtered by `status === 'Online' || status === 'online'`).
- Pre-existing TypeScript errors in `employee/page.tsx` (related to `exceljs`, `jszip`, and `Set` iteration) were **not introduced** by this change and were present before.
