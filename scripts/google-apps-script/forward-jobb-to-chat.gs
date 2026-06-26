/**
 * Forwards new emails sent to jobb@nykla.no to a Google Chat space
 * via incoming webhook. Runs every 5 minutes.
 *
 * SECURITY: WEBHOOK_URL inneholder API-nøkler. Den ekte URL-en bor kun
 * i Google Apps Script-editoren — ALDRI commit den til Git (repo er public).
 *
 * Setup (engangsjobb):
 *   1. Lag space i Google Chat → Apps & integrations → Webhooks → Add webhook
 *   2. Kopier webhook URL (inneholder key + token)
 *   3. Gå til https://script.google.com → "New project"
 *   4. Slett standard kode → lim inn dette skriptet
 *   5. Bytt ut WEBHOOK_URL nedenfor med den faktiske URL-en fra steg 2
 *   6. Gi prosjektet et navn (f.eks. "Nykla — Jobb til Chat")
 *   7. Lagre (Cmd+S)
 *   8. Kjør funksjonen `checkInbox` manuelt én gang (▶ Run)
 *      → Authorize → "Advanced" → "Go to project (unsafe)" → Allow
 *   9. Triggers (klokken-ikonet) → "Add Trigger":
 *        function: checkInbox
 *        event source: Time-driven
 *        type: Minutes timer
 *        interval: Every 5 minutes
 *      Save
 *
 * Klart. Hver gang noen sender e-post til jobb@nykla.no, dukker den opp
 * i Chat-spacen innen 5 minutter.
 */

// PASTE_WEBHOOK_URL_HERE — bytt ut med faktisk URL i Apps Script-editoren.
// Skal ALDRI committes med ekte nøkler.
const WEBHOOK_URL = 'PASTE_YOUR_GOOGLE_CHAT_WEBHOOK_URL_HERE';
const TARGET_EMAIL = 'jobb@nykla.no';
const LABEL_NAME = 'Sent-to-chat';
const MAX_BODY_CHARS = 3500;

function checkInbox() {
  const query = `to:${TARGET_EMAIL} is:unread newer_than:7d -label:${LABEL_NAME}`;
  const threads = GmailApp.search(query);

  if (threads.length === 0) {
    console.log('Ingen nye søknader.');
    return;
  }

  let label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) label = GmailApp.createLabel(LABEL_NAME);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(msg => {
      if (!msg.isUnread()) return;
      try {
        sendToChat(msg);
        msg.markRead();
      } catch (e) {
        console.error('Klarte ikke sende til Chat:', e);
      }
    });
    label.addToThread(thread);
  });

  console.log(`Sendte ${threads.length} tråd(er) til Chat.`);
}

function sendToChat(msg) {
  const from = msg.getFrom();
  const subject = msg.getSubject();
  const date = msg.getDate();
  let body = msg.getPlainBody().trim();

  if (body.length > MAX_BODY_CHARS) {
    body = body.slice(0, MAX_BODY_CHARS) + '\n…\n(meldingen er forkortet — åpne Gmail for resten)';
  }

  const attachments = msg.getAttachments();
  const attachmentLine = attachments.length > 0
    ? `\n📎 *Vedlegg (${attachments.length}):* ${attachments.map(a => a.getName()).join(', ')}`
    : '';

  const dateStr = Utilities.formatDate(date, 'Europe/Oslo', 'dd.MM.yyyy HH:mm');

  const text =
    `*📩 Ny jobbsøknad*\n` +
    `*Emne:* ${subject}\n` +
    `*Fra:* ${from}\n` +
    `*Mottatt:* ${dateStr}` +
    attachmentLine +
    `\n\n` +
    body +
    `\n\n` +
    `_Åpne i Gmail for å svare eller laste ned vedlegg._`;

  const response = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(`Webhook ${response.getResponseCode()}: ${response.getContentText()}`);
  }
}
