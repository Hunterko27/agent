// Stock Opportunity Agent
// Pulls your watchlist + scan list from the Confluence scanner app,
// checks each symbol's opportunity score, and posts a Discord alert
// for anything at or above the threshold.

const APP_BASE = 'https://stockscanner123.netlify.app';
const SCORE_THRESHOLD = 80;
const DELAY_BETWEEN_CALLS_MS = 1500; // be gentle on the free-tier data API

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLists() {
  const res = await fetch(`${APP_BASE}/api/lists`);
  if (!res.ok) throw new Error(`Failed to fetch lists: ${res.status}`);
  const data = await res.json();
  const combined = new Set([...(data.watchlist || []), ...(data.scanlist || [])]);
  return [...combined];
}

async function scanSymbol(symbol) {
  const res = await fetch(`${APP_BASE}/api/scan?symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json();
  if (!res.ok) {
    console.warn(`  ! ${symbol}: ${data.error || res.status}`);
    return null;
  }
  return data;
}

async function postToDiscord(hits) {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('No DISCORD_WEBHOOK_URL set — skipping notification. Results:', hits);
    return;
  }

  const lines = hits
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((h) => `**${h.symbol}** — score **${h.overallScore}** (${h.overallLabel})`);

  const body = {
    content: `🚀 **Golden Opportunity Alert** (score ≥ ${SCORE_THRESHOLD})\n\n${lines.join('\n')}`,
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
}

async function main() {
  console.log(`Run started: ${new Date().toISOString()}`);

  const symbols = await fetchLists();
  console.log(`Checking ${symbols.length} symbols: ${symbols.join(', ')}`);

  const hits = [];

  for (const symbol of symbols) {
    const result = await scanSymbol(symbol);
    if (result && typeof result.overallScore === 'number') {
      console.log(`  ${symbol}: score ${result.overallScore} (${result.overallLabel})`);
      if (result.overallScore >= SCORE_THRESHOLD) {
        hits.push(result);
      }
    }
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  if (hits.length > 0) {
    console.log(`Found ${hits.length} hit(s) — sending Discord alert.`);
    await postToDiscord(hits);
  } else {
    console.log('No symbols hit the threshold this run.');
  }
}

main().catch((err) => {
  console.error('Agent run failed:', err);
  process.exit(1);
});
