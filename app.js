import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  onSnapshot,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ── Firebase Config ────────────────────────────────────────────────────────────
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

// ── App State ──────────────────────────────────────────────────────────────────
let customers = [];
let jobs = [];
let payments = [];
let activeView = "dashboardView";

// ── Utilities ──────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const safe = v => String(v || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

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

// ── UI Navigation Controller ──────────────────────────────────────────────────
window.showView = function(viewId) {
  activeView = viewId;
  renderAll();
  
  // Update Header Subtitle
  const titles = {
    dashboardView: "Business Dashboard",
    customersView: "Client Directory",
    jobsView: "Active Jobs",
    invoicesView: "Invoicing"
  };
  el("headerSub").innerText = titles[viewId] || "5Cs Tracker";

  // Update Active Nav State
  document.querySelectorAll('.bottomNav button').forEach(btn => btn.classList.remove('active'));
  // Trigger Lucide icons
  if (window.lucide) lucide.createIcons();
};

// ── Auth Logic ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    el("bottomNav").classList.remove("hidden");
    el("bottomNav").innerHTML = `
      <button onclick="showView('dashboardView')" class="${activeView === 'dashboardView' ? 'active' : ''}"><i data-lucide="home"></i><span>Home</span></button>
      <button onclick="showView('customersView')" class="${activeView === 'customersView' ? 'active' : ''}"><i data-lucide="users"></i><span>Clients</span></button>
      <button onclick="showView('jobsView')"><i data-lucide="briefcase"></i><span>Jobs</span></button>
      <button onclick="showView('invoicesView')"><i data-lucide="file-text"></i><span>Invoices</span></button>
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

// ── Rendering Engine ───────────────────────────────────────────────────────────
function renderAll() {
  const app = el("app");
  if (activeView === "dashboardView") app.innerHTML = renderDashboard();
  if (activeView === "customersView") app.innerHTML = renderCustomers();
  
  if (window.lucide) lucide.createIcons();
}

function renderLogin() {
  el("app").innerHTML = `
    <div class="box">
      <h2>Welcome Back</h2>
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

function renderDashboard() {
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return `
    <div class="grid">
      <div class="stat"><b>Collected</b><h2>${money(totalPaid)}</h2></div>
      <div class="stat" style="border-left-color: var(--error)"><b>Outstanding</b><h2>$0.00</h2></div>
    </div>
    <div class="box">
      <h3>Recent Notifications</h3>
      <p class="small">Everything is up to date.</p>
    </div>
  `;
}

function renderCustomers() {
  return `
    <div class="box">
      <input id="custSearch" placeholder="Search clients..." oninput="/* filter logic here */">
    </div>
    <div id="customerList">
      ${customers.map(c => `
        <div class="box" style="padding:0; overflow:hidden">
          <div style="padding:16px; display:flex; align-items:center; gap:16px">
            <div class="avatar" style="background:${getAvatarColor(c.name)}">${getInitials(c.name)}</div>
            <div style="flex:1">
              <h3 style="margin:0">${safe(c.name)}</h3>
              <div class="small">${safe(c.address || 'No address')}</div>
            </div>
            <i data-lucide="chevron-right" style="color:var(--text-muted)"></i>
          </div>
          <div class="card-footer">
             <button class="secondary">View Profile</button>
             <button class="secondary">Invoice</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
