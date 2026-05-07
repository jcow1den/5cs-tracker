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
let customers  = [];
let jobs       = [];
let recurring  = [];
let expenses   = [];
let payments   = [];
let bids       = [];

let editingCustomerId      = null;
let editingJobId           = null;
let editingRecurringId     = null;
let editingExpenseId       = null;
let editingBidId           = null;
let activeCustomerDetailId = null;

// ── DOM refs ───────────────────────────────────────────────────────────────────
const appRoot   = document.getElementById("app");
const bottomNav = document.getElementById("bottomNav");
const fabButton = document.getElementById("fabButton");
const fabMenu   = document.getElementById("fabMenu");

// ── Utilities ──────────────────────────────────────────────────────────────────
const money = n => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);
const el    = id => document.getElementById(id);

function safe(v) {
  return String(v || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function dateLabel(value) {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  if (isNaN(d)) return value;
  return d.toLocaleDateString();
}

function timeLabel(value) {
  if (!value) return "";
  const [h, m] = value.split(":");
  let hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m || "00"} ${ampm}`;
}

function addDays(dateValue, days) {
  const d = new Date((dateValue || today()) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isPastDue(dateValue) {
  if (!dateValue) return false;
  return new Date(dateValue + "T00:00:00") < new Date(today() + "T00:00:00");
}

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

// ── Sync badge ─────────────────────────────────────────────────────────────────
document.body.insertAdjacentHTML("afterbegin", `<div id="syncBadge" class="syncBadge">Online</div>`);

function updateSyncBadge() {
  const badge = el("syncBadge");
  if (!badge) return;
  if (navigator.onLine) {
    badge.textContent = "Online";
    badge.classList.remove("offline");
  } else {
    badge.textContent = "Offline, will sync";
    badge.classList.add("offline");
  }
}

window.addEventListener("online",  updateSyncBadge);
window.addEventListener("offline", updateSyncBadge);
updateSyncBadge();

// ── HTML scaffold ──────────────────────────────────────────────────────────────
appRoot.innerHTML = `
<section id="loginScreen" class="box">
  <h2>Login</h2>
  <input id="loginEmail" placeholder="Email">
  <input id="loginPassword" type="password" placeholder="Password">
  <button onclick="login()">Login</button>
  <button class="secondary" onclick="signup()">Create Account</button>
</section>

<section id="appScreen" class="hidden">
  <section id="dashboardView">
    <div class="box logoHero">
      <img src="logo.png" alt="Logo" onerror="this.style.display='none'">
    </div>

    <div class="grid">
      <div class="stat" onclick="openPayments()">
        <b>Paid</b><h2 id="dashPaid">$0</h2>
      </div>
      <div class="stat" onclick="openOwedJobs()" style="border-left-color: var(--error)">
        <b>Owed</b><h2 id="dashOwed" style="color: var(--error)">$0</h2>
      </div>
      <div class="stat" onclick="openExpenses()">
        <b>Expenses</b><h2 id="dashExpenses">$0</h2>
      </div>
      <div class="stat" onclick="openProfitBreakdown()" style="border-left-color: var(--success)">
        <b>Profit</b><h2 id="dashProfit" style="color: var(--success)">$0</h2>
      </div>
    </div>

    <div class="box">
      <h3 style="margin-bottom:12px">Alerts</h3>
      <div id="notificationCenter"></div>
    </div>

    <div class="box">
      <h3>Today's Schedule</h3>
      <div id="todaySchedulePreview"></div>
    </div>

    <div class="box">
      <h3>Recent Jobs</h3>
      <div id="recentJobs"></div>
    </div>
  </section>

  <section id="scheduleView" class="hidden"></section>
  <section id="workflowView" class="hidden">
    <div class="box">
      <h2>Workflow Board</h2>
    </div>
    <div class="box">
      <h3>Scheduled</h3>
      <div id="workflowScheduled" class="workflowColumn" data-workflow-status="Scheduled"></div>
    </div>
    <div class="box">
      <h3>In Progress</h3>
      <div id="workflowInProgress" class="workflowColumn" data-workflow-status="In Progress"></div>
    </div>
    <div class="box">
      <h3>Waiting Payment</h3>
      <div id="workflowWaitingPayment" class="workflowColumn" data-workflow-status="Complete"></div>
    </div>
    <div class="box">
      <h3>Paid</h3>
      <div id="workflowCompletedPaid" class="workflowColumn" data-workflow-status="Complete"></div>
    </div>
  </section>
  <section id="profitView" class="hidden"></section>
  <section id="customersView" class="hidden">
    <div class="box">
        <input id="customerSearch" oninput="renderAll()" placeholder="Search clients...">
        <button onclick="toggleBox('customerFormBox')" style="width:100%; margin-top:8px">Add Client</button>
    </div>
    <div id="customerFormBox" class="box hidden">
      <h2 id="customerFormTitle">Add Customer</h2>
      <input id="customerName" placeholder="Name">
      <input id="customerEmail" placeholder="Email">
      <input id="customerPhone" placeholder="Phone">
      <input id="customerAddress" placeholder="Address">
      <button onclick="saveCustomer()">Save</button>
    </div>
    <div id="customerList"></div>
  </section>
  <section id="customerDetailView" class="hidden"></section>
  <section id="jobsView" class="hidden"></section>
  <section id="paymentsView" class="hidden"></section>
  <section id="recurringView" class="hidden"></section>
  <section id="expensesView" class="hidden"></section>
  <section id="invoicesView" class="hidden"></section>
  <section id="invoiceView" class="hidden"></section>
  <section id="settingsView" class="hidden"></section>
  <section id="bidsView" class="hidden"></section>
</section>
`;

// ── Navigation ─────────────────────────────────────────────────────────────────
function updateNavUI(activeId) {
  bottomNav.innerHTML = `
    <button onclick="showView('dashboardView')" class="${activeId === 'dashboardView' ? 'active' : ''}">
      <i data-lucide="home"></i><span>Home</span>
    </button>
    <button onclick="showView('customersView')" class="${activeId === 'customersView' ? 'active' : ''}">
      <i data-lucide="users"></i><span>Clients</span>
    </button>
    <button onclick="showView('jobsView')" class="${activeId === 'jobsView' ? 'active' : ''}">
      <i data-lucide="briefcase"></i><span>Jobs</span>
    </button>
    <button onclick="showView('invoicesView')" class="${activeId === 'invoicesView' ? 'active' : ''}">
      <i data-lucide="file-text"></i><span>Invoices</span>
    </button>
    <button onclick="showView('settingsView')" class="${activeId === 'settingsView' ? 'active' : ''}">
      <i data-lucide="more-horizontal"></i><span>More</span>
    </button>
  `;
  if (window.lucide) lucide.createIcons();
}

const ALL_VIEWS = [
  "dashboardView", "workflowView", "scheduleView", "profitView",
  "customersView", "customerDetailView", "jobsView", "paymentsView",
  "bidsView", "recurringView", "expensesView", "invoicesView",
  "invoiceView", "settingsView"
];

window.showView = function (id) {
  ALL_VIEWS.forEach(v => el(v).classList.add("hidden"));
  const view = el(id);
  if (view) view.classList.remove("hidden");
  fabMenu.classList.add("hidden");
  updateNavUI(id);
  window.scrollTo(0, 0);
};

// ── Auth ───────────────────────────────────────────────────────────────────────
window.login = async function () {
  try {
    await signInWithEmailAndPassword(auth, el("loginEmail").value.trim(), el("loginPassword").value);
  } catch (e) { alert("Login error: " + e.message); }
};

window.signup = async function () {
  try {
    await createUserWithEmailAndPassword(auth, el("loginEmail").value.trim(), el("loginPassword").value);
  } catch (e) { alert("Signup error: " + e.message); }
};

window.logout   = async function () { await signOut(auth); };
window.toggleFab = function () { fabMenu.classList.toggle("hidden"); };

onAuthStateChanged(auth, user => {
  if (user) {
    el("loginScreen").classList.add("hidden");
    el("appScreen").classList.remove("hidden");
    bottomNav.classList.remove("hidden");
    fabButton.classList.remove("hidden");
    startListeners();
    showView("dashboardView");
  } else {
    el("loginScreen").classList.remove("hidden");
    el("appScreen").classList.add("hidden");
    bottomNav.classList.add("hidden");
    fabButton.classList.add("hidden");
  }
});

// ── Firestore listeners ────────────────────────────────────────────────────────
let listenersStarted = false;
function startListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  onSnapshot(collection(db, "customers"), snap => {
    customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  onSnapshot(collection(db, "jobs"), snap => {
    jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  onSnapshot(collection(db, "payments"), snap => {
    payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  // Add other listeners as needed (recurring, expenses, etc.)

  setupWorkflowDragAndDrop();
}

// ── Helper Data Functions ──────────────────────────────────────────────────────
function getCustomer(id)     { return customers.find(c => c.id === id); }
function getCustomerName(id) { return getCustomer(id)?.name || "Unknown client"; }

function jobPaidAmount(j) {
  return payments.filter(p => p.jobId === j.id).reduce((s, p) => s + Number(p.amount || 0), 0);
}
function jobBalance(j) { return Math.max(0, Number(j.amount || 0) - jobPaidAmount(j)); }

function customerTotals(customerId) {
  const list = jobs.filter(j => j.customerId === customerId);
  return {
    paid: list.reduce((s, j) => s + jobPaidAmount(j), 0),
    owed: list.reduce((s, j) => s + jobBalance(j), 0)
  };
}

// ── Main Render ────────────────────────────────────────────────────────────────
function renderAll() {
  // Dashboard Calculations
  const allTimePaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalOwed = jobs.reduce((s, j) => s + jobBalance(j), 0);
  
  if (el("dashPaid")) el("dashPaid").innerText = money(allTimePaid);
  if (el("dashOwed")) el("dashOwed").innerText = money(totalOwed);

  // Customer List Rendering
  const cq = el("customerSearch")?.value.trim().toLowerCase() || "";
  const listEl = el("customerList");
  if (listEl) {
    listEl.innerHTML = customers
      .filter(c => c.name.toLowerCase().includes(cq))
      .map(c => {
        const totals = customerTotals(c.id);
        const initials = getInitials(c.name);
        const color = getAvatarColor(c.name);
        return `
          <div class="box" style="padding: 0; overflow: hidden;">
            <div style="padding: 16px; display: flex; align-items: center; gap: 16px;">
                <div class="avatar" style="background: ${color}">${initials}</div>
                <div style="flex: 1">
                    <h3 style="margin: 0;">${safe(c.name)}</h3>
                    <div class="small">${safe(c.address || '')}</div>
                </div>
                <span class="badge ${totals.owed > 0 ? "badgeRed" : "badgeGreen"}">
                    ${totals.owed > 0 ? money(totals.owed) : "Paid"}
                </span>
            </div>
            <div class="card-footer">
                <button class="secondary" onclick="viewCustomer('${c.id}')">Profile</button>
                <button class="secondary" onclick="makeInvoice('${c.id}')">Invoice</button>
            </div>
          </div>
        `;
      }).join("");
  }
}

// ── Workflow Board Logic ───────────────────────────────────────────────────────
function setupWorkflowDragAndDrop() {
  document.querySelectorAll(".workflowColumn").forEach(column => {
    column.addEventListener("dragover", e => { e.preventDefault(); column.classList.add("dragOver"); });
    column.addEventListener("dragleave", () => column.classList.remove("dragOver"));
    column.addEventListener("drop", async e => {
      e.preventDefault();
      column.classList.remove("dragOver");
      const jobId = e.dataTransfer.getData("text/plain");
      const status = column.dataset.workflowStatus;
      if (jobId && status) {
        await updateDoc(doc(db, "jobs", jobId), { status });
      }
    });
  });
}

window.renderAll = renderAll;
