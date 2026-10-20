# Daily Standup Poll Setup Guide

## Prerequisites
- Slack workspace access
- Ability to create custom apps in your workspace
- Either Node.js locally OR AWS account

---

## Option 1: Node.js Bot (Run Locally or on Any Server)

### Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name: `Daily Standup Bot`
4. Select your workspace
5. Click **"Create App"**

### Step 2: Configure Bot Permissions

1. In your app, go to **"OAuth & Permissions"** (left sidebar)
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Click **"Add an OAuth Scope"** and add these scopes:
   - `chat:write` — Send messages to channels
   - `commands:write` — Handle slash commands
   - `views:open` — Open modal dialogs
   - `views:update` — Update modal content

4. Scroll up and click **"Install to Workspace"**
5. Review permissions and click **"Allow"**

### Step 3: Copy Your Bot Token

1. You'll see **"Bot User OAuth Token"** at the top
2. Copy it (starts with `xoxb-`)
3. Store it securely (never commit to git)

### Step 4: Find Your Channel ID

1. In Slack, right-click the channel where you want polls
2. Click **"View channel details"**
3. Copy the **Channel ID** from the top (e.g., `C0123456789`)

### Step 5: Set Environment Variables

```bash
# Add to your shell profile (~/.zshrc, ~/.bash_profile, etc.)
export SLACK_BOT_TOKEN="xoxb-YOUR-TOKEN-HERE"
export SLACK_CHANNEL_ID="C0123456789"
```

Reload your shell:
```bash
source ~/.zshrc
```

### Step 6: Install Dependencies

```bash
cd /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
npm install @slack/web-api node-schedule
```

### Step 7: Test the Bot

```bash
node scripts/daily-standup-poll.js --test
```

You should see a poll message appear in your Slack channel.

### Step 8: Schedule to Run at 9 AM

#### **Option A: macOS (launchd)**

Create a LaunchAgent plist file:

```bash
cat > ~/Library/LaunchAgents/com.standup.daily.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.standup.daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/scripts/daily-standup-poll.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>1</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>2</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>3</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>4</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>5</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/tmp/standup-poll.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/standup-poll-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SLACK_BOT_TOKEN</key>
        <string>xoxb-YOUR-TOKEN-HERE</string>
        <key>SLACK_CHANNEL_ID</key>
        <string>C0123456789</string>
    </dict>
</dict>
</plist>
EOF
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.standup.daily.plist
```

Check status:
```bash
launchctl list | grep standup
```

View logs:
```bash
tail -f /tmp/standup-poll.log
```

#### **Option B: Keep Running in tmux/screen**

```bash
tmux new-session -d -s standup "node /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp/scripts/daily-standup-poll.js"
```

---

## Option 2: AWS Lambda + CloudWatch Events

### Prerequisites
- AWS account with Lambda and CloudWatch permissions
- AWS CLI configured locally

### Step 1-4: Same as Option 1 (Create Slack App, get Bot Token & Channel ID)

### Step 5: Create Lambda Function

```bash
# Create deployment package
cd /Users/dietrichgottfriedschmidt/apps/qdrant-memory-mcp
mkdir lambda-deployment
cp scripts/daily-standup-poll.js lambda-deployment/index.js

# Add minimal wrapper for Lambda
cat > lambda-deployment/lambda-handler.js << 'EOF'
const { WebClient } = require('@slack/web-api');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

async function sendPoll() {
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
          },
        ],
      },
    ],
  };

  return await slack.chat.postMessage(message);
}

exports.handler = async (event) => {
  try {
    const result = await sendPoll();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Poll sent', ts: result.ts }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
EOF

# Install dependencies
cd lambda-deployment
npm init -y
npm install @slack/web-api

# Create ZIP for upload
zip -r lambda-function.zip .
```

### Step 6: Deploy to AWS Lambda

```bash
# Create IAM role (one-time)
aws iam create-role \
  --role-name lambda-standup-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Create Lambda function
aws lambda create-function \
  --function-name daily-standup-poll \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR-ACCOUNT-ID:role/lambda-standup-role \
  --handler lambda-handler.handler \
  --zip-file fileb://lambda-deployment/lambda-function.zip \
  --timeout 30 \
  --environment Variables="{SLACK_BOT_TOKEN=xoxb-YOUR-TOKEN,SLACK_CHANNEL_ID=C0123456789}"
```

### Step 7: Create CloudWatch Rule (9 AM Weekdays)

```bash
# Create EventBridge rule
aws events put-rule \
  --name daily-standup-rule \
  --schedule-expression "cron(0 9 ? * MON-FRI *)" \
  --state ENABLED

# Add Lambda as target
aws events put-targets \
  --rule daily-standup-rule \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:YOUR-ACCOUNT-ID:function:daily-standup-poll"

# Grant CloudWatch permission to invoke Lambda
aws lambda add-permission \
  --function-name daily-standup-poll \
  --statement-id AllowCloudWatchInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:YOUR-ACCOUNT-ID:rule/daily-standup-rule
```

Replace `YOUR-ACCOUNT-ID` and region as needed.

---

## Troubleshooting

### Poll not appearing in Slack?
1. Check bot token is correct: `echo $SLACK_BOT_TOKEN`
2. Check channel ID is correct: Right-click channel → "View channel details"
3. Verify bot is in the channel (Slack channel → Add apps → find your bot)
4. Check logs: `tail -f /tmp/standup-poll*.log` (local) or CloudWatch Logs (Lambda)

### "Not authorized" error?
- Regenerate bot token in app settings
- Verify all required scopes are added

### Scheduled job not running?
- Local: `launchctl list | grep standup`
- AWS: Check CloudWatch Logs for Lambda errors

---

## Next Steps

1. Choose **Option 1** (local) or **Option 2** (AWS Lambda)
2. Follow the steps above
3. Test with `--test` flag (local only)
4. Verify the poll appears in Slack at 9 AM on a weekday
