/**
 * Migration script: Build user cache from existing access events
 * This extracts userId -> userName mappings from historical events
 */

const fs = require('fs').promises;
const path = require('path');

const EVENTS_PATH = path.join(__dirname, 'data', 'access-events.json');
const USER_CACHE_PATH = path.join(__dirname, 'data', 'user-cache.json');

async function buildUserCache() {
  try {
    console.log('📖 Loading access events...');
    const eventsData = await fs.readFile(EVENTS_PATH, 'utf-8');
    const parsed = JSON.parse(eventsData);
    const events = parsed.events || [];

    console.log(`✅ Found ${events.length} total events`);

    const userCache = {};

    for (const event of events) {
      const data = event.data;
      
      // Parse rawJson to extract CardName
      let rawJsonData = {};
      if (data.rawJson) {
        try {
          rawJsonData = JSON.parse(data.rawJson);
        } catch (e) {
          // Ignore if rawJson is invalid
        }
      }

      // Get userId and userName
      const userId = data.userId || rawJsonData.UserID || '';
      const userName = data.cardName || rawJsonData.CardName || '';

      // Cache if both present
      if (userId && userName && userName.trim()) {
        if (!userCache[userId]) {
          userCache[userId] = userName;
          console.log(`📝 Cached: ${userId} -> ${userName}`);
        }
      }
    }

    console.log(`\n✅ Built user cache with ${Object.keys(userCache).length} users`);

    // Save to file
    await fs.writeFile(USER_CACHE_PATH, JSON.stringify(userCache, null, 2), 'utf-8');
    console.log(`💾 Saved user cache to ${USER_CACHE_PATH}`);

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
buildUserCache();
