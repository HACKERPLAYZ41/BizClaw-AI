import cron from 'node-cron';
import { getUsers, getBusinessProfile, addGBPPost } from './database.js';
import { generateGooglePost } from './agents/google-agent.js';

/**
 * Scheduled Tasks Runner (node-cron)
 * Handles automated daily GBP posts drafting & periodic lead follow-up reminders.
 */

export function initScheduler() {
  console.log('[Scheduler] Initializing node-cron background task scheduler...');

  // 1. Daily Google Business Profile Post Draft (Runs every day at 09:00 AM)
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Running daily automated Google Business Profile post generator...');
    await runDailyGBPPostTask();
  });

  // 2. Periodic Lead Follow-up Queue (Runs every 12 hours)
  cron.schedule('0 */12 * * *', async () => {
    console.log('[Scheduler] Running periodic lead follow-up queue check...');
    // Lead queue processing tasks can be triggered here
  });

  console.log('[Scheduler] Background tasks scheduled successfully.');
}

/**
 * Daily GBP Post Draft Generator for Active Clients
 */
export async function runDailyGBPPostTask() {
  const users = getUsers().filter(u => u.role === 'client' && u.status === 'active');

  for (const user of users) {
    try {
      const profile = getBusinessProfile(user.username);
      if (!profile || !profile.name) continue;

      console.log(`[Scheduler] Generating daily Google post draft for: ${user.username} (${profile.name})`);

      const postContent = await generateGooglePost({
        businessName: profile.name,
        category: profile.category || 'Local Business',
        services: profile.services || 'Quality Local Services',
        targetKeywords: profile.keywords || 'near me',
        offerDetails: 'Special daily offer! Visit us today.',
        tone: 'engaging'
      });

      addGBPPost(user.username, {
        topic: `Daily Post (${new Date().toLocaleDateString()})`,
        content: postContent,
        status: 'Auto-Draft'
      });

      console.log(`[Scheduler] Successfully created daily GBP post draft for ${user.username}`);
    } catch (err) {
      console.error(`[Scheduler] Failed to generate daily post for ${user.username}:`, err.message);
    }
  }
}
