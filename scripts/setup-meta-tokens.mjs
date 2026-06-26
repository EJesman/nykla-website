#!/usr/bin/env node
/**
 * One-time setup script: converts a short-lived Meta User Access Token
 * into a never-expiring Page Access Token, and prints the Page ID and
 * connected Instagram Business Account ID.
 *
 * Run locally (start linje med space for å unngå zsh-history):
 *    META_APP_ID="..." META_APP_SECRET="..." META_USER_TOKEN="..." \
 *      node scripts/setup-meta-tokens.mjs
 *
 * Etter kjøring: lagre disse som GitHub repo Secrets:
 *   META_PAGE_TOKEN
 *   META_PAGE_ID
 *   META_IG_ACCOUNT_ID
 *
 * Page Access Tokens generert på denne måten utløper ALDRI så lenge:
 *  - Facebook-passordet ikke endres
 *  - Appen ikke fjernes
 *  - Permissions ikke revokeres
 */

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const USER_TOKEN = process.env.META_USER_TOKEN;
const API_VERSION = 'v21.0';

if (!APP_ID || !APP_SECRET || !USER_TOKEN) {
  console.error('Mangler env vars. Kjør slik:');
  console.error('  META_APP_ID="..." META_APP_SECRET="..." META_USER_TOKEN="..." node scripts/setup-meta-tokens.mjs');
  console.error('  (start linja med et mellomrom så zsh ikke lagrer den i historien)');
  process.exit(1);
}

async function getJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  return JSON.parse(text);
}

async function exchangeForLongLivedToken() {
  console.log('1/2  Bytter kortvarig user token mot langvarig (60 dager) …');
  const url =
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(APP_ID)}` +
    `&client_secret=${encodeURIComponent(APP_SECRET)}` +
    `&fb_exchange_token=${encodeURIComponent(USER_TOKEN)}`;
  const d = await getJson(url);
  if (!d.access_token) throw new Error('Fikk ikke long-lived token: ' + JSON.stringify(d));
  return d.access_token;
}

async function listPages(longLivedUserToken) {
  const url =
    `https://graph.facebook.com/${API_VERSION}/me/accounts` +
    `?fields=id,name,access_token,instagram_business_account{id,username}` +
    `&access_token=${encodeURIComponent(longLivedUserToken)}`;
  const d = await getJson(url);
  return d.data || [];
}

async function fetchSpecificPage(longLivedUserToken, pageId) {
  const url =
    `https://graph.facebook.com/${API_VERSION}/${pageId}` +
    `?fields=id,name,access_token,instagram_business_account{id,username}` +
    `&access_token=${encodeURIComponent(longLivedUserToken)}`;
  return getJson(url);
}

async function main() {
  try {
    const longUserToken = await exchangeForLongLivedToken();
    const explicitPageId = process.env.META_PAGE_ID;

    let pages;
    if (explicitPageId) {
      console.log(`2/2  Henter Page ${explicitPageId} direkte (Business-eid Page) …\n`);
      const p = await fetchSpecificPage(longUserToken, explicitPageId);
      pages = [p];
    } else {
      console.log('2/2  Henter sider du administrerer …\n');
      pages = await listPages(longUserToken);
    }

    if (pages.length === 0) {
      console.error('Ingen sider funnet. Hvis Pagen eies av en Business Portfolio:');
      console.error('  Kjør på nytt med META_PAGE_ID=<page-id> som ekstra env var.');
      process.exit(1);
    }

    console.log(`Fant ${pages.length} side(r):\n`);
    pages.forEach((p, i) => {
      const ig = p.instagram_business_account;
      console.log(`  [${i + 1}] ${p.name}`);
      console.log(`      Page ID            : ${p.id}`);
      console.log(`      Page Access Token  : ${p.access_token}`);
      console.log(`      IG Business Account: ${ig ? `${ig.id}  (@${ig.username})` : '⚠ IKKE TILKOBLET'}`);
      console.log();
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log(' Neste steg');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Velg raden over som tilhører RØST. Legg disse som GitHub Secrets');
    console.log('(repo → Settings → Secrets and variables → Actions → New secret):');
    console.log();
    console.log('  META_PAGE_TOKEN     = Page Access Token');
    console.log('  META_PAGE_ID        = Page ID');
    console.log('  META_IG_ACCOUNT_ID  = IG Business Account ID');
    console.log();
    console.log('Disse tokens utløper ikke. Setup er engangsjobb.');
  } catch (e) {
    console.error('Feil:', e.message);
    process.exit(1);
  }
}

main();
