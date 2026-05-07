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
let editingCustomerId=null,editingJobId=null,editingRecurringId=null;
let editingExpenseId=null,editingBidId=null,editingPartnerId=null;
let activeCustomerDetailId=null,plFirstVisit=false;

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
function isPastDue(dv){if(!dv)return false;return new Date(dv+"T00:00:00")<new Date(today()+"T00:00:00");}
function overdueLabel(dv){if(!dv||!isPastDue(dv))return"";const days=Math.floor((new Date(today()+"T00:00:00")-new Date(dv+"T00:00:00"))/86400000);return days===1?"1 day overdue":`${days} days overdue`;}

function showToast(msg){let t=el("appToast");if(!t){t=document.createElement("div");t.id="appToast";t.className="toast";document.body.appendChild(t);}t.textContent=msg;t.classList.add("show");clearTimeout(window._tt);window._tt=setTimeout(()=>t.classList.remove("show"),2500);}
window.showToast=showToast;

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
  more:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
};

document.body.insertAdjacentHTML("afterbegin",`<div id="syncBadge" class="syncBadge">Online</div>`);
function updateSyncBadge(){const b=el("syncBadge");if(!b)return;if(navigator.onLine){b.textContent="Online";b.classList.remove("offline");}else{b.textContent="Offline";b.classList.add("offline");}}
window.addEventListener("online",updateSyncBadge);window.addEventListener("offline",updateSyncBadge);updateSyncBadge();

const COMPANY={name:"5Cs Property Services LLC",tagline:"Cleaned Up &bull; Fixed Right &bull; Ready To Sell",phone:"918-424-7953",email:"craig.chaney.87@gmail.com"};

const LOT_SIZES=[{key:"sm",label:"Under \u00bc acre",sub:"Small city/subdivision lot"},{key:"md",label:"\u00bc \u2013 \u00bd acre",sub:"Average residential lot"},{key:"lg",label:"\u00bd \u2013 1 acre",sub:"Larger residential lot"},{key:"xl",label:"1+ acre",sub:"Rural or large property"}];
const HOME_SIZES=[{key:"sm",label:"Under 1,500 sq ft",sub:"Small home"},{key:"md",label:"1,500\u20132,500 sq ft",sub:"Average home"},{key:"lg",label:"2,500\u20134,000 sq ft",sub:"Larger home"},{key:"xl",label:"4,000+ sq ft",sub:"Large or luxury home"}];
const PRICE_LIST=[
  {id:"lawn",     cat:"Exterior & Grounds", name:"Lawn Mowing",              hasSizes:true, sizeType:"lot",  prices:{sm:40,md:55,lg:75,xl:100},   firstOk:true},
  {id:"cleanup",  cat:"Exterior & Grounds", name:"Full Yard Cleanup",         hasSizes:true, sizeType:"lot",  prices:{sm:135,md:175,lg:225,xl:290},firstOk:true},
  {id:"hedge",    cat:"Exterior & Grounds", name:"Hedge & Shrub Trimming",    hasSizes:false,flat:95,                                             firstOk:false},
  {id:"leaves",   cat:"Exterior & Grounds", name:"Leaf Removal",              hasSizes:false,flat:175,                                            firstOk:false},
  {id:"hauling",  cat:"Exterior & Grounds", name:"Debris / Junk Hauling",     hasSizes:false,flat:95,                                             firstOk:false},
  {id:"pressure", cat:"Exterior & Grounds", name:"Pressure Washing",          hasSizes:true, sizeType:"lot",  prices:{sm:90,md:130,lg:200,xl:280}, firstOk:false},
  {id:"gutter",   cat:"Exterior & Grounds", name:"Gutter Cleaning",           hasSizes:true, sizeType:"lot",  prices:{sm:80,md:110,lg:140,xl:170}, firstOk:false},
  {id:"windows",  cat:"Exterior & Grounds", name:"Window Cleaning (Ext.)",    hasSizes:false,flat:95,                                             firstOk:false},
  {id:"deepclean",cat:"Interior Prep",       name:"Deep Cleaning",             hasSizes:true, sizeType:"home", prices:{sm:175,md:225,lg:300,xl:400},firstOk:false},
  {id:"trashout", cat:"Interior Prep",       name:"Trash Out / Foreclosure",   hasSizes:true, sizeType:"home", prices:{sm:225,md:300,lg:400,xl:500},firstOk:false},
  {id:"handyman", cat:"Interior Prep",       name:"Handyman / Minor Repairs",  hasSizes:false,flat:75,unit:"hr",                                  firstOk:false},
  {id:"photos",   cat:"Photography & Media", name:"Professional Photography",  hasSizes:true, sizeType:"home", prices:{sm:150,md:175,lg:200,xl:240},firstOk:false},
  {id:"drone",    cat:"Photography & Media", name:"Drone Aerial Photos",       hasSizes:false,flat:125,                                            firstOk:false},
  {id:"photodrone",cat:"Photography & Media",name:"Photos + Drone Combo",     hasSizes:true, sizeType:"home", prices:{sm:250,md:275,lg:310,xl:350},firstOk:false},
  {id:"checkin",  cat:"Ongoing / Vacant",    name:"Vacant Property Check-In",  hasSizes:false,flat:60,                                             firstOk:false},
  {id:"storminsp",cat:"Ongoing / Vacant",    name:"Storm Damage Inspection",   hasSizes:false,flat:95,                                             firstOk:false},
  {id:"minjob",   cat:"Other",               name:"Minimum Job Charge",        hasSizes:false,flat:75,                                             firstOk:false},
];

const PACKAGES=[
  {key:"basic",      title:"Basic Curb Appeal",        discount:0.10,
   desc:"Lawn mowing, edging, exterior window cleaning",
   items:[{id:"lawn",sizeType:"lot"},{id:"windows"}]},
  {key:"exterior",   title:"Full Exterior Prep",        discount:0.12,
   desc:"Lawn mowing, full yard cleanup, pressure washing, gutter cleaning",
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"pressure",sizeType:"lot"},{id:"gutter",sizeType:"lot"}]},
  {key:"readytosell",title:"Ready To Sell",             discount:0.12,
   desc:"Full Exterior Prep + deep interior clean + professional photography",
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"pressure",sizeType:"lot"},{id:"gutter",sizeType:"lot"},{id:"deepclean",sizeType:"home"},{id:"photos",sizeType:"home"}]},
  {key:"fullservice",title:"Full Service Listing Prep", discount:0.15,
   desc:"Ready To Sell + drone photos + handyman repairs",
   items:[{id:"lawn",sizeType:"lot"},{id:"cleanup",sizeType:"lot"},{id:"pressure",sizeType:"lot"},{id:"gutter",sizeType:"lot"},{id:"deepclean",sizeType:"home"},{id:"photos",sizeType:"home"},{id:"drone"},{id:"handyman"}]},
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
    <div class="grid">
      <div class="stat" onclick="openPayments()"><b>Paid</b><h2 id="dashPaid">$0</h2><div class="statHint">Tap for payments</div></div>
      <div class="stat" onclick="openOwedJobs()"><b>Owed</b><h2 id="dashOwed">$0</h2><div class="statHint">Tap to collect</div></div>
      <div class="stat" onclick="openExpenses()"><b>Expenses</b><h2 id="dashExpenses">$0</h2><div class="statHint">Tap to review</div></div>
      <div class="stat" onclick="openProfitBreakdown()"><b>Profit</b><h2 id="dashProfit">$0</h2><div class="statHint">Tap for report</div></div>
    </div>
    <div class="grid">
      <div class="stat" onclick="openTodaySchedule()"><b>Today</b><h2 id="dashTodayJobs">0</h2><div class="statHint">Tap for today</div></div>
      <div class="stat" onclick="openUpcomingSchedule()"><b>Upcoming</b><h2 id="dashUpcomingJobs">0</h2><div class="statHint">Next 7 days</div></div>
      <div class="stat" onclick="showView('recurringView')"><b>Recurring</b><h2 id="dashRecurringJobs">0</h2><div class="statHint">Tap calendar</div></div>
      <div class="stat" onclick="showView('invoicesView')"><b>Invoices</b><h2 id="dashInvoiceCount">0</h2><div class="statHint">Owing</div></div>
    </div>
    <div class="box"><h2>Today's Schedule</h2><div id="todaySchedulePreview"></div></div>
    <div class="box"><h2>Alerts</h2><div id="notificationCenter"></div></div>
    <div class="box"><h2>Overdue / Unpaid</h2><div id="attentionList"></div></div>
    <div class="box"><h2>Next 7 Days</h2><div id="upcomingSchedulePreview"></div></div>
    <div class="box"><h2>Recent Jobs</h2><div id="recentJobs"></div></div>
    <div class="box noPrint"><h2>Quick Navigation</h2><div class="quickAdd">
      <button onclick="showView('bidsView')">Bids</button>
      <button onclick="openWorkflow()">Workflow</button>
      <button onclick="showView('customersView')">Customers</button>
      <button onclick="showView('partnersView')">Partners</button>
      <button onclick="openTodaySchedule()">Today</button>
      <button onclick="openUpcomingSchedule()">Upcoming</button>
      <button onclick="openOwedJobs()">Unpaid Jobs</button>
      <button onclick="openPaidJobs()">Paid Jobs</button>
      <button onclick="openPayments()">Payments</button>
      <button onclick="openProfitBreakdown()">Reports</button>
    </div></div>
    <div class="box noPrint"><h2>Quick Add</h2><div class="quickAdd">
      <button onclick="showView('customersView');toggleBox('customerFormBox',true)">Add Customer</button>
      <button onclick="showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
      <button onclick="showView('expensesView');toggleBox('expenseFormBox',true)">Add Expense</button>
      <button onclick="showView('recurringView');toggleBox('recurringFormBox',true)">Add Recurring</button>
    </div></div>
    <div class="box logoHero"><img src="logo.png" alt="5Cs Property Services LLC" onerror="this.style.display='none'"></div>
  </section>

  <section id="scheduleView" class="hidden">
    <div class="box"><h2>Schedule</h2><div class="quickAdd noPrint">
      <button onclick="openTodaySchedule()">Today</button>
      <button onclick="openUpcomingSchedule()">Next 7 Days</button>
      <button onclick="showAllSchedule()">All Scheduled</button>
      <button onclick="showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
    </div></div>
    <div class="box"><h2 id="scheduleTitle">Scheduled Jobs</h2><div id="scheduleList"></div></div>
  </section>

  <section id="workflowView" class="hidden">
    <div class="box"><h2>Workflow Board</h2><p class="small">Drag and drop cards between stages to update status.</p></div>
    <div class="box"><h2>Scheduled</h2><div id="workflowScheduled" class="workflowColumn" data-workflow-status="Scheduled"></div></div>
    <div class="box"><h2>In Progress</h2><div id="workflowInProgress" class="workflowColumn" data-workflow-status="In Progress"></div></div>
    <div class="box"><h2>Complete, Waiting Payment</h2><div id="workflowWaitingPayment" class="workflowColumn" data-workflow-status="Complete"></div></div>
    <div class="box"><h2>Completed and Paid</h2><div id="workflowCompletedPaid" class="workflowColumn" data-workflow-status="Complete"></div></div>
  </section>

  <section id="profitView" class="hidden">
    <div class="box">
      <h2>Profit Breakdown</h2>
      <div class="row noPrint" style="align-items:flex-end;gap:8px">
        <div style="flex:1"><div class="small" style="margin-bottom:4px">From</div><input id="profitFrom" type="date" style="margin:0"></div>
        <div style="flex:1"><div class="small" style="margin-bottom:4px">To</div><input id="profitTo" type="date" style="margin:0"></div>
        <button style="flex:0 0 auto;width:auto;padding:12px 18px" onclick="renderAll()">Filter</button>
        <button class="secondary" style="flex:0 0 auto;width:auto;padding:12px 18px" onclick="clearProfitFilter()">Clear</button>
      </div>
      <div class="grid" style="margin-top:12px">
        <div class="stat" onclick="openPayments()"><b>Collected</b><h2 id="profitPaid">$0</h2><div class="statHint">Tap for payments</div></div>
        <div class="stat" onclick="openExpenses()"><b>Expenses</b><h2 id="profitExpenses">$0</h2><div class="statHint">Tap for expenses</div></div>
        <div class="stat"><b>Profit</b><h2 id="profitNet">$0</h2></div>
        <div class="stat" onclick="openOwedJobs()"><b>Outstanding</b><h2 id="profitOutstanding">$0</h2><div class="statHint">Tap for owed</div></div>
      </div>
    </div>
    <div class="box"><h2>Last 6 Months</h2><div id="revenueChart"></div></div>
    <div class="box"><h2>Expense Breakdown</h2><div id="expenseBreakdown"></div></div>
    <div class="box"><h2>Top Customers By Paid Amount</h2><div id="topCustomers"></div></div>
  </section>

  <section id="customersView" class="hidden">
    <div class="searchBar noPrint"><input id="customerSearch" oninput="renderAll()" placeholder="Search customers..."></div>
    <div class="box noPrint"><button onclick="toggleBox('customerFormBox')">Add or Edit Customer</button></div>
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
    <div class="box noPrint"><button onclick="toggleBox('jobFormBox')">Add or Edit Job</button></div>
    <div id="jobFormBox" class="box hidden">
      <h2 id="jobFormTitle">Add Job</h2>
      <div class="formSection">Customer &amp; Description</div>
      <select id="jobCustomer"></select>
      <input id="jobTitle" placeholder="Job description">
      <div class="formSection">Schedule</div>
      <input id="jobDate" type="date">
      <input id="jobTime" type="time">
      <div class="formSection">Payment</div>
      <input id="jobAmount" type="number" placeholder="Amount charged">
      <input id="jobPaid" type="number" placeholder="Initial payment amount">
      <div class="formSection">Notes</div>
      <textarea id="jobNotes" placeholder="Job notes"></textarea>
      <button onclick="saveJob()" style="margin-top:12px">Save Job</button>
      <button class="secondary" onclick="resetJobForm()">Clear</button>
    </div>
    <div id="jobList"></div>
  </section>

  <section id="paymentsView" class="hidden"><div class="box"><h2>Payments</h2><div id="paymentsList"></div></div></section>

  <section id="recurringView" class="hidden">
    <div class="box noPrint"><button onclick="toggleBox('recurringFormBox')">Add or Edit Recurring Job</button></div>
    <div id="recurringFormBox" class="box hidden">
      <h2 id="recurringFormTitle">Add Recurring Job</h2>
      <select id="recurringCustomer"></select>
      <input id="recurringTitle" placeholder="Recurring job title">
      <input id="recurringNextDate" type="date">
      <input id="recurringTime" type="time">
      <input id="recurringAmount" type="number" placeholder="Amount">
      <select id="recurringFrequency">
        <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
      </select>
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
      <select id="bidCustomer"></select>
      <input id="bidTitle" placeholder="Bid title">
      <textarea id="bidNotes" placeholder="General notes"></textarea>
      <div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap">
        <button class="secondary" onclick="openPriceListPanel()">Build from Price List</button>
        <button class="secondary" onclick="openPackagesPanel()">Packages</button>
      </div>
      <div id="priceListPanel" class="box hidden" style="background:var(--s2);padding:12px">
        <h3 style="margin-bottom:8px">Select Services</h3>
        <div id="priceListContent"></div>
        <div style="margin-top:10px;padding:10px;background:var(--s1);border-radius:8px;border:1px solid #d0cbbf">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="plFirstCheck" style="width:20px;height:20px;margin:0;flex-shrink:0;accent-color:#087443" onchange="togglePlFirst()">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text)">First Visit / Neglected Property</div>
              <div class="small">Apply 1.6x multiplier to all selected services</div>
            </div>
          </label>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="green" onclick="addPriceListToBid()">Add to Bid</button>
          <button class="secondary" onclick="toggleBox('priceListPanel')">Cancel</button>
        </div>
      </div>

      <div id="packagesPanel" class="box hidden" style="background:var(--s2);padding:12px">
        <h3 style="margin-bottom:10px">Pre-Built Packages</h3>
        <div style="margin-bottom:12px">
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
        <div style="margin-top:12px;border-top:0.5px solid #d0cbbf;padding-top:12px">
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
        <button class="secondary" style="margin-top:8px;width:100%" onclick="toggleBox('packagesPanel')">Cancel</button>
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
    <div class="box"><h2>Saved Bids</h2><div id="bidsList"></div></div>
  </section>

  <section id="expensesView" class="hidden">
    <div class="box noPrint"><button onclick="toggleBox('expenseFormBox')">Add or Edit Expense</button></div>
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
    <div class="box noPrint"><button onclick="toggleBox('partnerFormBox')">Add or Edit Partner</button></div>
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
    <div class="box"><h2>More</h2><div class="moreGrid">
      <button onclick="showView('scheduleView');showAllSchedule()">Schedule</button>
      <button onclick="showView('bidsView')">Bids</button>
      <button onclick="showView('partnersView')">Partners</button>
      <button onclick="showView('recurringView')">Recurring</button>
      <button onclick="showView('expensesView')">Expenses</button>
      <button onclick="showView('invoicesView')">Invoices</button>
      <button onclick="showView('paymentsView')">Payments</button>
      <button onclick="openProfitBreakdown()">Reports</button>
      <button onclick="exportBackup()">Export Backup</button>
      <button class="secondary" onclick="logout()">Logout</button>
    </div></div>
    <div class="box"><h2>Settings</h2><p class="small">Offline saving is enabled. Changes sync automatically when back online.</p></div>
  </section>

  <section id="globalSearchView" class="hidden">
    <div class="box"><h2>Search Everything</h2><input id="globalSearchInput" placeholder="Search customers, jobs, payments, expenses, bids, partners..." oninput="runGlobalSearch()"></div>
    <div id="globalSearchResults"><p class="small" style="padding:0 4px">Start typing to search across all your data.</p></div>
  </section>
</section>`;

bottomNav.innerHTML=`
  <button id="navDashboard" onclick="showView('dashboardView')">${ICONS.home}<span>Home</span></button>
  <button id="navCustomers" onclick="showView('customersView')">${ICONS.customers}<span>Customers</span></button>
  <button id="navJobs" onclick="showView('jobsView')">${ICONS.jobs}<span>Jobs</span></button>
  <button id="navSchedule" onclick="openTodaySchedule()">${ICONS.schedule}<span>Schedule</span></button>
  <button id="navMore" onclick="showView('settingsView')">${ICONS.more}<span>More</span></button>`;

fabMenu.innerHTML=`
  <button onclick="toggleFab();showView('customersView');toggleBox('customerFormBox',true)">Add Customer</button>
  <button onclick="toggleFab();showView('jobsView');toggleBox('jobFormBox',true)">Add Job</button>
  <button onclick="toggleFab();showView('bidsView');toggleBox('bidFormBox',true)">Create Bid</button>
  <button onclick="toggleFab();showView('expensesView');toggleBox('expenseFormBox',true)">Add Expense</button>
  <button onclick="toggleFab();showView('recurringView');toggleBox('recurringFormBox',true)">Add Recurring</button>
  <button onclick="toggleFab();showView('scheduleView');showAllSchedule()">Schedule</button>`;

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
  setupWorkflowDragAndDrop();
}

const ALL_VIEWS=["dashboardView","workflowView","scheduleView","profitView","customersView","customerDetailView","jobsView","paymentsView","bidsView","recurringView","expensesView","invoicesView","invoiceView","partnersView","settingsView","globalSearchView"];

window.showView=function(id){
  ALL_VIEWS.forEach(v=>el(v).classList.add("hidden"));
  el(id).classList.remove("hidden");
  fabMenu.classList.add("hidden");
  document.querySelectorAll(".bottomNav button").forEach(b=>b.classList.remove("active"));
  if(id==="dashboardView") el("navDashboard").classList.add("active");
  if(id==="customersView"||id==="customerDetailView") el("navCustomers").classList.add("active");
  if(id==="jobsView") el("navJobs").classList.add("active");
  if(id==="scheduleView") el("navSchedule").classList.add("active");
  if(["settingsView","bidsView","expensesView","recurringView","profitView","paymentsView","workflowView","invoicesView","invoiceView","globalSearchView","partnersView"].includes(id)) el("navMore").classList.add("active");
  const titles={dashboardView:"Business dashboard",scheduleView:"Schedule",workflowView:"Workflow board",bidsView:"Bids",profitView:"Reports",customersView:"Customers",customerDetailView:"Customer detail",jobsView:"Jobs",paymentsView:"Payments",recurringView:"Recurring calendar",expensesView:"Expense ledger",invoicesView:"Invoice center",invoiceView:"Invoice preview",partnersView:"Referral Partners",settingsView:"More",globalSearchView:"Search"};
  document.getElementById("headerSub").innerText=titles[id]||"Business dashboard";
  window.scrollTo(0,0);
};

window.openPaidJobs=function(){showView("jobsView");el("jobStatusFilter").value="paid";el("jobSearch").value="";renderAll();};
window.openOwedJobs=function(){showView("jobsView");el("jobStatusFilter").value="unpaid";el("jobSearch").value="";renderAll();};
window.openTodaySchedule=function(){showView("scheduleView");renderSchedule("today");};
window.openUpcomingSchedule=function(){showView("scheduleView");renderSchedule("upcoming");};
window.showAllSchedule=function(){showView("scheduleView");renderSchedule("all");};
window.openExpenses=function(){showView("expensesView");};
window.openPayments=function(){showView("paymentsView");};
window.openProfitBreakdown=function(){showView("profitView");renderAll();};
window.openWorkflow=function(){showView("workflowView");renderWorkflowBoard();};
window.toggleBox=function(id,forceOpen){const b=el(id);if(forceOpen===true){b.classList.remove("hidden");return;}b.classList.toggle("hidden");};
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
function recurringStatus(r){const diff=Math.ceil((new Date((r.nextDate||today())+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000);if(diff<0)return{label:"Past Due",cls:"badgeRed"};if(diff===0)return{label:"Due Today",cls:"badgeGold"};if(diff<=7)return{label:"Upcoming",cls:"badgeBlue"};return{label:"Scheduled",cls:"badgeGreen"};}
function partnerFollowUpStatus(p){if(!p.followUpDate)return null;const diff=Math.ceil((new Date(p.followUpDate+"T00:00:00")-new Date(today()+"T00:00:00"))/86400000);if(diff<0)return{label:"Follow up now",cls:"badgeRed"};if(diff===0)return{label:"Follow up today",cls:"badgeGold"};if(diff<=7)return{label:"Follow up soon",cls:"badgeBlue"};return{label:"Scheduled",cls:"badgeGreen"};}

function refreshDropdowns(){
  const html='<option value="">Select customer</option>'+customers.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).map(c=>`<option value="${c.id}">${safe(c.name)}</option>`).join("");
  el("jobCustomer").innerHTML=html;el("recurringCustomer").innerHTML=html;el("invoiceCustomerSelect").innerHTML=html;
  if(el("bidCustomer"))el("bidCustomer").innerHTML=html;
}

window.saveCustomer=async function(){
  const data={name:el("customerName").value.trim(),email:el("customerEmail").value.trim(),phone:el("customerPhone").value.trim(),address:el("customerAddress").value.trim(),gateCode:el("customerGateCode").value.trim(),preferredContact:el("customerPreferredContact").value.trim(),serviceFrequency:el("customerServiceFrequency").value.trim(),propertyNotes:el("customerPropertyNotes").value.trim(),notes:el("customerNotes").value.trim()};
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
  showView("customersView");el("customerFormBox").classList.remove("hidden");
};
window.resetCustomerForm=function(){
  editingCustomerId=null;el("customerFormTitle").innerText="Add Customer";
  ["customerName","customerEmail","customerPhone","customerAddress","customerGateCode","customerPreferredContact","customerServiceFrequency","customerPropertyNotes","customerNotes"].forEach(id=>el(id).value="");
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
  const data={customerId:el("jobCustomer").value,title:el("jobTitle").value.trim(),date:el("jobDate").value||today(),time:el("jobTime").value||"",amount:Number(el("jobAmount").value||0),notes:el("jobNotes").value.trim(),status:ej?.status||"Scheduled"};
  if(!data.customerId||!data.title){alert("Select a customer and enter a job description");return;}
  if(editingJobId){await updateDoc(doc(db,"jobs",editingJobId),data);}
  else{data.paid=0;data.createdAt=new Date().toISOString();const jobRef=await addDoc(collection(db,"jobs"),data);const ip=Number(el("jobPaid").value||0);if(ip>0)await addDoc(collection(db,"payments"),{jobId:jobRef.id,customerId:data.customerId,amount:ip,date:data.date,notes:"Initial payment",createdAt:new Date().toISOString()});}
  resetJobForm();showToast("Job saved");
};
window.editJob=function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;editingJobId=id;el("jobFormTitle").innerText="Edit Job";
  el("jobCustomer").value=j.customerId||"";el("jobTitle").value=j.title||"";el("jobDate").value=j.date||today();
  el("jobTime").value=j.time||"";el("jobAmount").value=j.amount||0;el("jobPaid").value=jobPaidAmount(j);el("jobNotes").value=j.notes||"";
  showView("jobsView");el("jobFormBox").classList.remove("hidden");
};
window.resetJobForm=function(){
  editingJobId=null;el("jobFormTitle").innerText="Add Job";
  el("jobCustomer").value="";el("jobTitle").value="";el("jobDate").value=today();el("jobTime").value="";el("jobAmount").value="";el("jobPaid").value="";el("jobNotes").value="";
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
window.markPaid=async function(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;const bal=jobBalance(j);if(bal<=0){alert("This job is already paid.");return;}
  await addDoc(collection(db,"payments"),{jobId:j.id,customerId:j.customerId,amount:bal,date:today(),notes:"Marked paid",createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"jobs",id),{paid:Number(j.amount||0),status:"Complete"});showToast("Job marked as paid");renderAll();
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
  try{await updateDoc(doc(db,"jobs",id),{status});renderAll();if(activeCustomerDetailId&&!el("customerDetailView").classList.contains("hidden"))setTimeout(()=>viewCustomer(activeCustomerDetailId),400);}
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
  const j=jobs.find(x=>x.id===jobId);if(!j)return;const c=getCustomer(j.customerId);
  const msg=`Hi ${c?.name||"there"}, this is Craig with 5Cs Property Services. We recently completed ${j.title} for you and just wanted to say thank you for your business. If you were happy with the work, a quick Google review would mean a lot to us and helps other folks in McAlester find a trustworthy service. Takes less than a minute. We truly appreciate it!`;
  navigator.clipboard.writeText(msg).then(()=>showToast("Review request copied to clipboard")).catch(()=>alert(msg));
};

window.saveRecurring=async function(){
  const data={customerId:el("recurringCustomer").value,title:el("recurringTitle").value.trim(),nextDate:el("recurringNextDate").value||today(),time:el("recurringTime").value||"",amount:Number(el("recurringAmount").value||0),frequency:el("recurringFrequency").value};
  if(!data.customerId||!data.title){alert("Select a customer and enter recurring job title");return;}
  if(editingRecurringId){await updateDoc(doc(db,"recurring",editingRecurringId),data);}
  else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"recurring"),data);}
  resetRecurringForm();showToast("Recurring job saved");
};
window.editRecurring=function(id){
  const r=recurring.find(x=>x.id===id);if(!r)return;editingRecurringId=id;el("recurringFormTitle").innerText="Edit Recurring Job";
  el("recurringCustomer").value=r.customerId||"";el("recurringTitle").value=r.title||"";el("recurringNextDate").value=r.nextDate||today();
  el("recurringTime").value=r.time||"";el("recurringAmount").value=r.amount||0;el("recurringFrequency").value=r.frequency||"weekly";
  showView("recurringView");el("recurringFormBox").classList.remove("hidden");
};
window.resetRecurringForm=function(){
  editingRecurringId=null;el("recurringFormTitle").innerText="Add Recurring Job";
  el("recurringCustomer").value="";el("recurringTitle").value="";el("recurringNextDate").value=today();
  el("recurringTime").value="";el("recurringAmount").value="";el("recurringFrequency").value="weekly";
};
window.createJobFromRecurring=async function(id){
  const r=recurring.find(x=>x.id===id);if(!r)return;
  await addDoc(collection(db,"jobs"),{customerId:r.customerId,title:r.title,date:r.nextDate,time:r.time||"",amount:Number(r.amount||0),paid:0,notes:"Created from recurring job",status:"Scheduled",createdAt:new Date().toISOString()});
  let nd=r.nextDate||today();
  if(r.frequency==="weekly")nd=addDays(nd,7);
  if(r.frequency==="biweekly")nd=addDays(nd,14);
  if(r.frequency==="monthly"){const d=new Date(nd+"T00:00:00");d.setMonth(d.getMonth()+1);nd=d.toISOString().slice(0,10);}
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

window.openPriceListPanel=function(){renderPriceList();el("priceListPanel").classList.remove("hidden");};
function renderPriceList(){
  const cats=[...new Set(PRICE_LIST.map(s=>s.cat))];
  let html="";
  for(const cat of cats){
    html+=`<div class="formSection" style="margin-top:10px">${safe(cat)}</div>`;
    for(const svc of PRICE_LIST.filter(s=>s.cat===cat)){
      const ph=svc.hasSizes?"price varies by size":money(svc.flat)+(svc.unit?"/"+svc.unit:"");
      html+=`<div id="plRow_${svc.id}" style="padding:8px 0;border-bottom:0.5px solid #e8e4dc;border-radius:6px">
        <div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 6px" onclick="togglePlSvc('${svc.id}')">
          <div id="plBox_${svc.id}" style="width:22px;height:22px;flex-shrink:0;border-radius:5px;border:2px solid #ccc;background:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;transition:all 0.15s"></div>
          <div style="flex:1"><div style="font-size:14px;font-weight:500;color:var(--text)">${safe(svc.name)}</div><div class="small" id="plHint_${svc.id}">${ph}</div></div>
        </div>
        <input type="checkbox" id="plCheck_${svc.id}" style="display:none">
        <div id="plSize_${svc.id}" style="display:none;padding:4px 0 0 38px">
          ${svc.hasSizes?`<select id="plSel_${svc.id}" style="margin:0">${(svc.sizeType==="lot"?LOT_SIZES:HOME_SIZES).map(sz=>`<option value="${sz.key}">${sz.label} \u2014 ${money(svc.prices[sz.key])}</option>`).join("")}</select>`:svc.unit==="hr"?`<div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;color:var(--text);font-weight:500">Hours:</div><input id="plHrs_${svc.id}" type="number" min="0.5" step="0.5" value="1" style="width:80px;margin:0" oninput="updatePlHourly('${svc.id}')"><div style="font-size:13px;color:var(--text)" id="plHrsTotal_${svc.id}">${money(svc.flat)}</div></div>`:""}
        </div>
      </div>`;
    }
  }
  el("priceListContent").innerHTML=html;
  plFirstVisit=false;const fcb=el("plFirstCheck");if(fcb)fcb.checked=false;
}
window.togglePlSvc=function(id){
  const cb=el(`plCheck_${id}`);
  const checked=!cb.checked;
  cb.checked=checked;
  const box=el(`plBox_${id}`);
  const row=el(`plRow_${id}`);
  const sd=el(`plSize_${id}`);
  if(box){box.style.background=checked?"#087443":"#fff";box.style.borderColor=checked?"#087443":"#ccc";box.textContent=checked?"\u2713":"";}
  if(row){row.style.background=checked?"rgba(8,116,67,0.08)":"";}
  if(sd)sd.style.display=checked?"block":"none";
  updateCustomPkgTotal&&updateCustomPkgTotal();
};
window.updatePlHourly=function(id){
  const svc=PRICE_LIST.find(s=>s.id===id);if(!svc||svc.unit!=="hr")return;
  const hrs=Math.max(0.5,Number(el(`plHrs_${id}`)?.value||1));
  const price=plFirstVisit?Math.round(svc.flat*hrs*1.6):Math.round(svc.flat*hrs);
  const tot=el(`plHrsTotal_${id}`);if(tot)tot.textContent=money(price);
  const hint=el(`plHint_${id}`);if(hint)hint.textContent=`${money(price)} (${hrs} hr${hrs!==1?"s":""})`;
};
window.togglePlFirst=function(){
  plFirstVisit=el("plFirstCheck")?.checked||false;
  PRICE_LIST.forEach(svc=>{
    const hint=el(`plHint_${svc.id}`);if(!hint)return;
    if(svc.hasSizes){
      const sel=el(`plSel_${svc.id}`);const szKey=sel?.value||"sm";
      const base=svc.prices[szKey];
      hint.textContent=money(plFirstVisit?Math.round(base*1.6):base);
    }else{
      const p=plFirstVisit?Math.round(svc.flat*1.6):svc.flat;
      hint.textContent=money(p)+(svc.unit?"/"+svc.unit:"");
    }
  });
};
window.addPriceListToBid=function(){
  const selected=PRICE_LIST.filter(svc=>el(`plCheck_${svc.id}`)?.checked);
  if(!selected.length){alert("Select at least one service");return;}
  for(const svc of selected){
    let price,desc;
    if(svc.hasSizes){const szKey=el(`plSel_${svc.id}`)?.value||"sm";price=svc.prices[szKey];const sizes=svc.sizeType==="lot"?LOT_SIZES:HOME_SIZES;const sz=sizes.find(s=>s.key===szKey);desc=`${svc.name} (${sz?.label||""})`;}
    else if(svc.unit==="hr"){const hrs=Math.max(0.5,Number(el(`plHrs_${svc.id}`)?.value||1));price=Math.round(svc.flat*hrs);desc=`${svc.name} (${hrs} hr${hrs!==1?"s":""})`;}
    else{price=svc.flat;desc=svc.name;}
    if(plFirstVisit)price=Math.round(price*1.6);
    addBidItemRow(desc,1,price);
  }
  selected.forEach(svc=>{const cb=el(`plCheck_${svc.id}`);if(cb)cb.checked=false;const sd=el(`plSize_${svc.id}`);if(sd)sd.style.display="none";});
  plFirstVisit=false;const cb2=el("plFirstCheck");if(cb2)cb2.checked=false;el("priceListPanel").classList.add("hidden");
  showToast(`${selected.length} service${selected.length===1?"":"s"} added to bid`);
};

window.openPackagesPanel=function(){
  el("packagesPanel").classList.remove("hidden");
  renderPackages();
};

function renderPackages(){
  const lotSz=el("pkgLotSize")?.value||"sm";
  const homeSz=el("pkgHomeSize")?.value||"sm";
  el("packagesContent").innerHTML=PACKAGES.map(pkg=>{
    let total=0;
    const lines=pkg.items.map(item=>{
      const svc=PRICE_LIST.find(s=>s.id===item.id);if(!svc)return null;
      const price=svc.hasSizes?svc.prices[item.sizeType==="lot"?lotSz:homeSz]:svc.flat;
      total+=price;
      return{name:svc.name,price};
    }).filter(Boolean);
    const discounted=Math.round(total*(1-pkg.discount));
    const savings=total-discounted;
    return`<div class="box" style="background:var(--s1);margin-bottom:8px">
      <h3 style="margin-bottom:2px">${safe(pkg.title)}</h3>
      <p class="small" style="margin-bottom:8px">${safe(pkg.desc)}</p>
      <div style="background:var(--s2);border-radius:8px;padding:10px;margin-bottom:8px">
        ${lines.map(li=>`<div class="moneyLine"><span style="font-size:13px">${safe(li.name)}</span><span style="font-size:13px">${money(li.price)}</span></div>`).join("")}
        <div class="moneyLine" style="border-top:0.5px solid #d0cbbf;margin-top:6px;padding-top:6px">
          <span style="font-size:13px;color:#9a8f80">Regular Total</span>
          <span style="font-size:13px;color:#9a8f80;text-decoration:line-through">${money(total)}</span>
        </div>
        <div class="moneyLine">
          <span style="font-size:14px;font-weight:600;color:#087443">Package Price</span>
          <span style="font-size:18px;font-weight:700;color:#087443">${money(discounted)}</span>
        </div>
        <div class="moneyLine">
          <span style="font-size:12px;color:#b7791f">Customer saves</span>
          <span style="font-size:12px;font-weight:600;color:#b7791f">${money(savings)} (${Math.round(pkg.discount*100)}% off)</span>
        </div>
      </div>
      <button class="green" style="width:100%" onclick="addPackageToBid('${pkg.key}')">Add This Package to Bid</button>
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
    const price=svc.hasSizes?svc.prices[item.sizeType==="lot"?lotSz:homeSz]:svc.flat;
    total+=price;
    return{name:svc.name,price};
  }).filter(Boolean);
  const savings=Math.round(total*pkg.discount);
  lines.forEach(li=>addBidItemRow(li.name,1,li.price));
  addBidItemRow(`${pkg.title} Package Discount (${Math.round(pkg.discount*100)}% off)`,1,-savings);
  el("packagesPanel").classList.add("hidden");
  showToast(`${pkg.title} added to bid`);
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
          ${svc.hasSizes?`<select id="cpSel_${svc.id}" style="margin:0;font-size:12px" onchange="updateCustomPkgTotal()">${(svc.sizeType==="lot"?LOT_SIZES:HOME_SIZES).map(sz=>`<option value="${sz.key}">${sz.label} \u2014 ${money(svc.prices[sz.key])}</option>`).join("")}</select>`:svc.unit==="hr"?`<div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;color:var(--text);font-weight:500">Hours:</div><input id="cpHrs_${svc.id}" type="number" min="0.5" step="0.5" value="1" style="width:80px;margin:0;font-size:12px" oninput="updateCustomPkgTotal()"></div>`:""}
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
  el("packagesPanel").classList.add("hidden");
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
  el("bidCustomer").value=b.customerId||"";el("bidTitle").value=b.title||"";el("bidNotes").value=b.notes||"";
  if(el("bidDiscountLabel"))el("bidDiscountLabel").value=b.discountLabel||"";
  if(el("bidDiscountType"))el("bidDiscountType").value=b.discountType||"amount";
  if(el("bidDiscountValue"))el("bidDiscountValue").value=b.discountValue||"";
  el("bidItems").innerHTML="";
  (b.items||[]).forEach(i=>addBidItemRow(i.desc||"",i.qty||"",i.price||""));updateBidTotal();
};
window.resetBidForm=function(){editingBidId=null;el("bidCustomer").value="";el("bidTitle").value="";el("bidNotes").value="";if(el("bidDiscountLabel"))el("bidDiscountLabel").value="";if(el("bidDiscountType"))el("bidDiscountType").value="amount";if(el("bidDiscountValue"))el("bidDiscountValue").value="";el("bidItems").innerHTML="";if(el("bidSubtotal"))el("bidSubtotal").innerText="$0.00";el("bidTotal").innerText="$0.00";if(el("bidDiscountLine"))el("bidDiscountLine").style.display="none";el("priceListPanel").classList.add("hidden");};
window.deleteBid=async function(id){if(!confirm("Delete this bid?"))return;try{await deleteDoc(doc(db,"bids",id));}catch(e){alert("Delete bid failed: "+e.message);}};
window.convertBidToJob=async function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;if(!confirm("Convert this bid to a job?"))return;
  await addDoc(collection(db,"jobs"),{customerId:b.customerId,title:b.title,date:today(),time:"",amount:Number(b.total||0),paid:0,notes:(b.notes||"")+"\n\nCreated from bid.",status:"Scheduled",createdAt:new Date().toISOString()});
  await updateDoc(doc(db,"bids",id),{status:"Approved",convertedAt:new Date().toISOString()});showToast("Bid converted to job");
};
window.printBid=function(id){
  const b=bids.find(x=>x.id===id);if(!b)return;const c=getCustomer(b.customerId);
  el("invoiceArea").innerHTML=`<div class="invoice"><div class="invoiceTop"><div><img class="invoiceLogo" src="logo.png" alt="${COMPANY.name}" onerror="this.style.display='none'"><h2>${COMPANY.name}</h2><p>${COMPANY.tagline}</p><p>${COMPANY.phone}</p><p>${COMPANY.email}</p></div><div><h1>Proposal</h1><p><b>${safe(b.title)}</b></p><p>Date: ${dateLabel(today())}</p><span class="badge ${b.status==="Approved"?"badgeGreen":"badgeBlue"}">${safe(b.status||"Pending")}</span></div></div>${c?`<h3>Prepared For</h3><p><b>${safe(c.name)}</b><br>${safe(c.email)}<br>${safe(c.phone)}<br>${safe(c.address)}</p>`:""}<table><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>${(b.items||[]).map(i=>`<tr><td>${safe(i.desc)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join("")}</table>${b.discountAmount>0?`<p style="text-align:right;color:#9a8f80;margin-bottom:2px">Subtotal: ${money(b.subtotal||b.total)}</p><p style="text-align:right;color:#b7791f;margin-bottom:2px">${safe(b.discountLabel||"Discount")}: -${money(b.discountAmount)}</p>`:""}<p class="invoiceTotal">Proposal Total: ${money(b.total)}</p>${b.notes?`<p>${safe(b.notes)}</p>`:""}<p class="small" style="margin-top:16px">This proposal is valid for 30 days from the date above.</p><button class="noPrint" onclick="window.print()">Print or Save PDF</button></div>`;
  showView("invoiceView");
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
  el("invoiceArea").innerHTML=`<div class="invoice"><div class="invoiceTop"><div><img class="invoiceLogo" src="logo.png" alt="${COMPANY.name}" onerror="this.style.display='none'"><h2>${COMPANY.name}</h2><p>${COMPANY.tagline}</p><p>${COMPANY.phone}</p><p>${COMPANY.email}</p></div><div><h1>Invoice</h1><p><b>${invNum}</b></p><p>Issue Date: ${today()}</p><p>Due Date: ${safe(dueDate)}</p>${balance<=0?`<span class="badge badgeGreen">Paid In Full</span>`:""}${balance>0&&isPastDue(dueDate)?`<span class="badge badgeRed">Overdue</span>`:""}</div></div><h3>Bill To</h3><p><b>${safe(c.name)}</b><br>${safe(c.email)}<br>${safe(c.phone)}<br>${safe(c.address)}</p><table><tr><th>Date</th><th>Description</th><th>Amount</th><th>Paid</th><th>Balance</th></tr>${custJobs.map(j=>`<tr><td>${safe(j.date)}</td><td>${safe(j.title)}</td><td>${money(j.amount)}</td><td>${money(jobPaidAmount(j))}</td><td>${money(jobBalance(j))}</td></tr>`).join("")}</table><p class="invoiceTotal">Total: ${money(total)}</p>${discAmt>0?`<p class="invoiceTotal" style="color:#b7791f">${safe(discLabel)}: -${money(discAmt)}</p><p class="invoiceTotal">After Discount: ${money(total-discAmt)}</p>`:""}<p class="invoiceTotal">Paid: ${money(paid)}</p><p class="invoiceTotal">Balance Due: ${money(balance)}</p>${custPmts.length?`<h3>Payment History</h3><table><tr><th>Date</th><th>Amount</th><th>Note</th></tr>${custPmts.map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<tr><td>${safe(p.date)}</td><td>${money(p.amount)}</td><td>${safe(p.notes||job?.title||"")}</td></tr>`;}).join("")}</table>`:""}<p>${safe(invNotes)}</p><button class="noPrint" onclick="window.print()">Print or Save PDF</button><button class="noPrint secondary" onclick="emailInvoice('${customerId}')">Email Invoice</button></div>`;
  showView("invoiceView");
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
      <div class="box" style="background:var(--s2)"><h3>Property Info</h3>
        ${c.gateCode?`<div style="margin-top:6px"><div class="small">Gate / Access</div><div>${safe(c.gateCode)}</div></div>`:""}
        ${c.preferredContact?`<div style="margin-top:6px"><div class="small">Preferred Contact</div><div>${safe(c.preferredContact)}</div></div>`:""}
        ${c.propertyNotes?`<div style="margin-top:6px"><div class="small">Property Notes</div><div>${safe(c.propertyNotes)}</div></div>`:""}
        ${c.notes?`<div style="margin-top:6px"><div class="small">General Notes</div><div>${safe(c.notes)}</div></div>`:""}
        ${!c.gateCode&&!c.preferredContact&&!c.propertyNotes&&!c.notes?`<p class="small">No property info saved.</p>`:""}
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
    <div class="box"><h3>Bids</h3>${custBids.length?custBids.map(b=>`<div class="jobCard"><div class="customerHeader"><div><h3>${safe(b.title)}</h3><div class="small">${dateLabel(b.createdAt?.slice(0,10))}</div></div><span class="badge badgeBlue">${safe(b.status||"Pending")}</span></div><div class="box" style="background:var(--s2)">${(b.items||[]).map(i=>`<div class="moneyLine"><span>${safe(i.desc)} &bull; Qty ${i.qty}</span><b>${money(i.qty*i.price)}</b></div>`).join("")}</div><div class="moneyLine"><span style="font-weight:600">Bid Total</span><b style="color:var(--green)">${money(b.total)}</b></div><div class="row"><button class="secondary" onclick="editBid('${b.id}')">Edit</button><button onclick="printBid('${b.id}')">Print Proposal</button><button class="green" onclick="convertBidToJob('${b.id}')">Convert to Job</button><button class="red" onclick="deleteBid('${b.id}')">Delete</button></div></div>`).join(""):"<p class='small'>No bids saved for this customer yet.</p>"}</div>
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
  el("scheduleList").innerHTML=list.length?list.map(scheduleCardHtml).join(""):"<p class='small'>No scheduled jobs found.</p>";
}
window.renderSchedule=renderSchedule;

function paymentLineHtml(p){
  const job=jobs.find(j=>j.id===p.jobId);
  return `<div class="paymentLine"><b>${money(p.amount)}</b><div class="small">${safe(p.date)} &bull; ${safe(job?.title||"Payment")}</div>${p.notes?`<div class="small">${safe(p.notes)}</div>`:""}<button class="red" style="margin-top:6px" onclick="deletePayment('${p.id}')">Delete Payment</button></div>`;
}
function jobCardHtml(j){
  const bal=jobBalance(j),list=jobPayments(j.id),ol=overdueLabel(j.date);
  const isComplete=j.status==="Complete",isPaid=paymentStatus(j)==="Paid";
  return `<div class="jobCard"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px"><div><h3>${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)} ${j.time?"at "+timeLabel(j.time):""}</div></div>${bal>0?`<div style="text-align:right"><div style="font-size:18px;font-weight:700;color:var(--gold);letter-spacing:-0.02em">${money(bal)}</div><div class="small">balance</div></div>`:`<div style="font-size:18px;font-weight:700;color:var(--green)">Paid</div>`}</div><div style="margin-bottom:6px">${paymentBadge(j)}${workflowBadge(j)}${ol&&bal>0?`<span class="badge badgeRed">${safe(ol)}</span>`:""}</div><div class="moneyLine"><span>Charged</span><b>${money(j.amount)}</b></div><div class="moneyLine"><span>Paid</span><b>${money(jobPaidAmount(j))}</b></div>${j.notes?`<p style="margin-top:8px;font-size:13px">${safe(j.notes)}</p>`:""}<details><summary>Payment history (${list.length})</summary>${list.length?list.map(paymentLineHtml).join(""):"<p class='small'>No payment records yet.</p>"}</details><div class="row"><button class="blue" onclick="setJobStatus('${j.id}','Scheduled')">Scheduled</button><button class="gold" onclick="setJobStatus('${j.id}','In Progress')">In Progress</button><button class="green" onclick="setJobStatus('${j.id}','Complete')">Complete</button><button onclick="markPaid('${j.id}')">Mark Paid</button><button class="green" onclick="addPayment('${j.id}')">Add Payment</button><button class="gold" onclick="copyReminder('${j.id}')">Reminder</button>${isComplete&&isPaid?`<button class="blue" onclick="requestReview('${j.id}')">Request Review</button>`:""}<button onclick="makeJobRecurring('${j.id}')">Make Recurring</button><button class="secondary" onclick="editJob('${j.id}')">Edit</button><button class="red" onclick="deleteItem('jobs','${j.id}')">Delete</button></div></div>`;
}
function recurringCardHtml(r){
  const s=recurringStatus(r);
  return `<div class="box"><div class="customerHeader"><div><h3>${safe(r.title)}</h3><div class="small">${safe(getCustomerName(r.customerId))}</div></div><span class="badge ${s.cls}">${s.label}</span></div><div class="moneyLine"><span>Next Date</span><b>${dateLabel(r.nextDate)} ${r.time?"at "+timeLabel(r.time):""}</b></div><div class="moneyLine"><span>Frequency</span><b>${safe(r.frequency)}</b></div><div class="moneyLine"><span>Amount</span><b style="color:var(--green)">${money(r.amount)}</b></div><div class="row"><button class="green" onclick="createJobFromRecurring('${r.id}')">Create Job</button><button class="secondary" onclick="editRecurring('${r.id}')">Edit</button><button class="red" onclick="deleteItem('recurring','${r.id}')">Delete</button></div></div>`;
}
function expenseCardHtml(e){
  return `<div class="box"><div class="customerHeader"><div><h3>${safe(e.category)}</h3><div class="small">${dateLabel(e.date)}</div></div><b style="font-size:18px;color:var(--red-text)">${money(e.amount)}</b></div>${e.notes?`<p>${safe(e.notes)}</p>`:""}<div class="row"><button class="secondary" onclick="editExpense('${e.id}')">Edit</button><button class="red" onclick="deleteItem('expenses','${e.id}')">Delete</button></div></div>`;
}
function scheduleCardHtml(j){
  const c=getCustomer(j.customerId),phone=cleanPhone(c?.phone);
  return `<div class="box"><div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">${avatarHtml(getCustomerName(j.customerId),"sm")}<div><h3 style="margin:0">${safe(j.title)}</h3><div><b style="color:var(--green);font-size:13px">${dateLabel(j.date)} ${j.time?"at "+timeLabel(j.time):""}</b></div></div></div><div class="small">${safe(getCustomerName(j.customerId))}</div>${c?.address?`<div class="small">${safe(c.address)}</div>`:""}${c?.gateCode?`<div class="small">Gate: ${safe(c.gateCode)}</div>`:""}${c?.propertyNotes?`<div class="small">${safe(c.propertyNotes)}</div>`:""}<div style="margin:6px 0">${paymentBadge(j)}${workflowBadge(j)}</div><div class="row">${phone?`<a class="actionLink" href="tel:${phone}">Call</a>`:""}${phone?`<a class="actionLink" href="sms:${phone}">Text</a>`:""}<button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="editJob('${j.id}')">Edit Job</button></div></div>`;
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
  const allExp=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalOwed=jobs.reduce((s,j)=>s+jobBalance(j),0);
  const fPaid=fPmts.reduce((s,p)=>s+Number(p.amount||0),0);
  const fExpTotal=fExps.reduce((s,e)=>s+Number(e.amount||0),0);
  const todayJobs=jobs.filter(j=>j.date===today());
  const upcoming=jobs.filter(j=>j.date>today()&&j.date<=addDays(today(),7));
  const custWithBal=customers.filter(c=>customerTotals(c.id).owed>0);

  el("dashPaid").innerText=money(allPaid);el("dashOwed").innerText=money(totalOwed);
  el("dashExpenses").innerText=money(allExp);el("dashProfit").innerText=money(allPaid-allExp);
  el("dashTodayJobs").innerText=todayJobs.length;el("dashUpcomingJobs").innerText=upcoming.length;
  el("dashRecurringJobs").innerText=recurring.length;el("dashInvoiceCount").innerText=custWithBal.length;
  el("profitPaid").innerText=money(fPaid);el("profitExpenses").innerText=money(fExpTotal);
  el("profitNet").innerText=money(fPaid-fExpTotal);el("profitOutstanding").innerText=money(totalOwed);

  renderRevenueChart();

  const expGrp={};fExps.forEach(e=>{const k=e.category||"Other";expGrp[k]=(expGrp[k]||0)+Number(e.amount||0);});
  el("expenseBreakdown").innerHTML=Object.entries(expGrp).sort((a,b)=>b[1]-a[1]).map(([cat,t])=>`<div class="moneyLine"><span>${safe(cat)}</span><b>${money(t)}</b></div>`).join("")||"<p class='small'>No expenses yet.</p>";
  el("topCustomers").innerHTML=customers.map(c=>({customer:c,total:customerTotals(c.id)})).sort((a,b)=>b.total.paid-a.total.paid).slice(0,5).map(x=>`<div class="box" style="background:var(--s2)"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(x.customer.name,"sm")}<div style="flex:1"><h3 style="margin:0">${safe(x.customer.name)}</h3><div class="small">Paid: ${money(x.total.paid)} &bull; Owed: ${money(x.total.owed)}</div></div><button style="width:auto;padding:8px 12px;font-size:13px" onclick="viewCustomer('${x.customer.id}')">View</button></div></div>`).join("")||"<p class='small'>No customer payments yet.</p>";

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

  el("todaySchedulePreview").innerHTML=todayJobs.length?todayJobs.slice(0,5).sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(scheduleCardHtml).join(""):"<p class='small'>No jobs scheduled today.</p>";
  el("upcomingSchedulePreview").innerHTML=upcoming.length?upcoming.slice(0,5).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(scheduleCardHtml).join(""):"<p class='small'>No upcoming jobs in the next 7 days.</p>";

  el("attentionList").innerHTML=unpaidJobs.length?unpaidJobs.slice().sort((a,b)=>jobBalance(b)-jobBalance(a)).slice(0,5).map(j=>{const ol=overdueLabel(j.date);return`<div class="box" style="background:var(--s2)"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h3>${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))}</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:700;color:var(--gold)">${money(jobBalance(j))}</div>${ol?`<div class="small" style="color:var(--red-text)">${safe(ol)}</div>`:""}</div></div><div style="margin:6px 0">${paymentBadge(j)}${workflowBadge(j)}</div><div class="row"><button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="makeInvoice('${j.customerId}')">Invoice</button><button class="green" onclick="addPayment('${j.id}')">Add Payment</button></div></div>`;}).join(""):"<p class='small'>No unpaid jobs right now.</p>";

  el("recentJobs").innerHTML=jobs.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5).map(j=>`<div class="box" style="background:var(--s2)"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(getCustomerName(j.customerId),"sm")}<div style="flex:1"><h3 style="margin:0">${safe(j.title)}</h3><div class="small">${safe(getCustomerName(j.customerId))} &bull; ${dateLabel(j.date)}</div></div>${paymentBadge(j)}</div><div class="row" style="margin-top:8px"><button onclick="viewCustomer('${j.customerId}')">Customer</button><button onclick="editJob('${j.id}')">Edit</button></div></div>`).join("")||"<p class='small'>No jobs yet.</p>";

  const cq=el("customerSearch").value.trim().toLowerCase();
  el("customerList").innerHTML=customers.slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).filter(c=>{const t=`${c.name||""} ${c.email||""} ${c.phone||""} ${c.address||""} ${c.gateCode||""} ${c.preferredContact||""} ${c.serviceFrequency||""} ${c.propertyNotes||""} ${c.notes||""} ${jobs.filter(j=>j.customerId===c.id).map(j=>j.title).join(" ")}`.toLowerCase();return !cq||t.includes(cq);}).map(c=>{const totals=customerTotals(c.id),phone=cleanPhone(c.phone);return`<div class="customerCard"><div class="customerHeader"><div style="display:flex;align-items:center;gap:12px">${avatarHtml(c.name,"md")}<div><h3 style="margin:0">${safe(c.name)}</h3><div class="small">${safe(c.phone)}</div><div class="small">${safe(c.address)}</div>${c.serviceFrequency?`<div class="small">${safe(c.serviceFrequency)}</div>`:""}</div></div><span class="badge ${totals.owed>0?"badgeRed":"badgeGreen"}">${totals.owed>0?"Owes":"Paid Up"}</span></div><div class="moneyLine"><span>Paid</span><b style="color:var(--green)">${money(totals.paid)}</b></div><div class="moneyLine"><span>Owed</span><b style="color:${totals.owed>0?"var(--red-text)":"var(--text)"}">${money(totals.owed)}</b></div><div class="row"><button onclick="viewCustomer('${c.id}')">View</button><button onclick="makeInvoice('${c.id}')">Invoice</button>${phone?`<a class="actionLink" href="tel:${phone}">Call</a>`:""}${phone?`<a class="actionLink" href="sms:${phone}">Text</a>`:""}<button class="secondary" onclick="editCustomer('${c.id}')">Edit</button><button class="red" onclick="deleteCustomer('${c.id}')">Delete</button></div></div>`;}).join("")||"<p class='small'>No customers found.</p>";

  const jq=el("jobSearch").value.trim().toLowerCase(),sf=el("jobStatusFilter").value;
  el("jobList").innerHTML=jobs.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).filter(j=>{const ps=paymentStatus(j).toLowerCase(),ws=String(j.status||"Scheduled").toLowerCase(),t=`${j.title||""} ${j.notes||""} ${getCustomerName(j.customerId)}`.toLowerCase();let ok=sf==="all"||ps===sf||ws===sf;if(sf==="today")ok=j.date===today();if(sf==="upcoming")ok=j.date>today()&&j.date<=addDays(today(),7);return ok&&(!jq||t.includes(jq));}).map(jobCardHtml).join("")||"<p class='small'>No jobs found.</p>";

  el("paymentsList").innerHTML=payments.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(p=>{const job=jobs.find(j=>j.id===p.jobId);return`<div class="box" style="background:var(--s2)"><div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:18px;color:var(--green)">${money(p.amount)}</b><div class="small">${safe(getCustomerName(p.customerId))}</div><div class="small">${dateLabel(p.date)} &bull; ${safe(job?.title||"Payment")}</div>${p.notes?`<div class="small">${safe(p.notes)}</div>`:""}</div><button class="red" style="width:auto;padding:8px 12px;font-size:13px" onclick="deletePayment('${p.id}')">Delete</button></div></div>`;}).join("")||"<p class='small'>No payments yet.</p>";

  el("recurringCalendar").innerHTML=recurring.slice().sort((a,b)=>(a.nextDate||"").localeCompare(b.nextDate||"")).map(r=>{const s=recurringStatus(r);return`<div class="moneyLine"><span style="font-size:13px">${dateLabel(r.nextDate)} ${r.time?timeLabel(r.time):""} &bull; ${safe(r.title)} &bull; ${safe(getCustomerName(r.customerId))}</span><span class="badge ${s.cls}">${s.label}</span></div>`;}).join("")||"<p class='small'>No recurring jobs scheduled.</p>";
  el("recurringList").innerHTML=recurring.slice().sort((a,b)=>(a.nextDate||"").localeCompare(b.nextDate||"")).map(recurringCardHtml).join("")||"<p class='small'>No recurring jobs yet.</p>";

  el("bidsList").innerHTML=bids.length?bids.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(b=>`<div class="jobCard"><div class="customerHeader"><div><h3>${safe(b.title)}</h3><div class="small">${safe(getCustomerName(b.customerId))} &bull; ${dateLabel(b.createdAt?.slice(0,10))}</div></div><span class="badge ${b.status==="Approved"?"badgeGreen":"badgeBlue"}">${safe(b.status||"Pending")}</span></div><div class="box" style="background:var(--s2)">${(b.items||[]).map(i=>`<div class="moneyLine"><span>${safe(i.desc)} &bull; Qty ${i.qty}</span><b>${money(i.qty*i.price)}</b></div>`).join("")}</div><div class="moneyLine"><span style="font-weight:600">Bid Total</span><b style="font-size:18px;color:var(--green)">${money(b.total)}</b></div>${b.notes?`<p>${safe(b.notes)}</p>`:""}<div class="row"><button class="secondary" onclick="editBid('${b.id}')">Edit Bid</button><button onclick="printBid('${b.id}')">Print Proposal</button><button class="green" onclick="convertBidToJob('${b.id}')">Convert to Job</button><button class="red" onclick="deleteBid('${b.id}')">Delete</button></div></div>`).join(""):"<p class='small'>No bids saved yet.</p>";

  el("expenseList").innerHTML=expenses.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(expenseCardHtml).join("")||"<p class='small'>No expenses yet.</p>";
  el("invoiceCustomerList").innerHTML=custWithBal.length?custWithBal.map(c=>{const t=customerTotals(c.id);return`<div class="box" style="background:var(--s2)"><div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">${avatarHtml(c.name,"sm")}<div style="flex:1"><h3 style="margin:0">${safe(c.name)}</h3><div class="small">${safe(c.email)}</div></div><b style="font-size:20px;color:var(--gold)">${money(t.owed)}</b></div><div class="row"><button onclick="makeInvoice('${c.id}')">Create Invoice</button><button onclick="emailInvoice('${c.id}')">Email Invoice</button></div></div>`;}).join(""):"<p class='small'>No unpaid balances right now.</p>";

  el("partnerList").innerHTML=partners.length?partners.slice().sort((a,b)=>{const fa=partnerFollowUpStatus(a),fb=partnerFollowUpStatus(b);const order={badgeRed:0,badgeGold:1,badgeBlue:2,badgeGreen:3};const oa=fa?order[fa.cls]??4:4,ob=fb?order[fb.cls]??4:4;return oa-ob;}).map(partnerCardHtml).join(""):"<p class='small'>No partners saved yet. Add real estate agents and other referral contacts here.</p>";
}
window.renderAll=renderAll;
