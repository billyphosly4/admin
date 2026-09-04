// ==========================================================================
// L.e.a. Ecolene Group Company Limited — Admin Management App Logic
// Firebase Web v10 Modular SDK Client Implementation
// ==========================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Global state
let app, auth, db;
let unsubscribeInvoices = null;
let unsubscribeTenders = null;
let currentInvoiceData = null;

// Initialize App Configuration
async function initFirebase() {
  try {
    let firebaseConfig;
    try {
      const res = await fetch('/api/config');
      firebaseConfig = await res.json();
    } catch (e) {
      // Fallback Config
      firebaseConfig = {
        apiKey: "AIzaSyDZ2EvkIQDpa2dVbU2Pd0sJiLPK-ScnDu4",
        authDomain: "admin-lea.firebaseapp.com",
        projectId: "admin-lea",
        storageBucket: "admin-lea.firebasestorage.app",
        messagingSenderId: "970310201053",
        appId: "1:970310201053:web:0c0e33ceab188f9f7df534",
        measurementId: "G-N21JQPF0Z2"
      };
    }

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    setupAuthListeners();
    setupUIEvents();

  } catch (error) {
    console.error("Firebase Initialization Error:", error);
  }
}

// ── 1. FIREBASE AUTHENTICATION & ACCESS CONTROL ─────────────────────────────
function setupAuthListeners() {
  onAuthStateChanged(auth, (user) => {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const userInfoBadge = document.getElementById('userInfoBadge');
    const userEmailTxt = document.getElementById('userEmailTxt');
    const btnLogout = document.getElementById('btnLogout');

    if (user) {
      // Authorized Administrator
      authSection.style.display = 'none';
      dashboardSection.style.display = 'block';
      userInfoBadge.style.display = 'inline-flex';
      btnLogout.style.display = 'inline-flex';
      userEmailTxt.textContent = user.email || 'Admin User';

      // Start real-time Firestore sync
      subscribeInvoices();
      subscribeTenders();

    } else {
      // Unauthorized / Signed Out
      authSection.style.display = 'flex';
      dashboardSection.style.display = 'none';
      userInfoBadge.style.display = 'none';
      btnLogout.style.display = 'none';

      // Clean up Firestore subscriptions
      if (unsubscribeInvoices) unsubscribeInvoices();
      if (unsubscribeTenders) unsubscribeTenders();
    }
  });
}

// ── 2. UI & TAB NAVIGATION HANDLERS ─────────────────────────────────────────
function setupUIEvents() {
  // Login Form Submit
  const authForm = document.getElementById('authForm');
  const authAlert = document.getElementById('authAlert');
  const authAlertMsg = document.getElementById('authAlertMsg');

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert.style.display = 'none';

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      authForm.reset();
    } catch (error) {
      authAlert.style.display = 'flex';
      authAlertMsg.textContent = formatAuthError(error.code);
    }
  });

  // Logout Action
  document.getElementById('btnLogout').addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Signout Error:", error);
    }
  });

  // Tab Switcher
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.getAttribute('data-tab'));
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Invoice Form Submit
  document.getElementById('invoiceForm').addEventListener('submit', handleCreateInvoice);

  // Tender Form Submit
  document.getElementById('tenderForm').addEventListener('submit', handleCreateTender);

  // Modal Controls
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnPrintInvoice').addEventListener('click', () => window.print());

  // Set copyright year
  document.getElementById('copyrightYear').textContent = new Date().getFullYear();
}

function formatAuthError(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address format.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect admin email or password.';
    case 'auth/too-many-requests': return 'Too many failed login attempts. Try again later.';
    default: return 'Authentication failed. Check your connection.';
  }
}

// ── 3. CLIENT INVOICE GENERATION & ARCHIVAL MODULE ──────────────────────────
async function handleCreateInvoice(e) {
  e.preventDefault();

  const clientName = document.getElementById('clientName').value.trim();
  const clientEmail = document.getElementById('clientEmail').value.trim();
  const service = document.getElementById('serviceSelect').value;
  const baseAmount = parseFloat(document.getElementById('baseAmount').value);

  if (!clientName || !clientEmail || !service || isNaN(baseAmount) || baseAmount <= 0) {
    alert("Please fill in all invoice fields with valid values.");
    return;
  }

  // Calculate 16% VAT and totals
  const subtotal = baseAmount;
  const vat = subtotal * 0.16;
  const grandTotal = subtotal + vat;
  const invoiceNum = generateInvoiceNum();

  const invoiceData = {
    invoiceNum,
    clientName,
    clientEmail,
    service,
    subtotal,
    vat,
    grandTotal,
    status: 'Unpaid',
    createdAt: serverTimestamp()
  };

  try {
    // Save to Firestore 'invoices' collection
    await addDoc(collection(db, 'invoices'), invoiceData);
    
    // Show instant itemized invoice breakdown preview
    showInvoiceModal({
      ...invoiceData,
      formattedDate: new Date().toLocaleDateString('en-GB')
    });

    document.getElementById('invoiceForm').reset();
  } catch (error) {
    console.error("Error saving invoice:", error);
    alert("Saved invoice locally. (Firestore permission error: Check security rules or credentials).");
    showInvoiceModal({
      ...invoiceData,
      formattedDate: new Date().toLocaleDateString('en-GB')
    });
  }
}

function generateInvoiceNum() {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `LEA-INV-${randomSuffix}`;
}

function subscribeInvoices() {
  const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
  
  unsubscribeInvoices = onSnapshot(q, (snapshot) => {
    const invoices = [];
    snapshot.forEach((docSnap) => {
      invoices.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderInvoicesTable(invoices);
    updateInvoiceStats(invoices);
  }, (err) => {
    console.warn("Firestore snapshot notice:", err.message);
  });
}

function renderInvoicesTable(invoices) {
  const tbody = document.getElementById('invoicesTbody');
  const countBadge = document.getElementById('invoiceCountBadge');

  countBadge.textContent = `${invoices.length} Saved`;

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #64748b; padding: 2rem;">
          <i class="fa-solid fa-folder-open" style="font-size: 1.8rem; margin-bottom: 0.5rem; display: block;"></i>
          No archived invoices found. Use the generator form to create one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const isPaid = inv.status === 'Paid';
    const statusBadgeClass = isPaid ? 'badge-success' : 'badge-warning';

    return `
      <tr>
        <td><strong>${inv.invoiceNum}</strong></td>
        <td>
          <div style="font-weight: 700;">${escapeHtml(inv.clientName)}</div>
          <div style="font-size: 0.78rem; color: #64748b;">${escapeHtml(inv.clientEmail)}</div>
        </td>
        <td style="max-width: 200px; font-size: 0.82rem;">${escapeHtml(inv.service)}</td>
        <td><strong>KES ${formatCurrency(inv.grandTotal)}</strong></td>
        <td>
          <span class="badge ${statusBadgeClass}">${inv.status}</span>
        </td>
        <td>
          <div class="action-btn-group">
            <button class="btn-icon" onclick="window.viewInvoiceModal('${inv.id}')" title="View Breakdown">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-icon" onclick="window.toggleInvoiceStatus('${inv.id}', '${inv.status}')" title="Toggle Status">
              <i class="fa-solid fa-sync"></i>
            </button>
            <button class="btn-icon danger" onclick="window.deleteInvoice('${inv.id}')" title="Delete Invoice">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Store globally for quick modal view lookup
  window._invoicesCache = invoices;
}

// Exposed Window Actions
window.viewInvoiceModal = function(id) {
  const inv = (window._invoicesCache || []).find(item => item.id === id);
  if (inv) {
    const createdDate = inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
    showInvoiceModal({ ...inv, formattedDate: createdDate });
  }
};

window.toggleInvoiceStatus = async function(id, currentStatus) {
  const newStatus = currentStatus === 'Paid' ? 'Unpaid' : 'Paid';
  try {
    await updateDoc(doc(db, 'invoices', id), { status: newStatus });
  } catch (err) {
    console.error("Error updating status:", err);
  }
};

window.deleteInvoice = async function(id) {
  if (confirm("Are you sure you want to delete this invoice?")) {
    try {
      await deleteDoc(doc(db, 'invoices', id));
    } catch (err) {
      console.error("Error deleting invoice:", err);
    }
  }
};

function showInvoiceModal(inv) {
  document.getElementById('modalInvNum').textContent = inv.invoiceNum;
  document.getElementById('modalInvDate').textContent = `Date: ${inv.formattedDate || new Date().toLocaleDateString('en-GB')}`;
  
  const statusBadge = document.getElementById('modalInvStatus');
  statusBadge.textContent = inv.status;
  statusBadge.className = `badge ${inv.status === 'Paid' ? 'badge-success' : 'badge-warning'}`;

  document.getElementById('modalClientName').textContent = inv.clientName;
  document.getElementById('modalClientEmail').textContent = inv.clientEmail;
  document.getElementById('modalServiceTitle').textContent = inv.service;

  document.getElementById('modalBaseSubtotal').textContent = formatCurrency(inv.subtotal);
  document.getElementById('modalSubtotalVal').textContent = `KES ${formatCurrency(inv.subtotal)}`;
  document.getElementById('modalVatVal').textContent = `KES ${formatCurrency(inv.vat)}`;
  document.getElementById('modalGrandTotalVal').textContent = `KES ${formatCurrency(inv.grandTotal)}`;

  document.getElementById('invoiceModal').classList.add('show');
}

function closeModal() {
  document.getElementById('invoiceModal').classList.remove('show');
}

// ── 4. TENDER & CONTRACT COUNTDOWN TRACKER MODULE ───────────────────────────
async function handleCreateTender(e) {
  e.preventDefault();

  const title = document.getElementById('tenderTitle').value.trim();
  const client = document.getElementById('tenderClient').value.trim();
  const endDate = document.getElementById('contractEndDate').value;
  const value = parseFloat(document.getElementById('tenderValue').value);

  if (!title || !client || !endDate || isNaN(value) || value <= 0) {
    alert("Please enter valid contract details.");
    return;
  }

  const tenderData = {
    title,
    client,
    endDate,
    value,
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'tenders'), tenderData);
    document.getElementById('tenderForm').reset();
  } catch (error) {
    console.error("Error creating tender:", error);
    alert("Could not save tender to database.");
  }
}

function subscribeTenders() {
  const q = query(collection(db, 'tenders'), orderBy('endDate', 'asc'));

  unsubscribeTenders = onSnapshot(q, (snapshot) => {
    const tenders = [];
    snapshot.forEach((docSnap) => {
      tenders.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderTendersGrid(tenders);
    updateTenderStats(tenders);
  });
}

function renderTendersGrid(tenders) {
  const grid = document.getElementById('tendersGrid');
  const countBadge = document.getElementById('tenderCountBadge');

  countBadge.textContent = `${tenders.length} Tracked`;

  if (tenders.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: #ffffff; padding: 3rem; text-align: center; border-radius: 12px; border: 1px dashed #cbd5e1; color: #64748b;">
        <i class="fa-solid fa-business-time" style="font-size: 2.2rem; margin-bottom: 0.5rem; color: #94a3b8; display: block;"></i>
        No active tenders or contracts being tracked yet.
      </div>
    `;
    return;
  }

  grid.innerHTML = tenders.map(t => {
    const countdownInfo = calculateCountdown(t.endDate);
    
    let badgeClass = 'badge-success';
    let badgeText = 'ACTIVE';

    if (countdownInfo.isExpired) {
      badgeClass = 'badge-danger';
      badgeText = 'EXPIRED';
    } else if (countdownInfo.daysRemaining <= 30) {
      badgeClass = 'badge-warning';
      badgeText = 'EXPIRING SOON';
    }

    return `
      <div class="tender-card">
        <div>
          <div class="tender-card-header">
            <div>
              <div class="tender-title">${escapeHtml(t.title)}</div>
              <div class="tender-client">${escapeHtml(t.client)}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>

          <div class="tender-val">KES ${formatCurrency(t.value)}</div>
          <div style="font-size: 0.78rem; color: #64748b;">Expiry Date: <strong>${formatDateReadable(t.endDate)} (${t.endDate})</strong></div>
        </div>

        <div>
          <div class="countdown-box" data-end-date="${t.endDate}">
            <div class="countdown-time">${countdownInfo.displayText}</div>
            <div class="countdown-lbl">${countdownInfo.statusLabel}</div>
          </div>

          <div style="margin-top: 1rem; text-align: right;">
            <button class="btn-icon danger" onclick="window.deleteTender('${t.id}')" title="Delete Contract">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  startLiveTicker();
}

let liveTickerInterval = null;
function startLiveTicker() {
  if (liveTickerInterval) clearInterval(liveTickerInterval);

  liveTickerInterval = setInterval(() => {
    const boxes = document.querySelectorAll('.countdown-box[data-end-date]');
    boxes.forEach(box => {
      const endDate = box.getAttribute('data-end-date');
      const info = calculateCountdown(endDate);
      const timeElem = box.querySelector('.countdown-time');
      const lblElem = box.querySelector('.countdown-lbl');
      if (timeElem) timeElem.textContent = info.displayText;
      if (lblElem) lblElem.textContent = info.statusLabel;

      const card = box.closest('.tender-card');
      if (card) {
        const badge = card.querySelector('.badge');
        if (badge) {
          if (info.isExpired) {
            badge.className = 'badge badge-danger';
            badge.textContent = 'EXPIRED';
          } else if (info.daysRemaining <= 30) {
            badge.className = 'badge badge-warning';
            badge.textContent = 'EXPIRING SOON';
          } else {
            badge.className = 'badge badge-success';
            badge.textContent = 'ACTIVE';
          }
        }
      }
    });
  }, 1000);
}

function calculateCountdown(targetDateStr) {
  if (!targetDateStr) {
    return { isExpired: true, daysRemaining: 0, displayText: '0d 00h 00m 00s', statusLabel: 'No Expiry Date' };
  }

  let target;
  if (typeof targetDateStr === 'string') {
    const cleanDateStr = targetDateStr.split('T')[0];
    const parts = cleanDateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      target = new Date(year, month, day, 23, 59, 59);
    } else {
      target = new Date(targetDateStr);
    }
  } else if (targetDateStr instanceof Date) {
    target = targetDateStr;
  } else if (targetDateStr && typeof targetDateStr.toDate === 'function') {
    target = targetDateStr.toDate();
  } else {
    target = new Date(targetDateStr);
  }

  if (isNaN(target.getTime())) {
    return { isExpired: true, daysRemaining: 0, displayText: '0d 00h 00m 00s', statusLabel: 'Invalid Date' };
  }

  const now = new Date();
  const diffTime = target.getTime() - now.getTime();

  if (diffTime <= 0) {
    return {
      isExpired: true,
      daysRemaining: 0,
      displayText: '0d 00h 00m 00s',
      statusLabel: 'Contract Expired'
    };
  }

  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);

  const pad = (n) => String(n).padStart(2, '0');

  return {
    isExpired: false,
    daysRemaining: totalDays,
    displayText: `${totalDays}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
    statusLabel: 'Remaining to Expiry'
  };
}

window.deleteTender = async function(id) {
  if (confirm("Are you sure you want to delete this tender contract tracker?")) {
    try {
      await deleteDoc(doc(db, 'tenders', id));
    } catch (err) {
      console.error("Error deleting tender:", err);
    }
  }
};

// ── 5. METRIC SUMMARY COUNTER CALCULATIONS ────────────────────────────────────
function updateInvoiceStats(invoices) {
  document.getElementById('statTotalInvoices').textContent = invoices.length;

  const unpaidSum = invoices
    .filter(inv => inv.status === 'Unpaid')
    .reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

  document.getElementById('statUnpaidAmount').textContent = `KES ${formatCurrency(unpaidSum)}`;
}

function updateTenderStats(tenders) {
  const activeCount = tenders.filter(t => !calculateCountdown(t.endDate).isExpired).length;
  const expiringSoonCount = tenders.filter(t => {
    const info = calculateCountdown(t.endDate);
    return !info.isExpired && info.daysRemaining <= 30;
  }).length;

  document.getElementById('statActiveContracts').textContent = activeCount;
  document.getElementById('statExpiringContracts').textContent = expiringSoonCount;
}

// ── HELPER UTILITIES ────────────────────────────────────────────────────────
function formatCurrency(val) {
  return (val || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateReadable(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${day} ${months[monthIndex]} ${year}`;
    }
  }
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initFirebase);
