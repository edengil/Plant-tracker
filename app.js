'use strict';
/* ================= נתונים ================= */
const LS_KEY = 'plant-tracker-standalone-v1';
const LEAF_PH = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M54 10C30 12 14 26 12 44c-1 7 2 10 9 9 18-2 31-19 33-43z" fill="#ffffff" opacity=".92"/><path d="M14 50C22 36 36 24 50 16" stroke="#57b877" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>';
const EMPTY_ART = '<div class="art"><svg viewBox="0 0 24 24" fill="none" stroke="#0b8a48" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-7"/><path d="M12 14c0-3.9 2.9-6.5 7.5-6.5C19.5 11.4 16.6 14 12 14z"/><path d="M12 10.5C12 7 9.6 4.8 5 4.8c0 3.7 2.4 5.7 7 5.7z"/></svg></div>';
const WEEKDAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

/* תמונת ברירת מחדל לפי קטגוריה — כדי שכל כרטיס ייראה חי גם בלי צילום */
const CAT_IMG = {
  'בית': 'img/plants/monstera.jpg',
  'מרפסת': 'img/hero.jpg',
  'עשבי תיבול': 'img/plants/basil.jpg',
  'פורחים': 'img/plants/lavender.jpg',
  'גינה': 'img/plants/tomato.jpg'
};
const PLANT_CATS = ['הכול','בית','מרפסת','עשבי תיבול','פורחים','גינה'];
const GALLERY_CATS = ['הכול','בית','עשבי תיבול','פורחים','גינה'];
const GALLERY = [
  { name:'מונסטרה', cat:'בית', img:'img/plants/monstera.jpg', water:7, fert:30, loc:'בית, ליד חלון מואר' },
  { name:'פוטוס', cat:'בית', img:'img/plants/pothos.jpg', water:6, fert:30, loc:'בית, מדף או תלוי' },
  { name:'בזיליקום', cat:'עשבי תיבול', img:'img/plants/basil.jpg', water:1, fert:18, loc:'אדן חלון שטוף שמש' },
  { name:'נענע', cat:'עשבי תיבול', img:'img/plants/mint.jpg', water:1, fert:14, loc:'מרפסת, חצי צל' },
  { name:'רוזמרין', cat:'עשבי תיבול', img:'img/plants/rosemary.jpg', water:8, fert:180, loc:'מרפסת שטופת שמש' },
  { name:'לבנדר', cat:'פורחים', img:'img/plants/lavender.jpg', water:7, fert:365, loc:'גינה או מרפסת' },
  { name:'הידראנגאה', cat:'פורחים', img:'img/plants/hydrangea.jpg', water:3, fert:21, loc:'גינה, חצי צל' },
  { name:'דליה', cat:'פורחים', img:'img/plants/dahlia.jpg', water:3, fert:14, loc:'גינה שטופת שמש' },
  { name:'עגבנייה', cat:'גינה', img:'img/plants/tomato.jpg', water:2, fert:14, loc:'גינת ירק שטופת שמש' },
  { name:'עץ זית', cat:'גינה', img:'img/plants/olive.jpg', water:7, fert:45, loc:'מרפסת או גינה' }
];

function defaultState(){ return { plants:[], planters:[], zones:[], schedules:[], systemName:'', apiKey:'', tuyaDeviceId:'bf85d5de5a889a5ce5rfft', notif:null, deletedPlants:[], settingsUpdatedAt:null }; }
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = Object.assign(defaultState(), s);
    if(!Array.isArray(d.deletedPlants)) d.deletedPlants = [];
    return d;
  }catch(e){ return defaultState(); }
}
let state = loadState();
function save(){ stampChanges(); try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){ toast('האחסון מלא — נסו למחוק תמונות ישנות'); } schedulePush(); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function plantImg(p){ return p.photo || CAT_IMG[p.category] || 'img/hero.jpg'; }

/* ================= סנכרון ענן (Firebase) ================= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCFUS5Kk9FgyVEzzCqXoEAY5kY8EW-hFxM",
  authDomain: "plant-tracker-85766.firebaseapp.com",
  projectId: "plant-tracker-85766",
  storageBucket: "plant-tracker-85766.firebasestorage.app",
  messagingSenderId: "740967243913",
  appId: "1:740967243913:web:822f8b5590357c36c26658"
};
// App Check עם Fraud Defense (מנוהל ע״י Firebase — ללא מפתח אתר)
const RECAPTCHA_V3_SITE_KEY = ""; // לא בשימוש — הוחלף ב־Fraud Defense
let fbAuth = null, fbDb = null, fbUser = null;
let syncTimer = null, lastSyncAt = null, syncBusy = false;
let plantHashCache = {};
function fbReady(){ return !!(fbAuth && fbDb); }
function fbInit(){
  if(typeof firebase === 'undefined'){ setSyncStatus('off'); return; }
  try{
    if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    // App Check — הגנה מפני שימוש לרעה במפתח הציבורי (Fraud Defense מנוהל ע״י Firebase)
    try{
      if(firebase.appCheck){
        firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider());
      }
    }catch(e){ /* App Check אופציונלי — האפליקציה עובדת גם בלעדיו */ }
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    fbAuth.onAuthStateChanged(onAuthChanged);
    updateSyncUI();
  }catch(e){ setSyncStatus('off'); }
}
function stampChanges(){
  const now = new Date().toISOString();
  for(const p of state.plants){
    const c = Object.assign({}, p); delete c.updatedAt;
    const h = JSON.stringify(c);
    if(plantHashCache[p.id] !== h){ p.updatedAt = now; plantHashCache[p.id] = h; }
  }
  const sObj = { zones: state.zones, schedules: state.schedules, systemName: state.systemName, tuyaDeviceId: state.tuyaDeviceId };
  const sh = JSON.stringify(sObj);
  if(stampChanges._s !== sh){ stampChanges._s = sh; state.settingsUpdatedAt = now; }
}
function cloudDoc(){
  if(!fbUser || !fbDb) return null;
  return fbDb.collection('users').doc(fbUser.uid).collection('data').doc('main');
}
function schedulePush(){
  if(!fbUser || !fbDb) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushCloud, 2500);
}
async function pushCloud(){
  if(!fbUser || !fbDb || syncBusy) return;
  const doc = cloudDoc(); if(!doc) return;
  syncBusy = true; setSyncStatus('syncing');
  try{
    await doc.set({
      plants: state.plants,
      planters: state.planters || [],
      zones: state.zones,
      systemName: state.systemName,
      tuyaDeviceId: state.tuyaDeviceId || '',
      settingsUpdatedAt: state.settingsUpdatedAt || null,
      deletedPlants: state.deletedPlants || [],
      clientErrors: storedErrors(),
      pushSub: state.pushSub || null,
      updatedAt: new Date().toISOString()
    });
    lastSyncAt = new Date();
    setSyncStatus('ok');
    // גיבוי היסטורי — נשמר פעם ביום לכל היותר
    saveHistorySnapshot();
  }catch(e){ setSyncStatus('error'); }
  syncBusy = false;
}
/* גיבוי ענן אוטומטי עם היסטוריית גרסאות (עד 30 ימים אחורה) */
let lastSnapshotDay = '';
async function saveHistorySnapshot(){
  try{
    const day = new Date().toISOString().slice(0, 10);
    if(day === lastSnapshotDay) return;
    lastSnapshotDay = day;
    const col = fbDb.collection('users').doc(fbUser.uid).collection('history');
    await col.doc(day).set({
      at: new Date().toISOString(),
      plants: state.plants,
      planters: state.planters || [],
      zones: state.zones,
      schedules: state.schedules || [],
      systemName: state.systemName,
      tuyaDeviceId: state.tuyaDeviceId || '',
      deletedPlants: state.deletedPlants || []
    });
    // ניקוי גרסאות ישנות — שומר 30 אחרונות
    const snap = await col.orderBy('at', 'desc').get();
    const docs = [];
    snap.forEach(d => docs.push(d));
    const olds = docs.slice(30).map(d => d.ref.delete());
    if(olds.length) await Promise.all(olds);
  }catch(e){ /* גיבוי היסטורי לא קריטי — לא חוסם */ }
}
async function listHistorySnapshots(){
  if(!fbUser || !fbDb) return [];
  try{
    const snap = await fbDb.collection('users').doc(fbUser.uid).collection('history').orderBy('at', 'desc').limit(30).get();
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
    return out;
  }catch(e){ return []; }
}
async function restoreHistorySnapshot(day){
  if(!fbUser || !fbDb) return false;
  try{
    const d = await fbDb.collection('users').doc(fbUser.uid).collection('history').doc(day).get();
    if(!d.exists) return false;
    const h = d.data();
    if(!confirm('לשחזר את הגיבוי מ־' + day + '? הנתונים הנוכחיים יוחלפו.')) return false;
    state.plants = h.plants || [];
    if(Array.isArray(h.planters)) state.planters = h.planters;
    state.zones = h.zones || [];
    if(Array.isArray(h.schedules)) state.schedules = h.schedules;
    state.systemName = h.systemName || '';
    if(h.tuyaDeviceId) state.tuyaDeviceId = h.tuyaDeviceId;
    if(Array.isArray(h.deletedPlants)) state.deletedPlants = h.deletedPlants;
    save(); schedulePush(); renderAll();
    toast('הגיבוי שוחזר');
    return true;
  }catch(e){ toast('השחזור נכשל'); return false; }
}
function mergeCloud(cloud){
  const tombs = {};
  const allTombs = (state.deletedPlants || []).concat(cloud.deletedPlants || []);
  for(const d of allTombs){ if(d && d.id && (!tombs[d.id] || d.deletedAt > tombs[d.id])) tombs[d.id] = d.deletedAt; }
  const L = {}, C = {};
  for(const p of state.plants) L[p.id] = p;
  for(const p of (cloud.plants || [])) C[p.id] = p;
  const merged = [];
  const ids = new Set(Object.keys(L).concat(Object.keys(C)));
  ids.forEach(id => {
    const a = L[id], b = C[id];
    let w = (a && b) ? (((b.updatedAt || '') > (a.updatedAt || '')) ? b : a) : (a || b);
    if(tombs[id] && (w.updatedAt || '') <= tombs[id]) return;
    merged.push(w);
  });
  state.plants = merged;
  if((cloud.settingsUpdatedAt || '') > (state.settingsUpdatedAt || '')){
    state.zones = cloud.zones || [];
    state.schedules = cloud.schedules || [];
    state.systemName = cloud.systemName || '';
    state.tuyaDeviceId = cloud.tuyaDeviceId || state.tuyaDeviceId || '';
    state.settingsUpdatedAt = cloud.settingsUpdatedAt;
  }
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString();
  state.deletedPlants = Object.keys(tombs).map(id => ({ id: id, deletedAt: tombs[id] })).filter(d => d.deletedAt > cutoff);
  plantHashCache = {};
  for(const p of state.plants){ const c = Object.assign({}, p); delete c.updatedAt; plantHashCache[p.id] = JSON.stringify(c); }
  stampChanges._s = JSON.stringify({ zones: state.zones, systemName: state.systemName, tuyaDeviceId: state.tuyaDeviceId });
}
async function pullCloud(){
  if(!fbUser || !fbDb) return;
  const doc = cloudDoc(); if(!doc) return;
  setSyncStatus('syncing');
  try{
    const snap = await doc.get();
    if(snap.exists){ mergeCloud(snap.data()); save(); renderAll(); }
    else { await pushCloud(); return; }
    lastSyncAt = new Date();
    setSyncStatus('ok');
  }catch(e){ setSyncStatus('error'); }
}
async function signInGoogle(){
  if(!fbAuth){ toast('שירות הסנכרון לא נטען — בדקו חיבור רשת ורעננו'); return; }
  setSyncStatus('syncing');
  const provider = new firebase.auth.GoogleAuthProvider();
  try{ await fbAuth.signInWithPopup(provider); }
  catch(e){
    const code = e && e.code;
    if(code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request'){
      try{ await fbAuth.signInWithRedirect(provider); return; }
      catch(e2){ setSyncStatus('error'); toast('ההתחברות נכשלה'); }
    }
    else if(code !== 'auth/popup-closed-by-user'){ setSyncStatus('error'); toast('ההתחברות נכשלה'); }
    else setSyncStatus('off');
  }
}
function onAuthChanged(user){
  fbUser = user || null;
  updateSyncUI();
  if(fbUser){ pullCloud().then(() => pushSchedulesToWorker()); renderHistory(); }
  else { setSyncStatus('off'); const hw = $('historyWrap'); if(hw) hw.style.display = 'none'; }
}
function setSyncStatus(s){
  const dot = $('syncDot'), txt = $('syncStatus');
  if(!dot || !txt) return;
  const map = {
    off: ['#c9d6cd', 'לא מחובר'],
    syncing: ['#e6a23c', 'מסנכרן…'],
    ok: ['#43a047', 'מסונכרן'],
    error: ['#e53935', 'שגיאת סנכרון — ינסה שוב אוטומטית']
  };
  const m = map[s] || map.off;
  dot.style.background = m[0];
  txt.textContent = m[1] + ((s === 'ok' && lastSyncAt) ? ' · ' + fmtDateTime(lastSyncAt) : '');
}
function updateSyncUI(){
  const inBtn = $('syncSignIn'), outBtn = $('syncSignOut'), nowBtn = $('syncNow'), info = $('syncInfo');
  if(!inBtn) return;
  if(fbUser){
    inBtn.style.display = 'none'; outBtn.style.display = ''; nowBtn.style.display = '';
    info.textContent = 'מחובר כ־' + (fbUser.email || '') + '. שינויים מסתונכרנים אוטומטית.';
  }else{
    inBtn.style.display = ''; outBtn.style.display = 'none'; nowBtn.style.display = 'none';
    info.textContent = 'התחברות עם חשבון גוגל מסנכרנת את הצמחים וההשקיה בין מכשירים ושומרת גיבוי אוטומטי בענן.';
  }
}

/* ================= תאריכים ================= */
function pad(n){ return String(n).padStart(2,'0'); }
function dateStr(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function todayStr(){ return dateStr(new Date()); }
function parseDate(s){ if(!s) return null; const p = s.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function addDays(s, n){ const d = parseDate(s); if(!d) return null; d.setDate(d.getDate()+n); return dateStr(d); }
function diffDays(fromS, toS){ const a = parseDate(fromS), b = parseDate(toS); if(!a||!b) return 0; return Math.round((b - a) / 86400000); }
function fmtDate(s){ const d = parseDate(s); if(!d) return ''; return new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'numeric',year:'numeric'}).format(d); }
function fmtDateTime(dt){ return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'numeric'}).format(dt) + ' בשעה ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()); }

/* ================= לוגיקת טיפול ================= */
function careStatus(last, interval){
  if(!interval || interval <= 0) return null;
  if(!last) return { cls:'due', text:'טרם סומן ביצוע', dueIn:0, never:true };
  const dueDate = addDays(last, interval);
  const d = diffDays(todayStr(), dueDate);
  if(d < 0) return { cls:'over', text:'באיחור של ' + (-d) + (d === -1 ? ' יום' : ' ימים'), dueIn:d };
  if(d === 0) return { cls:'due', text:'היום', dueIn:0 };
  return { cls:'ok', text:'בעוד ' + d + (d === 1 ? ' יום' : ' ימים'), dueIn:d };
}
function getZone(id){ return state.zones.find(z => z.id === id) || null; }

function nextZoneRun(zone, from){
  if(!zone || !zone.active || !zone.days || zone.days.length === 0) return null;
  const base = from ? new Date(from) : new Date();
  const parts = (zone.time || '06:00').split(':').map(Number);
  for(let i = 0; i < 8; i++){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, parts[0]||0, parts[1]||0, 0, 0);
    if(zone.days.includes(d.getDay()) && d > base) return d;
  }
  return null;
}

function plantChips(p){
  const chips = [];
  if(p.mode === 'auto'){
    const z = getZone(p.zoneId);
    if(z && z.active){
      const nxt = nextZoneRun(z);
      chips.push({ cls:'auto', text: nxt ? ('השקיה הבאה: ' + fmtDateTime(nxt)) : ('אזור: ' + z.name) });
    } else if(z){
      chips.push({ cls:'over', text:'אזור לא פעיל: ' + z.name });
    } else {
      chips.push({ cls:'over', text:'לא משויך לאזור' });
    }
  } else {
    const w = careStatus(p.lastWater, p.waterInterval);
    if(w) chips.push({ cls:w.cls, text:'השקיה: ' + w.text });
  }
  const f = careStatus(p.lastFert, p.fertInterval);
  if(f) chips.push({ cls:f.cls, text:'דישון: ' + f.text });
  return chips;
}

/* משימות הטיפול של היום (השקיה ידנית + דישון שהגיע זמנן) */
/* ================= מזג אוויר (Open-Meteo — חינם, ללא מפתח) ================= */
const WX_LAT = 32.32, WX_LON = 34.85; // נתניה
let wxCache = { at: 0, rained: false, mm: 0 };
async function checkRain(){
  // מחזיר true אם ירד גשם משמעותי ביומיים האחרונים (>= 3 מ"מ)
  const now = Date.now();
  if(now - wxCache.at < 3600e3) return wxCache.rained; // מטמון לשעה
  try{
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WX_LAT + '&longitude=' + WX_LON
      + '&daily=precipitation_sum&past_days=2&timezone=Asia%2FJerusalem';
    const r = await fetch(url);
    const j = await r.json();
    const sums = (j.daily && j.daily.precipitation_sum) || [];
    const mm = sums.reduce((a, b) => a + (b || 0), 0);
    wxCache = { at: now, rained: mm >= 3, mm: Math.round(mm * 10) / 10 };
  }catch(e){ /* בלי רשת — לא חוסמים את התזכורות */ }
  return wxCache.rained;
}
function dueTasks(){
  const tasks = [];
  state.plants.forEach(p => {
    if(p.mode !== 'auto'){
      const w = careStatus(p.lastWater, p.waterInterval);
      if(w && (w.never || w.dueIn <= 0)) tasks.push({ p, type:'water', st:w });
    }
    const f = careStatus(p.lastFert, p.fertInterval);
    if(f && (f.never || f.dueIn <= 0)) tasks.push({ p, type:'fert', st:f });
  });
  tasks.sort((a,b) => a.st.dueIn - b.st.dueIn);
  return tasks;
}

/* ================= ניווט ================= */
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo({ top:0 });
  if(name === 'irrigation' && typeof fbUser !== 'undefined' && fbUser && !tuyaState) refreshTuyaStatus();
}
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.nav)));

/* ================= טוסט ומודאלים ================= */
let toastTimer = null;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function openModal(id){ $(id).classList.add('open'); }
function closeModal(id){ $(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if(e.target === m) m.classList.remove('open'); }));

/* ================= רינדור: כרטיס צמח ================= */
function plantCardHTML(p){
  const chips = plantChips(p).map(c => '<span class="chip ' + c.cls + '">' + esc(c.text) + '</span>').join('');
  return '<button class="plant-card" data-plant="' + p.id + '">'
    + '<span class="photo"><img src="' + esc(plantImg(p)) + '" alt="" loading="lazy"></span>'
    + '<span class="body"><span class="name">' + esc(p.name) + '</span>'
    + (p.location ? '<span class="loc">' + esc(p.location) + '</span>' : '')
    + '<span>' + chips + '</span></span></button>';
}
function bindPlantCards(container){
  container.querySelectorAll('[data-plant]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.plant)));
}
function matchSearch(p, q){
  if(!q) return true;
  q = q.trim();
  return (p.name && p.name.includes(q)) || (p.location && p.location.includes(q));
}

/* ================= גלריה ================= */
let galleryFilter = 'הכול';
function renderGallery(){
  $('galleryChips').innerHTML = GALLERY_CATS.map(c =>
    '<button class="f-chip' + (c === galleryFilter ? ' active' : '') + '" data-gcat="' + esc(c) + '">' + esc(c) + '</button>'
  ).join('');
  $('galleryChips').querySelectorAll('[data-gcat]').forEach(b => b.addEventListener('click', () => {
    galleryFilter = b.dataset.gcat; renderGallery();
  }));
  const items = GALLERY.map((g, i) => ({ g, i })).filter(x => galleryFilter === 'הכול' || x.g.cat === galleryFilter);
  $('galleryRow').innerHTML = items.map(x =>
    '<div class="g-card"><div class="g-photo"><img src="' + x.g.img + '" alt="" loading="lazy"><span class="g-cat">' + esc(x.g.cat) + '</span></div>'
    + '<div class="g-body"><span class="g-name">' + esc(x.g.name) + '</span>'
    + '<span class="g-meta">השקיה כל ' + x.g.water + ' ימים · דישון כל ' + x.g.fert + '</span>'
    + '<button class="g-add" data-gadd="' + x.i + '">+ הוסף לגינה שלי</button></div></div>'
  ).join('');
  $('galleryRow').querySelectorAll('[data-gadd]').forEach(b => b.addEventListener('click', () => galleryAdd(Number(b.dataset.gadd))));
}
async function galleryAdd(i){
  const g = GALLERY[i];
  if(!g) return;
  let photo = g.img;
  try{
    const res = await fetch(g.img);
    const blob = await res.blob();
    photo = await compressImageFile(new File([blob], 'plant.jpg', { type: blob.type || 'image/jpeg' }));
  }catch(e){ /* נשארים עם נתיב התמונה */ }
  openPlantForm(null, { name:g.name, category:g.cat, photo:photo, waterInterval:g.water, fertInterval:g.fert, location:g.loc });
}

/* ================= רינדור: בית ================= */
function renderHome(){
  const q = $('homeSearch').value;
  const tasks = dueTasks();

  /* סטטיסטיקה ותגי התראות */
  $('statPlants').textContent = state.plants.length;
  $('statToday').textContent = tasks.length;
  $('statZones').textContent = state.zones.filter(z => z.active).length;
  const bb = $('bellBadge'); bb.textContent = tasks.length; bb.classList.toggle('show', tasks.length > 0);
  const nb = $('navBadge'); nb.textContent = tasks.length; nb.classList.toggle('show', tasks.length > 0);

  /* לטיפול היום */
  const tl = $('todayList');
  if(tasks.length === 0){
    tl.innerHTML = '<div class="empty">' + EMPTY_ART + 'אין מה לטפל היום. כל הצמחים מסודרים.</div>';
  } else {
    tl.innerHTML = tasks.map(t => {
      const isW = t.type === 'water';
      const sub = isW ? 'השקיה' : 'דישון';
      const overText = t.st.never ? 'טרם סומן ביצוע' : (t.st.dueIn < 0 ? ('באיחור של ' + (-t.st.dueIn) + ' ימים') : 'מועד הטיפול היום');
      const rainNote = (isW && wxCache.rained) ? ' <span style="color:#2980b9">🌧 ירד גשם (' + wxCache.mm + ' מ״מ) — אפשר לדלג</span>' : '';
      return '<div class="task-card"><div class="t-photo"><img src="' + esc(plantImg(t.p)) + '" alt=""></div>'
        + '<div class="t-main"><div class="t-name">' + esc(t.p.name) + '</div>'
        + '<div class="t-sub ' + (t.st.dueIn < 0 || t.st.never ? 'over' : '') + '">' + sub + ' · ' + esc(overText) + rainNote + '</div></div>'
        + '<button class="done-btn ' + (isW ? '' : 'fert') + '" data-done="' + t.p.id + ':' + t.type + '">בוצע היום</button></div>';
    }).join('');
    tl.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
      const parts = b.dataset.done.split(':'); markCare(parts[0], parts[1]);
    }));
    // בדיקת גשם ברקע — מרענן את התצוגה רק אם מצב הגשם השתנה (מונע לולאת רינדור)
    const rainBefore = wxCache.rained;
    checkRain().then(() => { if(wxCache.rained !== rainBefore) renderHome(); });
  }

  /* השקיה אוטומטית קרובה */
  const autos = [];
  state.plants.filter(p => p.mode === 'auto').forEach(p => {
    const z = getZone(p.zoneId);
    if(z) autos.push({ p, z, nxt: nextZoneRun(z) });
  });
  autos.sort((a,b) => (a.nxt ? a.nxt.getTime() : Infinity) - (b.nxt ? b.nxt.getTime() : Infinity));
  const al = $('autoList');
  const activeZones = state.zones.filter(z => z.active);
  if(autos.length === 0 && activeZones.length === 0){
    al.innerHTML = '<div class="empty">' + EMPTY_ART + 'אין צמחים בהשקיה אוטומטית עדיין.<br>שייך צמח לאזור במסך ההשקיה ותראה כאן את ההשקיה הבאה שלו.</div>';
  } else if(autos.length === 0){
    // יש אזורי השקיה אבל עוד לא שויך אליהם אף צמח — מציגים את האזורים וההשקיה הבאה שלהם
    const items = activeZones.map(z => ({ z, nxt: nextZoneRun(z) }));
    items.sort((a,b) => (a.nxt ? a.nxt.getTime() : Infinity) - (b.nxt ? b.nxt.getTime() : Infinity));
    al.innerHTML = items.map(a => {
      const when = a.nxt ? fmtDateTime(a.nxt) : 'לא מתוזמן — הגדר ימים במסך ההשקיה';
      return '<div class="task-card"><div class="t-photo" style="display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg)">💧</div>'
        + '<div class="t-main"><div class="t-name">' + esc(a.z.name) + (a.z.tuyaZone ? ' 🔗' : '') + '</div>'
        + '<div class="t-sub">השקיה הבאה: ' + esc(when) + ' · ' + esc(String(a.z.durationMin)) + ' דק׳</div></div></div>';
    }).join('');
  } else {
    al.innerHTML = autos.map(a => {
      const when = a.nxt ? fmtDateTime(a.nxt) + ' · ' + a.z.durationMin + ' דק׳' : 'האזור אינו פעיל';
      return '<div class="task-card"><div class="t-photo"><img src="' + esc(plantImg(a.p)) + '" alt=""></div>'
        + '<div class="t-main"><div class="t-name">' + esc(a.p.name) + '</div>'
        + '<div class="t-sub">אזור ' + esc(a.z.name) + ' · ' + esc(when) + '</div></div></div>';
    }).join('');
  }

  /* גריד צמחים בבית */
  const list = state.plants.filter(p => matchSearch(p, q));
  $('homeGrid').innerHTML = list.map(plantCardHTML).join('');
  bindPlantCards($('homeGrid'));
  $('homeEmpty').innerHTML = state.plants.length === 0
    ? '<div class="empty">' + EMPTY_ART + 'עוד לא הוספת צמחים.<br>אפשר להתחיל מהגלריה למעלה, מכפתור המצלמה, או מ״הוסף צמח״.</div>'
    : (list.length === 0 ? '<div class="empty">לא נמצאו צמחים שמתאימים לחיפוש.</div>' : '');

  renderGallery();
}

/* ================= רינדור: צמחים ================= */
let plantFilter = 'הכול';
function renderPlants(){
  $('plantChips').innerHTML = PLANT_CATS.map(c =>
    '<button class="f-chip' + (c === plantFilter ? ' active' : '') + '" data-pcat="' + esc(c) + '">' + esc(c) + '</button>'
  ).join('');
  $('plantChips').querySelectorAll('[data-pcat]').forEach(b => b.addEventListener('click', () => {
    plantFilter = b.dataset.pcat; renderPlants();
  }));
  const q = $('plantsSearch').value;
  const list = state.plants.filter(p => matchSearch(p, q) && (plantFilter === 'הכול' || (p.category || '') === plantFilter));
  $('plantsGrid').innerHTML = list.map(plantCardHTML).join('');
  bindPlantCards($('plantsGrid'));
  $('plantsEmpty').innerHTML = state.plants.length === 0
    ? '<div class="empty">' + EMPTY_ART + 'עוד אין צמחים ברשימה.<br>לחץ על ״הוסף צמח״ כדי להתחיל.</div>'
    : (list.length === 0 ? '<div class="empty">לא נמצאו צמחים בקטגוריה או בחיפוש הזה.</div>' : '');
}

/* ================= רינדור: השקיה ================= */
let editingZoneId = null;
function renderIrrigation(){
  $('sysName').value = state.systemName || '';
  if($('tuyaDeviceId') && !$('tuyaDeviceId').value) $('tuyaDeviceId').value = state.tuyaDeviceId || '';
  renderSchedules();
  const zl = $('zonesList');
  if(state.zones.length === 0){
    zl.innerHTML = '<div class="empty">' + EMPTY_ART + 'עוד לא הוגדרו אזורי השקיה.<br>הוסף אזור כדי לשייך אליו צמחים להשקיה אוטומטית.</div>';
    return;
  }
  zl.innerHTML = state.zones.map(z => {
    const days = (z.days || []).slice().sort((a,b) => a-b).map(d => WEEKDAYS[d]).join(', ');
    const count = state.plants.filter(p => p.mode === 'auto' && p.zoneId === z.id).length;
    const nxt = nextZoneRun(z);
    return '<div class="card"><div class="zone-head"><div>'
      + '<div class="zone-name">' + esc(z.name) + '</div>'
      + '<div class="note">' + esc(days || 'לא נבחרו ימים') + ' · מתחיל ב־' + esc(z.time || '06:00') + ' · ' + esc(z.durationMin) + ' דקות' + (z.tuyaZone ? ' · 🔗 בקר' : '') + '</div>'
      + '<div class="note">' + count + ' צמחים משויכים' + (z.active && nxt ? ' · השקיה הבאה: ' + esc(fmtDateTime(nxt)) : (z.active ? '' : ' · האזור מושבת')) + '</div>'
      + '</div>'
      + '<label class="switch"><input type="checkbox" data-zone-toggle="' + z.id + '"' + (z.active ? ' checked' : '') + '><span class="track"></span></label>'
      + '</div><div class="btn-row">'
      + '<button class="btn secondary" data-zone-edit="' + z.id + '">עריכה</button>'
      + '<button class="btn danger" data-zone-del="' + z.id + '">מחיקה</button>'
      + '</div></div>';
  }).join('');
  zl.querySelectorAll('[data-zone-toggle]').forEach(t => t.addEventListener('change', () => {
    const z = getZone(t.dataset.zoneToggle); if(z){ z.active = t.checked; save(); renderAll(); }
  }));
  zl.querySelectorAll('[data-zone-edit]').forEach(b => b.addEventListener('click', () => openZoneForm(b.dataset.zoneEdit)));
  zl.querySelectorAll('[data-zone-del]').forEach(b => b.addEventListener('click', () => deleteZone(b.dataset.zoneDel)));
}

/* ================= בקר השקיה חי (Tuya) ================= */
const TUYA_PROXY = 'https://plant-tracker-tuya.edengil94.workers.dev';

/* ============ ניטור שגיאות — נשמר מקומית ומסונכרן למסמך הענן של המשתמש ============ */
function storedErrors(){
  let prev = [];
  try{ prev = JSON.parse(localStorage.getItem('pt_errlog') || '[]'); }catch(e){}
  const buf = (window.__errBuf || []).splice(0); // מרוקן כדי לא לשכפל בקריאות הבאות
  const merged = buf.concat(prev).slice(0, 20);
  try{ localStorage.setItem('pt_errlog', JSON.stringify(merged)); }catch(e){}
  return merged;
}
const TUYA_ZONE_NAMES = ['אזור A', 'אזור B', 'אזור C'];
let tuyaState = null;
let tuyaCmdBusy = false; // מונע פקודות כפולות כשלוחצים מהר

/* סנכרון בין לשוניות/חלונות: שינוי בלשונית אחת מתעדכן אוטומטית באחרות */
window.addEventListener('storage', (e) => {
  if(e.key === LS_KEY && e.newValue){
    try{ state = JSON.parse(e.newValue); renderAll(); }catch(err){}
  }
});
async function tuyaHeaders(force){
  if(!fbUser) return null;
  try{ return { 'Authorization': 'Bearer ' + await fbUser.getIdToken(!!force), 'Content-Type': 'application/json' }; }
  catch(e){ return null; }
}
/* קריאה לפרוקסי טויה: אם התקבל 401 מנסים שוב פעם אחת עם טוקן מרוענן בכוח
   (טוקן Firebase פג תוקף אחרי שעה — זה היה מקור שגיאת "אין הרשאה"). */
async function tuyaFetch(path, opts){
  opts = opts || {};
  let h = await tuyaHeaders(false);
  if(!h) return null;
  const send = hd => fetch(TUYA_PROXY + path, Object.assign({}, opts, { headers: Object.assign({}, hd, opts.headers) }));
  let r = await send(h);
  if(r.status === 401){
    const h2 = await tuyaHeaders(true);
    if(h2) r = await send(h2);
  }
  return r;
}
function tuyaDeviceId(){ return (($('tuyaDeviceId') || {}).value || state.tuyaDeviceId || '').trim(); }
async function refreshTuyaStatus(){
  const st = $('tuyaStatus');
  const id = tuyaDeviceId();
  if(!id){ toast('חסר מזהה בקר'); return; }
  st.textContent = 'טוען סטטוס מהבקר…';
  try{
    const r = await tuyaFetch('/api/status/' + encodeURIComponent(id));
    if(!r){ st.textContent = 'צריך להתחבר עם גוגל (במסך ההגדרות) כדי לראות סטטוס חי.'; toast('התחבר עם גוגל קודם'); return; }
    if(r.status === 401){ st.textContent = 'אין הרשאה — החשבון המחובר לא מורשה לשלוט בבקר.'; tuyaState = null; renderTuyaZones(); return; }
    const j = await r.json();
    if(!j.success){ st.textContent = 'שגיאה בקריאת הסטטוס מהבקר.'; return; }
    tuyaState = {};
    (j.result || []).forEach(s => { tuyaState[s.code] = s.value; });
    renderTuyaZones();
    checkRain().then(() => checkRainForecast());
    st.textContent = 'עודכן: ' + new Date().toLocaleTimeString('he-IL');
  }catch(e){ st.textContent = 'שגיאת רשת — בדוק חיבור ונסה שוב.'; }
}
function renderTuyaZones(){
  const box = $('tuyaZones');
  if(!box) return;
  renderTuyaWeather();
  if(!tuyaState){ box.innerHTML = ''; return; }
  box.innerHTML = [1,2,3].map(i => {
    const on = !!tuyaState['switch_' + i];
    const cd = tuyaState['countdown_' + i];
    return '<div class="zone-head" style="margin-top:10px"><div>'
      + '<div class="zone-name">' + TUYA_ZONE_NAMES[i-1] + '</div>'
      + '<div class="note">' + (on ? 'פועל עכשיו 💧' : 'כבוי') + (cd ? ' · טיימר: ' + fmtCountdown(cd) : '') + '</div>'
      + '</div>'
      + '<label class="switch"><input type="checkbox" data-tuya-zone="' + i + '"' + (on ? ' checked' : '') + '><span class="track"></span></label>'
      + '</div>';
  }).join('');
  box.querySelectorAll('[data-tuya-zone]').forEach(t => t.addEventListener('click', (e) => {
    e.preventDefault(); // המתג לא מתהפך מעצמו — רק אחרי אישור מפורש
    if(tuyaCmdBusy) return;
    const i = Number(t.dataset.tuyaZone);
    const targetOn = !t.checked;
    if(!confirm((targetOn ? 'להפעיל את ' : 'לכבות את ') + TUYA_ZONE_NAMES[i-1] + '?')) return;
    t.checked = targetOn;
    toggleTuyaZone(i, targetOn);
  }));
}
/* ייבוא הגדרות מהבקר: קורא את טיימרי האזורים ויוצר/מעדכן אזורי השקיה באפליקציה.
   אחרי הייבוא אפשר לערוך כל אזור כרגיל (שם, ימים, שעה, משך). */
async function importTuyaSettings(){
  const id = tuyaDeviceId();
  if(!id){ toast('חסר מזהה בקר'); return; }
  toast('מייבא הגדרות מהבקר…');
  try{
    const r = await tuyaFetch('/api/status/' + encodeURIComponent(id));
    if(!r){ toast('התחבר עם גוגל קודם'); return; }
    if(r.status === 401){ toast('אין הרשאה — החשבון לא מורשה'); return; }
    const j = await r.json();
    if(!j.success){ toast('הייבוא נכשל'); return; }
    const vals = {};
    (j.result || []).forEach(s => { vals[s.code] = s.value; });
    for(let i = 1; i <= 3; i++){
      const cd = Number(vals['countdown_' + i]);
      const mins = cd > 0 ? Math.max(1, Math.round(cd / 60)) : 30;
      const z = state.zones.find(z => z.tuyaZone === i);
      if(z){ z.durationMin = mins; }
      else { state.zones.push({ id: uid(), name: TUYA_ZONE_NAMES[i-1], days: [], time: '06:00', durationMin: mins, active: true, tuyaZone: i }); }
    }
    save(); renderAll();
    toast('יובאו 3 אזורים מהבקר — אפשר לערוך אותם כרגיל');
  }catch(e){ toast('שגיאת רשת — נסה שוב'); }
}
async function toggleTuyaZone(i, on){
  if(tuyaCmdBusy){ renderTuyaZones(); return; }
  tuyaCmdBusy = true;
  try{
    const id = tuyaDeviceId();
    if(!id){ renderTuyaZones(); return; }
    const r = await tuyaFetch('/api/control/' + encodeURIComponent(id), {
      method: 'POST',
      body: JSON.stringify({ code: 'switch_' + i, value: on })
    });
    if(!r){ renderTuyaZones(); return; }
    const j = await r.json();
    if(j && j.success){ toast(TUYA_ZONE_NAMES[i-1] + (on ? ' הופעל 💧' : ' כובה')); }
    else { toast('הפקודה נכשלה — נסה שוב'); }
  }catch(e){ toast('שגיאת רשת'); }
  tuyaCmdBusy = false;
  refreshTuyaStatus();
}
/* שמות ידידותיים לנתוני מזג האוויר מהבקר */
function tuyaWeatherName(v){
  const m = { sunny: 'שמשי ☀️', cloudy: 'מעונן ☁️', rainy: 'גשום 🌧️' };
  return m[String(v || '').toLowerCase()] || String(v || '');
}
function tuyaDelayName(v){
  const m = { cancel: 'מבוטלת', delay: 'פעילה', running: 'פעילה' };
  return m[String(v || '').toLowerCase()] || String(v || '');
}
function fmtCountdown(s){
  s = Number(s);
  if(!s) return '';
  if(s >= 60) return Math.round(s / 60) + ' דקות';
  return s + ' שנ׳';
}
function renderTuyaWeather(){
  const w = $('tuyaWeather');
  if(!w) return;
  if(!tuyaState){ w.textContent = ''; w.style.display = 'none'; return; }
  const sw = tuyaState['smart_weather'], wd = tuyaState['weather_delay'];
  let txt = '';
  if(sw) txt += 'מזג אוויר חכם: ' + tuyaWeatherName(sw);
  if(wd) txt += (txt ? ' · ' : '') + 'דחיית השקיה בגשם: ' + tuyaDelayName(wd);
  w.textContent = txt;
  w.style.display = txt ? '' : 'none';
  renderRainAdvice();
}

/* ============ השקיה לפי מזג אוויר — המלצת דילוג + דחיית גשם בבקר ============ */
let rainForecastMm = null; // תחזית גשם ל־24 השעות הקרובות (מ"מ)
async function checkRainForecast(){
  try{
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WX_LAT + '&longitude=' + WX_LON
      + '&hourly=precipitation&forecast_days=2&timezone=Asia%2FJerusalem';
    const r = await fetch(url);
    const j = await r.json();
    const times = (j.hourly && j.hourly.time) || [];
    const vals = (j.hourly && j.hourly.precipitation) || [];
    const nowMs = Date.now();
    let sum = 0;
    for(let i = 0; i < times.length; i++){
      const t = new Date(times[i]).getTime();
      if(t >= nowMs && t < nowMs + 24 * 3600e3) sum += vals[i] || 0;
    }
    rainForecastMm = Math.round(sum * 10) / 10;
  }catch(e){ rainForecastMm = null; }
  renderRainAdvice();
}
function renderRainAdvice(){
  const box = $('rainAdvice');
  if(!box) return;
  if(!tuyaState){ box.style.display = 'none'; return; }
  const delayActive = String(tuyaState['weather_delay'] || '').toLowerCase() === 'delay'
    || String(tuyaState['weather_delay'] || '').toLowerCase() === 'running';
  const pastMm = wxCache.mm || 0;
  const fc = rainForecastMm;
  const rainy = pastMm >= 3 || (fc !== null && fc >= 3);
  if(!rainy && !delayActive){ box.style.display = 'none'; return; }
  box.style.display = '';
  let msg = '';
  if(pastMm >= 3) msg += 'ירדו ' + pastMm + ' מ"מ גשם ביומיים האחרונים. ';
  if(fc !== null && fc >= 3) msg += 'צפויים עוד ' + fc + ' מ"מ ביממה הקרובה. ';
  msg += delayActive ? 'דחיית ההשקיה בגשם פעילה בבקר ✅' : 'מומלץ לדלג על השקיה היום ולהפעיל דחיית גשם בבקר.';
  $('rainAdviceText').textContent = '🌧 ' + msg;
  $('rainDelayBtn').style.display = delayActive ? 'none' : '';
  $('rainDelayOffBtn').style.display = delayActive ? '' : 'none';
}
async function setRainDelay(on){
  const id = tuyaDeviceId();
  if(!id){ toast('אין מזהה בקר'); return; }
  try{
    const r = await tuyaFetch('/api/control/' + encodeURIComponent(id), {
      method: 'POST',
      body: JSON.stringify({ code: 'weather_delay', value: on ? 'delay' : 'cancel' })
    });
    if(!r){ toast('התחבר עם גוגל קודם'); return; }
    const j = await r.json();
    toast(j && j.success ? (on ? 'דחיית גשם הופעלה 🌧' : 'דחיית גשם בוטלה') : 'הפקודה נכשלה — נסה שוב');
  }catch(e){ toast('שגיאת רשת'); }
  refreshTuyaStatus();
}

/* ================= מתזמן השקיה אוטומטי =================
   הלוזים נשמרים ב-state (ומסונכרנים ל-Firebase) ונדחפים ל-Worker,
   שה-cron שלו מפעיל את הבקר בזמן הנכון דרך Tuya. */
let editingSchedId = null;
function getSchedules(){ return state.schedules || []; }
function schedZoneName(zoneIdx){
  const z = (state.zones || []).find(z => z.tuyaZone === Number(zoneIdx));
  return (z ? z.name + ' (' : '') + TUYA_ZONE_NAMES[Number(zoneIdx) - 1] + (z ? ')' : '');
}
function renderSchedules(){
  const box = $('schedList');
  if(!box) return;
  const scheds = getSchedules();
  if(!scheds.length){
    box.innerHTML = '<p class="note">אין לוזים עדיין — הוסף לוז והשרת ישקה אוטומטית בזמן שהגדרת.</p>';
    return;
  }
  const sorted = scheds.slice().sort((a, b) => (a.zone - b.zone) || String(a.time).localeCompare(String(b.time)));
  box.innerHTML = sorted.map(s => {
    const days = (s.days || []).slice().sort((a, b) => a - b).map(d => WEEKDAYS[d]).join(', ');
    return '<div class="card" style="margin:6px 0;padding:10px"><div class="zone-head"><div>'
      + '<div class="zone-name">' + esc(schedZoneName(s.zone)) + '</div>'
      + '<div class="note">' + esc(days || 'לא נבחרו ימים') + ' · ' + esc(s.time || '06:00') + ' · ' + esc(String(s.durationMin)) + ' דקות'
      + (s.enabled ? '' : ' · <b>כבוי</b>') + '</div>'
      + '</div>'
      + '<label class="switch"><input type="checkbox" data-sched-toggle="' + s.id + '"' + (s.enabled ? ' checked' : '') + '><span class="track"></span></label>'
      + '</div><div class="btn-row">'
      + '<button class="btn secondary" data-sched-edit="' + s.id + '">עריכה</button>'
      + '<button class="btn danger" data-sched-del="' + s.id + '">מחיקה</button>'
      + '</div></div>';
  }).join('');
  box.querySelectorAll('[data-sched-toggle]').forEach(t => t.addEventListener('change', () => {
    const s = getSchedules().find(x => x.id === t.dataset.schedToggle);
    if(s){ s.enabled = t.checked; save(); renderSchedules(); pushSchedulesToWorker(); }
  }));
  box.querySelectorAll('[data-sched-edit]').forEach(b => b.addEventListener('click', () => openSchedForm(b.dataset.schedEdit)));
  box.querySelectorAll('[data-sched-del]').forEach(b => b.addEventListener('click', () => deleteSched(b.dataset.schedDel)));
}
function buildSchedDaysPicker(selected){
  $('schedDays').innerHTML = WEEKDAYS.map((n, i) =>
    '<label><input type="checkbox" value="' + i + '"' + (selected && selected.includes(i) ? ' checked' : '') + '>' + n + '</label>'
  ).join('');
}
function openSchedForm(schedId){
  editingSchedId = schedId || null;
  const s = schedId ? getSchedules().find(x => x.id === schedId) : null;
  $('schedFormTitle').textContent = s ? 'עריכת לוז' : 'לוז חדש';
  document.querySelectorAll('input[name="schedZone"]').forEach(r => { r.checked = Number(r.value) === (s ? Number(s.zone) : 1); });
  $('schedTime').value = s ? (s.time || '06:00') : '06:00';
  $('schedDuration').value = s ? s.durationMin : 10;
  document.querySelectorAll('input[name="schedActive"]').forEach(r => { r.checked = (r.value === 'yes') === (s ? !!s.enabled : true); });
  buildSchedDaysPicker(s ? s.days : []);
  $('schedFormCard').style.display = 'block';
  $('schedFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeSchedForm(){ $('schedFormCard').style.display = 'none'; editingSchedId = null; }
function saveSched(){
  const zone = Number((document.querySelector('input[name="schedZone"]:checked') || {}).value || 1);
  const days = Array.from($('schedDays').querySelectorAll('input:checked')).map(i => Number(i.value));
  const time = $('schedTime').value || '06:00';
  const durationMin = Math.max(1, Math.min(180, Number($('schedDuration').value) || 10));
  const enabled = (document.querySelector('input[name="schedActive"]:checked') || {}).value === 'yes';
  if(!days.length){ toast('בחר לפחות יום אחד'); return; }
  if(editingSchedId){
    const s = getSchedules().find(x => x.id === editingSchedId);
    if(s) Object.assign(s, { zone, days, time, durationMin, enabled });
  } else {
    getSchedules().push({ id: uid(), zone, days, time, durationMin, enabled });
  }
  save(); closeSchedForm(); renderSchedules(); pushSchedulesToWorker();
  toast('הלוז נשמר ונדחף לשרת');
}
function deleteSched(id){
  if(!confirm('למחוק את הלוז?')) return;
  state.schedules = getSchedules().filter(x => x.id !== id);
  save(); renderSchedules(); pushSchedulesToWorker();
  toast('הלוז נמחק');
}
/* דחיפת הלוזים ל-Worker (נדרש חיבור גוגל). נקרא אחרי כל שינוי ובטעינה. */
async function pushSchedulesToWorker(){
  const st = $('schedStatus');
  try{
    const r = await tuyaFetch('/api/schedules', { method: 'POST', body: JSON.stringify({ schedules: getSchedules() }) });
    if(!r){ if(st) st.textContent = 'לא מחובר לגוגל — הלוזים נשמרו מקומית וידחפו בחיבור הבא.'; return; }
    const j = await r.json();
    if(j && j.success){ if(st) st.textContent = 'מסונכרן עם השרת · ' + j.count + ' לוזים פעילים · עדכון אחרון: ' + new Date().toLocaleTimeString('he-IL'); }
    else if(st) st.textContent = 'שגיאה בדחיפה לשרת — נסה שוב.';
  }catch(e){ if(st) st.textContent = 'שגיאת רשת בדחיפה לשרת.'; }
}

/* ================= עדניות ================= */
const PLANTER_SEEDS = [
  { seedId: 'pl-blueberry1', number: 1, name: 'עדנית אוכמניות 1', capacityLiters: 25, soilType: 'תערובת חומצית לאוכמניות', location: 'מרפסת', notes: 'אוכמניות בילוקסי 1 לבד' },
  { seedId: 'pl-blueberry2', number: 2, name: 'עדנית ארוכה אוכמניות 2 + רוזמרין', capacityLiters: null, soilType: '', location: 'מרפסת', notes: 'אוכמניות 2 הקטן + שיח רוזמרין — לא להחמיץ את כל הקרקע!' },
  { seedId: 'pl-large-herbs', number: 3, name: 'עדנית גדולה עשבים', capacityLiters: null, soilType: '', location: 'מרפסת', notes: 'לענה 1+2, זוטה לבנה' },
  { seedId: 'pl-new-herbs', number: 4, name: 'עדנית חדשה עשבים', capacityLiters: null, soilType: '', location: 'מרפסת', notes: 'פטרוזיליה + מרווה' },
  { seedId: 'pl-pepper-basil', number: 5, name: 'עדנית פלפל ובזיליקום', capacityLiters: null, soilType: '', location: 'מרפסת', notes: 'פלפל צ׳ילי + 3 בזיליקום' },
  { seedId: 'pl-lavender', number: 6, name: 'עדנית לוונדר', capacityLiters: null, soilType: '', location: 'מרפסת', notes: '3 שתילי לוונדר' },
  { seedId: 'pl-ficus', number: 7, name: 'עדנית פיקוס וקורדילין', capacityLiters: null, soilType: '', location: '', notes: 'פיקוס גומי + קורדילין' },
  { seedId: 'pl-lemongrass-rose', number: 8, name: 'עדנית לימונית ורוזמרין', capacityLiters: null, soilType: '', location: '', notes: 'לימונית + 2 רוזמרין' },
  { seedId: 'pl-louisa-melissa', number: 9, name: 'עדנית לואיזה ומליסה', capacityLiters: null, soilType: '', location: '', notes: 'לואיזה + מליסה' },
  { seedId: 'pl-mint', number: 10, name: 'עדנית נענע', capacityLiters: null, soilType: '', location: '', notes: 'נענע לבד' },
  { seedId: 'pl-passionfruit', number: 11, name: 'עדנית פסיפלורה', capacityLiters: null, soilType: '', location: '', notes: 'פסיפלורה לבד' },
];

const PLANT_TO_PLANTER = {
  'eden-blueberry-1': 'pl-blueberry1',
  'eden-blueberry-2': 'pl-blueberry2',
  'eden-wormwood-1': 'pl-large-herbs',
  'eden-wormwood-2': 'pl-large-herbs',
  'eden-zutah-1': 'pl-large-herbs',
  'eden-parsley-1': 'pl-new-herbs',
  'eden-sage-1': 'pl-new-herbs',
  'eden-pepper-1': 'pl-pepper-basil',
  'eden-basil-1': 'pl-pepper-basil',
  'eden-lavender-1': 'pl-lavender',
  'eden-ficus-1': 'pl-ficus',
  'eden-cordyline-1': 'pl-ficus',
  'eden-lemongrass-1': 'pl-lemongrass-rose',
  'eden-rosemary-1': 'pl-lemongrass-rose',
  'eden-lemongrass-2': 'pl-louisa-melissa',
  'eden-melissa-1': 'pl-louisa-melissa',
  'eden-mint-1': 'pl-mint',
  'eden-passionfruit-1': 'pl-passionfruit',
};

function seedPlanters(){
  try{
    if(!Array.isArray(state.planters)) state.planters = [];
    let added = false;
    for(const s of PLANTER_SEEDS){
      if(!state.planters.some(p => p.seedId === s.seedId)){
        state.planters.push(Object.assign({ id: uid() }, s));
        added = true;
      }
    }
    // שיוך צמחים לעדניות
    for(const p of state.plants){
      const plSeedId = PLANT_TO_PLANTER[p.seedId];
      if(plSeedId && !p.planterId){
        const pl = state.planters.find(x => x.seedId === plSeedId);
        if(pl){ p.planterId = pl.id; added = true; }
      }
    }
    if(added) save();
  }catch(e){}
}

function getPlanter(id){ return (state.planters || []).find(p => p.id === id); }
function planterPlants(planterId){ return state.plants.filter(p => p.planterId === planterId); }

/* ================= מעקב החלמה חכם ================= */
// זמני מעקב (ימים) לפי סוג טיפול — מבוסס מחקר הורטיקולטורי
const TREATMENT_FOLLOWUP = {
  iron_foliar:    { days: 10, label: 'ברזל בריסוס עלוותי' },
  iron_soil:      { days: 21, label: 'ברזל בהגמעה לקרקע' },
  overwater_mild: { days: 14, label: 'ייבוש אחרי השקיית יתר' },
  overwater_severe:{ days: 28, label: 'טיפול בריקבון שורשים' },
  underwater:     { days: 3,  label: 'השקיה אחרי יובש' },
  pest_neem:      { days: 7,  label: 'טיפול נים נגד מזיקים' },
  npk_liquid:     { days: 7,  label: 'דשן נוזלי' },
  npk_slow:       { days: 21, label: 'דשן גרגירי איטי' },
  transplant:     { days: 14, label: 'התאוששות משתילה' },
  prune_soft:     { days: 7,  label: 'גיזום עשבים רכים' },
  prune_woody:    { days: 21, label: 'גיזום עציים' },
};

// משימות מפורטות לכל סוג טיפול — צ׳קליסט עם יעדי זמן (ימים מהטיפול)
const TREATMENT_TASKS = {
  iron_foliar:    [{t:'ריסוס עלוותי ב-KF MICRO',d:0}, {t:'בדיקת מעקב — צילום',d:10}],
  iron_soil:      [{t:'הגמעת KF MICRO לקרקע',d:0}, {t:'פיזור גופרית סביב הצמח',d:0}, {t:'בדיקת מעקב — צילום',d:21}],
  overwater_mild: [{t:'הפסקת השקיה — לתת לאדמה להתייבש',d:0}, {t:'בדיקת מעקב',d:14}],
  overwater_severe:[{t:'הוצאת הצמח, גיזום שורשים רקובים',d:0}, {t:'שתילה מחדש בתערובת יבשה',d:0}, {t:'ללא השקיה 5-7 ימים',d:6}, {t:'בדיקת מעקב',d:28}],
  underwater:     [{t:'השקיה יסודית עד נגירה',d:0}, {t:'בדיקת מעקב',d:3}],
  pest_neem:      [{t:'ריסוס ראשון ב-KF Guard',d:0}, {t:'ריסוס שני',d:6}, {t:'בדיקת מעקב',d:7}],
  npk_liquid:     [{t:'דישון ב-KF G&B דרך ההשקיה',d:0}, {t:'בדיקת מעקב',d:7}],
  npk_slow:       [{t:'פיזור דשן גרגירי',d:0}, {t:'השקיה להטמעה',d:0}, {t:'בדיקת מעקב',d:21}],
  transplant:     [{t:'השקיה קלה לייצוב',d:0}, {t:'KF-10 להקלת שוק',d:0}, {t:'בדיקת מעקב',d:14}],
  prune_soft:     [{t:'גיזום',d:0}, {t:'KF-10 לעידוד צמיחה',d:0}, {t:'בדיקת מעקב',d:7}],
  prune_woody:    [{t:'גיזום זהיר (לא לעץ חום!)',d:0}, {t:'KF-10 לעידוד צמיחה',d:0}, {t:'בדיקת מעקב',d:21}],
};

function recordTreatment(plantId, type){
  const p = state.plants.find(x => x.id === plantId);
  const t = TREATMENT_FOLLOWUP[type];
  if(!p || !t) return;
  if(!Array.isArray(p.treatments)) p.treatments = [];
  const now = new Date();
  const followup = new Date(now.getTime() + t.days * 24 * 60 * 60 * 1000);
  const taskDefs = TREATMENT_TASKS[type] || [{t:'ביצוע טיפול',d:0}, {t:'בדיקת מעקב',d:7}];
  const tasks = taskDefs.map((def, i) => ({
    id: uid(), label: def.t, dueInDays: def.d,
    dueAt: new Date(now.getTime() + def.d * 24 * 60 * 60 * 1000).toISOString(),
    done: i === 0, // המשימה הראשונה מסומנת כבוצעת (הטיפול עצמו)
    doneAt: i === 0 ? now.toISOString() : null
  }));
  p.treatments.unshift({
    id: uid(), type: type, label: t.label,
    appliedAt: now.toISOString(),
    followupAt: followup.toISOString(),
    followupDays: t.days,
    status: 'pending',
    beforePhoto: p.photo || null,
    tasks: tasks
  });
  if(!Array.isArray(p.history)) p.history = [];
  p.history.unshift({ id: uid(), type: 'treatment', at: now.toISOString(), label: 'טיפול: ' + t.label + ' — מעקב בעוד ' + t.days + ' ימים' });
  save(); renderAll();
  toast('נרשם! צ׳קליסט משימות נוסף לדף הראשי');
}

function toggleTreatmentTask(plantId, treatmentId, taskId){
  const p = state.plants.find(x => x.id === plantId);
  const t = p && (p.treatments || []).find(x => x.id === treatmentId);
  const task = t && t.tasks.find(x => x.id === taskId);
  if(!task) return;
  task.done = !task.done;
  task.doneAt = task.done ? new Date().toISOString() : null;
  save(); renderAll();
}

function renderTreatmentTasks(){
  const box = $('treatmentTasksList');
  if(!box) return;
  const now = Date.now();
  let html = '';
  let overdueCount = 0;
  for(const p of state.plants){
    const active = (p.treatments || []).filter(t => t.status === 'pending' && t.tasks && t.tasks.some(task => !task.done));
    for(const t of active){
      const overdueTasks = t.tasks.filter(task => !task.done && task.dueAt && new Date(task.dueAt).getTime() < now);
      overdueCount += overdueTasks.length;
      const hasOverdue = overdueTasks.length > 0;
      html += '<div class="card" style="margin:8px 0;padding:12px' + (hasOverdue ? ';border-right:4px solid #c0392b' : '') + '">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<img src="' + plantImg(p) + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover">'
        + '<div class="zone-name" style="flex:1;font-size:14px">' + esc(p.name) + ' — ' + esc(t.label) + '</div>'
        + (hasOverdue ? '<span class="chip" style="background:#c0392b;color:#fff">🔴 ' + overdueTasks.length + ' באיחור</span>' : '')
        + '</div>';
      for(const task of t.tasks){
        const isOverdue = !task.done && task.dueAt && new Date(task.dueAt).getTime() < now;
        const dueNote = task.dueAt && !task.done ? ' <span class="note" style="font-size:11px;color:' + (isOverdue ? '#c0392b;font-weight:700' : '#888') + '">(' + (isOverdue ? 'באיחור! ' : '') + 'יעד: ' + fmtDate(task.dueAt) + ')</span>' : '';
        html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">'
          + '<input type="checkbox" ' + (task.done ? 'checked' : '') + ' onchange="toggleTreatmentTask(\'' + p.id + '\',\'' + t.id + '\',\'' + task.id + '\')" style="width:18px;height:18px">'
          + '<span class="note" style="' + (task.done ? 'text-decoration:line-through;opacity:0.6' : (isOverdue ? 'font-weight:700;color:#c0392b' : '')) + '">' + esc(task.label) + '</span>'
          + dueNote
          + '</label>';
      }
      html += '</div>';
    }
  }
  // התראה בראש הדף אם יש משימות באיחור
  const alertBox = $('taskOverdueAlert');
  if(alertBox){
    alertBox.innerHTML = overdueCount > 0
      ? '<div class="card" style="margin:8px 0;padding:12px;background:#fdecea;border-right:4px solid #c0392b"><b>🔴 ' + overdueCount + ' משימות טיפול באיחור!</b><div class="note">גלול למטה לצ׳קליסט המשימות</div></div>'
      : '';
  }
  box.innerHTML = html || '<p class="note">אין משימות טיפול פעילות ✅</p>';
}

function treatmentsDue(){
  const out = [];
  const now = Date.now();
  for(const p of state.plants){
    for(const t of (p.treatments || [])){
      if(t.status === 'pending' && new Date(t.followupAt).getTime() <= now){
        out.push({ plant: p, treatment: t });
      }
    }
  }
  return out;
}

function renderRecoveryTracking(){
  const box = $('recoveryList');
  if(!box) return;
  const due = treatmentsDue();
  // גם טיפולים שמתקרבים (3 ימים לפני)
  const upcoming = [];
  const now = Date.now();
  for(const p of state.plants){
    for(const t of (p.treatments || [])){
      if(t.status !== 'pending') continue;
      const fut = new Date(t.followupAt).getTime();
      if(fut > now && fut - now < 3 * 24 * 60 * 60 * 1000 && !due.some(d => d.treatment.id === t.id)){
        upcoming.push({ plant: p, treatment: t, daysLeft: Math.ceil((fut - now) / (24*60*60*1000)) });
      }
    }
  }
  let html = '';
  if(due.length === 0 && upcoming.length === 0){
    box.innerHTML = '<p class="note">אין מעקבים ממתינים ✅</p>';
    return;
  }
  for(const { plant: p, treatment: t } of due){
    // בדיקת הסלמה: פי 2 מהזמן המומלץ
    const appliedAt = new Date(t.appliedAt).getTime();
    const overdue = (now - appliedAt) > (t.followupDays * 2 * 24 * 60 * 60 * 1000);
    html += '<div class="card" style="margin:8px 0;padding:12px;border-right:4px solid ' + (overdue ? '#c0392b' : '#f39c12') + '">'
      + '<div class="zone-name">' + esc(p.name) + ' — ' + esc(t.label) + '</div>'
      + '<div class="note">טיפול בוצע: ' + fmtDate(t.appliedAt) + '</div>'
      + (overdue ? '<div class="note" style="color:#c0392b;font-weight:700">⚠️ עבר פי 2 מהזמן המומלץ ללא שיפור — מומלץ להסלים (ייעוץ משתלה/אבחון מעמיק)</div>' : '<div class="note">הגיע זמן לבדוק אם השתפר!</div>')
      + '<div style="display:flex;gap:8px;margin-top:8px">'
      + (t.beforePhoto ? '<img src="' + t.beforePhoto + '" style="width:60px;height:60px;border-radius:8px;object-fit:cover" title="לפני">' : '')
      + '<button class="btn" onclick="openRecoveryCheck(\'' + p.id + '\',\'' + t.id + '\')">בדוק עכשיו 📸</button>'
      + '</div></div>';
  }
  for(const { plant: p, treatment: t, daysLeft } of upcoming){
    html += '<div class="card" style="margin:8px 0;padding:10px;opacity:0.8">'
      + '<div class="note">⏳ ' + esc(p.name) + ' — ' + esc(t.label) + ': מעקב בעוד ' + daysLeft + ' ימים</div></div>';
  }
  box.innerHTML = html;
}

let recoveryCheckCtx = null;
function openRecoveryCheck(plantId, treatmentId){
  const p = state.plants.find(x => x.id === plantId);
  const t = p && (p.treatments || []).find(x => x.id === treatmentId);
  if(!p || !t) return;
  recoveryCheckCtx = { plantId, treatmentId };
  $('recoveryTitle').textContent = 'מעקב: ' + p.name + ' — ' + t.label;
  const beforeSrc = t.beforePhoto || plantImg(p);
  const afterSrc = plantImg(p);
  $('recoveryBefore').src = beforeSrc;
  $('recoveryAfter').src = afterSrc;
  // איפוס הסליידר לאמצע
  $('recoveryBeforeWrap').style.width = '50%';
  $('recoveryHandle').style.left = '50%';
  $('recoveryResult').innerHTML = '';
  openModal('recoveryModal');
}

async function submitRecoveryPhoto(){
  const file = $('recoveryPhotoInput').files[0];
  if(!file){ toast('בחר תמונה עדכנית'); return; }
  const { plantId } = recoveryCheckCtx || {};
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  if(!Array.isArray(p.photoHistory)) p.photoHistory = [];
  if(p.photo) p.photoHistory.unshift({ at: p.lastPhotoAt || new Date().toISOString(), photo: p.photo });
  p.photo = await compressImageFile(file);
  p.lastPhotoAt = new Date().toISOString();
  save();
  $('recoveryAfter').src = p.photo;
  $('recoveryResult').innerHTML = '<p class="note" style="margin-top:10px">השווה את התמונות — האם יש שיפור?</p>'
    + '<div class="btn-row" style="margin-top:8px">'
    + '<button class="btn" onclick="resolveRecovery(true)">✅ השתפר</button>'
    + '<button class="btn secondary" onclick="resolveRecovery(false)">❌ לא השתפר</button>'
    + '</div>';
  renderAll();
}

function resolveRecovery(improved){
  const { plantId, treatmentId } = recoveryCheckCtx || {};
  const p = state.plants.find(x => x.id === plantId);
  const t = p && (p.treatments || []).find(x => x.id === treatmentId);
  if(!p || !t) return;
  t.status = improved ? 'improved' : 'failed';
  t.resolvedAt = new Date().toISOString();
  if(!Array.isArray(p.history)) p.history = [];
  p.history.unshift({ id: uid(), type: 'recovery', at: new Date().toISOString(),
    label: 'מעקב ' + t.label + ': ' + (improved ? 'השתפר ✅' : 'לא השתפר ❌ — להסלים') });
  save(); closeModal('recoveryModal'); renderAll();
  if(improved) toast('מעולה! הטיפול עבד 🌱');
  else toast('לא השתפר — שקול ייעוץ או טיפול חלופי');
}

/* ================= בדיקת בריאות ================= */
function plantsNeedingPhoto(){
  const out = [];
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  for(const p of state.plants){
    // קריטריונים: אין תמונה עדכנית 30+ יום, או סימני מצוקה בהערות
    const lastPhotoAt = p.lastPhotoAt ? new Date(p.lastPhotoAt).getTime() : 0;
    const stressed = p.notes && /כלורוזיס|עייף|מצוקה|צהוב|נבול/i.test(p.notes);
    const needsPhoto = (now - lastPhotoAt > THIRTY_DAYS) || stressed;
    if(needsPhoto) out.push({ plant: p, reason: stressed ? 'סימני מצוקה' : 'לא צולם 30+ יום' });
  }
  return out;
}

function renderHealthCheck(){
  const box = $('healthCheckList');
  if(!box) return;
  const needing = plantsNeedingPhoto();
  let html = '';
  // משימות תוספים פתוחות
  for(const p of state.plants){
    const tasks = (p.supplementTasks || []).filter(t => !t.done);
    for(const t of tasks){
      html += '<div class="card" style="margin:8px 0;padding:10px;display:flex;align-items:center;gap:10px;background:#fff8e6">'
        + '<img src="' + plantImg(p) + '" style="width:50px;height:50px;border-radius:10px;object-fit:cover">'
        + '<div style="flex:1"><div class="zone-name" style="font-size:14px">📋 ' + esc(t.label) + '</div>'
        + '<div class="note">' + esc(p.name) + '</div></div>'
        + '<button class="btn" onclick="toggleSupplementTask(\'' + p.id + '\',\'' + t.id + '\')">בוצע</button>'
        + '</div>';
    }
  }
  if(needing.length === 0 && html === ''){
    box.innerHTML = '<p class="note">כל הצמחים מעודכנים ✅</p>';
    return;
  }
  html += needing.slice(0, 5).map(({ plant: p, reason }) =>
    '<div class="card" style="margin:8px 0;padding:10px;display:flex;align-items:center;gap:10px">'
    + '<img src="' + plantImg(p) + '" style="width:50px;height:50px;border-radius:10px;object-fit:cover">'
    + '<div style="flex:1"><div class="zone-name" style="font-size:14px">' + esc(p.name) + '</div>'
    + '<div class="note">' + esc(reason) + '</div></div>'
    + '<button class="btn" onclick="openHealthPhoto(\'' + p.id + '\')">צלם</button>'
    + '</div>'
  ).join('');
  box.innerHTML = html;
}

function toggleSupplementTask(plantId, taskId){
  const p = state.plants.find(x => x.id === plantId);
  const t = p && (p.supplementTasks || []).find(x => x.id === taskId);
  if(!t) return;
  t.done = true;
  t.doneAt = new Date().toISOString();
  if(!Array.isArray(p.history)) p.history = [];
  p.history.unshift({ id: uid(), type: 'fert', at: new Date().toISOString(), label: 'תוספים: ' + t.label });
  save(); renderAll();
  toast('סומן כבוצע ✅');
}

let healthPhotoPlantId = null;
function openHealthPhoto(plantId){
  healthPhotoPlantId = plantId;
  const p = state.plants.find(x => x.id === plantId);
  if(p) $('healthPhotoTitle').textContent = 'תמונה עדכנית: ' + p.name;
  openModal('healthPhotoModal');
}

async function submitHealthPhoto(){
  const file = $('healthPhotoInput').files[0];
  if(!file){ toast('בחר תמונה'); return; }
  const p = state.plants.find(x => x.id === healthPhotoPlantId);
  if(!p) return;
  // שמירת התמונה הקודמת בהיסטוריה
  if(!Array.isArray(p.photoHistory)) p.photoHistory = [];
  if(p.photo) p.photoHistory.unshift({ at: p.lastPhotoAt || new Date().toISOString(), photo: p.photo });
  p.photo = await compressImageFile(file);
  p.lastPhotoAt = new Date().toISOString();
  save(); closeModal('healthPhotoModal'); renderAll();
  // הערכה פשוטה
  openHealthAssessment(p.id);
}

function openHealthAssessment(plantId){
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  $('healthAssessModal').dataset.plantId = plantId;
  $('healthAssessTitle').textContent = 'הערכת מצב: ' + p.name;
  $('healthAssessImg').src = plantImg(p);
  $('healthAssessResult').innerHTML = '';
  $('healthTreatmentSection').style.display = 'none';
  // איפוס בחירות קודמות
  document.querySelectorAll('input[name="ha_leaves"],input[name="ha_growth"],input[name="ha_soil"]').forEach(r => r.checked = false);
  // ניתוח AI אוטומטי מהתמונה — ממלא מה שאפשר לראות, שואל רק על האדמה
  const aiNote = document.createElement('div');
  aiNote.id = 'ha_aiNote';
  aiNote.className = 'note';
  aiNote.style.cssText = 'margin-bottom:12px;padding:10px;background:#eef6ff;border-radius:10px';
  aiNote.textContent = '🤖 ה־AI מנתח את התמונה…';
  $('healthAssessImg').after(aiNote);
  runHealthAiAnalysis(p);
  // מילוי סוגי טיפול עם בדיקת מלאי
  $('healthTreatmentType').innerHTML = Object.entries(TREATMENT_FOLLOWUP)
    .map(([k, v]) => {
      const { available, missing } = checkMaterials(k);
      const stockNote = missing.length > 0 ? ' ⚠️ חסר: ' + missing.join(', ') + ' — מומלץ לקנות!' : ' ✅ הכל במלאי';
      return '<option value="' + k + '">' + esc(v.label) + ' (' + v.days + ' ימים)' + stockNote + '</option>';
    }).join('');
  $('healthTreatmentType').onchange = updateTreatmentStockWarning;
  updateTreatmentStockWarning();
  openModal('healthAssessModal');
}

// ניתוח AI של תמונת הצמח — ממלא אוטומטית מה שניתן לראות בתמונה
async function runHealthAiAnalysis(p){
  const note = $('ha_aiNote');
  try{
    const photo = p.photo || plantImg(p);
    if(!photo || !photo.startsWith('data:')){ if(note) note.remove(); return; }
    const result = await window.aiAnalyzeHealth(photo, p.name);
    if(!result){ if(note) note.remove(); return; }
    // מילוי אוטומטי של השאלות שה־AI יכול לענות עליהן
    const leafMap = { green: 'green', yellow: 'yellow', brown: 'brown' };
    const growthMap = { yes: 'yes', no: 'no' };
    if(leafMap[result.leaves]){
      const r = document.querySelector('input[name="ha_leaves"][value="' + leafMap[result.leaves] + '"]');
      if(r) r.checked = true;
    }
    if(growthMap[result.growth]){
      const r = document.querySelector('input[name="ha_growth"][value="' + growthMap[result.growth] + '"]');
      if(r) r.checked = true;
    }
    if(note){
      note.innerHTML = '🤖 ה־AI ניתח את התמונה' + (result.notes ? ': ' + esc(result.notes) : '')
        + '<br><span style="font-size:12px">מילאתי אוטומטית את מה שניתן לראות — נשאר רק לסמן את <b>מצב האדמה</b> (אי אפשר לדעת מתמונה).</span>';
    }
    // שמירת תוצאת ה־AI לשימוש בהמלצות
    $('healthAssessModal').dataset.aiHealthy = result.healthy ? '1' : '0';
    $('healthAssessModal').dataset.aiNotes = result.notes || '';
  }catch(e){ if(note) note.remove(); }
}

function updateTreatmentStockWarning(){
  const type = $('healthTreatmentType').value;
  const { available, missing } = checkMaterials(type);
  let el = $('treatmentStockWarn');
  if(!el){
    el = document.createElement('div');
    el.id = 'treatmentStockWarn';
    $('healthTreatmentType').parentElement.appendChild(el);
  }
  if(missing.length > 0){
    el.innerHTML = '<p class="note" style="color:#b3541e;margin-top:8px"><b>⚠️ חסרים חומרים:</b> ' + missing.map(esc).join(', ')
      + '<br>מומלץ לקנות לפני הטיפול. <button class="link-btn" onclick="closeModal(\'healthAssessModal\');showScreen(\'fertilizers\')">למסך הדשנים</button></p>';
  } else if(available.length > 0){
    el.innerHTML = '<p class="note" style="color:#0b8a48;margin-top:8px">✅ כל החומרים (' + available.map(f => esc(f.name)).join(', ') + ') במלאי</p>';
  } else {
    el.innerHTML = '';
  }
}

function submitHealthTreatment(){
  const plantId = $('healthAssessModal').dataset.plantId;
  const type = $('healthTreatmentType').value;
  if(!plantId || !type){ toast('בחר טיפול'); return; }
  closeModal('healthAssessModal');
  recordTreatment(plantId, type);
}

function submitHealthAssessment(){
  const p = state.plants.find(x => x.id === $('healthAssessModal').dataset.plantId);
  const modal = $('healthAssessModal');
  // שאלות: עלים וצמיחה כבר מולאו אוטומטית ע״י AI — המשתמש מסמן רק אדמה
  const leaves = document.querySelector('input[name="ha_leaves"]:checked');
  const growth = document.querySelector('input[name="ha_growth"]:checked');
  const soil = document.querySelector('input[name="ha_soil"]:checked');
  const suggestions = [];
  const needsSupplements = [];
  if(leaves && leaves.value === 'yellow'){ suggestions.push('עלים מצהיבים — בדוק דישון (KF MICRO לברזל) והשקיה'); needsSupplements.push('KF MICRO'); }
  if(leaves && leaves.value === 'brown') suggestions.push('קצוות חומים — אפשר עודף מלחים או יובש, שטוף את הקרקע');
  if(growth && growth.value === 'no'){ suggestions.push('אין צמיחה חדשה — בדוק אור ודשן (KF-10)'); needsSupplements.push('KF-10'); }
  if(soil && soil.value === 'dry') suggestions.push('אדמה יבשה — השקה עכשיו');
  if(soil && soil.value === 'wet') suggestions.push('אדמה רטובה מדי — תן להתייבש, בדוק ניקוז');
  // תובנת AI נוספת
  const aiNotes = modal.dataset.aiNotes;
  if(aiNotes && modal.dataset.aiHealthy === '0' && suggestions.length === 0){
    suggestions.push('ה־AI זיהה בעיה: ' + aiNotes);
  }
  if(suggestions.length === 0) suggestions.push('הצמח נראה טוב! המשך כרגיל ✅');
  let html = '<div class="card" style="margin-top:10px;padding:12px;background:#f0f7f0">'
    + '<div class="zone-name">המלצות:</div>'
    + '<ul style="margin:8px 0;padding-right:20px">' + suggestions.map(s => '<li class="note">' + esc(s) + '</li>').join('') + '</ul></div>';
  // משימת תוספים — אם הומלצו תוספים, נוצרת משימה אוטומטית
  if(p && needsSupplements.length > 0){
    const uniqSupp = [...new Set(needsSupplements)];
    if(!Array.isArray(p.supplementTasks)) p.supplementTasks = [];
    const existing = p.supplementTasks.some(t => !t.done && t.label.includes(uniqSupp[0]));
    if(!existing){
      p.supplementTasks.unshift({
        id: uid(), label: 'הוסף תוספים: ' + uniqSupp.join(' + '),
        createdAt: new Date().toISOString(), done: false
      });
      html += '<div class="card" style="margin-top:10px;padding:12px;background:#fff8e6">'
        + '<div class="note">📋 נוספה משימה: <b>הוסף תוספים (' + esc(uniqSupp.join(' + ')) + ')</b> — תופיע בדף הראשי.</div></div>';
    }
  }
  $('healthAssessResult').innerHTML = html;
  $('healthTreatmentSection').style.display = '';
  // שמירה בהיסטוריה
  if(p){
    if(!Array.isArray(p.history)) p.history = [];
    p.history.unshift({ id: uid(), type: 'healthcheck', at: new Date().toISOString(), label: suggestions.join('; ') });
    save();
  }
}
/* ================= מאגר דשנים ================= */
// לכל חומר: inStock (במלאי?), quantity (כמות חופשית)
const FERTILIZERS = [
  { id: 'kf10', name: 'KF-10', type: 'ביו-סטימולנט נוזלי', desc: 'תרכיז אצות, חלבונים, ויטמינים ומיצויי צמחים. משפר קליטת מינרלים ועמידות לעקות חום/קור. מאושר לחקלאות אורגנית.', dosage: 'עדנית 80 ס"מ: 10 מ"ל ב-2.5 ליטר מים, בהגמעה, פעם בחודש.', mixable: true, photo: null, inStock: true, quantity: '' },
  { id: 'kfgb', name: 'KF G&B', type: 'דשן NPK נוזלי', desc: 'דשן בסיסי: חנקן 2.82%, זרחן 1.88%, אשלגן 5.64% + מיקרו-אלמנטים.', dosage: '2.5–4.2 מ"ל לכל ליטר מי השקיה, דרך הקרקע בלבד.', warning: 'לא לרסס על עלים!', mixable: true, photo: null, inStock: true, quantity: '' },
  { id: 'kfmicro', name: 'KF MICRO', type: 'מיקרו-אלמנטים', desc: 'ברזל 3.4%, מנגן 1.8%, אבץ, בורון, מוליבדן, מגנזיום, סידן — מכולתים בחומצות אמינו.', dosage: 'הגמעה: 10–40 מ"ל/ליטר; ריסוס עלוותי: 3–6 מ"ל/ליטר.', warning: 'בריסוס — לא מעל 24°C.', mixable: true, photo: null, inStock: true, quantity: '' },
  { id: 'kfaci', name: 'KF ACO ACID', type: 'מוריד pH', desc: 'חומצה ציטרית טבעית 20%. מוריד pH של מי ההשקיה והקרקע, משפר זמינות דשנים.', dosage: 'לפי בדיקת pH — יעד 5.5–6.5. המינון באתר דורש בירור מול VGI.', mixable: true, photo: null, inStock: true, quantity: '' },
  { id: 'kfguard', name: 'KF Guard', type: 'הגנה (לא דשן!)', desc: '40% שמן נים + 20% מיצויי צמחים. נגד כנימות, אקריות, טריפסים.', dosage: 'עדנית 80 ס"מ: 10–15 מ"ל ב-2.5 ליטר מים, בהגמעה או ריסוס, פעם בחודש.', warning: 'לא לרסס מעל 24°C! יומיים המתנה לפני קטיף. אין לערבב עם שום דבר!', mixable: false, photo: null, inStock: true, quantity: '' },
  { id: 'bbspring', name: 'דשן אביב גרגירי', type: 'דשן בשחרור איטי (ערכת אוכמניות)', desc: 'דשן גרגירי לעונת הצמיחה והפריחה של אוכמניות.', dosage: '50–75 גרם לעציץ 25 ליטר, בתחילת מרץ.', mixable: true, photo: 'img/fertilizers/kit-fertilizers.jpg', inStock: true, quantity: '250 גרם' },
  { id: 'bbautumn', name: 'דשן סתיו גרגירי', type: 'דשן בשחרור איטי (ערכת אוכמניות)', desc: 'דשן גרגירי לחיזוק הצמח לאחר קטיף ותמיכה במנוחה.', dosage: '50–75 גרם לעציץ 25 ליטר, בתחילת אוגוסט.', mixable: true, photo: 'img/fertilizers/kit-fertilizers.jpg', inStock: true, quantity: '250 גרם' },
  { id: 'sulfur', name: 'גופרית 99.9%', type: 'מחמצן קרקע', desc: 'גופרית טהורה להורדת pH הקרקע. קריטי לאוכמניות — בלי חומציות נכונה הצמח לא קולט דשן.', dosage: '2.5 כפות לעציץ 25 ליטר, כל 3–4 חודשים (מרץ, יוני, ספטמבר — לא בחורף).', mixable: true, photo: 'img/fertilizers/kit-fertilizers.jpg', inStock: true, quantity: '250 גרם + 500 גרם 80%' },
];

// מיפוי טיפול → חומרים נדרשים (מהמלאי)
const TREATMENT_MATERIALS = {
  iron_foliar:    ['kfmicro'],
  iron_soil:      ['kfmicro', 'sulfur'],
  overwater_mild: [],
  overwater_severe: [],
  underwater:     [],
  pest_neem:      ['kfguard'],
  npk_liquid:     ['kfgb'],
  npk_slow:       ['bbspring', 'bbautumn'],
  transplant:     ['kf10'],
  prune_soft:     ['kf10'],
  prune_woody:    ['kf10'],
};

// חומרים מותאמים אישית שהמשתמש הוסיף (נשמרים ב-state)
function getCustomFertilizers(){
  if(!Array.isArray(state.customFertilizers)) state.customFertilizers = [];
  return state.customFertilizers;
}
function getAllFertilizers(){
  return FERTILIZERS.concat(getCustomFertilizers());
}
function getFertilizer(id){
  return getAllFertilizers().find(f => f.id === id);
}
function checkMaterials(treatmentType){
  // מחזיר: { available: [...], missing: [...] } — לפי המלאי בפועל
  const needed = TREATMENT_MATERIALS[treatmentType] || [];
  const available = [], missing = [];
  for(const fid of needed){
    const f = getFertilizer(fid);
    if(f && getFertStock(fid)) available.push(f);
    else missing.push(f ? f.name : fid);
  }
  return { available, missing };
}
function renderPlanters(){
  const box = $('plantersList');
  if(!box) return;
  const planters = state.planters || [];
  if(planters.length === 0){
    box.innerHTML = '<p class="note">אין עדניות עדיין.</p>';
    return;
  }
  box.innerHTML = planters.slice().sort((a,b) => (a.number||0)-(b.number||0)).map(pl => {
    const plants = planterPlants(pl.id);
    return '<div class="card" style="margin:8px 0;padding:12px">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    + '<span class="chip" style="background:#e8f5e9;font-weight:700">#' + (pl.number || '?') + '</span>'
    + '<div class="zone-name" style="flex:1">' + esc(pl.name) + '</div>'
    + '<button class="btn" style="padding:4px 10px;font-size:12px" onclick="openPlanterEdit(\'' + pl.id + '\')">ערוך</button>'
    + '</div>'
    + (pl.capacityLiters ? '<div class="note">קיבולת: ' + pl.capacityLiters + ' ליטר</div>' : '')
    + (pl.soilType ? '<div class="note">אדמה: ' + esc(pl.soilType) + '</div>' : '')
    + (pl.location ? '<div class="note">מיקום: ' + esc(pl.location) + '</div>' : '')
    + (plants.length ? '<div class="note" style="margin-top:6px">צמחים: ' + plants.map(p => esc(p.name)).join(', ') + '</div>' : '<div class="note">אין צמחים משויכים</div>')
    + (pl.notes ? '<div class="note">' + esc(pl.notes) + '</div>' : '')
    + '</div>';
  }).join('');
}

let editingPlanterId = null;
function openPlanterEdit(planterId){
  const pl = getPlanter(planterId);
  if(!pl) return;
  editingPlanterId = planterId;
  $('pl_number').value = pl.number || '';
  $('pl_name').value = pl.name || '';
  $('pl_capacity').value = pl.capacityLiters || '';
  $('pl_soil').value = pl.soilType || '';
  $('pl_location').value = pl.location || '';
  $('pl_notes').value = pl.notes || '';
  openModal('planterModal');
}

function savePlanter(){
  const pl = getPlanter(editingPlanterId);
  if(!pl) return;
  pl.number = Number($('pl_number').value) || pl.number;
  pl.name = $('pl_name').value.trim() || pl.name;
  pl.capacityLiters = Number($('pl_capacity').value) || null;
  pl.soilType = $('pl_soil').value.trim();
  pl.location = $('pl_location').value.trim();
  pl.notes = $('pl_notes').value.trim();
  save(); closeModal('planterModal'); renderAll();
  toast('העדנית נשמרה');
}

function renderFertilizers(){
  const box = $('fertList');
  if(!box) return;
  const all = getAllFertilizers();
  box.innerHTML = all.map(f => {
    const inStock = getFertStock(f.id);
    return '<div class="card" style="margin:8px 0;padding:12px;opacity:' + (inStock ? '1' : '0.6') + '">'
    + (f.photo ? '<img src="' + f.photo + '" style="width:100%;border-radius:10px;margin-bottom:8px" alt="' + esc(f.name) + '">' : '')
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<div class="zone-name" style="flex:1">' + esc(f.name) + '</div>'
    + '<span class="chip ' + (inStock ? 'auto' : '') + '">' + (inStock ? 'במלאי ✅' : 'אזל ❌') + '</span>'
    + '</div>'
    + '<div class="note">' + esc(f.type) + (f.quantity ? ' · ' + esc(f.quantity) : '') + '</div>'
    + '<p class="note" style="margin:6px 0">' + esc(f.desc) + '</p>'
    + '<p class="note"><b>מינון:</b> ' + esc(f.dosage) + '</p>'
    + (f.warning ? '<p class="note" style="color:#b3541e"><b>⚠️ ' + esc(f.warning) + '</b></p>' : '')
    + '<p class="note">' + (f.mixable ? '✅ ניתן לערבב עם דשנים אחרים' : '❌ אין לערבב — ליישם בנפרד') + '</p>'
    + '<div class="btn-row" style="margin-top:8px">'
    + '<button class="btn secondary" style="padding:4px 10px;font-size:12px" onclick="toggleFertStock(\'' + f.id + '\')">'
    + (inStock ? 'סמן שאזל' : 'סמן כבמלאי') + '</button>'
    + (f.custom ? '<button class="btn secondary" style="padding:4px 10px;font-size:12px" onclick="deleteCustomFert(\'' + f.id + '\')">מחק</button>' : '')
    + '</div>'
    + '</div>';
  }).join('')
  + '<button class="btn" style="width:100%;margin:8px 0" onclick="openModal(\'addFertModal\')">+ קניתי חומר חדש</button>'
  + '<div class="card" style="margin:8px 0;padding:12px;background:#f0f7f0">'
  + '<div class="zone-name">כללי ערבוב</div>'
  + '<p class="note" style="white-space:pre-line">ארבעת דשני KF (KF-10, G&B, MICRO, ACO ACID) — מותר לערבב יחד.\nסדר ערבוב: מים ← KF-10 ← G&B ← MICRO ← חומצה אחרונה.\nKF Guard — תמיד בנפרד, לעולם לא לערבב!</p>'
  + '</div>';
}

function getFertStock(fid){
  // מחזיר true אם במלאי (בודק state.fertStock קודם, אחרת ברירת מחדל)
  if(state.fertStock && fid in state.fertStock) return state.fertStock[fid];
  const f = FERTILIZERS.find(x => x.id === fid) || getCustomFertilizers().find(x => x.id === fid);
  return f ? f.inStock !== false : true;
}

function toggleFertStock(fid){
  if(!state.fertStock) state.fertStock = {};
  state.fertStock[fid] = !getFertStock(fid);
  save(); renderAll();
  toast(getFertStock(fid) ? 'סומן כבמלאי ✅' : 'סומן כאזל ❌');
}

function deleteCustomFert(fid){
  const arr = getCustomFertilizers();
  const i = arr.findIndex(x => x.id === fid);
  if(i >= 0){ arr.splice(i, 1); save(); renderAll(); toast('נמחק'); }
}

function addCustomFert(){
  const name = $('cf_name').value.trim();
  if(!name){ toast('צריך שם לחומר'); return; }
  getCustomFertilizers().push({
    id: 'custom_' + uid(), custom: true,
    name: name,
    type: $('cf_type').value.trim() || 'חומר חדש',
    desc: $('cf_desc').value.trim(),
    dosage: $('cf_dosage').value.trim(),
    quantity: $('cf_qty').value.trim(),
    mixable: true, photo: null, inStock: true
  });
  save(); closeModal('addFertModal'); renderAll();
  $('cf_name').value = ''; $('cf_type').value = ''; $('cf_desc').value = ''; $('cf_dosage').value = ''; $('cf_qty').value = '';
  toast('נוסף למלאי ✅');
}

function buildDaysPicker(selected){
  $('z_days').innerHTML = WEEKDAYS.map((n, i) =>
    '<label><input type="checkbox" value="' + i + '"' + (selected && selected.includes(i) ? ' checked' : '') + '>' + n + '</label>'
  ).join('');
}
function openZoneForm(zoneId){
  editingZoneId = zoneId || null;
  const z = zoneId ? getZone(zoneId) : null;
  $('zoneFormTitle').textContent = z ? 'עריכת אזור' : 'אזור חדש';
  $('z_name').value = z ? z.name : '';
  $('z_time').value = z ? (z.time || '06:00') : '06:00';
  $('z_duration').value = z ? z.durationMin : 30;
  document.querySelectorAll('input[name="zactive"]').forEach(r => { r.checked = (r.value === 'yes') === (z ? !!z.active : true); });
  buildDaysPicker(z ? z.days : []);
  $('zoneFormCard').style.display = 'block';
  $('zoneFormCard').scrollIntoView({ behavior:'smooth', block:'start' });
}
function closeZoneForm(){ $('zoneFormCard').style.display = 'none'; editingZoneId = null; }
function saveZone(){
  const name = $('z_name').value.trim();
  if(!name){ toast('צריך לתת שם לאזור'); return; }
  const days = Array.from($('z_days').querySelectorAll('input:checked')).map(i => Number(i.value));
  const time = $('z_time').value || '06:00';
  const durationMin = Math.max(1, Number($('z_duration').value) || 30);
  const active = document.querySelector('input[name="zactive"]:checked').value === 'yes';
  if(editingZoneId){
    const z = getZone(editingZoneId);
    if(z) Object.assign(z, { name, days, time, durationMin, active });
  } else {
    state.zones.push({ id: uid(), name, days, time, durationMin, active });
  }
  save(); closeZoneForm(); renderAll(); toast('האזור נשמר');
}
function deleteZone(id){
  const z = getZone(id);
  if(!z) return;
  if(!confirm('למחוק את האזור "' + z.name + '"? צמחים שמשויכים אליו יחזרו להשקיה ידנית.')) return;
  state.zones = state.zones.filter(x => x.id !== id);
  state.plants.forEach(p => { if(p.mode === 'auto' && p.zoneId === id){ p.mode = 'manual'; p.zoneId = null; } });
  save(); renderAll(); toast('האזור נמחק');
}

/* ================= רינדור: הגדרות ================= */
function renderSettings(){
  renderNotif();
  const el = $('errLogStatus');
  if(el){
    const errs = storedErrors();
    el.textContent = errs.length
      ? 'ניטור תקלות: נרשמו ' + errs.length + ' שגיאות אחרונות (אחרונה: ' + String(errs[0].msg || '').slice(0, 80) + ')'
      : 'ניטור תקלות: לא נרשמו שגיאות.';
  }
}

/* ================= רינדור כללי ================= */
function renderAll(){ renderHome(); renderPlants(); renderPlanters(); renderIrrigation(); renderFertilizers(); renderHealthCheck(); renderRecoveryTracking(); renderTreatmentTasks(); renderSettings(); }

/* ================= טיפול בצמחים ================= */
function markCare(plantId, type){
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  const now = new Date();
  if(type === 'water') p.lastWater = todayStr(); else p.lastFert = todayStr();
  if(!Array.isArray(p.history)) p.history = [];
  p.history.unshift({ id: uid(), type: type, at: now.toISOString() });
  save(); renderAll();
  if($('detailModal').classList.contains('open')) openDetail(plantId);
  toast(type === 'water' ? 'ההשקיה סומנה כבוצעה' : 'הדישון סומן כבוצע');
}

let editingPlantId = null;
let pendingPhoto = null;
let lastIdentifyPhoto = null;
let pendingJournalPhoto = null;
let pendingJournalPlantId = null;
let compareSel = [];

/* ================= יומן גדילה ================= */
function getJournal(p){ if(!Array.isArray(p.journal)) p.journal = []; return p.journal; }
function renderJournal(p){
  const j = getJournal(p).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('d_compareBtn').style.display = j.length >= 2 ? '' : 'none';
  if(j.length === 0){
    $('d_journal').innerHTML = '<p class="note">עדיין אין תמונות ביומן. הוסיפו תמונה כדי לעקוב אחרי הגדילה לאורך זמן.</p>';
    return;
  }
  $('d_journal').innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
    + j.map(e => '<div class="journal-item" style="position:relative">'
      + '<img src="' + e.photo + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px" alt="">'
      + '<div class="note" style="font-size:11px;margin-top:2px">' + esc(fmtDate(e.date)) + (e.note ? ' · ' + esc(e.note) : '') + '</div>'
      + '<button class="journal-del" data-jdel="' + e.id + '" aria-label="מחק תמונה" style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:14px;line-height:1">✕</button>'
      + '</div>').join('') + '</div>';
  $('d_journal').querySelectorAll('[data-jdel]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    if(!confirm('למחוק את התמונה הזו מהיומן?')) return;
    const pl = state.plants.find(x => x.id === p.id);
    if(pl){ pl.journal = getJournal(pl).filter(x => x.id !== b.dataset.jdel); save(); openDetail(p.id); }
  }));
}
function openJournalPhoto(plantId){
  pendingJournalPlantId = plantId;
  $('journalPhotoInput').click();
}
async function handleJournalPhoto(file){
  if(!file) return;
  try{
    pendingJournalPhoto = await compressImageFile(file);
    $('j_preview').innerHTML = '<img src="' + pendingJournalPhoto + '" style="width:100%;border-radius:12px" alt="">';
    $('j_note').value = '';
    openModal('journalModal');
  }catch(e){ toast('לא הצלחתי לקרוא את התמונה'); }
}
function saveJournalEntry(){
  const p = state.plants.find(x => x.id === pendingJournalPlantId);
  if(!p || !pendingJournalPhoto){ toast('משהו השתבש — נסו שוב'); return; }
  getJournal(p).push({ id: uid(), date: todayStr(), photo: pendingJournalPhoto, note: $('j_note').value.trim() });
  save(); closeModal('journalModal'); openDetail(p.id);
  pendingJournalPhoto = null; pendingJournalPlantId = null;
  toast('התמונה נוספה ליומן');
}
function openCompare(plantId){
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  const j = getJournal(p).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  compareSel = [];
  $('compareView').style.display = 'none';
  $('compareHint').style.display = '';
  const pick = $('comparePick');
  pick.innerHTML = j.map(e => '<button class="cmp-pick" data-cmp="' + e.id + '" style="border:2px solid transparent;border-radius:12px;padding:0;background:none">'
    + '<img src="' + e.photo + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px" alt="">'
    + '<div class="note" style="font-size:11px">' + esc(fmtDate(e.date)) + '</div></button>').join('');
  pick.querySelectorAll('[data-cmp]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.cmp;
    if(compareSel.includes(id)){ compareSel = compareSel.filter(x => x !== id); b.style.borderColor = 'transparent'; }
    else if(compareSel.length < 2){ compareSel.push(id); b.style.borderColor = 'var(--green)'; }
    if(compareSel.length === 2){
      const entries = compareSel.map(x => j.find(e => e.id === x)).filter(Boolean)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      $('cmpA').src = entries[0].photo; $('cmpADate').textContent = fmtDate(entries[0].date) + (entries[0].note ? ' · ' + entries[0].note : '');
      $('cmpB').src = entries[1].photo; $('cmpBDate').textContent = fmtDate(entries[1].date) + (entries[1].note ? ' · ' + entries[1].note : '');
      $('compareView').style.display = 'block';
      $('compareHint').style.display = 'none';
      pick.querySelectorAll('[data-cmp]').forEach(x => x.style.borderColor = 'transparent');
    }
  }));
  openModal('compareModal');
}

function refreshZoneSelect(selectedId){
  const sel = $('f_zone');
  sel.innerHTML = state.zones.map(z => '<option value="' + z.id + '">' + esc(z.name) + '</option>').join('');
  if(selectedId) sel.value = selectedId;
  $('f_zoneEmpty').style.display = state.zones.length === 0 ? 'block' : 'none';
}
function updateModeUI(){
  const mode = document.querySelector('input[name="fmode"]:checked').value;
  $('f_zoneWrap').style.display = mode === 'auto' ? 'block' : 'none';
  $('f_waterWrap').style.display = mode === 'auto' ? 'none' : 'block';
}
function updateFormPhotoPreview(){
  const src = pendingPhoto || CAT_IMG[$('f_category').value] || 'img/hero.jpg';
  $('f_photoPreview').innerHTML = '<img src="' + esc(src) + '" alt="">';
}

function openPlantForm(plantId, preset){
  editingPlantId = plantId || null;
  const p = plantId ? state.plants.find(x => x.id === plantId) : null;
  $('plantFormTitle').textContent = p ? 'עריכת צמח' : 'צמח חדש';
  $('f_name').value = p ? p.name : (preset && preset.name ? preset.name : '');
  $('f_category').value = p ? (p.category || 'בית') : (preset && preset.category ? preset.category : 'בית');
  $('f_location').value = p ? (p.location || '') : (preset && preset.location ? preset.location : '');
  $('f_notes').value = p ? (p.notes || '') : '';
  pendingPhoto = p ? (p.photo || null) : (preset && preset.photo ? preset.photo : null);
  const mode = p ? p.mode : 'manual';
  document.querySelectorAll('input[name="fmode"]').forEach(r => { r.checked = r.value === mode; });
  refreshZoneSelect(p ? p.zoneId : null);
  $('f_water').value = p && p.waterInterval ? p.waterInterval : (preset && preset.waterInterval ? preset.waterInterval : '');
  $('f_fert').value = p && p.fertInterval ? p.fertInterval : (preset && preset.fertInterval ? preset.fertInterval : '');
  $('f_lastWater').value = p && p.lastWater ? p.lastWater : '';
  $('f_lastFert').value = p && p.lastFert ? p.lastFert : '';
  updateModeUI();
  updateFormPhotoPreview();
  openModal('plantModal');
}

function savePlant(){
  const name = $('f_name').value.trim();
  if(!name){ toast('צריך לתת שם לצמח'); return; }
  const mode = document.querySelector('input[name="fmode"]:checked').value;
  const data = {
    name: name,
    category: $('f_category').value,
    location: $('f_location').value.trim(),
    notes: $('f_notes').value.trim(),
    photo: pendingPhoto,
    mode: mode,
    zoneId: mode === 'auto' ? ($('f_zone').value || null) : null,
    waterInterval: mode === 'manual' ? (Number($('f_water').value) || 0) : 0,
    fertInterval: Number($('f_fert').value) || 0,
    lastWater: $('f_lastWater').value || null,
    lastFert: $('f_lastFert').value || null
  };
  if(editingPlantId){
    const p = state.plants.find(x => x.id === editingPlantId);
    if(p) Object.assign(p, data);
  } else {
    state.plants.push(Object.assign({ id: uid(), history: [] }, data));
  }
  save(); closeModal('plantModal'); renderAll(); toast('הצמח נשמר');
}

/* מדריכי גידול בעברית — לפי סוג צמח */
const GUIDES = {
'לענה': '☀️ שמש: שמש מלאה\n💧 השקיה: כל 7–10 ימים בקיץ, כל 14–21 ימים בחורף — עמידה ליובש\n🌱 דישון: מינימלי, דשן מאוזן בחצי חוזק כל ~6 שבועות בעונה בלבד\n✂️ טיפ: צמח ים־תיכוני עמיד מאוד. לקטום פריחה כדי לחזק עלים.',
'אוכמניות': '☀️ שמש: שמש מלאה עד חצי צל\n💧 השקיה: יומיומית! אדמה לחה תמיד — לא לתת להתייבש\n🌱 דישון: גופרית כל 3–4 חודשים + דשן חומצי באביב ובסתיו. שטיפת מלחים כל ~3 שבועות\n✂️ טיפ: ראה מדריך מלא במסך הדשנים. חיפוי שבבי אורן עוזר לשמור חומציות.',
'זוטה לבנה': '☀️ שמש: שמש מלאה עד חצי צל\n💧 השקיה: כל 3–4 ימים בקיץ, כל 10–14 ימים בחורף — חסכונית במים\n🌱 דישון: קומפוסט או דשן נוזלי עדין פעם בחודש\n✂️ טיפ: צמח תבלין ארומטי, לקטוף עלים לעידוד צמיחה.',
'פטרוזיליה': '☀️ שמש: שמש מלאה עד חצי צל\n💧 השקיה: כל 1–2 ימים בקיץ, כל 3–4 ימים בחורף — לחות אחידה, לא בוצי\n🌱 דישון: דשן מאוזן בחצי חוזק כל ~4 שבועות\n✂️ טיפ: לקטוף עלים חיצוניים קודם. לא לתת לפרוח — הפריחה ממרירה.',
'מרווה': '☀️ שמש: שמש מלאה\n💧 השקיה: כל ~7 ימים בקיץ (כשהשכבה העליונה יבשה), כל 14–21 ימים בחורף — שונאת עודף מים!\n🌱 דישון: מינימלי — קומפוסט או דשן מאוזן פעם בשנה באביב\n✂️ טיפ: ניקוז מעולה חובה. צמח ים־תיכוני עמיד לבצורת.',
'נענע': '☀️ שמש: חצי צל עד שמש מלאה (חצי צל אידיאלי)\n💧 השקיה: יומיומית! אדמה לחה תמיד\n🌱 דישון: דשן נוזלי קליל כל שבועיים\n✂️ טיפ: מתפשטת באגרסיביות — עדיף בעציץ נפרד. לקטום פריחה.',
'פלפל': '☀️ שמש: שמש מלאה, כמה שיותר\n💧 השקיה: כל 1–2 ימים בקיץ (לחות אחידה ועמוקה), כל 3–4 ימים בחורף\n🌱 דישון: דשן עשיר באשלגן (דשן עגבניות) כל שבועיים בעונת פריחה/פרי\n✂️ טיפ: לתמוך בגבעול כשהפרי כבד. קוטף כשהפלפל מקבל צבע מלא.',
'בזיליקום': '☀️ שמש: שמש מלאה (6+ שעות)\n💧 השקיה: יומיומית בקיץ (עציץ מתייבש מהר!), כל 3 ימים בחורף\n🌱 דישון: דשן עשיר בחנקן כל 2–3 שבועות\n✂️ טיפ: לקטוף מלמעלה כדי לעודד הסתעפות. להסיר ניצני פריחה מיד!',
'לוונדר': '☀️ שמש: שמש מלאה\n💧 השקיה: כל ~7 ימים בקיץ (כשהשכבה העליונה יבשה), כל 14–21 ימים בחורף — לא להגזים!\n🌱 דישון: כמעט לא צריך — דשן קל פעם בשנה באביב או כלום\n✂️ טיפ: ניקוז מעולה קריטי — עודף מים = ריקבון שורשים. לגזום אחרי פריחה.',
'פיקוס': '☀️ שמש: אור בהיר, לא שמש ישירה חזקה\n💧 השקיה: כל ~7 ימים בקיץ (כשהשכבה העליונה 2–3 ס״מ יבשה), כל 10–14 ימים בחורף\n🌱 דישון: דשן נוזלי מאוזן כל ~5 שבועות באביב–קיץ בלבד\n✂️ טיפ: לא להזיז הרבה — רגיש לשינויי מיקום. לנגב עלים מאבק.',
'קורדילין': '☀️ שמש: אור בהיר עד חצי צל\n💧 השקיה: כל 2–3 ימים בקיץ, כל ~7 ימים בחורף\n🌱 דישון: דשן נוזלי לצמחי עלווה כל 15–20 יום באביב–קיץ\n✂️ טיפ: אוהב לחות — לרסס מים על העלים בימים חמים.',
'לימונית': '☀️ שמש: שמש מלאה\n💧 השקיה: כל 2–3 ימים בקיץ (לחות עקבית), כל 5–7 ימים בחורף\n🌱 דישון: דשן מאוזן כל ~10 ימים בעונת הגידול — צרכנית כבדה\n✂️ טיפ: לקטוף גבעולים חיצוניים. בחורף להגן מקור.',
'רוזמרין': '☀️ שמש: שמש מלאה\n💧 השקיה: כל 7–10 ימים בקיץ, כל 14–21 ימים בחורף — שונא עודף מים!\n🌱 דישון: מינימלי — דשן קל פעמיים בשנה\n✂️ טיפ: ים־תיכוני כמו מרווה. ניקוז מעולה חובה.',
'מליסה': '☀️ שמש: חצי צל עד שמש\n💧 השקיה: כל 2–3 ימים בקיץ, כל ~7 ימים בחורף — דורשת מים יחסית הרבה\n🌱 דישון: דשן מאוזן אורגני כל 4–6 שבועות\n✂️ טיפ: לקטוף עלים לעידוד צמיחה. מתפשטת — לשקול עציץ נפרד.',
'לואיזה': '☀️ שמש: שמש מלאה\n💧 השקיה: כל 2–3 ימים בעונת הגידול, כל ~14 ימים בחורף (תרדמה — מעט מאוד!)\n🌱 דישון: דשן אורגני מאוזן פעם בחודש באביב–קיץ\n✂️ טיפ: נשירה בחורף — נורמלי! תתעורר באביב. לגזום בסוף חורף.',
'פסיפלורה': '☀️ שמש: שמש מלאה\n💧 השקיה: כל 1–2 ימים בקיץ (הרבה, בעיקר בפרי!), כל 7–14 ימים בחורף\n🌱 דישון: דשן עשיר באשלגן כל שבועיים בעונת הגידול לעידוד פריחה/פרי\n✂️ טיפ: צריכה הדלייה לטיפוס. רגישה לקור — להגן בחורף.'
};
function guideForPlant(p){
  const name = p.name || '';
  for(const key of Object.keys(GUIDES)){
    if(name.includes(key)) return GUIDES[key];
  }
  return 'מדריך גידול לצמח הזה עדיין לא הוכן.';
}
/* מרווחי טיפול מומלצים מהמחקר (ימי קיץ) — לרענון צמחים קיימים בלחיצה */
const GUIDE_INTERVALS = {
  'לענה': { water: 8, fert: 42 }, 'אוכמניות': { water: 1, fert: 100 },
  'זוטה לבנה': { water: 3, fert: 30 }, 'פטרוזיליה': { water: 2, fert: 28 },
  'מרווה': { water: 7, fert: 365 }, 'נענע': { water: 1, fert: 14 },
  'פלפל': { water: 2, fert: 14 }, 'בזיליקום': { water: 1, fert: 18 },
  'לוונדר': { water: 7, fert: 365 }, 'פיקוס': { water: 7, fert: 35 },
  'קורדילין': { water: 3, fert: 18 }, 'לימונית': { water: 3, fert: 10 },
  'מליסה': { water: 3, fert: 35 }, 'לואיזה': { water: 3, fert: 30 },
  'רוזמרין': { water: 8, fert: 180 }, 'פסיפלורה': { water: 2, fert: 14 }
};
function guideIntervalsFor(p){
  const name = (p && p.name) || '';
  for(const key of Object.keys(GUIDE_INTERVALS)){
    if(name.includes(key)) return GUIDE_INTERVALS[key];
  }
  return null;
}
function refreshFromGuide(){
  const id = $('detailModal').dataset.plantId;
  const p = state.plants.find(x => x.id === id);
  if(!p) return;
  const g = guideIntervalsFor(p);
  if(!g) return;
  if(!confirm('לעדכן את מרווחי הטיפול לפי המדריך העדכני?\nהשקיה כל ' + g.water + ' ימים, דישון כל ' + g.fert + ' ימים.\n(תאריכי הטיפול האחרון לא ישתנו)')) return;
  p.waterInterval = g.water;
  p.fertInterval = g.fert;
  save(); openDetail(p.id); renderAll();
  toast('המרווחים עודכנו מהמדריך 🌱');
}
function openDetail(plantId){
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  $('detailModal').dataset.plantId = plantId;
  $('d_name').textContent = p.name;
  $('d_photo').src = plantImg(p);
  const z = p.mode === 'auto' ? getZone(p.zoneId) : null;
  const lines = [];
  if(p.category) lines.push('קטגוריה: ' + esc(p.category));
  if(p.location) lines.push('מיקום: ' + esc(p.location));
  if(p.mode === 'auto') lines.push('השקיה אוטומטית' + (z ? ' · אזור ' + esc(z.name) : ''));
  else if(p.waterInterval) lines.push('השקיה ידנית כל ' + p.waterInterval + ' ימים');
  if(p.fertInterval) lines.push('דישון כל ' + p.fertInterval + ' ימים');
  if(p.lastWater) lines.push('השקיה אחרונה: ' + fmtDate(p.lastWater));
  if(p.lastFert) lines.push('דישון אחרון: ' + fmtDate(p.lastFert));
  if(p.notes) lines.push('הערות: ' + esc(p.notes));
  $('d_meta').innerHTML = lines.join('<br>');
  $('d_chips').innerHTML = plantChips(p).map(c => '<span class="chip ' + c.cls + '">' + esc(c.text) + '</span>').join('');
  $('d_guide').textContent = guideForPlant(p);
  $('d_refreshGuide').style.display = guideIntervalsFor(p) ? '' : 'none';
  $('d_markWater').style.display = p.mode === 'auto' ? 'none' : '';
  const hist = Array.isArray(p.history) ? p.history : [];
  $('d_history').innerHTML = hist.length === 0
    ? '<p class="note">עדיין לא נרשמו טיפולים לצמח הזה.</p>'
    : hist.slice(0, 30).map(h => {
        const d = new Date(h.at);
        const chip = h.type === 'water' ? '<span class="chip auto">השקיה</span>'
          : h.type === 'fert' ? '<span class="chip due">דישון</span>'
          : '<span class="chip over">אבחון</span>';
        const extra = h.type === 'diagnosis' && h.label ? ' · ' + esc(h.label) : '';
        return '<div class="history-item"><span>' + chip + '</span><span class="note">' + new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'numeric',year:'numeric'}).format(d) + extra + '</span></div>';
      }).join('');
  renderJournal(p);
  // היסטוריית טיפולים — ציר זמן
  const treatments = Array.isArray(p.treatments) ? p.treatments : [];
  let treatHTML = '';
  if(treatments.length === 0){
    treatHTML = '<p class="note">עדיין לא נרשמו טיפולים.</p>';
  } else {
    treatHTML = treatments.map(t => {
      const statusChip = t.status === 'improved' ? '<span class="chip auto">✅ השתפר</span>'
        : t.status === 'failed' ? '<span class="chip" style="background:#c0392b;color:#fff">❌ לא השתפר</span>'
        : '<span class="chip due">⏳ במעקב</span>';
      const doneTasks = (t.tasks || []).filter(x => x.done).length;
      const totalTasks = (t.tasks || []).length;
      return '<div class="card" style="margin:6px 0;padding:10px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<div class="note" style="flex:1"><b>' + esc(t.label) + '</b><br>' + fmtDate(t.appliedAt)
        + (totalTasks ? ' · ' + doneTasks + '/' + totalTasks + ' משימות' : '') + '</div>'
        + statusChip + '</div>'
        + (t.beforePhoto ? '<img src="' + t.beforePhoto + '" style="width:50px;height:50px;border-radius:8px;object-fit:cover;margin-top:6px" title="לפני הטיפול">' : '')
        + '</div>';
    }).join('');
  }
  let treatSection = $('d_treatments');
  if(!treatSection){
    treatSection = document.createElement('div');
    treatSection.id = 'd_treatments';
    const histEl = $('d_history');
    histEl.parentElement.insertBefore(treatSection, histEl.nextSibling);
  }
  treatSection.innerHTML = '<h4 style="margin:12px 0 6px">היסטוריית טיפולים 🌱</h4>' + treatHTML;
  openModal('detailModal');
}

/* ================= אבחון בעיות ================= */
const DIAG_LOCATIONS = [
  { id:'leaves', text:'עלים' },
  { id:'stems', text:'גבעולים וענפים' },
  { id:'roots', text:'בסיס הצמח / שורשים' },
  { id:'flowers', text:'פרחים / פירות' },
  { id:'whole', text:'כל הצמח' }
];
const DIAG_SYMPTOMS = [
  { id:'yellowing', text:'עלים מצהיבים' },
  { id:'brown_spots', text:'כתמים חומים או שחורים' },
  { id:'white_powder', text:'אבקה לבנה על העלים' },
  { id:'white_fluff', text:'צמר לבן דביק (כמו צמר גפן)' },
  { id:'wilting', text:'קמילה / נבילה' },
  { id:'dry_edges', text:'קצוות עלים יבשים וחומים' },
  { id:'bugs_visible', text:'חרקים קטנים נראים לעין' },
  { id:'sticky', text:'עלים דביקים או טיפות דביקות' },
  { id:'webbing', text:'קורים דקים על העלים' },
  { id:'deformed_leaves', text:'עלים מעוותים, מסולסלים או קטנים' },
  { id:'leaf_drop', text:'נשירת עלים' },
  { id:'mushy_stem', text:'גבעול או בסיס רך ומימי' },
  { id:'slow_growth', text:'צמיחה איטית או עצורה' },
  { id:'holes', text:'חורים או כרסומים בעלים' }
];
const DIAG_PROBLEMS = [
  { id:'aphids', name:'כנימות עלים', kind:'מזיק',
    locations:['leaves','stems','flowers'], symptoms:['bugs_visible','deformed_leaves','sticky','yellowing','slow_growth'],
    desc:'חרקים קטנים ורכים (ירוקים, שחורים או לבנים) שמתקבצים על עלים צעירים וניצנים ומוצצים את מוהל הצמח.',
    treatment:['שטפו את הצמח בזרם מים חזק, בדגש על צדדי העלים התחתונים.','רססו תמיסת סבון כלים מדוללת (כפית לליטר מים) פעם בשבוע עד שהכנימות נעלמות.','במקרה עקשני — שמן נים או תכשיר ייעודי נגד כנימות לפי הוראות היצרן.'],
    prevention:'בדקו עלים צעירים פעם בשבוע. צמחים חדשים — בודדו לשבוע לפני שמצרפים לגינה.' },
  { id:'spider_mites', name:'אקרית הקורים', kind:'מזיק',
    locations:['leaves'], symptoms:['webbing','yellowing','dry_edges','slow_growth','leaf_drop'],
    desc:'עכבישישים זעירים (כמעט בלתי נראים) שטווים קורים דקים בצד התחתון של העלים וגורמים לנקודות צהובות.',
    treatment:['שטפו היטב את העלים במים, כולל הצד התחתון.','העלו לחות סביב הצמח — האקרית שונאת לחות.','רססו שמן נים או סבון חרקים פעם בשבוע. בודדו את הצמח הנגוע.'],
    prevention:'נגבו אבק מהעלים מדי פעם. באזורים יבשים — רססו מים סביב הצמח.' },
  { id:'mealybugs', name:'כנימה קמחית', kind:'מזיק',
    locations:['leaves','stems'], symptoms:['white_fluff','sticky','yellowing','slow_growth'],
    desc:'גושים לבנים צמריריים במפרקי העלים ובתי השחי של הצמח. מוצצת מוהל ומפרישה טל דבש דביק.',
    treatment:['הסירו כל גוש עם מקלון אוזניים טבול באלכוהול 70%.','רססו שמן נים על כל הצמח, כולל מפרקים.','במקרה חמור — גזמו ושמידו חלקים נגועים קשה.'],
    prevention:'בדקו צמחים חדשים היטב לפני הכנסה הביתה. אוורור טוב מרתיע התפשטות.' },
  { id:'scale', name:'כנימת מגן', kind:'מזיק',
    locations:['stems','leaves'], symptoms:['bugs_visible','sticky','yellowing','slow_growth'],
    desc:'בליטות קטנות, חומות וקשות על גבעולים ועלים — הכנימה מוגנת ב"שריון" ולכן קשה להדברה בריסוס בלבד.',
    treatment:['גרדו בעדינות כל כנימה עם ציפורן או מברשת רכה.','מרחו שמן נים או שמן גנני על האזורים הנגועים.','חזרו על הטיפול פעם בשבוע במשך חודש.'],
    prevention:'בדיקה תקופתית של גבעולים, במיוחד בצמחי בית.' },
  { id:'powdery_mildew', name:'קמחון', kind:'מחלה פטרייתית',
    locations:['leaves','stems'], symptoms:['white_powder','yellowing','deformed_leaves'],
    desc:'שכבת אבקה לבנה על העלים. נפוץ בלחות גבוהה, צפיפות ואוורור לקוי.',
    treatment:['הסירו עלים נגועים קשה והשמידו אותם (לא לקומפוסט).','רססו תמיסת סודה לשתייה — כפית לליטר מים + טיפת סבון כלים.','שפרו אוורור סביב הצמח. במקרה חמור — קוטל פטריות ייעודי.'],
    prevention:'הימנעו מהרטבת העלים בהשקיה. שמרו מרווח בין צמחים.' },
  { id:'leaf_spot', name:'כתמי עלים פטרייתיים', kind:'מחלה פטרייתית',
    locations:['leaves'], symptoms:['brown_spots','yellowing','leaf_drop'],
    desc:'כתמים חומים או שחורים, לעיתים עם הילה צהובה, שמתפשטים בתנאי לחות.',
    treatment:['הסירו עלים נגועים והשמידו אותם — לא להשאיר על האדמה.','השקו רק בבסיס הצמח, לא על העלים.','במקרה מתפשט — קוטל פטריות ייעודי לפי ההוראות.'],
    prevention:'השקיה בבוקר בבסיס הצמח. אוורור טוב ומרווח בין צמחים.' },
  { id:'root_rot', name:'ריקבון שורשים', kind:'מחלה מטיפול לקוי',
    locations:['roots','whole'], symptoms:['wilting','yellowing','mushy_stem','slow_growth','leaf_drop'],
    desc:'שורשים נרקבים מעודף מים וחוסר ניקוז. סימן אופייני: הצמח נבול למרות שהאדמה רטובה.',
    treatment:['הוציאו את הצמח מהעציץ ובדקו שורשים — גזמו כל שורש חום/שחור ורך.','שתלו מחדש באדמה יבשה ומאווררת עם ניקוז טוב.','הפסיקו להשקות עד שהשכבה העליונה מתייבשת לעומק 2–3 ס"מ.'],
    prevention:'עציץ עם חורי ניקוז תמיד. משקים רק כשהאדמה יבשה בעומק אצבע.' },
  { id:'underwatering', name:'חוסר השקיה', kind:'טיפול',
    locations:['whole','leaves'], symptoms:['wilting','dry_edges','leaf_drop','slow_growth'],
    desc:'אדמה יבשה לאורך זמן. העלים קמלים, הקצוות מתייבשים ומחומים.',
    treatment:['השקו ביסודיות עד שמים ניגרים מחורי הניקוז.','לצמח מיובש קשה — השרו את העציץ בדלי מים ל-15 דקות.','הסירו עלים יבשים לגמרי.'],
    prevention:'בדקו לחות אדמה באצבע לפני השקיה. השתמשו בתזכורות ההשקיה באפליקציה.' },
  { id:'overwatering', name:'השקיית יתר', kind:'טיפול',
    locations:['whole','leaves'], symptoms:['yellowing','wilting','slow_growth'],
    desc:'עלים צהובים ורכים, אדמה תמיד רטובה. אם לא מטפלים — מתפתח לריקבון שורשים.',
    treatment:['הפסיקו להשקות עד שהאדמה מתייבשת היטב.','ודאו ניקוז תקין — רוקנו מים עומדים מהצלחת.','שקלו להחליף לאדמה מאווררת יותר.'],
    prevention:'כלל אצבע: עדיף להשקות פחות מאשר יותר. בדקו אדמה לפני כל השקיה.' },
  { id:'iron_deficiency', name:'חוסר ברזל (כלורוזיס)', kind:'חוסר תזונתי',
    locations:['leaves'], symptoms:['yellowing','slow_growth'],
    desc:'העלים מצהיבים אבל העורקים נשארים ירוקים. נפוץ בקרקע בסיסית או אחרי השקיית יתר ממושכת.',
    treatment:['דשנו עם כלאט ברזל לפי הוראות היצרן.','בדקו שהניקוז תקין — שורשים חנוקים לא קולטים ברזל.'],
    prevention:'דישון מאוזן וסדיר. הימנעות מהשקיית יתר כרונית.' },
  { id:'sunburn', name:'כוויית שמש', kind:'סביבה',
    locations:['leaves'], symptoms:['brown_spots','dry_edges'],
    desc:'כתמים בהירים או לבנים שהופכים חומים, אחרי חשיפה פתאומית לשמש חזקה.',
    treatment:['העבירו לצל חלקי והרגילו לשמש בהדרגה.','הסירו עלים שרופים לגמרי — הם לא ישתקמו.'],
    prevention:'הרגלה הדרגתית ("הקשייה") של צמחים שעוברים מצל לשמש.' },
  { id:'fertilizer_burn', name:'דישון יתר', kind:'טיפול',
    locations:['leaves','whole'], symptoms:['dry_edges','yellowing','wilting','slow_growth'],
    desc:'קצוות עלים "שרופים" וחומים שהופיעו זמן קצר אחרי דישון.',
    treatment:['שטפו את האדמה היטב במים נקיים (השקיית שטיפה יסודית).','הפסיקו דישון לחודש לפחות.'],
    prevention:'דשנו תמיד לפי המינון המדויק — עדיף מעט מדי מאשר יותר מדי.' },
  { id:'fungus_gnats', name:'יתושי פטריות', kind:'מזיק',
    locations:['roots','whole'], symptoms:['bugs_visible','wilting','slow_growth'],
    desc:'זבובונים קטנים מרחפים מעל האדמה. הזחלים באדמה פוגעים בשורשים צעירים.',
    treatment:['תנו לשכבה העליונה של האדמה להתייבש בין השקיות.','הציבו מלכודות דבק צהובות ליד הצמח.','פזרו שכבת חול דקה על האדמה — מונע הטלה.'],
    prevention:'לא להשקות יותר מדי. ניקוז טוב ושכבת אדמה עליונה יבשה.' }
];
let diagState = null;
let pendingDiagPhoto = null;

function diagSymptomText(id){ const s = DIAG_SYMPTOMS.find(x => x.id === id); return s ? s.text : id; }
function diagLocationText(id){ const l = DIAG_LOCATIONS.find(x => x.id === id); return l ? l.text : id; }

function openDiagnosis(plantId){
  const p = state.plants.find(x => x.id === plantId);
  if(!p) return;
  diagState = { plantId: plantId, step: 1, photo: null, location: null, symptoms: [], results: [] };
  pendingDiagPhoto = null;
  delete $('dg_locations').dataset.built;
  delete $('dg_symptoms').dataset.built;
  $('dg_locations').innerHTML = '';
  $('dg_symptoms').innerHTML = '';
  $('diagPlantName').textContent = 'צמח: ' + p.name;
  $('dg_preview').innerHTML = '';
  renderDiagStep();
  openModal('diagModal');
}
function renderDiagStep(){
  const st = diagState;
  if(!st) return;
  document.querySelectorAll('#diagModal .diag-step').forEach(el => {
    el.style.display = Number(el.dataset.step) === st.step ? '' : 'none';
  });
  $('dg_back').style.display = st.step > 1 ? '' : 'none';
  $('dg_next').textContent = st.step === 3 ? 'אבחן' : (st.step === 4 ? 'סגור' : 'המשך');
  if(st.step === 2 && !$('dg_locations').dataset.built){
    $('dg_locations').dataset.built = '1';
    $('dg_locations').innerHTML = DIAG_LOCATIONS.map(l =>
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border,#e3e8e3);border-radius:12px;cursor:pointer">'
      + '<input type="radio" name="dgloc" value="' + l.id + '"' + (st.location === l.id ? ' checked' : '') + '> ' + esc(l.text) + '</label>'
    ).join('');
    $('dg_locations').querySelectorAll('input[name="dgloc"]').forEach(r => r.addEventListener('change', () => { st.location = r.value; }));
  }
  if(st.step === 3 && !$('dg_symptoms').dataset.built){
    $('dg_symptoms').dataset.built = '1';
    $('dg_symptoms').innerHTML = DIAG_SYMPTOMS.map(s =>
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border,#e3e8e3);border-radius:12px;cursor:pointer">'
      + '<input type="checkbox" value="' + s.id + '"' + (st.symptoms.includes(s.id) ? ' checked' : '') + '> ' + esc(s.text) + '</label>'
    ).join('');
    $('dg_symptoms').querySelectorAll('input[type="checkbox"]').forEach(c => c.addEventListener('change', () => {
      st.symptoms = Array.from($('dg_symptoms').querySelectorAll('input[type="checkbox"]:checked')).map(x => x.value);
    }));
  }
  if(st.step === 4) renderDiagResults();
}
function diagNext(){
  const st = diagState;
  if(!st) return;
  if(st.step === 4){ closeModal('diagModal'); return; }
  if(st.step === 2 && !st.location){ toast('בחרו איפה הבעיה'); return; }
  if(st.step === 3 && st.symptoms.length === 0){ toast('סמנו לפחות תסמין אחד'); return; }
  if(st.step === 3){ st.results = runDiagnosis(st.location, st.symptoms); }
  st.step++;
  renderDiagStep();
}
function diagBack(){
  const st = diagState;
  if(!st || st.step <= 1) return;
  st.step--;
  renderDiagStep();
}
function runDiagnosis(location, symptoms){
  const scored = DIAG_PROBLEMS.map(pr => {
    const matched = pr.symptoms.filter(s => symptoms.includes(s));
    const symScore = matched.length / pr.symptoms.length;
    const locScore = pr.locations.includes(location) ? 0.3 : 0;
    return { pr: pr, matched: matched, score: symScore * 0.7 + locScore };
  }).filter(x => x.score > 0.12 && x.matched.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored;
}
function renderDiagResults(){
  const st = diagState;
  const box = $('dg_results');
  if(st.results.length === 0){
    box.innerHTML = '<p class="note" style="font-size:15px">לא נמצאה התאמה ברורה לתסמינים שסומנו.</p>'
      + '<p class="note" style="margin-top:8px">נסו לצלם תמונה קרובה של האזור הפגוע ולעקוב אחרי השינויים ביומן הגדילה. אם המצב מחמיר — כדאי להתייעץ במשתלה.</p>'
      + '<div class="btn-row" style="margin-top:12px"><button class="btn secondary" id="dg_saveAny">שמור תיעוד ביומן</button></div>';
    $('dg_saveAny').addEventListener('click', () => saveDiagnosis(null));
    return;
  }
  box.innerHTML = st.results.map((r, i) => {
    const pct = Math.min(95, Math.round(r.score * 100));
    const level = pct >= 60 ? 'התאמה גבוהה' : (pct >= 35 ? 'התאמה בינונית' : 'התאמה נמוכה');
    return '<div class="card" style="margin:0 0 12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
      + '<h3 style="margin:0;font-size:17px">' + (i + 1) + '. ' + esc(r.pr.name) + '</h3>'
      + '<span class="chip ' + (pct >= 60 ? 'due' : 'auto') + '">' + level + ' · ' + pct + '%</span></div>'
      + '<p class="note" style="margin-top:4px">' + esc(r.pr.kind) + '</p>'
      + '<p style="font-size:14px;margin:8px 0">' + esc(r.pr.desc) + '</p>'
      + '<p style="font-size:14px;font-weight:800;margin:8px 0 4px">מה עושים:</p>'
      + '<ol style="font-size:14px;margin:0;padding-right:18px">' + r.pr.treatment.map(t => '<li style="margin-bottom:4px">' + esc(t) + '</li>').join('') + '</ol>'
      + '<p class="note" style="margin-top:8px"><b>מניעה:</b> ' + esc(r.pr.prevention) + '</p>'
      + '<div class="btn-row" style="margin-top:10px"><button class="btn secondary" data-dsave="' + r.pr.id + '">שמור אבחון זה</button></div>'
      + '</div>';
  }).join('')
  + '<p class="note">האבחון מבוסס על מאגר ידע של בעיות נפוצות ואינו מחליף ייעוץ מקצועי במקרה חמור.</p>';
  box.querySelectorAll('[data-dsave]').forEach(b => b.addEventListener('click', () => {
    const pr = DIAG_PROBLEMS.find(x => x.id === b.dataset.dsave);
    saveDiagnosis(pr);
  }));
}
async function handleDiagPhoto(file){
  if(!file) return;
  try{
    pendingDiagPhoto = await compressImageFile(file);
    if(diagState) diagState.photo = pendingDiagPhoto;
    $('dg_preview').innerHTML = '<img src="' + pendingDiagPhoto + '" style="width:100%;border-radius:12px" alt="">';
    $('dg_aiBtn').style.display = '';
    $('dg_aiResult').style.display = 'none';
  }catch(e){ toast('לא הצלחתי לקרוא את התמונה'); }
}
async function runAiDiagnosis(){
  const btn = $('dg_aiBtn'), box = $('dg_aiResult');
  if(!pendingDiagPhoto){ toast('צלמו תמונה קודם'); return; }
  btn.disabled = true; btn.textContent = 'מנתח…';
  box.style.display = 'block'; box.textContent = 'ה־AI בודק את התמונה…';
  try{
    const plantName = ($('diagPlantName') && $('diagPlantName').textContent) || 'צמח';
    const text = await window.aiDiagnosePhoto(pendingDiagPhoto, plantName);
    if(text){
      let html = '🤖 אבחון AI:\n' + text;
      if(diagState) diagState.aiResult = text;
      // הצלבה — בדיקה עצמאית שנייה מאמתת את האבחון
      box.textContent = html + '\n\n🔍 מצליב עם בדיקה נוספת…';
      const verify = await window.aiVerifyDiagnosis(pendingDiagPhoto, plantName, text);
      if(verify){
        html += '\n\n' + (verify.agrees
          ? '✅ הצלבה: בדיקה עצמאית אישרה את האבחון' + (verify.note ? ' — ' + verify.note : '')
          : '⚠️ הצלבה: בדיקה עצמאית לא הסכימה — ' + (verify.note || 'כדאי לבדוק ידנית'));
        if(diagState) diagState.aiVerify = verify;
      }
      box.textContent = html;
    }else{
      box.textContent = 'ה־AI לא זמין כרגע — המשיכו עם האבחון הידני.';
    }
  }catch(e){
    box.textContent = 'ה־AI לא זמין כרגע — המשיכו עם האבחון הידני.';
  }
  btn.disabled = false; btn.textContent = '🤖 אבחון AI מהתמונה';
}
function saveDiagnosis(problem){
  const st = diagState;
  if(!st) return;
  const p = state.plants.find(x => x.id === st.plantId);
  if(!p) return;
  const label = problem ? problem.name : 'תיעוד בעיה (ללא אבחנה)';
  if(!Array.isArray(p.history)) p.history = [];
  const entry = { id: uid(), type: 'diagnosis', at: new Date().toISOString(), label: label,
    location: st.location, symptoms: st.symptoms.slice() };
  if(st.aiResult) entry.aiResult = st.aiResult;
  p.history.unshift(entry);
  if(st.photo){
    getJournal(p).push({ id: uid(), date: todayStr(), photo: st.photo, note: 'אבחון: ' + label });
  }
  save(); closeModal('diagModal'); openDetail(p.id);
  toast('האבחון נשמר ונרשם ביומן');
}

/* ================= תמונות ================= */
function compressImageFile(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try{
        const maxDim = 800;
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}
function dataURLtoBlob(dataURL){
  return fetch(dataURL).then(r => r.blob());
}

/* ================= זיהוי פלנטנט ================= */
async function identifyFromDataURL(dataURL){
  lastIdentifyPhoto = dataURL;
  const body = $('identifyBody');
  // זיהוי דרך Gemini (AI Logic) — לא דורש מפתח
  body.innerHTML = '<div class="spinner"></div><p class="note" style="text-align:center">מזהה את הצמח עם AI…</p>';
  openModal('identifyModal');
  const wireManual = (btnId, extra) => {
    const b = $(btnId);
    if(b) b.addEventListener('click', () => { closeModal('identifyModal'); openPlantForm(null, Object.assign({ photo: lastIdentifyPhoto }, extra || {})); });
  };
  try{
    const found = await window.aiIdentifyPhoto(dataURL);
    if(found && found.name){
      body.innerHTML = '<p class="note" style="margin-bottom:12px">ה־AI זיהה:</p>'
        + '<div class="card" style="margin:0 0 12px;padding:14px;text-align:center">'
        + '<div style="font-size:20px;font-weight:800">' + esc(found.name) + '</div>'
        + (found.scientific ? '<div class="note" style="font-style:italic">' + esc(found.scientific) + '</div>' : '')
        + '</div>'
        + '<div class="btn-row"><button class="btn" id="idAccept">הוסף את ' + esc(found.name) + ' לגינה</button>'
        + '<button class="btn secondary" id="idManualAi">הוסף ידנית במקום</button></div>';
      wireManual('idAccept', { name: found.name });
      wireManual('idManualAi');
      return;
    }
    throw new Error('no-result');
  }catch(e){
    body.innerHTML = '<p class="note" style="font-size:15px;color:var(--text)">הזיהוי האוטומטי לא הצליח כרגע.</p>'
      + '<p class="note" style="margin-top:8px">אפשר לנסות שוב עם תמונה ברורה יותר, או להוסיף ידנית.</p>'
      + '<div class="btn-row"><button class="btn" id="idManual">הוסף ידנית עם התמונה הזו</button>'
      + '<button class="btn secondary" id="idRetry">נסה שוב</button></div>';
    wireManual('idManual');
    const rb = $('idRetry');
    if(rb) rb.addEventListener('click', () => identifyFromDataURL(dataURL));
  }
}

/* ================= גיבוי ושחזור ================= */
function exportBackup(){
  try{
    const payload = { app:'plant-tracker', version:1, exportedAt:new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plant-tracker-backup-' + todayStr() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    $('backupStatus').textContent = 'הגיבוי יוצא בהצלחה. שמרו את הקובץ במקום בטוח.';
  }catch(e){ toast('ייצוא הגיבוי נכשל'); }
}
function importBackupFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const payload = JSON.parse(reader.result);
      const data = (payload && payload.data) ? payload.data : payload;
      if(!data || !Array.isArray(data.plants)) throw new Error('bad backup');
      if(!confirm('לייבא את הגיבוי? הנתונים הנוכחיים באפליקציה יוחלפו בנתוני הגיבוי.')) return;
      state = Object.assign(defaultState(), data);
      save(); renderAll();
      $('backupStatus').textContent = 'הגיבוי יובא בהצלחה (' + state.plants.length + ' צמחים).';
      toast('הגיבוי שוחזר');
    }catch(e){ toast('קובץ הגיבוי לא תקין'); }
  };
  reader.onerror = () => toast('לא הצלחתי לקרוא את הקובץ');
  reader.readAsText(file);
}

/* ================= התראות ================= */
const VAPID_PUBLIC_KEY = 'BJEdu0JGAvyFARUjMsqLHj7Y62EABtCZ-Y8bEVMcilRap8kN2IwgqN8BQE3XonS53uyJ3n0wuzTLimVM6I6ENgY';
function urlB64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for(let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function renderNotif(){
  const n = state.notif || {};
  const enabled = !!n.enabled;
  $('notifDot').classList.toggle('on', enabled);
  $('notifStatus').textContent = enabled ? 'ההתראות פעילות' : 'ההתראות כבויות';
  $('notifEnable').textContent = enabled ? 'עדכן קוד רישום' : 'הפעל התראות';
  if(n.code){
    $('notifCodeWrap').style.display = 'block';
    $('notifCode').value = n.code;
  }
  if(enabled && !n.code){
    $('notifHint').textContent = 'ההרשאה ניתנה. לחץ שוב על הפעלה כדי לקבל קוד רישום.';
  }
}
async function enableNotifications(){
  const hint = $('notifHint');
  if(!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)){
    hint.textContent = 'המכשיר או הדפדפן הזה לא תומך בהתראות. באייפון צריך לפתוח את האפליקציה מהאייקון שבמסך הבית.';
    return;
  }
  const perm = await Notification.requestPermission();
  if(perm !== 'granted'){
    hint.textContent = 'ההרשאה להתראות לא אושרה. אפשר לאשר אותה בהגדרות הטלפון עבור האפליקציה.';
    return;
  }
  try{
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(sub){
      try{
        const key = sub.getKey ? sub.getKey('p256dh') : null;
        if(!key) throw new Error('stale sub');
      }catch(e){ await sub.unsubscribe(); sub = null; }
    }
    if(!sub){
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
    }
    // שמירת המנוי במצב — מסונכרן לענן, וקוד הרישום למטה מאפשר שליחה מהשרת
    state.pushSub = sub.toJSON();
    const json = JSON.stringify(sub.toJSON());
    const code = btoa(unescape(encodeURIComponent(json)));
    state.notif = { enabled: true, code: code, at: new Date().toISOString(), lastDay: (state.notif || {}).lastDay || '' };
    save(); renderNotif();
    reg.showNotification('מעקב צמחים', { body: 'ההתראות הופעלו. מעכשיו תזכורות הטיפול יגיעו גם לכאן.', icon: 'icon.svg' });
    toast('ההתראות פעילות');
  }catch(e){
    hint.textContent = 'לא הצלחתי להפעיל התראות במכשיר הזה. ודא שהאפליקציה פתוחה מהאייקון במסך הבית ונסה שוב.';
  }
}
async function testNotification(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const n = dueTasks().length;
    reg.showNotification('מעקב צמחים', {
      body: n > 0 ? ('יש ' + n + ' טיפולים שמחכים לך היום') : 'אין טיפולים להיום — הצמחים מסודרים.',
      icon: 'icon.svg'
    });
  }catch(e){ toast('ההתראות לא זמינות כאן'); }
}
/* התראת סיכום פעם ביום, כשפותחים את האפליקציה */
async function maybeNotifyOnOpen(){
  try{
    if(!state.notif || !state.notif.enabled) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(state.notif.lastDay === todayStr()) return;
    const tasks = dueTasks();
    state.notif.lastDay = todayStr(); save();
    if(tasks.length === 0) return;
    const reg = await navigator.serviceWorker.ready;
    const names = tasks.slice(0, 3).map(t => t.p.name).join(', ');
    reg.showNotification('מעקב צמחים — טיפולים להיום', {
      body: tasks.length + ' טיפולים מחכים: ' + names + (tasks.length > 3 ? ' ועוד' : ''),
      icon: 'icon.svg'
    });
  }catch(e){ /* התראות הן תוספת — לא חוסם שימוש */ }
}

/* ================= אירועים ================= */
$('homeSearch').addEventListener('input', renderHome);
$('plantsSearch').addEventListener('input', renderPlants);
$('homeAddPlant').addEventListener('click', () => openPlantForm(null));
$('plantsAdd').addEventListener('click', () => openPlantForm(null));
$('actPlants').addEventListener('click', () => showScreen('plants'));
$('actToday').addEventListener('click', () => {
  showScreen('home');
  setTimeout(() => $('todayTitle').scrollIntoView({ behavior:'smooth', block:'start' }), 60);
});
$('bellBtn').addEventListener('click', () => {
  showScreen('home');
  setTimeout(() => $('todayTitle').scrollIntoView({ behavior:'smooth', block:'start' }), 60);
});
$('actIdentify').addEventListener('click', () => $('identifyInput').click());
$('cameraBtn').addEventListener('click', () => $('identifyInput').click());

$('identifyInput').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const dataURL = await compressImageFile(file);
    identifyFromDataURL(dataURL);
  }catch(err){ toast('לא הצלחתי לקרוא את התמונה'); }
});

$('f_photoBtn').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    pendingPhoto = await compressImageFile(file);
    updateFormPhotoPreview();
  }catch(err){ toast('לא הצלחתי לקרוא את התמונה'); }
});
$('f_category').addEventListener('change', updateFormPhotoPreview);
$('f_identifyBtn').addEventListener('click', async () => {
  if(!pendingPhoto){ toast('קודם בחרו או צלמו תמונה לצמח'); return; }
  closeModal('plantModal');
  identifyFromDataURL(pendingPhoto);
});
document.querySelectorAll('input[name="fmode"]').forEach(r => r.addEventListener('change', updateModeUI));
$('plantSave').addEventListener('click', savePlant);

$('d_markWater').addEventListener('click', () => markCare($('detailModal').dataset.plantId, 'water'));
$('d_updatePhoto').addEventListener('click', () => $('d_photoInput').click());
$('d_refreshGuide').addEventListener('click', refreshFromGuide);
$('d_photoInput').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  const p = state.plants.find(x => x.id === $('detailModal').dataset.plantId);
  if(!p) return;
  try{
    if(!Array.isArray(p.photoHistory)) p.photoHistory = [];
    if(p.photo) p.photoHistory.unshift({ at: p.lastPhotoAt || new Date().toISOString(), photo: p.photo });
    p.photo = await compressImageFile(f);
    p.lastPhotoAt = new Date().toISOString();
    if(!Array.isArray(p.history)) p.history = [];
    p.history.unshift({ id: uid(), type: 'photo', at: new Date().toISOString(), label: 'תמונה עודכנה' });
    save(); openDetail(p.id); renderAll();
    toast('התמונה עודכנה ✅');
  }catch(err){ toast('לא הצלחתי לקרוא את התמונה'); }
});
$('d_markFert').addEventListener('click', () => markCare($('detailModal').dataset.plantId, 'fert'));
$('d_edit').addEventListener('click', () => {
  const id = $('detailModal').dataset.plantId;
  closeModal('detailModal'); openPlantForm(id);
});
$('d_delete').addEventListener('click', () => {
  const id = $('detailModal').dataset.plantId;
  const p = state.plants.find(x => x.id === id);
  if(!p) return;
  if(!confirm('למחוק את הצמח "' + p.name + '"? גם היסטוריית הטיפולים שלו תימחק.')) return;
  if(!Array.isArray(state.deletedPlants)) state.deletedPlants = [];
  state.deletedPlants.push({ id: id, deletedAt: new Date().toISOString() });
  state.plants = state.plants.filter(x => x.id !== id);
  save(); closeModal('detailModal'); renderAll(); toast('הצמח נמחק');
});

/* יומן גדילה */
$('d_journalAdd').addEventListener('click', () => openJournalPhoto($('detailModal').dataset.plantId));
$('d_compareBtn').addEventListener('click', () => openCompare($('detailModal').dataset.plantId));
$('journalPhotoInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(f) handleJournalPhoto(f);
});
$('journalSave').addEventListener('click', saveJournalEntry);
$('compareReset').addEventListener('click', () => {
  compareSel = [];
  $('compareView').style.display = 'none';
  $('compareHint').style.display = '';
  $('comparePick').querySelectorAll('[data-cmp]').forEach(x => x.style.borderColor = 'transparent');
});

/* אבחון בעיות */
$('d_diagnose').addEventListener('click', () => {
  const pid = $('detailModal').dataset.plantId;
  closeModal('detailModal');
  openDiagnosis(pid);
});
$('dg_photoBtn').addEventListener('click', () => $('diagPhotoInput').click());
$('dg_aiBtn').addEventListener('click', runAiDiagnosis);
$('diagPhotoInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(f) handleDiagPhoto(f);
});
$('dg_next').addEventListener('click', diagNext);
$('dg_back').addEventListener('click', diagBack);

/* סנכרון ענן */
$('syncSignIn').addEventListener('click', signInGoogle);
$('syncSignOut').addEventListener('click', () => { if(fbAuth) fbAuth.signOut(); });
$('syncNow').addEventListener('click', pullCloud);

/* השקיה */
$('sysSave').addEventListener('click', () => {
  state.systemName = $('sysName').value.trim();
  save(); toast('שם המערכת נשמר');
});
$('zoneAddBtn').addEventListener('click', () => openZoneForm(null));
$('zoneCancel').addEventListener('click', closeZoneForm);
$('zoneSave').addEventListener('click', saveZone);
$('tuyaRefresh').addEventListener('click', refreshTuyaStatus);
$('rainDelayBtn').addEventListener('click', () => setRainDelay(true));
$('rainDelayOffBtn').addEventListener('click', () => setRainDelay(false));
$('tuyaImport').addEventListener('click', importTuyaSettings);
$('schedAddBtn').addEventListener('click', () => openSchedForm(null));
$('schedCancel').addEventListener('click', closeSchedForm);
$('schedSave').addEventListener('click', saveSched);
$('tuyaSaveId').addEventListener('click', () => {
  state.tuyaDeviceId = ($('tuyaDeviceId').value || '').trim();
  save(); toast('מזהה הבקר נשמר');
});

/* הגדרות */
$('notifEnable').addEventListener('click', enableNotifications);
$('notifTest').addEventListener('click', testNotification);
$('notifCopy').addEventListener('click', async () => {
  const code = $('notifCode').value;
  if(!code){ toast('אין קוד להעתקה עדיין'); return; }
  try{ await navigator.clipboard.writeText(code); toast('הקוד הועתק'); }
  catch(e){
    $('notifCode').select();
    try{ document.execCommand('copy'); toast('הקוד הועתק'); }
    catch(e2){ toast('אפשר להעתיק את הקוד ידנית מהתיבה'); }
  }
});

/* גיבוי */
$('backupExport').addEventListener('click', exportBackup);
$('backupImportBtn').addEventListener('click', () => $('backupImport').click());
$('backupImport').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(f) importBackupFile(f);
});
async function renderHistory(){
  const wrap = $('historyWrap'), list = $('historyList');
  if(!fbUser || !fbDb){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const items = await listHistorySnapshots();
  if(!items.length){ list.textContent = 'עדיין אין גיבויים אוטומטיים. גיבוי ראשון יישמר בסנכרון הבא.'; return; }
  list.innerHTML = items.map(h => {
    const d = new Date(h.at);
    const label = d.toLocaleDateString('he-IL', { day:'numeric', month:'numeric', year:'numeric' }) + ' ' + d.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
    const n = (h.plants || []).length;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee">'
      + '<span>' + esc(label) + ' · ' + n + ' צמחים</span>'
      + '<button class="btn secondary" style="padding:4px 10px;font-size:12px" data-restore="' + esc(h.id) + '">שחזר</button></div>';
  }).join('');
  list.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
    if(await restoreHistorySnapshot(b.dataset.restore)) renderHistory();
  }));
}

/* ================= אתחול ================= */
$('dateLine').textContent = new Intl.DateTimeFormat('he-IL', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date());
buildDaysPicker([]);

/* זריעת צמחים ראשונית מעדן (רץ פעם אחת — בודק לפי מזהה ייחודי) */
(function seedEdenPlants(){
  try{
    const seeds = [
      { seedId: 'eden-wormwood-1', name: 'לענה 1', category: 'עשבי תיבול', location: 'עדנית גדולה', photo: 'img/wormwood-1.jpg',
        notes: 'לענה (Artemisia) — בעדנית גדולה עם לענה 2 וצמח נוסף. שימושים: חליטת תה מסורתית לעיכול; צמח מרפא עממי; דוחה חרקים ומזיקים בגינה; צמח נוי בעל עלווה כסופה.' },
      { seedId: 'eden-wormwood-2', name: 'לענה 2', category: 'עשבי תיבול', location: 'עדנית גדולה', photo: 'img/wormwood-2.jpg',
        notes: 'לענה (Artemisia) — בעדנית גדולה עם לענה 1 וצמח נוסף. שימושים: חליטת תה מסורתית לעיכול; צמח מרפא עממי; דוחה חרקים ומזיקים בגינה; צמח נוי בעל עלווה כסופה.' },
      { seedId: 'eden-blueberry-1', name: 'אוכמניות בילוקסי 1', category: 'גינה', location: 'עדנית לבד במרפסת', photo: 'img/blueberry-before.jpg',
        notes: 'בעדנית לבד. תמונת "לפני" מנובמבר 2025 — סימני כלורוזיס מחוסר חומציות. טיפול: גופרית 2.5 כפות + דשן סתיו 50-75 גרם (אוקטובר 2026). לוז קבוע: גופרית במרץ/יוני/ספטמבר, דשן אביב במרץ, דשן סתיו באוגוסט.' },
      { seedId: 'eden-blueberry-2', name: 'אוכמניות בילוקסי 2 (קטן)', category: 'גינה', location: 'עדנית ארוכה עם שיח רוזמרין', photo: 'img/blueberry-2-before.jpg',
        notes: 'השתיל הקטן — חולק עדנית ארוכה עם שיח רוזמרין. תמונת "לפני" מנובמבר 2025. טיפול: גופרית + דשן סתיו (אוקטובר 2026). לוז קבוע: גופרית במרץ/יוני/ספטמבר, דשן אביב במרץ, דשן סתיו באוגוסט.' },
      { seedId: 'eden-zutah-1', name: 'זוטה לבנה', category: 'עשבי תיבול', location: 'עדנית גדולה', photo: 'img/zutah-1.jpg',
        notes: 'זוטה לבנה (Micromeria fruticosa) — בעדנית גדולה עם שתי הלענות. טיפול: שמש מלאה עד חצי צל, עמיד ליובש — להשקות רק כשהאדמה יבשה. דישון קל: KF-10 חודשי. לגזום קצוות בסוף הקיץ. שימוש: תה מסורתי לעיכול, הצטננות וכאבי בטן.' },
      { seedId: 'eden-parsley-1', name: 'פטרוזיליה', category: 'עשבי תיבול', location: 'עדנית חדשה', photo: 'img/parsley-1.jpg',
        notes: 'פטרוזיליה — בעדנית חדשה עם מרווה. טיפול: שמש מלאה עד חצי צל, אדמה לחה אך לא רטובה. דישון קל: KF-10 חודשי או KF G&B מדולל. שימוש: תבלין למטבח.' },
      { seedId: 'eden-sage-1', name: 'מרווה', category: 'עשבי תיבול', location: 'עדנית חדשה', photo: 'img/sage-web.jpg',
        notes: 'מרווה (Salvia officinalis) — בעדנית חדשה עם פטרוזיליה. טיפול: שמש מלאה, ניקוז מעולה, להשקות רק כשהאדמה יבשה — שונאת עודף מים. דישון מינימלי: KF-10 לעיתים. שימוש: תה, תבלין, צמח מרפא מסורתי.' },
      { seedId: 'eden-mint-1', name: 'נענע', category: 'עשבי תיבול', location: 'עדנית גדולה נענע (לבד)', photo: 'img/mint-1.jpg',
        notes: 'נענע — בעדנית גדולה לבד. טיפול: שמש עד חצי צל, אוהבת מים — אדמה לחה. מתפשטת באגרסיביות — לתחום. דישון קל: KF-10 חודשי. שימוש: תה, קוקטיילים, מטבח.' },
      { seedId: 'eden-pepper-1', name: 'פלפל צ׳ילי', category: 'גינה', location: 'עדנית חדשה פלפל ובזיליקום', photo: 'img/pepper-1.jpg',
        notes: 'פלפל צ׳ילי — בעדנית חדשה עם 3 שתילי בזיליקום. טיפול: שמש מלאה, השקיה סדירה — אדמה לחה. דישון: KF G&B ‏2–3 מ"ל/ליטר בעונת הצמיחה + KF-10 חודשי. שימוש: תבלין חריף למטבח.' },
      { seedId: 'eden-basil-1', name: 'בזיליקום (3 שתילים)', category: 'עשבי תיבול', location: 'עדנית חדשה פלפל ובזיליקום', photo: 'img/basil-1.jpg',
        notes: '3 שתילי בזיליקום — בעדנית חדשה עם פלפל צ׳ילי. טיפול: שמש מלאה, השקיה סדירה. לקטום פריחה לעידוד עלים. דישון קל: KF-10 חודשי. שימוש: תבלין למטבח (פסטו, סלטים).' },
      { seedId: 'eden-lavender-1', name: 'לוונדר (3 שתילים)', category: 'פורחים', location: 'עדנית לוונדר', photo: 'img/lavender-2.jpg',
        notes: '3 שתילי לוונדר בעדנית. טיפול: שמש מלאה, ניקוז מעולה, השקיה מועטה — עמיד ליובש. דישון מינימלי: KF-10 לעיתים. לגזום אחרי פריחה לעידוד צימוח. שימוש: ריח, תה, דוחה חרקים, נוי.' },
      { seedId: 'eden-ficus-1', name: 'פיקוס גומי', category: 'בית', location: 'עדנית פיקוס וקורדילין', photo: 'img/ficus-cordyline-1.jpg',
        notes: 'פיקוס גומי (Ficus elastica) — בעדנית עם קורדילין. טיפול: אור בהיר עקיף, השקיה מתונה — לתת לאדמה להתייבש בין השקיות. דישון קל: KF G&B מדולל בעונת הצמיחה. צמח נוי.' },
      { seedId: 'eden-cordyline-1', name: 'קורדילין', category: 'בית', location: 'עדנית פיקוס וקורדילין', photo: 'img/ficus-cordyline-1.jpg',
        notes: 'קורדילין — בעדנית עם פיקוס גומי. טיפול: אור בהיר, השקיה סדירה — אוהב לחות אך לא בוץ. דישון קל: KF-10 חודשי. צמח נוי בעל עלווה צבעונית.' },
      { seedId: 'eden-lemongrass-1', name: 'לימונית (עשב לימון)', category: 'עשבי תיבול', location: 'עדנית לימונית ורוזמרין', photo: 'img/lemongrass-1.jpg',
        notes: 'לימונית (Cymbopogon) — בעדנית עם 2 שיחי רוזמרין. טיפול: שמש מלאה, השקיה מרובה — אוהבת מים וחום. דישון: KF G&B ‏2–3 מ"ל/ליטר בעונת הצמיחה. רגישה לקור — להגן בחורף. שימוש: תה, תבלין אסייתי.' },
      { seedId: 'eden-rosemary-1', name: 'רוזמרין (2 שיחים)', category: 'עשבי תיבול', location: 'עדנית לימונית ורוזמרין', photo: 'img/rosemary-web.jpg',
        notes: '2 שיחי רוזמרין — בעדנית עם לימונית. (שיח רוזמרין נוסף חולק עדנית ארוכה עם אוכמניות 2.) טיפול: שמש מלאה, ניקוז מעולה, מעט מים. דישון מינימלי. שימוש: תבלין, תה, צמח מרפא.' },
      { seedId: 'eden-melissa-1', name: 'מליסה (לימונית רפואית)', category: 'עשבי תיבול', location: 'עדנית לואיזה עם מליסה', photo: 'img/louisa-melissa-3.jpg',
        notes: 'מליסה (Melissa officinalis) — בעדנית עם לימונית. מצב: עייפה מעט, צמיחה דלילה — מומלץ גיזום חזק בסוף הקיץ. טיפול: שמש עד חצי צל, השקיה סדירה — אדמה לחה. דישון קל: KF-10 חודשי. שימוש: תה מרגיע — לשינה טובה ועיכול.' },
      { seedId: 'eden-lemongrass-2', name: 'לואיזה (ורבנה לימונית)', category: 'עשבי תיבול', location: 'עדנית לואיזה עם מליסה', photo: 'img/louisa-2.jpg',
        notes: 'לואיזה (Aloysia citrodora) — לא עשב לימון! בעדנית עם מליסה. מצב: נשירה בסתיו — תקין, תחזור באביב. טיפול: שמש מלאה, השקיה סדירה בקיץ, גיזום חזק בסוף החורף. דישון: KF-10 חודשי בעונת הצמיחה. שימוש: תה לימוני מרגיע — לעיכול ושינה טובה.' },
      { seedId: 'eden-passionfruit-1', name: 'פסיפלורה', category: 'גינה', location: 'עדנית גדולה פסיפלורה (לבד)', photo: 'img/passionfruit-web.jpg',
        notes: 'פסיפלורה — בעדנית גדולה לבד. טיפול: שמש מלאה, השקיה מרובה — אדמה לחה תמיד. צרכנית כבדה: KF G&B ‏3–4 מ"ל/ליטר בעונת הצמיחה + KF-10 חודשי. צריכה הדלייה/תמיכה לטיפוס. רגישה לקור — להגן בחורף. שימוש: פרי טרופי.' },
    ];
    let added = false;
    for(const s of seeds){
      if(!state.plants.some(p => p.seedId === s.seedId)){
        state.plants.push(Object.assign({ id: uid(), history: [], mode: 'manual', waterInterval: 0, fertInterval: 0, lastWater: null, lastFert: null }, s));
        added = true;
      }
    }
    if(added) save();
    /* תיקון חד-פעמי: אוכמניות 1 בעדנית לבד */
    const bb1 = state.plants.find(p => p.seedId === 'eden-blueberry-1');
    if(bb1 && bb1.location === 'מרפסת'){
      bb1.location = 'עדנית לבד במרפסת';
      if(!bb1.notes.startsWith('בעדנית לבד.')) bb1.notes = 'בעדנית לבד. ' + bb1.notes;
      save();
    }
    /* תיקון חד-פעמי: לענות בעדנית גדולה */
    for(const wid of ['eden-wormwood-1', 'eden-wormwood-2']){
      const w = state.plants.find(p => p.seedId === wid);
      if(w && (w.location === 'מרפסת' || w.location === 'עדנית גדולה' && !w.notes.includes('בעדנית גדולה עם'))){
        w.location = 'עדנית גדולה';
        if(!w.notes.includes('בעדנית גדולה')) w.notes = w.notes.replace('לענה (Artemisia) —', 'לענה (Artemisia) — בעדנית גדולה עם לענה נוספת וצמח נוסף.');
        save();
      }
    }
    const bb2 = state.plants.find(p => p.seedId === 'eden-blueberry-2');
    if(bb2 && bb2.location === 'מרפסת'){
      bb2.name = 'אוכמניות בילוקסי 2 (קטן)';
      bb2.location = 'עדנית ארוכה עם שיח רוזמרין';
      bb2.notes = 'השתיל הקטן — חולק עדנית ארוכה עם שיח רוזמרין. ' + bb2.notes;
      save();
    }
  }catch(e){}
})();

seedPlanters();

renderAll();
fbInit();
maybeNotifyOnOpen();

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* הרצה מקומית מקובץ — מתעלמים */ });
  });
}
