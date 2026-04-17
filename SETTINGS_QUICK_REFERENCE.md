# Settings Feature - Quick Reference Guide

## Accessing Settings

### Method 1: Sidebar Dropdown (Desktop)
1. Hover over **Settings** in the left sidebar
2. A dropdown menu appears with 4 options
3. Click any option to navigate

### Method 2: Sidebar Menu (Mobile/Click)
1. Click **Settings** in the left sidebar
2. Menu toggles open/closed
3. Click any option to navigate

### Method 3: Settings Dashboard
1. Click on **Settings** in sidebar
2. Dashboard opens showing all available options
3. Click any card to go to that section

---

## Main Settings Options

### 1. 📄 Attendance Configuration
**Location:** Settings → Attendance Configuration  
**What:** Manage all attendance-related configurations  
**Includes:**
- Attendance Rules (calculation methods, rounding)
- Attendance Periods (working hours, shifts)
- Attendance Shifts (shift definitions)
- Shift Schedules (weekly/monthly assignments)

**Common Tasks:**
- Add new attendance period: Click "Add" button on Periods tab
- Edit period: Click pencil icon
- Delete period: Click trash icon
- Save changes: Click "Save" button

---

### 2. 🖥️ Device Settings
**Location:** Settings → Device Settings  
**What:** Configure access control devices  
**Redirects to:** Device Management page  
**Includes:**
- Add new devices
- Edit device details
- Delete devices
- Device status monitoring
- Device configuration

---

### 3. 👤 User Management
**Location:** Settings → User Management  
**What:** Create and manage system users  
**Features:**
- View all users in a table
- Add new users
- Edit user information
- Toggle user status (Active/Inactive)
- Delete users
- Assign roles (Admin, Manager, User)

**Common Tasks:**
- Add user: Click "Add User" button → Fill form → Click "Save"
- Edit user: Click pencil icon → Update information → Click "Save"
- Deactivate user: Click on status badge to toggle
- Delete user: Click trash icon → Confirm deletion

---

### 4. ⚙️ System Settings
**Location:** Settings → System Settings  
**What:** Configure system-wide preferences  
**Sections:**

#### General Settings
- System Name - Name of your AccessPro system
- Timezone - Select your timezone
- Date Format - Choose date display format
- Log Level - Set logging verbosity

#### Notification Settings
- System Notifications - Enable/disable notifications
- Email Notifications - Enable/disable email alerts

#### Backup Settings
- Automatic Backups - Enable/disable scheduled backups
- Backup Frequency - Choose backup interval
- Create Backup Now - Manual backup button

#### Security Settings
- Max Login Attempts - Failed login attempts before lockout
- Session Timeout - Auto-logout duration (minutes)

#### System Information
- Application Version
- Last Updated date
- Database Status
- API Server Status

---

### 5. 🔌 API Tester
**Location:** Settings Dashboard → API Tester Card (or direct link `/api-tester`)  
**What:** Test and debug API endpoints  
**Features:**
- Send requests (GET, POST, PUT, DELETE, PATCH)
- Customize headers and body
- View responses with status codes
- Request history tracking
- Quick-load previous requests

**How to Use:**
1. Select HTTP method (GET, POST, etc.)
2. Enter endpoint URL
3. Add headers and body if needed
4. Click "Send"
5. View response and status code

---

## Common Workflows

### Adding a New User
```
Settings → User Management
    ↓
Click "Add User" button
    ↓
Fill in:
  - Name: John Smith
  - Email: john@example.com
  - Role: Manager
    ↓
Click "Save"
    ↓
Success notification appears
```

### Creating Attendance Period
```
Settings → Attendance Configuration
    ↓
Click "Attendance Periods" tab
    ↓
Click "Add" button
    ↓
Modal dialog opens
    ↓
Configure:
  - Period Name: Morning Shift
  - Attendance Mode: Fixed/Flexible
  - Working Time: 09:00 - 18:00
  - Rules: Configure as needed
    ↓
Click "Save"
```

### Backing Up System Data
```
Settings → System Settings
    ↓
Scroll to "Backup Settings"
    ↓
Enable "Automatic Backups" (if not already on)
    ↓
Click "Create Backup Now"
    ↓
Backup starts
    ↓
Success notification when complete
```

### Testing an API Endpoint
```
API Tester (from Settings or direct link)
    ↓
Select: GET
Endpoint: /api/persons
    ↓
Click "Send"
    ↓
Response appears with status code (e.g., 200)
    ↓
View JSON response in Response panel
```

---

## Tips & Tricks

### 💡 Quick Access
- Settings dropdown stays visible on hover (desktop)
- Settings button highlighted when on any settings page
- Breadcrumb shows your location within settings

### 💡 Data Validation
- Name and Email fields are required for users
- Valid email format is enforced
- Numeric fields have min/max limits

### 💡 Status Toggling
- Click on a user's status badge to toggle between Active/Inactive
- Active users can log in; Inactive users cannot
- Changes are saved immediately

### 💡 Keyboard Shortcuts
- Tab through form fields
- Enter/Space to click buttons
- Esc to close modals

### 💡 Notifications
- Green success messages confirm saved changes
- Messages auto-dismiss after 3 seconds
- Check bottom of page for notifications

### 💡 Mobile Friendly
- Click Settings button to toggle dropdown on mobile
- Responsive layout adjusts for smaller screens
- All buttons and inputs are touch-friendly

---

## Troubleshooting

### Can't see Settings dropdown?
- **Desktop:** Try hovering over Settings button
- **Mobile:** Click Settings button to toggle dropdown
- If still not visible, refresh the page

### Changes not saving?
- Check for validation errors (red text)
- Ensure all required fields are filled
- Click "Save" button (not just outside the form)

### User added but can't log in?
- Check user status is "Active" (not "Inactive")
- Verify email address is correct
- Reset password if needed

### API test not working?
- Check endpoint URL is correct (starts with /)
- Verify method type (GET for reads, POST for creates)
- Check request headers are valid JSON
- View API documentation for correct format

---

## Security Notes

⚠️ **Important Security Practices:**

1. **User Roles**
   - Admin: Full system access
   - Manager: Limited administrative functions
   - User: Standard access only

2. **Session Management**
   - Sessions timeout after configured duration
   - Adjust timeout in System Settings
   - Use shorter timeouts on shared computers

3. **Login Security**
   - Maximum login attempts prevents brute force
   - Accounts lock after failed attempts
   - Change password regularly

4. **Backups**
   - Regular automated backups are recommended
   - Keep backup frequency reasonable
   - Test restores periodically

---

## Related Pages

- Dashboard: `/`
- Person Management: `/persons`
- Access Records: `/access-records`
- Device Management: `/devices`
- Attendance: `/attendance`
- API Tester: `/api-tester`

---

## Support

For issues or questions:
1. Check this guide first
2. Review System Information for status
3. Check API Tester for endpoint issues
4. Contact system administrator

---

**Last Updated:** April 17, 2026  
**Version:** 1.0.0
