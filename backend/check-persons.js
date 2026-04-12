/**
 * Quick diagnostic script to check persons.json state
 * Run: node check-persons.js
 */

const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'persons.json');

async function checkPersons() {
  console.log('🔍 Checking persons.json...\n');
  console.log(`📁 File path: ${dataPath}\n`);

  try {
    const data = await fs.readFile(dataPath, 'utf-8');
    
    console.log(`📄 File size: ${data.length} bytes`);
    console.log(`📄 File content (raw):`);
    console.log('─'.repeat(60));
    console.log(data);
    console.log('─'.repeat(60));
    
    if (!data || data.trim().length === 0) {
      console.log('\n⚠️  File is EMPTY');
      return;
    }

    const parsed = JSON.parse(data);
    const persons = parsed.persons || [];

    console.log(`\n📊 Total persons in database: ${persons.length}\n`);
    
    if (persons.length > 0) {
      console.log('👥 Persons:');
      persons.forEach((p, i) => {
        console.log(`  ${i + 1}. ID: "${p.personId}" | Name: "${p.name}" | Created: ${p.createdAt}`);
      });
    } else {
      console.log('⚠️  No persons in database (empty array)');
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('❌ File does NOT exist');
      console.log('💡 This is normal - it will be created automatically');
    } else if (error instanceof SyntaxError) {
      console.log('❌ File is CORRUPTED (invalid JSON)');
      console.log('💡 Fix: Delete the file or replace with {"persons": []}');
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

checkPersons();
