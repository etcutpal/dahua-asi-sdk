const mssql = require('./backend/node_modules/mssql');
(async () => {
  const pool = new mssql.ConnectionPool({
    server: '103.234.164.221', port: 1433, database: 'acs',
    user: 'sa', password: 'Admin@12345',
    options: { encrypt: false, trustServerCertificate: true },
  });
  await pool.connect();
  
  console.log('=== SHIFTS ===');
  const shifts = await pool.request().query('SELECT id, name, period_id, work_days FROM attendance_shifts');
  shifts.recordset.forEach(r => console.log('  id=' + r.id + ' name=' + r.name + ' period=' + r.period_id + ' days=' + r.work_days));

  console.log('\n=== SWIPES on May 2 ===');
  const swipes = await pool.request().query("SELECT TOP 5 userID, swipeTime FROM access_records WHERE swipeTime LIKE '2026-05-02%' ORDER BY swipeTime");
  swipes.recordset.forEach(r => console.log('  userID=' + r.userID + ' time=' + r.swipeTime));

  console.log('\n=== EMPLOYEE ===');
  const emps = await pool.request().query('SELECT id, name, person_id FROM employees');
  emps.recordset.forEach(r => console.log('  id=' + r.id + ' name=' + r.name + ' personId=' + r.person_id));

  // Test: does May 2 2026 map to a working day?
  console.log('\n=== DAY KEY for 2026-05-02 ===');
  const d = new Date('2026-05-02T00:00:00');
  console.log('  Day of week:', d.getDay(), '->', ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()]);

  await pool.close();
})();
