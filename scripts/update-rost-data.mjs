#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCqXBQZy_jJ-o8-xTaYiB12g';
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);
const VIDEO_REFRESH_HOURS = 23;
const MAX_VIDEOS = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '..', 'rost-data.json');

async function loadExisting() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function fetchStats() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}&key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Stats fetch failed: ${r.status} ${await r.text()}`);
  const d = await r.json();
  if (!d.items?.length) throw new Error('No channel found');
  const s = d.items[0].statistics;
  return {
    subscribers: parseInt(s.subscriberCount, 10) || 0,
    views: parseInt(s.viewCount, 10) || 0,
  };
}

async function fetchVideos() {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${UPLOADS_PLAYLIST_ID}&maxResults=${MAX_VIDEOS}&key=${API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Videos fetch failed: ${r.status} ${await r.text()}`);
  const d = await r.json();
  return (d.items || []).map((it) => {
    const sn = it.snippet;
    return {
      videoId: sn.resourceId.videoId,
      title: sn.title,
      publishedAt: sn.publishedAt,
      thumbnail:
        sn.thumbnails?.maxres?.url ||
        sn.thumbnails?.standard?.url ||
        sn.thumbnails?.high?.url ||
        sn.thumbnails?.medium?.url ||
        sn.thumbnails?.default?.url ||
        '',
    };
  });
}

async function main() {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY environment variable is not set');

  const existing = await loadExisting();
  const now = new Date();

  const stats = await fetchStats();

  let videos = existing?.videos;
  let videosUpdatedAt = existing?.videos_updated_at;
  const ageHours = videosUpdatedAt
    ? (now - new Date(videosUpdatedAt)) / (1000 * 60 * 60)
    : Infinity;

  if (!videos || videos.length === 0 || ageHours >= VIDEO_REFRESH_HOURS) {
    videos = await fetchVideos();
    videosUpdatedAt = now.toISOString();
  }

  const output = {
    stats,
    videos,
    stats_updated_at: now.toISOString(),
    videos_updated_at: videosUpdatedAt,
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log('Wrote', DATA_FILE);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
