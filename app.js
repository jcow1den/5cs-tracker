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

const firebaseConfig = {
  apiKey: "AIzaSyAY2Qm46g5CCMiAQsIO4UMM1QMYIMuZMr0",
  authDomain: "cs-tracker-23ef9.firebaseapp.com",
  projectId: "cs-tracker-23ef9",
  storageBucket: "cs-tracker-23ef9.firebasestorage.app",
  messagingSenderId: "107901431900",
  appId: "1:107901431900:web:def2e585c9ce5ea5c37699"
};

const app = initializeApp(firebaseConfig);

const db = initializeFirestore(app,{
  localCache:persistentLocalCache({
    tabManager:persistentMultipleTabManager()
  })
});

const auth = getAuth(app);

let customers = [];
let jobs = [];
let recurring = [];
let expenses = [];
let payments = [];
let bids = [];

let editingCustomerId = null;
let editingJobId = null;
let editingRecurringId = null;
let editingExpenseId = null;
let activeCustomerDetailId = null;

const appRoot = document.getElementById("app");
const bottomNav = document.getElementById("bottomNav");
const fabButton = document.getElementById("fabButton");
const fabMenu = document.getElementById("fabMenu");

const money = n => Number(n || 0).toLocaleString(undefined,{style:"currency",currency:"USD"});
const today = () => new Date().toISOString().slice(0,10);

function el(id){return document.getElementById(id)}

function safe(v){
  return String(v || "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function cleanPhone(phone){
  return String(phone || "").replace(/\D/g,"");
}

function dateLabel(value){
  if(!value) return "";
  const d = new Date(value + "T00:00:00");
  if(isNaN(d)) return value;
  return d.toLocaleDateString();
}

function timeLabel(value){
  if(!value) return "";
  const parts = value.split(":");
  let hour = Number(parts[0]);
  const minute = parts[1] || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

function addDays(dateValue,days){
  const d = new Date((dateValue || today()) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function isPastDue(dateValue){
  if(!dateValue) return false;
  return new Date(dateValue + "T00:00:00") < new Date(today() + "T00:00:00");
}

document.body.insertAdjacentHTML("afterbegin",`<div id="syncBadge" class="syncBadge">Online</div>`);

function updateSyncBadge(){
  const badge = el("syncBadge");
  if(!badge) return;

  if(navigator.onLine){
    badge.textContent = "Online";
    badge.classList.remove("offline");
  }else{
    badge.textContent = "Offline, will sync";
    badge.classList.add("offline");
  }
}

window.addEventListener("online",updateSyncBadge);
window.addEventListener("offline",updateSyncBadge);
updateSyncBadge();

appRoot.innerHTML = `
<section id="loginScreen" class="box">
  <h2>Login</h2>
  <input id="loginEmail" placeholder="Email">
  <input id="loginPassword" type="password" placeholder="Password">
  <button onclick="login()">Login</button>
  <button class="secondary" onclick="signup()">Create Account</button>
  <p class="small">Email and password login must be enabled in Firebase Authentication.</p>
</section>

<section id="appScreen" class="hidden">

<section id="dashboardView">
  <div class="box logoHero">
    <img src="logo.png" alt="5Cs Property Services LLC Logo" onerror="this.style.display='none'">
  </div>

  <div class="grid">
    <div class="stat" onclick="openPayments()">
      <b>Paid</b>
      <h2 id="dashPaid">$0</h2>
      <div class="statHint">Tap to see payments</div>
    </div>

    <div class="stat" onclick="openOwedJobs()">
      <b>Owed</b>
      <h2 id="dashOwed">$0</h2>
      <div class="statHint">Tap to chase balances</div>
    </div>

    <div class="stat" onclick="openExpenses()">
      <b>Expenses</b>
      <h2 id="dashExpenses">$0</h2>
      <div class="statHint">Tap to review costs</div>
    </div>

    <div class="stat" onclick="openProfitBreakdown()">
      <b>Profit</b>
      <h2 id="dashProfit">$0</h2>
      <div class="statHint">Tap for report</div>
    </div>
  </div>

  <div class="grid">
    <div class="stat" onclick="openTodaySchedule()">
      <b>Today</b>
      <h2 id="dashTodayJobs">0</h2>
      <div class="statHint">Tap for today</div>
    </div>

    <div class="stat" onclick="openUpcomingSchedule()">
      <b>Upcoming</b>
      <h2 id="dashUpcomingJobs">0</h2>
      <div class="statHint">Next 7 days</div>
    </div>

    <div class="stat" onclick="showView('recurringView')">
      <b>Recurring</b>
      <h2 id="dashRecurringJobs">0</h2>
      <div class="statHint">Tap calendar</div>
    </div>

    <div class="stat" onclick="showView('invoicesView')">
      <b>Invoices</b>
      <h2 id="dashInvoiceCount">0</h2>
      <div class="statHint">Customers owing</div>
    </div>
  </div>

  <div class="box">
  <h2>Alerts</h2>
  <div id="notificationCenter"></div>
  </div>

  <div class="box">
    <h2>Today’s Schedule</h2>
    <div id="todaySchedulePreview"></div>
  </div>

  <div class="box">
    <h2>Tomorrow Through Next 7 Days</h2>
    <div id="upcomingSchedulePreview"></div>
  </div>

  <div class="box noPrint">
    <h2>Quick Navigation</h2>
    <div class="quickAdd">
      <button onclick="showView('bidsView')">Bids</button>
      <button onclick="openWorkflow()">Workflow</button>
      <button onclick="showView('customersView')">Customers</button>
      <button onclick="openTodaySchedule()">Today</button>
      <button onclick="openUpcomingSchedule()">Upcoming</button>
      <button onclick="openOwedJobs()">Unpaid Jobs</button>
      <button onclick="openPaidJobs()">Paid Jobs</button>
      <button onclick="openPayments()">Payments</button>
      <button onclick="openProfitBreakdown()">Reports</button>
      <button onclick="showView('customersView')">Customers</button>
    </div>
  </div>

  <div class="box noPrint">
    <h2>Quick Add</h2>
    <div class="quickAdd">
      <button onclick="showView('customersView');toggleBox('customerFormBox',true)">Add Customer</button>
      <button onclick="showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
      <button onclick="showView('expensesView');toggleBox('expenseFormBox',true)">Add Expense</button>
      <button onclick="showView('recurringView');toggleBox('recurringFormBox',true)">Add Recurring</button>
    </div>
  </div>

    <div class="box">
    <h2>Overdue / Unpaid</h2>
    <div id="attentionList"></div>
  </div>

  <div class="box">
    <h2>Recent Jobs</h2>
    <div id="recentJobs"></div>
  </div>
</section>

<section id="scheduleView" class="hidden">
  <div class="box">
    <h2>Schedule</h2>
    <div class="quickAdd noPrint">
      <button onclick="openTodaySchedule()">Today</button>
      <button onclick="openUpcomingSchedule()">Next 7 Days</button>
      <button onclick="showAllSchedule()">All Scheduled</button>
      <button onclick="showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
    </div>
  </div>

  <div class="box">
    <h2 id="scheduleTitle">Scheduled Jobs</h2>
    <div id="scheduleList"></div>
  </div>
</section>

<section id="workflowView" class="hidden">
  <div class="box">
    <h2>Workflow Board</h2>
    <p class="small">Jobs grouped by workflow stage.</p>
  </div>

  <div class="box">
    <h2>Scheduled</h2>
    <div id="workflowScheduled"></div>
  </div>

  <div class="box">
    <h2>In Progress</h2>
    <div id="workflowInProgress"></div>
  </div>

  <div class="box">
    <h2>Complete, Waiting Payment</h2>
    <div id="workflowWaitingPayment"></div>
  </div>

  <div class="box">
    <h2>Completed and Paid</h2>
    <div id="workflowCompletedPaid"></div>
  </div>
</section>

<section id="profitView" class="hidden">
  <div class="box">
    <h2>Profit Breakdown</h2>
    <div class="grid">
      <div class="stat" onclick="openPayments()"><b>Total Collected</b><h2 id="profitPaid">$0</h2><div class="statHint">Tap for payments</div></div>
      <div class="stat" onclick="openExpenses()"><b>Total Expenses</b><h2 id="profitExpenses">$0</h2><div class="statHint">Tap for expenses</div></div>
      <div class="stat" onclick="openProfitBreakdown()"><b>Estimated Profit</b><h2 id="profitNet">$0</h2><div class="statHint">Collected minus expenses</div></div>
      <div class="stat" onclick="openOwedJobs()"><b>Outstanding</b><h2 id="profitOutstanding">$0</h2><div class="statHint">Tap for owed</div></div>
    </div>
    <p class="small">Profit is based on money collected minus expenses. Outstanding balances are not counted as profit until paid.</p>
  </div>

  <div class="box">
    <h2>Expense Breakdown</h2>
    <div id="expenseBreakdown"></div>
  </div>

  <div class="box">
    <h2>Top Customers By Paid Amount</h2>
    <div id="topCustomers"></div>
  </div>
</section>

<section id="customersView" class="hidden">
  <div class="searchBar noPrint">
    <input id="customerSearch" oninput="renderAll()" placeholder="Search customers, phone, email, address, notes">
  </div>

  <div class="box noPrint">
    <button onclick="toggleBox('customerFormBox')">Add or Edit Customer</button>
  </div>

  <div id="customerFormBox" class="box hidden">
    <h2 id="customerFormTitle">Add Customer</h2>
    <input id="customerName" placeholder="Customer name">
    <input id="customerEmail" placeholder="Customer email">
    <input id="customerPhone" placeholder="Phone">
    <input id="customerAddress" placeholder="Property address">
    <input id="customerGateCode" placeholder="Gate code or access notes">
    <input id="customerPreferredContact" placeholder="Preferred contact, ex: text, call, email">
    <input id="customerServiceFrequency" placeholder="Service frequency, ex: weekly, biweekly, monthly">
    <textarea id="customerPropertyNotes" placeholder="Property notes, pets, parking, gate, special instructions"></textarea>
    <textarea id="customerNotes" placeholder="General notes"></textarea>
    <button onclick="saveCustomer()">Save Customer</button>
    <button class="secondary" onclick="resetCustomerForm()">Clear</button>
  </div>

  <div id="customerList" class="cardsGrid"></div>
</section>

<section id="customerDetailView" class="hidden">
  <div id="customerDetail"></div>
</section>

<section id="jobsView" class="hidden">
  <div class="searchBar noPrint">
    <input id="jobSearch" oninput="renderAll()" placeholder="Search jobs, customers, notes">
    <select id="jobStatusFilter" onchange="renderAll()">
      <option value="all">All Jobs</option>
      <option value="unpaid">Unpaid</option>
      <option value="partial">Partial</option>
      <option value="paid">Paid</option>
      <option value="today">Today</option>
      <option value="upcoming">Upcoming</option>
      <option value="scheduled">Scheduled</option>
      <option value="in progress">In Progress</option>
      <option value="complete">Complete</option>
    </select>
  </div>

  <div class="box noPrint">
    <button onclick="toggleBox('jobFormBox')">Add or Edit Job</button>
  </div>

  <div id="jobFormBox" class="box hidden">
    <h2 id="jobFormTitle">Add Job</h2>
    <select id="jobCustomer"></select>
    <input id="jobTitle" placeholder="Job description">
    <input id="jobDate" type="date">
    <input id="jobTime" type="time">
    <input id="jobAmount" type="number" placeholder="Amount charged">
    <input id="jobPaid" type="number" placeholder="Initial payment amount">
    <textarea id="jobNotes" placeholder="Job notes"></textarea>
    <button onclick="saveJob()">Save Job</button>
    <button class="secondary" onclick="resetJobForm()">Clear</button>
  </div>

  <div id="jobList"></div>
</section>

<section id="paymentsView" class="hidden">
  <div class="box">
    <h2>Payments</h2>
    <div id="paymentsList"></div>
  </div>
</section>

<section id="recurringView" class="hidden">
  <div class="box noPrint">
    <button onclick="toggleBox('recurringFormBox')">Add or Edit Recurring Job</button>
  </div>

  <div id="recurringFormBox" class="box hidden">
    <h2 id="recurringFormTitle">Add Recurring Job</h2>
    <select id="recurringCustomer"></select>
    <input id="recurringTitle" placeholder="Recurring job title">
    <input id="recurringNextDate" type="date">
    <input id="recurringTime" type="time">
    <input id="recurringAmount" type="number" placeholder="Amount">
    <select id="recurringFrequency">
      <option value="weekly">Weekly</option>
      <option value="biweekly">Biweekly</option>
      <option value="monthly">Monthly</option>
    </select>
    <button onclick="saveRecurring()">Save Recurring Job</button>
    <button class="secondary" onclick="resetRecurringForm()">Clear</button>
  </div>

  <div class="box">
    <h2>Recurring Calendar</h2>
    <div id="recurringCalendar"></div>
  </div>

  <div id="recurringList"></div>
</section>

<section id="bidsView" class="hidden">

  <div class="box noPrint">
    <button onclick="toggleBox('bidFormBox')">
      Create Bid
    </button>
  </div>

  <div id="bidFormBox" class="box hidden">

    <h2>Create Bid</h2>

    <select id="bidCustomer"></select>

    <input id="bidTitle" placeholder="Bid title">

    <textarea id="bidNotes"
      placeholder="General notes"></textarea>

 <div id="bidItems"></div>

<button onclick="addBidItemRow()">
  Add Line Item
</button>

<div class="box">
  <h3>Bid Total</h3>
  <div class="moneyLine">
    <span>Total</span>
    <b id="bidTotal">$0</b>
  </div>
</div>

<button class="green" onclick="saveBid()">
  Save Bid
</button>

  </div>

  <div class="box">
    <h2>Saved Bids</h2>
    <div id="bidsList"></div>
  </div>

</section>

<section id="expensesView" class="hidden">
  <div class="box noPrint">
    <button onclick="toggleBox('expenseFormBox')">Add or Edit Expense</button>
  </div>

  <div id="expenseFormBox" class="box hidden">
    <h2 id="expenseFormTitle">Add Expense</h2>
    <input id="expenseDate" type="date">
    <input id="expenseCategory" placeholder="Category">
    <input id="expenseAmount" type="number" placeholder="Amount">
    <textarea id="expenseNotes" placeholder="Notes"></textarea>
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
    <textarea id="invoiceNotes" placeholder="Invoice notes or payment instructions">Payment due upon receipt. Thank you for your business.</textarea>
    <button onclick="makeInvoiceFromCenter()">Create Invoice</button>
  </div>

  <div class="box">
    <h2>Customers With Balances</h2>
    <div id="invoiceCustomerList"></div>
  </div>
</section>

<section id="invoiceView" class="hidden">
  <div id="invoiceArea"></div>
</section>

<section id="settingsView" class="hidden">
  <div class="box">
    <h2>More</h2>
    <div class="moreGrid">
      <button onclick="showView('scheduleView');showAllSchedule()">Schedule</button>
      <button onclick="showView('bidsView')">Bids</button>
      <button onclick="showView('recurringView')">Recurring</button>
      <button onclick="showView('expensesView')">Expenses</button>
      <button onclick="showView('invoicesView')">Invoices</button>
      <button onclick="showView('paymentsView')">Payments</button>
      <button onclick="openProfitBreakdown()">Reports</button>
      <button onclick="exportBackup()">Export Backup</button>
      <button class="secondary" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="box">
    <h2>Settings</h2>
    <p class="small">Offline saving is enabled. If the device loses internet, changes should sync when it reconnects.</p>
  </div>
</section>

</section>
`;

bottomNav.innerHTML = `
<button id="navDashboard" onclick="showView('dashboardView')">Home</button>
<button id="navCustomers" onclick="showView('customersView')">Customers</button>
<button id="navJobs" onclick="showView('jobsView')">Jobs</button>
<button id="navInvoices" onclick="showView('invoicesView')">Invoices</button>
<button id="navMore" onclick="showView('settingsView')">More</button>
`;

fabMenu.innerHTML = `
<button onclick="toggleFab();showView('customersView');toggleBox('customerFormBox',true)">Add Customer</button>
<button onclick="toggleFab();showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
<button onclick="toggleFab();showView('expensesView');toggleBox('expenseFormBox',true)">Add Expense</button>
<button onclick="toggleFab();showView('recurringView');toggleBox('recurringFormBox',true)">Add Recurring</button>
<button onclick="toggleFab();showView('scheduleView');showAllSchedule()">Schedule</button>
`;

fabButton.addEventListener("click",()=>toggleFab());

setTimeout(()=>{
  if(el("jobDate")) el("jobDate").value = today();
  if(el("recurringNextDate")) el("recurringNextDate").value = today();
  if(el("expenseDate")) el("expenseDate").value = today();
  if(el("invoiceDueDate")) el("invoiceDueDate").value = today();
},0);

window.login = async function(){
  try{
    await signInWithEmailAndPassword(auth, el("loginEmail").value.trim(), el("loginPassword").value);
  }catch(error){
    alert("Login error: " + error.message);
  }
};

window.signup = async function(){
  try{
    await createUserWithEmailAndPassword(auth, el("loginEmail").value.trim(), el("loginPassword").value);
  }catch(error){
    alert("Signup error: " + error.message);
  }
};

window.logout = async function(){
  await signOut(auth);
};

window.toggleFab = function(){
  fabMenu.classList.toggle("hidden");
};

let listenersStarted = false;

onAuthStateChanged(auth, user => {
  if(user){
    el("loginScreen").classList.add("hidden");
    el("appScreen").classList.remove("hidden");
    bottomNav.classList.remove("hidden");
    fabButton.classList.remove("hidden");
    startListeners();
    showView("dashboardView");
  }else{
    el("loginScreen").classList.remove("hidden");
    el("appScreen").classList.add("hidden");
    bottomNav.classList.add("hidden");
    fabButton.classList.add("hidden");
  }
});

function startListeners(){
  if(listenersStarted) return;
  listenersStarted = true;

  onSnapshot(collection(db,"customers"), snap=>{
    customers = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });

  onSnapshot(collection(db,"jobs"), snap=>{
    jobs = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });

  onSnapshot(collection(db,"recurring"), snap=>{
    recurring = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });

  onSnapshot(collection(db,"expenses"), snap=>{
    expenses = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
  
onSnapshot(collection(db,"payments"), snap=>{
  payments = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderAll();
});
  
    onSnapshot(collection(db,"bids"), snap=>{
    bids = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
}

window.showView = function(id){
  ["dashboardView","workflowView","scheduleView","profitView","customersView","customerDetailView","jobsView","paymentsView","bidsView","recurringView","expensesView","invoicesView","invoiceView","settingsView"].forEach(v=>{
    el(v).classList.add("hidden");
  });

  el(id).classList.remove("hidden");
  fabMenu.classList.add("hidden");

  document.querySelectorAll(".bottomNav button").forEach(b=>b.classList.remove("active"));

  if(id === "dashboardView") el("navDashboard").classList.add("active");
  if(id === "customersView" || id === "customerDetailView") el("navCustomers").classList.add("active");
  if(id === "jobsView" || id === "scheduleView") el("navJobs").classList.add("active");
  if(id === "invoicesView" || id === "invoiceView") el("navInvoices").classList.add("active");
  if(["settingsView","bidsView","expensesView","recurringView","profitView","paymentsView"].includes(id)) el("navMore").classList.add("active");

  const titles = {
    dashboardView:"Business dashboard",
    scheduleView:"Schedule",
    bidsView:"Bids",
    profitView:"Reports",
    customersView:"Customers",
    customerDetailView:"Customer detail",
    jobsView:"Jobs",
    paymentsView:"Payments",
    recurringView:"Recurring calendar",
    expensesView:"Expense ledger",
    invoicesView:"Invoice center",
    invoiceView:"Invoice preview",
    settingsView:"More"
  };

  document.getElementById("headerSub").innerText = titles[id] || "Business dashboard";
  window.scrollTo(0,0);
};

window.openPaidJobs = function(){
  showView("jobsView");
  el("jobStatusFilter").value = "paid";
  el("jobSearch").value = "";
  renderAll();
};

window.openOwedJobs = function(){
  showView("jobsView");
  el("jobStatusFilter").value = "unpaid";
  el("jobSearch").value = "";
  renderAll();
};

window.openTodaySchedule = function(){
  showView("scheduleView");
  renderSchedule("today");
};

window.openUpcomingSchedule = function(){
  showView("scheduleView");
  renderSchedule("upcoming");
};

window.showAllSchedule = function(){
  showView("scheduleView");
  renderSchedule("all");
};

window.openExpenses = function(){
  showView("expensesView");
};

window.openPayments = function(){
  showView("paymentsView");
};

window.openProfitBreakdown = function(){
  showView("profitView");
  renderAll();
};

window.openWorkflow = function(){
  showView("workflowView");
  renderWorkflowBoard();
};

window.toggleBox = function(id,forceOpen){
  const box = el(id);
  if(forceOpen === true){
    box.classList.remove("hidden");
    return;
  }
  box.classList.toggle("hidden");
};

function getCustomer(id){
  return customers.find(c => c.id === id);
}

function getCustomerName(id){
  return getCustomer(id)?.name || "Unknown customer";
}

function jobPayments(jobId){
  return payments.filter(p => p.jobId === jobId).sort((a,b)=>(b.date || "").localeCompare(a.date || ""));
}

function jobPaidAmount(j){
  const list = jobPayments(j.id);
  if(list.length) return list.reduce((s,p)=>s + Number(p.amount || 0),0);
  return Number(j.paid || 0);
}

function jobBalance(j){
  return Math.max(0,Number(j.amount || 0) - jobPaidAmount(j));
}

function paymentStatus(j){
  const balance = jobBalance(j);
  if(balance === 0) return "Paid";
  if(jobPaidAmount(j) > 0) return "Partial";
  return "Unpaid";
}

function paymentBadge(j){
  const status = paymentStatus(j);
  if(status === "Paid") return `<span class="badge badgeGreen">Paid</span>`;
  if(status === "Partial") return `<span class="badge badgeGold">Partial</span>`;
  return `<span class="badge badgeRed">Unpaid</span>`;
}

function workflowBadge(j){
  const status = j.status || "Scheduled";
  if(status === "Complete") return `<span class="badge badgeGreen">Complete</span>`;
  if(status === "In Progress") return `<span class="badge badgeGold">In Progress</span>`;
  return `<span class="badge badgeBlue">${safe(status)}</span>`;
}

function customerTotals(customerId){
  const list = jobs.filter(j => j.customerId === customerId);
  const charged = list.reduce((s,j)=>s + Number(j.amount || 0),0);
  const paid = list.reduce((s,j)=>s + jobPaidAmount(j),0);
  const owed = list.reduce((s,j)=>s + jobBalance(j),0);
  return {charged,paid,owed};
}

function recurringStatus(r){
  const base = new Date(today() + "T00:00:00");
  const due = new Date((r.nextDate || today()) + "T00:00:00");
  const diff = Math.ceil((due - base) / 86400000);

  if(diff < 0) return {label:"Past Due",cls:"badgeRed"};
  if(diff === 0) return {label:"Due Today",cls:"badgeGold"};
  if(diff <= 7) return {label:"Upcoming",cls:"badgeBlue"};
  return {label:"Scheduled",cls:"badgeGreen"};
}

function refreshDropdowns(){
  const html = '<option value="">Select customer</option>' +
    customers.slice().sort((a,b)=>String(a.name || "").localeCompare(String(b.name || "")))
      .map(c=>`<option value="${c.id}">${safe(c.name)}</option>`)
      .join("");

  el("jobCustomer").innerHTML = html;
  el("recurringCustomer").innerHTML = html;
  el("invoiceCustomerSelect").innerHTML = html;
  if(el("bidCustomer")) el("bidCustomer").innerHTML = html;
}

window.saveCustomer = async function(){
  const data = {
    name: el("customerName").value.trim(),
    email: el("customerEmail").value.trim(),
    phone: el("customerPhone").value.trim(),
    address: el("customerAddress").value.trim(),
    gateCode: el("customerGateCode").value.trim(),
    preferredContact: el("customerPreferredContact").value.trim(),
    serviceFrequency: el("customerServiceFrequency").value.trim(),
    propertyNotes: el("customerPropertyNotes").value.trim(),
    notes: el("customerNotes").value.trim()
  };

  if(!data.name){
    alert("Enter customer name");
    return;
  }

  if(editingCustomerId){
    await updateDoc(doc(db,"customers",editingCustomerId),data);
  }else{
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db,"customers"),data);
  }

  resetCustomerForm();
};

window.editCustomer = function(id){
  const c = getCustomer(id);
  if(!c) return;

  editingCustomerId = id;
  el("customerFormTitle").innerText = "Edit Customer";
  el("customerName").value = c.name || "";
  el("customerEmail").value = c.email || "";
  el("customerPhone").value = c.phone || "";
  el("customerAddress").value = c.address || "";
  el("customerGateCode").value = c.gateCode || "";
  el("customerPreferredContact").value = c.preferredContact || "";
  el("customerServiceFrequency").value = c.serviceFrequency || "";
  el("customerPropertyNotes").value = c.propertyNotes || "";
  el("customerNotes").value = c.notes || "";
  showView("customersView");
  el("customerFormBox").classList.remove("hidden");
};

window.resetCustomerForm = function(){
  editingCustomerId = null;
  el("customerFormTitle").innerText = "Add Customer";
  el("customerName").value = "";
  el("customerEmail").value = "";
  el("customerPhone").value = "";
  el("customerAddress").value = "";
  el("customerGateCode").value = "";
  el("customerPreferredContact").value = "";
  el("customerServiceFrequency").value = "";
  el("customerPropertyNotes").value = "";
  el("customerNotes").value = "";
};

window.saveJob = async function(){
  const existingJob = editingJobId ? jobs.find(x => x.id === editingJobId) : null;

  const data = {
    customerId: el("jobCustomer").value,
    title: el("jobTitle").value.trim(),
    date: el("jobDate").value || today(),
    time: el("jobTime").value || "",
    amount: Number(el("jobAmount").value || 0),
    paid: Number(el("jobPaid").value || 0),
    notes: el("jobNotes").value.trim(),
    status: existingJob?.status || "Scheduled"
  };

  if(!data.customerId || !data.title){
    alert("Select a customer and enter a job description");
    return;
  }

  if(editingJobId){
    await updateDoc(doc(db,"jobs",editingJobId),{
      customerId:data.customerId,
      title:data.title,
      date:data.date,
      time:data.time,
      amount:data.amount,
      notes:data.notes,
      status:data.status
    });
  }else{
    data.createdAt = new Date().toISOString();
    const jobRef = await addDoc(collection(db,"jobs"),data);

    if(data.paid > 0){
      await addDoc(collection(db,"payments"),{
        jobId:jobRef.id,
        customerId:data.customerId,
        amount:data.paid,
        date:data.date,
        notes:"Initial payment",
        createdAt:new Date().toISOString()
      });
    }
  }

  resetJobForm();
};

window.editJob = function(id){
  const j = jobs.find(x => x.id === id);
  if(!j) return;

  editingJobId = id;
  el("jobFormTitle").innerText = "Edit Job";
  el("jobCustomer").value = j.customerId || "";
  el("jobTitle").value = j.title || "";
  el("jobDate").value = j.date || today();
  el("jobTime").value = j.time || "";
  el("jobAmount").value = j.amount || 0;
  el("jobPaid").value = jobPaidAmount(j);
  el("jobNotes").value = j.notes || "";
  showView("jobsView");
  el("jobFormBox").classList.remove("hidden");
};

window.resetJobForm = function(){
  editingJobId = null;
  el("jobFormTitle").innerText = "Add Job";
  el("jobCustomer").value = "";
  el("jobTitle").value = "";
  el("jobDate").value = today();
  el("jobTime").value = "";
  el("jobAmount").value = "";
  el("jobPaid").value = "";
  el("jobNotes").value = "";
};

window.addPayment = async function(id){
  const j = jobs.find(x => x.id === id);
  if(!j) return;

  const amountText = prompt("Payment amount received?");
  if(amountText === null) return;

  const amount = Number(amountText);
  if(!amount || amount <= 0){
    alert("Enter a valid payment amount");
    return;
  }

  const noteText = prompt("Payment note? Example: Cash, check, Venmo, card") || "";

  await addDoc(collection(db,"payments"),{
    jobId:j.id,
    customerId:j.customerId,
    amount,
    date:today(),
    notes:noteText,
    createdAt:new Date().toISOString()
  });

  await updateDoc(doc(db,"jobs",id),{
    paid:jobPaidAmount(j) + amount
  });
};

window.savePaymentFromCustomer = async function(){
  const jobId = el("paymentJobSelect")?.value;
  const amount = Number(el("paymentAmount")?.value || 0);
  const date = el("paymentDate")?.value || today();
  const method = el("paymentMethod")?.value.trim() || "";
  const notes = el("paymentNotes")?.value.trim() || "";

  const j = jobs.find(x => x.id === jobId);

  if(!j){
    alert("Select a job");
    return;
  }

  if(!amount || amount <= 0){
    alert("Enter a valid payment amount");
    return;
  }

  await addDoc(collection(db,"payments"),{
    jobId:j.id,
    customerId:j.customerId,
    amount,
    date,
    method,
    notes: method ? `${method} ${notes}`.trim() : notes,
    createdAt:new Date().toISOString()
  });

  await updateDoc(doc(db,"jobs",j.id),{
    paid:jobPaidAmount(j) + amount
  });

  alert("Payment saved");

  if(activeCustomerDetailId){
    setTimeout(()=>viewCustomer(activeCustomerDetailId),500);
  }
};

window.deletePayment = async function(id){
  if(confirm("Delete this payment?")) await deleteDoc(doc(db,"payments",id));
};

window.markPaid = async function(id){
  const j = jobs.find(x => x.id === id);
  if(!j) return;

  const balance = jobBalance(j);

  if(balance <= 0){
    alert("This job is already paid.");
    return;
  }

  await addDoc(collection(db,"payments"),{
    jobId:j.id,
    customerId:j.customerId,
    amount:balance,
    date:today(),
    notes:"Marked paid",
    createdAt:new Date().toISOString()
  });

  await updateDoc(doc(db,"jobs",id),{
    paid:Number(j.amount || 0),
    status:"Complete"
  });

  renderAll();

  if(activeCustomerDetailId && !el("customerDetailView").classList.contains("hidden")){
    setTimeout(()=>viewCustomer(activeCustomerDetailId),500);
  }
};

window.setJobStatus = async function(id,status){
  try{
    await updateDoc(doc(db,"jobs",id),{
      status:status
    });

    renderAll();

    if(activeCustomerDetailId && !el("customerDetailView").classList.contains("hidden")){
      setTimeout(()=>viewCustomer(activeCustomerDetailId),400);
    }

    alert("Status changed to " + status);

  }catch(error){
    alert("Status update failed: " + error.message);
  }
};

window.saveRecurring = async function(){
  const data = {
    customerId: el("recurringCustomer").value,
    title: el("recurringTitle").value.trim(),
    nextDate: el("recurringNextDate").value || today(),
    time: el("recurringTime").value || "",
    amount: Number(el("recurringAmount").value || 0),
    frequency: el("recurringFrequency").value
  };

  if(!data.customerId || !data.title){
    alert("Select a customer and enter recurring job title");
    return;
  }

  if(editingRecurringId){
    await updateDoc(doc(db,"recurring",editingRecurringId),data);
  }else{
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db,"recurring"),data);
  }

  resetRecurringForm();
};

window.editRecurring = function(id){
  const r = recurring.find(x => x.id === id);
  if(!r) return;

  editingRecurringId = id;
  el("recurringFormTitle").innerText = "Edit Recurring Job";
  el("recurringCustomer").value = r.customerId || "";
  el("recurringTitle").value = r.title || "";
  el("recurringNextDate").value = r.nextDate || today();
  el("recurringTime").value = r.time || "";
  el("recurringAmount").value = r.amount || 0;
  el("recurringFrequency").value = r.frequency || "weekly";
  showView("recurringView");
  el("recurringFormBox").classList.remove("hidden");
};

window.resetRecurringForm = function(){
  editingRecurringId = null;
  el("recurringFormTitle").innerText = "Add Recurring Job";
  el("recurringCustomer").value = "";
  el("recurringTitle").value = "";
  el("recurringNextDate").value = today();
  el("recurringTime").value = "";
  el("recurringAmount").value = "";
  el("recurringFrequency").value = "weekly";
};

window.createJobFromRecurring = async function(id){
  const r = recurring.find(x => x.id === id);
  if(!r) return;

  await addDoc(collection(db,"jobs"),{
    customerId:r.customerId,
    title:r.title,
    date:r.nextDate,
    time:r.time || "",
    amount:Number(r.amount || 0),
    paid:0,
    notes:"Created from recurring job",
    status:"Scheduled",
    createdAt:new Date().toISOString()
  });

  let nextDate = r.nextDate || today();
  if(r.frequency === "weekly") nextDate = addDays(nextDate,7);
  if(r.frequency === "biweekly") nextDate = addDays(nextDate,14);
  if(r.frequency === "monthly"){
    const d = new Date(nextDate + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    nextDate = d.toISOString().slice(0,10);
  }

  await updateDoc(doc(db,"recurring",id),{nextDate});
};

window.saveExpense = async function(){
  const data = {
    date: el("expenseDate").value || today(),
    category: el("expenseCategory").value.trim(),
    amount: Number(el("expenseAmount").value || 0),
    notes: el("expenseNotes").value.trim()
  };

  if(!data.category){
    alert("Enter expense category");
    return;
  }

  if(editingExpenseId){
    await updateDoc(doc(db,"expenses",editingExpenseId),data);
  }else{
    data.createdAt = new Date().toISOString();
    await addDoc(collection(db,"expenses"),data);
  }

  resetExpenseForm();
};

window.editExpense = function(id){
  const e = expenses.find(x => x.id === id);
  if(!e) return;

  editingExpenseId = id;
  el("expenseFormTitle").innerText = "Edit Expense";
  el("expenseDate").value = e.date || today();
  el("expenseCategory").value = e.category || "";
  el("expenseAmount").value = e.amount || 0;
  el("expenseNotes").value = e.notes || "";
  showView("expensesView");
  el("expenseFormBox").classList.remove("hidden");
};

window.resetExpenseForm = function(){
  editingExpenseId = null;
  el("expenseFormTitle").innerText = "Add Expense";
  el("expenseDate").value = today();
  el("expenseCategory").value = "";
  el("expenseAmount").value = "";
  el("expenseNotes").value = "";
};

window.deleteItem = async function(collectionName,id){
  if(!confirm("Delete this item?")) return;

  try{
    if(collectionName === "jobs"){
      const attachedPayments = payments.filter(p => p.jobId === id);

      for(const p of attachedPayments){
        await deleteDoc(doc(db,"payments",p.id));
      }
    }

    await deleteDoc(doc(db,collectionName,id));

    setTimeout(()=>{
      renderAll();

      if(activeCustomerDetailId && !el("customerDetailView").classList.contains("hidden")){
        viewCustomer(activeCustomerDetailId);
      }
    },700);

  }catch(error){
    alert("Delete failed: " + error.message);
  }
};

window.copyReminder = function(jobId){
  const j = jobs.find(x => x.id === jobId);
  if(!j) return;

  const balance = jobBalance(j);
  const message = `Hey ${getCustomerName(j.customerId)}, just wanted to touch base on the remaining balance for ${j.title}. The current balance is ${money(balance)}. Thank you.`;

  navigator.clipboard.writeText(message).then(()=>{
    alert("Reminder copied:\n\n" + message);
  }).catch(()=>{
    alert(message);
  });
};

window.emailInvoice = function(customerId){
  const c = getCustomer(customerId);
  if(!c) return;

  if(!c.email){
    alert("This customer does not have an email saved.");
    return;
  }

  const totals = customerTotals(customerId);
  const subject = encodeURIComponent("Invoice from 5Cs Property Services LLC");
  const body = encodeURIComponent(
`Hello ${c.name},

Attached or below is your invoice summary from 5Cs Property Services LLC.

Total paid: ${money(totals.paid)}
Balance due: ${money(totals.owed)}

Payment is due upon receipt.

Thank you for your business.

5Cs Property Services LLC`
  );

  window.location.href = `mailto:${encodeURIComponent(c.email)}?subject=${subject}&body=${body}`;
};

window.viewCustomer = function(id){
  activeCustomerDetailId = id;
  const c = getCustomer(id);
  if(!c) return;

  const phone = cleanPhone(c.phone);
  const totals = customerTotals(id);
  const custJobs = jobs.filter(j => j.customerId === id).sort((a,b)=>(b.date || "").localeCompare(a.date || ""));
  const custRecurring = recurring.filter(r => r.customerId === id);
  const custPayments = payments.filter(p => p.customerId === id).sort((a,b)=>(b.date || "").localeCompare(a.date || ""));
  const custBids = bids.filter(b => b.customerId === id).sort((a,b)=>(b.createdAt || "").localeCompare(a.createdAt || ""));
  const lastJob = custJobs[0];

  el("customerDetail").innerHTML = `
    <div class="box">
      <div class="detailTitle">
        <div>
          <h2>${safe(c.name)}</h2>
          <div class="small">${safe(c.email)}</div>
          <div class="small">${safe(c.phone)}</div>
          <div class="small">${safe(c.address)}</div>
        </div>
        <button class="secondary" onclick="showView('customersView')">Back</button>
      </div>

      <div class="grid">
        <div class="stat"><b>Paid</b><h2>${money(totals.paid)}</h2></div>
        <div class="stat"><b>Owed</b><h2>${money(totals.owed)}</h2></div>
        <div class="stat"><b>Last Service</b><h2>${lastJob ? dateLabel(lastJob.date) : "None"}</h2></div>
        <div class="stat"><b>Frequency</b><h2>${safe(c.serviceFrequency || "None")}</h2></div>
      </div>

      <div class="box">
        <h3>Property Info</h3>
        <div><b>Gate or Access:</b> ${safe(c.gateCode)}</div>
        <div><b>Preferred Contact:</b> ${safe(c.preferredContact)}</div>
        <div><b>Property Notes:</b> ${safe(c.propertyNotes)}</div>
        <div><b>General Notes:</b> ${safe(c.notes)}</div>
      </div>

      <div class="row">
        ${phone ? `<a class="actionLink" href="tel:${phone}">Call</a>` : ""}
        ${phone ? `<a class="actionLink" href="sms:${phone}">Text</a>` : ""}
        <button onclick="makeInvoice('${c.id}')">Invoice</button>
        <button onclick="emailInvoice('${c.id}')">Email Invoice</button>
        <button onclick="editCustomer('${c.id}')">Edit</button>
      </div>
    </div>

    <div class="box noPrint">
      <h3>Add Job For This Customer</h3>
      <button onclick="quickJob('${c.id}')">Add Job</button>
    </div>

    <div class="box noPrint">
      <h3>Add Payment</h3>
      <select id="paymentJobSelect">
        ${custJobs.map(j=>`
          <option value="${j.id}">
            ${safe(j.title)} | Balance ${money(jobBalance(j))}
          </option>
        `).join("")}
      </select>
      <input id="paymentAmount" type="number" placeholder="Payment amount">
      <input id="paymentDate" type="date" value="${today()}">
      <input id="paymentMethod" placeholder="Payment method, ex: Cash, Check, Venmo, Card">
      <textarea id="paymentNotes" placeholder="Payment notes"></textarea>
      <button class="green" onclick="savePaymentFromCustomer()">Save Payment</button>
    </div>
       
         <div class="box">
      <h3>Bids</h3>
      ${custBids.length ? custBids.map(b=>`
       <div class="jobCard">

  <div class="customerHeader">

    <div>
      <h3>${safe(b.title)}</h3>

      <div class="small">
        ${safe(getCustomerName(b.customerId))}
      </div>
    </div>

    <span class="badge badgeBlue">
      ${safe(b.status || "Pending")}
    </span>

  </div>

  <div class="box">

    ${(b.items || []).map(i=>`

      <div class="moneyLine">

        <span>
          ${safe(i.desc)}
          • Qty ${i.qty}
        </span>

        <b>
          ${money(i.qty * i.price)}
        </b>

      </div>

    `).join("")}

  </div>

  <div class="moneyLine bigTotal">

    <span>Bid Total</span>

    <b>${money(b.total)}</b>

  </div>

</div>        </div>
      `).join("") : "<p class='small'>No bids saved for this customer yet.</p>"}
    </div>
    
    <div class="box">
      <h3>Jobs</h3>
      ${custJobs.length ? custJobs.map(jobCardHtml).join("") : "<p class='small'>No jobs yet.</p>"}
    </div>

    <div class="box">
      <h3>Payment History</h3>
      ${custPayments.length ? custPayments.map(paymentLineHtml).join("") : "<p class='small'>No payments yet.</p>"}
    </div>

    <div class="box">
      <h3>Recurring</h3>
      ${custRecurring.length ? custRecurring.map(recurringCardHtml).join("") : "<p class='small'>No recurring jobs yet.</p>"}
    </div>
  `;

  showView("customerDetailView");
};

window.quickJob = function(customerId){
  showView("jobsView");
  el("jobFormBox").classList.remove("hidden");
  resetJobForm();
  el("jobCustomer").value = customerId;
};

function paymentLineHtml(p){
  const job = jobs.find(j => j.id === p.jobId);
  return `
    <div class="paymentLine">
      <b>${money(p.amount)}</b>
      <div class="small">${safe(p.date)} | ${safe(job?.title || "Payment")}</div>
      <div class="small">${safe(p.notes)}</div>
      <button class="red" onclick="deletePayment('${p.id}')">Delete Payment</button>
    </div>
  `;
}

function jobCardHtml(j){
  const balance = jobBalance(j);
  const list = jobPayments(j.id);

  return `
    <div class="jobCard">
      <h3>${safe(j.title)}</h3>
      <div class="small">${safe(getCustomerName(j.customerId))} | ${dateLabel(j.date)} ${j.time ? "at " + timeLabel(j.time) : ""}</div>
      ${paymentBadge(j)}
      ${workflowBadge(j)}
      ${isPastDue(j.date) && balance > 0 ? `<span class="badge badgeRed">Overdue</span>` : ""}
      <div class="moneyLine"><span>Charged</span><b>${money(j.amount)}</b></div>
      <div class="moneyLine"><span>Paid</span><b>${money(jobPaidAmount(j))}</b></div>
      <div class="moneyLine"><span>Balance</span><b>${money(balance)}</b></div>
      <p>${safe(j.notes)}</p>

      <details>
        <summary>Payment history</summary>
        ${list.length ? list.map(paymentLineHtml).join("") : "<p class='small'>No payment records yet.</p>"}
      </details>

      <div class="row">
        <button class="blue" onclick="setJobStatus('${j.id}','Scheduled')">Scheduled</button>
        <button class="gold" onclick="setJobStatus('${j.id}','In Progress')">In Progress</button>
        <button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button>
        <button onclick="markPaid('${j.id}')">Mark Paid</button>
        <button class="green" onclick="addPayment('${j.id}')">Add Payment</button>
        <button class="gold" onclick="copyReminder('${j.id}')">Reminder</button>
        <button class="secondary" onclick="editJob('${j.id}')">Edit</button>
        <button class="red" onclick="deleteItem('jobs','${j.id}')">Delete</button>
      </div>
    </div>
  `;
}

function recurringCardHtml(r){
  const s = recurringStatus(r);
  return `
    <div class="box">
      <h3>${safe(r.title)}</h3>
      <div class="small">${safe(getCustomerName(r.customerId))}</div>
      <span class="badge ${s.cls}">${s.label}</span>
      <div>Next: ${dateLabel(r.nextDate)} ${r.time ? "at " + timeLabel(r.time) : ""}</div>
      <div>Frequency: ${safe(r.frequency)}</div>
      <div>Amount: ${money(r.amount)}</div>
      <div class="row">
        <button class="green" onclick="createJobFromRecurring('${r.id}')">Create Job</button>
        <button class="secondary" onclick="editRecurring('${r.id}')">Edit</button>
        <button class="red" onclick="deleteItem('recurring','${r.id}')">Delete</button>
      </div>
    </div>
  `;
}

function expenseCardHtml(e){
  return `
    <div class="box">
      <h3>${safe(e.category)}</h3>
      <div class="small">${dateLabel(e.date)}</div>
      <div><b>${money(e.amount)}</b></div>
      <p>${safe(e.notes)}</p>
      <div class="row">
        <button class="secondary" onclick="editExpense('${e.id}')">Edit</button>
        <button class="red" onclick="deleteItem('expenses','${e.id}')">Delete</button>
      </div>
    </div>
  `;
}

function scheduleCardHtml(j){
  const c = getCustomer(j.customerId);
  const phone = cleanPhone(c?.phone);
  return `
    <div class="box">
      <h3>${safe(j.title)}</h3>
      <div><b>${dateLabel(j.date)} ${j.time ? "at " + timeLabel(j.time) : ""}</b></div>
      <div>${safe(getCustomerName(j.customerId))}</div>
      <div class="small">${safe(c?.address || "")}</div>
      <div class="small">${safe(c?.gateCode ? "Gate or access: " + c.gateCode : "")}</div>
      <div class="small">${safe(c?.propertyNotes || "")}</div>
      ${paymentBadge(j)}
      ${workflowBadge(j)}
      <div class="row">
        ${phone ? `<a class="actionLink" href="tel:${phone}">Call</a>` : ""}
        ${phone ? `<a class="actionLink" href="sms:${phone}">Text</a>` : ""}
        <button onclick="viewCustomer('${j.customerId}')">Customer</button>
        <button onclick="editJob('${j.id}')">Edit Job</button>
      </div>
    </div>
  `;
}

function renderSchedule(mode){
  let list = jobs.slice().sort((a,b)=>{
    const ad = `${a.date || ""} ${a.time || ""}`;
    const bd = `${b.date || ""} ${b.time || ""}`;
    return ad.localeCompare(bd);
  });

  if(mode === "today"){
    list = list.filter(j => j.date === today());
    el("scheduleTitle").innerText = "Today’s Jobs";
  }else if(mode === "upcoming"){
    const end = addDays(today(),7);
    list = list.filter(j => j.date >= today() && j.date <= end);
    el("scheduleTitle").innerText = "Next 7 Days";
  }else{
    list = list.filter(j => j.date);
    el("scheduleTitle").innerText = "All Scheduled Jobs";
  }

  el("scheduleList").innerHTML = list.length ? list.map(scheduleCardHtml).join("") : "<p class='small'>No scheduled jobs found.</p>";
}

window.makeInvoiceFromCenter = function(){
  const customerId = el("invoiceCustomerSelect").value;
  if(!customerId){
    alert("Select a customer");
    return;
  }
  makeInvoice(customerId);
};

window.makeInvoice = function(customerId){
  const c = getCustomer(customerId);
  if(!c) return;

  const custJobs = jobs.filter(j => j.customerId === customerId);
  const invoiceNumber = "INV-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-5);
  const issueDate = today();
  const dueDate = el("invoiceDueDate")?.value || today();
  const total = custJobs.reduce((s,j)=>s + Number(j.amount || 0),0);
  const paid = custJobs.reduce((s,j)=>s + jobPaidAmount(j),0);
  const balance = total - paid;
  const invoiceNotes = el("invoiceNotes")?.value || "Payment due upon receipt. Thank you for your business.";
  const paidStamp = balance <= 0 ? `<span class="badge badgeGreen">Paid In Full</span>` : "";
  const overdueStamp = balance > 0 && isPastDue(dueDate) ? `<span class="badge badgeRed">Overdue</span>` : "";

  el("invoiceArea").innerHTML = `
    <div class="invoice">
      <div class="invoiceTop">
        <div>
          <img class="invoiceLogo" src="logo.png" alt="5Cs Property Services LLC Logo" onerror="this.style.display='none'">
          <h2>5Cs Property Services LLC</h2>
          <p>Cleaned Up • Fixed Right • Ready To Sell</p>
        </div>
        <div>
          <h1>Invoice</h1>
          <p><b>${invoiceNumber}</b></p>
          <p>Issue Date: ${safe(issueDate)}</p>
          <p>Due Date: ${safe(dueDate)}</p>
          ${paidStamp}
          ${overdueStamp}
        </div>
      </div>

      <h3>Bill To</h3>
      <p>
        <b>${safe(c.name)}</b><br>
        ${safe(c.email)}<br>
        ${safe(c.phone)}<br>
        ${safe(c.address)}
      </p>

      <table>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Paid</th>
          <th>Balance</th>
        </tr>
        ${custJobs.map(j=>`
          <tr>
            <td>${safe(j.date)}</td>
            <td>${safe(j.title)}</td>
            <td>${money(j.amount)}</td>
            <td>${money(jobPaidAmount(j))}</td>
            <td>${money(jobBalance(j))}</td>
          </tr>
        `).join("")}
      </table>

      <p class="invoiceTotal">Total: ${money(total)}</p>
      <p class="invoiceTotal">Paid: ${money(paid)}</p>
      <p class="invoiceTotal">Balance Due: ${money(balance)}</p>

      <p>${safe(invoiceNotes)}</p>

      <button onclick="window.print()">Print or Save PDF</button>
      <button onclick="emailInvoice('${customerId}')">Email Invoice</button>
    </div>
  `;

  showView("invoiceView");
};

window.exportBackup = function(){
  const data = {customers,jobs,recurring,expenses,payments,exportedAt:new Date().toISOString()};
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "5cs-tracker-backup.json";
  a.click();
};

window.renderWorkflowBoard = renderWorkflowBoard;

function workflowMiniCard(j){
  return `
    <div class="jobCard">
      <h3>${safe(j.title)}</h3>
      <div class="small">
        ${safe(getCustomerName(j.customerId))}
        |
        ${dateLabel(j.date)}
      </div>

      ${paymentBadge(j)}
      ${workflowBadge(j)}

      <div class="moneyLine">
        <span>Balance</span>
        <b>${money(jobBalance(j))}</b>
      </div>

      <div class="row">
        <button onclick="viewCustomer('${j.customerId}')">Customer</button>

        <button class="blue"
          onclick="setJobStatus('${j.id}','Scheduled')">
          Scheduled
        </button>

        <button class="gold"
          onclick="setJobStatus('${j.id}','In Progress')">
          In Progress
        </button>

        <button class="green"
          onclick="setJobStatus('${j.id}','Complete')">
          Complete
        </button>
      </div>
    </div>
  `;
}

function renderWorkflowBoard(){

  const scheduled =
    jobs.filter(j =>
      (j.status || "Scheduled") === "Scheduled"
    );

  const inProgress =
    jobs.filter(j =>
      (j.status || "Scheduled") === "In Progress"
    );

  const waitingPayment =
    jobs.filter(j =>
      (j.status || "Scheduled") === "Complete"
      &&
      jobBalance(j) > 0
    );

  const completedPaid =
    jobs.filter(j =>
      (j.status || "Scheduled") === "Complete"
      &&
      jobBalance(j) <= 0
    );

  el("workflowScheduled").innerHTML =
    scheduled.length
      ? scheduled.map(workflowMiniCard).join("")
      : "<p class='small'>No scheduled jobs.</p>";

  el("workflowInProgress").innerHTML =
    inProgress.length
      ? inProgress.map(workflowMiniCard).join("")
      : "<p class='small'>No jobs in progress.</p>";

  el("workflowWaitingPayment").innerHTML =
    waitingPayment.length
      ? waitingPayment.map(workflowMiniCard).join("")
      : "<p class='small'>No completed jobs waiting on payment.</p>";

  el("workflowCompletedPaid").innerHTML =
    completedPaid.length
      ? completedPaid.map(workflowMiniCard).join("")
      : "<p class='small'>No completed paid jobs.</p>";
}
window.addBidItemRow = addBidItemRow;

function addBidItemRow(desc="",qty=1,price=0){

  const row = document.createElement("div");

  row.className = "bidRow";

  row.innerHTML = `

  <div class="box">

    <input class="bidDesc"
      placeholder="Item description"
      value="${safe(desc)}">

    <input class="bidQty"
      type="number"
      placeholder="Quantity"
      value="${qty || ""}">

    <input class="bidPrice"
      type="number"
      placeholder="Price"
      value="${price || ""}">

    <button class="red removeBidRow">
      Remove Item
    </button>

  </div>
`;
  el("bidItems").appendChild(row);

  row.querySelector(".removeBidRow")
    .onclick = ()=>{
      row.remove();
      updateBidTotal();
    };

  row.querySelectorAll("input")
    .forEach(i=>{
      i.addEventListener("input",updateBidTotal);
    });

  updateBidTotal();
}

window.updateBidTotal = updateBidTotal;

function updateBidTotal(){

  let total = 0;

  document.querySelectorAll(".bidRow")
    .forEach(row=>{

      const qty =
        Number(
          row.querySelector(".bidQty").value || 0
        );

      const price =
        Number(
          row.querySelector(".bidPrice").value || 0
        );

      total += qty * price;
    });

  el("bidTotal").innerText = money(total);
}

window.saveBid = async function(){

  const customerId = el("bidCustomer").value;

  const title =
    el("bidTitle").value.trim();

  if(!customerId || !title){
    alert("Select customer and enter title");
    return;
  }

  const items = [];

  document.querySelectorAll(".bidRow")
    .forEach(row=>{

      items.push({
        desc:
          row.querySelector(".bidDesc").value.trim(),

        qty:
          Number(
            row.querySelector(".bidQty").value || 0
          ),

        price:
          Number(
            row.querySelector(".bidPrice").value || 0
          )
      });

    });

  const total =
    items.reduce((s,i)=>
      s + (i.qty * i.price),0);

  await addDoc(collection(db,"bids"),{

    customerId,

    title,

    notes:
      el("bidNotes").value.trim(),

    items,

    total,

    status:"Pending",

    createdAt:new Date().toISOString()
  });

  alert("Bid saved");

  el("bidTitle").value = "";
  el("bidNotes").value = "";
  el("bidItems").innerHTML = "";

  addBidItemRow();
};
window.renderAll = renderAll;

function renderAll(){
  refreshDropdowns();

  const totalPaid = jobs.reduce((s,j)=>s + jobPaidAmount(j),0);
  const totalOwed = jobs.reduce((s,j)=>s + jobBalance(j),0);
  const totalExpenses = expenses.reduce((s,e)=>s + Number(e.amount || 0),0);
  const totalProfit = totalPaid - totalExpenses;

  const todayJobs = jobs.filter(j => j.date === today());
  const upcomingJobs = jobs.filter(j => j.date > today() && j.date <= addDays(today(),7));  const customersWithBalances = customers.filter(c => customerTotals(c.id).owed > 0);

  el("dashPaid").innerText = money(totalPaid);
  el("dashOwed").innerText = money(totalOwed);
  el("dashExpenses").innerText = money(totalExpenses);
  el("dashProfit").innerText = money(totalProfit);

  el("dashTodayJobs").innerText = todayJobs.length;
  el("dashUpcomingJobs").innerText = upcomingJobs.length;
  el("dashRecurringJobs").innerText = recurring.length;
  el("dashInvoiceCount").innerText = customersWithBalances.length;

  el("profitPaid").innerText = money(totalPaid);
  el("profitExpenses").innerText = money(totalExpenses);
  el("profitNet").innerText = money(totalProfit);
  el("profitOutstanding").innerText = money(totalOwed);

  const expenseGroups = {};
  expenses.forEach(e=>{
    const key = e.category || "Other";
    expenseGroups[key] = (expenseGroups[key] || 0) + Number(e.amount || 0);
});

  if(el("workflowView") && !el("workflowView").classList.contains("hidden")){
  renderWorkflowBoard();
}

  el("expenseBreakdown").innerHTML = Object.entries(expenseGroups)
    .sort((a,b)=>b[1]-a[1])
    .map(([cat,total])=>`
      <div class="moneyLine">
        <span>${safe(cat)}</span>
        <b>${money(total)}</b>
      </div>
    `).join("") || "<p class='small'>No expenses yet.</p>";

  el("topCustomers").innerHTML = customers
    .map(c=>({customer:c,total:customerTotals(c.id)}))
    .sort((a,b)=>b.total.paid-a.total.paid)
    .slice(0,5)
    .map(x=>`
      <div class="box">
        <h3>${safe(x.customer.name)}</h3>
        <div>Paid: ${money(x.total.paid)}</div>
        <div>Owed: ${money(x.total.owed)}</div>
        <button onclick="viewCustomer('${x.customer.id}')">View Customer</button>
      </div>
    `).join("") || "<p class='small'>No customer payments yet.</p>";

  const unpaidJobs = jobs.filter(j => paymentStatus(j) !== "Paid");
  const dueRecurring = recurring.filter(r => ["Past Due","Due Today","Upcoming"].includes(recurringStatus(r).label));

  const notifications = [];

  if(todayJobs.length){
    notifications.push(`
      <div class="box">
        <h3>${todayJobs.length} job${todayJobs.length === 1 ? "" : "s"} scheduled today</h3>
        <button onclick="openTodaySchedule()">View Today</button>
      </div>
    `);
  }

  if(unpaidJobs.length){
    notifications.push(`
      <div class="box">
        <h3>${unpaidJobs.length} unpaid or partial job${unpaidJobs.length === 1 ? "" : "s"}</h3>
        <button onclick="openOwedJobs()">Collect Balances</button>
      </div>
    `);
  }

  if(dueRecurring.length){
    notifications.push(`
      <div class="box">
        <h3>${dueRecurring.length} recurring job${dueRecurring.length === 1 ? "" : "s"} due soon</h3>
        <button onclick="showView('recurringView')">View Recurring</button>
      </div>
    `);
  }

  el("notificationCenter").innerHTML = notifications.length
    ? notifications.join("")
    : "<p class='small'>No alerts right now.</p>";

  el("todaySchedulePreview").innerHTML = todayJobs.length
    ? todayJobs.slice(0,5).sort((a,b)=>(a.time || "").localeCompare(b.time || "")).map(scheduleCardHtml).join("")
    : "<p class='small'>No jobs scheduled today.</p>";

  el("upcomingSchedulePreview").innerHTML = upcomingJobs.length
    ? upcomingJobs.slice(0,5).sort((a,b)=>(a.date || "").localeCompare(b.date || "")).map(scheduleCardHtml).join("")
    : "<p class='small'>No upcoming jobs in the next 7 days.</p>";

  const attentionItems = unpaidJobs
    .slice()
    .sort((a,b)=>jobBalance(b)-jobBalance(a))
    .slice(0,5)
    .map(j => ({
      html:`
        <div class="box">
          <h3>${safe(j.title)}</h3>
          <div>${safe(getCustomerName(j.customerId))}</div>
          ${paymentBadge(j)}
          ${workflowBadge(j)}
          <div class="owed">Balance: ${money(jobBalance(j))}</div>
          <div class="row">
            <button onclick="viewCustomer('${j.customerId}')">Customer</button>
            <button onclick="makeInvoice('${j.customerId}')">Invoice</button>
            <button class="green" onclick="addPayment('${j.id}')">Add Payment</button>
          </div>
        </div>
      `
    }));

  el("attentionList").innerHTML = attentionItems.length
    ? attentionItems.map(x=>x.html).join("")
    : "<p class='small'>No unpaid jobs right now.</p>";

  const cq = el("customerSearch").value.trim().toLowerCase();

  el("customerList").innerHTML = customers
    .slice()
    .sort((a,b)=>String(a.name || "").localeCompare(String(b.name || "")))
    .filter(c=>{
      const custJobs = jobs.filter(j => j.customerId === c.id);
      const text = `${c.name || ""} ${c.email || ""} ${c.phone || ""} ${c.address || ""} ${c.gateCode || ""} ${c.preferredContact || ""} ${c.serviceFrequency || ""} ${c.propertyNotes || ""} ${c.notes || ""} ${custJobs.map(j=>j.title).join(" ")}`.toLowerCase();
      return !cq || text.includes(cq);
    })
    .map(c=>{
      const totals = customerTotals(c.id);
      const phone = cleanPhone(c.phone);

      return `
        <div class="customerCard">
          <div class="customerHeader">
            <div>
              <h3>${safe(c.name)}</h3>
              <div class="small">${safe(c.email)}</div>
              <div class="small">${safe(c.phone)}</div>
              <div class="small">${safe(c.address)}</div>
              <div class="small">${safe(c.serviceFrequency)}</div>
            </div>
            <span class="badge ${totals.owed > 0 ? "badgeRed" : "badgeGreen"}">${totals.owed > 0 ? "Owes" : "Paid Up"}</span>
          </div>

          <div class="moneyLine"><span>Paid</span><b>${money(totals.paid)}</b></div>
          <div class="moneyLine"><span>Owed</span><b>${money(totals.owed)}</b></div>

          <div class="row">
            <button onclick="viewCustomer('${c.id}')">View</button>
            <button onclick="makeInvoice('${c.id}')">Invoice</button>
            <button onclick="emailInvoice('${c.id}')">Email Invoice</button>
            ${phone ? `<a class="actionLink" href="tel:${phone}">Call</a>` : ""}
            ${phone ? `<a class="actionLink" href="sms:${phone}">Text</a>` : ""}
            <button class="secondary" onclick="editCustomer('${c.id}')">Edit</button>
          </div>
        </div>
      `;
    }).join("") || "<p class='small'>No customers found.</p>";

  const jq = el("jobSearch").value.trim().toLowerCase();
  const statusFilter = el("jobStatusFilter").value;

  el("jobList").innerHTML = jobs
    .slice()
    .sort((a,b)=>(b.date || "").localeCompare(a.date || ""))
    .filter(j=>{
      const payStatus = paymentStatus(j).toLowerCase();
      const workflowStatus = String(j.status || "Scheduled").toLowerCase();
      const text = `${j.title || ""} ${j.notes || ""} ${getCustomerName(j.customerId)}`.toLowerCase();

      let statusOk = statusFilter === "all" || payStatus === statusFilter || workflowStatus === statusFilter;
      if(statusFilter === "today") statusOk = j.date === today();
      if(statusFilter === "upcoming") statusOk = j.date > today() && j.date <= addDays(today(),7);

      const searchOk = !jq || text.includes(jq);
      return statusOk && searchOk;
    })
    .map(jobCardHtml)
    .join("") || "<p class='small'>No jobs found.</p>";

  el("paymentsList").innerHTML = payments
    .slice()
    .sort((a,b)=>(b.date || "").localeCompare(a.date || ""))
    .map(p=>{
      const job = jobs.find(j => j.id === p.jobId);
      return `
        <div class="box">
          <h3>${money(p.amount)}</h3>
          <div>${safe(getCustomerName(p.customerId))}</div>
          <div class="small">${dateLabel(p.date)} | ${safe(job?.title || "Payment")}</div>
          <p>${safe(p.notes)}</p>
          <button class="red" onclick="deletePayment('${p.id}')">Delete Payment</button>
        </div>
      `;
    }).join("") || "<p class='small'>No payments yet.</p>";

  el("recurringCalendar").innerHTML = recurring
    .slice()
    .sort((a,b)=>(a.nextDate || "").localeCompare(b.nextDate || ""))
    .slice(0,10)
    .map(r=>{
      const s = recurringStatus(r);
      return `
        <div class="moneyLine">
          <span>${dateLabel(r.nextDate)} ${r.time ? timeLabel(r.time) : ""} | ${safe(r.title)} | ${safe(getCustomerName(r.customerId))}</span>
          <b><span class="badge ${s.cls}">${s.label}</span></b>
        </div>
      `;
    }).join("") || "<p class='small'>No recurring jobs scheduled.</p>";

  el("recurringList").innerHTML = recurring
    .slice()
    .sort((a,b)=>(a.nextDate || "").localeCompare(b.nextDate || ""))
    .map(recurringCardHtml)
    .join("") || "<p class='small'>No recurring jobs yet.</p>";

  el("bidsList").innerHTML =
  bids.length
    ?
    bids
      .slice()
      .sort((a,b)=>
        (b.createdAt || "")
          .localeCompare(a.createdAt || "")
      )
      .map(b=>`
        <div class="jobCard">

  <div class="customerHeader">

    <div>
      <h3>${safe(b.title)}</h3>

      <div class="small">
        ${safe(getCustomerName(b.customerId))}
      </div>
    </div>

    <span class="badge badgeBlue">
      ${safe(b.status || "Pending")}
    </span>

  </div>

  <div class="box">

    ${(b.items || []).map(i=>`

      <div class="moneyLine">

        <span>
          ${safe(i.desc)}
          • Qty ${i.qty}
        </span>

        <b>
          ${money(i.qty * i.price)}
        </b>

      </div>

    `).join("")}

  </div>

  <div class="moneyLine bigTotal">

    <span>Bid Total</span>

    <b>${money(b.total)}</b>

  </div>

</div>
        </div>
      `).join("")
    :
    "<p class='small'>No bids saved yet.</p>";
  
  el("expenseList").innerHTML = expenses
    .slice()
    .sort((a,b)=>(b.date || "").localeCompare(a.date || ""))
    .map(expenseCardHtml)
    .join("") || "<p class='small'>No expenses yet.</p>";

  el("invoiceCustomerList").innerHTML = customersWithBalances.length
    ? customersWithBalances.map(c=>{
      const totals = customerTotals(c.id);
      return `
        <div class="box">
          <h3>${safe(c.name)}</h3>
          <div class="small">${safe(c.email)}</div>
          <div class="owed">Balance: ${money(totals.owed)}</div>
          <button onclick="makeInvoice('${c.id}')">Create Invoice</button>
          <button onclick="emailInvoice('${c.id}')">Email Invoice</button>
        </div>
      `;
    }).join("")
    : "<p class='small'>No unpaid balances right now.</p>";
}
