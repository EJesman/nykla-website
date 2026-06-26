#!/usr/bin/env node
/**
 * Fetches aggregated view counts across TikTok, Instagram Reels and
 * Facebook Reels/videos and merges into rost-data.json.
 *
 * Runs daily via .github/workflows/update-social-stats.yml.
 *
 * Sources:
 *   Instagram   → Meta Graph API (gratis, never-expiring Page Token)
 *   Facebook    → Meta Graph API (gratis, samme Page Token)
 *   TikTok      → Apify (offisiell TikTok API krever app review)
 *
 * Env vars (alle som GitHub Secrets):
 *   META_PAGE_TOKEN     — Page Access Token (never expires)
 *   META_PAGE_ID        — Facebook Page ID
 *   META_IG_ACCOUNT_ID  — Instagram Business Account ID koblet til Page
 *   APIFY_TOKEN         — Apify Personal API Token
 *
 * On platform failure: keeps previous value, logs error, exits 0 så
 * YouTube-jobben ikke blokkeres av en flaky sosial fetch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;
const META_IG_ACCOUNT_ID = process.env.META_IG_ACCOUNT_ID;
const APIFY_TOKEN = process.env.APIFY_TOKEN;

const TIKTOK_USERNAME = 'roest.yt';
const GRAPH_API_VERSION = 'v21.0';
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // safety cap, ~1000 poster

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '..', 'rost-data.json');

async function getJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  return JSON.parse(text);
}

// ─── META GRAPH API ──────────────────────────────────────────────

async function* paginate(initialUrl) {
  let url = initialUrl;
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const d = await getJson(url);
    yield d.data || [];
    url = d.paging?.next || null;
  }
}

// For New Pages Experience trenger Facebook `/posts`-endpointen en
// Page-bundet access token, ikke en System User token direkte. Vi henter
// derfor Page-token fra /me/accounts hver kjøring (gratis API-call).
let _cachedPageToken = null;
async function getPageBoundToken() {
  if (_cachedPageToken) return _cachedPageToken;
  if (!META_PAGE_TOKEN || !META_PAGE_ID) {
    throw new Error('META_PAGE_TOKEN eller META_PAGE_ID mangler');
  }
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts` +
    `?fields=id,access_token&limit=50` +
    `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`;
  const d = await getJson(url);
  const page = (d.data || []).find((p) => String(p.id) === String(META_PAGE_ID));
  if (!page?.access_token) {
    throw new Error(
      `Fant ikke Page ${META_PAGE_ID} blant System User assets — sjekk at Pagen er assignet med Full access`
    );
  }
  _cachedPageToken = page.access_token;
  return _cachedPageToken;
}

async function fetchInstagram() {
  if (!META_PAGE_TOKEN || !META_IG_ACCOUNT_ID) {
    throw new Error('META_PAGE_TOKEN eller META_IG_ACCOUNT_ID mangler');
  }
  // Hent alle videoer/Reels med insights inline.
  // Meta deprecerte `plays` — bruker `views` nå (gjelder Reels og video-posts).
  const initialUrl =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_IG_ACCOUNT_ID}/media` +
    `?fields=id,media_type,media_product_type,insights.metric(views)` +
    `&limit=${PAGE_SIZE}` +
    `&access_token=${encodeURIComponent(META_PAGE_TOKEN)}`;

  let totalViews = 0;
  let posts = 0;
  for await (const batch of paginate(initialUrl)) {
    for (const item of batch) {
      if (item.media_type !== 'VIDEO') continue;
      const insights = item.insights?.data || [];
      const views = insights.find((i) => i.name === 'views');
      const value = views?.values?.[0]?.value || 0;
      if (value > 0) {
        totalViews += value;
        posts += 1;
      }
    }
  }
  return { views: totalViews, posts };
}

async function fetchFacebook() {
  // For Facebook MÅ vi bruke Page-bundet token (ikke System User direkte)
  const pageToken = await getPageBoundToken();

  // Hent fra både /video_reels (Reels) og /videos (vanlige videoer + tidligere
  // Reels før split). Bruker views-feltet direkte på video-objektet i stedet
  // for video_insights — krever bare pages_read_engagement, ikke read_insights.
  const sources = [
    `${META_PAGE_ID}/video_reels`,
    `${META_PAGE_ID}/videos`,
  ];

  const seenIds = new Set();
  let totalViews = 0;
  let posts = 0;

  for (const path of sources) {
    const initialUrl =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}` +
      `?fields=id,views,length` +
      `&limit=${PAGE_SIZE}` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    try {
      for await (const batch of paginate(initialUrl)) {
        for (const item of batch) {
          if (!item?.id || seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          const value = item.views || 0;
          if (value > 0) {
            totalViews += value;
            posts += 1;
          }
        }
      }
    } catch (e) {
      // /video_reels finnes ikke for alle Pages — bare hopp over
      console.error(`  (hopper over ${path}: ${e.message?.slice(0, 100)})`);
    }
  }
  return { views: totalViews, posts };
}

// ─── APIFY (TikTok kun) ──────────────────────────────────────────

async function runApifyActor(actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`Apify ${actorId} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchTikTok() {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN mangler');
  }
  const items = await runApifyActor('clockworks~tiktok-scraper', {
    profiles: [TIKTOK_USERNAME],
    resultsPerPage: 200,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });
  const views = items.reduce((sum, it) => {
    const v = it?.playCount || it?.viewCount || 0;
    return sum + (typeof v === 'number' ? v : 0);
  }, 0);
  return { views, posts: items.length };
}

// ─── MAIN ────────────────────────────────────────────────────────

async function loadExisting() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function main() {
  const existing = await loadExisting();

  // Sikkerhet: hvis fila ikke har YouTube-data (stats + videos), kan noe være
  // galt — fila kan være korrupt, tom eller midlertidig manglende. Vi nekter
  // å skrive videre fordi det vil overskrive med kun external_stats og wipe
  // alt YouTube-relatert. (Dette skjedde 2026-06-26 — fb984d8.)
  if (!existing || !existing.stats || !existing.videos || !Array.isArray(existing.videos)) {
    console.error('✗ ABORT: rost-data.json mangler stats/videos.');
    console.error('  Sjekker filinnhold:', JSON.stringify(existing).slice(0, 200));
    console.error('  Kjør update-rost-data.mjs (YouTube) først for å bygge baseline.');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const prev = existing.external_stats || {};
  const next = { ...prev };

  // PLATFORMS env var lar workflows kjøre kun et subset, f.eks.
  // PLATFORMS=instagram,facebook for Meta-only (hver 15. min)
  // PLATFORMS=tiktok for Apify-only (daglig)
  // Tomt = alle (lokal testing)
  const enabled = (process.env.PLATFORMS || 'instagram,facebook,tiktok')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allPlatforms = [
    ['instagram', fetchInstagram, 'Meta API'],
    ['facebook', fetchFacebook, 'Meta API'],
    ['tiktok', fetchTikTok, 'Apify'],
  ];
  const platforms = allPlatforms.filter(([name]) => enabled.includes(name));

  console.log(`Henter for: ${platforms.map(([n]) => n).join(', ')}\n`);

  const results = await Promise.allSettled(platforms.map(([, fn]) => fn()));

  results.forEach((res, i) => {
    const [name, , source] = platforms[i];
    if (res.status === 'fulfilled') {
      next[name] = { ...res.value, source, updated_at: now };
      console.log(`✓ ${name.padEnd(10)} ${res.value.views.toLocaleString('no').padStart(10)} visninger fra ${res.value.posts} poster (${source})`);
    } else {
      console.error(`✗ ${name.padEnd(10)} feilet — beholder forrige verdi`);
      console.error(`            ${res.reason?.message || res.reason}`);
    }
  });

  const total =
    (next.instagram?.views || 0) +
    (next.facebook?.views || 0) +
    (next.tiktok?.views || 0);

  next.total_views = total;
  next.updated_at = now;

  const output = { ...existing, external_stats: next };
  await fs.writeFile(DATA_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nTotal external views: ${total.toLocaleString('no')}`);
  console.log('Wrote', DATA_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
