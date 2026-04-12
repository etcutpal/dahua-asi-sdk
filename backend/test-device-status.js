/**
 * Test script to verify device status is properly returned
 * Run this after starting the backend (npm run dev)
 */

const API_URL = 'http://localhost:3001';

async function testDeviceStatus() {
  console.log('🧪 Testing Device Status API...\n');

  try {
    // Test 1: Get all devices
    console.log('1️⃣  Fetching all devices...');
    const response = await fetch(`${API_URL}/api/devices`);
    const data = await response.json();

    if (!data.success) {
      console.error('❌ Failed to get devices:', data.error);
      return;
    }

    const devices = data.devices || [];
    console.log(`✅ Found ${devices.length} device(s)\n`);

    // Test 2: Check device structure
    console.log('2️⃣  Checking device data structure...');
    if (devices.length === 0) {
      console.log('⚠️  No devices found. Please add a device first.');
      return;
    }

    const device = devices[0];
    const requiredFields = ['deviceId', 'name', 'registrationId', 'status'];
    const missingFields = requiredFields.filter(f => !(f in device));

    if (missingFields.length > 0) {
      console.error(`❌ Missing required fields: ${missingFields.join(', ')}`);
      console.log('Device structure:', JSON.stringify(device, null, 2));
      return;
    }

    console.log('✅ All required fields present\n');

    // Test 3: Check status values
    console.log('3️⃣  Checking device statuses...');
    const onlineDevices = devices.filter(d => d.status === 'Online');
    const offlineDevices = devices.filter(d => d.status === 'Offline');

    devices.forEach((d, i) => {
      const statusIcon = d.status === 'Online' ? '🟢' : '🔴';
      console.log(`   ${statusIcon} ${d.name} (${d.registrationId}) - ${d.status}`);
      console.log(`      Device ID: ${d.deviceId || 'N/A'}`);
      console.log(`      DeviceID (PascalCase): ${d.DeviceID || 'N/A'}`);
      console.log(`      Status (PascalCase): ${d.Status || 'N/A'}`);
    });

    console.log(`\n📊 Summary: ${onlineDevices.length} online, ${offlineDevices.length} offline\n`);

    // Debug: Show raw device data
    if (devices.length > 0) {
      console.log('🔍 Raw device data (first device):');
      console.log(JSON.stringify(devices[0], null, 2));
      console.log('');
    }

    // Test 4: Verify Person Management will see online devices
    console.log('4️⃣  Testing Person Management device filter...');
    const personManagementFilter = devices.filter(d => d.status === 'Online' || d.status === 'online');
    
    if (personManagementFilter.length === 0) {
      console.log('⚠️  No online devices detected by Person Management filter');
      console.log('   This means "Sync to Device" will show "No online devices available"');
    } else {
      console.log(`✅ Person Management will see ${personManagementFilter.length} online device(s)`);
      personManagementFilter.forEach(d => {
        console.log(`   ✓ ${d.name} - available for sync`);
      });
    }

    console.log('\n✨ Test Complete!\n');

    if (onlineDevices.length > 0) {
      console.log('🎉 SUCCESS! You can now use "Sync to Device" in Person Management');
    } else {
      console.log('⚠️  WARNING: No online devices found');
      console.log('   - Make sure your device is connected');
      console.log('   - Check C# Bridge logs for device status');
      console.log('   - Verify device login credentials');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nMake sure the backend is running:');
    console.log('  cd backend');
    console.log('  npm run dev');
  }
}

// Run the test
testDeviceStatus();
