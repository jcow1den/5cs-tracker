import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ── Firebase ───────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAY2Qm46g5CCMiAQsIO4UMM1QMYIMuZMr0",
  authDomain: "cs-tracker-23ef9.firebaseapp.com",
  projectId: "cs-tracker-23ef9",
  storageBucket: "cs-tracker-23ef9.firebasestorage.app",
  messagingSenderId: "107901431900",
  appId: "1:107901431900:web:def2e585c9ce5ea5c37699"
};

const app = initializeApp(firebaseConfig);
const db  = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);

// ── State ──────────────────────────────────────────────────────────────────────
let customers = [];
let jobs = [];
let payments = [];
let expenses = [];
let bids = [];
let activeView = "dashboardView";

// ── Utilities ──────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const safe = v => String(v || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const today = () => new Date().toISOString().slice(0, 10);

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
  const colors = ['#175cd3', '#079455', '#7a5af8', '#f79009', '#d92d20', '#ee46bc'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ── Controller ─────────────────────────────────────────────────────────────────
window.showView = function(viewId) {
  activeView = viewId;
  const titles = {
    dashboardView: "Dashboard",
    customersView: "Clients",
    jobsView: "Job Schedule",
    invoicesView: "Invoices",
    settingsView: "Settings"
  };
  el("headerSub").innerText = titles[viewId] || "5Cs Tracker";
  renderAll();
};

// ── Auth ───────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    el("bottomNav").classList.remove("hidden");
    el("bottomNav").innerHTML = `
      <button onclick="showView('dashboardView')" class="${activeView === 'dashboardView' ? 'active' : ''}"><i data-lucide="home"></i><span>Home</span></button>
      <button onclick="showView('customersView')" class="${activeView === 'customersView' ? 'active' : ''}"><i data-lucide="users"></i><span>Clients</span></button>
      <button onclick="showView('jobsView')"><i data-lucide="briefcase"></i><span>Jobs</span></button>
      <button onclick="showView('invoicesView')"><i data-lucide="file-text"></i><span>Invoices</span></button>
      <button onclick="showView('settingsView')"><i data-lucide="more-horizontal"></i><span>More</span></button>
    `;
    startListeners();
  } else {
    renderLogin();
  }
});

function startListeners() {
  onSnapshot(collection(db, "customers"), s => { customers = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
  onSnapshot(collection(db, "jobs"), s => { jobs = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
  onSnapshot(collection(db, "payments"), s => { payments = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function renderAll() {
  const container = el("app");
  if (activeView === "dashboardView") container.innerHTML = renderDashboard();
  if (activeView === "customersView") container.innerHTML = renderCustomers();
  if (activeView === "jobsView") container.innerHTML = renderJobs();
  if (activeView === "invoicesView") container.innerHTML = renderInvoices();
  if (activeView === "settingsView") container.innerHTML = renderSettings();
  
  if (window.lucide) lucide.createIcons();
}

function renderDashboard() {
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return `
    <div class="grid">
      <div class="stat"><b>Total Paid</b><h2>${money(totalPaid)}</h2></div>
      <div class="stat" style="border-left-color: var(--warning)"><b>Open Jobs</b><h2>${jobs.length}</h2></div>
    </div>
    <div class="box"><h3>Today's Focus</h3><p class="small">Check the Jobs tab for your schedule.</p></div>
  `;
}

function renderCustomers() {
  return `
    <div class="box"><input placeholder="Search clients..." oninput="/* filter */"></div>
    ${customers.map(c => `
      <div class="box" style="padding:0; overflow:hidden">
        <div style="padding:16px; display:flex; align-items:center; gap:16px">
          <div class="avatar" style="background:${getAvatarColor(c.name)}">${getInitials(c.name)}</div>
          <div><h3>${safe(c.name)}</h3><div class="small">${safe(c.address)}</div></div>
        </div>
      </div>
    `).join('')}
  `;
}

function renderJobs() {
  return `
    <div class="box"><h2>Schedule</h2><button class="secondary" style="width:100%">+ Add New Job</button></div>
    ${jobs.map(j => `
      <div class="box">
        <div style="display:flex; justify-content:space-between">
          <h3>${safe(j.title)}</h3>
          <span class="badge ${j.status === 'Complete' ? 'badgeGreen' : 'badgeGold'}">${j.status || 'Scheduled'}</span>
        </div>
        <div class="small" style="margin-top:8px">${safe(j.date)}</div>
      </div>
    `).join('')}
  `;
}

function renderInvoices() {
  return `
    <div class="box"><h2>Invoice Center</h2><p class="small">Create and manage your billing.</p></div>
    <div class="box"><h3>Pending Invoices</h3><div class="small">Select a customer below to bill.</div></div>
  `;
}

function renderSettings() {
  return `
    <div class="box">
      <h2>Settings</h2>
      <button class="secondary" style="width:100%; margin-top:15px;" onclick="location.reload()">Refresh App</button>
      <button class="red" style="width:100%; margin-top:10px;" onclick="signOut(auth)">Logout</button>
    </div>
  `;
}

function renderLogin() {
  el("app").innerHTML = `
    <div class="box">
      <h2>5Cs Tracker</h2>
      <input id="email" placeholder="Email">
      <input id="pass" type="password" placeholder="Password">
      <button onclick="login()" style="width:100%">Login</button>
    </div>
  `;
}

window.login = async () => {
  try { await signInWithEmailAndPassword(auth, el("email").value, el("pass").value); } 
  catch (e) { alert(e.message); }
};

window.logout = () => signOut(auth);
