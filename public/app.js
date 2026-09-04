// ==========================================================================
// L.E.A Ecolene Group Company Limited — Admin Management App Logic
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
let currentTxFilter = 'all';

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
      console.error('Firebase Login Error:', error.code, error.message, error);
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
  
  const btnPdf = document.getElementById('btnDownloadPdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', downloadInvoicePDF);
  }

  // Transaction History Filter Buttons
  const filterBtns = document.querySelectorAll('.transaction-filter-group .filter-btn[data-filter]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTxFilter = btn.getAttribute('data-filter') || 'all';
      if (window._allInvoicesCache) {
        renderInvoicesTable(window._allInvoicesCache);
      }
    });
  });

  // Transaction Statement Modal Controls
  const btnExportTx = document.getElementById('btnExportTxStatement');
  if (btnExportTx) {
    btnExportTx.addEventListener('click', openTxStatementModal);
  }

  const btnPrintTx = document.getElementById('btnPrintTxStatement');
  if (btnPrintTx) {
    btnPrintTx.addEventListener('click', () => window.print());
  }

  const btnCloseTx = document.getElementById('btnCloseTxModal');
  if (btnCloseTx) {
    btnCloseTx.addEventListener('click', closeTxModal);
  }

  // Set copyright year
  document.getElementById('copyrightYear').textContent = new Date().getFullYear();
}

function formatAuthError(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address format.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect admin email or password, or user account not found in Firebase Auth.';
    case 'auth/operation-not-allowed': return 'Email/Password sign-in is not enabled in Firebase Console.';
    case 'auth/too-many-requests': return 'Too many failed login attempts. Try again later.';
    case 'auth/network-request-failed': return 'Network error. Please check your internet connection.';
    default: return `Authentication failed (${code || 'unknown'}). Check console for details.`;
  }
}

// ── 3. CLIENT INVOICE GENERATION & ARCHIVAL MODULE ──────────────────────────
async function handleCreateInvoice(e) {
  e.preventDefault();

  const clientName = document.getElementById('clientName').value.trim();
  const clientEmail = document.getElementById('clientEmail').value.trim();

  if (!clientName || !clientEmail) {
    alert("Please enter the client name and email address.");
    return;
  }

  // Collect checked services & itemized amounts
  const selectedServices = [];
  const serviceItems = document.querySelectorAll('.service-checkbox-item');

  serviceItems.forEach(item => {
    const chk = item.querySelector('.service-chk');
    const priceInput = item.querySelector('.service-price-input');
    
    if (chk && chk.checked) {
      const name = chk.value.trim();
      const amount = parseFloat(priceInput ? priceInput.value : 0) || 0;
      if (amount > 0) {
        selectedServices.push({ name, amount });
      }
    }
  });

  if (selectedServices.length === 0) {
    alert("Please select at least 1 eco-cleaning service and enter a valid amount (greater than KES 0).");
    return;
  }

  // Calculate cumulative subtotal, 16% VAT, and grand total
  const subtotal = selectedServices.reduce((sum, s) => sum + s.amount, 0);
  const vat = subtotal * 0.16;
  const grandTotal = subtotal + vat;
  const invoiceNum = generateInvoiceNum();

  // Primary service summary string for backwards compatibility
  const serviceSummary = selectedServices.length === 1
    ? selectedServices[0].name
    : `${selectedServices.length} Eco-Services (${selectedServices.map(s => s.name).join(', ')})`;

  const invoiceData = {
    invoiceNum,
    clientName,
    clientEmail,
    service: serviceSummary,
    services: selectedServices,
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

function renderInvoicesTable(rawInvoices) {
  window._allInvoicesCache = rawInvoices;

  // Apply Transaction Filter (All, Paid Receipts, Unpaid Invoices)
  let invoices = rawInvoices;
  if (currentTxFilter === 'paid') {
    invoices = rawInvoices.filter(inv => inv.status === 'Paid');
  } else if (currentTxFilter === 'unpaid') {
    invoices = rawInvoices.filter(inv => inv.status === 'Unpaid');
  }

  const tbody = document.getElementById('invoicesTbody');
  const countBadge = document.getElementById('invoiceCountBadge');

  const filterLabel = currentTxFilter === 'paid' ? 'Paid Receipts' : (currentTxFilter === 'unpaid' ? 'Unpaid Invoices' : 'Records');
  countBadge.textContent = `${invoices.length} ${filterLabel}`;

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #64748b; padding: 2rem;">
          <i class="fa-solid fa-folder-open" style="font-size: 1.8rem; margin-bottom: 0.5rem; display: block;"></i>
          No ${filterLabel.toLowerCase()} found in history archive.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const isPaid = inv.status === 'Paid';
    const statusBadgeClass = isPaid ? 'badge-success' : 'badge-warning';

    let serviceCellHtml = '';
    if (Array.isArray(inv.services) && inv.services.length > 1) {
      const namesList = inv.services.map(s => escapeHtml(s.name)).join(' • ');
      serviceCellHtml = `
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
          <span class="badge badge-info" style="font-size: 0.65rem; padding: 2px 8px; white-space: nowrap;">${inv.services.length} Services Selected</span>
          <div style="font-size: 0.78rem; color: #334155; font-weight: 600; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${namesList}">
            ${namesList}
          </div>
        </div>
      `;
    } else {
      serviceCellHtml = `<div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHtml(inv.service || 'Eco-Cleaning Service')}</div>`;
    }

    return `
      <tr>
        <td style="white-space: nowrap; font-weight: 800; font-size: 0.85rem; color: #0f172a;">${inv.invoiceNum}</td>
        <td>
          <div style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(inv.clientName)}</div>
          <div style="font-size: 0.74rem; color: #64748b;">${escapeHtml(inv.clientEmail)}</div>
        </td>
        <td style="max-width: 260px;">${serviceCellHtml}</td>
        <td style="white-space: nowrap; font-weight: 800; font-size: 0.85rem; color: #0f172a;">KES ${formatCurrency(inv.grandTotal)}</td>
        <td style="white-space: nowrap;">
          <span class="badge ${statusBadgeClass}">${inv.status}</span>
        </td>
        <td style="white-space: nowrap;">
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

    // When status changes to Paid, auto-launch the Official Payment Receipt Modal!
    if (newStatus === 'Paid') {
      const inv = (window._invoicesCache || []).find(item => item.id === id);
      if (inv) {
        const updatedInv = { ...inv, status: 'Paid' };
        showInvoiceModal(updatedInv);
      }
    }
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
  const isPaid = inv.status === 'Paid';
  const docTitle = isPaid ? 'OFFICIAL PAYMENT RECEIPT' : 'OFFICIAL INVOICE';
  const docNum = isPaid 
    ? (inv.invoiceNum.replace('LEA-INV', 'LEA-RCT'))
    : inv.invoiceNum;
  const formattedDate = inv.formattedDate || (inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

  const docTitleElem = document.getElementById('modalDocTitle');
  if (docTitleElem) docTitleElem.textContent = docTitle;

  document.getElementById('modalInvNum').textContent = docNum;
  document.getElementById('modalInvDate').textContent = `${isPaid ? 'Payment Date' : 'Date'}: ${formattedDate}`;
  
  const statusBadge = document.getElementById('modalInvStatus');
  if (statusBadge) {
    statusBadge.textContent = isPaid ? 'PAID IN FULL' : 'UNPAID';
    statusBadge.className = `badge ${isPaid ? 'badge-success' : 'badge-warning'}`;
  }

  document.getElementById('modalClientName').textContent = inv.clientName;
  document.getElementById('modalClientEmail').textContent = inv.clientEmail;

  // Show/Hide Official Receipt Confirmation Banner
  const receiptNoticeBox = document.getElementById('modalReceiptNotice');
  if (receiptNoticeBox) {
    receiptNoticeBox.style.display = isPaid ? 'block' : 'none';
  }

  // Update Action Button Text
  const btnPrint = document.getElementById('btnPrintInvoice');
  if (btnPrint) {
    btnPrint.innerHTML = isPaid 
      ? `<i class="fa-solid fa-print"></i> Print Official Receipt` 
      : `<i class="fa-solid fa-print"></i> Print Invoice`;
  }

  // Itemized service table population
  const tbody = document.getElementById('modalServicesTbody');
  if (tbody) {
    const servicesList = (Array.isArray(inv.services) && inv.services.length > 0)
      ? inv.services
      : [{ name: inv.service || 'Eco-Cleaning Service', amount: inv.subtotal || 0 }];

    tbody.innerHTML = servicesList.map(item => `
      <tr>
        <td style="font-weight: 700; width: 55%; padding: 6px 10px;">${escapeHtml(item.name)}</td>
        <td style="color: #64748b; width: 25%; padding: 6px 10px;">Eco-Cleaning Service</td>
        <td style="text-align: right; font-weight: 700; width: 20%; padding: 6px 10px;">KES ${formatCurrency(item.amount)}</td>
      </tr>
    `).join('');
  }

  const baseSubtotal = document.getElementById('modalBaseSubtotal');
  if (baseSubtotal) baseSubtotal.textContent = formatCurrency(inv.subtotal);
  
  document.getElementById('modalSubtotalVal').textContent = `KES ${formatCurrency(inv.subtotal)}`;
  document.getElementById('modalVatVal').textContent = `KES ${formatCurrency(inv.vat)}`;
  document.getElementById('modalGrandTotalVal').textContent = `KES ${formatCurrency(inv.grandTotal)}`;

  document.getElementById('invoiceModal').classList.add('show');
}

function closeModal() {
  document.getElementById('invoiceModal').classList.remove('show');
}

function openTxStatementModal() {
  const rawInvoices = window._allInvoicesCache || [];

  // Filter based on active selection (All, Paid Receipts, Unpaid Invoices)
  let records = rawInvoices;
  if (currentTxFilter === 'paid') {
    records = rawInvoices.filter(i => i.status === 'Paid');
  } else if (currentTxFilter === 'unpaid') {
    records = rawInvoices.filter(i => i.status === 'Unpaid');
  }

  const filterLabel = currentTxFilter === 'paid' 
    ? 'Paid Receipts Statement' 
    : (currentTxFilter === 'unpaid' ? 'Unpaid Invoices Statement' : 'All Transactions Financial Statement');

  const filterLabelElem = document.getElementById('stmtFilterLabel');
  if (filterLabelElem) filterLabelElem.textContent = filterLabel;

  const stmtDateElem = document.getElementById('stmtDateLabel');
  if (stmtDateElem) stmtDateElem.textContent = `Statement Date: ${new Date().toLocaleDateString('en-GB')}`;

  const stmtRecordCount = document.getElementById('stmtRecordCountBadge');
  if (stmtRecordCount) stmtRecordCount.textContent = `${records.length} Records`;

  // Calculate totals
  const totalInvoiced = records.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
  const totalPaid = records.filter(i => i.status === 'Paid').reduce((sum, i) => sum + (i.grandTotal || 0), 0);
  const totalUnpaid = records.filter(i => i.status === 'Unpaid').reduce((sum, i) => sum + (i.grandTotal || 0), 0);

  const stmtInvoicedElem = document.getElementById('stmtTotalInvoicedVal');
  if (stmtInvoicedElem) stmtInvoicedElem.textContent = `KES ${formatCurrency(totalInvoiced)}`;

  const stmtPaidElem = document.getElementById('stmtTotalPaidVal');
  if (stmtPaidElem) stmtPaidElem.textContent = `KES ${formatCurrency(totalPaid)}`;

  const stmtUnpaidElem = document.getElementById('stmtTotalUnpaidVal');
  if (stmtUnpaidElem) stmtUnpaidElem.textContent = `KES ${formatCurrency(totalUnpaid)}`;

  // Populate Table Body
  const tbody = document.getElementById('stmtTransactionsTbody');
  if (tbody) {
    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">
            No ${filterLabel.toLowerCase()} available to export.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = records.map(inv => {
        const isPaid = inv.status === 'Paid';
        const docNum = isPaid ? inv.invoiceNum.replace('LEA-INV', 'LEA-RCT') : inv.invoiceNum;
        const statusBadgeClass = isPaid ? 'badge-success' : 'badge-warning';

        return `
          <tr>
            <td style="font-weight: 800; font-size: 0.74rem; width: 20%; padding: 4px 8px;">${escapeHtml(docNum)}</td>
            <td style="font-size: 0.74rem; width: 26%; padding: 4px 8px;">
              <div style="font-weight: 700; color: #0f172a;">${escapeHtml(inv.clientName)}</div>
              <div style="font-size: 0.68rem; color: #64748b;">${escapeHtml(inv.clientEmail)}</div>
            </td>
            <td style="font-size: 0.72rem; color: #334155; width: 26%; padding: 4px 8px;">${escapeHtml(inv.service || 'Eco-Cleaning Services')}</td>
            <td style="text-align: right; font-weight: 800; font-size: 0.76rem; width: 16%; padding: 4px 8px;">KES ${formatCurrency(inv.grandTotal)}</td>
            <td style="text-align: center; width: 12%; padding: 4px 8px;">
              <span class="badge ${statusBadgeClass}" style="font-size: 0.62rem; padding: 2px 5px;">${inv.status}</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  document.getElementById('txStatementModal').classList.add('show');
}

function closeTxModal() {
  document.getElementById('txStatementModal').classList.remove('show');
}

async function downloadInvoicePDF() {
  const element = document.getElementById('pdfExportContainer');
  const invNum = document.getElementById('modalInvNum').textContent || 'LEA-INV';

  // High-resolution lossless PDF Export options (Prevents blur, clipping, & multi-page overflow)
  const opt = {
    margin:       [0.25, 0.25, 0.25, 0.25],
    filename:     `${invNum}.pdf`,
    image:        { type: 'png' },
    html2canvas:  { 
      scale: 3, 
      useCORS: true, 
      logging: false, 
      letterRendering: true,
      dpi: 300,
      backgroundColor: '#ffffff',
      windowWidth: 800
    },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  if (window.html2pdf) {
    try {
      const btnPdf = document.getElementById('btnDownloadPdf');
      if (btnPdf) btnPdf.disabled = true;

      // Temporarily format container for crisp 1-page PDF export
      const modalCard = element.closest('.invoice-preview-card');
      const origMaxHeight = modalCard ? modalCard.style.maxHeight : '';
      const origOverflow = modalCard ? modalCard.style.overflow : '';
      const origWidth = element.style.width;

      if (modalCard) {
        modalCard.style.maxHeight = 'none';
        modalCard.style.overflow = 'visible';
      }
      element.style.width = '790px';

      await window.html2pdf().set(opt).from(element).save();

      if (modalCard) {
        modalCard.style.maxHeight = origMaxHeight;
        modalCard.style.overflow = origOverflow;
      }
      element.style.width = origWidth;

      if (btnPdf) btnPdf.disabled = false;
    } catch (e) {
      console.warn("PDF Export Notice:", e);
      window.print();
    }
  } else {
    window.print();
  }
}

async function downloadTxStatementPDF() {
  const element = document.getElementById('pdfTxStatementContainer');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `LEA-Transaction-Statement-${dateStr}.pdf`;

  const opt = {
    margin:       [0.25, 0.25, 0.25, 0.25],
    filename:     filename,
    image:        { type: 'png' },
    html2canvas:  { 
      scale: 3, 
      useCORS: true, 
      logging: false, 
      letterRendering: true,
      dpi: 300,
      backgroundColor: '#ffffff',
      windowWidth: 850
    },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  if (window.html2pdf) {
    try {
      const btnPrint = document.getElementById('btnPrintTxStatement');
      if (btnPrint) btnPrint.disabled = true;

      const modalCard = element.closest('.invoice-preview-card');
      const origMaxHeight = modalCard ? modalCard.style.maxHeight : '';
      const origOverflow = modalCard ? modalCard.style.overflow : '';
      const origWidth = element.style.width;

      if (modalCard) {
        modalCard.style.maxHeight = 'none';
        modalCard.style.overflow = 'visible';
      }
      element.style.width = '820px';

      await window.html2pdf().set(opt).from(element).save();

      if (modalCard) {
        modalCard.style.maxHeight = origMaxHeight;
        modalCard.style.overflow = origOverflow;
      }
      element.style.width = origWidth;

      if (btnPrint) btnPrint.disabled = false;
    } catch (e) {
      console.warn("PDF Export Notice:", e);
      window.print();
    }
  } else {
    window.print();
  }
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
