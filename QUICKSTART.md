# Quick Start Guide

Get your NetSDK Device Monitor up and running in 5 minutes!

## Prerequisites Check

```bash
# Verify .NET 8+ is installed
dotnet --version

# Verify Node.js 18+ is installed
node --version

# Verify npm is installed
npm --version
```

## Quick Start (3 Steps)

### Step 1: Start C# Bridge Service

```bash
cd NetSDKBridge
dotnet restore
dotnet run
```

✅ You should see: "HTTP API Server starting on port 5000"

### Step 2: Start Express Backend

Open a new terminal:

```bash
cd backend
npm install
npm run dev
```

✅ You should see: "Express server running on port 3001"

### Step 3: Start Next.js Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

✅ You should see: "Ready in Xms" and "Local: http://localhost:3000"

## Access the Application

Open your browser and navigate to: **http://localhost:3000**

You should see:
- Dashboard with device statistics
- Empty device list (until you add devices)
- Event log panel ready to receive events

## Add Your First Device

### Option 1: Auto Registration (Recommended)

1. Configure your face access device:
   - Access device web interface
   - Navigate to Network → Platform Access
   - Enable Auto Registration
   - Set Server IP: Your computer's IP
   - Set Server Port: 9500
   - Save and apply

2. Device will automatically appear in the dashboard

### Option 2: Manual Login

1. Click "Add Device" button
2. Enter:
   - IP: Your device IP (e.g., 192.168.1.100)
   - Port: 37777 (default)
   - Username: admin
   - Password: Your device password
3. Click "Connect"

## Test Real-time Events

Simulate an event to see real-time updates:

```bash
# In a new terminal
curl -X POST http://localhost:3001/api/devices/YOUR_DEVICE_ID/simulate-event \
  -H "Content-Type: application/json" \
  -d '{"eventType": "FaceRecognition", "eventData": "Test user recognized"}'
```

You should see the event appear instantly in the frontend!

## Common Issues

**Port already in use?**
```bash
# Check what's using the port
netstat -ano | findstr :5000  # Windows
netstat -tuln | grep 5000     # Linux/Mac

# Or change the port in the respective config files
```

**C# Bridge won't start?**
```bash
# Make sure you have .NET 8 SDK
dotnet --list-sdks

# Clean and rebuild
dotnet clean
dotnet build
```

**Frontend can't connect to backend?**
```bash
# Verify backend is running
curl http://localhost:3001/api/health

# Check .env file has correct NETSDK_BRIDGE_URL
```

## Next Steps

1. ✅ Add your face access device
2. ✅ Enable auto registration
3. ✅ Test real-time event monitoring
4. 📖 Read full documentation in README.md
5. 🔧 Integrate actual NetSDK DLLs (see TODO comments in code)

## Need Help?

Check the full README.md for:
- Detailed architecture
- Complete API documentation
- Troubleshooting guide
- Production deployment instructions

---

**Happy Monitoring! 🚀**
