import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAY2Qm46g5CCMiAQsIO4UMM1QMYIMuZMr0",
  authDomain: "cs-tracker-23ef9.firebaseapp.com",
  projectId: "cs-tracker-23ef9",
  storageBucket: "cs-tracker-23ef9.firebasestorage.app",
  messagingSenderId: "107901431900",
  appId: "1:107901431900:web:def2e585c9ce5ea5c37699"
};
const app  = initializeApp(firebaseConfig);
const db   = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const auth = getAuth(app);

let customers=[],jobs=[],recurring=[],expenses=[],payments=[],bids=[],partners=[];
let learnedMins={}; // Craig's learned flag hours — overrides PRICE_LIST defaults
let editingCustomerId=null,editingJobId=null,editingRecurringId=null;
let editingExpenseId=null,editingBidId=null,editingPartnerId=null;
let activeCustomerDetailId=null,plFirstVisit=false,_referralMatchId=null,_referralMatchName=null;

window.checkReferralMatch=function(){
  const text=el("customerReferredBy")?.value.trim()||"";
  const sugg=el("referralSuggestion");
  if(!sugg)return;
  _referralMatchId=null;_referralMatchName=null;
  if(text.length<2){sugg.style.display="none";return;}
  const tl=text.toLowerCase();
  const match=customers.find(c=>{
    if(!c.name)return false;
    if(c.id===editingCustomerId)return false;
    const nl=(c.name||"").toLowerCase();
    return nl===tl||nl.includes(tl)||tl.includes(nl);
  });
  if(match){
    _referralMatchId=match.id;_referralMatchName=match.name;
    el("referralSuggestionText").innerHTML=`Did you mean <b>${safe(match.name)}</b> from your customer list?`;
    sugg.style.display="block";
  }else{sugg.style.display="none";}
};

window.confirmReferralMatch=function(){
  if(!_referralMatchId)return;
  el("customerReferredBy").value=_referralMatchName;
  el("referralSuggestion").style.display="none";
  el("customerReferredBy").dataset.linkedId=_referralMatchId;
  showToast("Referral linked to "+_referralMatchName);
};

window.dismissReferralMatch=function(){
  el("referralSuggestion").style.display="none";
  el("customerReferredBy").dataset.linkedId="";
  _referralMatchId=null;_referralMatchName=null;
};

const appRoot=document.getElementById("app");
const bottomNav=document.getElementById("bottomNav");
const fabButton=document.getElementById("fabButton");
const fabMenu=document.getElementById("fabMenu");

const money=n=>Number(n||0).toLocaleString(undefined,{style:"currency",currency:"USD"});
const today=()=>new Date().toISOString().slice(0,10);
const el=id=>document.getElementById(id);
function safe(v){const _m={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};return String(v||"").replace(/[&<>"']/g,c=>_m[c]);}
function cleanPhone(p){return String(p||"").replace(/\D/g,"");}
function dateLabel(v){if(!v)return"";const d=new Date(v+"T00:00:00");return isNaN(d)?v:d.toLocaleDateString();}
function timeLabel(v){if(!v)return"";const[h,m]=v.split(":");let hr=Number(h);const ap=hr>=12?"PM":"AM";hr=hr%12||12;return`${hr}:${m||"00"} ${ap}`;}
function addDays(dv,days){const d=new Date((dv||today())+"T00:00:00");d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
function daysBetween(from,to){if(!from||!to)return 0;return Math.max(0,Math.floor((new Date(to+"T00:00:00")-new Date(from+"T00:00:00"))/(1000*60*60*24)));}

// Haversine formula — straight-line distance between two lat/lng points in miles
// OpenRouteService API key — real driving distance
const ORS_API_KEY="eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdlYzRjZTg3NGJlNDRlNDE4NjJiMzQ3ZWMzOTNiYzhmIiwiaCI6Im11cm11cjY0In0=";

// Haversine — straight-line fallback only
function haversineMiles(lat1,lng1,lat2,lng2){
  const R=3958.8;
  const dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Calculate travel fee using real ORS driving distance
async function calcTravelFee(address){
  if(!address||address.trim().length<5)return{fee:0,miles:null,note:"Enter an address first."};
  try{
    // Step 1: Geocode the property address
    const geoRes=await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&boundary.country=US&size=1`);
    const geoData=await geoRes.json();
    if(!geoData.features||!geoData.features.length)return{fee:25,miles:null,note:"Address not found — enter full address with city and state."};
    const [destLng,destLat]=geoData.features[0].geometry.coordinates;

    // Step 2: Get actual driving distance from Craig's office
    const dirRes=await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${ORIGIN_LNG},${ORIGIN_LAT}&end=${destLng},${destLat}`);
    const dirData=await dirRes.json();
    if(!dirData.features||!dirData.features.length)throw new Error("No route");

    const meters=dirData.features[0].properties.segments[0].distance;
    const miles=Math.round((meters*0.000621371)*10)/10;

    if(miles<=TRAVEL_FREE_MILES)return{fee:0,miles,note:`${miles} mi — within ${TRAVEL_FREE_MILES} mi, no charge.`};
    const fee=Math.round(miles*TRAVEL_PER_MILE);
    return{fee,miles,note:`${miles} driving mi × $${TRAVEL_PER_MILE}/mi = ${money(fee)}`};

  }catch(e){
    // Straight-line fallback if API unavailable
    try{
      const gr=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,{headers:{"User-Agent":"5CsTracker/1.0"}});
      const gd=await gr.json();
      if(gd&&gd.length){
        const miles=Math.round(haversineMiles(ORIGIN_LAT,ORIGIN_LNG,parseFloat(gd[0].lat),parseFloat(gd[0].lon))*10)/10;
        const fee=Math.round(miles*TRAVEL_PER_MILE);
        return{fee,miles,note:`~${miles} mi (approx.) × $${TRAVEL_PER_MILE}/mi = ${money(fee)}`};
      }
    }catch(e2){}
    return{fee:25,miles:null,note:"Could not calculate — adjust fee manually."};
  }
}
function isPastDue(dv){if(!dv)return false;return new Date(dv+"T00:00:00")<new Date(today()+"T00:00:00");}
function overdueLabel(dv){if(!dv||!isPastDue(dv))return"";const days=Math.floor((new Date(today()+"T00:00:00")-new Date(dv+"T00:00:00"))/86400000);return days===1?"1 day overdue":`${days} days overdue`;}

function showToast(msg){let t=el("appToast");if(!t){t=document.createElement("div");t.id="appToast";t.className="toast";document.body.appendChild(t);}t.textContent=msg;t.classList.add("show");clearTimeout(window._tt);window._tt=setTimeout(()=>t.classList.remove("show"),2500);}
window.showToast=showToast;

function showFlowPrompt(msg, actions){
  let p=el("flowPrompt");
  if(!p){p=document.createElement("div");p.id="flowPrompt";p.className="flowPrompt fpHidden";document.body.appendChild(p);}
  p.innerHTML=`<div class="flowPromptMsg">${msg}</div><div class="flowPromptActions">${actions.map(a=>`<button class="${a.cls||""}" onclick="(${a.fn})();dismissFlowPrompt()">${a.label}</button>`).join("")}<button class="secondary" onclick="dismissFlowPrompt()">Dismiss</button></div>`;
  p.classList.remove("fpHidden");
  clearTimeout(window._fpTimer);
  window._fpTimer=setTimeout(()=>dismissFlowPrompt(),10000);
}
window.dismissFlowPrompt=function(){const p=el("flowPrompt");if(p)p.classList.add("fpHidden");};

const AVATAR_COLORS=[
  {bg:"rgba(8,116,67,0.12)",color:"#087443",border:"rgba(8,116,67,0.25)"},
  {bg:"rgba(23,92,211,0.12)",color:"#175cd3",border:"rgba(23,92,211,0.25)"},
  {bg:"rgba(183,121,31,0.12)",color:"#b7791f",border:"rgba(183,121,31,0.25)"},
  {bg:"rgba(180,35,24,0.12)",color:"#b42318",border:"rgba(180,35,24,0.25)"},
  {bg:"rgba(124,58,237,0.12)",color:"#7c3aed",border:"rgba(124,58,237,0.25)"},
  {bg:"rgba(13,148,136,0.12)",color:"#0d9488",border:"rgba(13,148,136,0.25)"},
  {bg:"rgba(217,119,6,0.12)",color:"#d97706",border:"rgba(217,119,6,0.25)"},
  {bg:"rgba(109,40,217,0.12)",color:"#6d28d9",border:"rgba(109,40,217,0.25)"},
];
function avatarStyle(n){const i=Math.abs(String(n||"?").split("").reduce((a,c)=>a+c.charCodeAt(0),0))%AVATAR_COLORS.length;return AVATAR_COLORS[i];}
function avatarInitials(n){const p=String(n||"?").trim().split(/\s+/).filter(Boolean);if(p.length>=2)return(p[0][0]+p[p.length-1][0]).toUpperCase();return p[0].slice(0,2).toUpperCase();}
function avatarHtml(n,s="md"){const av=avatarStyle(n);return`<div class="avatar avatar-${s}" style="background:${av.bg};color:${av.color};border:1.5px solid ${av.border}">${avatarInitials(n)}</div>`;}

const ICONS={
  home:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
  customers:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  jobs:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
  schedule:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  bids:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`,
  more:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
};

document.body.insertAdjacentHTML("afterbegin",`<div id="syncBadge" class="syncBadge">Online</div>`);
function updateSyncBadge(){const b=el("syncBadge");if(!b)return;if(navigator.onLine){b.textContent="Online";b.classList.remove("offline");}else{b.textContent="Offline";b.classList.add("offline");}}
window.addEventListener("online",updateSyncBadge);window.addEventListener("offline",updateSyncBadge);updateSyncBadge();

// Navigation history for back button
const TOP_LEVEL_VIEWS=["dashboardView","scheduleView","customersView","bidsView","settingsView"];
let navHistory=[];
window.goBack=function(){
  const prev=navHistory.pop();
  if(prev)showView(prev);
  else showView("dashboardView");
};
document.head.insertAdjacentHTML("beforeend",`<style>
.statsStrip{display:flex;gap:8px;padding:14px 12px 6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.statsStrip::-webkit-scrollbar{display:none}
.statPill{flex:1;min-width:78px;background:var(--s1,#fff);border-radius:16px;padding:12px 8px 10px;text-align:center;cursor:pointer;border:1px solid rgba(0,0,0,0.07);transition:all 0.15s;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.05);position:relative;overflow:hidden}
.statPill::after{content:'';position:absolute;top:0;left:12px;right:12px;height:2px;border-radius:0 0 3px 3px;background:var(--green,#087443);opacity:0.35}
.statPillOwe::after{background:#b42318}
.statPillProfit::after{background:var(--green,#087443)}
.statPill:active{opacity:0.75;transform:scale(0.97)}
.statPillVal{font-size:20px;font-weight:700;color:var(--text,#1a1710);line-height:1.1;letter-spacing:-0.02em}
.statPillOwe .statPillVal{color:#b42318}
.statPillProfit .statPillVal{color:#087443}
.statPillLabel{font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-secondary,#9a8f80);margin-top:4px}
.moreSection{margin-bottom:18px}
.moreSectionLabel{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary,#9a8f80);padding:0 2px;margin-bottom:8px}
.flowPrompt{position:fixed;bottom:72px;left:12px;right:12px;background:var(--s1,#fff);border-radius:16px;padding:14px 16px;box-shadow:0 4px 28px rgba(0,0,0,0.18);z-index:999;border:1px solid var(--border,#e0dbd0);animation:fadeSlideIn 0.25s ease}
.flowPrompt.fpHidden{display:none}
.flowPromptMsg{font-size:14px;font-weight:500;color:var(--text,#1a1710);margin-bottom:10px;line-height:1.5}
.flowPromptActions{display:flex;gap:8px;flex-wrap:wrap}
.flowPromptActions button{flex:1;min-width:80px;padding:9px 12px;font-size:13px;margin:0}
.jobPropInfo{margin:4px 0 6px;line-height:1.7}
.jobPropInfo a{color:#087443;text-decoration:none;font-weight:500;font-size:13px}
.jobPropInfo div{font-size:13px;color:var(--text-secondary,#9a8f80)}
.clientRow{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--s1,#fff);border-radius:14px;margin-bottom:6px;border:0.5px solid var(--border,#e0dbd0);cursor:pointer;transition:opacity 0.15s;-webkit-tap-highlight-color:transparent}
.clientRow:active{opacity:0.7}
.clientRowInfo{flex:1;min-width:0}
.clientRowName{font-size:15px;font-weight:600;color:var(--text,#1a1710);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clientRowSub{font-size:12px;color:var(--text-secondary,#9a8f80);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clientRowRight{text-align:right;flex-shrink:0}
.clientRowOwes{font-size:15px;font-weight:700;color:#b42318;line-height:1.2}
.clientRowPaid{font-size:13px;font-weight:600;color:#087443}
.clientRowOwesLabel{font-size:11px;font-weight:400;color:#b42318}
.clientCallBtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;background:rgba(8,116,67,0.1);border-radius:50%;color:#087443;text-decoration:none;font-size:16px;margin-top:4px;flex-shrink:0}
.accordionBtn{width:100%;text-align:left;background:var(--s2,#f5f1e8);border:1px solid var(--border,#e0dbd0);border-radius:10px;padding:11px 14px;font-size:14px;font-weight:500;color:var(--text,#1a1710);cursor:pointer;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.accordionBtn .accArrow{transition:transform 0.2s;font-size:12px;color:var(--text-secondary,#9a8f80)}
.accordionBtn.open .accArrow{transform:rotate(180deg)}
.accordionPanel{max-height:0;overflow:hidden;transition:max-height 0.35s ease}
.accordionPanel.open{max-height:4000px}
.plTotalBar{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;margin:8px 0 4px}
.plTotalBar span{font-size:13px;color:#166534;font-weight:500}
.plTotalBar b{font-size:18px;font-weight:700;color:#087443}
.plEditPrice{display:flex;align-items:center;gap:6px;padding:4px 0 2px 38px}
.plEditPrice input{width:90px;margin:0;font-size:13px;font-weight:600;color:#087443;border-color:#86efac}
.plEditPrice span{font-size:12px;color:#9a8f80}
.pkgCard{background:var(--s1,#fff);border:1.5px solid var(--border,#e0dbd0);border-radius:16px;padding:16px;margin-bottom:12px;position:relative}
.pkgCard.pkgPopular{border-color:#087443;background:#f8fffe}
.pkgCard.pkgBest{border-color:#b7791f;background:#fffdf5}
.pkgBadge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border-radius:999px;margin-bottom:8px}
.pkgBadgeGreen{background:#dcfce7;color:#054f31}
.pkgBadgeGold{background:#fef3c7;color:#7c4a00}
.pkgTitle{font-size:17px;font-weight:700;color:var(--text,#1a1710);margin-bottom:3px}
.pkgTagline{font-size:13px;color:var(--text-secondary,#9a8f80);margin-bottom:10px;line-height:1.4}
.pkgItems{margin-bottom:10px}
.pkgItem{font-size:13px;color:var(--text,#1a1710);padding:2px 0;display:flex;align-items:center;gap:6px}
.pkgItem::before{content:"✓";color:#087443;font-weight:700;flex-shrink:0}
.pkgPricing{background:#f8f4ec;border-radius:10px;padding:12px 14px;margin-bottom:12px}
.pkgRegular{font-size:13px;color:#9a8f80;text-decoration:line-through;margin-bottom:2px}
.pkgPrice{font-size:26px;font-weight:700;color:#087443;letter-spacing:-0.5px;line-height:1.1}
.pkgSavings{font-size:13px;font-weight:600;color:#b7791f;margin-top:2px}
.backBtn{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-secondary,#9a8f80);font-size:14px;padding:10px 14px 4px;cursor:pointer;margin:0}
.backBtn:active{opacity:0.6}
.backBtn::before{content:"←";font-size:16px}
.reportTabBar{display:flex;gap:2px;padding:12px 12px 0;background:var(--s2,#f5f1e8)}
.reportTab{flex:1;padding:10px 6px;border-radius:10px 10px 0 0;border:none;background:transparent;color:var(--text-secondary,#9a8f80);font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.reportTab.active{background:var(--s1,#fff);color:var(--text,#1a1710);font-weight:600;border-bottom:2px solid #087443}
.heroCard{border-radius:18px;padding:20px;margin:0 0 12px;color:#fff;position:relative;overflow:hidden}
.heroCardPos{background:linear-gradient(135deg,#054f31 0%,#087443 100%)}
.heroCardNeg{background:linear-gradient(135deg,#7f1d1d 0%,#b42318 100%)}
.heroProfit{font-size:40px;font-weight:800;letter-spacing:-1.5px;line-height:1;margin:4px 0 8px}
.heroLabel{font-size:12px;opacity:0.75;font-weight:500;text-transform:uppercase;letter-spacing:0.08em}
.heroStatus{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.2);margin-bottom:12px}
.heroStats{display:flex;margin-top:4px;background:rgba(0,0,0,0.15);border-radius:12px;overflow:hidden}
.heroStat{flex:1;padding:10px 8px;text-align:center;border-right:1px solid rgba(255,255,255,0.1)}
.heroStat:last-child{border-right:none}
.heroStatVal{font-size:15px;font-weight:700;line-height:1.2}
.heroStatLabel{font-size:10px;opacity:0.7;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em}
.healthSection{margin-bottom:16px}
.healthTitle{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary,#9a8f80);padding:0 2px;margin-bottom:8px}
.healthItem{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--s1,#fff);border-radius:12px;margin-bottom:6px;border:0.5px solid var(--border,#e0dbd0)}
.healthIcon{font-size:18px;flex-shrink:0;line-height:1.3}
.healthBody{flex:1}
.healthText{font-size:13px;font-weight:500;color:var(--text,#1a1710);line-height:1.4}
.healthSub{font-size:12px;color:var(--text-secondary,#9a8f80);margin-top:2px}
.healthAction{font-size:12px;font-weight:600;color:#087443;margin-top:4px;cursor:pointer;text-decoration:underline}
.expBarRow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid #f0ece4}
.expBarLabel{font-size:13px;color:var(--text,#1a1710);flex:0 0 120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.expBarTrack{flex:1;background:#f0ece4;border-radius:999px;height:8px;overflow:hidden}
.expBarFill{height:8px;border-radius:999px;transition:width 0.4s ease}
.expBarAmt{font-size:13px;font-weight:600;color:var(--text,#1a1710);min-width:58px;text-align:right}
.leaderRow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid #f0ece4}
.leaderRank{font-size:16px;font-weight:800;color:var(--text-secondary,#9a8f80);flex:0 0 24px;text-align:center}
.leaderRank.gold{color:#b7791f}
.leaderName{flex:1;font-size:14px;font-weight:500;color:var(--text,#1a1710)}
.leaderAmt{font-size:14px;font-weight:700;color:#087443}
.agingBucket{margin-bottom:20px}
.agingBucketHeader{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:12px;margin-bottom:8px}
.agingBucketCurrent{background:#f0fdf4;border:1px solid #86efac}
.agingBucketWarn{background:#fffbeb;border:1px solid #fcd34d}
.agingBucketCrit{background:#fff1f2;border:1px solid #fca5a5}
.agingBucketTitle{font-size:14px;font-weight:600}
.agingBucketTotal{font-size:15px;font-weight:700}
.agingRow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--s1,#fff);border-radius:10px;margin-bottom:6px;border:0.5px solid var(--border,#e0dbd0)}
.agingRowLeft{flex:1;min-width:0}
.agingRowName{font-size:14px;font-weight:500;color:var(--text,#1a1710);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.agingRowSub{font-size:12px;color:var(--text-secondary,#9a8f80);margin-top:1px}
.agingDaysBadge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;flex-shrink:0}
.agingAmt{font-size:15px;font-weight:700;flex-shrink:0}
.periodReport{padding:16px;background:#fff}
.periodHeader{text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1a1710}
.periodTable{width:100%;border-collapse:collapse;margin-bottom:16px}
.periodTable th{text-align:left;padding:8px 6px;border-bottom:2px solid #e0dbd0;font-size:11px;color:#9a8f80;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.periodTable td{padding:8px 6px;border-bottom:0.5px solid #f0ece4;font-size:13px;color:#1a1710}
.periodTable .totalRow td{font-weight:700;border-top:2px solid #e0dbd0;padding-top:12px}
.periodSummary{background:#f5f1e8;border-radius:10px;padding:14px;margin-top:16px}
@media print{
  .bottomNav,.fab,.noPrint,.reportTabBar,header{display:none!important}
  .periodReport{padding:0}
  body{background:#fff}
}
.todayCard{background:var(--s1,#fff);border-radius:14px;border:0.5px solid var(--border,#e0dbd0);margin-bottom:8px;overflow:hidden}
.todayCardCompact{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
.todayCardCompact:active{opacity:0.8}
.todayStatusDot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.todayCardMain{flex:1;min-width:0}
.todayCardTitle{font-size:15px;font-weight:600;color:var(--text,#1a1710);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em}
.todayCardSub{font-size:12px;color:var(--text-secondary,#9a8f80);margin-top:1px}
.todayCardAction{flex-shrink:0;display:flex;align-items:center;gap:8px}
.todayCardAction button{margin:0;padding:8px 14px;font-size:13px;width:auto}
.todayChevron{font-size:18px;color:var(--text-secondary,#9a8f80);flex-shrink:0;transition:transform 0.2s;line-height:1}
.todayChevron.open{transform:rotate(180deg)}
.todayCardExpanded{border-top:0.5px solid var(--border,#e0dbd0);padding:12px 14px;background:var(--s2,#f5f1e8)}
.todayExpandInfo{font-size:13px;color:var(--text,#1a1710);line-height:1.8;margin-bottom:10px}
.todayExpandInfo a{color:#087443;text-decoration:none;font-weight:500}
.todayExpandActions{display:flex;flex-wrap:wrap;gap:6px}
.todayExpandActions button,.todayExpandActions a{margin:0;padding:8px 12px;font-size:13px;width:auto}
.smartPrompt{background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:12px 14px;margin:8px 0}
.smartPromptTitle{font-size:13px;font-weight:600;color:#166534;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.smartPromptResult{font-size:12px;color:#166534;margin-top:6px;font-weight:500}
.smartPromptResult.error{color:#b45309}
.jobFormToggle{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--s2,#f5f1e8);border-radius:10px;border:0.5px solid var(--border,#e0dbd0);margin:6px 0;cursor:pointer}
.jobFormToggle:active{opacity:0.7}
.jobFormToggleLabel{font-size:13px;font-weight:500;color:var(--text,#1a1710)}
.jobFormToggleSub{font-size:12px;color:var(--text-secondary,#9a8f80);margin-top:1px}
.jobFormToggleArrow{font-size:18px;color:var(--text-secondary,#9a8f80);transition:transform 0.2s}
.jobFormToggleArrow.open{transform:rotate(180deg)}
.jobFormSection{padding:10px 4px 4px;display:none}
.jobFormSection.open{display:block}.calendarGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:6px}
.calendarDow{text-align:center;font-size:11px;font-weight:600;color:var(--text-secondary,#9a8f80);padding:4px 0;text-transform:uppercase}
.calCell{min-height:58px;border-radius:10px;padding:5px 4px 4px;cursor:pointer;position:relative;background:var(--s2,#f5f1e8);transition:background 0.2s,border 0.2s}
.calCell:active{opacity:0.75}
.calCell.otherMonth{opacity:0.3}
.calCell.load-light{background:#f0fdf4}
.calCell.load-moderate{background:#fef3c7}
.calCell.load-heavy{background:#fef2f2}
.calCell.selected .calDateCircle{background:var(--gold,#b7791f);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.calCell.today .calDateCircle{background:var(--gold,#b7791f);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.calDateCircle{font-size:13px;font-weight:600;color:var(--text,#1a1710);line-height:1;text-align:center;width:22px;height:22px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.calDots{display:flex;justify-content:center;gap:3px;margin-top:4px}
.calDot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.calJobCount{font-size:10px;font-weight:600;text-align:center;margin-top:3px;color:var(--text-secondary,#9a8f80)}
.calNav{display:flex;align-items:center;justify-content:space-between;padding:0 2px 10px}
.calNavBtn{background:none;border:none;font-size:24px;cursor:pointer;padding:4px 12px;color:var(--text,#1a1710);border-radius:8px;line-height:1}
.calNavBtn:active{background:var(--s2,#f5f1e8)}
.calMonthLabel{font-size:17px;font-weight:700;color:var(--text,#1a1710)}
.calViewToggle{display:flex;gap:6px;margin-bottom:10px}
.calViewBtn{flex:1;padding:7px;border-radius:8px;border:1px solid var(--border,#e0dbd0);background:var(--s2,#f5f1e8);font-size:13px;font-weight:500;cursor:pointer;color:var(--text-secondary,#9a8f80)}
.calViewBtn.active{background:var(--gold-surface,#fef3c7);border-color:var(--gold,#b7791f);color:var(--gold-text,#7c4a00);font-weight:600}
.calDayPanel{overflow:hidden;max-height:0;transition:max-height 0.35s ease;margin-top:0}
.calDayPanel.open{max-height:2000px;margin-top:10px}
.calDayPanelInner{padding-top:4px}
</style>`);


const COMPANY={name:"5Cs Property Services LLC",tagline:"Cleaned Up &bull; Fixed Right &bull; Ready To Sell",phone:"918-424-7953",email:"craig.chaney.87@gmail.com"};
const REVIEW_URL="https://www.facebook.com/profile.php?id=61588932660465&sk=reviews";
const PHOTO_MAX_WIDTH=1200; // Max photo width in px before compression
const PHOTO_QUALITY=0.72;   // JPEG quality (0-1)

// Travel fee origin — 313 S 6th St, McAlester, OK
// Update these if the business address ever changes
const ORIGIN_LAT=34.9269088;
const ORIGIN_LNG=-95.7635979;
const TRAVEL_BASE_FEE=0;      // No base fee — mileage only
const TRAVEL_PER_MILE=1.25;   // Per mile rate ($)
const TRAVEL_FREE_MILES=5;    // No charge within this radius (miles)

const LOT_SIZES=[{key:"sm",label:"Under \u00bc acre",sub:"Small city/subdivision lot"},{key:"md",label:"\u00bc \u2013 \u00bd acre",sub:"Average residential lot"},{key:"lg",label:"\u00bd \u2013 1 acre",sub:"Larger residential lot"},{key:"xl",label:"1+ acre",sub:"Rural or large property"}];
const MOW_SIZES=[{key:"sm",label:"Up to \u00bc acre",sub:"Small residential lot"},{key:"md",label:"Up to \u00bd acre",sub:"Medium residential lot"},{key:"lg",label:"Up to \u00be acre",sub:"Large residential lot"},{key:"xl",label:"Up to 1 acre",sub:"One-acre property"}];
const HOME_SIZES=[{key:"sm",label:"Under 1,500 sq ft",sub:"Small home"},{key:"md",label:"1,500\u20132,500 sq ft",sub:"Average home"},{key:"lg",label:"2,500\u20134,000 sq ft",sub:"Larger home"},{key:"xl",label:"4,000+ sq ft",sub:"Large or luxury home"}];
const serviceSizes=svc=>svc.sizeType==="mow"?MOW_SIZES:svc.sizeType==="lot"?LOT_SIZES:HOME_SIZES;
const PRICE_LIST=[
  // Exterior & Grounds
  {id:"lawn",        cat:"Mowing & Grounds",      name:"Lawn Mowing — Weekly",        desc:"Mow, trim, and blow off. Properties over 1 acre are quoted hourly.",            hasSizes:true, sizeType:"mow",  prices:{sm:55,md:80,lg:100,xl:125},  firstOk:true,mins:90},
  {id:"lawn_biweekly",cat:"Mowing & Grounds",     name:"Lawn Mowing — Biweekly",      desc:"Mow, trim, and blow off. Properties over 1 acre are quoted hourly.",            hasSizes:true, sizeType:"mow",  prices:{sm:65,md:95,lg:115,xl:145},  firstOk:true,mins:105},
  {id:"edge_normal", cat:"Mowing & Grounds",      name:"Edging Add-On — Normal",      desc:"Normal amount of sidewalk, curb, or driveway edging.",                        hasSizes:false,flat:25,unit:"job",                                   firstOk:false,mins:30},
  {id:"edge_heavy",  cat:"Mowing & Grounds",      name:"Edging Add-On — Heavy",       desc:"Large amount of edging or badly overgrown edges.",                             hasSizes:false,flat:50,unit:"job",                                   firstOk:false,mins:60},
  {id:"cleanup",     cat:"Cleanup & Clearing",    name:"General Yard Cleanup",        desc:"General cleanup labor. Disposal and equipment are added separately.",          hasSizes:false,flat:60,unit:"hr",                                    firstOk:true,mins:60},
  {id:"heavy_brush", cat:"Cleanup & Clearing",    name:"Heavy Brush / Overgrowth",    desc:"Heavy overgrowth cleanup per man-hour. Disposal and equipment are extra.",     hasSizes:false,flat:75,unit:"hr",                                    firstOk:true,mins:90},
  {id:"leaves",      cat:"Cleanup & Clearing",    name:"Leaf Cleanup",                desc:"Leaf cleanup per man-hour. Haul-off or disposal is added separately.",          hasSizes:false,flat:60,unit:"hr",                                    firstOk:false,mins:60},
  {id:"chainsaw",    cat:"Cleanup & Clearing",    name:"Chainsaw / Limb Work",        desc:"Cutting and limb work per man-hour. Haul-off and equipment are extra.",        hasSizes:false,flat:85,unit:"hr",                                    firstOk:false,mins:90},
  {id:"brushhog",    cat:"Cleanup & Clearing",    name:"Brush Hogging — Maintained",  desc:"Normally maintained field or lot.",                                           hasSizes:false,flat:100,unit:"hr",                                   firstOk:false,mins:60},
  {id:"brushhog_heavy",cat:"Cleanup & Clearing",  name:"Brush Hogging — Heavy",       desc:"Tall or heavy growth.",                                                        hasSizes:false,flat:125,unit:"hr",                                   firstOk:false,mins:90},
  {id:"brushhog_severe",cat:"Cleanup & Clearing", name:"Brush Hogging — Severe",      desc:"Very heavy growth, obstacles, or difficult conditions.",                      hasSizes:false,flat:150,unit:"hr",                                   firstOk:false,mins:120},
  {id:"hedge",       cat:"Exterior & Grounds",    name:"Hedge & Shrub Trimming",       desc:"Hedges and shrubs trimmed and shaped.",                                     hasSizes:false,flat:95,                                               firstOk:false,mins:90},
  {id:"hauling",     cat:"Exterior & Grounds",    name:"Debris / Junk Hauling",        desc:"Loaded and hauled away. Priced per load.",                           hasSizes:false,flat:95,unit:"load",                                   firstOk:false,mins:120},
  {id:"gutter",      cat:"Exterior & Grounds",    name:"Gutter Cleaning",              desc:"Gutters cleared and flushed out.",                     hasSizes:true, sizeType:"lot",  prices:{sm:80,md:110,lg:140,xl:175},  firstOk:false,mins:90},
  {id:"windows",     cat:"Exterior & Grounds",    name:"Window Cleaning (Exterior)",   desc:"Exterior windows cleaned.",                             hasSizes:false,flat:95,                                               firstOk:false,mins:90},
  {id:"fence_repair",cat:"Exterior & Grounds",    name:"Fence Repair",                 desc:"Damaged areas repaired and secured.",                      hasSizes:false,flat:125,                                              firstOk:false,mins:180},
  {id:"fence_stain", cat:"Exterior & Grounds",    name:"Fence Staining / Painting",    desc:"Full stain or paint application.",                           hasSizes:false,flat:175,                                              firstOk:false,mins:270},
  {id:"tree_trim",   cat:"Exterior & Grounds",    name:"Tree Trimming & Limbing",      desc:"Dead limbs removed and cleaned up.",                          hasSizes:false,flat:150,                                              firstOk:false,mins:180},
  {id:"stump",       cat:"Exterior & Grounds",    name:"Stump Grinding",               desc:"Ground down below grade.",                                 hasSizes:false,flat:125,unit:"stump",                                 firstOk:false,mins:90},
  {id:"ext_door",    cat:"Exterior & Grounds",    name:"Exterior Door Painting",       desc:"Door refreshed with a clean coat of paint.",                hasSizes:false,flat:75,unit:"door",                                   firstOk:false,mins:90},
  {id:"pressure",    cat:"Exterior & Grounds",    name:"Pressure Washing (Add-On)",    desc:"Hard surfaces washed down. Add-on service — availability varies.",       hasSizes:true, sizeType:"lot",  prices:{sm:90,md:135,lg:200,xl:285},  firstOk:false,mins:120},
  // Mulch & Beds
  {id:"bed_prep",    cat:"Mulch & Beds",           name:"Bed Prep — Basic",            desc:"Basic bed cleanup and preparation.",                                          hasSizes:false,flat:0.25,unit:"sq ft",                                firstOk:false,mins:30},
  {id:"bed_prep_heavy",cat:"Mulch & Beds",         name:"Bed Prep — Heavy",            desc:"Beds with heavy weeds or overgrowth.",                                        hasSizes:false,flat:0.50,unit:"sq ft",                                firstOk:false,mins:60},
  {id:"weed_treat",  cat:"Mulch & Beds",           name:"Chemical Weed Treatment",     desc:"Weed treatment with a $45 minimum.",                                         hasSizes:false,flat:45,unit:"job",                                    firstOk:false,mins:30},
  {id:"bed_edge",    cat:"Mulch & Beds",           name:"Landscape Bed Edging",        desc:"Priced per linear foot. Materials are added separately.",                    hasSizes:false,flat:1.25,unit:"linear ft",                             firstOk:false,mins:60},
  {id:"mulch_normal",cat:"Mulch & Beds",           name:"Mulch Installation — Normal", desc:"Installation per yard with normal access. Mulch material is added separately.",hasSizes:false,flat:68,unit:"yard",                                     firstOk:false,mins:60},
  {id:"mulch_difficult",cat:"Mulch & Beds",        name:"Mulch Installation — Difficult",desc:"Installation per yard with difficult access or extensive hand carrying.",   hasSizes:false,flat:85,unit:"yard",                                     firstOk:false,mins:90},
  {id:"mulch_delivery",cat:"Mulch & Beds",         name:"Mulch Pickup & Delivery",     desc:"Minimum pickup and delivery charge. Increase for long-distance trips.",       hasSizes:false,flat:75,unit:"load",                                   firstOk:false,mins:45},
  // Interior Prep
  {id:"deepclean",   cat:"Interior Prep",          name:"Deep Cleaning",                desc:"Thorough cleaning throughout the home.", hasSizes:true, sizeType:"home", prices:{sm:200,md:275,lg:375,xl:475}, firstOk:false,mins:270},
  {id:"trashout",    cat:"Interior Prep",          name:"Trash Out / Foreclosure",      desc:"Full cleanout — everything removed from the property.",      hasSizes:true, sizeType:"home", prices:{sm:250,md:325,lg:425,xl:525}, firstOk:false,mins:330},
  {id:"handyman",    cat:"Interior Prep",          name:"Handyman / Minor Repairs",     desc:"Small repairs handled by the hour.",         hasSizes:false,flat:75,unit:"hr",                                     firstOk:false,mins:120},
  {id:"int_paint",   cat:"Interior Prep",          name:"Interior Painting",            desc:"Walls painted, room by room. Labor only — client provides paint.",     hasSizes:false,flat:200,unit:"room",                                  firstOk:false,mins:360},
  {id:"touch_paint", cat:"Interior Prep",          name:"Paint Touch-Ups",              desc:"Scuffs and minor damage touched up.",                              hasSizes:false,flat:75,                                               firstOk:false,mins:90},
  {id:"carpet_clean",cat:"Interior Prep",          name:"Carpet Cleaning",              desc:"Carpets cleaned and refreshed.",                           hasSizes:true, sizeType:"home", prices:{sm:150,md:200,lg:275,xl:375}, firstOk:false,mins:120},
  {id:"carpet_rem",  cat:"Interior Prep",          name:"Carpet Removal",               desc:"Carpet pulled up and hauled away.",                        hasSizes:true, sizeType:"home", prices:{sm:200,md:275,lg:375,xl:475}, firstOk:false,mins:180},
  {id:"drywall",     cat:"Interior Prep",          name:"Drywall Repair",               desc:"Holes and damage patched and sanded.",                                   hasSizes:false,flat:125,                                              firstOk:false,mins:180},
  {id:"caulk",       cat:"Interior Prep",          name:"Caulking & Weatherstripping",  desc:"Seals refreshed around tubs, windows, and doors.",                    hasSizes:false,flat:75,                                               firstOk:false,mins:90},
  {id:"light_fix",   cat:"Interior Prep",          name:"Light Fixture Replacement",    desc:"Old fixtures swapped out. Client provides new fixtures.",                  hasSizes:false,flat:75,unit:"ea",                                     firstOk:false,mins:90},
  {id:"door_hw",     cat:"Interior Prep",          name:"Door Hardware Replacement",    desc:"Hardware replaced per door. Client provides new hardware.",                    hasSizes:false,flat:65,unit:"ea",                                     firstOk:false,mins:30},
  {id:"appliance",   cat:"Interior Prep",          name:"Appliance Removal",            desc:"Unwanted appliances disconnected and hauled away.",                    hasSizes:false,flat:75,unit:"ea",                                     firstOk:false,mins:90},
  // Photography & Media
  {id:"photos",      cat:"Photography & Media",    name:"Professional Photography",     desc:"Listing photos, edited and delivered promptly.",       hasSizes:true, sizeType:"home", prices:{sm:150,md:175,lg:200,xl:240}, firstOk:false,mins:90},
  {id:"drone",       cat:"Photography & Media",    name:"Drone Aerial Photos",          desc:"Aerial photos of the property and surrounding area.",            hasSizes:false,flat:125,                                              firstOk:false,mins:45},
  {id:"photodrone",  cat:"Photography & Media",    name:"Photos + Drone Combo",         desc:"Ground and aerial photos — the complete package.",             hasSizes:true, sizeType:"home", prices:{sm:250,md:275,lg:310,xl:350}, firstOk:false,mins:105},
  // Staging & Presentation
  {id:"lockbox",     cat:"Staging & Presentation", name:"Lockbox Installation",         desc:"Lockbox installed and set at the property.",                                 hasSizes:false,flat:50,                                               firstOk:false,mins:30},
  {id:"yardsign",    cat:"Staging & Presentation", name:"Yard Sign Installation",       desc:"Sign posted at the property.",                                     hasSizes:false,flat:50,                                               firstOk:false,mins:30},
  {id:"staging",     cat:"Staging & Presentation", name:"Staging Consultation",         desc:"Walk-through advice on presentation and layout.",        hasSizes:false,flat:75,                                               firstOk:false,mins:90},
  {id:"key_dup",     cat:"Staging & Presentation", name:"Key Duplication",              desc:"Keys duplicated for property access.",                     hasSizes:false,flat:50,unit:"key",                                    firstOk:false,mins:30},
  // Ongoing / Vacant
  {id:"checkin",     cat:"Ongoing / Vacant",       name:"Vacant Property Check-In",     desc:"Property checked and report provided.", hasSizes:false,flat:60,                                               firstOk:false,mins:45},
  {id:"storminsp",   cat:"Ongoing / Vacant",       name:"Storm Damage Inspection",      desc:"Post-storm check with photos and written report.",              hasSizes:false,flat:95,                                               firstOk:false,mins:45},
  {id:"utility",     cat:"Ongoing / Vacant",       name:"Utility Monitoring Visit",     desc:"Utilities checked and any issues noted.",            hasSizes:false,flat:60,                                               firstOk:false,mins:30},
  {id:"winterize",   cat:"Ongoing / Vacant",       name:"Winterization Check",          desc:"Property checked for winter readiness.",                  hasSizes:false,flat:75,                                               firstOk:false,mins:90},
  // Other
  {id:"minjob",      cat:"Other",                  name:"Minimum Job Charge",           desc:"Minimum charge for any service call.",                                              hasSizes:false,flat:75,                                               firstOk:false,mins:30},
  {id:"custom",      cat:"Other",                  name:"Custom Service",               desc:"Custom service — described in the line item.",                             hasSizes:false,flat:75,                                               firstOk:false,mins:60},
];

// Package psychology config
const PKG_BADGES={basic:"",exterior:"Most Popular",readytosell:"",fullservice:"Best Value"};
const PKG_TAGLINES={
  basic:"Quick, clean curb appeal before the photos.",
  exterior:"Everything buyers see from the street — handled.",
  readytosell:"Walk in. List it. Done. One call covers it all.",
  fullservice:"Craig handles everything. You just show up at closing.",
};

const PACKAGES=[
  {key:"basic",       title:"Basic Curb Appeal",        discount:0.10,
   items:[{id:"lawn",sizeType:"lot"},{id:"windows"}]},
  {key:"exterior",    title:"Full Exterior Prep",         discount:0.12,
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"gutter",sizeType:"lot"},{id:"windows"}]},
  {key:"readytosell", title:"Ready To Sell",              discount:0.13,
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"gutter",sizeType:"lot"},{id:"windows"},{id:"deepclean",sizeType:"home"},{id:"photos",sizeType:"home"}]},
  {key:"fullservice", title:"Full Service Listing Prep",  discount:0.15,
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"gutter",sizeType:"lot"},{id:"windows"},{id:"deepclean",sizeType:"home"},{id:"photodrone",sizeType:"home"},{id:"handyman"}]},
];

appRoot.innerHTML=`
<section id="loginScreen" class="box">
  <h2>Login</h2>
  <input id="loginEmail" placeholder="Email">
  <input id="loginPassword" type="password" placeholder="Password">
  <button onclick="login()">Login</button>
  <button class="secondary" onclick="signup()">Create Account</button>
</section>
<section id="appScreen" class="hidden">
  <section id="dashboardView">
    <div class="statsStrip">
      <div class="statPill" onclick="openPayments()"><div class="statPillVal" id="dashPaid">$0</div><div class="statPillLabel">Collected</div></div>
      <div class="statPill statPillOwe" onclick="openOwedJobs()"><div class="statPillVal" id="dashOwed">$0</div><div class="statPillLabel">Owed</div></div>
      <div class="statPill statPillProfit" onclick="openProfitBreakdown()"><div class="statPillVal" id="dashProfit">$0</div><div class="statPillLabel">Profit</div></div>
      <div class="statPill" onclick="showView('invoicesView')"><div class="statPillVal" id="dashInvoiceCount">0</div><div class="statPillLabel">Invoices</div></div>
    </div>
    <div id="trendStrip" style="padding:0 14px 8px;font-size:12px;color:var(--text-secondary,#9a8f80)"></div>
    <div id="notificationCenter"></div>
    <div class="box"><h2>Today's Jobs</h2><div id="todaySchedulePreview"></div></div>
    <div class="box"><h2>Unpaid</h2><div id="attentionList"></div></div>
    <div style="display:none">
      <span id="dashExpenses"></span><span id="dashTodayJobs"></span>
      <span id="dashUpcomingJobs"></span><span id="dashRecurringJobs"></span>
      <div id="recentJobs"></div><div id="upcomingSchedulePreview"></div>
      <div id="topCustomers"></div>
    </div>
  </section>

  <section id="scheduleView" class="hidden">
    <div class="box">
      <div class="calViewToggle">
        <button class="calViewBtn active" id="calViewBtnCal" onclick="setCalView('cal')">📅 Calendar</button>
        <button class="calViewBtn" id="calViewBtnList" onclick="setCalView('list')">☰ List</button>
      </div>
      <div id="calendarPanel">
        <div class="calNav">
          <button class="calNavBtn" onclick="calPrevMonth()">‹</button>
          <div class="calMonthLabel" id="calMonthLabel"></div>
          <button class="calNavBtn" onclick="calNextMonth()">›</button>
        </div>
        <div class="calendarGrid" id="calDowRow">
          <div class="calendarDow">Su</div><div class="calendarDow">Mo</div><div class="calendarDow">Tu</div>
          <div class="calendarDow">We</div><div class="calendarDow">Th</div><div class="calendarDow">Fr</div>
          <div class="calendarDow">Sa</div>
        </div>
        <div class="calendarGrid" id="calGrid"></div>
        <div class="calDayPanel" id="calDayPanel"></div>
      </div>
      <div id="calListPanel" style="display:none">
        <div class="quickAdd noPrint" style="margin-bottom:10px">
          <button onclick="renderSchedule('today')">Today</button>
          <button onclick="renderSchedule('upcoming')">Next 7 Days</button>
          <button onclick="renderSchedule('all')">All Scheduled</button>
          <button onclick="showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
        </div>
        <h2 id="scheduleTitle">Scheduled Jobs</h2>
        <div id="scheduleList"></div>
      </div>
    </div>
  </section>

  <section id="workflowView" class="hidden">
    <div class="box"><h2>Workflow Board</h2><p class="small">Drag and drop cards between stages to update status.</p></div>
    <div class="box"><h2>Scheduled</h2><div id="workflowScheduled" class="workflowColumn" data-workflow-status="Scheduled"></div></div>
    <div class="box"><h2>In Progress</h2><div id="workflowInProgress" class="workflowColumn" data-workflow-status="In Progress"></div></div>
    <div class="box"><h2>Complete, Waiting Payment</h2><div id="workflowWaitingPayment" class="workflowColumn" data-workflow-status="Complete"></div></div>
    <div class="box"><h2>Completed and Paid</h2><div id="workflowCompletedPaid" class="workflowColumn" data-workflow-status="Complete"></div></div>
  </section>

  <section id="profitView" class="hidden">
    <div class="reportTabBar noPrint">
      <button class="reportTab active" id="tabOverview" onclick="switchReportTab('overview')">Overview</button>
      <button class="reportTab" id="tabPeriod" onclick="switchReportTab('period')">Period Report</button>
      <button class="reportTab" id="tabAging" onclick="switchReportTab('aging')">Aging</button>
    </div>

    <div id="reportOverview" style="padding:12px">
      <div id="reportHeroCard" class="heroCard heroCardPos">
        <div class="heroLabel">Net Profit</div>
        <div class="heroProfit" id="profitNet">$0</div>
        <div id="heroStatus" class="heroStatus">Calculating...</div>
        <div class="heroStats">
          <div class="heroStat"><div class="heroStatVal" id="profitPaid">$0</div><div class="heroStatLabel">Collected</div></div>
          <div class="heroStat"><div class="heroStatVal" id="profitExpenses">$0</div><div class="heroStatLabel">Expenses</div></div>
          <div class="heroStat"><div class="heroStatVal" id="profitOutstanding">$0</div><div class="heroStatLabel">Owed</div></div>
          <div class="heroStat"><div class="heroStatVal" id="profitAvgJob">$0</div><div class="heroStatLabel">Avg Job</div></div>
        </div>
      </div>
      <div class="healthSection">
        <div class="healthTitle">Business Health</div>
        <div id="healthAlerts"></div>
      </div>
      <div class="box" style="margin:0 0 12px"><h2 style="margin-bottom:12px">Last 6 Months</h2><div id="revenueChart"></div></div>
      <div class="box" style="margin:0 0 12px"><h2 style="margin-bottom:10px">Top Customers</h2><div id="topCustomers"></div></div>
      <div class="box" style="margin:0 0 12px"><h2 style="margin-bottom:10px">Expense Breakdown</h2><div id="expenseBreakdown"></div></div>
      <div class="box" style="margin:0 0 12px"><h2 style="margin-bottom:10px">Customer Tiers</h2><div id="tierBreakdown"></div></div>
      <div style="display:none"><span id="profitJobsMonth">0</span></div>
    </div>

    <div id="reportPeriod" style="display:none;padding:12px">
      <div class="box" style="margin:0 0 12px">
        <h2 style="margin-bottom:12px">Period Report</h2>
        <div class="row noPrint" style="align-items:flex-end;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px"><div class="small" style="margin-bottom:4px">From</div><input id="profitFrom" type="date" style="margin:0"></div>
          <div style="flex:1;min-width:120px"><div class="small" style="margin-bottom:4px">To</div><input id="profitTo" type="date" style="margin:0"></div>
          <button style="width:auto;padding:12px 18px" onclick="generatePeriodReport()">Generate</button>
          <button class="secondary" style="width:auto;padding:12px 18px" onclick="clearProfitFilter()">Clear</button>
        </div>
      </div>
      <div id="periodReportContent"></div>
    </div>

    <div id="reportAging" style="display:none;padding:12px">
      <div id="agingReportContent"></div>
    </div>
  </section>

  <section id="customersView" class="hidden">
    <div class="searchBar noPrint"><input id="customerSearch" oninput="renderAll()" placeholder="Search customers..."></div>
    <div class="box noPrint"><button onclick="toggleBox('customerFormBox')">Add Customer</button></div>
    <div id="customerFormBox" class="box hidden">
      <h2 id="customerFormTitle">Add Customer</h2>
      <div class="formSection">Contact</div>
      <input id="customerName" placeholder="Customer name">
      <input id="customerEmail" placeholder="Email">
      <input id="customerPhone" placeholder="Phone">
      <div class="formSection">Property</div>
      <input id="customerAddress" placeholder="Property address">
      <input id="customerGateCode" placeholder="Gate code or access notes">
      <textarea id="customerPropertyNotes" placeholder="Property notes, pets, parking, special instructions"></textarea>
      <div class="formSection">Service</div>
      <input id="customerPreferredContact" placeholder="Preferred contact method">
      <input id="customerServiceFrequency" placeholder="Service frequency">
      <div class="formSection">Notes</div>
      <textarea id="customerNotes" placeholder="General notes"></textarea>
      <div class="small" style="margin-top:8px;margin-bottom:2px">Referred By</div>
      <input id="customerReferredBy" placeholder="Name of person who referred this customer" oninput="checkReferralMatch()">
      <div id="referralSuggestion" style="display:none;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;margin-top:-8px">
        <div id="referralSuggestionText" style="font-size:13px;color:#166534"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="referralYesBtn" style="width:auto;padding:6px 14px;font-size:13px" onclick="confirmReferralMatch()">Yes, link them</button>
          <button class="secondary" style="width:auto;padding:6px 14px;font-size:13px" onclick="dismissReferralMatch()">No, different person</button>
        </div>
      </div>
      <button onclick="saveCustomer()" style="margin-top:12px">Save Customer</button>
      <button class="secondary" onclick="resetCustomerForm()">Clear</button>
    </div>
    <div id="customerList" class="cardsGrid"></div>
  </section>

  <section id="customerDetailView" class="hidden"><div id="customerDetail"></div></section>

  <section id="jobsView" class="hidden">
    <div class="searchBar noPrint">
      <input id="jobSearch" oninput="renderAll()" placeholder="Search jobs...">
      <select id="jobStatusFilter" onchange="renderAll()">
        <option value="all">All Jobs</option><option value="unpaid">Unpaid</option>
        <option value="partial">Partial</option><option value="paid">Paid</option>
        <option value="today">Today</option><option value="upcoming">Upcoming</option>
        <option value="scheduled">Scheduled</option><option value="in progress">In Progress</option>
        <option value="complete">Complete</option>
      </select>
    </div>
    <div class="box noPrint"><button onclick="toggleBox('jobFormBox')">Add Job</button></div>
    <div id="jobFormBox" class="box hidden">
      <h2 id="jobFormTitle">Add Job</h2>
      <div class="formSection">Customer &amp; Description</div>
      <select id="jobCustomer"></select>
      <input id="jobTitle" placeholder="Job description" oninput="prefillJobMins()">
      <div class="formSection">Schedule</div>
      <input id="jobDate" type="date">
      <input id="jobTime" type="time">
      <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <div style="flex:1">
          <div class="small" style="margin-bottom:3px;color:var(--text-secondary)">Est. duration</div>
          <input id="jobMins" type="number" min="15" step="15" placeholder="60" style="margin:0" oninput="updateJobDurationLabel()">
        </div>
        <div style="padding-top:18px;font-size:13px;color:var(--text-secondary)" id="jobDurationLabel">1 hr</div>
      </div>
      <div class="formSection">Payment</div>
      <input id="jobAmount" type="number" placeholder="Amount charged">
      <input id="jobPaid" type="number" placeholder="Initial payment amount">
      <div class="formSection">Notes</div>
      <textarea id="jobNotes" placeholder="Job notes"></textarea>

      <div id="jobSmartPrompts" style="margin-top:8px"></div>

      <button onclick="saveJob()" style="margin-top:12px">Save Job</button>
      <button class="secondary" onclick="resetJobForm()">Clear</button>
    </div>
    <div id="jobList"></div>
  </section>

  <section id="paymentsView" class="hidden">
    <div class="box">
      <h2>Payments</h2>
      <div class="searchBar noPrint" style="margin-bottom:8px"><input id="paymentsSearch" oninput="renderAll()" placeholder="Search payments..."></div>
      <div class="moneyLine" style="padding:8px 0;border-bottom:0.5px solid var(--border)"><span style="font-weight:600">Total Collected</span><b id="paymentsTotalLabel" style="color:var(--green)">$0.00</b></div>
    </div>
    <div class="box"><div id="paymentsList"></div></div>
  </section>

  <section id="recurringView" class="hidden">
    <div class="box noPrint"><button onclick="toggleBox('recurringFormBox')">Add Recurring Job</button></div>
    <div id="recurringFormBox" class="box hidden">
      <h2 id="recurringFormTitle">Add Recurring Job</h2>
      <select id="recurringCustomer"></select>
      <input id="recurringTitle" placeholder="Recurring job title">
      <input id="recurringNextDate" type="date">
      <input id="recurringTime" type="time">
      <input id="recurringAmount" type="number" placeholder="Amount">
      <select id="recurringFrequency" onchange="toggleCustomFreq()">
        <option value="weekly">Weekly (every 7 days)</option>
        <option value="biweekly">Biweekly (every 14 days)</option>
        <option value="monthly">Monthly</option>
        <option value="custom">Custom interval</option>
      </select>
      <div id="customFreqBox" style="display:none;margin-top:-4px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px;color:var(--text)">Every</span>
          <input id="recurringCustomDays" type="number" min="1" max="365" value="10" style="width:80px;margin:0" placeholder="days">
          <span style="font-size:14px;color:var(--text)">days</span>
        </div>
      </div>
      <button onclick="saveRecurring()">Save Recurring Job</button>
      <button class="secondary" onclick="resetRecurringForm()">Clear</button>
    </div>
    <div class="box"><h2>Recurring Calendar</h2><div id="recurringCalendar"></div></div>
    <div id="recurringList"></div>
  </section>

  <section id="bidsView" class="hidden">
    <div class="box noPrint"><button onclick="toggleBox('bidFormBox')">Create Bid</button></div>
    <div id="bidFormBox" class="box hidden">
      <h2>Create Bid</h2>
      <select id="bidCustomer" onchange="refreshBidTravelPrompt()"></select>
      <input id="bidTitle" placeholder="Bid title">
      <textarea id="bidNotes" placeholder="General notes"></textarea>
      <div id="bidSmartPrompts" style="margin:8px 0"></div>
      <div style="margin:10px 0">
        <button class="accordionBtn" id="plAccBtn" onclick="toggleAccordion('plAccBtn','priceListPanel',openPriceListPanel)">
          &#9776; Build from Price List <span class="accArrow">&#9660;</span>
        </button>
        <div id="priceListPanel" class="accordionPanel" style="padding:0 4px">
          <div id="priceListContent"></div>
          <div id="plTotalBar" class="plTotalBar" style="display:none">
            <span>Selected Total</span><b id="plRunningTotal">$0.00</b>
          </div>
          <div style="padding:8px 0 4px;border-top:0.5px solid #d0cbbf;margin-top:6px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0">
              <input type="checkbox" id="plFirstCheck" style="width:20px;height:20px;margin:0;flex-shrink:0;accent-color:#087443" onchange="togglePlFirst()">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--text)">First Visit / Neglected Property</div>
                <div class="small">Apply 1.6x multiplier to all selected services</div>
              </div>
            </label>
          </div>
          <div class="row" style="padding-bottom:8px">
            <button class="green" onclick="addPriceListToBid()">Add Selected to Bid</button>
            <button class="secondary" onclick="toggleAccordion('plAccBtn','priceListPanel',null)">Close</button>
          </div>
        </div>
      </div>

      <div style="margin:10px 0 0">
        <button class="accordionBtn" id="pkgAccBtn" onclick="toggleAccordion('pkgAccBtn','packagesPanel',openPackagesPanel)">
          &#11088; Pre-Built Packages <span class="accArrow">&#9660;</span>
        </button>
        <div id="packagesPanel" class="accordionPanel" style="padding:0 4px">
          <div style="margin:8px 0">
            <div class="small" style="margin-bottom:4px">Lot Size</div>
            <select id="pkgLotSize" onchange="renderPackages()" style="margin:0 0 8px">
              <option value="sm">Under &frac14; acre</option>
              <option value="md">&frac14; &ndash; &frac12; acre</option>
              <option value="lg">&frac12; &ndash; 1 acre</option>
              <option value="xl">1+ acre</option>
            </select>
            <div class="small" style="margin-bottom:4px">Home Size</div>
            <select id="pkgHomeSize" onchange="renderPackages()" style="margin:0">
              <option value="sm">Under 1,500 sq ft</option>
              <option value="md">1,500&ndash;2,500 sq ft</option>
              <option value="lg">2,500&ndash;4,000 sq ft</option>
              <option value="xl">4,000+ sq ft</option>
            </select>
          </div>
          <div id="packagesContent"></div>
          <div style="border-top:0.5px solid #d0cbbf;padding-top:12px;margin-top:4px">
            <button class="secondary" style="width:100%;margin-bottom:8px" onclick="openCustomPkg()">+ Build Custom Package</button>
            <div id="customPkgBox" class="hidden">
              <div id="customPkgServices"></div>
              <div style="margin:10px 0;display:flex;align-items:center;gap:10px">
                <div style="font-size:14px;font-weight:500;color:var(--text)">Discount</div>
                <input id="customPkgDiscount" type="number" min="0" max="50" value="10" style="width:70px;margin:0" oninput="updateCustomPkgTotal()">
                <div style="font-size:14px;color:var(--text)">%</div>
              </div>
              <div id="customPkgTotals" style="background:var(--s1);border-radius:8px;padding:10px;margin-bottom:8px">
                <p class="small">Select services above to see your package price.</p>
              </div>
              <button class="green" style="width:100%" onclick="addCustomPackageToBid()">Add Custom Package to Bid</button>
            </div>
          </div>
          <button class="secondary" style="margin:8px 0;width:100%" onclick="toggleAccordion('pkgAccBtn','packagesPanel',null)">Close</button>
        </div>
      </div>
      <div id="bidItems"></div>
      <button onclick="addBidItemRow()">+ Add Line Item Manually</button>
      <div class="box" style="background:var(--s2);margin-top:8px">
        <h3 style="margin-bottom:8px">Discount (Optional)</h3>
        <input id="bidDiscountLabel" placeholder="Discount label, ex: New Customer Special, Loyalty Discount">
        <div style="display:flex;gap:8px;align-items:center;margin-top:-4px">
          <select id="bidDiscountType" style="width:auto;margin:0" onchange="updateBidTotal()">
            <option value="amount">$ Fixed</option>
            <option value="percent">% Off</option>
          </select>
          <input id="bidDiscountValue" type="number" min="0" placeholder="0" style="flex:1;margin:0" oninput="updateBidTotal()">
        </div>
      </div>
      <div class="box" style="background:var(--s2);margin-top:8px">
        <h3>Bid Summary</h3>
        <div class="moneyLine"><span>Subtotal</span><b id="bidSubtotal">$0.00</b></div>
        <div id="bidDiscountLine" style="display:none" class="moneyLine"><span id="bidDiscountLineLabel">Discount</span><b id="bidDiscountAmt" style="color:#b7791f">-$0.00</b></div>
        <div class="moneyLine" style="border-top:0.5px solid #d0cbbf;margin-top:6px;padding-top:6px"><span style="font-weight:600">Total</span><b id="bidTotal" style="font-size:18px;color:#087443">$0.00</b></div>
      </div>
      <button class="green" onclick="saveBid()">Save Bid</button>
    </div>
    <div class="box" id="savedBidsSection"><h2>Saved Bids</h2><div id="bidsList"></div></div>
  </section>

  <section id="expensesView" class="hidden">
    <div class="box noPrint"><button onclick="toggleBox('expenseFormBox')">Add Expense</button></div>
    <div id="expenseFormBox" class="box hidden">
      <h2 id="expenseFormTitle">Add Expense</h2>
      <input id="expenseDate" type="date"><input id="expenseCategory" placeholder="Category">
      <input id="expenseAmount" type="number" placeholder="Amount"><textarea id="expenseNotes" placeholder="Notes"></textarea>
      <button onclick="saveExpense()">Save Expense</button>
      <button class="secondary" onclick="resetExpenseForm()">Clear</button>
    </div>
    <div id="expenseList"></div>
  </section>

  <section id="invoicesView" class="hidden">
    <div class="box noPrint">
      <h2>Invoice Center</h2>
      <select id="invoiceCustomerSelect"></select>
      <input id="invoiceDueDate" type="date">
      <textarea id="invoiceNotes" placeholder="Invoice notes or payment instructions">Payment due upon receipt. Please call or text 918-424-7953 to arrange payment.</textarea>
      <div class="formSection">Discount (Optional)</div>
      <input id="invoiceDiscountLabel" placeholder="Discount label, ex: Loyal Customer Discount">
      <div style="display:flex;gap:8px;align-items:center">
        <select id="invoiceDiscountType" style="width:auto;margin:0">
          <option value="amount">$ Fixed</option>
          <option value="percent">% Off</option>
        </select>
        <input id="invoiceDiscountValue" type="number" min="0" placeholder="0" style="flex:1;margin:0">
      </div>
      <button onclick="makeInvoiceFromCenter()">Create Invoice</button>
    </div>
    <div class="box"><h2>Customers With Balances</h2><div id="invoiceCustomerList"></div></div>
  </section>

  <section id="invoiceView" class="hidden"><div id="invoiceArea"></div></section>

  <section id="partnersView" class="hidden">
    <div class="box" style="background:var(--green-surface);border-color:var(--green-border)">
      <h2 style="color:var(--green-text)">Referral Partners</h2>
      <p class="small" style="color:var(--green-text)">Track real estate agents and referral partners. Set follow-up dates so no relationship goes cold.</p>
    </div>
    <div class="box noPrint"><button onclick="toggleBox('partnerFormBox')">Add Partner</button></div>
    <div id="partnerFormBox" class="box hidden">
      <h2 id="partnerFormTitle">Add Partner</h2>
      <div class="formSection">Contact</div>
      <input id="partnerName" placeholder="Full name">
      <input id="partnerCompany" placeholder="Company / Brokerage">
      <input id="partnerPhone" placeholder="Phone">
      <input id="partnerEmail" placeholder="Email">
      <div class="formSection">Follow-Up</div>
      <div class="small" style="margin-bottom:2px">Last Contact Date</div>
      <input id="partnerLastContact" type="date">
      <div class="small" style="margin-bottom:2px;margin-top:8px">Next Follow-Up Date</div>
      <input id="partnerFollowUpDate" type="date">
      <div class="formSection">Notes</div>
      <textarea id="partnerNotes" placeholder="Notes, recent conversations, what they need..."></textarea>
      <button onclick="savePartner()" style="margin-top:12px">Save Partner</button>
      <button class="secondary" onclick="resetPartnerForm()">Clear</button>
    </div>
    <div id="partnerList"></div>
  </section>

  <section id="settingsView" class="hidden">
    <div class="box">
      <h2>Menu</h2>
      <div class="moreSection">
        <div class="moreSectionLabel">Work</div>
        <div class="moreGrid">
          <button onclick="showView('jobsView')">All Jobs</button>
          <button onclick="showView('scheduleView');showAllSchedule()">Schedule</button>
          <button onclick="showView('invoicesView')">Invoices</button>
          <button onclick="openWorkflow()">Workflow</button>
        </div>
      </div>
      <div class="moreSection">
        <div class="moreSectionLabel">Money</div>
        <div class="moreGrid">
          <button onclick="showView('paymentsView')">Payments</button>
          <button onclick="showView('expensesView')">Expenses</button>
          <button onclick="openProfitBreakdown()">Reports</button>
        </div>
      </div>
      <div class="moreSection">
        <div class="moreSectionLabel">Relationships</div>
        <div class="moreGrid">
          <button onclick="showView('partnersView')">Partners</button>
          <button onclick="showView('recurringView')">Recurring</button>
        </div>
      </div>
      <div class="moreSection">
        <div class="moreSectionLabel">Tools</div>
        <div class="moreGrid">
          <button onclick="openGlobalSearch()">Search</button>
          <button onclick="exportBackup()">Export Backup</button>
          <button class="secondary" onclick="logout()">Logout</button>
        </div>
      </div>
    </div>
  </section>

  <section id="globalSearchView" class="hidden">
    <div class="box"><h2>Search Everything</h2><input id="globalSearchInput" placeholder="Search customers, jobs, payments, expenses, bids, partners..." oninput="runGlobalSearch()"></div>
    <div id="globalSearchResults"><p class="small" style="padding:0 4px">Start typing to search across all your data.</p></div>
  </section>
</section>`;

bottomNav.innerHTML=`
  <button id="navHome"      onclick="showView('dashboardView')">${ICONS.home}<span>Home</span></button>
  <button id="navSchedule"  onclick="openTodaySchedule()">${ICONS.schedule}<span>Schedule</span></button>
  <button id="navCustomers" onclick="showView('customersView')">${ICONS.customers}<span>Clients</span></button>
  <button id="navBids"      onclick="showView('bidsView')">${ICONS.bids}<span>Bids</span></button>
  <button id="navMore"      onclick="showView('settingsView')">${ICONS.more}<span>More</span></button>`;

fabMenu.innerHTML=`
  <button onclick="toggleFab();showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
  <button onclick="toggleFab();showView('bidsView');toggleBox('bidFormBox',true)">Create Bid</button>
  <button onclick="toggleFab();showView('customersView');toggleBox('customerFormBox',true)">Add Customer</button>
  <button onclick="toggleFab();showView('expensesView');toggleBox('expenseFormBox',true)">Add Expense</button>
  <button onclick="toggleFab();showView('recurringView');toggleBox('recurringFormBox',true)">Add Recurring</button>`;

fabButton.addEventListener("click",()=>toggleFab());
setTimeout(()=>{
  if(el("jobDate")) el("jobDate").value=today();
  if(el("recurringNextDate")) el("recurringNextDate").value=today();
  if(el("expenseDate")) el("expenseDate").value=today();
  if(el("invoiceDueDate")) el("invoiceDueDate").value=today();
  if(el("partnerLastContact")) el("partnerLastContact").value=today();
  if(el("partnerFollowUpDate")) el("partnerFollowUpDate").value=addDays(today(),30);
},0);

window.login=async function(){try{await signInWithEmailAndPassword(auth,el("loginEmail").value.trim(),el("loginPassword").value);}catch(e){alert("Login error: "+e.message);}};
window.signup=async function(){try{await createUserWithEmailAndPassword(auth,el("loginEmail").value.trim(),el("loginPassword").value);}catch(e){alert("Signup error: "+e.message);}};
window.logout=async function(){await signOut(auth);};
window.toggleFab=function(){fabMenu.classList.toggle("hidden");};

let listenersStarted=false;
onAuthStateChanged(auth,user=>{
  if(user){
    el("loginScreen").classList.add("hidden");el("appScreen").classList.remove("hidden");
    bottomNav.classList.remove("hidden");fabButton.classList.remove("hidden");
    startListeners();showView("dashboardView");
  }else{
    el("loginScreen").classList.remove("hidden");el("appScreen").classList.add("hidden");
    bottomNav.classList.add("hidden");fabButton.classList.add("hidden");
  }
});

function startListeners(){
  if(listenersStarted)return;listenersStarted=true;
  onSnapshot(collection(db,"customers"),snap=>{customers=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"jobs"),snap=>{jobs=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"recurring"),snap=>{recurring=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"expenses"),snap=>{expenses=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"payments"),snap=>{payments=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"bids"),snap=>{bids=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  onSnapshot(collection(db,"partners"),snap=>{partners=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll();});
  // Load Craig's learned flag hours
  onSnapshot(doc(db,"settings","flagHours"),snap=>{
    if(snap.exists())learnedMins={...snap.data()};
  });
  setupWorkflowDragAndDrop();
}

// Return duration in minutes for a service — Craig's learned value wins over system default
function getJobMins(serviceId){
  if(!serviceId)return 60;
  if(learnedMins[serviceId]!==undefined)return learnedMins[serviceId];
  const svc=PRICE_LIST.find(s=>s.id===serviceId);
  return svc?.mins||60;
}

// Silently save Craig's preferred duration for a service to Firestore
async function saveLearnedMins(serviceId,mins){
  if(!serviceId||mins===undefined)return;
  learnedMins[serviceId]=mins;
  try{await updateDoc(doc(db,"settings","flagHours"),{[serviceId]:mins});}
  catch(e){
    // Doc may not exist yet — create it
    try{const {setDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db,"settings","flagHours"),learnedMins,{merge:true});}catch(e2){}
  }
}

// Format minutes as readable string: "1 hr 30 min", "45 min", "2 hrs"
function fmtMins(m){
  if(!m||m===0)return"0 min";
  const h=Math.floor(m/60),min=m%60;
  if(h&&min)return`${h} hr${h>1?"s":""} ${min} min`;
  if(h)return`${h} hr${h>1?"s":""}`;
  return`${min} min`;
}

// ── Photo helpers ──────────────────────────────────────────────────────────

// Compress an image file to base64 JPEG under PHOTO_MAX_WIDTH
function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,PHOTO_MAX_WIDTH/img.width);
        const canvas=document.createElement("canvas");
        canvas.width=Math.round(img.width*scale);
        canvas.height=Math.round(img.height*scale);
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",PHOTO_QUALITY));
      };
      img.onerror=reject;
      img.src=e.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

// Save a photo to a job (type: "before" or "after")
window.addJobPhoto=async function(jobId,type){
  const input=document.createElement("input");
  input.type="file";input.accept="image/*";input.capture="environment";
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    showToast("Uploading photo...");
    try{
      const b64=await compressPhoto(file);
      const job=jobs.find(j=>j.id===jobId);if(!job)return;
      const photos=job.photos||{};
      photos[type]=b64;
      await updateDoc(doc(db,"jobs",jobId),{photos});
      showToast("Photo saved");
      renderAll();
    }catch(e){showToast("Photo failed — try again");}
  };
  input.click();
};

// Remove a photo from a job
window.removeJobPhoto=async function(jobId,type){
  if(!confirm("Remove this photo?"))return;
  const job=jobs.find(j=>j.id===jobId);if(!job)return;
  const photos={...job.photos||{}};
  delete photos[type];
  await updateDoc(doc(db,"jobs",jobId),{photos});
  showToast("Photo removed");
  renderAll();
};

// View a photo fullscreen
window.viewJobPhoto=function(src){
  const overlay=document.createElement("div");
  overlay.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px";
  overlay.onclick=()=>overlay.remove();
  const img=document.createElement("img");
  img.src=src;img.style.cssText="max-width:100%;max-height:100%;border-radius:12px;object-fit:contain";
  overlay.appendChild(img);
  document.body.appendChild(overlay);
};

// Render photo section HTML for a job card
// Jobs where before/after photos don't make sense
const NO_PHOTO_KEYWORDS=["photo","drone","aerial","lockbox","yard sign","key dup","key duplication","staging","check-in","checkin","storm inspection","utility","winterize"];

function jobPhotoHtml(j){
  // Skip for photography/drone jobs and quick service jobs where docs add no value
  const title=(j.title||"").toLowerCase();
  if(NO_PHOTO_KEYWORDS.some(k=>title.includes(k)))return"";
  const photos=j.photos||{};
  const makeThumb=(type,label)=>{
    if(photos[type])return`
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:4px">${label}</div>
        <div style="position:relative;display:inline-block;width:100%">
          <img src="${photos[type]}" onclick="viewJobPhoto('${photos[type]}')" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;cursor:pointer;border:1px solid var(--border)">
          <button onclick="event.stopPropagation();removeJobPhoto('${j.id}','${type}')" style="position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;margin:0;background:rgba(0,0,0,0.55);border:none;border-radius:50%;font-size:13px;color:#fff;line-height:1;min-width:0">✕</button>
        </div>
      </div>`;
    return`
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:4px">${label}</div>
        <button class="secondary" style="width:100%;aspect-ratio:4/3;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:10px;font-size:22px;color:var(--muted)" onclick="addJobPhoto('${j.id}','${type}')">
          📷<span style="font-size:11px;font-weight:500">Add ${label}</span>
        </button>
      </div>`;
  };
  return`<div style="display:flex;gap:8px;margin:10px 0">
    ${makeThumb("before","Before")}
    ${makeThumb("after","After")}
  </div>`;
}

const ALL_VIEWS=["dashboardView","workflowView","scheduleView","profitView","customersView","customerDetailView","jobsView","paymentsView","bidsView","recurringView","expensesView","invoicesView","invoiceView","partnersView","settingsView","globalSearchView"];

window.showView=function(id){
  // Track navigation history
  const currentVisible=ALL_VIEWS.find(v=>!el(v).classList.contains("hidden"));
  if(currentVisible&&currentVisible!==id){
    navHistory.push(currentVisible);
    if(navHistory.length>20)navHistory.shift();
  }
  if(TOP_LEVEL_VIEWS.includes(id))navHistory=[];

  ALL_VIEWS.forEach(v=>el(v).classList.add("hidden"));
  el(id).classList.remove("hidden");
  fabMenu.classList.add("hidden");

  // Show/hide back button
  let backBtn=el("globalBackBtn");
  if(!backBtn){
    backBtn=document.createElement("button");
    backBtn.id="globalBackBtn";
    backBtn.className="backBtn noPrint";
    backBtn.onclick=goBack;
    backBtn.innerHTML="Back";
    const appScreen=el("appScreen");
    if(appScreen)appScreen.insertBefore(backBtn,appScreen.firstChild);
  }
  backBtn.style.display=TOP_LEVEL_VIEWS.includes(id)||navHistory.length===0?"none":"flex";

  document.querySelectorAll(".bottomNav button").forEach(b=>b.classList.remove("active"));
  if(id==="dashboardView") el("navHome").classList.add("active");
  else if(id==="scheduleView") el("navSchedule").classList.add("active");
  // Render calendar when schedule view opens
  if(id==="scheduleView")setTimeout(()=>{if(calViewMode==="cal")renderCalendar();},50);
  else if(id==="customersView"||id==="customerDetailView") el("navCustomers").classList.add("active");
  else if(id==="bidsView"||id==="invoiceView") el("navBids").classList.add("active");
  else el("navMore").classList.add("active");
  const titles={dashboardView:"Business dashboard",scheduleView:"Schedule",workflowView:"Workflow board",bidsView:"Bids",profitView:"Reports",customersView:"Customers",customerDetailView:"Customer detail",jobsView:"Jobs",paymentsView:"Payments",recurringView:"Recurring calendar",expensesView:"Expense ledger",invoicesView:"Invoice center",invoiceView:"Invoice preview",partnersView:"Referral Partners",settingsView:"More",globalSearchView:"Search"};
  document.getElementById("headerSub").innerText=titles[id]||"Business dashboard";
  window.scrollTo(0,0);
};

window.openPaidJobs=function(){showView("jobsView");el("jobStatusFilter").value="paid";el("jobSearch").value="";renderAll();};
window.openOwedJobs=function(){showView("jobsView");el("jobStatusFilter").value="unpaid";el("jobSearch").value="";renderAll();};
window.openTodaySchedule=function(){showView("scheduleView");setCalView("cal");calGoToToday();};
window.openUpcomingSchedule=function(){showView("scheduleView");setCalView("list");renderSchedule("upcoming");};
window.showAllSchedule=function(){showView("scheduleView");setCalView("list");renderSchedule("all");};

// Calendar state
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth(); // 0-indexed
let calSelectedDate=today();
let calViewMode="cal"; // "cal" or "list"

window.setCalView=function(mode){
  calViewMode=mode;
  el("calendarPanel").style.display=mode==="cal"?"block":"none";
  el("calListPanel").style.display=mode==="list"?"block":"none";
  el("calViewBtnCal").classList.toggle("active",mode==="cal");
  el("calViewBtnList").classList.toggle("active",mode==="list");
  if(mode==="cal")renderCalendar();
};

window.calPrevMonth=function(){
  calMonth--;if(calMonth<0){calMonth=11;calYear--;}
  renderCalendar();
};
window.calNextMonth=function(){
  calMonth++;if(calMonth>11){calMonth=0;calYear++;}
  renderCalendar();
};
window.calGoToToday=function(){
  const now=new Date();calYear=now.getFullYear();calMonth=now.getMonth();
  calSelectedDate=today();renderCalendar();
};

function jobStatusColor(j){
  if(j.status==="Complete"||jobBalance(j)<=0)return"#087443";
  if(j.status==="In Progress")return"#b45309";
  return"#b7791f";
}

window.renderCalendar=function(){
  const grid=el("calGrid");if(!grid)return;
  const monthNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
  if(el("calMonthLabel"))el("calMonthLabel").innerText=`${monthNames[calMonth]} ${calYear}`;
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const daysInPrev=new Date(calYear,calMonth,0).getDate();
  const todayStr=today();
  const jobsByDate={};
  jobs.filter(j=>j.date).forEach(j=>{
    if(!jobsByDate[j.date])jobsByDate[j.date]=[];
    jobsByDate[j.date].push(j);
  });
  const makeCell=(d,ds,isOther)=>{
    const dayJobs=(jobsByDate[ds]||[]).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
    const isToday=ds===todayStr,isSelected=ds===calSelectedDate;
    const totalMins=dayJobs.reduce((sum,j)=>sum+(j.mins||60),0);
    const loadCls=dayJobs.length?(totalMins>=420?"load-heavy":totalMins>=240?"load-moderate":"load-light"):"";
    const cls=["calCell",isOther?"otherMonth":"",isToday?"today":"",isSelected?"selected":"",loadCls].filter(Boolean).join(" ");
    const dots=dayJobs.slice(0,3).map(j=>`<div class="calDot" style="background:${jobStatusColor(j)}"></div>`).join("");
    const extra=dayJobs.length>3?`<div class="calJobCount">+${dayJobs.length-3}</div>`:"";
    return`<div class="${cls}" onclick="calSelectDate('${ds}')"><div class="calDateCircle">${d}</div><div class="calDots">${dots}</div>${extra}</div>`;
  };
  let cells="";
  for(let i=firstDay-1;i>=0;i--){
    const d=daysInPrev-i;
    cells+=makeCell(d,`${calYear}-${String(calMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`,true);
  }
  for(let d=1;d<=daysInMonth;d++){
    cells+=makeCell(d,`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,false);
  }
  const trailing=(7-(firstDay+daysInMonth)%7)%7;
  for(let d=1;d<=trailing;d++){
    const nm=calMonth+1>11?0:calMonth+1,ny=calMonth+1>11?calYear+1:calYear;
    cells+=makeCell(d,`${ny}-${String(nm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,true);
  }
  grid.innerHTML=cells;
  const panel=el("calDayPanel");
  if(panel&&panel.classList.contains("open"))renderCalDayPanel(calSelectedDate);
};

window.calSelectDate=function(ds){
  const panel=el("calDayPanel");
  const wasSameDay=ds===calSelectedDate;
  calSelectedDate=ds;
  const parts=ds.split("-");
  const y=parseInt(parts[0]),m=parseInt(parts[1])-1;
  if(y!==calYear||m!==calMonth){calYear=y;calMonth=m;}
  renderCalendar();
  if(!panel)return;
  if(wasSameDay&&panel.classList.contains("open")){
    panel.classList.remove("open");
  }else{
    renderCalDayPanel(ds);
    panel.classList.add("open");
  }
};

function renderCalDayPanel(ds){
  const panel=el("calDayPanel");if(!panel)return;
  const dayJobs=jobs.filter(j=>j.date===ds).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const parts=ds.split("-");
  const dateObj=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const dayLabel=dateObj.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const isToday=ds===today();
  const totalMins=dayJobs.reduce((sum,j)=>sum+(j.mins||60),0);
  const timeTag=dayJobs.length?`<span style="font-size:12px;font-weight:500;color:var(--text-secondary);margin-left:8px">${fmtMins(totalMins)} est.</span>`:"";
  let html=`<div class="calDayPanelInner"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:15px;font-weight:700;color:var(--text)">${isToday?"Today · ":""}${dayLabel}${timeTag}</div><button class="secondary" style="width:auto;padding:6px 12px;font-size:12px" onclick="calAddJobOnDate('${ds}')">+ Add Job</button></div>`;
  if(!dayJobs.length){html+=`<p class="small" style="color:var(--text-secondary);padding:4px 0 8px">Nothing scheduled — tap + Add Job.</p>`;}
  else{html+=dayJobs.map(todayCardHtml).join("");}
  html+=`</div>`;
  panel.innerHTML=html;
}

window.calAddJobOnDate=function(ds){
  showView("jobsView");toggleBox("jobFormBox",true);resetJobForm();
  if(el("jobDate"))el("jobDate").value=ds;
};
window.openExpenses=function(){showView("expensesView");};
window.openPayments=function(){showView("paymentsView");};
window.openProfitBreakdown=function(){showView("profitView");renderAll();switchReportTab("overview");};

window.switchReportTab=function(tab){
  ["overview","period","aging"].forEach(t=>{
    const el2=el("report"+t.charAt(0).toUpperCase()+t.slice(1));
    if(el2)el2.style.display=t===tab?"block":"none";
    const btn=el("tab"+t.charAt(0).toUpperCase()+t.slice(1));
    if(btn)btn.classList.toggle("active",t===tab);
  });
  if(tab==="aging")renderAgingReport();
  if(tab==="period"){const c=el("periodReportContent");if(c&&!c.innerHTML)generatePeriodReport();}
};

window.generatePeriodReport=function(){
  const from=el("profitFrom")?.value||"";
  const to=el("profitTo")?.value||"";
  const fPmts=payments.filter(p=>{if(from&&(p.date||"")<from)return false;if(to&&(p.date||"")>to)return false;return true;});
  const fExps=expenses.filter(e=>{if(from&&(e.date||"")<from)return false;if(to&&(e.date||"")>to)return false;return true;});
  const totalIn=fPmts.reduce((s,p)=>s+Number(p.amount||0),0);
  const totalOut=fExps.reduce((s,e)=>s+Number(e.amount||0),0);
  const net=totalIn-totalOut;
  const totalOwed=jobs.reduce((s,j)=>s+jobBalance(j),0);
  const label=from&&to?`${dateLabel(from)} — ${dateLabel(to)}`:from?`From ${dateLabel(from)}`:to?`Through ${dateLabel(to)}`:"All Time";

  const expGrp={};fExps.forEach(e=>{const k=e.category||"Other";expGrp[k]=(expGrp[k]||0)+Number(e.amount||0);});

  el("periodReportContent").innerHTML=`
    <div class="periodReport" id="printableReport">
      <div class="periodHeader">
        <div style="font-size:20px;font-weight:700;color:#1a1710">${safe(COMPANY.name)}</div>
        <div style="font-size:13px;color:#9a8f80;margin-top:2px">${safe(COMPANY.phone)} &bull; ${safe(COMPANY.email)}</div>
        <div style="font-size:15px;font-weight:600;margin-top:8px">Financial Report</div>
        <div style="font-size:13px;color:#9a8f80">${safe(label)}</div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8f80;margin-bottom:8px">Income</div>
        <table class="periodTable">
          <thead><tr><th>Date</th><th>Customer</th><th>Job</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${fPmts.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<tr><td>${dateLabel(p.date)}</td><td>${safe(getCustomerName(p.customerId))}</td><td>${safe(job?.title||p.notes||"Payment")}</td><td style="text-align:right;color:#087443;font-weight:600">${money(p.amount)}</td></tr>`;}).join("")}
            <tr class="totalRow"><td colspan="3"><strong>Total Income</strong></td><td style="text-align:right;color:#087443"><strong>${money(totalIn)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8f80;margin-bottom:8px">Expenses</div>
        <table class="periodTable">
          <thead><tr><th>Date</th><th>Category</th><th>Notes</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${fExps.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(e=>`<tr><td>${dateLabel(e.date)}</td><td>${safe(e.category)}</td><td>${safe(e.notes||"")}</td><td style="text-align:right;color:#b42318;font-weight:600">${money(e.amount)}</td></tr>`).join("")}
            <tr class="totalRow"><td colspan="3"><strong>Total Expenses</strong></td><td style="text-align:right;color:#b42318"><strong>${money(totalOut)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      ${Object.keys(expGrp).length>0?`<div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8f80;margin-bottom:8px">Expense By Category</div>
        <table class="periodTable">
          <tbody>${Object.entries(expGrp).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${safe(k)}</td><td style="text-align:right;font-weight:600">${money(v)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`:""}

      <div class="periodSummary">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8f80;margin-bottom:10px">Summary</div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid #e0dbd0"><span>Total Income</span><strong style="color:#087443">${money(totalIn)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid #e0dbd0"><span>Total Expenses</span><strong style="color:#b42318">${money(totalOut)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #1a1710;margin-top:4px"><span style="font-weight:700;font-size:15px">Net Profit</span><strong style="font-size:18px;color:${net>=0?"#087443":"#b42318"}">${money(net)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:0.5px solid #e0dbd0;margin-top:4px"><span>Total Outstanding (All Time)</span><strong>${money(totalOwed)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Report Generated</span><span style="color:#9a8f80">${new Date().toLocaleDateString()}</span></div>
      </div>

      <div class="row noPrint" style="margin-top:16px">
        <button onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>`;
};

function renderAgingReport(){
  const todayStr=today();
  const unpaidJobs=jobs.filter(j=>jobBalance(j)>0&&j.date);
  const buckets=[
    {label:"Current",sub:"0 – 30 days",min:0,max:30,cls:"agingBucketCurrent",textCls:"#087443",badgeBg:"#dcfce7",badgeColor:"#054f31"},
    {label:"Overdue",sub:"31 – 60 days",min:31,max:60,cls:"agingBucketWarn",textCls:"#b45309",badgeBg:"#fef3c7",badgeColor:"#7c4a00"},
    {label:"Critical",sub:"60+ days — needs immediate attention",min:61,max:9999,cls:"agingBucketCrit",textCls:"#b42318",badgeBg:"#fee2e2",badgeColor:"#7f1d1d"},
  ];
  let html="";
  let anyFound=false;
  buckets.forEach(b=>{
    const items=unpaidJobs.map(j=>{
      const d=daysBetween(j.date,todayStr);
      return{...j,days:d,bal:jobBalance(j)};
    }).filter(j=>j.days>=b.min&&j.days<=b.max).sort((a,b2)=>b2.days-a.days);
    if(!items.length)return;
    anyFound=true;
    const bucketTotal=items.reduce((s,j)=>s+j.bal,0);
    html+=`<div class="agingBucket">
      <div class="agingBucketHeader ${b.cls}">
        <div><div style="font-size:15px;font-weight:700;color:${b.textCls}">${b.label}</div><div style="font-size:12px;color:${b.textCls};opacity:0.75">${b.sub}</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:${b.textCls}">${money(bucketTotal)}</div><div style="font-size:11px;color:${b.textCls};opacity:0.75">${items.length} job${items.length===1?"":"s"}</div></div>
      </div>
      ${items.map(j=>{const cust=getCustomer(j.customerId);const phone=cleanPhone(cust?.phone);return`<div class="agingRow">
        <div class="agingRowLeft">
          <div class="agingRowName">${safe(getCustomerName(j.customerId))}</div>
          <div class="agingRowSub">${safe(j.title)} &bull; ${dateLabel(j.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span class="agingDaysBadge" style="background:${b.badgeBg};color:${b.badgeColor}">${j.days}d</span>
          <span class="agingAmt" style="color:${b.textCls}">${money(j.bal)}</span>
          ${phone?`<a href="tel:${phone}" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(8,116,67,0.1);border-radius:50%;text-decoration:none;font-size:15px">📞</a>`:""}
        </div>
      </div>`}).join("")}
    </div>`;
  });
  if(!anyFound)html=`<div class="box" style="text-align:center;padding:32px 16px"><div style="font-size:32px;margin-bottom:8px">✅</div><div style="font-weight:600;font-size:16px;color:#087443">All caught up!</div><div class="small" style="margin-top:4px">No outstanding balances found.</div></div>`;
  el("agingReportContent").innerHTML=`<div style="margin-bottom:12px"><div style="font-size:22px;font-weight:700;color:var(--text)">Outstanding Balances</div><div class="small">All jobs with unpaid balances, sorted by age.</div></div>${html}`;
}
window.openWorkflow=function(){showView("workflowView");renderWorkflowBoard();};
window.openGlobalSearch=function(){showView("globalSearchView");setTimeout(()=>{const i=el("globalSearchInput");if(i){i.focus();i.value="";runGlobalSearch();}},100);};

// Smart prompts — contextual follow-up questions on the job form
// Travel fee prompt — shown on every job and bid, no keyword logic needed
const TRAVEL_PROMPT_HTML=`
  <div class="jobFormToggle" onclick="toggleJobPrompt('travelPrompt')">
    <div>
      <div class="jobFormToggleLabel">🚗 Add travel fee?</div>
      <div class="jobFormToggleSub">Enter the job address to calculate mileage from McAlester.</div>
    </div>
    <div class="jobFormToggleArrow" id="travelPromptArrow">⌄</div>
  </div>
  <div class="jobFormSection" id="travelPromptSection">
    <input id="jobPropertyAddr" placeholder="Job address (e.g. 123 Main St, Hartshorne, OK)" style="margin-bottom:6px">
    <button class="secondary" style="width:auto;padding:7px 14px;font-size:13px" onclick="calcJobTravelFee()">Calculate</button>
    <div id="jobTravelResult" class="smartPromptResult"></div>
    <div id="jobTravelFeeField" style="display:none;margin-top:8px">
      <div class="small" style="margin-bottom:4px">Travel fee</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px">$</span>
        <input id="jobTravelFeeAmt" type="number" min="0" placeholder="0" style="width:100px;margin:0">
        <span style="font-size:12px;color:var(--text-secondary)">adjustable</span>
      </div>
    </div>
  </div>`;

window.checkJobSmartPrompts=function(){
  const container=el("jobSmartPrompts");
  if(!container||container.dataset.prompts==="set")return;
  container.dataset.prompts="set";
  container.innerHTML=TRAVEL_PROMPT_HTML;
};

window.initBidTravelPrompt=function(){
  const container=el("bidSmartPrompts");
  if(!container)return;
  container.dataset.prompts="set";

  const custId=el("bidCustomer")?.value;
  const cust=custId?getCustomer(custId):null;
  const savedAddr=cust?.address||"";
  const addrShortcut=savedAddr?`
    <div style="margin-bottom:8px">
      <div class="small" style="margin-bottom:4px;color:#166534">Use client's saved address:</div>
      <button class="secondary" style="width:auto;padding:7px 12px;font-size:13px" onclick="useBidClientAddress(this.dataset.addr)" data-addr="${savedAddr.replace(/"/g,'&quot;')}">📍 ${(cust?.name||"Client").replace(/</g,'&lt;')} — ${savedAddr.replace(/</g,'&lt;')}</button>
    </div>
    <div class="small" style="margin-bottom:4px;color:#9a8f80">Or enter a different address:</div>`:"";

  container.innerHTML=`
    <div class="jobFormToggle" onclick="toggleJobPrompt('bidTravelPrompt')">
      <div>
        <div class="jobFormToggleLabel">🚗 Add travel fee?</div>
        <div class="jobFormToggleSub">Calculate mileage from McAlester to the job location.</div>
      </div>
      <div class="jobFormToggleArrow" id="bidTravelPromptArrow">⌄</div>
    </div>
    <div class="jobFormSection" id="bidTravelPromptSection">
      ${addrShortcut}
      <input id="bidPropertyAddr" placeholder="Job address (e.g. 123 Main St, Hartshorne, OK)" style="margin-bottom:6px">
      <button class="secondary" style="width:auto;padding:7px 14px;font-size:13px" onclick="calcBidTravelFee()">Calculate</button>
      <div id="bidTravelResult" class="smartPromptResult"></div>
      <div id="bidTravelFeeField" style="display:none;margin-top:8px">
        <div class="small" style="margin-bottom:4px">Travel fee — tap Add to include on bid</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px">$</span>
          <input id="bidTravelFeeAmt" type="number" min="0" placeholder="0" style="width:100px;margin:0">
          <button class="green" style="width:auto;padding:7px 14px;font-size:13px" onclick="addBidTravelFeeToItems()">Add to Bid</button>
        </div>
      </div>
    </div>`;
};

window.refreshBidTravelPrompt=function(){
  const container=el("bidSmartPrompts");
  if(!container)return;
  container.dataset.prompts="";
  initBidTravelPrompt();
};

window.useBidClientAddress=async function(addr){
  const input=el("bidPropertyAddr");
  if(input)input.value=addr;
  const resultEl=el("bidTravelResult");
  if(resultEl)resultEl.innerText="Calculating...";
  // Open the section if not already open
  const section=el("bidTravelPromptSection");
  if(section&&!section.classList.contains("open")){
    section.classList.add("open");section.style.display="block";
    const arrow=el("bidTravelPromptArrow");
    if(arrow)arrow.classList.add("open");
  }
  const result=await calcTravelFee(addr);
  if(resultEl)resultEl.innerText=result.note;
  const feeField=el("bidTravelFeeField");
  const feeAmt=el("bidTravelFeeAmt");
  if(feeField)feeField.style.display=result.fee>0?"block":"none";
  if(feeAmt)feeAmt.value=result.fee;
};


window.calcBidTravelFee=async function(){
  const addr=el("bidPropertyAddr")?.value||"";
  if(!addr.trim()){el("bidTravelResult").innerText="Enter an address first.";return;}
  const btn=event.target;btn.innerText="Calculating...";btn.disabled=true;
  const result=await calcTravelFee(addr);
  btn.innerText="Calculate";btn.disabled=false;
  el("bidTravelResult").innerText=result.note;
  const feeField=el("bidTravelFeeField");
  const feeAmt=el("bidTravelFeeAmt");
  if(feeField)feeField.style.display=result.fee>0?"block":"none";
  if(feeAmt)feeAmt.value=result.fee;
};

window.addBidTravelFeeToItems=function(){
  const amt=Number(el("bidTravelFeeAmt")?.value||0);
  const addr=el("bidPropertyAddr")?.value||"";
  if(!amt)return;
  addBidItemRow(`Travel Fee${addr?" — "+addr:""}`,1,amt);
  // Reset prompt
  const container=el("bidSmartPrompts");
  if(container){container.innerHTML="";container.dataset.prompts="";}
  setTimeout(initBidTravelPrompt,100);
  showToast("Travel fee added to bid");
};

window.toggleJobPrompt=function(id){
  const section=el(id+"Section");
  const arrow=el(id+"Arrow");
  if(!section)return;
  const isOpen=section.classList.contains("open");
  section.classList.toggle("open",!isOpen);
  section.style.display=isOpen?"none":"block";
  if(arrow)arrow.classList.toggle("open",!isOpen);
};

window.calcJobTravelFee=async function(){
  const addr=el("jobPropertyAddr")?.value||"";
  if(!addr.trim()){el("jobTravelResult").innerText="Enter an address first.";return;}
  el("jobTravelResult").innerText="Calculating...";
  const result=await calcTravelFee(addr);
  el("jobTravelResult").innerText=result.note;
  const feeField=el("jobTravelFeeField");
  const feeAmt=el("jobTravelFeeAmt");
  if(feeField)feeField.style.display="block";
  if(feeAmt)feeAmt.value=result.fee;
};
window.toggleBox=function(id,forceOpen){
  const b=el(id);if(!b)return;
  if(forceOpen===true){b.classList.remove("hidden");}
  else b.classList.toggle("hidden");
  const isOpen=!b.classList.contains("hidden");
  // Init smart prompts when forms open
  if(isOpen){
    if(id==="jobFormBox"){setTimeout(checkJobSmartPrompts,50);}
    if(id==="bidFormBox"){setTimeout(initBidTravelPrompt,50);}
  }
  // Hide saved bids list while bid form is open — less distraction
  if(id==="bidFormBox"){
    const savedSection=el("savedBidsSection");
    if(savedSection)savedSection.style.display=isOpen?"none":"";
  }
};
window.clearProfitFilter=function(){el("profitFrom").value="";el("profitTo").value="";renderAll();};

function getCustomer(id){return customers.find(c=>c.id===id);}
function getCustomerName(id){return getCustomer(id)?.name||"Unknown customer";}
function jobPayments(jid){return payments.filter(p=>p.jobId===jid).sort((a,b)=>(b.date||"").localeCompare(a.date||""));}
function jobPaidAmount(j){const l=jobPayments(j.id);return l.length?l.reduce((s,p)=>s+Number(p.amount||0),0):Number(j.paid||0);}
function jobBalance(j){return Math.max(0,Number(j.amount||0)-jobPaidAmount(j));}
function paymentStatus(j){const b=jobBalance(j);if(b===0)return"Paid";if(jobPaidAmount(j)>0)return"Partial";return"Unpaid";}
function paymentBadge(j){const s=paymentStatus(j);if(s==="Paid")return`<span class="badge badgeGreen">Paid</span>`;if(s==="Partial")return`<span class="badge badgeGold">Partial</span>`;return`<span class="badge badgeRed">Unpaid</span>`;}
function workflowBadge(j){const s=j.status||"Scheduled";if(s==="Complete")return`<span class="badge badgeGreen">Complete</span>`;if(s==="In Progress")return`<span class="badge badgeGold">In Progress</span>`;return`<span class="badge badgeBlue">${safe(s)}</span>`;}
function customerTotals(cid){const l=jobs.filter(j=>j.customerId===cid);return{charged:l.reduce((s,j)=>s+Number(j.amount||0),0),paid:l.reduce((s,j)=>s+jobPaidAmount(j),0),owed:l.reduce((s,j)=>s+jobBalance(j),0)};}

function customerTier(paid){
  if(paid>=3000)return{name:"Platinum",color:"#7c3aed",bg:"rgba(124,58,237,0.1)",border:"rgba(124,58,237,0.3)",next:null,   nextAt:null,prevAt:3000};
  if(paid>=1500)return{name:"Gold",    color:"#b7791f",bg:"rgba(183,121,31,0.1)",border:"rgba(183,121,31,0.3)",next:"Platinum",nextAt:3000,prevAt:1500};
  if(paid>=500) return{name:"Silver",  color:"#64748b",bg:"rgba(100,116,139,0.1)",border:"rgba(100,116,139,0.3)",next:"Gold",  nextAt:1500,prevAt:500};
  return        {name:"Bronze",        color:"#9a6340",bg:"rgba(154,99,64,0.1)",  border:"rgba(154,99,64,0.3)",  next:"Silver",nextAt:500, prevAt:0};
}

function tierBadgeHtml(paid){
  if(paid<=0)return"";
  const t=customerTier(paid);
  const icons={Platinum:"\u2726",Gold:"\u2605",Silver:"\u25c8",Bronze:"\u25c6"};
  return`<span style="background:${t.bg};color:${t.color};border:1px solid ${t.border};border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600;white-space:nowrap">${icons[t.name]} ${t.name}</span>`;
}

function tierProgressHtml(paid){
  if(paid<=0)return"";
  const t=customerTier(paid);
  if(!t.next)return`<div style="font-size:12px;color:${t.color};font-weight:600;margin-top:4px">\u2726 Top tier customer</div>`;
  const range=t.nextAt-t.prevAt;
  const progress=Math.min(100,Math.round((paid-t.prevAt)/range*100));
  return`<div style="margin-top:6px"><div style="font-size:12px;color:var(--text-secondary)">${money(t.nextAt-paid)} away from ${t.next}</div><div style="background:#e8e4dc;border-radius:999px;height:6px;margin-top:4px;overflow:hidden"><div style="background:${t.color};height:6px;border-radius:999px;width:${progress}%"></div></div></div>`;
}
function recurringStatus(r){const diff=Math.ceil((new Date((r.nextDate||today())+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000);if(diff<0)return{label:"Past Due",cls:"badgeRed"};if(diff===0)return{label:"Due Today",cls:"badgeGold"};if(diff<=7)return{label:"Upcoming",cls:"badgeBlue"};return{label:"Scheduled",cls:"badgeGreen"};}
function partnerFollowUpStatus(p){if(!p.followUpDate)return null;const diff=Math.ceil((new Date(p.followUpDate+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000);if(diff<0)return{label:"Follow up now",cls:"badgeRed"};if(diff===0)return{label:"Follow up today",cls:"badgeGold"};if(diff<=7)return{label:"Follow up soon",cls:"badgeBlue"};return{label:"Scheduled",cls:"badgeGreen"};}

function refreshDropdowns(){
  const html='<option value="">Select customer</option>'+customers.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).map(c=>`<option value="${c.id}">${safe(c.name)}</option>`).join("");
  el("jobCustomer").innerHTML=html;el("recurringCustomer").innerHTML=html;el("invoiceCustomerSelect").innerHTML=html;
  if(el("bidCustomer"))el("bidCustomer").innerHTML=html;
}

window.saveCustomer=async function(){
  const data={name:el("customerName").value.trim(),email:el("customerEmail").value.trim(),phone:el("customerPhone").value.trim(),address:el("customerAddress").value.trim(),gateCode:el("customerGateCode").value.trim(),preferredContact:el("customerPreferredContact").value.trim(),serviceFrequency:el("customerServiceFrequency").value.trim(),propertyNotes:el("customerPropertyNotes").value.trim(),notes:el("customerNotes").value.trim(),referredBy:el("customerReferredBy").value.trim(),referredById:el("customerReferredBy").dataset.linkedId||""};
  if(!data.name){alert("Enter customer name");return;}
  if(editingCustomerId){await updateDoc(doc(db,"customers",editingCustomerId),data);}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"customers"),data);}
  resetCustomerForm();showToast("Customer saved");
};
window.editCustomer=function(id){
  const c=getCustomer(id);if(!c)return;editingCustomerId=id;el("customerFormTitle").innerText="Edit Customer";
  el("customerName").value=c.name||"";el("customerEmail").value=c.email||"";el("customerPhone").value=c.phone||"";
  el("customerAddress").value=c.address||"";el("customerGateCode").value=c.gateCode||"";
  el("customerPreferredContact").value=c.preferredContact||"";el("customerServiceFrequency").value=c.serviceFrequency||"";
  el("customerPropertyNotes").value=c.propertyNotes||"";el("customerNotes").value=c.notes||"";
  el("customerReferredBy").value=c.referredBy||"";
  el("customerReferredBy").dataset.linkedId=c.referredById||"";
  el("referralSuggestion").style.display="none";
  showView("customersView");el("customerFormBox").classList.remove("hidden");
};
window.resetCustomerForm=function(){
  editingCustomerId=null;el("customerFormTitle").innerText="Add Customer";
  ["customerName","customerEmail","customerPhone","customerAddress","customerGateCode","customerPreferredContact","customerServiceFrequency","customerPropertyNotes","customerNotes","customerReferredBy"].forEach(id=>el(id).value="");
  el("customerReferredBy").dataset.linkedId="";
  el("referralSuggestion").style.display="none";
  _referralMatchId=null;_referralMatchName=null;
};
window.deleteCustomer=async function(id){
  const custJobs=jobs.filter(j=>j.customerId===id);
  const msg=custJobs.length>0?`This customer has ${custJobs.length} job(s). Deleting will remove all their jobs, payments, bids, and recurring. Are you sure?`:"Delete this customer?";
  if(!confirm(msg))return;
  try{
    for(const j of custJobs){for(const p of payments.filter(p=>p.jobId===j.id))await deleteDoc(doc(db,"payments",p.id));await deleteDoc(doc(db,"jobs",j.id));}
    for(const b of bids.filter(b=>b.customerId===id))await deleteDoc(doc(db,"bids",b.id));
    for(const r of recurring.filter(r=>r.customerId===id))await deleteDoc(doc(db,"recurring",r.id));
    await deleteDoc(doc(db,"customers",id));showToast("Customer deleted");showView("customersView");
  }catch(e){alert("Delete failed: "+e.message);}
};

window.saveJob=async function(){
  const ej=editingJobId?jobs.find(x=>x.id===editingJobId):null;
  const minsVal=Number(el("jobMins")?.value||60);
  const data={customerId:el("jobCustomer").value,title:el("jobTitle").value.trim(),date:el("jobDate").value||today(),time:el("jobTime").value||"",amount:Number(el("jobAmount").value||0),notes:el("jobNotes").value.trim(),status:ej?.status||"Scheduled",mins:minsVal};
  if(!data.customerId||!data.title){alert("Select a customer and enter a job description");return;}
  // Detect service type from title and save learned mins if changed
  const matchedSvc=PRICE_LIST.find(s=>data.title.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]));
  if(matchedSvc&&minsVal!==getJobMins(matchedSvc.id))saveLearnedMins(matchedSvc.id,minsVal);
  if(editingJobId){await updateDoc(doc(db,"jobs",editingJobId),data);}
  else{data.paid=0;data.createdAt=new Date().toISOString();const jobRef=await addDoc(collection(db,"jobs"),data);const ip=Number(el("jobPaid").value||0);if(ip>0)await addDoc(collection(db,"payments"),{jobId:jobRef.id,customerId:data.customerId,amount:ip,date:data.date,notes:"Initial payment",createdAt:new Date().toISOString()});}
  resetJobForm();showToast("Job saved");
};
window.editJob=function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;editingJobId=id;el("jobFormTitle").innerText="Edit Job";
  el("jobCustomer").value=j.customerId||"";el("jobTitle").value=j.title||"";el("jobDate").value=j.date||today();
  el("jobTime").value=j.time||"";el("jobAmount").value=j.amount||0;el("jobPaid").value=jobPaidAmount(j);el("jobNotes").value=j.notes||"";
  if(el("jobMins")){el("jobMins").value=j.mins||60;updateJobDurationLabel();}
  showView("jobsView");el("jobFormBox").classList.remove("hidden");
};
window.resetJobForm=function(){
  editingJobId=null;el("jobFormTitle").innerText="Add Job";
  const sp=el("jobSmartPrompts");if(sp){sp.innerHTML="";sp.dataset.prompts="";}
  el("jobCustomer").value="";el("jobTitle").value="";el("jobDate").value=today();el("jobTime").value="";el("jobAmount").value="";el("jobPaid").value="";el("jobNotes").value="";
  if(el("jobMins")){el("jobMins").value=60;updateJobDurationLabel();}
};
window.updateJobDurationLabel=function(){
  const m=Number(el("jobMins")?.value||0);
  const lbl=el("jobDurationLabel");
  if(lbl)lbl.innerText=fmtMins(m);
};
// Pre-fill duration when job title changes
window.prefillJobMins=function(){
  const title=(el("jobTitle")?.value||"").toLowerCase();
  const svc=PRICE_LIST.find(s=>title.includes(s.name.toLowerCase().split(" ")[0])&&s.id!=="travel");
  if(svc&&el("jobMins")){el("jobMins").value=getJobMins(svc.id);updateJobDurationLabel();}
};
window.addPayment=async function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;
  const at=prompt("Payment amount received?");if(at===null)return;
  const amount=Number(at);if(!amount||amount<=0){alert("Enter a valid payment amount");return;}
  const note=prompt("Payment note? Example: Cash, check, Venmo, card")||"";
  await addDoc(collection(db,"payments"),{jobId:j.id,customerId:j.customerId,amount,date:today(),notes:note,createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"jobs",id),{paid:jobPaidAmount(j)+amount});showToast("Payment recorded");
};
window.savePaymentFromCustomer=async function(){
  const jobId=el("paymentJobSelect")?.value,amount=Number(el("paymentAmount")?.value||0);
  const date=el("paymentDate")?.value||today(),method=el("paymentMethod")?.value.trim()||"",notes=el("paymentNotes")?.value.trim()||"";
  const j=jobs.find(x=>x.id===jobId);
  if(!j){alert("Select a job");return;}if(!amount||amount<=0){alert("Enter a valid payment amount");return;}
  await addDoc(collection(db,"payments"),{jobId:j.id,customerId:j.customerId,amount,date,notes:method?`${method} ${notes}`.trim():notes,createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"jobs",j.id),{paid:jobPaidAmount(j)+amount});showToast("Payment saved");
  if(activeCustomerDetailId)setTimeout(()=>viewCustomer(activeCustomerDetailId),500);
};
window.deletePayment=async function(id){if(confirm("Delete this payment?"))await deleteDoc(doc(db,"payments",id));};
window.markUnpaid=async function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;
  if(!confirm("This will delete all payment records for this job and reset it to unpaid. Are you sure?"))return;
  try{
    for(const p of payments.filter(p=>p.jobId===id)) await deleteDoc(doc(db,"payments",p.id));
    await updateDoc(doc(db,"jobs",id),{paid:0,status:"Scheduled"});
    showToast("Job reset to unpaid");
    renderAll();
    if(activeCustomerDetailId&&!el("customerDetailView").classList.contains("hidden")) setTimeout(()=>viewCustomer(activeCustomerDetailId),500);
  }catch(e){alert("Failed to reset job: "+e.message);}
};
window.markPaid=async function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;const bal=jobBalance(j);if(bal<=0){alert("This job is already paid.");return;}
  await addDoc(collection(db,"payments"),{jobId:j.id,customerId:j.customerId,amount:bal,date:today(),notes:"Marked paid",createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"jobs",id),{paid:Number(j.amount||0),status:"Complete"});
  showToast("Job marked as paid");
  showFlowPrompt(`${safe(j.title)} is paid. Send ${safe(getCustomerName(j.customerId))} a review request?`,[{label:"Send Review Request",cls:"green",fn:`requestReview('${id}')`}]);
  renderAll();
  if(activeCustomerDetailId&&!el("customerDetailView").classList.contains("hidden"))setTimeout(()=>viewCustomer(activeCustomerDetailId),500);
};
window.markAllPaid=async function(customerId){
  const unpaid=jobs.filter(j=>j.customerId===customerId&&jobBalance(j)>0);
  if(!unpaid.length){alert("No unpaid jobs for this customer.");return;}
  if(!confirm(`Mark all ${unpaid.length} unpaid job(s) as paid?`))return;
  for(const j of unpaid){const bal=jobBalance(j);await addDoc(collection(db,"payments"),{jobId:j.id,customerId:j.customerId,amount:bal,date:today(),notes:"Marked paid",createdAt:new Date().toISOString()});await updateDoc(doc(db,"jobs",j.id),{paid:Number(j.amount||0),status:"Complete"});}
  showToast("All jobs marked paid");setTimeout(()=>viewCustomer(customerId),600);
};
window.setJobStatus=async function(id,status){
  try{
    await updateDoc(doc(db,"jobs",id),{status});
    renderAll();
    renderTodayPreview();
    if(!el("scheduleView").classList.contains("hidden"))renderSchedule("today");
    if(status==="Complete"){
      const j=jobs.find(x=>x.id===id);
      if(j) showFlowPrompt(`${safe(j.title)} is complete. Ready to invoice ${safe(getCustomerName(j.customerId))}?`,[{label:"Create Invoice",cls:"green",fn:`makeInvoice('${j.customerId}')`}]);
    }
    if(activeCustomerDetailId&&!el("customerDetailView").classList.contains("hidden"))setTimeout(()=>viewCustomer(activeCustomerDetailId),400);
  }
  catch(e){alert("Status update failed: "+e.message);}
};
window.makeJobRecurring=function(jobId){
  const j=jobs.find(x=>x.id===jobId);if(!j)return;
  showView("recurringView");resetRecurringForm();el("recurringFormBox").classList.remove("hidden");
  el("recurringCustomer").value=j.customerId||"";el("recurringTitle").value=j.title||"";
  el("recurringNextDate").value=j.date||today();el("recurringTime").value=j.time||"";el("recurringAmount").value=j.amount||0;
  showToast("Fill in frequency and save");
};
window.requestReview=function(jobId){
  const j=jobs.find(x=>x.id===jobId);if(!j)return;
  const c=getCustomer(j.customerId);
  const phone=cleanPhone(c?.phone);
  const msg=`Hi ${c?.name||"there"}, this is Craig with 5Cs Property Services! Thank you for your business on the ${j.title}. If you were happy with the work, a quick Facebook review would mean the world to us and helps other folks in the area find us. Takes less than a minute — ${REVIEW_URL} — Thank you! 🙏`;
  if(phone){
    window.location.href=`sms:${phone}?body=${encodeURIComponent(msg)}`;
  }else{
    navigator.clipboard.writeText(msg).then(()=>showToast("Review request copied")).catch(()=>alert(msg));
  }
};

window.onMyWay=function(jobId){
  const j=jobs.find(x=>x.id===jobId);if(!j)return;
  const c=getCustomer(j.customerId);
  const phone=cleanPhone(c?.phone);if(!phone)return;
  const addr=c?.address?` at ${c.address}`:"";
  const msg=`Hi ${c?.name||"there"}! This is Craig with 5Cs Property Services — I'm on my way to your property${addr}. See you soon!`;
  window.location.href=`sms:${phone}?body=${encodeURIComponent(msg)}`;
};

window.toggleCustomFreq=function(){const v=el("recurringFrequency")?.value;const b=el("customFreqBox");if(b)b.style.display=v==="custom"?"block":"none";};

window.saveRecurring=async function(){
  const freq=el("recurringFrequency").value;
  const customDays=freq==="custom"?Number(el("recurringCustomDays")?.value||10):null;
  const data={customerId:el("recurringCustomer").value,title:el("recurringTitle").value.trim(),nextDate:el("recurringNextDate").value||today(),time:el("recurringTime").value||"",amount:Number(el("recurringAmount").value||0),frequency:freq,customDays};
  if(!data.customerId||!data.title){alert("Select a customer and enter recurring job title");return;}
  if(editingRecurringId){await updateDoc(doc(db,"recurring",editingRecurringId),data);}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"recurring"),data);}
  resetRecurringForm();showToast("Recurring job saved");
};
window.editRecurring=function(id){
  const r=recurring.find(x=>x.id===id);if(!r)return;editingRecurringId=id;el("recurringFormTitle").innerText="Edit Recurring Job";
  el("recurringCustomer").value=r.customerId||"";el("recurringTitle").value=r.title||"";el("recurringNextDate").value=r.nextDate||today();
  el("recurringTime").value=r.time||"";el("recurringAmount").value=r.amount||0;el("recurringFrequency").value=r.frequency||"weekly";
  if(el("recurringCustomDays"))el("recurringCustomDays").value=r.customDays||10;
  if(el("customFreqBox"))el("customFreqBox").style.display=r.frequency==="custom"?"block":"none";
  showView("recurringView");el("recurringFormBox").classList.remove("hidden");
};
window.resetRecurringForm=function(){
  editingRecurringId=null;el("recurringFormTitle").innerText="Add Recurring Job";
  el("recurringCustomer").value="";el("recurringTitle").value="";el("recurringNextDate").value=today();
  el("recurringTime").value="";el("recurringAmount").value="";el("recurringFrequency").value="weekly";
  if(el("recurringCustomDays"))el("recurringCustomDays").value=10;
  if(el("customFreqBox"))el("customFreqBox").style.display="none";
};
window.createJobFromRecurring=async function(id){
  const r=recurring.find(x=>x.id===id);if(!r)return;
  await addDoc(collection(db,"jobs"),{customerId:r.customerId,title:r.title,date:r.nextDate,time:r.time||"",amount:Number(r.amount||0),paid:0,notes:"Created from recurring job",status:"Scheduled",createdAt:new Date().toISOString()});
  let nd=r.nextDate||today();
  if(r.frequency==="weekly")nd=addDays(nd,7);
  else if(r.frequency==="biweekly")nd=addDays(nd,14);
  else if(r.frequency==="custom"&&r.customDays)nd=addDays(nd,Number(r.customDays));
  else if(r.frequency==="monthly"){const d=new Date(nd+"T00:00:00");d.setMonth(d.getMonth()+1);nd=d.toISOString().slice(0,10);}
  await updateDoc(doc(db,"recurring",id),{nextDate:nd});showToast("Job created from recurring");
};

window.saveExpense=async function(){
  const data={date:el("expenseDate").value||today(),category:el("expenseCategory").value.trim(),amount:Number(el("expenseAmount").value||0),notes:el("expenseNotes").value.trim()};
  if(!data.category){alert("Enter expense category");return;}
  if(editingExpenseId){await updateDoc(doc(db,"expenses",editingExpenseId),data);}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"expenses"),data);}
  resetExpenseForm();showToast("Expense saved");
};
window.editExpense=function(id){
  const e=expenses.find(x=>x.id===id);if(!e)return;editingExpenseId=id;el("expenseFormTitle").innerText="Edit Expense";
  el("expenseDate").value=e.date||today();el("expenseCategory").value=e.category||"";el("expenseAmount").value=e.amount||0;el("expenseNotes").value=e.notes||"";
  showView("expensesView");el("expenseFormBox").classList.remove("hidden");
};
window.resetExpenseForm=function(){
  editingExpenseId=null;el("expenseFormTitle").innerText="Add Expense";
  el("expenseDate").value=today();el("expenseCategory").value="";el("expenseAmount").value="";el("expenseNotes").value="";
};
window.deleteItem=async function(collectionName,id){
  if(!confirm("Delete this item?"))return;
  try{
    if(collectionName==="jobs")for(const p of payments.filter(p=>p.jobId===id))await deleteDoc(doc(db,"payments",p.id));
    await deleteDoc(doc(db,collectionName,id));
    setTimeout(()=>{renderAll();if(activeCustomerDetailId&&!el("customerDetailView").classList.contains("hidden"))viewCustomer(activeCustomerDetailId);},700);
  }catch(e){alert("Delete failed: "+e.message);}
};

window.toggleAccordion=function(btnId,panelId,openFn){
  const btn=el(btnId),panel=el(panelId);if(!btn||!panel)return;
  const isOpen=panel.classList.contains("open");
  if(isOpen){panel.classList.remove("open");btn.classList.remove("open");}
  else{if(openFn)openFn();panel.classList.add("open");btn.classList.add("open");}
};

window.openPriceListPanel=function(){renderPriceList();};
function renderPriceList(){
  const cats=[...new Set(PRICE_LIST.map(s=>s.cat))];
  let html="";
  for(const cat of cats){
    html+=`<div class="formSection" style="margin-top:8px;font-size:11px">${safe(cat)}</div>`;
    for(const svc of PRICE_LIST.filter(s=>s.cat===cat)){
      const defPrice=svc.hasSizes?svc.prices["sm"]:svc.flat;
      const ph=svc.hasSizes?"size below":money(defPrice)+(svc.unit?"/"+svc.unit:"");
      html+=`<div id="plRow_${svc.id}" style="padding:6px 0;border-bottom:0.5px solid #e8e4dc;border-radius:6px">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 6px" onclick="togglePlSvc('${svc.id}')">
          <div id="plBox_${svc.id}" style="width:22px;height:22px;flex-shrink:0;border-radius:5px;border:2px solid #ccc;background:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;transition:all 0.15s"></div>
          <div style="flex:1"><div style="font-size:14px;font-weight:500;color:var(--text)">${safe(svc.name)}</div>${svc.desc?`<div style="font-size:12px;color:#9a8f80;line-height:1.35;margin-top:1px">${safe(svc.desc)}</div>`:""}<div class="small" id="plHint_${svc.id}">${ph}</div></div>
        </div>
        <input type="checkbox" id="plCheck_${svc.id}" style="display:none">
        <div id="plSize_${svc.id}" style="display:none;padding:4px 0 4px 38px">
          ${svc.hasSizes
            ?`<select id="plSel_${svc.id}" style="margin:0 0 4px" onchange="updatePlPrice('${svc.id}')">${serviceSizes(svc).map(sz=>`<option value="${sz.key}">${sz.label} — ${money(svc.prices[sz.key])}</option>`).join("")}</select>`
            :svc.unit==="hr"
              ?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><div style="font-size:13px;color:var(--text);font-weight:500">Hours:</div><input id="plHrs_${svc.id}" type="number" min="0.5" step="0.5" value="1" style="width:80px;margin:0" oninput="updatePlHourly('${svc.id}')"><div style="font-size:13px;color:var(--text)" id="plHrsTotal_${svc.id}">${money(svc.flat)}</div></div>`
              :""}
          <div class="plEditPrice">
            <span>Price: $</span>
            <input id="plPriceVal_${svc.id}" type="number" min="0" style="width:90px" value="${defPrice}" oninput="updatePriceListTotal()">
            <span>✏️ adjustable</span>
          </div>
        </div>
      </div>`;
    }
  }
  el("priceListContent").innerHTML=html;
  plFirstVisit=false;const fcb=el("plFirstCheck");if(fcb)fcb.checked=false;
  const tb=el("plTotalBar");if(tb)tb.style.display="none";
  if(el("plRunningTotal"))el("plRunningTotal").innerText="$0.00";
}

window.togglePlSvc=function(id){
  const cb=el(`plCheck_${id}`);
  const checked=!cb.checked;
  cb.checked=checked;
  const box=el(`plBox_${id}`);
  const row=el(`plRow_${id}`);
  const sd=el(`plSize_${id}`);
  if(box){box.style.background=checked?"#087443":"#fff";box.style.borderColor=checked?"#087443":"#ccc";box.textContent=checked?"✓":"";}
  if(row){row.style.background=checked?"rgba(8,116,67,0.08)":"";}
  if(sd)sd.style.display=checked?"block":"none";
  if(checked){
    const svc=PRICE_LIST.find(s=>s.id===id);
    if(svc&&!svc.hasSizes&&svc.unit!=="hr"){
      const pv=el(`plPriceVal_${id}`);
      if(pv)pv.value=plFirstVisit?Math.round(svc.flat*1.6):svc.flat;
    }
    if(["photos","drone","photodrone"].includes(id))autoPopulateTravelFee();
  }
  updatePriceListTotal();
};

window.updatePlPrice=function(id){
  const svc=PRICE_LIST.find(s=>s.id===id);if(!svc||!svc.hasSizes)return;
  const szKey=el(`plSel_${id}`)?.value||"sm";
  const base=plFirstVisit?Math.round(svc.prices[szKey]*1.6):svc.prices[szKey];
  const pv=el(`plPriceVal_${id}`);if(pv)pv.value=base;
  updatePriceListTotal();
};

window.updatePlHourly=function(id){
  const svc=PRICE_LIST.find(s=>s.id===id);if(!svc||svc.unit!=="hr")return;
  const hrs=Math.max(0.5,Number(el(`plHrs_${id}`)?.value||1));
  const price=plFirstVisit?Math.round(svc.flat*hrs*1.6):Math.round(svc.flat*hrs);
  const tot=el(`plHrsTotal_${id}`);if(tot)tot.textContent=money(price);
  const pv=el(`plPriceVal_${id}`);if(pv)pv.value=price;
  updatePriceListTotal();
};

window.updatePriceListTotal=function(){
  let total=0;
  PRICE_LIST.forEach(svc=>{
    const cb=el(`plCheck_${svc.id}`);if(!cb?.checked)return;
    const pv=el(`plPriceVal_${svc.id}`);
    const price=pv?Number(pv.value||0):(svc.hasSizes?svc.prices["sm"]:svc.flat);
    total+=price;
  });
  // Add travel fee if checked
  const tvCb=el("plCheck_travel");
  if(tvCb?.checked){const tvPv=el("plPriceVal_travel");if(tvPv)total+=Number(tvPv.value||0);}
  if(el("plRunningTotal"))el("plRunningTotal").innerText=money(total);
  const tb=el("plTotalBar");if(tb)tb.style.display=total>0?"flex":"none";
};

window.autoPopulateTravelFee=function(){
  // When photography is checked, show the travel fee row with an address prompt
  // instead of auto-calculating from the customer address (job location != customer address)
  const tvRow=el("plRow_travel");
  if(!tvRow)return;

  // Show a prompt inside the travel fee row's size section
  const tvSize=el("plSize_travel");
  if(tvSize){
    tvSize.style.display="block";
    // If the address prompt is not yet injected, add it
    if(!el("plTravelAddrInput")){
      const addrHtml=`<div class="smartPrompt" style="margin-top:6px">
        <div class="smartPromptTitle">📍 Where is this job?</div>
        <div class="small" style="margin-bottom:6px;color:#166534">Enter the property address (not the agent's address) to calculate the drive from McAlester.</div>
        <input id="plTravelAddrInput" placeholder="e.g. 456 Oak St, Hartshorne, OK" style="margin-bottom:6px" oninput="debouncePlTravelFee()">
        <div id="plTravelFeeNote" class="smartPromptResult"></div>
      </div>`;
      // Insert before the plEditPrice div
      const pv=el("plPriceVal_travel");
      if(pv&&pv.parentElement){
        const wrapper=document.createElement("div");
        wrapper.innerHTML=addrHtml;
        pv.parentElement.insertBefore(wrapper,pv.parentElement.firstChild);
      }
    }
  }

  // Auto-check the travel row so it shows up
  const tvCb=el("plCheck_travel");
  const tvBox=el("plBox_travel");
  if(tvCb&&!tvCb.checked){
    tvCb.checked=true;
    if(tvBox){tvBox.style.background="#087443";tvBox.style.borderColor="#087443";tvBox.textContent="✓";}
    if(tvRow)tvRow.style.background="rgba(8,116,67,0.08)";
  }
  updatePriceListTotal();
};

let _plTravelTimer=null;
window.debouncePlTravelFee=function(){
  clearTimeout(_plTravelTimer);
  _plTravelTimer=setTimeout(async()=>{
    const addr=el("plTravelAddrInput")?.value||"";
    if(addr.length<5)return;
    const note=el("plTravelFeeNote");
    if(note)note.innerText="Calculating...";
    const result=await calcTravelFee(addr);
    if(note)note.innerText=result.note;
    const pv=el("plPriceVal_travel");
    if(pv)pv.value=result.fee;
    updatePriceListTotal();
  },800);
};

window.togglePlFirst=function(){
  plFirstVisit=el("plFirstCheck")?.checked||false;
  PRICE_LIST.forEach(svc=>{
    const hint=el(`plHint_${svc.id}`);if(!hint)return;
    if(svc.hasSizes){
      const sel=el(`plSel_${svc.id}`);const szKey=sel?.value||"sm";
      const base=svc.prices[szKey];
      hint.textContent=money(plFirstVisit?Math.round(base*1.6):base);
      const pv=el(`plPriceVal_${svc.id}`);if(pv&&el(`plCheck_${svc.id}`)?.checked)pv.value=plFirstVisit?Math.round(base*1.6):base;
    }else{
      const p=plFirstVisit?Math.round(svc.flat*1.6):svc.flat;
      hint.textContent=money(p)+(svc.unit?"/"+svc.unit:"");
      const pv=el(`plPriceVal_${svc.id}`);if(pv&&el(`plCheck_${svc.id}`)?.checked)pv.value=p;
    }
  });
  updatePriceListTotal();
};

window.addPriceListToBid=function(){
  const selected=PRICE_LIST.filter(svc=>el(`plCheck_${svc.id}`)?.checked);
  if(!selected.length){alert("Select at least one service");return;}
  for(const svc of selected){
    let price,desc;
    const pv=el(`plPriceVal_${svc.id}`);
    if(svc.hasSizes){const szKey=el(`plSel_${svc.id}`)?.value||"sm";const sizes=serviceSizes(svc);const sz=sizes.find(s=>s.key===szKey);desc=`${svc.name} (${sz?.label||""})`;price=pv?Number(pv.value||0):svc.prices[szKey];}
    else if(svc.unit==="hr"){const hrs=Math.max(0.5,Number(el(`plHrs_${svc.id}`)?.value||1));desc=`${svc.name} (${hrs} hr${hrs!==1?"s":""})`;price=pv?Number(pv.value||0):Math.round(svc.flat*hrs);}
    else{desc=svc.name;price=pv?Number(pv.value||0):svc.flat;}
    addBidItemRow(desc,1,Math.max(0,price));
  }
  selected.forEach(svc=>{const cb=el(`plCheck_${svc.id}`);if(cb)cb.checked=false;const sd=el(`plSize_${svc.id}`);if(sd)sd.style.display="none";const box=el(`plBox_${svc.id}`);if(box){box.style.background="#fff";box.style.borderColor="#ccc";box.textContent="";}const row=el(`plRow_${svc.id}`);if(row)row.style.background="";});
  plFirstVisit=false;const cb2=el("plFirstCheck");if(cb2)cb2.checked=false;
  if(el("plRunningTotal"))el("plRunningTotal").innerText="$0.00";
  const tb=el("plTotalBar");if(tb)tb.style.display="none";
  toggleAccordion("plAccBtn","priceListPanel",null);
  showToast(`${selected.length} service${selected.length===1?"":"s"} added to bid`);
};

window.openPackagesPanel=function(){
  renderPackages();
};

function renderPackages(){
  const lotSz=el("pkgLotSize")?.value||"sm";
  const homeSz=el("pkgHomeSize")?.value||"sm";
  el("packagesContent").innerHTML=PACKAGES.map((pkg,idx)=>{
    let total=0;
    const lines=pkg.items.map(item=>{
      const svc=PRICE_LIST.find(s=>s.id===item.id);if(!svc)return null;
      const price=svc.hasSizes?svc.prices[item.sizeType==="lot"?lotSz:homeSz]:(svc.unit==="hr"?svc.flat*2:svc.flat);
      total+=price;
      return{name:svc.name,desc:svc.desc||"",price};
    }).filter(Boolean);
    const discounted=Math.round(total*(1-pkg.discount));
    const savings=total-discounted;
    const badge=PKG_BADGES[pkg.key]||"";
    const tagline=PKG_TAGLINES[pkg.key]||"";
    // Psychology: middle two packages get special treatment
    const cardCls=pkg.key==="exterior"?"pkgCard pkgPopular":pkg.key==="fullservice"?"pkgCard pkgBest":"pkgCard";
    const badgeHtml=badge?(pkg.key==="exterior"?`<div class="pkgBadge pkgBadgeGreen">⭐ ${badge}</div>`:pkg.key==="fullservice"?`<div class="pkgBadge pkgBadgeGold">★ ${badge}</div>`:`<div class="pkgBadge" style="background:#f0e8ff;color:#5b21b6">${badge}</div>`):""
    return`<div class="${cardCls}">
      ${badgeHtml}
      <div class="pkgTitle">${safe(pkg.title)}</div>
      <div class="pkgTagline">${safe(tagline)}</div>
      <div class="pkgItems">
        ${lines.map(li=>`<div class="pkgItem"><div><div>${safe(li.name)}</div>${li.desc?`<div style="font-size:11px;color:#9a8f80;margin-top:1px;line-height:1.3">${safe(li.desc)}</div>`:""}</div></div>`).join("")}
      </div>
      <div class="pkgPricing">
        <div class="pkgRegular">Individual pricing: ${money(total)}</div>
        <div class="pkgPrice">${money(discounted)}</div>
        <div class="pkgSavings">You save ${money(savings)} — ${Math.round(pkg.discount*100)}% off</div>
      </div>
      <button class="green" style="width:100%;font-size:15px;padding:12px" onclick="addPackageToBid('${pkg.key}')">Add ${safe(pkg.title)} to Bid</button>
    </div>`;
  }).join("");
}
window.renderPackages=renderPackages;

window.addPackageToBid=function(key){
  const pkg=PACKAGES.find(p=>p.key===key);if(!pkg)return;
  const lotSz=el("pkgLotSize")?.value||"sm";
  const homeSz=el("pkgHomeSize")?.value||"sm";
  let total=0;
  const lines=pkg.items.map(item=>{
    const svc=PRICE_LIST.find(s=>s.id===item.id);if(!svc)return null;
    const price=svc.hasSizes?svc.prices[item.sizeType==="lot"?lotSz:homeSz]:(svc.unit==="hr"?svc.flat*2:svc.flat);
    total+=price;
    return{name:svc.name,price};
  }).filter(Boolean);
  const savings=Math.round(total*pkg.discount);
  lines.forEach(li=>addBidItemRow(li.name,1,li.price));
  addBidItemRow(`${pkg.title} Package Discount (${Math.round(pkg.discount*100)}% off)`,1,-savings);
  toggleAccordion("pkgAccBtn","packagesPanel",null);
  showToast(`${pkg.title} package added to bid`);
};

window.openCustomPkg=function(){
  const box=el("customPkgBox");
  if(!box.classList.contains("hidden")){box.classList.add("hidden");return;}
  const cats=[...new Set(PRICE_LIST.map(s=>s.cat))];
  let html="";
  for(const cat of cats){
    html+=`<div class="formSection" style="margin-top:8px;font-size:11px">${safe(cat)}</div>`;
    for(const svc of PRICE_LIST.filter(s=>s.cat===cat)){
      const ph=svc.hasSizes?"varies by size":money(svc.flat)+(svc.unit?"/"+svc.unit:"");
      html+=`<div id="cpRow_${svc.id}" style="padding:6px 0;border-bottom:0.5px solid #e8e4dc;border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px" onclick="cpToggleSvc('${svc.id}')">
          <div id="cpBox_${svc.id}" style="width:20px;height:20px;flex-shrink:0;border-radius:4px;border:2px solid #ccc;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;transition:all 0.15s"></div>
          <div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--text)">${safe(svc.name)}</div><div class="small">${ph}</div></div>
        </div>
        <input type="checkbox" id="cp_${svc.id}" style="display:none">
        <div id="cpSize_${svc.id}" style="display:none;padding:4px 0 0 28px">
          ${svc.hasSizes?`<select id="cpSel_${svc.id}" style="margin:0;font-size:12px" onchange="updateCustomPkgTotal()">${serviceSizes(svc).map(sz=>`<option value="${sz.key}">${sz.label} \u2014 ${money(svc.prices[sz.key])}</option>`).join("")}</select>`:svc.unit==="hr"?`<div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;color:var(--text);font-weight:500">Hours:</div><input id="cpHrs_${svc.id}" type="number" min="0.5" step="0.5" value="1" style="width:80px;margin:0;font-size:12px" oninput="updateCustomPkgTotal()"></div>`:""}
        </div>
      </div>`;
    }
  }
  el("customPkgServices").innerHTML=html;
  updateCustomPkgTotal();
  box.classList.remove("hidden");
};

window.cpToggleSvc=function(id){
  const cb=el(`cp_${id}`);
  const checked=!cb.checked;
  cb.checked=checked;
  const box=el(`cpBox_${id}`);
  const row=el(`cpRow_${id}`);
  const sd=el(`cpSize_${id}`);
  if(box){box.style.background=checked?"#087443":"#fff";box.style.borderColor=checked?"#087443":"#ccc";box.textContent=checked?"\u2713":"";}
  if(row){row.style.background=checked?"rgba(8,116,67,0.08)":"";}
  if(sd)sd.style.display=checked?"block":"none";
  updateCustomPkgTotal();
};

window.updateCustomPkgTotal=function(){
  const discount=Math.min(50,Math.max(0,Number(el("customPkgDiscount")?.value||10)));
  let total=0;const selected=[];
  PRICE_LIST.forEach(svc=>{
    const cb=el(`cp_${svc.id}`);if(!cb?.checked)return;
    const price=svc.hasSizes?(svc.prices[el(`cpSel_${svc.id}`)?.value||"sm"]):svc.unit==="hr"?Math.round(svc.flat*Math.max(0.5,Number(el(`cpHrs_${svc.id}`)?.value||1))):svc.flat;
    total+=price;selected.push({name:svc.name,price});
  });
  const discounted=Math.round(total*(1-discount/100));
  const savings=total-discounted;
  const totalsEl=el("customPkgTotals");if(!totalsEl)return;
  if(!selected.length){totalsEl.innerHTML="<p class='small'>Select services above to see your package price.</p>";return;}
  totalsEl.innerHTML=`
    ${selected.map(li=>`<div class="moneyLine"><span style="font-size:13px">${safe(li.name)}</span><span style="font-size:13px">${money(li.price)}</span></div>`).join("")}
    <div class="moneyLine" style="border-top:0.5px solid #d0cbbf;margin-top:6px;padding-top:6px">
      <span style="font-size:13px;color:#9a8f80">Regular Total</span>
      <span style="font-size:13px;color:#9a8f80;text-decoration:line-through">${money(total)}</span>
    </div>
    <div class="moneyLine">
      <span style="font-size:14px;font-weight:600;color:#087443">Package Price</span>
      <span style="font-size:18px;font-weight:700;color:#087443">${money(discounted)}</span>
    </div>
    ${savings>0?`<div class="moneyLine"><span style="font-size:12px;color:#b7791f">Customer saves</span><span style="font-size:12px;font-weight:600;color:#b7791f">${money(savings)} (${discount}% off)</span></div>`:""}`;
};

window.addCustomPackageToBid=function(){
  const discount=Math.min(50,Math.max(0,Number(el("customPkgDiscount")?.value||10)));
  let total=0;const selected=[];
  PRICE_LIST.forEach(svc=>{
    const cb=el(`cp_${svc.id}`);if(!cb?.checked)return;
    const price=svc.hasSizes?(svc.prices[el(`cpSel_${svc.id}`)?.value||"sm"]):svc.unit==="hr"?Math.round(svc.flat*Math.max(0.5,Number(el(`cpHrs_${svc.id}`)?.value||1))):svc.flat;
    const hrs2=svc.unit==="hr"?Math.max(0.5,Number(el(`cpHrs_${svc.id}`)?.value||1)):null;const name2=hrs2?`${svc.name} (${hrs2} hr${hrs2!==1?"s":""})`  :svc.name;total+=price;selected.push({name:name2,price});
  });
  if(!selected.length){alert("Select at least one service");return;}
  const savings=Math.round(total*(discount/100));
  selected.forEach(li=>addBidItemRow(li.name,1,li.price));
  if(savings>0)addBidItemRow(`Custom Package Discount (${discount}% off)`,1,-savings);
  toggleAccordion("pkgAccBtn","packagesPanel",null);
  showToast("Custom package added to bid");
};

function updateBidTotal(){
  let subtotal=0;
  document.querySelectorAll(".bidRow").forEach(row=>{subtotal+=Number(row.querySelector(".bidQty").value||0)*Number(row.querySelector(".bidPrice").value||0);});
  const discType=el("bidDiscountType")?.value||"amount";
  const discVal=Number(el("bidDiscountValue")?.value||0);
  let discAmt=0;
  if(discVal>0){discAmt=discType==="percent"?Math.round(subtotal*(discVal/100)):Math.min(discVal,subtotal);}
  const total=Math.max(0,subtotal-discAmt);
  if(el("bidSubtotal"))el("bidSubtotal").innerText=money(subtotal);
  if(el("bidTotal"))el("bidTotal").innerText=money(total);
  const discLine=el("bidDiscountLine");
  if(discLine){
    if(discAmt>0){
      discLine.style.display="flex";
      const lbl=el("bidDiscountLabel")?.value.trim()||"Discount";
      el("bidDiscountLineLabel").innerText=lbl+(discType==="percent"?` (${discVal}% off)`:"");
      el("bidDiscountAmt").innerText=`-${money(discAmt)}`;
    }else{discLine.style.display="none";}
  }
}
window.updateBidTotal=updateBidTotal;
window.addBidItemRow=function(desc="",qty=1,price=0){
  const row=document.createElement("div");row.className="bidRow";
  row.innerHTML=`<div class="box"><input class="bidDesc" placeholder="Item description" value="${safe(desc)}"><input class="bidQty" type="number" placeholder="Qty" value="${qty||""}"><input class="bidPrice" type="number" placeholder="Price" value="${price||""}"><button class="red removeBidRow">Remove</button></div>`;
  el("bidItems").appendChild(row);
  row.querySelector(".removeBidRow").onclick=()=>{row.remove();updateBidTotal();};
  row.querySelectorAll("input").forEach(i=>i.addEventListener("input",updateBidTotal));
  updateBidTotal();
};
window.saveBid=async function(){
  const customerId=el("bidCustomer").value,title=el("bidTitle").value.trim();
  if(!customerId||!title){alert("Select customer and enter title");return;}
  const items=[];document.querySelectorAll(".bidRow").forEach(row=>{const desc=row.querySelector(".bidDesc").value.trim(),qty=Number(row.querySelector(".bidQty").value||0),price=Number(row.querySelector(".bidPrice").value||0);if(desc||qty||price)items.push({desc,qty,price});});
  const total=items.reduce((s,i)=>s+(i.qty*i.price),0);
  const discType=el("bidDiscountType")?.value||"amount";
  const discVal=Number(el("bidDiscountValue")?.value||0);
  const discAmt=discVal>0?(discType==="percent"?Math.round(total*(discVal/100)):Math.min(discVal,total)):0;
  const data={customerId,title,notes:el("bidNotes").value.trim(),items,total:Math.max(0,total-discAmt),subtotal:total,discountLabel:el("bidDiscountLabel")?.value.trim()||"",discountType:discType,discountValue:discVal,discountAmount:discAmt,status:editingBidId?(bids.find(x=>x.id===editingBidId)?.status||"Pending"):"Pending",updatedAt:new Date().toISOString()};
  if(editingBidId){await updateDoc(doc(db,"bids",editingBidId),data);showToast("Bid updated");}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"bids"),data);showToast("Bid saved");}
  resetBidForm();
};
window.editBid=function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;
  editingBidId=id;showView("bidsView");el("bidFormBox").classList.remove("hidden");
  const savedSection=el("savedBidsSection");if(savedSection)savedSection.style.display="none";
  el("bidCustomer").value=b.customerId||"";el("bidTitle").value=b.title||"";el("bidNotes").value=b.notes||"";
  if(el("bidDiscountLabel"))el("bidDiscountLabel").value=b.discountLabel||"";
  if(el("bidDiscountType"))el("bidDiscountType").value=b.discountType||"amount";
  if(el("bidDiscountValue"))el("bidDiscountValue").value=b.discountValue||"";
  el("bidItems").innerHTML="";
  (b.items||[]).forEach(i=>addBidItemRow(i.desc||"",i.qty||"",i.price||""));updateBidTotal();
};
window.resetBidForm=function(){editingBidId=null;el("bidCustomer").value="";el("bidTitle").value="";el("bidNotes").value="";if(el("bidDiscountLabel"))el("bidDiscountLabel").value="";if(el("bidDiscountType"))el("bidDiscountType").value="amount";if(el("bidDiscountValue"))el("bidDiscountValue").value="";el("bidItems").innerHTML="";if(el("bidSubtotal"))el("bidSubtotal").innerText="$0.00";el("bidTotal").innerText="$0.00";if(el("bidDiscountLine"))el("bidDiscountLine").style.display="none";if(el("plAccBtn"))el("plAccBtn").classList.remove("open");if(el("priceListPanel"))el("priceListPanel").classList.remove("open");
  const bsp=el("bidSmartPrompts");if(bsp){bsp.innerHTML="";bsp.dataset.prompts="";}
  setTimeout(initBidTravelPrompt,50);
  // Hide form and show saved bids
  el("bidFormBox").classList.add("hidden");
  const savedSection=el("savedBidsSection");
  if(savedSection)savedSection.style.display="";
};
window.deleteBid=async function(id){if(!confirm("Delete this bid?"))return;try{await deleteDoc(doc(db,"bids",id));}catch(e){alert("Delete bid failed: "+e.message);}};
window.convertBidToJob=async function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;if(!confirm("Convert this bid to a job?"))return;
  await addDoc(collection(db,"jobs"),{customerId:b.customerId,title:b.title,date:today(),time:"",amount:Number(b.total||0),paid:0,notes:(b.notes||"")+"\n\nCreated from bid.",status:"Scheduled",createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"bids",id),{status:"Approved",convertedAt:new Date().toISOString()});
  showToast("Bid converted to job");
  const _b=bids.find(x=>x.id===id);
  if(_b)showFlowPrompt(`${safe(_b.title)} converted to a job. Open Jobs to schedule it?`,[{label:"View Jobs",cls:"green",fn:"showView('jobsView')"}]);
};
window.printBid=function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;const c=getCustomer(b.customerId);
  el("invoiceArea").innerHTML=`<div class="invoice"><div class="invoiceTop"><div><img class="invoiceLogo" src="logo.png" alt="${COMPANY.name}" onerror="this.style.display='none'"><h2>${COMPANY.name}</h2><p>${COMPANY.tagline}</p><p>${COMPANY.phone}</p><p>${COMPANY.email}</p></div><div><h1>Proposal</h1><p><b>${safe(b.title)}</b></p><p>Date: ${dateLabel(today())}</p><span class="badge ${b.status==="Approved"?"badgeGreen":"badgeBlue"}">${safe(b.status||"Pending")}</span></div></div>${c?`<h3>Prepared For</h3><p><b>${safe(c.name)}</b><br>${safe(c.email)}<br>${safe(c.phone)}<br>${safe(c.address)}</p>`:""}<table><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>${(b.items||[]).map(i=>`<tr><td>${safe(i.desc)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join("")}</table>${b.discountAmount>0?`<p style="text-align:right;color:#9a8f80;margin-bottom:2px">Subtotal: ${money(b.subtotal||b.total)}</p><p style="text-align:right;color:#b7791f;margin-bottom:2px">${safe(b.discountLabel||"Discount")}: -${money(b.discountAmount)}</p>`:""}<p class="invoiceTotal">Proposal Total: ${money(b.total)}</p>${b.notes?`<p>${safe(b.notes)}</p>`:""}<p class="small" style="margin-top:16px">This proposal is valid for 30 days from the date above.</p><div class="row noPrint"><button onclick="window.print()">Save as PDF</button><button class="secondary" onclick="emailBid('${b.id}')">Email Proposal</button><button class="secondary" onclick="saveInvoiceAsImage()">Save as Image</button><button class="secondary" onclick="textInvoice('${b.customerId}')">Text Proposal</button><button class="secondary" onclick="showView('bidsView')">Back to Bids</button></div></div>`;
  showView("invoiceView");
};

window.emailBid=function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;
  const c=getCustomer(b.customerId);if(!c){alert("No customer linked to this bid.");return;}
  if(!c.email){alert("This customer does not have an email saved.");return;}
  const itemLines=b.items.map(i=>`  ${i.desc} x${i.qty} — ${money(i.qty*i.price)}`).join("\n");
  const discLine=b.discountAmount>0?`\nDiscount (${safe(b.discountLabel||"Discount")}): -${money(b.discountAmount)}`:"";
  window.location.href=`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(`Proposal from 5Cs Property Services LLC — ${b.title}`)}&body=${encodeURIComponent(`Hello ${c.name},\n\nThank you for the opportunity to put together this proposal for you. Please see the details below.\n\n─────────────────────────\nPROPOSAL: ${b.title}\n─────────────────────────\n${itemLines}${discLine}\n\nProposal Total: ${money(b.total)}\n─────────────────────────\n\nThis proposal is valid for 30 days. If you have any questions or would like to move forward, please do not hesitate to reach out.\n\nCall or text: 918-424-7953\nEmail: craig.chaney.87@gmail.com\n\nThank you,\nCraig Chaney\n5Cs Property Services LLC\n918-424-7953\ncraig.chaney.87@gmail.com`)}`;
};
window.makeInvoiceFromCenter=function(){const cid=el("invoiceCustomerSelect").value;if(!cid){alert("Select a customer");return;}makeInvoice(cid);};
window.makeInvoice=function(customerId){
  const c=getCustomer(customerId);if(!c)return;
  const custJobs=jobs.filter(j=>j.customerId===customerId);
  const invNum="INV-"+new Date().getFullYear()+"-"+String(Date.now()).slice(-5);
  const dueDate=el("invoiceDueDate")?.value||today();
  const total=custJobs.reduce((s,j)=>s+Number(j.amount||0),0);
  const paid=custJobs.reduce((s,j)=>s+jobPaidAmount(j),0);
  const discType=el("invoiceDiscountType")?.value||"amount";
  const discVal=Number(el("invoiceDiscountValue")?.value||0);
  const discLabel=el("invoiceDiscountLabel")?.value.trim()||"Discount";
  const discAmt=discVal>0?(discType==="percent"?Math.round(total*(discVal/100)):Math.min(discVal,total)):0;
  const balance=Math.max(0,total-discAmt-paid);
  const invNotes=el("invoiceNotes")?.value||"Payment due upon receipt. Please call or text 918-424-7953 to arrange payment.";
  const custPmts=payments.filter(p=>p.customerId===customerId).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  el("invoiceArea").innerHTML=`<div class="invoice"><div class="invoiceTop"><div><img class="invoiceLogo" src="logo.png" alt="${COMPANY.name}" onerror="this.style.display='none'"><h2>${COMPANY.name}</h2><p>${COMPANY.tagline}</p><p>${COMPANY.phone}</p><p>${COMPANY.email}</p></div><div><h1>Invoice</h1><p><b>${invNum}</b></p><p>Issue Date: ${today()}</p><p>Due Date: ${safe(dueDate)}</p>${balance<=0?`<span class="badge badgeGreen">Paid In Full</span>`:""}${balance>0&&isPastDue(dueDate)?`<span class="badge badgeRed">Overdue</span>`:""}</div></div><h3>Bill To</h3><p><b>${safe(c.name)}</b><br>${safe(c.email)}<br>${safe(c.phone)}<br>${safe(c.address)}</p><table><tr><th>Date</th><th>Description</th><th>Amount</th><th>Paid</th><th>Balance</th></tr>${custJobs.map(j=>`<tr><td>${safe(j.date)}</td><td>${safe(j.title)}</td><td>${money(j.amount)}</td><td>${money(jobPaidAmount(j))}</td><td>${money(jobBalance(j))}</td></tr>`).join("")}</table><p class="invoiceTotal">Total: ${money(total)}</p>${discAmt>0?`<p class="invoiceTotal" style="color:#b7791f">${safe(discLabel)}: -${money(discAmt)}</p><p class="invoiceTotal">After Discount: ${money(total-discAmt)}</p>`:""}<p class="invoiceTotal">Paid: ${money(paid)}</p><p class="invoiceTotal">Balance Due: ${money(balance)}</p>${custPmts.length?`<h3>Payment History</h3><table><tr><th>Date</th><th>Amount</th><th>Note</th></tr>${custPmts.map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<tr><td>${safe(p.date)}</td><td>${money(p.amount)}</td><td>${safe(p.notes||job?.title||"")}</td></tr>`;}).join("")}</table>`:""}<p>${safe(invNotes)}</p><div style=\"text-align:center;margin:16px 0;padding:14px;background:#f8f8f8;border-radius:8px;border:1px solid #e0dbd0\"><p style=\"font-size:13px;font-weight:600;margin-bottom:8px;color:#1a1710\">Pay via Cash App</p><img src=\"data:image/png;base64,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\" style=\"width:140px;height:140px;display:block;margin:0 auto;border-radius:8px\" alt=\"Cash App QR Code\"><p style=\"font-size:12px;color:#5a5040;margin-top:6px\">Scan with your phone camera or Cash App<br><b>$CraigChaney87</b></p></div><button class="noPrint" onclick="window.print()">Save as PDF</button><button class="noPrint secondary" onclick="emailInvoice('${customerId}')">Email Invoice</button><button class="noPrint secondary" onclick="saveInvoiceAsImage()">Save as Image</button><button class=\"noPrint secondary\" onclick=\"textInvoice('${customerId}')">Text Invoice</button><button class=\"noPrint secondary\" onclick=\"activeCustomerDetailId?viewCustomer(activeCustomerDetailId):showView('invoicesView')\">Back</button></div>`;
  showView("invoiceView");
};
function loadScript(src,cb){if(document.querySelector(`script[src="${src}"]`)){cb();return;}const s=document.createElement("script");s.src=src;s.onload=cb;s.onerror=()=>alert("Could not load image library. Check your internet connection.");document.head.appendChild(s);}

window.saveInvoiceAsImage=function(){
  const invoiceEl=document.querySelector(".invoice");
  if(!invoiceEl){alert("No invoice to save.");return;}
  showToast("Preparing image...");
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",function(){
    const btns=invoiceEl.querySelectorAll(".noPrint");
    btns.forEach(b=>b.style.display="none");
    html2canvas(invoiceEl,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false}).then(canvas=>{
      btns.forEach(b=>b.style.display="");
      canvas.toBlob(blob=>{
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;
        a.download="5cs-invoice.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        showToast("Invoice saved as image");
      },"image/png");
    }).catch(err=>{
      btns.forEach(b=>b.style.display="");
      alert("Could not save image: "+err.message);
    });
  });
};

window.textInvoice=function(customerId){
  const cust=getCustomer(customerId);
  const customerPhone=cust?.phone||"";
  const invoiceEl=document.querySelector(".invoice");
  if(!invoiceEl){alert("No invoice to send.");return;}
  if(!navigator.share){
    // Fallback: save image and open sms with phone pre-filled
    saveInvoiceAsImage();
    if(customerPhone){
      setTimeout(()=>window.location.href="sms:"+cleanPhone(customerPhone),800);
    }
    showToast("Image saved. Open Messages and attach it.");
    return;
  }
  showToast("Preparing invoice image...");
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",function(){
    const btns=invoiceEl.querySelectorAll(".noPrint");
    btns.forEach(b=>b.style.display="none");
    html2canvas(invoiceEl,{scale:2,useCORS:true,backgroundColor:"#ffffff",logging:false}).then(canvas=>{
      btns.forEach(b=>b.style.display="");
      canvas.toBlob(blob=>{
        const file=new File([blob],"5cs-invoice.png",{type:"image/png"});
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          navigator.share({
            files:[file],
            title:"Invoice from 5Cs Property Services LLC",
            text:"Please find your invoice attached."
          }).then(()=>showToast("Invoice shared")).catch(err=>{
            if(err.name!=="AbortError")alert("Share failed: "+err.message);
          });
        }else{
          // canShare not supported, fall back to download + open sms
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a");
          a.href=url;a.download="5cs-invoice.png";
          document.body.appendChild(a);a.click();document.body.removeChild(a);
          setTimeout(()=>URL.revokeObjectURL(url),2000);
          if(customerPhone)setTimeout(()=>window.location.href="sms:"+cleanPhone(customerPhone),800);
          showToast("Image saved. Open Messages and attach it.");
        }
      },"image/png");
    }).catch(err=>{
      btns.forEach(b=>b.style.display="");
      alert("Could not prepare invoice: "+err.message);
    });
  });
};

window.emailInvoice=function(customerId){
  const c=getCustomer(customerId);if(!c)return;
  if(!c.email){alert("This customer does not have an email saved.");return;}
  const t=customerTotals(customerId);
  window.location.href=`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(`Invoice from 5Cs Property Services LLC \u2014 Balance Due: ${money(t.owed)}`)}&body=${encodeURIComponent(`Hello ${c.name},\n\nI hope you are doing well. Please see your invoice summary from 5Cs Property Services LLC below.\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nINVOICE SUMMARY\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nTotal Charged:  ${money(t.paid+t.owed)}\nTotal Paid:     ${money(t.paid)}\nBalance Due:    ${money(t.owed)}\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n${t.owed>0?`A balance of ${money(t.owed)} is currently due. If you have any questions or would like to arrange payment, please do not hesitate to reach out. We are happy to help.`:`Your account is fully paid up. Thank you for your prompt payment. It is truly appreciated.`}\n\nTo pay or discuss your balance, contact us anytime:\n  Call or text: 918-424-7953\n  Email: craig.chaney.87@gmail.com\n\nWe genuinely appreciate your business and the trust you place in us.\n\nThank you,\nCraig Chaney\n5Cs Property Services LLC\n918-424-7953\ncraig.chaney.87@gmail.com`)}`;
};

window.savePartner=async function(){
  const data={name:el("partnerName").value.trim(),company:el("partnerCompany").value.trim(),phone:el("partnerPhone").value.trim(),email:el("partnerEmail").value.trim(),lastContact:el("partnerLastContact").value||today(),followUpDate:el("partnerFollowUpDate").value||addDays(today(),30),notes:el("partnerNotes").value.trim()};
  if(!data.name){alert("Enter partner name");return;}
  if(editingPartnerId){await updateDoc(doc(db,"partners",editingPartnerId),data);}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"partners"),data);}
  resetPartnerForm();showToast("Partner saved");
};
window.editPartner=function(id){
  const p=partners.find(x=>x.id===id);if(!p)return;editingPartnerId=id;el("partnerFormTitle").innerText="Edit Partner";
  el("partnerName").value=p.name||"";el("partnerCompany").value=p.company||"";el("partnerPhone").value=p.phone||"";el("partnerEmail").value=p.email||"";
  el("partnerLastContact").value=p.lastContact||today();el("partnerFollowUpDate").value=p.followUpDate||addDays(today(),30);el("partnerNotes").value=p.notes||"";
  showView("partnersView");el("partnerFormBox").classList.remove("hidden");
};
window.resetPartnerForm=function(){
  editingPartnerId=null;el("partnerFormTitle").innerText="Add Partner";
  ["partnerName","partnerCompany","partnerPhone","partnerEmail","partnerNotes"].forEach(id=>el(id).value="");
  el("partnerLastContact").value=today();el("partnerFollowUpDate").value=addDays(today(),30);
};
window.deletePartner=async function(id){if(!confirm("Delete this partner?"))return;try{await deleteDoc(doc(db,"partners",id));showToast("Partner deleted");}catch(e){alert("Delete failed: "+e.message);}};
window.logPartnerContact=async function(id){
  const p=partners.find(x=>x.id===id);if(!p)return;
  await updateDoc(doc(db,"partners",id),{lastContact:today(),followUpDate:addDays(today(),30)});
  showToast("Contact logged. Next follow-up set for 30 days out.");
};

window.viewCustomer=function(id){
  activeCustomerDetailId=id;const c=getCustomer(id);if(!c)return;
  const phone=cleanPhone(c.phone),totals=customerTotals(id);
  const custJobs=jobs.filter(j=>j.customerId===id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const custRecurring=recurring.filter(r=>r.customerId===id);
  const custPayments=payments.filter(p=>p.customerId===id).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const custBids=bids.filter(b=>b.customerId===id).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  const lastJob=custJobs[0];
  el("customerDetail").innerHTML=`
    <div class="box">
      <div class="detailTitle">
        <div style="display:flex;align-items:center;gap:14px">${avatarHtml(c.name,"lg")}<div><h2 style="margin-bottom:2px">${safe(c.name)}</h2><div class="small">${safe(c.email)}</div><div class="small">${safe(c.phone)}</div><div class="small">${safe(c.address)}</div></div></div>
        <button class="secondary" style="width:auto;padding:8px 14px" onclick="showView('customersView')">Back</button>
      </div>
      <div class="grid">
        <div class="stat"><b>Paid</b><h2>${money(totals.paid)}</h2></div>
        <div class="stat"><b>Owed</b><h2 style="color:${totals.owed>0?"var(--red)":"var(--text)"}">${money(totals.owed)}</h2></div>
        <div class="stat"><b>Last Service</b><h2 style="font-size:16px">${lastJob?dateLabel(lastJob.date):"None"}</h2></div>
        <div class="stat"><b>Frequency</b><h2 style="font-size:16px">${safe(c.serviceFrequency||"None")}</h2></div>
      </div>
      ${totals.paid>0?`<div style="padding:12px 0;border-top:0.5px solid var(--border-light);margin-top:4px"><div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;font-weight:500">Customer Status</div>${tierBadgeHtml(totals.paid)}</div><div style="font-size:13px;color:var(--text-secondary)">${money(totals.paid)} lifetime</div></div>${tierProgressHtml(totals.paid)}</div>`:""}
      <div class="box" style="background:var(--s2)"><h3>Property Info</h3>
        ${c.gateCode?`<div style="margin-top:6px"><div class="small">Gate / Access</div><div>${safe(c.gateCode)}</div></div>`:""}
        ${c.preferredContact?`<div style="margin-top:6px"><div class="small">Preferred Contact</div><div>${safe(c.preferredContact)}</div></div>`:""}
        ${c.propertyNotes?`<div style="margin-top:6px"><div class="small">Property Notes</div><div>${safe(c.propertyNotes)}</div></div>`:""}
        ${c.notes?`<div style="margin-top:6px"><div class="small">General Notes</div><div>${safe(c.notes)}</div></div>`:""}
        ${!c.gateCode&&!c.preferredContact&&!c.propertyNotes&&!c.notes?`<p class="small">No property info saved.</p>`:""}
        ${(()=>{const refs=customers.filter(x=>x.referredById===c.id);return refs.length?`<div style="margin-top:6px"><div class="small">Referrals Made</div><div style="display:flex;align-items:center;gap:6px"><span style="font-weight:600;color:#087443">${refs.length} customer${refs.length===1?"":"s"} referred</span></div></div>`:""})()}${c.referredBy?`<div style="margin-top:6px"><div class="small">Referred By</div><div>${safe(c.referredBy)}${c.referredById&&getCustomer(c.referredById)?`<button style=\"width:auto;padding:3px 10px;font-size:12px\" onclick=\"viewCustomer('${c.referredById}')\"  >View</button>`:""}</div></div>`:""}
      </div>
      <div class="row">
        ${phone?`<a class="actionLink" href="tel:${phone}">Call</a>`:""}
        ${phone?`<a class="actionLink" href="sms:${phone}">Text</a>`:""}
        <button onclick="makeInvoice('${c.id}')">Invoice</button>
        <button onclick="emailInvoice('${c.id}')">Email Invoice</button>
        ${totals.owed>0?`<button class="green" onclick="markAllPaid('${c.id}')">Mark All Paid</button>`:""}
        <button class="secondary" onclick="editCustomer('${c.id}')">Edit</button>
        <button class="red" onclick="deleteCustomer('${c.id}')">Delete</button>
      </div>
    </div>
    <div class="box noPrint"><h3>Add Job For This Customer</h3><button onclick="quickJob('${c.id}')">+ Add Job</button></div>
    <div class="box noPrint"><h3>Add Payment</h3>
      <select id="paymentJobSelect">${custJobs.map(j=>`<option value="${j.id}">${safe(j.title)} | Balance ${money(jobBalance(j))}</option>`).join("")}</select>
      <input id="paymentAmount" type="number" placeholder="Payment amount">
      <input id="paymentDate" type="date" value="${today()}">
      <input id="paymentMethod" placeholder="Payment method: Cash, Check, Venmo, Card">
      <textarea id="paymentNotes" placeholder="Payment notes"></textarea>
      <button class="green" onclick="savePaymentFromCustomer()">Save Payment</button>
    </div>
    <div class="box"><h3>Bids</h3>${custBids.length?custBids.map(b=>`<div class="jobCard"><div class="customerHeader"><div><h3>${safe(b.title)}</h3><div class="small">${dateLabel(b.createdAt?.slice(0,10))}</div></div><span class="badge badgeBlue">${safe(b.status||"Pending")}</span></div><div class="box" style="background:var(--s2)">${(b.items||[]).map(i=>`<div class="moneyLine"><span>${safe(i.desc)} &bull; Qty ${i.qty}</span><b>${money(i.qty*i.price)}</b></div>`).join("")}</div><div class="moneyLine"><span style="font-weight:600">Bid Total</span><b style="color:var(--green)">${money(b.total)}</b></div><div class="row"><button class="secondary" onclick="editBid('${b.id}')">Edit</button><button onclick="printBid('${b.id}')">Send Proposal</button><button class="green" onclick="convertBidToJob('${b.id}')">Convert to Job</button><button class="red" onclick="deleteBid('${b.id}')">Delete</button></div></div>`).join(""):"<p class='small'>No bids saved for this customer yet.</p>"}</div>
    <div class="box"><h3>Jobs</h3>${custJobs.length?custJobs.map(jobCardHtml).join(""):"<p class='small'>No jobs yet.</p>"}</div>
    <div class="box"><h3>Payment History</h3>${custPayments.length?custPayments.map(paymentLineHtml).join(""):"<p class='small'>No payments yet.</p>"}</div>
    <div class="box"><h3>Recurring</h3>${custRecurring.length?custRecurring.map(recurringCardHtml).join(""):"<p class='small'>No recurring jobs yet.</p>"}</div>`;
  showView("customerDetailView");
};
window.quickJob=function(cid){showView("jobsView");el("jobFormBox").classList.remove("hidden");resetJobForm();el("jobCustomer").value=cid;};
window.copyReminder=function(jobId){
  const j=jobs.find(x=>x.id===jobId);if(!j)return;
  const msg=`Hey ${getCustomerName(j.customerId)}, just wanted to touch base on the remaining balance for ${j.title}. The current balance is ${money(jobBalance(j))}. Thank you.`;
  navigator.clipboard.writeText(msg).then(()=>showToast("Reminder copied")).catch(()=>alert(msg));
};
window.exportBackup=function(){
  const blob=new Blob([JSON.stringify({customers,jobs,recurring,expenses,payments,bids,partners,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="5cs-tracker-backup.json";a.click();showToast("Backup downloaded");
};

function workflowMiniCard(j){
  return `<div class="jobCard draggableJob" draggable="true" data-job-id="${j.id}"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${avatarHtml(getCustomerName(j.customerId),"sm")}<div><h3 style="margin:0">${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)}</div></div></div>${paymentBadge(j)}${workflowBadge(j)}<div class="moneyLine"><span>Balance</span><b>${money(jobBalance(j))}</b></div><div class="row"><button onclick="viewCustomer('${j.customerId}')">Customer</button><button class="blue" onclick="setJobStatus('${j.id}','Scheduled')">Scheduled</button><button class="gold" onclick="setJobStatus('${j.id}','In Progress')">In Progress</button><button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button></div></div>`;
}
function renderWorkflowBoard(){
  const sc=jobs.filter(j=>(j.status||"Scheduled")==="Scheduled");
  const ip=jobs.filter(j=>(j.status||"Scheduled")==="In Progress");
  const wp=jobs.filter(j=>(j.status||"Scheduled")==="Complete"&&jobBalance(j)>0);
  const cp=jobs.filter(j=>(j.status||"Scheduled")==="Complete"&&jobBalance(j)<=0);
  el("workflowScheduled").innerHTML=sc.length?sc.map(workflowMiniCard).join(""):"<p class='small'>No scheduled jobs.</p>";
  el("workflowInProgress").innerHTML=ip.length?ip.map(workflowMiniCard).join(""):"<p class='small'>No jobs in progress.</p>";
  el("workflowWaitingPayment").innerHTML=wp.length?wp.map(workflowMiniCard).join(""):"<p class='small'>No completed jobs waiting on payment.</p>";
  el("workflowCompletedPaid").innerHTML=cp.length?cp.map(workflowMiniCard).join(""):"<p class='small'>No completed paid jobs.</p>";
  document.querySelectorAll(".draggableJob").forEach(card=>{card.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",card.dataset.jobId));});
}
window.renderWorkflowBoard=renderWorkflowBoard;
function setupWorkflowDragAndDrop(){
  document.querySelectorAll(".workflowColumn").forEach(col=>{
    col.addEventListener("dragover",e=>{e.preventDefault();col.classList.add("dragOver");});
    col.addEventListener("dragleave",()=>col.classList.remove("dragOver"));
    col.addEventListener("drop",async e=>{e.preventDefault();col.classList.remove("dragOver");const jobId=e.dataTransfer.getData("text/plain"),status=col.dataset.workflowStatus;if(!jobId||!status)return;try{await updateDoc(doc(db,"jobs",jobId),{status});renderAll();renderWorkflowBoard();}catch(err){alert("Workflow update failed: "+err.message);}});
  });
}

function renderRevenueChart(){
  const chartEl=el("revenueChart");if(!chartEl)return;
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;months.push({key,label:d.toLocaleDateString(undefined,{month:"short"}),revenue:0,expenses:0});}
  payments.forEach(p=>{const m=months.find(m=>m.key===(p.date||"").slice(0,7));if(m)m.revenue+=Number(p.amount||0);});
  expenses.forEach(e=>{const m=months.find(m=>m.key===(e.date||"").slice(0,7));if(m)m.expenses+=Number(e.amount||0);});
  const maxVal=Math.max(...months.map(m=>Math.max(m.revenue,m.expenses)),1);
  chartEl.innerHTML=`<div class="chartWrap">${months.map(m=>`<div class="chartCol"><div class="chartBars"><div class="chartBar" style="background:var(--green);height:${Math.max(2,Math.round((m.revenue/maxVal)*100))}%;opacity:0.75" title="Revenue: ${money(m.revenue)}"></div><div class="chartBar" style="background:var(--red);height:${Math.max(2,Math.round((m.expenses/maxVal)*100))}%;opacity:0.65" title="Expenses: ${money(m.expenses)}"></div></div><div class="chartLabel">${m.label}</div></div>`).join("")}</div><div class="chartLegend"><div class="chartLegendItem"><div class="chartLegendDot" style="background:var(--green);opacity:0.75"></div>Revenue</div><div class="chartLegendItem"><div class="chartLegendDot" style="background:var(--red);opacity:0.65"></div>Expenses</div></div>`;
}

function renderSchedule(mode){
  let list=jobs.slice().sort((a,b)=>`${a.date||""} ${a.time||""}`.localeCompare(`${b.date||""} ${b.time||""}`));
  if(mode==="today"){list=list.filter(j=>j.date===today());el("scheduleTitle").innerText="Today's Jobs";}
  else if(mode==="upcoming"){const end=addDays(today(),7);list=list.filter(j=>j.date>=today()&&j.date<=end);el("scheduleTitle").innerText="Next 7 Days";}
  else{list=list.filter(j=>j.date);el("scheduleTitle").innerText="All Scheduled Jobs";}
  // Use collapsible today cards for today view, standard cards for others
  const cardFn=mode==="today"?todayCardHtml:scheduleCardHtml;
  el("scheduleList").innerHTML=list.length?list.map(cardFn).join(""):"<p class='small'>No scheduled jobs found.</p>";
}
window.renderSchedule=renderSchedule;

function paymentLineHtml(p){
  const job=jobs.find(j=>j.id===p.jobId);
  return `<div class="paymentLine"><b>${money(p.amount)}</b><div class="small">${safe(p.date)} &bull; ${safe(job?.title||"Payment")}</div>${p.notes?`<div class="small">${safe(p.notes)}</div>`:""}<button class="red" style="margin-top:6px" onclick="deletePayment('${p.id}')">Delete Payment</button></div>`;
}
function jobCardHtml(j){
  const bal=jobBalance(j),list=jobPayments(j.id),ol=overdueLabel(j.date);
  const isComplete=j.status==="Complete",isPaid=paymentStatus(j)==="Paid";
  const ws=j.status||"Scheduled";
  const cust=getCustomer(j.customerId);
  const phone=cleanPhone(cust?.phone);
  const propInfo=`<div class="jobPropInfo">${phone?`<a href="tel:${phone}">📞 ${safe(cust.phone)}</a> `:""}${cust?.address?`<div>📍 ${safe(cust.address)}</div>`:""}${cust?.gateCode?`<div>🔑 ${safe(cust.gateCode)}</div>`:""}</div>`;
  return `<div class="jobCard"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><h3>${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)} ${j.time?"at "+timeLabel(j.time):""}</div></div>${propInfo}${bal>0?`<div style="text-align:right"><div style="font-size:18px;font-weight:700;color:var(--gold);letter-spacing:-0.02em">${money(bal)}</div><div class="small">balance</div></div>`:`<div style="font-size:18px;font-weight:700;color:var(--green)">Paid</div>`}</div><div style="margin-bottom:6px">${paymentBadge(j)}${workflowBadge(j)}${ol&&bal>0?`<span class="badge badgeRed">${safe(ol)}</span>`:""}</div><div class="moneyLine"><span>Charged</span><b>${money(j.amount)}</b></div><div class="moneyLine"><span>Paid</span><b>${money(jobPaidAmount(j))}</b></div>${j.notes?`<p style="margin-top:8px;font-size:13px">${safe(j.notes)}</p>`:""}<details><summary>Payment history (${list.length})</summary>${list.length?list.map(paymentLineHtml).join(""):"<p class='small'>No payment records yet.</p>"}</details><div class="row">${ws==="Scheduled"?`<button class="gold" onclick="setJobStatus('${j.id}','In Progress')">Start Job</button><button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button>`:""}${ws==="In Progress"?`<button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button>`:""}${ws==="Complete"&&bal>0?`<button class="green" onclick="markPaid('${j.id}')">Mark Paid</button><button onclick="addPayment('${j.id}')">Add Payment</button>`:""}${isPaid?`<button class="red" onclick="markUnpaid('${j.id}')">Mark Unpaid</button>`:""}${ws!=="Complete"?`<button class="secondary" onclick="setJobStatus('${j.id}','Scheduled')">Reopen</button>`:""}${isComplete&&isPaid?`<button class="blue" onclick="requestReview('${j.id}')">Request Review</button>`:""}<button class="gold" onclick="copyReminder('${j.id}')">Copy Reminder</button><button onclick="makeJobRecurring('${j.id}')">Make Recurring</button><button class="secondary" onclick="editJob('${j.id}')">Edit</button><button class="red" onclick="deleteItem('jobs','${j.id}')">Delete</button></div>${jobPhotoHtml(j)}</div>`;
}
function recurringCardHtml(r){
  const s=recurringStatus(r);
  return `<div class="box"><div class="customerHeader"><div><h3>${safe(r.title)}</h3><div class="small">${safe(getCustomerName(r.customerId))}</div></div><span class="badge ${s.cls}">${s.label}</span></div><div class="moneyLine"><span>Next Date</span><b>${dateLabel(r.nextDate)} ${r.time?"at "+timeLabel(r.time):""}</b></div><div class="moneyLine"><span>Frequency</span><b>${r.frequency==="custom"?`Every ${r.customDays||"?"} days`:safe(r.frequency)}</b></div><div class="moneyLine"><span>Amount</span><b style="color:var(--green)">${money(r.amount)}</b></div><div class="row"><button class="green" onclick="createJobFromRecurring('${r.id}')">Create Job</button><button class="secondary" onclick="editRecurring('${r.id}')">Edit</button><button class="red" onclick="deleteItem('recurring','${r.id}')">Delete</button></div></div>`;
}
function expenseCardHtml(e){
  return `<div class="box"><div class="customerHeader"><div><h3>${safe(e.category)}</h3><div class="small">${dateLabel(e.date)}</div></div><b style="font-size:18px;color:var(--red-text)">${money(e.amount)}</b></div>${e.notes?`<p>${safe(e.notes)}</p>`:""}<div class="row"><button class="secondary" onclick="editExpense('${e.id}')">Edit</button><button class="red" onclick="deleteItem('expenses','${e.id}')">Delete</button></div></div>`;
}
function scheduleCardHtml(j){
  const c=getCustomer(j.customerId),phone=cleanPhone(c?.phone);
  return `<div class="box"><div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">${avatarHtml(getCustomerName(j.customerId),"sm")}<div><h3 style="margin:0">${safe(j.title)}</h3><div><b style="color:var(--green);font-size:13px">${dateLabel(j.date)} ${j.time?"at "+timeLabel(j.time):""}</b></div></div></div><div class="small">${safe(getCustomerName(j.customerId))}</div>${c?.address?`<div class="small">${safe(c.address)}</div>`:""}${c?.gateCode?`<div class="small">Gate: ${safe(c.gateCode)}</div>`:""}${c?.propertyNotes?`<div class="small">${safe(c.propertyNotes)}</div>`:""}<div style="margin:6px 0">${paymentBadge(j)}${workflowBadge(j)}</div><div class="row">${phone?`<a class="actionLink" href="tel:${phone}">Call</a>`:""}${phone?`<a class="actionLink" href="sms:${phone}">Text</a>`:""}<button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="editJob('${j.id}')">Edit Job</button></div></div>`;
}

// Today card - compact by default, expandable
const expandedTodayJobs=new Set();

window.toggleTodayCard=function(id){
  if(expandedTodayJobs.has(id))expandedTodayJobs.delete(id);
  else expandedTodayJobs.add(id);
  renderTodayPreview();
};

function renderTodayPreview(){
  const todayList=jobs.filter(j=>j.date===today()).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const html=todayList.length?todayList.map(todayCardHtml).join(""):"<p class='small'>No jobs scheduled today.</p>";
  if(el("todaySchedulePreview"))el("todaySchedulePreview").innerHTML=html;
  // Update schedule list view if showing today
  const schedList=el("scheduleList");
  const schedView=el("scheduleView");
  if(schedList&&schedView&&!schedView.classList.contains("hidden")&&el("scheduleTitle")?.innerText==="Today's Jobs"){
    schedList.innerHTML=html;
  }
  // Update calendar day panel for whichever date is selected
  if(schedView&&!schedView.classList.contains("hidden")&&calViewMode==="cal"&&calSelectedDate){
    renderCalDayPanel(calSelectedDate);
  }
}
window.renderTodayPreview=renderTodayPreview;

function todayCardHtml(j){
  const ws=j.status||"Scheduled";
  const bal=jobBalance(j);
  const isPaid=paymentStatus(j)==="Paid";
  const isExpanded=expandedTodayJobs.has(j.id);
  const c=getCustomer(j.customerId);
  const phone=cleanPhone(c?.phone);

  // Status dot color
  const dotColor=ws==="In Progress"?"#b7791f":ws==="Complete"?"#087443":"#64748b";

  // Primary compact action button
  let actionBtn="";
  if(ws==="Scheduled")
    actionBtn=`<button class="gold" onclick="event.stopPropagation();setJobStatus('${j.id}','In Progress')">Start</button>`;
  else if(ws==="In Progress")
    actionBtn=`<button class="green" onclick="event.stopPropagation();setJobStatus('${j.id}','Complete')">Complete</button>`;
  else if(ws==="Complete"&&bal>0)
    actionBtn=`<button class="green" onclick="event.stopPropagation();markPaid('${j.id}')">Mark Paid</button>`;
  else if(isPaid)
    actionBtn=`<span style="font-size:12px;font-weight:600;color:#087443;padding:0 4px">✓ Paid</span>`;

  // Compact row
  const compact=`<div class="todayCardCompact" onclick="toggleTodayCard('${j.id}')">
    <div class="todayStatusDot" style="background:${dotColor}"></div>
    <div class="todayCardMain">
      <div class="todayCardTitle">${safe(getCustomerName(j.customerId))}</div>
      <div class="todayCardSub">${safe(j.title)}${j.time?" · "+timeLabel(j.time):""}</div>
    </div>
    <div class="todayCardAction">
      ${actionBtn}
      <div class="todayChevron ${isExpanded?"open":""}">⌄</div>
    </div>
  </div>`;

  if(!isExpanded)return`<div class="todayCard" id="tcard_${j.id}">${compact}</div>`;

  // Expanded section
  const mapsUrl=c?.address?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`:"";
  const expanded=`<div class="todayCardExpanded">
    <div class="todayExpandInfo">
      ${c?.address?`<div>📍 <a href="${mapsUrl}" target="_blank">${safe(c.address)}</a></div>`:""}
      ${c?.gateCode?`<div>🔑 ${safe(c.gateCode)}</div>`:""}
      ${phone?`<div>📞 <a href="tel:${phone}">${safe(c.phone)}</a></div>`:""}
      ${j.notes?`<div style="margin-top:4px;color:var(--text-secondary)">${safe(j.notes)}</div>`:""}
    </div>
    <div style="margin-bottom:8px">${paymentBadge(j)}${workflowBadge(j)}</div>
    <div class="todayExpandActions">
      ${ws==="Scheduled"&&phone?`<button class="blue" onclick="onMyWay('${j.id}')">🚗 On My Way</button>`:""}
      ${ws==="Scheduled"?`<button class="gold" onclick="setJobStatus('${j.id}','In Progress')">Start Job</button><button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button>`:""}
      ${ws==="In Progress"?`<button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button><button class="secondary" onclick="setJobStatus('${j.id}','Scheduled')">Reopen</button>`:""}
      ${ws==="Complete"&&bal>0?`<button class="green" onclick="markPaid('${j.id}')">Mark Paid</button><button onclick="addPayment('${j.id}')">Add Payment</button>`:""}
      ${isPaid?`<button class="red" onclick="markUnpaid('${j.id}')">Mark Unpaid</button><button class="blue" onclick="requestReview('${j.id}')">Request Review</button>`:""}
      ${phone?`<a class="actionLink" href="tel:${phone}">Call</a><a class="actionLink" href="sms:${phone}">Text</a>`:""}
      <button class="gold" onclick="copyReminder('${j.id}')">Copy Reminder</button>
      <button onclick="makeJobRecurring('${j.id}')">Make Recurring</button>
      <button class="secondary" onclick="editJob('${j.id}')">Edit</button>
      <button class="red" onclick="deleteItem('jobs','${j.id}')">Delete</button>
    </div>
    ${jobPhotoHtml(j)}
    <div style="text-align:center;padding-top:6px">
      <button class="secondary" style="width:auto;font-size:12px;padding:6px 16px" onclick="toggleTodayCard('${j.id}')">⌃ Collapse</button>
    </div>
  </div>`;

  return`<div class="todayCard" id="tcard_${j.id}">${compact}${expanded}</div>`;
}
function partnerCardHtml(p){
  const phone=cleanPhone(p.phone),fu=partnerFollowUpStatus(p);
  return `<div class="box"><div class="customerHeader"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(p.name,"md")}<div><h3 style="margin:0">${safe(p.name)}</h3><div class="small">${safe(p.company)}</div><div class="small">${safe(p.phone)}</div></div></div>${fu?`<span class="badge ${fu.cls}">${fu.label}</span>`:""}</div><div class="moneyLine"><span>Last Contact</span><b>${dateLabel(p.lastContact)||"Never"}</b></div><div class="moneyLine"><span>Follow-Up</span><b>${dateLabel(p.followUpDate)||"Not set"}</b></div>${p.notes?`<p style="font-size:13px;margin-top:8px">${safe(p.notes)}</p>`:""}<div class="row">${phone?`<a class="actionLink" href="tel:${phone}">Call</a>`:""}${phone?`<a class="actionLink" href="sms:${phone}">Text</a>`:""}<button class="green" onclick="logPartnerContact('${p.id}')">Log Contact</button><button class="secondary" onclick="editPartner('${p.id}')">Edit</button><button class="red" onclick="deletePartner('${p.id}')">Delete</button></div></div>`;
}

function runGlobalSearch(){
  const q=(el("globalSearchInput")?.value||"").trim().toLowerCase();
  const out=el("globalSearchResults");
  if(!q||q.length<2){out.innerHTML="<p class='small' style='padding:0 4px'>Type at least 2 characters to search.</p>";return;}
  const sections=[];
  const mCust=customers.filter(c=>`${c.name||""} ${c.email||""} ${c.phone||""} ${c.address||""} ${c.notes||""} ${c.propertyNotes||""}`.toLowerCase().includes(q));
  if(mCust.length)sections.push(`<div class="box"><h3>Customers (${mCust.length})</h3>${mCust.map(c=>{const t=customerTotals(c.id);return`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(c.name,"sm")}<div style="flex:1"><div style="font-weight:600">${safe(c.name)}</div><div class="small">${safe(c.phone)} &bull; ${safe(c.address)}</div><div class="small">Paid: ${money(t.paid)} &bull; Owed: ${money(t.owed)}</div></div><button style="width:auto;padding:8px 12px;font-size:13px" onclick="viewCustomer('${c.id}')">View</button></div></div>`;}).join("")}</div>`);
  const mJobs=jobs.filter(j=>`${j.title||""} ${j.notes||""} ${getCustomerName(j.customerId)} ${j.date||""}`.toLowerCase().includes(q));
  if(mJobs.length)sections.push(`<div class="box"><h3>Jobs (${mJobs.length})</h3>${mJobs.map(j=>`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-weight:600">${safe(j.title)}</div><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)}</div></div><div style="text-align:right">${paymentBadge(j)}<div style="font-size:13px;font-weight:600;color:var(--gold)">${money(jobBalance(j))} owed</div></div></div><div class="row" style="margin-top:8px"><button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="editJob('${j.id}')">Edit Job</button></div></div>`).join("")}</div>`);
  const mPart=partners.filter(p=>`${p.name||""} ${p.company||""} ${p.phone||""} ${p.notes||""}`.toLowerCase().includes(q));
  if(mPart.length)sections.push(`<div class="box"><h3>Partners (${mPart.length})</h3>${mPart.map(p=>`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(p.name,"sm")}<div style="flex:1"><div style="font-weight:600">${safe(p.name)}</div><div class="small">${safe(p.company)}</div></div><button style="width:auto;padding:8px 12px;font-size:13px" onclick="editPartner('${p.id}')">View</button></div></div>`).join("")}</div>`);
  const mBids=bids.filter(b=>`${b.title||""} ${b.notes||""} ${getCustomerName(b.customerId)}`.toLowerCase().includes(q));
  if(mBids.length)sections.push(`<div class="box"><h3>Bids (${mBids.length})</h3>${mBids.map(b=>`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600">${safe(b.title)}</div><div class="small">${safe(getCustomerName(b.customerId))}</div></div><div style="text-align:right"><div style="font-weight:700;color:var(--green)">${money(b.total)}</div><span class="badge badgeBlue">${safe(b.status||"Pending")}</span></div></div><button style="margin-top:8px" onclick="editBid('${b.id}')">Edit Bid</button></div>`).join("")}</div>`);
  const mExp=expenses.filter(e=>`${e.category||""} ${e.notes||""} ${e.date||""}`.toLowerCase().includes(q));
  if(mExp.length)sections.push(`<div class="box"><h3>Expenses (${mExp.length})</h3>${mExp.map(e=>`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600">${safe(e.category)}</div><div class="small">${dateLabel(e.date)}${e.notes?" &bull; "+safe(e.notes):""}</div></div><b style="color:var(--red-text)">${money(e.amount)}</b></div><button style="margin-top:8px" onclick="editExpense('${e.id}')">Edit Expense</button></div>`).join("")}</div>`);
  const mPmts=payments.filter(p=>`${getCustomerName(p.customerId)} ${p.notes||""} ${p.date||""} ${jobs.find(j=>j.id===p.jobId)?.title||""}`.toLowerCase().includes(q));
  if(mPmts.length)sections.push(`<div class="box"><h3>Payments (${mPmts.length})</h3>${mPmts.map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><div><b style="color:var(--green)">${money(p.amount)}</b><div class="small">${safe(getCustomerName(p.customerId))} &bull; ${dateLabel(p.date)}</div><div class="small">${safe(job?.title||"")}${p.notes?" &bull; "+safe(p.notes):""}</div></div><button style="width:auto;padding:8px 12px;font-size:13px" onclick="viewCustomer('${p.customerId}')">Customer</button></div></div>`;}).join("")}</div>`);
  const mRec=recurring.filter(r=>`${r.title||""} ${getCustomerName(r.customerId)}`.toLowerCase().includes(q));
  if(mRec.length)sections.push(`<div class="box"><h3>Recurring (${mRec.length})</h3>${mRec.map(r=>{const s=recurringStatus(r);return`<div class="box" style="background:var(--s2);margin:6px 0"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600">${safe(r.title)}</div><div class="small">${safe(getCustomerName(r.customerId))} &bull; ${safe(r.frequency)} &bull; Next: ${dateLabel(r.nextDate)}</div></div><span class="badge ${s.cls}">${s.label}</span></div></div>`;}).join("")}</div>`);
  out.innerHTML=sections.length?sections.join(""):`<div class="box"><p class="small">No results found for "${safe(q)}".</p></div>`;
}
window.runGlobalSearch=runGlobalSearch;

function renderAll(){
  refreshDropdowns();
  const filterFrom=el("profitFrom")?.value||"",filterTo=el("profitTo")?.value||"";
  const fPmts=payments.filter(p=>{if(filterFrom&&p.date<filterFrom)return false;if(filterTo&&p.date>filterTo)return false;return true;});
  const fExps=expenses.filter(e=>{if(filterFrom&&e.date<filterFrom)return false;if(filterTo&&e.date>filterTo)return false;return true;});
  const allPaid=payments.reduce((s,p)=>s+Number(p.amount||0),0);
  // Monthly trend calculation
  const _now=new Date();
  const _thisM=`${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,"0")}`;
  const _lmD=new Date(_now);_lmD.setMonth(_lmD.getMonth()-1);
  const _lastM=`${_lmD.getFullYear()}-${String(_lmD.getMonth()+1).padStart(2,"0")}`;
  const _thisCollected=payments.filter(p=>(p.date||"").slice(0,7)===_thisM).reduce((s,p)=>s+Number(p.amount||0),0);
  const _lastCollected=payments.filter(p=>(p.date||"").slice(0,7)===_lastM).reduce((s,p)=>s+Number(p.amount||0),0);
  const _thisJobs=jobs.filter(j=>(j.date||"").slice(0,7)===_thisM).length;
  const _lastJobs=jobs.filter(j=>(j.date||"").slice(0,7)===_lastM).length;
  const _mName=_now.toLocaleDateString(undefined,{month:"short"});
  const allExp=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalOwed=jobs.reduce((s,j)=>s+jobBalance(j),0);
  const fPaid=fPmts.reduce((s,p)=>s+Number(p.amount||0),0);
  const fExpTotal=fExps.reduce((s,e)=>s+Number(e.amount||0),0);
  const todayJobs=jobs.filter(j=>j.date===today());
  const upcoming=jobs.filter(j=>j.date>today()&&j.date<=addDays(today(),7));
  const custWithBal=customers.filter(c=>customerTotals(c.id).owed>0);

  el("dashPaid").innerText=money(allPaid);el("dashOwed").innerText=money(totalOwed);
  el("dashExpenses").innerText=money(allExp);
  const profitVal=allPaid-allExp;
  el("dashProfit").innerText=money(profitVal);
  const profitPill=document.querySelector(".statPillProfit");
  if(profitPill){profitPill.querySelector(".statPillVal").style.color=profitVal>=0?"#087443":"#b42318";}
  // Trend strip
  const trendEl=el("trendStrip");
  if(trendEl){
    const cPct=_lastCollected>0?Math.round((_thisCollected-_lastCollected)/_lastCollected*100):null;
    const jPct=_lastJobs>0?Math.round((_thisJobs-_lastJobs)/_lastJobs*100):null;
    const trendArrow=(n)=>n>0?`<span style="color:#087443">↑${n}%</span>`:`<span style="color:#b42318">↓${Math.abs(n)}%</span>`;
    const parts=[];
    if(_thisCollected>0||_lastCollected>0)parts.push(`${_mName}: ${money(_thisCollected)} collected${cPct!==null?" "+trendArrow(cPct)+" vs last month":""}`);
    if(_thisJobs>0||_lastJobs>0)parts.push(`${_thisJobs} job${_thisJobs!==1?"s":""} scheduled${jPct!==null?" "+trendArrow(jPct):""}`)
    trendEl.innerHTML=parts.join(" &nbsp;·&nbsp; ");
  }
  el("dashTodayJobs").innerText=todayJobs.length;el("dashUpcomingJobs").innerText=upcoming.length;
  el("dashRecurringJobs").innerText=recurring.length;el("dashInvoiceCount").innerText=custWithBal.length;
  el("profitPaid").innerText=money(fPaid);el("profitExpenses").innerText=money(fExpTotal);
  const netVal=fPaid-fExpTotal;el("profitNet").innerText=money(netVal);if(el("profitNet"))el("profitNet").style.color=netVal>=0?"#087443":"#b42318";
  el("profitOutstanding").innerText=money(totalOwed);
  const _jwAmt=jobs.filter(j=>Number(j.amount||0)>0);const _avgJob=_jwAmt.length?Math.round(_jwAmt.reduce((s,j)=>s+Number(j.amount||0),0)/_jwAmt.length):0;
  if(el("profitAvgJob"))el("profitAvgJob").innerText=money(_avgJob);
  if(el("profitJobsMonth"))el("profitJobsMonth").innerText=_thisJobs||0;

  renderRevenueChart();

  // === BUSINESS HEALTH SELF-AUDIT ===
  const healthEl=el("healthAlerts");
  if(healthEl){
    const alerts=[];
    const todayStr=today();
    // Collection rate
    const completedJobs=jobs.filter(j=>j.status==="Complete");
    const paidCompletedJobs=completedJobs.filter(j=>paymentStatus(j)==="Paid");
    const collRate=completedJobs.length>0?Math.round(paidCompletedJobs.length/completedJobs.length*100):null;
    if(collRate!==null){
      if(collRate>=90)alerts.push({icon:"✅",text:`${collRate}% collection rate`,sub:"Excellent — most completed jobs are paid.",color:"#087443"});
      else if(collRate>=70)alerts.push({icon:"⚠️",text:`${collRate}% collection rate`,sub:`${completedJobs.length-paidCompletedJobs.length} completed job${completedJobs.length-paidCompletedJobs.length===1?"":"s"} still unpaid.`,color:"#b45309",action:"View unpaid",actionFn:"openOwedJobs()"});
      else alerts.push({icon:"🔴",text:`${collRate}% collection rate — low`,sub:`${completedJobs.length-paidCompletedJobs.length} jobs completed without payment. Review billing.`,color:"#b42318",action:"View unpaid",actionFn:"openOwedJobs()"});
    }
    // Overdue 60+ days
    const overdue60=jobs.filter(j=>jobBalance(j)>0&&j.date&&daysBetween(j.date,todayStr)>60);
    if(overdue60.length>0){const amt=overdue60.reduce((s,j)=>s+jobBalance(j),0);alerts.push({icon:"🔴",text:`${overdue60.length} job${overdue60.length===1?"":"s"} overdue 60+ days`,sub:`${money(amt)} outstanding for over 2 months. Follow up now.`,color:"#b42318",action:"View aging",actionFn:"switchReportTab('aging')"});}
    // Overdue 30-60 days
    const overdue30=jobs.filter(j=>jobBalance(j)>0&&j.date&&daysBetween(j.date,todayStr)>30&&daysBetween(j.date,todayStr)<=60);
    if(overdue30.length>0){const amt=overdue30.reduce((s,j)=>s+jobBalance(j),0);alerts.push({icon:"⚠️",text:`${overdue30.length} job${overdue30.length===1?"":"s"} overdue 30–60 days`,sub:`${money(amt)} has been outstanding over a month.`,color:"#b45309",action:"View aging",actionFn:"switchReportTab('aging')"});}
    // Profit health
    if(profitVal<0)alerts.push({icon:"🔴",text:"Expenses exceed income",sub:`You're ${money(Math.abs(profitVal))} in the red. Review your expenses.`,color:"#b42318",action:"View expenses",actionFn:"showView('expensesView')"});
    else if(profitVal===0&&allPaid>0)alerts.push({icon:"⚠️",text:"Break even",sub:"Income and expenses are equal. Watch margins.",color:"#b45309"});
    else if(profitVal>0&&allPaid>0)alerts.push({icon:"✅",text:`${money(profitVal)} net profit`,sub:`${allPaid>0?Math.round(profitVal/allPaid*100):0}% profit margin.`,color:"#087443"});
    // Month trend
    const cPct=_lastCollected>0?Math.round((_thisCollected-_lastCollected)/_lastCollected*100):null;
    if(cPct!==null){
      if(cPct>=10)alerts.push({icon:"📈",text:`Revenue up ${cPct}% vs last month`,sub:`${money(_thisCollected)} this month vs ${money(_lastCollected)} last month.`,color:"#087443"});
      else if(cPct<=-15)alerts.push({icon:"📉",text:`Revenue down ${Math.abs(cPct)}% vs last month`,sub:`${money(_thisCollected)} this month vs ${money(_lastCollected)} last month. Check pipeline.`,color:"#b42318"});
    }
    // Unscheduled: no upcoming jobs
    const futureJobs=jobs.filter(j=>j.date&&j.date>todayStr);
    if(futureJobs.length===0&&jobs.length>0)alerts.push({icon:"⚠️",text:"No upcoming jobs scheduled",sub:"Nothing on the calendar. Time to follow up with clients.",color:"#b45309",action:"View schedule",actionFn:"openTodaySchedule()"});
    // Average job value
    if(_avgJob>0){
      const highValueJobs=jobs.filter(j=>Number(j.amount||0)>=_avgJob*1.5).length;
      if(highValueJobs>0)alerts.push({icon:"💰",text:`${highValueJobs} high-value job${highValueJobs===1?"":"s"} in your history`,sub:`Average job is ${money(_avgJob)}. Keep targeting similar work.`,color:"#087443"});
    }

    healthEl.innerHTML=alerts.length?alerts.map(a=>`<div class="healthItem">
      <div class="healthIcon">${a.icon}</div>
      <div class="healthBody">
        <div class="healthText" style="color:${a.color}">${a.text}</div>
        <div class="healthSub">${safe(a.sub)}</div>
        ${a.action?`<div class="healthAction" onclick="${a.actionFn}">${a.action} →</div>`:""}
      </div>
    </div>`).join(""):"<div class='healthItem'><div class='healthIcon'>✅</div><div class='healthBody'><div class='healthText' style='color:#087443'>Looking good</div><div class='healthSub'>No issues detected.</div></div></div>";
  }

  // Hero card color
  const heroCard=el("reportHeroCard");
  if(heroCard){heroCard.className="heroCard "+(netVal>=0?"heroCardPos":"heroCardNeg");}
  const heroStatus=el("heroStatus");
  if(heroStatus){
    if(netVal>0)heroStatus.innerHTML=`🟢 Profitable`;
    else if(netVal<0)heroStatus.innerHTML=`⚠️ Review expenses`;
    else heroStatus.innerHTML=`— Break even`;
  }

  // Beautified top customers leaderboard
  const topCustData=customers.map(c=>({customer:c,total:customerTotals(c.id)})).filter(x=>x.total.paid>0).sort((a,b)=>b.total.paid-a.total.paid).slice(0,8);
  el("topCustomers").innerHTML=topCustData.length?topCustData.map((x,i)=>`<div class="leaderRow">
    <div class="leaderRank ${i===0?"gold":""}">${i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
    ${avatarHtml(x.customer.name,"sm")}
    <div class="leaderName">${safe(x.customer.name)}${x.total.owed>0?` <span style="font-size:11px;color:#b42318">(owes ${money(x.total.owed)})</span>`:""}</div>
    <div class="leaderAmt">${money(x.total.paid)}</div>
    <button style="width:auto;padding:6px 10px;font-size:12px" onclick="viewCustomer('${x.customer.id}')">View</button>
  </div>`).join(""):"<p class='small'>No payments collected yet.</p>";

  // Expense breakdown as horizontal bars
  const expGrp={};fExps.forEach(e=>{const k=e.category||"Other";expGrp[k]=(expGrp[k]||0)+Number(e.amount||0);});
  const expEntries=Object.entries(expGrp).sort((a,b)=>b[1]-a[1]);
  const maxExp=expEntries.length?expEntries[0][1]:1;
  el("expenseBreakdown").innerHTML=expEntries.map(([cat,t])=>`<div class="expBarRow">
    <div class="expBarLabel">${safe(cat)}</div>
    <div class="expBarTrack"><div class="expBarFill" style="width:${Math.round(t/maxExp*100)}%"></div></div>
    <div class="expBarAmt">${money(t)}</div>
  </div>`).join("")||"<p class='small'>No expenses yet.</p>";

  // Customer tiers
  const tierCounts={Platinum:[],Gold:[],Silver:[],Bronze:[]};
  customers.forEach(c=>{const p=customerTotals(c.id).paid;if(p>0)tierCounts[customerTier(p).name].push({customer:c,paid:p});});
  const tierDefs=[{name:"Platinum",color:"#7c3aed"},{name:"Gold",color:"#b7791f"},{name:"Silver",color:"#64748b"},{name:"Bronze",color:"#9a6340"}];
  const tierEl=el("tierBreakdown");
  if(tierEl){
    const anyTier=tierDefs.some(t=>tierCounts[t.name].length>0);
    tierEl.innerHTML=anyTier?tierDefs.map(t=>{
      const list=tierCounts[t.name];if(!list.length)return"";
      const icons={Platinum:"\u2726",Gold:"\u2605",Silver:"\u25c8",Bronze:"\u25c6"};
      return`<div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:14px;font-weight:600;color:${t.color}">${icons[t.name]} ${t.name}</span><span class="small">${list.length} customer${list.length===1?"":"s"}</span></div>${list.sort((a,b)=>b.paid-a.paid).map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:0.5px solid #f0ece4"><div style="font-size:13px">${safe(x.customer.name)}</div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:13px;font-weight:600;color:${t.color}">${money(x.paid)}</span><button style="width:auto;padding:4px 10px;font-size:12px" onclick="viewCustomer('${x.customer.id}')">View</button></div></div>`).join("")}</div>`;
    }).join(""):"<p class='small'>No customers with paid status yet.</p>";
  }

  if(!el("workflowView").classList.contains("hidden"))renderWorkflowBoard();

  const unpaidJobs=jobs.filter(j=>paymentStatus(j)!=="Paid");
  const dueRecurring=recurring.filter(r=>["Past Due","Due Today","Upcoming"].includes(recurringStatus(r).label));
  const overduePartners=partners.filter(p=>{const fu=partnerFollowUpStatus(p);return fu&&(fu.cls==="badgeRed"||fu.cls==="badgeGold");});
  const notifs=[];
  if(todayJobs.length)notifs.push(`<div class="box" style="background:var(--green-surface);border-color:var(--green-border)"><h3 style="color:var(--green-text)">${todayJobs.length} job${todayJobs.length===1?"":"s"} scheduled today</h3><button class="green" onclick="openTodaySchedule()">View Today</button></div>`);
  if(unpaidJobs.length)notifs.push(`<div class="box" style="background:var(--gold-surface);border-color:var(--gold-border)"><h3 style="color:var(--gold-text)">${unpaidJobs.length} unpaid or partial job${unpaidJobs.length===1?"":"s"}</h3><button class="gold" onclick="openOwedJobs()">Collect Balances</button></div>`);
  if(dueRecurring.length)notifs.push(`<div class="box" style="background:var(--blue-surface);border-color:var(--blue-border)"><h3 style="color:var(--blue-text)">${dueRecurring.length} recurring job${dueRecurring.length===1?"":"s"} due soon</h3><button class="blue" onclick="showView('recurringView')">View Recurring</button></div>`);
  if(overduePartners.length)notifs.push(`<div class="box" style="background:var(--gold-surface);border-color:var(--gold-border)"><h3 style="color:var(--gold-text)">${overduePartners.length} partner${overduePartners.length===1?"":"s"} need${overduePartners.length===1?"s":""} follow-up</h3><button class="gold" onclick="showView('partnersView')">View Partners</button></div>`);
  el("notificationCenter").innerHTML=notifs.length?notifs.join(""):"<p class='small'>No alerts right now.</p>";

  renderTodayPreview();
  el("upcomingSchedulePreview").innerHTML=upcoming.length?upcoming.slice(0,5).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(scheduleCardHtml).join(""):"<p class='small'>No upcoming jobs in the next 7 days.</p>";
  // Refresh calendar dots if schedule view is open
  if(el("scheduleView")&&!el("scheduleView").classList.contains("hidden")&&calViewMode==="cal")renderCalendar();

// Unpaid card toggle system
const expandedUnpaidJobs=new Set();
let unpaidSortMode="balance"; // "balance" or "age"

window.toggleUnpaidCard=function(id){
  if(expandedUnpaidJobs.has(id))expandedUnpaidJobs.delete(id);
  else expandedUnpaidJobs.add(id);
  renderUnpaidList();
};

window.setUnpaidSort=function(mode){
  unpaidSortMode=mode;
  renderUnpaidList();
};

function renderUnpaidList(){
  const unpaid=jobs.filter(j=>jobBalance(j)>0);
  const sorted=unpaid.slice().sort((a,b)=>{
    if(unpaidSortMode==="age"){
      const da=daysBetween(a.date||today(),today());
      const db=daysBetween(b.date||today(),today());
      return db-da;
    }
    return jobBalance(b)-jobBalance(a);
  });

  const toggleBtns=`<div class="row noPrint" style="gap:6px;margin-bottom:10px">
    <button style="width:auto;padding:6px 14px;font-size:12px;${unpaidSortMode==="balance"?"":"opacity:0.5"}" onclick="setUnpaidSort('balance')">$ Balance</button>
    <button style="width:auto;padding:6px 14px;font-size:12px;${unpaidSortMode==="age"?"":"opacity:0.5"}" onclick="setUnpaidSort('age')">Oldest First</button>
  </div>`;

  if(!sorted.length){el("attentionList").innerHTML="<p class='small'>No unpaid jobs right now. 🎉</p>";return;}
  el("attentionList").innerHTML=toggleBtns+sorted.map(unpaidCardHtml).join("");
}
window.renderUnpaidList=renderUnpaidList;

function unpaidCardHtml(j){
  const bal=jobBalance(j);
  const days=j.date?daysBetween(j.date,today()):0;
  const isExpanded=expandedUnpaidJobs.has(j.id);
  const c=getCustomer(j.customerId);
  const phone=cleanPhone(c?.phone);
  const ol=overdueLabel(j.date);
  const daysLabel=days>0?`${days}d ago`:"";
  const balColor=days>60?"#b42318":days>30?"#b45309":"var(--gold,#b7791f)";

  const compact=`<div class="todayCardCompact" onclick="toggleUnpaidCard('${j.id}')">
    <div class="todayCardMain">
      <div class="todayCardTitle">${safe(getCustomerName(j.customerId))}</div>
      <div class="todayCardSub">${safe(j.title)}${daysLabel?" · "+daysLabel:""}</div>
    </div>
    <div class="todayCardAction">
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:700;color:${balColor};letter-spacing:-0.5px">${money(bal)}</div>
        ${ol?`<div style="font-size:11px;color:#b42318;font-weight:600">${safe(ol)}</div>`:""}
      </div>
      <button class="green" style="padding:8px 12px;font-size:13px" onclick="event.stopPropagation();markPaid('${j.id}')">Mark Paid</button>
      <div class="todayChevron ${isExpanded?"open":""}">⌄</div>
    </div>
  </div>`;

  if(!isExpanded)return`<div class="todayCard" id="ucard_${j.id}">${compact}</div>`;

  const mapsUrl=c?.address?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`:"";
  const expanded=`<div class="todayCardExpanded">
    <div class="todayExpandInfo">
      ${c?.address?`<div>📍 <a href="${mapsUrl}" target="_blank">${safe(c.address)}</a></div>`:""}
      ${phone?`<div>📞 <a href="tel:${phone}">${safe(c.phone)}</a></div>`:""}
      ${j.notes?`<div style="color:var(--text-secondary)">${safe(j.notes)}</div>`:""}
    </div>
    <div style="margin-bottom:8px"><div class="moneyLine"><span>Charged</span><b>${money(j.amount)}</b></div><div class="moneyLine"><span>Paid</span><b>${money(jobPaidAmount(j))}</b></div><div class="moneyLine"><span>Balance</span><b style="color:${balColor}">${money(bal)}</b></div></div>
    <div class="todayExpandActions">
      <button class="green" onclick="markPaid('${j.id}')">Mark Paid</button>
      <button onclick="addPayment('${j.id}')">Add Payment</button>
      <button onclick="makeInvoice('${j.customerId}')">Create Invoice</button>
      ${phone?`<a class="actionLink" href="tel:${phone}">Call</a><a class="actionLink" href="sms:${phone}">Text</a>`:""}
      <button class="secondary" onclick="editJob('${j.id}')">Edit</button>
      <button class="secondary" onclick="viewCustomer('${j.customerId}')">View Customer</button>
    </div>
    ${jobPhotoHtml(j)}
    <div style="text-align:center;padding-top:6px">
      <button class="secondary" style="width:auto;font-size:12px;padding:6px 16px" onclick="toggleUnpaidCard('${j.id}')">⌃ Collapse</button>
    </div>
  </div>`;

  return`<div class="todayCard" id="ucard_${j.id}">${compact}${expanded}</div>`;
}

  el("attentionList").innerHTML="";renderUnpaidList();

  el("recentJobs").innerHTML=jobs.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5).map(j=>`<div class="box" style="background:var(--s2)"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(getCustomerName(j.customerId),"sm")}<div style="flex:1"><h3 style="margin:0">${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)}</div></div>${paymentBadge(j)}</div><div class="row" style="margin-top:8px"><button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="editJob('${j.id}')">Edit</button></div></div>`).join("")||"<p class='small'>No jobs yet.</p>";

  const cq=el("customerSearch").value.trim().toLowerCase();
    el("customerList").innerHTML=customers.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).filter(c=>{const t=`${c.name||""} ${c.email||""} ${c.phone||""} ${c.address||""} ${c.notes||""}`.toLowerCase();return !cq||t.includes(cq);}).map(c=>{const totals=customerTotals(c.id),phone=cleanPhone(c.phone);const tier=totals.paid>0?tierBadgeHtml(totals.paid):"";return`<div class="clientRow" onclick="viewCustomer('${c.id}')">${avatarHtml(c.name,"md")}<div class="clientRowInfo"><div class="clientRowName">${safe(c.name)}</div><div class="clientRowSub">${safe(c.address||c.phone||"No address saved")}</div>${tier?`<div style="margin-top:3px">${tier}</div>`:""}</div><div class="clientRowRight">${totals.owed>0?`<div class="clientRowOwes">${money(totals.owed)}<div class="clientRowOwesLabel">owed</div></div>`:`<div class="clientRowPaid">✓ Paid</div>`}${phone?`<a href="tel:${phone}" onclick="event.stopPropagation()" class="clientCallBtn">📞</a>`:""}</div></div>`;}).join("")||"<p class='small'>No customers found.</p>";

  const jq=el("jobSearch").value.trim().toLowerCase(),sf=el("jobStatusFilter").value;
  el("jobList").innerHTML=jobs.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).filter(j=>{const ps=paymentStatus(j).toLowerCase(),ws=String(j.status||"Scheduled").toLowerCase(),t=`${j.title||""} ${j.notes||""} ${getCustomerName(j.customerId)}`.toLowerCase();let ok=sf==="all"||ps===sf||ws===sf;if(sf==="today")ok=j.date===today();if(sf==="upcoming")ok=j.date>today()&&j.date<=addDays(today(),7);return ok&&(!jq||t.includes(jq));}).map(jobCardHtml).join("")||"<p class='small'>No jobs found.</p>";

  const pq=(el("paymentsSearch")?.value||"").trim().toLowerCase();
  const filteredPmts=payments.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).filter(p=>{if(!pq)return true;const job=jobs.find(j=>j.id===p.jobId);return `${getCustomerName(p.customerId)} ${p.date||""} ${job?.title||""} ${p.notes||""}`.toLowerCase().includes(pq);});
  const pmtsTotal=filteredPmts.reduce((s,p)=>s+Number(p.amount||0),0);
  if(el("paymentsTotalLabel"))el("paymentsTotalLabel").innerText=money(pmtsTotal);
  el("paymentsList").innerHTML=filteredPmts.map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<div class="box" style="background:var(--s2)"><div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:18px;color:var(--green)">${money(p.amount)}</b><div class="small">${safe(getCustomerName(p.customerId))}</div><div class="small">${dateLabel(p.date)} &bull; ${safe(job?.title||"Payment")}</div>${p.notes?`<div class="small">${safe(p.notes)}</div>`:""}</div><button class="red" style="width:auto;padding:8px 12px;font-size:13px" onclick="deletePayment('${p.id}')">Delete</button></div></div>`;}).join("")||"<p class='small'>No payments yet.</p>";

  el("recurringCalendar").innerHTML=recurring.slice().sort((a,b)=>(a.nextDate||"").localeCompare(b.nextDate||"")).map(r=>{const s=recurringStatus(r);return`<div class="moneyLine"><span style="font-size:13px">${dateLabel(r.nextDate)} ${r.time?timeLabel(r.time):""} &bull; ${safe(r.title)} &bull; ${safe(getCustomerName(r.customerId))}</span><span class="badge ${s.cls}">${s.label}</span></div>`;}).join("")||"<p class='small'>No recurring jobs scheduled.</p>";
  el("recurringList").innerHTML=recurring.slice().sort((a,b)=>(a.nextDate||"").localeCompare(b.nextDate||"")).map(recurringCardHtml).join("")||"<p class='small'>No recurring jobs yet.</p>";

  el("bidsList").innerHTML=bids.length?bids.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(b=>`<div class="jobCard"><div class="customerHeader"><div><h3>${safe(b.title)}</h3><div class="small">${safe(getCustomerName(b.customerId))} &bull; ${dateLabel(b.createdAt?.slice(0,10))}</div></div><span class="badge ${b.status==="Approved"?"badgeGreen":"badgeBlue"}">${safe(b.status||"Pending")}</span></div><div class="box" style="background:var(--s2)">${(b.items||[]).map(i=>`<div class="moneyLine"><span>${safe(i.desc)} &bull; Qty ${i.qty}</span><b>${money(i.qty*i.price)}</b></div>`).join("")}</div><div class="moneyLine"><span style="font-weight:600">Bid Total</span><b style="font-size:18px;color:var(--green)">${money(b.total)}</b></div>${b.notes?`<p>${safe(b.notes)}</p>`:""}<div class="row"><button class="secondary" onclick="editBid('${b.id}')">Edit Bid</button><button onclick="printBid('${b.id}')">Send Proposal</button><button class="green" onclick="convertBidToJob('${b.id}')">Convert to Job</button><button class="red" onclick="deleteBid('${b.id}')">Delete</button></div></div>`).join(""):"<p class='small'>No bids saved yet.</p>";

  el("expenseList").innerHTML=expenses.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(expenseCardHtml).join("")||"<p class='small'>No expenses yet.</p>";
  el("invoiceCustomerList").innerHTML=custWithBal.length?custWithBal.map(c=>{const t=customerTotals(c.id);return`<div class="box" style="background:var(--s2)"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">${avatarHtml(c.name,"sm")}<div style="flex:1"><h3 style="margin:0">${safe(c.name)}</h3><div class="small">${safe(c.email)}</div></div><b style="font-size:20px;color:var(--gold)">${money(t.owed)}</b></div><div class="row"><button onclick="makeInvoice('${c.id}')">Create Invoice</button><button onclick="emailInvoice('${c.id}')">Email Invoice</button></div></div>`;}).join(""):"<p class='small'>No unpaid balances right now.</p>";

  el("partnerList").innerHTML=partners.length?partners.slice().sort((a,b)=>{const fa=partnerFollowUpStatus(a),fb=partnerFollowUpStatus(b);const order={badgeRed:0,badgeGold:1,badgeBlue:2,badgeGreen:3};const oa=fa?order[fa.cls]??4:4,ob=fb?order[fb.cls]??4:4;return oa-ob;}).map(partnerCardHtml).join(""):"<p class='small'>No partners saved yet. Add real estate agents and other referral contacts here.</p>";
}
window.renderAll=renderAll;
