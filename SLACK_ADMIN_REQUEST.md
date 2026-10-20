# Request Email for Slack Admin

Copy and send this email to your Slack workspace admin to request workflow creation permissions.

---

**Subject: Request for Workflow Builder Access — Daily Standup Bot**

Dear [Admin Name],

I'm reaching out to request permission to create a Slack Workflow for our team's daily standup process.

**What I need:** Access to Slack's Workflow Builder feature to create an automated poll that sends at 9 AM each weekday, asking team members about:
- What they worked on yesterday
- What they plan to work on today
- Any blockers they're facing

**Why:** This will streamline our standup process, ensure consistent participation, and create a record of team activities for project tracking.

**Scope:** This workflow will:
- Send a scheduled message to a single team channel (#engineering-standup or similar)
- Collect responses via a simple poll/button interface
- No integration with external systems (entirely within Slack)
- No data export or third-party access

**Impact:** Low risk, internal-only, improves team communication efficiency.

Would it be possible to grant me access to create this workflow? If there are security or organizational concerns, I'm happy to discuss alternatives (such as a custom Slack bot or AWS Lambda integration).

Thank you for considering this request.

Best regards,
[Your Name]

---

## Alternative: If Admin Won't Grant Workflow Access

If your admin denies workflow access but approves custom apps, use **Option 1 (Bot Token)** or **Option 2 (AWS Lambda)** from the setup guide instead. Both are secure alternatives that don't require workflow builder.

Here's a follow-up message you can send:

---

**Subject: Alternative Approach — Custom Slack Bot Instead**

Hi [Admin Name],

If workflow creation isn't possible, I can implement the daily standup poll using a **custom Slack bot** instead, which I believe may align better with your security policies:

**The bot approach:**
- Uses Slack's standard OAuth authentication (no additional integrations)
- Sends messages only to the designated channel
- No data leaves Slack
- Runs on [our infrastructure / AWS Lambda]
- Audit trail via Slack's message history
- Can be audited and revoked at any time

Would this approach be acceptable? If so, I can proceed with setup immediately.

Thanks!
