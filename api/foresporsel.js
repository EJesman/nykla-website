// Tar imot forespørsler fra kontaktskjemaet og sender dem til hei@nykla.no via Resend.
//
// Miljøvariabler i Vercel:
//   RESEND_API_KEY                      – påkrevd
//   KV_REST_API_URL / KV_REST_API_TOKEN – valgfritt (Upstash Redis fra Vercel Marketplace).
//     Gir felles teller på tvers av alle serverinstanser. Uten dem telles det per instans.
//
// Kostnadsvern: skjemaet kan aldri sende mer enn DAGLIG_MAKS e-poster per døgn,
// og hver IP-adresse maks PER_IP_MAKS i timen. Søppel stoppes før det når Resend.

const crypto = require('node:crypto');

const MOTTAKER = 'hei@nykla.no';
const AVSENDER = 'Skjema på Nykla.no <varsel@nykla.no>';
const MIN_FYLLTID_MS = 3000;
const MAKS_LENKER = 2;
const DAGLIG_MAKS = 25;
const PER_IP_MAKS = 3;
const PER_IP_VINDU_S = 3600;
const TILLATTE_OPPHAV = /^https:\/\/(www\.)?nykla\.no$|^https:\/\/[a-z0-9-]+\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enLinje = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const gyldigEpost = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

function les(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function valider({ navn, bedrift, epost, melding }) {
  const feil = {};
  if (navn.length < 2 || navn.length > 100) feil.navn = 'Skriv navnet ditt.';
  if (bedrift.length < 2 || bedrift.length > 120) feil.bedrift = 'Skriv hvilken bedrift du er fra.';
  if (!gyldigEpost(epost) || epost.length > 200) feil.epost = 'Skriv en gyldig e-postadresse.';
  if (melding.length < 10 || melding.length > 3000) feil.melding = 'Fortell kort hva dere trenger (minst 10 tegn).';
  else if ((melding.match(/https?:\/\/|www\./gi) || []).length > MAKS_LENKER) feil.melding = 'Meldingen har for mange lenker.';
  return feil;
}

// ---------- Tellere ----------

const osloDato = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const hashIp = (ip) => crypto.createHash('sha256').update('nykla-skjema:' + ip).digest('hex').slice(0, 24);

function klientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.headers['x-real-ip'] || '') || 'ukjent';
}

// Felles teller i Upstash Redis (REST, ingen avhengigheter). Returnerer ny verdi.
async function kvTell(nokkel, ttlSek) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', nokkel, '0', 'EX', String(ttlSek), 'NX'], ['INCR', nokkel]]),
  });
  if (!r.ok) throw new Error('KV ' + r.status);
  const svar = await r.json();
  const n = Number(svar?.[1]?.result);
  if (!Number.isFinite(n)) throw new Error('KV ugyldig svar');
  return n;
}

// Reserve når KV ikke er satt opp: teller per serverinstans.
const minne = new Map();
function minneTell(nokkel, ttlSek) {
  const naa = Date.now();
  const rad = minne.get(nokkel);
  if (!rad || rad.utloper < naa) { minne.set(nokkel, { n: 1, utloper: naa + ttlSek * 1000 }); return 1; }
  rad.n += 1;
  return rad.n;
}

const harKv = () =>
  Boolean((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
          (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN));

// Feiler telleren, sender vi ikke (heller en tapt e-post enn en ukontrollert regning).
async function tell(nokkel, ttlSek) {
  return harKv() ? kvTell(nokkel, ttlSek) : minneTell(nokkel, ttlSek);
}

// ---------- Handler ----------

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  // Bare innsendinger fra egne sider.
  const opphav = String(req.headers.origin || '');
  if (!TILLATTE_OPPHAV.test(opphav)) return res.status(403).json({ ok: false });

  const b = les(req);
  const felt = {
    navn: enLinje(b.navn || ''),
    bedrift: enLinje(b.bedrift || ''),
    epost: enLinje(b.epost || '').toLowerCase(),
    melding: String(b.melding || '').trim(),
  };

  // Roboter: skjult felt fylt ut, eller sendt inn urealistisk raskt.
  // Svar «ok» så de ikke lærer at de er avslørt, men send ingenting.
  if (b.nettside || !(Number(b.fylltid) >= MIN_FYLLTID_MS)) {
    return res.status(200).json({ ok: true });
  }

  const feil = valider(felt);
  if (Object.keys(feil).length) return res.status(400).json({ ok: false, feil });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[foresporsel] RESEND_API_KEY mangler');
    return res.status(500).json({ ok: false });
  }

  try {
    const perIp = await tell(`nykla:skjema:ip:${hashIp(klientIp(req))}`, PER_IP_VINDU_S);
    if (perIp > PER_IP_MAKS) return res.status(429).json({ ok: false, grunn: 'ip' });
    const iDag = await tell(`nykla:skjema:dag:${osloDato()}`, 2 * 86400);
    if (iDag > DAGLIG_MAKS) {
      if (iDag === DAGLIG_MAKS + 1) console.warn('[foresporsel] Dagsgrensen er nådd – skjemaet sender ikke flere i dag');
      return res.status(429).json({ ok: false, grunn: 'dag' });
    }
  } catch (err) {
    console.error('[foresporsel] Teller utilgjengelig, sender ikke', err);
    return res.status(503).json({ ok: false });
  }

  const html = `
    <p><strong>Skjema på Nykla.no</strong></p>
    <p><strong>Navn:</strong> ${esc(felt.navn)}<br>
       <strong>Bedrift:</strong> ${esc(felt.bedrift)}<br>
       <strong>E-post:</strong> ${esc(felt.epost)}</p>
    <p><strong>Hva trenger dere?</strong><br>${esc(felt.melding).replace(/\n/g, '<br>')}</p>
    <p style="color:#888">Svar direkte på denne e-posten for å svare ${esc(felt.navn)}.</p>`;
  const text =
    `Skjema på Nykla.no\n\nNavn: ${felt.navn}\nBedrift: ${felt.bedrift}\nE-post: ${felt.epost}\n\n` +
    `Hva trenger dere?\n${felt.melding}\n`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: AVSENDER,
        to: [MOTTAKER],
        reply_to: felt.epost,
        subject: `Forespørsel: ${felt.bedrift} (${felt.navn})`,
        html,
        text,
      }),
    });
    if (!r.ok) {
      console.error('[foresporsel] Resend svarte', r.status, await r.text());
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[foresporsel] Nettverksfeil mot Resend', err);
    return res.status(502).json({ ok: false });
  }
};
