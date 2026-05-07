import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
let recurring = [];
let expenses = [];
let payments = [];
let bids = [];

let activeView = "dashboardView";

// ── Utilities ──────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);
const safe = v => String(v || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const cleanPhone = p => String(p || "").replace(/\D/g, "");

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

// ── UI Core ────────────────────────────────────────────────────────────────────
function showView(viewId) {
  activeView = viewId;
  const views = document.querySelectorAll('section');
  views.forEach(v => v.classList.add('hidden'));
  el(viewId).classList.remove('hidden');
  
  // Update Bottom Nav
  document.querySelectorAll('.bottomNav button').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`button[onclick="showView('${viewId}')"]`);
  if (activeBtn) activeBtn.classList.add('active');

  renderAll();
  if (window.lucide) lucide.createIcons();
}

window.showView = showView;

// ── Auth ───────────────────────────────────────────────────────────────────────
window.login = async () => {
  try { await signInWithEmailAndPassword(auth, el("loginEmail").value, el("loginPassword").value); } 
  catch (e) { alert(e.message); }
};

window.signup = async () => {
  try { await createUserWithEmailAndPassword(auth, el("loginEmail").value, el("loginPassword").value); } 
  catch (e) { alert(e.message); }
};

window.logout = () => signOut(auth);

onAuthStateChanged(auth, user => {
  const loginScreen = el("loginScreen");
  const appScreen = el("appScreen");
  const nav = el("bottomNav");
  
  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    nav.classList.remove("hidden");
    startListeners();
    showView("dashboardView");
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    nav.classList.add("hidden");
  }
});

// ── Listeners ──────────────────────────────────────────────────────────────────
function startListeners() {
  onSnapshot(collection(db, "customers"), s => { customers = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
  onSnapshot(collection(db, "jobs"), s => { jobs = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
  onSnapshot(collection(db, "payments"), s => { payments = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
  onSnapshot(collection(db, "expenses"), s => { expenses = s.docs.map(d => ({id: d.id, ...d.data()})); renderAll(); });
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function renderAll() {
  if (activeView === "dashboardView") renderDashboard();
  if (activeView === "customersView") renderCustomers();
  // Call other specific renders here...
}

function renderDashboard() {
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const owed = jobs.reduce((s, j) => {
    const jobPaid = payments.filter(p => p.jobId === j.id).reduce((sum, p) => sum + Number(p.amount), 0);
    return s + (Number(j.amount) - jobPaid);
  }, 0);

  el("dashboardView").innerHTML = `
    <div class="headerWrap">
      <h1>5Cs Dashboard</h1>
    </div>
    <div class="grid">
      <div class="stat"><b>Collected</b><h2>${money(paid)}</h2></div>
      <div class="stat" style="border-left-color: var(--error)"><b>Owed</b><h2 style="color:var(--error)">${money(owed)}</h2></div>
    </div>
    <div class="box">
      <h3>Active Jobs</h3>
      <div id="dashJobsList">${jobs.slice(0, 3).map(j => `<div class="small">${safe(j.title)}</div>`).join('')}</div>
    </div>
  `;
}

function renderCustomers() {
  const cq = el("customerSearch")?.value.toLowerCase() || "";
  el("customersView").innerHTML = `
    <div class="headerWrap">
      <h1>Clients</h1>
    </div>
    <div class="box">
      <input id="customerSearch" oninput="renderAll()" placeholder="Search clients..." value="${cq}">
    </div>
    <div id="customerList">
      ${customers.filter(c => c.name.toLowerCase().includes(cq)).map(c => `
        <div class="box" style="padding:0; overflow:hidden">
          <div style="padding:16px; display:flex; align-items:center; gap:12px">
            <div class="avatar" style="background:${getAvatarColor(c.name)}">${getInitials(c.name)}</div>
            <div style="flex:1">
              <h3 style="margin:0">${safe(c.name)}</h3>
              <div class="small">${safe(c.address)}</div>
            </div>
            <i data-lucide="chevron-right" style="color:var(--text-muted)"></i>
          </div>
          <div class="card-footer">
            <button class="secondary" onclick="alert('Details coming soon')">View Profile</button>
            <a href="tel:${cleanPhone(c.phone)}" class="btn-icon"><i data-lucide="phone"></i></a>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Initial Nav Setup ──────────────────────────────────────────────────────────
const bottomNav = el("bottomNav");
bottomNav.innerHTML = `
  <button onclick="showView('dashboardView')"><i data-lucide="home"></i><span>Home</span></button>
  <button onclick="showView('customersView')"><i data-lucide="users"></i><span>Clients</span></button>
  <button onclick="showView('workflowView')"><i data-lucide="trello"></i><span>Board</span></button>
  <button onclick="showView('invoicesView')"><i data-lucide="file-text"></i><span>Invoices</span></button>
  <button onclick="showView('settingsView')"><i data-lucide="settings"></i><span>Settings</span></button>
`;
