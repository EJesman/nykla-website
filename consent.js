/* Samtykke og PostHog for alle sider. Endres her, ikke i hver HTML-fil. */
(function(){
  var style = document.createElement('style');
  style.textContent = `/* ════════════════════════════════════
   COOKIE CONSENT MODAL
   (centered, dimmed backdrop, Nykla-styled)
════════════════════════════════════ */
.cookie-modal{
  position:fixed;inset:0;
  z-index:9000;
  display:none;
  align-items:center;justify-content:center;
  padding:1.5rem;
  background:rgba(8,8,8,0.55);
  -webkit-backdrop-filter:blur(6px);
  backdrop-filter:blur(6px);
  opacity:0;
  transition:opacity .35s cubic-bezier(0.16,1,0.3,1);
}
.cookie-modal.visible{
  display:flex;
}
.cookie-modal.visible.in{
  opacity:1;
}
.cookie-modal-card{
  background:var(--white);
  border-radius:14px;
  padding:2rem 2rem 1.6rem;
  max-width:480px;width:100%;
  box-shadow:0 30px 70px -10px rgba(0,0,0,0.4), 0 8px 22px -8px rgba(0,0,0,0.25);
  transform:translateY(14px) scale(0.97);
  transition:transform .4s cubic-bezier(0.16,1,0.3,1);
}
.cookie-modal.in .cookie-modal-card{
  transform:translateY(0) scale(1);
}
.cookie-modal-label{
  display:inline-flex;align-items:center;gap:0.6rem;
  font-family:'Space Mono',monospace;
  font-size:0.55rem;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--gray);
  margin-bottom:1rem;
}
.cookie-modal-label::before{
  content:'';width:24px;height:1px;background:var(--orange);
}
.cookie-modal-title{
  font-family:'Bebas Neue',sans-serif;
  font-size:1.9rem;letter-spacing:0.02em;
  line-height:1;
  color:var(--black);
  margin-bottom:1rem;
}
.cookie-modal-title .o{color:var(--orange)}
.cookie-modal-body{
  font-family:'DM Sans',sans-serif;
  font-size:0.95rem;line-height:1.6;
  color:var(--black);
  opacity:0.78;
  margin-bottom:1.6rem;
}
.cookie-modal-actions{
  display:flex;gap:0.7rem;
  margin-bottom:0.8rem;
}
.cookie-btn{
  flex:1;
  display:inline-flex;align-items:center;justify-content:center;
  font-family:'Space Mono',monospace;
  font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;
  padding:0.95rem 1rem;
  border-radius:999px;
  cursor:pointer;
  transition:background .25s, color .25s, border-color .25s, transform .15s;
  border:1px solid var(--black);
}
.cookie-btn-decline{
  background:transparent;
  color:var(--black);
}
.cookie-btn-decline:hover{
  background:rgba(0,0,0,0.05);
}
.cookie-btn-accept{
  background:var(--black);
  color:var(--white);
}
.cookie-btn-accept:hover{
  background:var(--orange);
  border-color:var(--orange);
  color:var(--black);
}
.cookie-btn:active{transform:translateY(1px)}
.cookie-modal-info{
  display:block;
  font-family:'Space Mono',monospace;
  font-size:0.55rem;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--gray);
  text-align:center;
  margin-top:0.3rem;
  cursor:pointer;
  transition:color .2s;
}
.cookie-modal-info:hover{color:var(--orange)}
.cookie-modal-details{
  display:none;
  font-family:'DM Sans',sans-serif;
  font-size:0.82rem;line-height:1.55;
  color:var(--gray);
  margin-top:1.2rem;
  padding-top:1.2rem;
  border-top:1px solid rgba(0,0,0,0.08);
}
.cookie-modal-details.open{display:block}
.cookie-modal-details ul{
  list-style:none;padding:0;margin:0.6rem 0 0;
}
.cookie-modal-details li{
  padding:0.3rem 0 0.3rem 1rem;
  position:relative;
}
.cookie-modal-details li::before{
  content:'+';position:absolute;left:0;
  color:var(--orange);font-weight:700;
}
@media(max-width:560px){
  .cookie-modal-card{padding:1.6rem 1.4rem 1.2rem}
  .cookie-modal-title{font-size:1.6rem}
  .cookie-modal-body{font-size:0.9rem}
  .cookie-modal-actions{flex-direction:column-reverse;gap:0.5rem}
  .cookie-btn{padding:0.95rem 1.2rem}
}`;
  document.head.appendChild(style);

  var holder = document.createElement('div');
  holder.innerHTML = `<div class="cookie-modal" id="cookie-modal" aria-hidden="true" role="dialog" aria-labelledby="cookie-title" aria-describedby="cookie-body">
  <div class="cookie-modal-card">
    <div class="cookie-modal-label">Personvern</div>
    <p class="cookie-modal-title" id="cookie-title">Cookies &amp; analyse<span class="o">.</span></p>
    <p class="cookie-modal-body" id="cookie-body">
      Vi bruker analyse for å forstå hvordan siden brukes — hvilke seksjoner som engasjerer og hva vi kan forbedre. Dataene deles ikke med tredjeparter til markedsføring. Du kan avslå uten at det påvirker bruken av siden.
    </p>
    <div class="cookie-modal-actions">
      <button class="cookie-btn cookie-btn-decline" id="cookie-decline" type="button">Avslå</button>
      <button class="cookie-btn cookie-btn-accept" id="cookie-accept" type="button">Godta</button>
    </div>
    <button class="cookie-modal-info" id="cookie-info-toggle" type="button">Hva samler vi inn?</button>
    <div class="cookie-modal-details" id="cookie-modal-details">
      Vi bruker PostHog for å registrere:
      <ul>
        <li>Sidevisninger og hvilke sider du besøker</li>
        <li>Klikk og scroll-atferd (heatmaps)</li>
        <li>Hvor du kommer fra (referrer)</li>
        <li>Enhet og nettleser-type</li>
        <li>Hvor raskt siden laster</li>
        <li>Anonymiserte opptak av besøket, der skjemafelt er skjult</li>
      </ul>
      IP-adressen din anonymiseres. Vi selger ikke data videre.
    </div>
  </div>
</div>`;
  var modalEl = holder.firstElementChild;
  document.body.appendChild(modalEl);

  // Egen markør på forsiden og RØST: gi knappene samme hover-effekt som resten
  modalEl.querySelectorAll('button').forEach(function(el){
    el.addEventListener('mouseenter', function(){ document.body.classList.add('hovering'); });
    el.addEventListener('mouseleave', function(){ document.body.classList.remove('hovering'); });
  });
})();

/* ─── COOKIE CONSENT + POSTHOG ─── */
(function(){
  const CONSENT_KEY = 'nykla-cookie-consent';
  const POSTHOG_KEY = 'phc_vDB73QbXdSoPxcHvobhoL3TbBzE6i3YiJPXZAPyqYNzh';
  const POSTHOG_HOST = 'https://eu.i.posthog.com';

  const modal = document.getElementById('cookie-modal');
  const accept = document.getElementById('cookie-accept');
  const decline = document.getElementById('cookie-decline');
  const infoToggle = document.getElementById('cookie-info-toggle');
  const details = document.getElementById('cookie-modal-details');

  function showModal(){
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden','false');
    // Trigger animation on next frame
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      modal.classList.add('in');
    }));
  }
  function hideModal(){
    modal.classList.remove('in');
    modal.setAttribute('aria-hidden','true');
    setTimeout(()=>{
      modal.classList.remove('visible');
    }, 350);
  }

  function loadPostHog(){
    if (window.posthog && window.posthog.__loaded) return;
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init me ws ys ps bs capture De Ai $s register register_once register_for_session unregister unregister_for_session Is getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty Ts $s createPersonProfile Es opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing Ss debug xs getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'always',
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: false,
      capture_performance: { web_vitals: true },
    });
  }

  function applyConsent(value){
    try { localStorage.setItem(CONSENT_KEY, value); } catch(e){}
    if (value === 'accepted') loadPostHog();
  }

  // Init
  let stored = null;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch(e){}
  if (stored === 'accepted') {
    loadPostHog();
  } else if (stored !== 'declined') {
    // First visit (or consent cleared) — show modal after small delay
    setTimeout(showModal, 800);
  }

  accept.addEventListener('click', ()=>{
    applyConsent('accepted');
    hideModal();
  });
  decline.addEventListener('click', ()=>{
    applyConsent('declined');
    hideModal();
  });
  infoToggle.addEventListener('click', ()=>{
    details.classList.toggle('open');
    infoToggle.textContent = details.classList.contains('open')
      ? 'Skjul detaljer'
      : 'Hva samler vi inn?';
  });
})();
