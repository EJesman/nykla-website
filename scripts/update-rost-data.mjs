#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCqXBQZy_jJ-o8-xTaYiB12g';
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);
const VIDEO_REFRESH_HOURS = 23;
const MAX_VIDEOS_FETCH = 20;
const MAX_VIDEOS_DISPLAY = 3;
const MIN_VIDEO_DURATION_SECONDS = 180; // Filter ut YouTube Shorts (≤ 3 min)

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

function parseISO8601Duration(iso) {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (
    parseInt(m[1] || '0', 10) * 3600 +
    parseInt(m[2] || '0', 10) * 60 +
    parseInt(m[3] || '0', 10)
  );
}

async function fetchVideos() {
  const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${UPLOADS_PLAYLIST_ID}&maxResults=${MAX_VIDEOS_FETCH}&key=${API_KEY}`;
  const r = await fetch(playlistUrl);
  if (!r.ok) throw new Error(`Playlist fetch failed: ${r.status} ${await r.text()}`);
  const d = await r.json();
  const items = d.items || [];
  if (items.length === 0) return [];

  const ids = items.map((it) => it.snippet.resourceId.videoId).join(',');
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${API_KEY}`;
  const dr = await fetch(detailsUrl);
  if (!dr.ok) throw new Error(`Video details fetch failed: ${dr.status} ${await dr.text()}`);
  const dd = await dr.json();
  const durationMap = {};
  for (const v of dd.items || []) {
    durationMap[v.id] = parseISO8601Duration(v.contentDetails.duration);
  }

  return items
    .filter(
      (it) =>
        (durationMap[it.snippet.resourceId.videoId] || 0) >=
        MIN_VIDEO_DURATION_SECONDS
    )
    .slice(0, MAX_VIDEOS_DISPLAY)
    .map((it) => {
      const sn = it.snippet;
      const id = sn.resourceId.videoId;
      return {
        videoId: id,
        title: sn.title,
        publishedAt: sn.publishedAt,
        durationSeconds: durationMap[id] || 0,
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
