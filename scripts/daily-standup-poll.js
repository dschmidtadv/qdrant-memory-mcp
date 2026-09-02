#!/usr/bin/env node

/**
 * Daily Standup Poll for Slack
 * Sends a poll at 9 AM asking about yesterday's work, today's plans, and blockers.
 */

const { WebClient } = require('@slack/web-api');
const schedule = require('node-schedule');

// Initialize Slack client with token from environment variable
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C0000000000'; // Replace with your channel ID
const POLL_TIME = '0 9 * * 1-5'; // 9 AM, Monday-Friday (cron format)

/**
 * Create and send the daily standup poll
 */
async function sendStandupPoll() {
  try {
    console.log(`[${new Date().toISOString()}] Sending standup poll...`);

    const message = {
      channel: CHANNEL_ID,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🌅 *Daily Standup*\n\nPlease take a moment to share:',
          },
        },
        {
          type: 'section',
          block_id: 'standup_section',
          text: {
            type: 'mrkdwn',
            text: '*1. What did you work on yesterday?*\n*2. What will you work on today?*\n*3. Are there any blockers?*',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Share Update',
                emoji: true,
              },
              action_id: 'standup_share_button',
              value: 'click_me_123',
              style: 'primary',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Poll sent at ${new Date().toLocaleTimeString()}`,
            },
          ],
        },
      ],
    };

    // Send the message
    const result = await slack.chat.postMessage(message);
    console.log(`✅ Poll sent successfully. Message TS: ${result.ts}`);

    // Optional: Open a modal for detailed input
    return result;
  } catch (error) {
    console.error('❌ Error sending standup poll:', error);
    throw error;
  }
}

/**
 * Handle button click and open modal for standup input
 */
async function handleStandupInput(body) {
  try {
    const userId = body.user.id;
    const triggerId = body.trigger_id;

    const modal = {
      type: 'modal',
      callback_id: 'standup_submission',
      title: {
        type: 'plain_text',
        text: 'Daily Standup',
      },
      submit: {
        type: 'plain_text',
        text: 'Submit',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'yesterday_block',
          label: {
            type: 'plain_text',
            text: 'What did you work on yesterday?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'yesterday_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Share your work from yesterday...',
            },
          },
        },
        {
          type: 'input',
          block_id: 'today_block',
          label: {
            type: 'plain_text',
            text: 'What will you work on today?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'today_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Share your plans for today...',
            },
          },
        },
        {
          type: 'input',
          block_id: 'blockers_block',
          label: {
            type: 'plain_text',
            text: 'Are there any blockers?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'blockers_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'List any blockers or dependencies...',
            },
          },
          optional: true,
        },
      ],
    };

    await slack.views.open({
      trigger_id: triggerId,
      view: modal,
    });

    console.log(`✅ Modal opened for user ${userId}`);
  } catch (error) {
    console.error('❌ Error opening modal:', error);
  }
}

/**
 * Handle modal submission
 */
async function handleModalSubmission(body) {
  try {
    const userId = body.user.id;
    const values = body.view.state.values;

    const yesterday = values.yesterday_block.yesterday_input.value;
    const today = values.today_block.today_input.value;
    const blockers = values.blockers_block.blockers_input.value || 'None';

    // Post the standup update to the channel
    const message = {
      channel: CHANNEL_ID,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Standup from <@${userId}>*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Yesterday:*\n${yesterday}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Today:*\n${today}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Blockers:*\n${blockers}`,
          },
        },
        {
          type: 'divider',
        },
      ],
    };

    await slack.chat.postMessage(message);
    console.log(`✅ Standup submitted from user ${userId}`);
  } catch (error) {
    console.error('❌ Error handling modal submission:', error);
  }
}

/**
 * Schedule the poll to run at 9 AM on weekdays
 */
function scheduleStandupPoll() {
  console.log(`📅 Scheduling standup poll for ${POLL_TIME} (9 AM, Mon-Fri)`);

  schedule.scheduleJob(POLL_TIME, async () => {
    try {
      await sendStandupPoll();
    } catch (error) {
      console.error('Failed to send scheduled poll:', error);
    }
  });

  // Keep the process running
  console.log('⏰ Scheduler active. Waiting for 9 AM...');
}

/**
 * Main entry point
 */
async function main() {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('❌ Error: SLACK_BOT_TOKEN environment variable not set');
    process.exit(1);
  }

  if (!process.env.SLACK_CHANNEL_ID) {
    console.error('⚠️  Warning: SLACK_CHANNEL_ID not set. Using default channel.');
  }

  // For immediate testing, check if --test flag is provided
  if (process.argv.includes('--test')) {
    console.log('🧪 Running in test mode - sending poll now...');
    await sendStandupPoll();
    process.exit(0);
  }

  // Schedule the recurring poll
  scheduleStandupPoll();

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
  });
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
