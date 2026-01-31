#!/usr/bin/env node
require('dotenv').config();

// fetch is a built-in global in Node.js 20+

async function notifySlack(message) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `:goat: ${message}` }),
    });
  } catch (err) {
    console.error('Failed to post Slack alert:', err.message);
  }
}

async function main() {
  const url = process.env.HEALTH_URL || 'http://localhost:3000/health';
  const res = await fetch(url);
  if (!res.ok) {
    const message = `Health endpoint returned ${res.status}`;
    await notifySlack(message);
    throw new Error(message);
  }
  const body = await res.json();
  // Frontend checks for "scream" in status, so accept any status containing "scream"
  const statusText = (body.status || '').toLowerCase();
  if (!statusText.includes('scream')) {
    const message = `Unexpected status: ${body.status}`;
    await notifySlack(message);
    throw new Error(message);
  }
  const requireDb = process.env.HEALTH_REQUIRE_DB === 'true';
  if (requireDb && body.db && body.db.connected === false) {
    const message = 'Database disconnected';
    await notifySlack(message);
    throw new Error(message);
  }
  if (
    body.submissions &&
    typeof body.submissions.pending === 'number' &&
    body.submissions.pending > (process.env.HEALTH_PENDING_THRESHOLD || 100)
  ) {
    const message = `Pending submissions exceed threshold: ${body.submissions.pending}`;
    await notifySlack(message);
    throw new Error(message);
  }
  console.log(`[OK] ${url} at ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('[ALERT]', err.message);
  process.exit(1);
});
