// --- Initialization & UI Tools ---
lucide.createIcons();
Chart.defaults.color = '#64748b'; 
Chart.defaults.font.family = 'Inter';

localforage.config({ name: 'BPMDeskDatabaseV3', storeName: 'bpmdata' });

// Global Variables
let memCbData = [], memCbStates = {}, memTallyHist = [], memTdEntries = [], memTdHist = [], memAccReg = [], memOverrides = {}, memSettings = {};
let globalBoName = 'My Branch Office', globalBpmName = '', globalSpoName = '', globalHoName = '';
let memHolidayDates = [];
let memHolidayNames = {};
const activeSchemesRegister = ['SB', 'RD', '1Y TD', '2Y TD', '3Y TD', '5Y TD', 'MIS', 'SCSS', 'PPF', 'SSA', 'NSC', 'KVP', 'MSSC'];
const boReceiptSchemes = ['Cash from AO', 'SB Deposit', 'RD Deposit', 'TD/MIS/SCSS Deposit', 'SSA/PPF Deposit', 'PLI/RPLI Premium', 'IPPB Deposit', 'Stamp Sales', 'General/Other'];
const boPaymentSchemes = ['Remittance to AO', 'SB Withdrawal', 'IPPB Withdrawal', 'PLI/RPLI Payment', 'Wages/Expenses', 'General/Other'];
const INCENTIVE_RATES = {1:0.005, 2:0.01, 3:0.01, 5:0.02};
let activeRegIds = { acc: '', phone: '', cif: '', aadhaar: '', pan: '' };
let repChartCashFlow = null, repChartSchemes = null, repChartClosing = null, repChartTat = null, repChartTdDrill = null, dashChartSchemes = null, tdChart = null;
let currentEditIndex = -1, modifyIndex = -1, pendingEntry = null;
let selectedLedgerIndices = new Set(), lastFilteredLedgerIndices = [];
let ledgerViewMode = 'scheme';
let memAuditLog = [], memRecycleBin = [], memReminders = [], memReceiptHistory = [], memClosingChecklists = {};
const passbookBoardStatuses = [
    { key: 'Pending AO', title: 'Pending AO', icon: 'clock' },
    { key: 'At BO', title: 'At BO', icon: 'archive' },
    { key: 'Delivered', title: 'Delivered', icon: 'check-circle-2' }
];

// Helpers
function money(v){ return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number.isFinite(v)?v:0); }
function escapeHTML(value) { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; }
function parseLocalDate(dateStr) { return new Date(`${dateStr}T00:00:00`); }
function getLocalISODate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function getClosedDayReason(dateStr) {
    const reasons = [];
    if (parseLocalDate(dateStr).getDay() === 0) reasons.push('Sunday');
    if (memHolidayDates.includes(dateStr)) reasons.push(memHolidayNames[dateStr] || 'Branch Holiday');
    return reasons.join(' / ');
}
function getTreasuryWorkflowState(dateStr) {
    const state = memCbStates[dateStr] || {};
    const closedReason = getClosedDayReason(dateStr);
    return {
        state,
        closedReason,
        isHoliday: Boolean(closedReason),
        isSaved: Boolean(state.saved),
        isLocked: Boolean(state.tallyLocked),
    };
}
function setTreasuryBanner(message, tone = 'info') {
    const banner = document.getElementById('treasury-day-banner');
    if (!banner) return;
    if (!message) {
        banner.hidden = true;
        banner.textContent = '';
        banner.className = 'treasury-day-banner';
        return;
    }
    banner.hidden = false;
    banner.textContent = message;
    banner.className = `treasury-day-banner treasury-day-banner-${tone}`;
}
function openCashTallyMenu() {
    const tallySection = document.getElementById('tally-section');
    if (!tallySection) return;
    tallySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tallySection.classList.add('treasury-focus');
    setTimeout(() => tallySection.classList.remove('treasury-focus'), 1500);
}
function focusCashDenominationGrid() {
    const grid = document.getElementById('cash-inputs-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('c-500')?.focus();
}
function openTreasuryEntryEditor() {
    const forms = document.getElementById('cb-forms-container');
    if (forms) forms.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('cb-rec-desc')?.focus();
}
window.focusCashDenominationGrid = focusCashDenominationGrid;
window.openTreasuryEntryEditor = openTreasuryEntryEditor;
function createExportFilename(moduleName, extension = '') {
    const safeName = String(moduleName || 'Report').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Report';
    const date = new Date().toISOString().slice(0, 10);
    const randomValue = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff);
    const serial = String((randomValue % 900000) + 100000);
    const suffix = String(extension || '').replace(/^\./, '');
    return `DakDesk_${safeName}_${date}_SR-${serial}${suffix ? `.${suffix}` : ''}`;
}

function printModule(moduleName, printClass) {
    const originalTitle = document.title;
    document.title = createExportFilename(moduleName);
    document.body.classList.add(printClass);
    window.print();
    document.body.classList.remove(printClass);
    document.title = originalTitle;
}
function showToast(msg) { const t = document.getElementById('toastMsg'); document.getElementById('toastText').textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000); }
async function addAudit(action, module, details = '') { memAuditLog.unshift({ id: Date.now()+Math.random(), at: new Date().toISOString(), action, module, details }); if(memAuditLog.length>1000) memAuditLog.length=1000; await localforage.setItem('auditTrailV1',memAuditLog); }
async function moveToRecycle(type, data, description) { memRecycleBin.unshift({id:Date.now()+Math.random(),type,data:JSON.parse(JSON.stringify(data)),description,deletedAt:new Date().toISOString()}); if(memRecycleBin.length>200) memRecycleBin.length=200; await localforage.setItem('recycleBinV1',memRecycleBin); await addAudit('Deleted',type,description); }
function toggleSidebar() { document.getElementById('app-sidebar').classList.toggle('collapsed'); }
function toggleDark() { document.body.classList.toggle('dark'); }
window.checkSunday = function(dateStr) { if (!dateStr) return; const reason = getClosedDayReason(dateStr); if (reason) showToast(`Treasury is closed on this date: ${reason}.`); }
function toWords(n){
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']; const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function h(num){ if(num===0)return''; if(num<20)return ones[num]+' '; if(num<100)return tens[Math.floor(num/10)]+' '+(num%10?ones[num%10]+' ':''); return ones[Math.floor(num/100)]+'Hundred '+(num%100?h(num%100):''); }
  let w='',rem=Math.round(n); if(rem>=10000000){w+=h(Math.floor(rem/10000000))+'Crore ';rem%=10000000;} if(rem>=100000){w+=h(Math.floor(rem/100000))+'Lakh ';rem%=100000;} if(rem>=1000){w+=h(Math.floor(rem/1000))+'Thousand ';rem%=1000;} w+=h(rem); return w.trim();
}

function getTdTermFromScheme(scheme) {
    const label = String(scheme || '').toUpperCase();
    if (!label.includes('TD')) return null;
    if (label.includes('5Y')) return 5;
    if (label.includes('3Y')) return 3;
    if (label.includes('2Y')) return 2;
    return 1;
}

// Global Export Tools
window.exportExcelTable = function(tableId, moduleName) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const clone = table.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach(e => e.remove());
    const wb = XLSX.utils.table_to_book(clone, {sheet: "Report"});
    XLSX.writeFile(wb, createExportFilename(moduleName, 'xlsx'));
};

window.exportModulePDF = async function(elementId, moduleName) {
    const el = document.getElementById(elementId);
    if(!el) return;
    window.scrollTo(0, 0); document.body.classList.add('exporting-pdf');
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imageHeight = (canvas.height * pdfWidth) / canvas.width;
        let position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imageHeight);
        for (let remaining = imageHeight - pageHeight; remaining > 0; remaining -= pageHeight) {
            position -= pageHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imageHeight);
        }
        pdf.save(createExportFilename(moduleName, 'pdf'));
    } catch (e) { alert("PDF generation failed."); } finally { document.body.classList.remove('exporting-pdf'); }
};

// Switch Tabs
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active'); 
  document.getElementById('tab-panel-'+name).classList.add('active');
  document.getElementById('topbarTitle').textContent = document.getElementById('tab-'+name).textContent.trim();
  
  if (name === 'dashboard') renderDashboard();
  if (name === 'cashbook') { loadCashBookDate(); checkTallyDate(); }
  if (name === 'reports') { initInsightsStudioFilters(); runInsightsStudio(); }
    if (name === 'rates') { updatePosbCalculator(); initIntegratedPosbCalculator(); }
  if (name === 'register') { setTimeout(() => { const container = document.querySelector('#tab-panel-register .table-container'); if (container) container.scrollTop = container.scrollHeight; }, 100); }
}

// Shortcuts
document.addEventListener('keydown', e => {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal && confirmModal.style.display === 'flex') {
        if (e.key === 'Enter') { e.preventDefault(); confirmAddEntry(); }
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); const activeTab = document.querySelector('.tab-panel.active');
        if (activeTab && activeTab.id === 'tab-panel-cashbook') { saveCashBookDate(); showToast("✅ Cash Book Locked & Saved!"); }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const activeTab = document.querySelector('.tab-panel.active');
        if (activeTab && activeTab.id === 'tab-panel-register') { e.preventDefault(); document.getElementById('ledgerSearchInput').focus(); }
    }
    handleCashBookKeyboardEntry(e);
    handleTdBillKeyboardEntry(e);
});

function handleCashBookKeyboardEntry(e) {
    const activeTab = document.querySelector('.tab-panel.active');
    if (!activeTab || activeTab.id !== 'tab-panel-cashbook') return;

    const receiptFields = ['cb-rec-scheme', 'cb-rec-desc', 'cb-rec-amt'];
    const paymentFields = ['cb-pay-scheme', 'cb-pay-desc', 'cb-pay-amt'];
    const targetId = e.target?.id;
    const fieldSet = receiptFields.includes(targetId) ? receiptFields : paymentFields.includes(targetId) ? paymentFields : null;

    if ((e.altKey || e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        document.getElementById('cb-rec-amt')?.focus();
        return;
    }

    if ((e.altKey || e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        document.getElementById('cb-pay-amt')?.focus();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement?.id?.startsWith('cb-rec-')) {
            e.preventDefault();
            addCashBookEntry('receipt');
        } else if (document.activeElement?.id?.startsWith('cb-pay-')) {
            e.preventDefault();
            addCashBookEntry('payment');
        }
        return;
    }

    if (e.key !== 'Enter' || !fieldSet) return;

    e.preventDefault();
    const currentIndex = fieldSet.indexOf(targetId);
    if (currentIndex < fieldSet.length - 1) {
        const next = document.getElementById(fieldSet[currentIndex + 1]);
        next?.focus();
        if (next && typeof next.select === 'function') next.select();
        return;
    }

    const type = targetId.includes('-rec-') ? 'receipt' : 'payment';
    addCashBookEntry(type);
}

function handleTdBillKeyboardEntry(e) {
    const activeTab = document.querySelector('.tab-panel.active');
    if (!activeTab || activeTab.id !== 'tab-panel-bill') return;

    const entryFields = ['accNo', 'depName', 'prNo', 'depAmount', 'tdTerm'];
    const targetId = e.target?.id;

    if ((e.altKey || e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        document.getElementById('accNo')?.focus();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        requestAddEntry();
        return;
    }

    if (e.key !== 'Enter' || !entryFields.includes(targetId)) return;

    e.preventDefault();
    const currentIndex = entryFields.indexOf(targetId);
    if (currentIndex < entryFields.length - 1) {
        const next = document.getElementById(entryFields[currentIndex + 1]);
        next?.focus();
        if (next && typeof next.select === 'function') next.select();
    } else {
        requestAddEntry();
    }
}

// Init
async function initApp() {
    memAccReg = await localforage.getItem('accRegister') || [];
    memTdEntries = await localforage.getItem('tdBillEntries') || [];
    memTdHist = await localforage.getItem('tdBillHistory') || [];
    memCbData = await localforage.getItem('cashBookDataV2') || [];
    memCbStates = await localforage.getItem('cashBookStatesV2') || {};
    memTallyHist = await localforage.getItem('cashTallyHistory') || [];
    memOverrides = await localforage.getItem('manualOverridesV5') || {}; 
    globalBoName = await localforage.getItem('tdBillBoName') || 'My Branch Office';
    globalBpmName = await localforage.getItem('tdBillBpmName') || '';
    globalSpoName = await localforage.getItem('tdBillSpo') || '';
    globalHoName = await localforage.getItem('tdBillHo') || '';
    memHolidayDates = await localforage.getItem('branchHolidayDates') || [];
    memHolidayNames = await localforage.getItem('branchHolidayNames') || {};
    memAuditLog = await localforage.getItem('auditTrailV1') || [];
    memRecycleBin = await localforage.getItem('recycleBinV1') || [];
    memReminders = await localforage.getItem('customerRemindersV1') || [];
    memReceiptHistory = await localforage.getItem('receiptHistoryV1') || [];
    memClosingChecklists = await localforage.getItem('closingChecklistsV1') || {};
    
    let today = new Date(); let todayStr = getLocalISODate(today); let firstDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
    document.getElementById("regDate").valueAsDate = today; document.getElementById("printDate").textContent = today.toLocaleDateString('en-IN');
    
    if(document.getElementById('rep-start')) document.getElementById('rep-start').value = firstDay;
    if(document.getElementById('rep-end')) document.getElementById('rep-end').value = todayStr;
    if(document.getElementById('accFromDate')) document.getElementById('accFromDate').value = firstDay;
    if(document.getElementById('accToDate')) document.getElementById('accToDate').value = todayStr;
    if(document.getElementById('boFromDate')) document.getElementById('boFromDate').value = firstDay;
    if(document.getElementById('boToDate')) document.getElementById('boToDate').value = todayStr;
    if(document.getElementById('summary-month')) document.getElementById('summary-month').value = todayStr.slice(0, 7);
    if(document.getElementById('billMonth')) document.getElementById('billMonth').value = todayStr.slice(0, 7);
    
    const schemeOptions = activeSchemesRegister.map(s=>`<option value="${s}">${s}</option>`).join("");
    document.getElementById("regScheme").innerHTML = schemeOptions; document.getElementById("ledgerModScheme").innerHTML = schemeOptions;
    const bulkEditScheme = document.getElementById("bulk-edit-scheme");
    if (bulkEditScheme) bulkEditScheme.innerHTML = '<option value="">No change</option>' + schemeOptions;
    document.getElementById("cb-rec-scheme").innerHTML = boReceiptSchemes.map(s=>`<option value="${s}">${s}</option>`).join("");
    document.getElementById("cb-pay-scheme").innerHTML = boPaymentSchemes.map(s=>`<option value="${s}">${s}</option>`).join("");
    
    document.getElementById("regPr").value = getLedgerNextPrNo(); 
    document.getElementById('heroEyebrow').textContent = globalBoName;
    document.getElementById('set-boName').value = globalBoName; 
    document.getElementById('set-bpmName').value = globalBpmName;
    document.getElementById('set-spoName').value = globalSpoName; 
    document.getElementById('set-hoName').value = globalHoName;
    renderHolidayList();
    document.getElementById('bpmName').value = globalBpmName;
    document.getElementById('spoName').value = globalSpoName; 
    document.getElementById('hoName').value = globalHoName; 
    document.getElementById('billDate').value = todayStr;

    initCashBook();
    renderRegTable();
    renderDashboard();
    renderTable(); renderHistory(); updatePreview(); updateHeaders();
    renderPosbPresets(); updatePosbCalculator();
    initIntegratedPosbCalculator();
    initInsightsStudioFilters();
    checkBackupReminder();
    checkMonthlyMasterReportReminder();
}

let posbIntegratedReady = false;
let posbIntegratedLastResult = null;
let posbIntegratedCompareState = { custom: null };

function refreshIntegratedPosbWaContacts() {
    const contactSelect = document.getElementById('posb-wa-contact');
    if (!contactSelect) return;
    const currentValue = contactSelect.value;
    const uniqueContacts = new Map();

    memAccReg.forEach(entry => {
        const digits = String(entry.phone || '').replace(/\D/g, '');
        if (!digits) return;
        const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
        if (normalized.length !== 10) return;
        if (!uniqueContacts.has(normalized)) uniqueContacts.set(normalized, entry.name || 'Customer');
    });

    let html = '<option value="">Custom Number(s)</option>';
    [...uniqueContacts.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
        .forEach(([phone, name]) => {
            html += `<option value="${phone}" data-name="${escapeHTML(name)}">${escapeHTML(name)} (${phone})</option>`;
        });

    contactSelect.innerHTML = html;
    if (currentValue && [...contactSelect.options].some(opt => opt.value === currentValue)) {
        contactSelect.value = currentValue;
    }
}

function initIntegratedPosbCalculator() {
    if (posbIntegratedReady) {
        refreshIntegratedPosbWaContacts();
        refreshCompareOptions();
        return;
    }
    const schemeSelect = document.getElementById('schemeType');
    const principalInput = document.getElementById('principal');
    const durationInput = document.getElementById('duration');
    const calculateBtn = document.getElementById('calculateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const form = document.getElementById('calculatorForm');
    if (!schemeSelect || !principalInput || !durationInput || !calculateBtn || !resetBtn || !form) return;

    const principalLabel = document.getElementById('principalLabel');
    const durationHint = document.getElementById('durationHint');
    const principalHint = document.getElementById('principalHint');
    const ssaWithdrawWrap = document.getElementById('ssa-withdraw-wrap');
    const ssaWithdrawInput = document.getElementById('ssa-withdraw-amount');
    const ppfFrequencyWrap = document.getElementById('ppf-frequency-wrap');
    const ppfFrequencyInput = document.getElementById('ppf-deposit-frequency');
    const waContactSelect = document.getElementById('posb-wa-contact');
    const waNumberInput = document.getElementById('posb-wa-number');
    const waSendBtn = document.getElementById('posb-wa-send');
    const compareRunBtn = document.getElementById('posb-compare-run');
    const compareCustomSelect = document.getElementById('posb-compare-custom');
    const compareOutput = document.getElementById('posb-compare-output');
    const emptyState = document.getElementById('emptyState');
    const resultsContainer = document.getElementById('resultsContainer');
    const resPrincipal = document.getElementById('resultPrincipal');
    const resInterest = document.getElementById('resultInterest');
    const resMaturity = document.getElementById('resultMaturity');
    const resNote = document.getElementById('resultNote');
    const chartInvestedBar = document.getElementById('chartInvestedBar');
    const chartInterestBar = document.getElementById('chartInterestBar');
    const chartInvestedPct = document.getElementById('chartInvestedPct');
    const chartInterestPct = document.getElementById('chartInterestPct');

    const schemeMap = {
        sb: 'Savings',
        rd: 'RD (5 Yr)',
        td1: 'TD (1 Yr)',
        td2: 'TD (2 Yr)',
        td3: 'TD (3 Yr)',
        td5: 'TD (5 Yr)',
        nsc: 'NSC',
        kvp: 'KVP',
        ppf: 'PPF',
        ssa: 'SSA',
        scss: 'SCSS'
    };

    const schemeInputMode = {
        sb: { type: 'lumpsum', fixDur: null, minDur: 1 },
        rd: { type: 'monthly', fixDur: 5, minDur: 5 },
        td1: { type: 'lumpsum', fixDur: 1, minDur: 1 },
        td2: { type: 'lumpsum', fixDur: 2, minDur: 2 },
        td3: { type: 'lumpsum', fixDur: 3, minDur: 3 },
        td5: { type: 'lumpsum', fixDur: 5, minDur: 5 },
        nsc: { type: 'lumpsum', fixDur: 5, minDur: 5 },
        kvp: { type: 'lumpsum', fixDur: 10, minDur: 1 },
        ppf: { type: 'lumpsum', fixDur: 15, minDur: 15 },
        ssa: { type: 'yearly', fixDur: 21, minDur: 21 },
        scss: { type: 'lumpsum', fixDur: 5, minDur: 5 }
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);

    const normalizePhone = raw => {
        const digits = String(raw || '').replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return '';
    };

    function buildPosbWaMessage(contactName = '') {
        if (!posbIntegratedLastResult) return '';
        const s = posbIntegratedLastResult;
        const greetingName = contactName ? `${contactName} Ji` : 'Sir/Madam';
        const customCompare = posbIntegratedCompareState.custom;
        const compareLine = customCompare
            ? `💡 *Compare Option:* ${customCompare.label}\n` +
              `Same *${s.depositAmount}* invest karne par aapko lagbhag *${formatCurrency(customCompare.maturityValueRaw)}* milenge, jisme *${formatCurrency(customCompare.interestValueRaw)}* interest hoga (${customCompare.interestPct}% return).\n\n`
            : '';

        return `🙏 *Namaskar ${greetingName},*\n\n` +
            `Aapne *${s.scheme}* ke baare mein pucha tha, to maine aapke liye calculation ki hai.\n\n` +
            `Agar aap *${s.depositAmount}* invest karte hain, to *${s.years} saal* baad aapko lagbhag *${s.maturity}* milenge.\n\n` +
            `Isme aapka total interest *${s.interest}* hoga, yaani invested amount ka lagbhag *${s.interestPct}%*. 📈\n\n` +
            compareLine +
            `Aap chahein to main isi amount ke liye *2-3 aur Post Office schemes compare karke* bhi bata sakta hoon, jisse aap apne hisaab se suitable option choose kar sakein.\n\n` +
            `Account open karwana ho ya koi doubt ho to mujhe bata dena. 👍\n\n` +
            `*— ${globalBpmName || globalBoName}*\n` +
            `📮 *${globalBoName} Post Office*\n\n` +
            `*Note: Calculation current interest rates ke according estimated hai. Actual amount applicable rules aur rates ke according vary kar sakta hai.*`;
    }

    function getCurrentContributionBucket() {
        if (schemeSelect.value === 'rd') return 'monthly';
        if (schemeSelect.value === 'ppf' && ppfFrequencyInput?.value === 'monthly') return 'monthly';
        return 'lumpsum';
    }

    // Mirrors the "Type" column in the Official Post Office Interest Rates table.
    const schemeTypeMap = {
        sb:   'Savings',
        rd:   'Monthly',
        td1:  'Payout',
        td2:  'Payout',
        td3:  'Payout',
        td5:  'Payout',
        scss: 'Payout',
        ppf:  'Yearly',
        ssa:  'Yearly',
        nsc:  'Accumulation',
        kvp:  'Accumulation',
    };

    function getSchemeCompareFamily(targetKey) {
        return schemeTypeMap[targetKey] || 'lumpsum';
    }

    function getSchemeContributionBucket(targetKey, compareBucket = 'lumpsum') {
        if (targetKey === 'rd') return 'monthly';
        if (targetKey === 'ppf') return compareBucket === 'monthly' ? 'monthly' : 'lumpsum';
        return 'lumpsum';
    }

    function listCompareCandidates(currentKey, compareBucket = 'lumpsum') {
        const currentFamily = getSchemeCompareFamily(currentKey);
        return Object.keys(schemeMap)
            .filter(key => key !== currentKey && getSchemeCompareFamily(key) === currentFamily)
            .map(key => ({ key, label: schemeSelect.querySelector(`option[value="${key}"]`)?.textContent?.split(' - ')[0] || schemeMap[key] }));
    }

    function calculateProjectionForScheme(targetKey, inputAmount, compareBucket = 'lumpsum') {
        const targetSchemeName = schemeMap[targetKey];
        const conf = PO_SCHEMES_CALC[targetSchemeName];
        if (!conf) return null;
        const mode = schemeInputMode[targetKey] || { type: 'lumpsum', fixDur: conf.years || 1 };
        const years = mode.fixDur || conf.years || 1;
        const r = conf.rate / 100;

        if (targetKey === 'ssa') {
            if (inputAmount < 250) return null;
            const yearly = Math.min(150000, inputAmount);
            const depositYears = Math.min(15, years);
            let bal = 0;
            let inv = 0;
            for (let y = 1; y <= years; y++) {
                if (y <= depositYears) {
                    bal += yearly;
                    inv += yearly;
                }
                bal += bal * r;
            }
            const maturity = Math.round(bal);
            const invested = Math.round(inv);
            const interest = Math.max(0, maturity - invested);
            return { key: targetKey, label: targetSchemeName, years, invested, maturity, interest, interestPct: invested ? ((interest / invested) * 100).toFixed(2) : '0.00' };
        }

        if (targetKey === 'ppf') {
            const yearly = Math.max(500, Math.min(150000, inputAmount));
            let bal = 0;
            let inv = 0;
            if (compareBucket === 'monthly') {
                const monthly = Math.max(50, Math.min(12500, inputAmount));
                const annualContribution = monthly * 12;
                if (annualContribution < 500 || annualContribution > 150000) return null;
                for (let y = 1; y <= years; y++) {
                    for (let m = 1; m <= 12; m++) {
                        bal += monthly;
                        inv += monthly;
                    }
                    bal += bal * r;
                }
            } else {
                for (let y = 1; y <= years; y++) {
                    bal += yearly;
                    inv += yearly;
                    bal += bal * r;
                }
            }
            const maturity = Math.round(bal);
            const invested = Math.round(inv);
            const interest = Math.max(0, maturity - invested);
            return { key: targetKey, label: targetSchemeName, years, invested, maturity, interest, interestPct: invested ? ((interest / invested) * 100).toFixed(2) : '0.00' };
        }

        const safeInitial = mode.type === 'monthly' ? 0 : inputAmount;
        const safeMonthly = mode.type === 'monthly' ? inputAmount : 0;
        let principal = safeInitial;
        let invested = safeInitial;
        let accumulatedInterest = 0;
        let paidOutInterest = 0;
        const tdAnnualYield = Math.pow(1 + r / 4, 4) - 1;

        for (let y = 1; y <= years; y++) {
            for (let m = 1; m <= 12; m++) {
                if (mode.type === 'monthly') {
                    principal += safeMonthly;
                    invested += safeMonthly;
                }
                let monthInterest = 0;
                switch (conf.logic) {
                    case 'TD':
                        if (m === 12) {
                            monthInterest = principal * tdAnnualYield;
                            paidOutInterest += monthInterest;
                        }
                        break;
                    case 'SCSS':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m % 3 === 0) {
                            paidOutInterest += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    case 'RD':
                    case 'MSSC':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m % 3 === 0) {
                            principal += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    case 'ANNUALLY':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m === 12) {
                            principal += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    default:
                        monthInterest = principal * (r / 12);
                        principal += monthInterest;
                        break;
                }
            }
        }

        const maturity = Math.round(principal + accumulatedInterest + paidOutInterest);
        const inv = Math.round(invested);
        const interest = Math.max(0, maturity - inv);
        return { key: targetKey, label: targetSchemeName, years, invested: inv, maturity, interest, interestPct: inv ? ((interest / inv) * 100).toFixed(2) : '0.00' };
    }

    function renderCompareOutput(result) {
        if (!compareOutput) return;
        if (!result) {
            compareOutput.textContent = 'No valid comparison available for current input.';
            return;
        }
        compareOutput.innerHTML =
            `<strong>${result.label}</strong><br>` +
            `Projected Maturity: <strong>${formatCurrency(result.maturity)}</strong> in ${result.years} years<br>` +
            `Invested: ${formatCurrency(result.invested)} | Interest: ${formatCurrency(result.interest)} (${result.interestPct}%)`;
    }

    function refreshCompareOptions() {
        if (!compareCustomSelect || !schemeSelect) return;
        const candidates = listCompareCandidates(schemeSelect.value);
        compareCustomSelect.innerHTML = candidates.map(c => `<option value="${c.key}">${escapeHTML(c.label)}</option>`).join('');
    }

    function runCustomCompare() {
        if (!posbIntegratedLastResult) {
            if (compareOutput) compareOutput.textContent = 'Calculate first to compare schemes.';
            return;
        }
        const targetKey = compareCustomSelect?.value;
        if (!targetKey) {
            if (compareOutput) compareOutput.textContent = 'Select a scheme to compare.';
            return;
        }
        const amount = Number(posbIntegratedLastResult.baseAmount || 0);
        const result = calculateProjectionForScheme(targetKey, amount, getCurrentContributionBucket());
        if (!result) {
            posbIntegratedCompareState.custom = null;
            renderCompareOutput(null, 'custom');
            return;
        }
        posbIntegratedCompareState.custom = {
            ...result,
            maturityValueRaw: result.maturity,
            interestValueRaw: result.interest,
            maturity: formatCurrency(result.maturity),
        };
        renderCompareOutput(posbIntegratedCompareState.custom);
    }

    function updateUIForScheme() {
        const mode = schemeInputMode[schemeSelect.value];
        const isSSA = schemeSelect.value === 'ssa';
        const isPPF = schemeSelect.value === 'ppf';
        const ppfIsMonthly = isPPF && ppfFrequencyInput?.value === 'monthly';
        if (mode.type === 'monthly') {
            principalLabel.textContent = 'Monthly Installment (₹)';
            principalHint.textContent = 'Amount deposited every month.';
        } else if (isPPF && ppfIsMonthly) {
            principalLabel.textContent = 'Monthly Deposit (₹)';
            principalHint.textContent = 'PPF monthly installment (annual total must be ₹500 to ₹1,50,000).';
        } else if (mode.type === 'yearly') {
            principalLabel.textContent = 'Yearly Deposit (₹)';
            principalHint.textContent = isSSA
                ? 'SSA norm: deposit between ₹250 and ₹1,50,000 per financial year for 15 years.'
                : 'Amount deposited once every year.';
        } else {
            principalLabel.textContent = 'Lump Sum Deposit (₹)';
            principalHint.textContent = 'One-time principal amount.';
        }

        if (isSSA) {
            principalInput.min = '250';
            principalInput.max = '150000';
            principalInput.step = '50';
            if ((Number(principalInput.value) || 0) < 250) principalInput.value = 250;
            if (ssaWithdrawWrap) ssaWithdrawWrap.classList.remove('hidden');
        } else {
            principalInput.min = '100';
            principalInput.removeAttribute('max');
            principalInput.step = '100';
            if (ssaWithdrawWrap) ssaWithdrawWrap.classList.add('hidden');
            if (ssaWithdrawInput) ssaWithdrawInput.value = '0';
        }

        if (isPPF) {
            if (ppfFrequencyWrap) ppfFrequencyWrap.classList.remove('hidden');
            if (ppfIsMonthly) {
                principalInput.min = '50';
                principalInput.max = '12500';
                principalInput.step = '50';
            } else {
                principalInput.min = '500';
                principalInput.max = '150000';
                principalInput.step = '100';
                if ((Number(principalInput.value) || 0) < 500) principalInput.value = 500;
            }
        } else {
            if (ppfFrequencyWrap) ppfFrequencyWrap.classList.add('hidden');
        }

        if (mode.fixDur !== null) {
            durationInput.value = mode.fixDur;
            durationInput.disabled = true;
            durationInput.classList.add('bg-slate-100', 'text-slate-500');
            durationHint.textContent = `Fixed term of ${mode.fixDur} years.`;
        } else {
            durationInput.disabled = false;
            durationInput.classList.remove('bg-slate-100', 'text-slate-500');
            if (parseFloat(durationInput.value) < mode.minDur) durationInput.value = mode.minDur;
            durationInput.min = mode.minDur;
            durationHint.textContent = `Enter number of years (Min: ${mode.minDur}).`;
        }
    }

    function calculateIntegratedPosb() {
        const conf = PO_SCHEMES_CALC[schemeMap[schemeSelect.value]];
        const p = parseFloat(principalInput.value) || 0;
        const t = parseFloat(durationInput.value);
        if (p <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        if (isNaN(t) || t <= 0) {
            alert('Please enter a valid time period.');
            return;
        }

        const mode = schemeInputMode[schemeSelect.value];
        const r = conf.rate / 100;

        if (schemeSelect.value === 'ppf') {
            const ppfMode = ppfFrequencyInput?.value === 'monthly' ? 'monthly' : 'yearly';
            let ppfBalance = 0;
            let ppfInvested = 0;

            if (ppfMode === 'yearly') {
                if (p < 500 || p > 150000) {
                    alert('PPF yearly deposit must be between ₹500 and ₹1,50,000.');
                    return;
                }
                for (let y = 1; y <= t; y++) {
                    ppfBalance += p;
                    ppfInvested += p;
                    ppfBalance += ppfBalance * r;
                }
            } else {
                const monthlyDeposit = p;
                const annualContribution = monthlyDeposit * 12;
                if (annualContribution < 500 || annualContribution > 150000) {
                    alert('PPF monthly mode requires annual contribution between ₹500 and ₹1,50,000.');
                    return;
                }
                for (let y = 1; y <= t; y++) {
                    for (let m = 1; m <= 12; m++) {
                        ppfBalance += monthlyDeposit;
                        ppfInvested += monthlyDeposit;
                    }
                    ppfBalance += ppfBalance * r;
                }
            }

            const totalInvested = Math.round(ppfInvested);
            const maturityValue = Math.round(ppfBalance);
            const totalInterest = Math.max(0, Math.round(maturityValue - totalInvested));

            resPrincipal.textContent = formatCurrency(totalInvested);
            resInterest.textContent = formatCurrency(totalInterest);
            resMaturity.textContent = formatCurrency(maturityValue);
            const ppfNote = `PPF (${ppfMode}): annual compounding projection for ${t} years.`;
            resNote.textContent = ppfNote;

            posbIntegratedLastResult = {
                scheme: 'Public Provident Fund (PPF)',
                years: t,
                depositLabel: ppfMode === 'monthly' ? `${formatCurrency(p)} monthly` : `${formatCurrency(p)} yearly`,
                depositAmount: formatCurrency(p),
                invested: formatCurrency(totalInvested),
                interest: formatCurrency(totalInterest),
                interestRaw: totalInterest,
                maturity: formatCurrency(maturityValue),
                interestPct: totalInvested ? ((totalInterest / totalInvested) * 100).toFixed(2) : '0.00',
                baseAmount: p,
                note: ppfNote,
            };

            const baseValue = maturityValue || 1;
            const investedPct = (totalInvested / baseValue) * 100;
            const interestPct = (totalInterest / baseValue) * 100;
            chartInvestedBar.style.width = '0%';
            chartInterestBar.style.width = '0%';
            setTimeout(() => {
                chartInvestedBar.style.width = `${investedPct}%`;
                chartInterestBar.style.width = `${interestPct}%`;
                chartInvestedPct.textContent = `${investedPct.toFixed(1)}%`;
                chartInterestPct.textContent = `${interestPct.toFixed(1)}%`;
            }, 100);

            emptyState.classList.add('hidden');
            resultsContainer.classList.remove('hidden');
            return;
        }

        if (schemeSelect.value === 'ssa') {
            if (p < 250 || p > 150000) {
                alert('SSA yearly deposit must be between ₹250 and ₹1,50,000.');
                return;
            }

            const requestedWithdrawal = Number(ssaWithdrawInput?.value || 0);
            if (requestedWithdrawal < 0) {
                alert('SSA withdrawal cannot be negative.');
                return;
            }

            const depositYears = Math.min(15, t);
            let ssaBalance = 0;
            let ssaInvested = 0;
            let year17Closing = 0;
            let allowedWithdrawal = 0;
            let actualWithdrawal = 0;
            for (let y = 1; y <= t; y++) {
                if (y <= depositYears) {
                    ssaBalance += p;
                    ssaInvested += p;
                }

                if (y === 18 && requestedWithdrawal > 0) {
                    allowedWithdrawal = Math.max(0, Math.round(year17Closing * 0.5));
                    actualWithdrawal = Math.min(requestedWithdrawal, allowedWithdrawal, ssaBalance);
                    ssaBalance -= actualWithdrawal;
                }

                ssaBalance += ssaBalance * r;
                if (y === 17) year17Closing = ssaBalance;
            }

            const totalInvested = Math.round(ssaInvested);
            const maturityValue = Math.round(ssaBalance);
            const totalReceived = maturityValue + Math.round(actualWithdrawal);
            const totalInterest = Math.max(0, Math.round(totalReceived - totalInvested));

            resPrincipal.textContent = formatCurrency(totalInvested);
            resInterest.textContent = formatCurrency(totalInterest);
            resMaturity.textContent = formatCurrency(maturityValue);
            const withdrawNote = actualWithdrawal > 0
                ? ` Withdrawal in 18th year: ${formatCurrency(actualWithdrawal)} (max allowed ${formatCurrency(allowedWithdrawal)}).`
                : '';
            const ssaNote = `SSA: yearly deposits for 15 years, maturity at 21 years, annual compounding.${withdrawNote}`;
            resNote.textContent = ssaNote;

            posbIntegratedLastResult = {
                scheme: 'Sukanya Samriddhi Account (SSA)',
                years: t,
                depositLabel: `${formatCurrency(p)} yearly`,
                depositAmount: formatCurrency(p),
                invested: formatCurrency(totalInvested),
                interest: formatCurrency(totalInterest),
                interestRaw: totalInterest,
                maturity: formatCurrency(maturityValue),
                interestPct: totalInvested ? ((totalInterest / totalInvested) * 100).toFixed(2) : '0.00',
                baseAmount: p,
                note: ssaNote,
            };

            const baseValue = totalReceived || 1;
            const investedPct = (totalInvested / baseValue) * 100;
            const interestPct = (totalInterest / baseValue) * 100;
            chartInvestedBar.style.width = '0%';
            chartInterestBar.style.width = '0%';
            setTimeout(() => {
                chartInvestedBar.style.width = `${investedPct}%`;
                chartInterestBar.style.width = `${interestPct}%`;
                chartInvestedPct.textContent = `${investedPct.toFixed(1)}%`;
                chartInterestPct.textContent = `${interestPct.toFixed(1)}%`;
            }, 100);

            emptyState.classList.add('hidden');
            resultsContainer.classList.remove('hidden');
            return;
        }

        const safeInitial = mode.type === 'monthly' ? 0 : p;
        const safeMonthly = mode.type === 'monthly' ? p : 0;

        let principal = safeInitial;
        let invested = safeInitial;
        let accumulatedInterest = 0;
        let paidOutInterest = 0;

        const tdAnnualYield = Math.pow(1 + r / 4, 4) - 1;

        for (let y = 1; y <= t; y++) {
            for (let m = 1; m <= 12; m++) {
                if (mode.type === 'monthly') {
                    principal += safeMonthly;
                    invested += safeMonthly;
                }
                let monthInterest = 0;
                switch (conf.logic) {
                    case 'TD':
                        if (m === 12) {
                            monthInterest = principal * tdAnnualYield;
                            paidOutInterest += monthInterest;
                        }
                        break;
                    case 'MIS':
                        monthInterest = principal * (r / 12);
                        paidOutInterest += monthInterest;
                        break;
                    case 'SCSS':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m % 3 === 0) {
                            paidOutInterest += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    case 'MSSC':
                    case 'RD':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m % 3 === 0) {
                            principal += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    case 'ANNUALLY':
                        monthInterest = principal * (r / 12);
                        accumulatedInterest += monthInterest;
                        if (m === 12) {
                            principal += accumulatedInterest;
                            accumulatedInterest = 0;
                        }
                        break;
                    case 'MONTHLY':
                    default:
                        monthInterest = principal * (r / 12);
                        principal += monthInterest;
                        break;
                }
            }
        }

        const totalInvested = Math.round(invested);
        const maturityValue = Math.round(principal + accumulatedInterest + paidOutInterest);
        const totalInterest = Math.max(0, Math.round(maturityValue - invested));

        resPrincipal.textContent = formatCurrency(totalInvested);
        resInterest.textContent = formatCurrency(totalInterest);
        resMaturity.textContent = formatCurrency(maturityValue);
        resNote.textContent = conf.desc;

        posbIntegratedLastResult = {
            scheme: schemeSelect.options[schemeSelect.selectedIndex]?.textContent?.split(' - ')[0] || schemeMap[schemeSelect.value],
            years: t,
            depositLabel: mode.type === 'monthly' ? `${formatCurrency(p)} monthly` : `${formatCurrency(p)} one-time`,
            depositAmount: formatCurrency(p),
            invested: formatCurrency(totalInvested),
            interest: formatCurrency(totalInterest),
            interestRaw: totalInterest,
            maturity: formatCurrency(maturityValue),
            interestPct: totalInvested ? ((totalInterest / totalInvested) * 100).toFixed(2) : '0.00',
            baseAmount: p,
            note: conf.desc,
        };

        const baseValue = maturityValue || 1;
        const investedPct = (totalInvested / baseValue) * 100;
        const interestPct = (totalInterest / baseValue) * 100;
        chartInvestedBar.style.width = '0%';
        chartInterestBar.style.width = '0%';
        setTimeout(() => {
            chartInvestedBar.style.width = `${investedPct}%`;
            chartInterestBar.style.width = `${interestPct}%`;
            chartInvestedPct.textContent = `${investedPct.toFixed(1)}%`;
            chartInterestPct.textContent = `${interestPct.toFixed(1)}%`;
        }, 100);

        emptyState.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
    }

    schemeSelect.addEventListener('change', () => {
        updateUIForScheme();
        emptyState.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        posbIntegratedLastResult = null;
        posbIntegratedCompareState = { custom: null };
        refreshCompareOptions();
        if (compareOutput) compareOutput.textContent = 'Select a scheme to compare.';
    });
    ppfFrequencyInput?.addEventListener('change', () => {
        updateUIForScheme();
        emptyState.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        posbIntegratedLastResult = null;
    });
    calculateBtn.addEventListener('click', calculateIntegratedPosb);
    form.addEventListener('submit', (e) => { e.preventDefault(); calculateIntegratedPosb(); });
    compareRunBtn?.addEventListener('click', runCustomCompare);
    waContactSelect?.addEventListener('change', () => {
        if (!waNumberInput) return;
        waNumberInput.value = waContactSelect.value || '';
    });
    waSendBtn?.addEventListener('click', () => {
        if (!posbIntegratedLastResult) {
            alert('Please calculate the estimate first.');
            return;
        }

        const selectedOpt = waContactSelect?.selectedOptions?.[0];
        const contactName = selectedOpt?.dataset?.name || '';
        const rawNumbers = String(waNumberInput?.value || '').trim();
        if (!rawNumbers) {
            alert('Enter a mobile number or select a contact.');
            return;
        }

        const numbers = rawNumbers.split(/[\s,;]+/).map(normalizePhone).filter(Boolean);
        if (!numbers.length) {
            alert('Enter valid 10-digit mobile number(s).');
            return;
        }

        const uniqueNumbers = [...new Set(numbers)].slice(0, 10);
        const msg = buildPosbWaMessage(contactName);
        uniqueNumbers.forEach((phone, index) => {
            setTimeout(() => {
                window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
            }, index * 120);
        });
        showToast(`WhatsApp draft opened for ${uniqueNumbers.length} contact(s).`);
    });
    resetBtn.addEventListener('click', () => {
        form.reset();
        updateUIForScheme();
        emptyState.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        posbIntegratedLastResult = null;
        posbIntegratedCompareState = { auto: null, custom: null };
        if (waNumberInput) waNumberInput.value = '';
        if (waContactSelect) waContactSelect.value = '';
        refreshCompareOptions();
        if (compareOutput) compareOutput.textContent = 'Calculate first to view suggestions.';
    });

    refreshIntegratedPosbWaContacts();
    refreshCompareOptions();
    updateUIForScheme();
    posbIntegratedReady = true;
}

async function saveSettings() {
    globalBoName = document.getElementById('set-boName').value.trim() || 'My Branch Office';
    globalBpmName = document.getElementById('set-bpmName').value.trim() || '';
    globalSpoName = document.getElementById('set-spoName').value.trim() || '';
    globalHoName = document.getElementById('set-hoName').value.trim() || '';
    await localforage.setItem('tdBillBoName', globalBoName); 
    await localforage.setItem('tdBillBpmName', globalBpmName);
    await localforage.setItem('tdBillSpo', globalSpoName); 
    await localforage.setItem('tdBillHo', globalHoName);
    await localforage.setItem('branchHolidayDates', memHolidayDates);
    document.getElementById('heroEyebrow').textContent = globalBoName; 
    document.getElementById('out-boName').textContent = globalBoName;
    const bpmField = document.getElementById('bpmName');
    if (bpmField) bpmField.value = globalBpmName;
    document.getElementById('out-bpmName').textContent = globalBpmName || '__________';
    updateHeaders();
    renderDashboard();
    showToast("Branch settings saved.");
}

function renderHolidayList() {
    const list = document.getElementById('holiday-list');
    if (!list) return;
    memHolidayDates = [...new Set(memHolidayDates)].sort();
    if (!memHolidayDates.length) {
        list.innerHTML = '<div class="holiday-empty">No additional branch holidays added.</div>';
        return;
    }
    list.innerHTML = memHolidayDates.map(date => {
        const name = memHolidayNames[date] || 'Branch Holiday';
        const formatted = parseLocalDate(date).toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
        return `<div class="holiday-item"><div><strong>${escapeHTML(name)}</strong><div class="holiday-item-date">${escapeHTML(formatted)}</div></div><button type="button" class="btn btn-icon text-danger" onclick="removeBranchHoliday('${date}')" title="Remove holiday"><i data-lucide="trash-2"></i></button></div>`;
    }).join('');
    lucide.createIcons();
}

window.addBranchHoliday = async function() {
    const dateInput = document.getElementById('holiday-date-picker');
    const nameInput = document.getElementById('holiday-name-input');
    const date = dateInput.value;
    const name = nameInput.value.trim() || 'Branch Holiday';
    if (!date) return alert('Select a holiday date.');
    if (parseLocalDate(date).getDay() === 0) return alert('Sundays are already detected automatically.');
    if (!memHolidayDates.includes(date)) memHolidayDates.push(date);
    memHolidayNames[date] = name;
    memHolidayDates.sort();
    await localforage.setItem('branchHolidayDates', memHolidayDates);
    await localforage.setItem('branchHolidayNames', memHolidayNames);
    dateInput.value = ''; nameInput.value = '';
    renderHolidayList(); renderDashboard();
    showToast(`${name} added to branch holidays.`);
};

window.removeBranchHoliday = async function(date) {
    memHolidayDates = memHolidayDates.filter(item => item !== date);
    delete memHolidayNames[date];
    await localforage.setItem('branchHolidayDates', memHolidayDates);
    await localforage.setItem('branchHolidayNames', memHolidayNames);
    renderHolidayList(); renderDashboard();
    showToast('Branch holiday removed.');
};

// --------------------------------------------------------------------------------------
// CASH BOOK LOGIC
// --------------------------------------------------------------------------------------
function getOpeningBalance(targetDate) {
    let dates = [...new Set(memCbData.map(d=>d.date)), ...Object.keys(memOverrides)].sort(); let run = 0;
    for (let d of dates) {
        if (d >= targetDate) break; if (memOverrides[d] !== undefined) run = memOverrides[d];
        let dayData = memCbData.filter(x => x.date === d);
        dayData.forEach(tx => { if (tx.type === 'receipt') run += tx.amt; else run -= tx.amt; });
    }
    if (memOverrides[targetDate] !== undefined) return memOverrides[targetDate];
    return run;
}

function initCashBook() {
    let today = getLocalISODate(); document.getElementById('cb-main-date').value = today;
    const cashNotes = [500, 200, 100, 50, 20, 10, 5, 2, 1];
    document.getElementById('cash-inputs-grid').innerHTML = cashNotes.map(n => `<div class="cash-input-card"><div class="denom-row"><span style="color:var(--brand-red);">₹${n}</span><span id="ct-${n}" style="font-size:0.875rem; color:var(--text-muted);">₹0</span></div><input type="number" id="c-${n}" min="0" oninput="calcCash()" placeholder="0"></div>`).join("");
    loadCashBookDate(); checkTallyDate(); renderCashHistory();
}

function loadCashBookDate() {
    let selectedDate = document.getElementById('cb-main-date').value;
    let cbState = memCbStates[selectedDate] || {};
    let treasuryState = getTreasuryWorkflowState(selectedDate);
    document.getElementById('cb-boda-remark').value = memCbStates[selectedDate]?.bodaRemark || "";
    setTreasuryBanner(treasuryState.isHoliday ? `No transactions today. ${treasuryState.closedReason}.` : '');
    if (!memCbStates[selectedDate]?.cashVerified) {
        let prevTallies = memTallyHist.filter(t => t.date < selectedDate).sort((a,b)=>a.date.localeCompare(b.date));
        if (prevTallies.length > 0) {
            let lastTally = prevTallies[prevTallies.length - 1];
            document.getElementById('ver-current-date').textContent = selectedDate; document.getElementById('ver-date').textContent = lastTally.date; document.getElementById('ver-total').textContent = money(lastTally.total);
            let details = [500,200,100,50,20,10,5,2,1].map(n => lastTally.notes[n] ? `${lastTally.notes[n]} x ₹${n}` : null).filter(x=>x).join('<br>');
            document.getElementById('ver-details').innerHTML = details || 'No physical notes recorded.'; document.getElementById('verifyCashModal').style.display = 'flex'; return;
        }
    }
    let opBal = getOpeningBalance(selectedDate); let running = opBal; let todayEntries = memCbData.filter(d => d.date === selectedDate).sort((a,b) => a.id - b.id);
    let totRec = 0, totPay = 0;
    todayEntries.forEach(d => { if (d.type === 'receipt') { running += d.amt; totRec += d.amt; } else { running -= d.amt; totPay += d.amt; } d.balance = running; });
    
    document.getElementById('cb-op-bal').textContent = money(opBal); document.getElementById('cb-tot-rec').textContent = money(totRec); document.getElementById('cb-tot-pay').textContent = money(totPay); document.getElementById('cb-cur-bal').textContent = money(running);
    document.getElementById('cb-table-body').innerHTML = todayEntries.map(d => `<tr><td style="text-align:left;">${escapeHTML(d.desc)}</td><td class="text-right text-success">${d.type==='receipt'?money(d.amt):'-'}</td><td class="text-right text-danger">${d.type==='payment'?money(d.amt):'-'}</td><td class="text-right" style="font-weight:600;">${money(d.balance)}</td><td class="no-print text-right"><button class="btn-icon" onclick="deleteCbRow(${d.id})"><i data-lucide="x"></i></button></td></tr>`).join('');
    lucide.createIcons();

    const treasuryHeroOpen = document.getElementById('treasury-hero-open');
    const treasuryHeroClose = document.getElementById('treasury-hero-close');
    const treasuryHeroPhysical = document.getElementById('treasury-hero-physical');
    const treasuryHeroStatus = document.getElementById('treasury-hero-status');
    const treasuryHeroNote = document.getElementById('treasury-hero-note');
    const physicalCash = [500,200,100,50,20,10,5,2,1].reduce((sum, denom) => sum + (Number(document.getElementById(`c-${denom}`)?.value || 0) * denom), 0);
    if (treasuryHeroOpen) treasuryHeroOpen.textContent = money(opBal);
    if (treasuryHeroClose) treasuryHeroClose.textContent = money(running);
    if (treasuryHeroPhysical) treasuryHeroPhysical.textContent = money(physicalCash);
    const formsContainer = document.getElementById('cb-forms-container');
    const saveCashBookBtn = document.getElementById('btn-save-cb');
    const modifyCashBookBtn = document.getElementById('btn-modify-cb');
    const tallyEntryBtn = document.getElementById('btn-add-treasury-entry');
    const denominationInputs = [500,200,100,50,20,10,5,2,1].map(n => document.getElementById(`c-${n}`)).filter(Boolean);
    const tallySaveBtn = document.getElementById('btn-save-tally');
    const tallyDeleteBtn = document.getElementById('btn-delete-tally');

    if (treasuryHeroStatus) treasuryHeroStatus.textContent = treasuryState.isHoliday ? 'Holiday' : treasuryState.isLocked ? 'Day Ended' : treasuryState.isSaved ? 'Closed' : 'Open';
    if (treasuryHeroNote) treasuryHeroNote.textContent = treasuryState.isHoliday ? `No transactions today. ${treasuryState.closedReason}.` : treasuryState.isLocked ? 'Treasury is locked for the day.' : treasuryState.isSaved ? 'Treasury closed and ready for tally.' : 'Ready for receipt posting.';
    if (treasuryState.isHoliday) {
        if (formsContainer) formsContainer.style.display = 'none';
        if (saveCashBookBtn) saveCashBookBtn.style.display = 'none';
        if (modifyCashBookBtn) modifyCashBookBtn.style.display = 'none';
        if (document.getElementById('cb-status-badge')) { document.getElementById('cb-status-badge').textContent = '🏖 HOLIDAY'; document.getElementById('cb-status-badge').style.background = '#ffedd5'; document.getElementById('cb-status-badge').style.color = '#9a3412'; }
    } else if (treasuryState.isLocked) {
        if (formsContainer) formsContainer.style.display = 'none';
        if (saveCashBookBtn) saveCashBookBtn.style.display = 'none';
        if (modifyCashBookBtn) modifyCashBookBtn.style.display = 'inline-flex';
        if (document.getElementById('cb-status-badge')) { document.getElementById('cb-status-badge').textContent = '✅ DAY END'; document.getElementById('cb-status-badge').style.background = '#dcfce7'; document.getElementById('cb-status-badge').style.color = '#166534'; }
    } else if (treasuryState.isSaved) {
        if (formsContainer) formsContainer.style.display = 'none';
        if (saveCashBookBtn) saveCashBookBtn.style.display = 'none';
        if (modifyCashBookBtn) modifyCashBookBtn.style.display = 'inline-flex';
        if (document.getElementById('cb-status-badge')) { document.getElementById('cb-status-badge').textContent = '🔒 TREASURY CLOSED'; document.getElementById('cb-status-badge').style.background = '#dbeafe'; document.getElementById('cb-status-badge').style.color = '#1e40af'; }
    } else {
        if (formsContainer) { formsContainer.style.display = 'grid'; formsContainer.style.gridTemplateColumns = '1fr 1fr'; formsContainer.style.gap = '24px'; }
        if (saveCashBookBtn) saveCashBookBtn.style.display = 'inline-flex';
        if (modifyCashBookBtn) modifyCashBookBtn.style.display = 'none';
        if (document.getElementById('cb-status-badge')) { document.getElementById('cb-status-badge').textContent = '✏️ TREASURY OPEN'; document.getElementById('cb-status-badge').style.background = '#ffe4e6'; document.getElementById('cb-status-badge').style.color = '#e11d48'; }
    }
    const tallyInputsDisabled = treasuryState.isHoliday || treasuryState.isLocked || !treasuryState.isSaved;
    denominationInputs.forEach(input => { input.disabled = tallyInputsDisabled; });
    if (tallySaveBtn) {
        tallySaveBtn.disabled = treasuryState.isHoliday || !treasuryState.isSaved;
        if (treasuryState.isHoliday) tallySaveBtn.innerHTML = "<i data-lucide='ban'></i> No Transactions Today";
        else if (treasuryState.isLocked) tallySaveBtn.innerHTML = "<i data-lucide='save'></i> Day Ended";
        else if (treasuryState.isSaved) tallySaveBtn.innerHTML = "<i data-lucide='save'></i> Lock Day & Save Tally";
        else tallySaveBtn.innerHTML = "<i data-lucide='lock'></i> Close Treasury First";
    }
    if (tallyEntryBtn) tallyEntryBtn.disabled = treasuryState.isHoliday || treasuryState.isLocked || !treasuryState.isSaved;
    if (tallyDeleteBtn && treasuryState.isHoliday) tallyDeleteBtn.style.display = 'none';
    checkTallyDate();
}

async function saveBodaRemark() { let date = document.getElementById('cb-main-date').value; let remark = document.getElementById('cb-boda-remark').value.trim(); if (!memCbStates[date]) memCbStates[date] = {}; memCbStates[date].bodaRemark = remark; await localforage.setItem('cashBookStatesV2', memCbStates); showToast("💾 Remark saved!"); }
async function confirmCashVerification() { let selectedDate = document.getElementById('cb-main-date').value; if (!memCbStates[selectedDate]) memCbStates[selectedDate] = {}; memCbStates[selectedDate].cashVerified = true; await localforage.setItem('cashBookStatesV2', memCbStates); document.getElementById('verifyCashModal').style.display = 'none'; loadCashBookDate(); }
function openOverrideModal() { document.getElementById('override-date').textContent = document.getElementById('cb-main-date').value; document.getElementById('override-input').value = ''; document.getElementById('override-confirm').value = ''; document.getElementById('override-save-btn').disabled = true; document.getElementById('overrideModal').style.display = 'flex'; }
function closeOverrideModal() { document.getElementById('overrideModal').style.display = 'none'; }
function checkOverrideConfirm() { document.getElementById('override-save-btn').disabled = (document.getElementById('override-confirm').value !== 'OVERRIDE'); }
async function saveOverride() { const d = document.getElementById('cb-main-date').value; const raw = document.getElementById('override-input').value.trim(); const amt = Number(raw); if (!d || raw === '' || !Number.isFinite(amt) || amt < 0) return alert("Enter a valid non-negative opening balance."); memOverrides[d] = amt; await localforage.setItem('manualOverridesV5', memOverrides); document.getElementById('overrideModal').style.display = 'none'; showToast("⚠️ Opening Balance Mathematically Overridden."); loadCashBookDate(); }
async function addCashBookEntry(type) {
    const date = document.getElementById('cb-main-date').value; const scheme = document.getElementById(`cb-${type.substring(0,3)}-scheme`).value; const descRaw = document.getElementById(`cb-${type.substring(0,3)}-desc`).value.trim(); const amt = Number(document.getElementById(`cb-${type.substring(0,3)}-amt`).value);
    const treasuryState = getTreasuryWorkflowState(date);
    if (treasuryState.closedReason) return alert(`No treasury transactions are allowed on ${treasuryState.closedReason}.`);
    if (treasuryState.isSaved || treasuryState.isLocked) return alert('Treasury is closed for the day. Re-open it before adding entries.');
    if(!date || !Number.isFinite(amt) || amt <= 0) return alert("Enter an amount greater than zero.");
    const desc = scheme.includes('General') ? (descRaw || 'Other') : (descRaw ? `[${scheme}] ${descRaw}` : `[${scheme}]`);
    memCbData.push({ id: Date.now(), date, desc, type, amt }); await localforage.setItem('cashBookDataV2', memCbData); document.getElementById(`cb-${type.substring(0,3)}-desc`).value = ''; document.getElementById(`cb-${type.substring(0,3)}-amt`).value = ''; loadCashBookDate();
}
async function deleteCbRow(id) { if(confirm("Delete this entry?")) { memCbData = memCbData.filter(d => d.id !== id); await localforage.setItem('cashBookDataV2', memCbData); loadCashBookDate(); } }
async function saveCashBookDate() { let date = document.getElementById('cb-main-date').value; const treasuryState = getTreasuryWorkflowState(date); if (treasuryState.closedReason) return alert(`No treasury transactions are allowed on ${treasuryState.closedReason}.`); let closeBal = Number(document.getElementById('cb-cur-bal').textContent.replace(/[^\d.-]/g, '')); if (!memCbStates[date]) memCbStates[date] = {}; memCbStates[date].saved = true; memCbStates[date].closingBalance = closeBal; await localforage.setItem('cashBookStatesV2', memCbStates); loadCashBookDate(); openCashTallyMenu(); }
async function modifyCashBookDate() { let date = document.getElementById('cb-main-date').value; if(memCbStates[date]?.tallyLocked) return alert("Cannot re-open Treasury. Unlock tally first."); if(memCbStates[date]) { memCbStates[date].saved = false; await localforage.setItem('cashBookStatesV2', memCbStates); } loadCashBookDate(); }

// --------------------------------------------------------------------------------------
// CASH TALLY LOGIC
// --------------------------------------------------------------------------------------
function checkTallyDate() {
    let d = document.getElementById('cb-main-date').value; document.getElementById('tally-link-date').textContent = d;
    const treasuryState = getTreasuryWorkflowState(d);
    let isSaved = treasuryState.isSaved; let cbBal = treasuryState.state ? treasuryState.state.closingBalance : 0;
    document.getElementById('tally-link-bal').textContent = isSaved ? money(cbBal) : '₹---';
    const statusBadge = document.getElementById('tally-link-status'); const saveBtn = document.getElementById('btn-save-tally');
    let existingIdx = memTallyHist.findIndex(t => t.date === d);
    document.getElementById('btn-delete-tally').style.display = existingIdx !== -1 ? 'inline-block' : 'none';
    if (treasuryState.isHoliday) { statusBadge.innerHTML = `🏖 ${escapeHTML(treasuryState.closedReason)}`; statusBadge.style.background = "#ffedd5"; statusBadge.style.color = "#9a3412"; saveBtn.disabled = true; saveBtn.innerHTML = "<i data-lucide='ban'></i> No Transactions Today"; }
    else if(!isSaved) { statusBadge.innerHTML = "⚠️ Treasury NOT Closed"; statusBadge.style.background = "#fef2f2"; statusBadge.style.color = "var(--danger)"; saveBtn.disabled = true; saveBtn.innerHTML = "<i data-lucide='lock'></i> Close Treasury First"; } 
    else if (treasuryState.isLocked) { statusBadge.innerHTML = "🔒 Day Ended"; statusBadge.style.background = "#dcfce7"; statusBadge.style.color = "#166534"; saveBtn.disabled = false; saveBtn.innerHTML = "<i data-lucide='save'></i> Replace Saved Tally"; } 
    else { statusBadge.innerHTML = "✅ Treasury Closed"; statusBadge.style.background = "#dbeafe"; statusBadge.style.color = "#1e40af"; saveBtn.disabled = false; saveBtn.innerHTML = "<i data-lucide='save'></i> Lock Day & Save Tally"; }
    lucide.createIcons(); calcCash();
}
function calcCash() {
    let tot=0; [500, 200, 100, 50, 20, 10, 5, 2, 1].forEach(n => { let v = Number(document.getElementById('c-'+n).value||0)*n; document.getElementById('ct-'+n).textContent = money(v); tot+=v; });
    document.getElementById('cash-total-val-td').textContent = money(tot); document.getElementById('cash-words-val').textContent = tot === 0 ? "Zero Rupees Only" : toWords(tot) + " Rupees Only";
    let d = document.getElementById('cb-main-date').value; let cbBal = memCbStates[d] && memCbStates[d].saved ? memCbStates[d].closingBalance : 0; let diffEl = document.getElementById('tally-diff');
    if (memCbStates[d] && memCbStates[d].saved) { let diff = tot - cbBal; if(diff === 0) { diffEl.innerHTML = '✅ Tally matches perfectly'; diffEl.style.color = 'var(--success)'; } else { diffEl.innerHTML = `⚠️ Difference: ${money(diff)}`; diffEl.style.color = 'var(--danger)'; } } else { diffEl.innerHTML = 'Close Treasury to check difference.'; diffEl.style.color = 'var(--text-muted)'; }
}

function clearCashTally() { [500,200,100,50,20,10,5,2,1].forEach(n => document.getElementById('c-'+n).value=''); calcCash(); }
async function saveCashTally() {
    let d = document.getElementById('cb-main-date').value; const treasuryState = getTreasuryWorkflowState(d); if (treasuryState.closedReason) return alert(`No treasury transactions are allowed on ${treasuryState.closedReason}.`); if(!treasuryState.isSaved) return alert("You must close the treasury for this date before saving the tally.");
    let tot = Number(document.getElementById('cash-total-val-td').textContent.replace(/[^\d.-]/g, '')); if(tot === 0) return alert("Cannot save empty tally.");
    let existingIdx = memTallyHist.findIndex(t => t.date === d); if (existingIdx !== -1) { if(!confirm(`A tally for ${d} already exists. Replace?`)) return; memTallyHist.splice(existingIdx, 1); }
    let name = document.getElementById('cash-tally-name').value.trim() || `Tally for ${d}`; let notesData = {}; [500,200,100,50,20,10,5,2,1].forEach(n => { notesData[n] = Number(document.getElementById('c-'+n).value)||0; });
    memTallyHist.unshift({ label: name, total: tot, date: d, notes: notesData, savedAt: Date.now() }); if(memTallyHist.length > 20) memTallyHist.splice(20);
    memCbStates[d].tallyLocked = true; await localforage.setItem('cashBookStatesV2', memCbStates); await localforage.setItem('cashTallyHistory', memTallyHist);
    renderCashHistory(); loadCashBookDate(); openCashTallyMenu(); showToast("🔒 Day Ended! Tally saved and locked.");
}
async function deleteLoadedTally() { let d = document.getElementById('cb-main-date').value; let existingIdx = memTallyHist.findIndex(t => t.date === d); if (existingIdx !== -1) { if(!confirm(`Delete the Cash Tally for ${d}?`)) return; memTallyHist.splice(existingIdx, 1); if(memCbStates[d]) memCbStates[d].tallyLocked = false; await localforage.setItem('cashTallyHistory', memTallyHist); await localforage.setItem('cashBookStatesV2', memCbStates); clearCashTally(); showToast("🗑 Tally deleted."); loadCashBookDate(); renderCashHistory(); } }
function renderCashHistory() { const el = document.getElementById('cashHistoryList'); if(!memTallyHist.length) return el.innerHTML='<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.875rem; border:1px dashed var(--border); border-radius:8px;">No saved tallies yet.</div>'; el.innerHTML = memTallyHist.map((b,i) => `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input);"><div><strong style="display:block; font-size:0.875rem;">${b.label}</strong><span style="font-size:0.75rem; color:var(--text-muted);">Total: ${money(b.total)} · Date: ${b.date}</span></div><button class="btn btn-outline" onclick="loadCashTally(${i})" style="height:auto;">Load</button></div>`).join(""); }
window.loadCashTally = function(i) { if(!confirm("Load this tally? Current inputs will be replaced.")) return; const b = memTallyHist[i]; document.getElementById('cash-tally-name').value = b.label; document.getElementById('cb-main-date').value = b.date; loadCashBookDate(); [500,200,100,50,20,10,5,2,1].forEach(n => { document.getElementById(`c-${n}`).value = b.notes[n] || ''; }); calcCash(); }

function printBoda() {
    let d = document.getElementById('cb-main-date').value; document.getElementById('boda-date').textContent = parseLocalDate(d).toLocaleDateString('en-IN'); document.getElementById('boda-bo').textContent = globalBoName; document.getElementById('boda-ao').textContent = globalSpoName || globalHoName || '___________';
    let opBal = document.getElementById('cb-op-bal').textContent; let clBal = document.getElementById('cb-cur-bal').textContent; let totRec = document.getElementById('cb-tot-rec').textContent; let totPay = document.getElementById('cb-tot-pay').textContent;
    let todayCb = memCbData.filter(x => x.date === d);
    let recHtml = `<tr><td style="padding:4px; font-weight:bold;">Opening Balance</td><td style="text-align:right; padding:4px; font-weight:bold;">${opBal}</td></tr>`;
    let payHtml = '';
    todayCb.forEach(x => { if(x.type === 'receipt') recHtml += `<tr><td>${escapeHTML(x.desc)}</td><td>${money(x.amt)}</td></tr>`; else payHtml += `<tr><td>${escapeHTML(x.desc)}</td><td>${money(x.amt)}</td></tr>`; });
    document.getElementById('boda-rec-body').innerHTML = recHtml; document.getElementById('boda-pay-body').innerHTML = payHtml || '<tr><td colspan="2" style="text-align:center; padding:4px;">No entries</td></tr>';
    document.getElementById('boda-tot-rec').textContent = totRec; document.getElementById('boda-cl-bal').textContent = clBal; document.getElementById('boda-tot-pay').textContent = totPay;
    let gRec = Number(opBal.replace(/[^\d.-]/g, '')) + Number(totRec.replace(/[^\d.-]/g, '')); let gPay = Number(clBal.replace(/[^\d.-]/g, '')) + Number(totPay.replace(/[^\d.-]/g, ''));
    document.getElementById('boda-grand-rec').textContent = money(gRec); document.getElementById('boda-grand-pay').textContent = money(gPay);
    document.getElementById('boda-cl-bal-words').textContent = Number(clBal.replace(/[^\d.-]/g, '')) === 0 ? "Zero Rupees Only" : toWords(Number(clBal.replace(/[^\d.-]/g, ''))) + " Rupees Only";
    let tally = memTallyHist.find(t => t.date === d);
    if(tally) { let details = [500,200,100,50,20,10,5,2,1].map(n => tally.notes[n] ? `₹${n} x ${tally.notes[n]} = ₹${n * tally.notes[n]}` : null).filter(x=>x).join('\n'); document.getElementById('boda-notes-breakdown').textContent = details + `\n\nTotal Cash: ${money(tally.total)}`; } else { document.getElementById('boda-notes-breakdown').textContent = "Physical tally not yet locked for this date."; }
    let remark = document.getElementById('cb-boda-remark').value.trim(); if(remark) { document.getElementById('boda-remark-section').style.display = 'block'; document.getElementById('boda-remark-text').textContent = remark; } else { document.getElementById('boda-remark-section').style.display = 'none'; }
    document.body.classList.remove('printing-bill', 'printing-rates', 'printing-ledger', 'printing-slip'); printModule('Cash_Book_BODA_BO_Slip', 'printing-boda');
}

// --------------------------------------------------------------------------------------
// TD BILL LOGIC
// --------------------------------------------------------------------------------------
function getNextPrNo() { let startIdx = Math.max(0, memTdEntries.length - 50); let used = memTdEntries.slice(startIdx).map(e => Number(e.prNo)); for(let i=1; i<=50; i++) { if(!used.includes(i)) return i; } return 1; }
function checkDuplicate(){ const acc=(document.getElementById('accNo')?.value||'').trim(); document.getElementById('dupWarning').style.display=(acc.length>=9 && memTdEntries.some(e=>String(e.accNo || '').includes(acc) && e!==memTdEntries[modifyIndex])) ? 'block' : 'none'; }
function getTdEntryOpenDate(entry) {
    if (entry.openDate) return entry.openDate;
    const ledgerEntry = memAccReg.find(reg => reg.acc === entry.accNo);
    return ledgerEntry?.date || '';
}
function getFinancialYear(dateStr) {
    if (!dateStr) return '--';
    const date = parseLocalDate(dateStr);
    if (Number.isNaN(date.getTime())) return '--';
    const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
}
function compareTdBillEntries(a, b) {
    const dateA = getTdEntryOpenDate(a);
    const dateB = getTdEntryOpenDate(b);
    if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    const prDiff = (parseInt(a.prNo) || 99999) - (parseInt(b.prNo) || 99999);
    if (prDiff !== 0) return prDiff;
    return String(a.accNo || '').localeCompare(String(b.accNo || ''));
}

function updatePreview() {
    const amt=Number(document.getElementById('depAmount')?.value||0); 
    const term=Number(document.getElementById('tdTerm')?.value||1); 
    document.getElementById('previewAmount').textContent=amt; 
    document.getElementById('previewTerm').textContent=term; 
    
    // Ensure precision by removing .0 dynamically
    const ratePct = ((INCENTIVE_RATES[term]||0)*100);
    document.getElementById('previewPercent').textContent = ratePct % 1 === 0 ? ratePct.toFixed(0) : ratePct.toFixed(1);
    document.getElementById('previewIncentive').textContent=Math.round(amt*(INCENTIVE_RATES[term]||0)); 
}

function updateRunningTotal(){ const amt=Number(document.getElementById('depAmount')?.value||0); const term=Number(document.getElementById('tdTerm')?.value||1); const thisInc=Math.round(amt*(INCENTIVE_RATES[term]||0)); const curTotal=memTdEntries.reduce((s,e)=>s+e.incentive,0); document.getElementById('rt-newTotal').textContent=money(curTotal+thisInc); document.getElementById('rt-nextPr').textContent=getNextPrNo(); }

function requestAddEntry(){
  let accNoRaw = document.getElementById('accNo').value.trim(); const depName = document.getElementById('depName').value.trim(); const deposit = Number(document.getElementById('depAmount').value); const term = document.getElementById('tdTerm').value; let prNoRaw = document.getElementById('prNo').value.trim();
  if(accNoRaw.length === 9) accNoRaw = '020' + accNoRaw; else if(accNoRaw.length > 0 && accNoRaw.length !== 12) return alert("Account number must be exactly 9 or 12 digits.");
  const accNo = accNoRaw; let prNo = prNoRaw ? parseInt(prNoRaw) : getNextPrNo();
  if(!accNo || !depName || !Number.isFinite(deposit) || deposit < 1000) return alert("Fill required fields and enter a deposit of at least ₹1,000.");
  let startIdx = Math.max(0, memTdEntries.length - 50); let last50 = memTdEntries.slice(startIdx); if(last50.some(e => Number(e.prNo) === prNo)) { if(!confirm(`⚠️ PR Number ${prNo} is already used. Duplicate?`)) return; }
  const incentive=Math.round(deposit*(INCENTIVE_RATES[term]||0));
  const ledgerEntry = memAccReg.find(reg => reg.acc === accNo);
  pendingEntry={accNo, depName, prNo, deposit, term, incentive, openDate: ledgerEntry?.date || ''};
  
  // Format term string grammatically
  const termDisplay = term + (term == 1 ? ' Year' : ' Years');
  document.getElementById('modal-accNo').textContent=accNo; document.getElementById('modal-depName').textContent=depName; document.getElementById('modal-prNo').textContent=prNo; document.getElementById('modal-term').textContent=termDisplay; document.getElementById('modal-depAmount').textContent='₹'+deposit; document.getElementById('modal-incentive').textContent='₹'+incentive; document.getElementById('confirmModal').style.display='flex';
}
function closeModal(){document.getElementById('confirmModal').style.display='none'; pendingEntry=null;}
async function confirmAddEntry(){ if(!pendingEntry)return; memTdEntries.push(pendingEntry); await localforage.setItem('tdBillEntries', memTdEntries); closeModal(); renderTable(); updateRunningTotal(); document.getElementById('prNo').value = getNextPrNo(); document.getElementById('accNo').value=''; document.getElementById('depName').value=''; document.getElementById('depAmount').value=''; document.getElementById('dupWarning').style.display='none'; document.getElementById('accNo').focus(); }

window.syncTdFromLedger = async function() {
    let addedCount = 0;
    let skippedCount = 0;
    const targetMonth = document.getElementById('billMonth').value;

    if (!targetMonth) {
        if (!confirm("No Bill Month is selected. Do you want to sync ALL unsynced TD accounts from the entire ledger history?")) {
            return;
        }
    }

    memAccReg.forEach(reg => {
        if (!String(reg.scheme || '').includes('TD')) return;
        if (targetMonth && !String(reg.date || '').startsWith(targetMonth)) return;
        if (!reg.acc) { skippedCount++; return; }

        const exists = memTdEntries.some(e => e.accNo === reg.acc);
        if (exists) return;

        let term = 1;
        if (reg.scheme.includes('2Y')) term = 2;
        if (reg.scheme.includes('3Y')) term = 3;
        if (reg.scheme.includes('5Y')) term = 5;

        const incentive = Math.round(reg.amt * (INCENTIVE_RATES[term] || 0));
        const prNo = reg.prNo ? reg.prNo : getNextPrNo();

        memTdEntries.push({
            accNo: reg.acc,
            depName: reg.name,
            prNo: prNo,
            deposit: reg.amt,
            term: term.toString(),
            incentive: incentive,
            openDate: reg.date
        });
        addedCount++;
    });

    if (addedCount > 0) {
        await localforage.setItem('tdBillEntries', memTdEntries);
        renderTable();
        updateRunningTotal();
        const monthText = targetMonth ? ' for the selected month' : '';
        showToast(`✅ Synced ${addedCount} TD accounts${monthText}!`);
    } else {
        const monthText = targetMonth ? ' for this month' : '';
        showToast(`ℹ️ No new TD accounts found to sync${monthText}.`);
    }

    if (skippedCount > 0) {
        setTimeout(() => showToast(`Skipped ${skippedCount} TD ledger row(s) without account numbers.`), 4500);
    }
}

function renderTable() {
    let total = 0, dep = 0; 
    const q=(document.getElementById('searchInput')?.value||'').toLowerCase(); 
    const filtered=memTdEntries.filter(e=>String(e.depName || '').toLowerCase().includes(q)||String(e.accNo || '').includes(q)).sort(compareTdBillEntries);
    document.getElementById('entryCount').textContent=q?`${filtered.length} of ${memTdEntries.length} entries`:`${memTdEntries.length} entries`;
    
    document.getElementById('tableBody').innerHTML = filtered.map((e,fi) => { 
        const i=memTdEntries.indexOf(e); 
        const deposit = Number(e.deposit) || 0;
        const incentive = Number(e.incentive) || 0;
        total+=incentive; 
        dep+=deposit; 
        
        // Exact Grammatical Term Text
        const displayTerm = `${escapeHTML(e.term)} Year${e.term == 1 ? '' : 's'}`;
        // Exact Percentage Number handling format rules dynamically (e.g., 0.5% stays 0.5%, 1% stays 1%)
        const ratePct = ((INCENTIVE_RATES[e.term]||0)*100);
        const displayRate = ratePct % 1 === 0 ? ratePct.toFixed(0) : ratePct.toFixed(1);

        return `<tr>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${fi+1}</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${escapeHTML(e.accNo)}</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${escapeHTML(e.depName)}</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${escapeHTML(e.prNo)}</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${deposit}</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;"><em>${displayTerm}</em></td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${displayRate}%</td>
            <td style="border: 1px solid #000; padding: 8px 4px; text-align: center;">${incentive}</td>
            <td class="no-print text-right">
                <button class="btn-icon" onclick="openModifyModal(${i})"><i data-lucide="pencil" style="width:14px; height:14px;"></i></button>
                <button class="btn-icon text-danger" onclick="deleteTdEntry(${i})"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </td>
        </tr>`; 
    }).join("");
    
    lucide.createIcons(); 
    let depEl = document.getElementById('out-totalDep'); if(depEl) depEl.textContent = dep; 
    document.getElementById('out-totalInc').textContent = total; 
    document.getElementById('sum-entries').textContent = memTdEntries.length; 
    document.getElementById('sum-incentive').textContent = money(total); 
    document.getElementById('sum-deposit').textContent = money(dep);
    const avgEl = document.getElementById('sum-avg');
    if (avgEl) avgEl.textContent = money(memTdEntries.length ? total / memTdEntries.length : 0);
    
    ['out-incNum1','out-incNum2'].forEach(id=>{let el=document.getElementById(id); if(el)el.textContent=total;}); 
    const words=total===0?'Zero':toWords(total); 
    ['out-incWords1','out-incWords2'].forEach(id=>{let el=document.getElementById(id); if(el)el.textContent=words;}); 
    let dTimeEl = document.getElementById('footerDateTime'); if(dTimeEl) dTimeEl.textContent=new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
}

function openModifyModal(i){ modifyIndex=i; const e=memTdEntries[i]; document.getElementById('mod-accNo').value=e.accNo; document.getElementById('mod-depName').value=e.depName; document.getElementById('mod-prNo').value=e.prNo; document.getElementById('mod-depAmount').value=e.deposit; document.getElementById('mod-tdTerm').value=e.term; updateModPreview(); document.getElementById('modifyModal').style.display='flex'; }
function closeModifyModal(){document.getElementById('modifyModal').style.display='none'; modifyIndex=-1;}
function updateModPreview(){document.getElementById('mod-preview').textContent=money(Math.round(Number(document.getElementById('mod-depAmount')?.value||0)*(INCENTIVE_RATES[Number(document.getElementById('mod-tdTerm')?.value||1)]||0)));}
async function saveModifiedEntry(){ if(modifyIndex<0)return; const accNo=document.getElementById('mod-accNo').value, depName=document.getElementById('mod-depName').value.trim(), prNo=document.getElementById('mod-prNo').value, deposit=Number(document.getElementById('mod-depAmount').value), term=document.getElementById('mod-tdTerm').value; if (accNo.length !== 12 || !depName || !Number.isFinite(deposit) || deposit < 1000) return alert("Enter a 12-digit account number, customer name, and deposit of at least ₹1,000."); const ledgerEntry = memAccReg.find(reg => reg.acc === accNo); memTdEntries[modifyIndex]={accNo,depName,prNo,deposit,term,incentive:Math.round(deposit*(INCENTIVE_RATES[term]||0)),openDate:ledgerEntry?.date || memTdEntries[modifyIndex].openDate || ''}; await localforage.setItem('tdBillEntries', memTdEntries); closeModifyModal(); renderTable(); updateRunningTotal(); }
async function deleteTdEntry(i) { memTdEntries.splice(i,1); await localforage.setItem('tdBillEntries', memTdEntries); renderTable(); updateRunningTotal(); }
function printBill() { printModule('TD_Commission_Bill', 'printing-bill'); }

function getFormattedDate(dateStr) { if(!dateStr) return '__________'; const d = parseLocalDate(dateStr); const date = d.getDate(); const nth = (date > 3 && date < 21) ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][date % 10]; return `${date}<sup>${nth}</sup> ${d.toLocaleString('en-IN', { month: 'long' })}, ${d.getFullYear()}`; }
async function updateHeaders(){
    const bmVal = document.getElementById('billMonth').value;
    let formattedMonth = '__________';
    if (bmVal) {
        const [year, month] = bmVal.split('-');
        const dateObj = new Date(Number(year), Number(month) - 1);
        formattedMonth = dateObj.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    }

    const outBillMonth = document.getElementById('out-billMonth');
    if (outBillMonth) outBillMonth.textContent = formattedMonth;

    const outBoName = document.getElementById('out-boName');
    if (outBoName) outBoName.textContent = globalBoName || '__________';

    ['bpmName','bpmAcc','spoName','hoName'].forEach(id => {
        const el = document.getElementById(id);
        const outEl = document.getElementById('out-' + id);
        if (el && outEl) outEl.textContent = el.value || '__________';
    });

    const bd = document.getElementById('billDate')?.value;
    if (document.getElementById('out-billDate')) {
        document.getElementById('out-billDate').innerHTML = bd ? getFormattedDate(bd) : '__________';
    }

    globalBpmName = document.getElementById('bpmName').value;
    const settingsBpmField = document.getElementById('set-bpmName');
    if (settingsBpmField) settingsBpmField.value = globalBpmName;
    globalSpoName = document.getElementById('spoName').value;
    globalHoName = document.getElementById('hoName').value;

    const spoWrap = document.getElementById('out-spoNameWrapper');
    if (spoWrap) spoWrap.textContent = globalSpoName ? ` via ${globalSpoName}` : '';

    await localforage.setItem('tdBillBpmName', globalBpmName);
    await localforage.setItem('tdBillSpo', globalSpoName);
    await localforage.setItem('tdBillHo', globalHoName);
}

function openNewBillModal(){ const y=new Date().getFullYear(),m=String(new Date().getMonth()+1).padStart(2,'0'); document.getElementById('newBillLabel').value=`${m}/${y} Bill`; document.getElementById('newBillModal').style.display='flex'; }
function closeNewBillModal(){document.getElementById('newBillModal').style.display='none';}
async function confirmNewBill() { const label=document.getElementById('newBillLabel').value.trim()||'Untitled Bill'; if(memTdEntries.length){ memTdHist.unshift({label,entries:JSON.parse(JSON.stringify(memTdEntries)),savedAt:Date.now()}); if(memTdHist.length>20) memTdHist.splice(20); await localforage.setItem('tdBillHistory', memTdHist); } memTdEntries=[]; await localforage.setItem('tdBillEntries', []); document.getElementById('newBillModal').style.display='none'; renderTable(); renderHistory(); }
async function clearTable() { if(!memTdEntries.length)return; if(confirm('Clear all entries from the current bill?')){ memTdEntries=[]; await localforage.setItem('tdBillEntries',[]); renderTable(); } }
function renderHistory(){ const el=document.getElementById('historyList'); if(!memTdHist.length){el.innerHTML='<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.875rem; border:1px dashed var(--border); border-radius:8px;">No saved bills yet.</div>';return;} el.innerHTML=memTdHist.map((b,i)=>`<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-card);"><div><strong style="display:block; font-size:0.875rem;">${escapeHTML(b.label||'Untitled Bill')}</strong><span style="font-size:0.75rem; color:var(--text-muted);">${b.entries.length} entries · Total inc: ₹${b.entries.reduce((s,e)=>s+e.incentive,0)}</span></div><div style="display:flex; gap:8px;"><button class="btn btn-outline" onclick="loadBill(${i})">Load</button><button class="btn btn-icon text-danger" onclick="deleteBillHist(${i})"><i data-lucide="trash-2"></i></button></div></div>`).join(""); lucide.createIcons(); }
async function loadBill(i){ if(!confirm("Load this bill?"))return; memTdEntries=JSON.parse(JSON.stringify(memTdHist[i].entries)); await localforage.setItem('tdBillEntries', memTdEntries); renderTable(); updateRunningTotal(); }
async function deleteBillHist(i){ if(!confirm("Delete this saved bill?"))return; memTdHist.splice(i,1); await localforage.setItem('tdBillHistory', memTdHist); renderHistory(); }

// --------------------------------------------------------------------------------------
// SMART LEDGER LOGIC
// --------------------------------------------------------------------------------------
function getLedgerNextPrNo() {
    if (memAccReg.length === 0) return 1;
    let lastPr = 0;
    for (let i = 0; i < memAccReg.length; i++) {
        if (memAccReg[i].prNo && !isNaN(memAccReg[i].prNo)) { lastPr = parseInt(memAccReg[i].prNo); break; }
    }
    let nextPr = lastPr + 1; if (nextPr > 50) nextPr = 1; return nextPr;
}

window.swapRegIdMode = function() {
    let type = document.getElementById('regIdType').value; let input = document.getElementById('regIdValue');
    input.value = activeRegIds[type] || '';
    if(type === 'acc') input.placeholder = "12 Digits"; 
    else if(type === 'phone') input.placeholder = "10 Digits"; 
    else if(type === 'cif') input.placeholder = "9 Digits"; 
    else if(type === 'aadhaar') input.placeholder = "12 Digits"; 
    else if(type === 'pan') input.placeholder = "10 Characters";
};

window.handleRegIdInput = function() {
    let type = document.getElementById('regIdType').value; let val = document.getElementById('regIdValue').value;
    if (type === 'pan') { val = val.toUpperCase().replace(/[^A-Z0-9]/g, ''); if(val.length > 10) val = val.substring(0,10); } 
    else { val = val.replace(/[^0-9]/g, ''); if(type === 'acc' && val.length > 12) val = val.substring(0,12); if(type === 'phone' && val.length > 10) val = val.substring(0,10); if(type === 'cif' && val.length > 9) val = val.substring(0,9); if(type === 'aadhaar' && val.length > 12) val = val.substring(0,12); }
    document.getElementById('regIdValue').value = val; activeRegIds[type] = val; renderRegBadges();
    
    if((type === 'cif' && val.length === 9) || (type === 'phone' && val.length === 10) || (type === 'acc' && val.length === 12) || (type === 'aadhaar' && val.length === 12) || (type === 'pan' && val.length === 10)) {
        let found = memAccReg.find(r => r[type] === val);
        if(found) { 
            if(!activeRegIds.acc && found.acc) activeRegIds.acc = found.acc; 
            if(!activeRegIds.phone && found.phone) activeRegIds.phone = found.phone; 
            if(!activeRegIds.cif && found.cif) activeRegIds.cif = found.cif; 
            if(!activeRegIds.aadhaar && found.aadhaar) activeRegIds.aadhaar = found.aadhaar; 
            if(!activeRegIds.pan && found.pan) activeRegIds.pan = found.pan;
            if(found.name) document.getElementById('regName').value = found.name; 
            renderRegBadges(); showToast("✨ Details auto-filled from History!"); 
        }
    }
};

window.renderRegBadges = function() {
    let html = [];
    if(activeRegIds.acc) html.push(`<span class="badge-pill" style="background:#eff6ff; color:#2563eb; border-color: #bfdbfe;">Acc: ${activeRegIds.acc}</span>`);
    if(activeRegIds.cif) html.push(`<span class="badge-pill" style="background:#fef2f2; color:#e11d48; border-color: #fecdd3;">CIF: ${activeRegIds.cif}</span>`);
    if(activeRegIds.phone) html.push(`<span class="badge-pill" style="background:#ecfdf5; color:#10b981; border-color: #a7f3d0;">Ph: ${activeRegIds.phone}</span>`);
    if(activeRegIds.aadhaar) html.push(`<span class="badge-pill" style="background:#fffbeb; color:#d97706; border-color: #fde68a;">Aadhaar: ${activeRegIds.aadhaar}</span>`);
    if(activeRegIds.pan) html.push(`<span class="badge-pill" style="background:#faf5ff; color:#9333ea; border-color: #e9d5ff;">PAN: ${activeRegIds.pan}</span>`);
    document.getElementById('regIdBadges').innerHTML = html.join('');
};

async function addRegEntry() {
    const date = document.getElementById('regDate').value; const name = document.getElementById('regName').value.trim(); const relationName = document.getElementById('regRelationName').value.trim(); const scheme = document.getElementById('regScheme').value; const amt = Number(document.getElementById('regAmount').value); const remarks = document.getElementById('regRemarks').value.trim();
    let prNoRaw = document.getElementById('regPr').value.trim(); let accRaw = activeRegIds.acc || ''; let cif = activeRegIds.cif || ''; let phone = activeRegIds.phone || ''; let aadhaar = activeRegIds.aadhaar || ''; let pan = activeRegIds.pan || '';
    
    let prNo = prNoRaw ? parseInt(prNoRaw) : getLedgerNextPrNo();
    if (prNo < 1 || prNo > 50) return alert("PR Number must be between 1 and 50.");
    if(accRaw.length === 9) { let isTD = scheme.includes('TD') || scheme.includes('RD') || scheme.includes('MIS') || scheme.includes('SCSS') || scheme.includes('KVP') || scheme.includes('NSC') || scheme.includes('MSSC'); accRaw = (isTD ? '020' : '010') + accRaw; } 
    else if (accRaw.length > 0 && accRaw.length !== 12) { return alert("Account number must be exactly 9 or 12 digits."); }
    
    let acc = accRaw; 
    if(!acc && !phone && !cif && !aadhaar && !pan) return alert("Please enter at least an Account Number, Phone, CIF, Aadhaar or PAN."); 
    if(!name) return alert("Please enter the customer's name."); if(!amt) return alert("Please enter the deposit amount.");
    if(acc && memAccReg.some(r => r.acc === acc)) return alert("Duplicate Error: This Account Number already exists.");
    
    let pbStatus = 'N/A'; if(scheme.includes('TD') || scheme === 'SSA' || scheme === 'SB' || scheme === 'RD') pbStatus = 'Pending AO';
    memAccReg.unshift({date, acc, cif, phone, aadhaar, pan, prNo, name, relationName, scheme, amt, pbStatus, remarks});
    clearLedgerSelection(false);
    await localforage.setItem('accRegister', memAccReg); 
    showToast("✅ Account Logged Successfully");
    
    renderRegTable(); renderDashboard();
    
    setTimeout(() => { const container = document.querySelector('#tab-panel-register .table-container'); if (container) container.scrollTop = container.scrollHeight; }, 100);
    
    activeRegIds = { acc: '', phone: '', cif: '', aadhaar: '', pan: '' }; renderRegBadges(); document.getElementById('regIdValue').value=''; document.getElementById('regPr').value=getLedgerNextPrNo(); document.getElementById('regName').value=''; document.getElementById('regRelationName').value=''; document.getElementById('regAmount').value=''; document.getElementById('regRemarks').value='';
}

window.updateRegPbStatus = async function(i, val) { 
    memAccReg[i].pbStatus = val; 
    await localforage.setItem('accRegister', memAccReg); 
    renderRegTable();
    renderDashboard();
    showToast("📝 Status updated."); 
};

window.setLedgerView = function(view) {
    ledgerViewMode = ['table', 'board', 'scheme'].includes(view) ? view : 'scheme';
    renderRegTable();
};

function updateBulkLedgerToolbar() {
    const validIndices = [...selectedLedgerIndices].filter(index => index >= 0 && index < memAccReg.length);
    selectedLedgerIndices = new Set(validIndices);
    const count = selectedLedgerIndices.size;
    const countEl = document.getElementById('ledger-selected-count');
    if (countEl) countEl.textContent = `${count} selected`;
    ['bulk-edit-btn', 'bulk-receipt-btn', 'crm-campaign-btn', 'clear-ledger-selection-btn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = count === 0;
    });
    const selectAll = document.getElementById('ledger-select-all');
    if (selectAll) {
        const visibleSelected = lastFilteredLedgerIndices.filter(index => selectedLedgerIndices.has(index)).length;
        selectAll.checked = lastFilteredLedgerIndices.length > 0 && visibleSelected === lastFilteredLedgerIndices.length;
        selectAll.indeterminate = visibleSelected > 0 && visibleSelected < lastFilteredLedgerIndices.length;
    }
}

window.toggleLedgerSelection = function(index, checked) {
    if (checked) selectedLedgerIndices.add(index); else selectedLedgerIndices.delete(index);
    renderRegTable();
};

window.toggleSelectAllLedger = function(checked) {
    lastFilteredLedgerIndices.forEach(index => checked ? selectedLedgerIndices.add(index) : selectedLedgerIndices.delete(index));
    renderRegTable();
};

window.clearLedgerSelection = function(shouldRender = true) {
    selectedLedgerIndices.clear();
    if (shouldRender) renderRegTable(); else updateBulkLedgerToolbar();
};

window.openBulkEditModal = function() {
    if (!selectedLedgerIndices.size) return alert("Select at least one account.");
    document.getElementById('bulk-edit-count').textContent = selectedLedgerIndices.size;
    document.getElementById('bulk-edit-date').value = '';
    document.getElementById('bulk-edit-scheme').value = '';
    document.getElementById('bulk-edit-status').value = '';
    document.getElementById('bulk-edit-remarks').value = '';
    document.getElementById('bulk-edit-remarks-mode').value = 'append';
    document.getElementById('ledgerBulkEditModal').style.display = 'flex';
};

window.closeBulkEditModal = function() {
    document.getElementById('ledgerBulkEditModal').style.display = 'none';
};

function getSelectedLedgerEntries() {
    return [...selectedLedgerIndices].sort((a,b) => a-b).map(index => memAccReg[index]).filter(Boolean);
}

window.openCrmCampaign = function() {
    const entries = getSelectedLedgerEntries();
    if (!entries.length) return alert('Select at least one customer.');
    const phoneCount = entries.filter(entry => String(entry.phone || '').replace(/\D/g, '').length >= 10).length;
    document.getElementById('crm-selected-count').textContent = `${entries.length} customer${entries.length === 1 ? '' : 's'} selected`;
    document.getElementById('crm-phone-count').textContent = `${phoneCount} phone number${phoneCount === 1 ? '' : 's'} available`;
    const names = entries.slice(0, 5).map(entry => entry.name).join(', ');
    document.getElementById('crm-audience-preview').textContent = names + (entries.length > 5 ? ` and ${entries.length - 5} more` : '');
    document.getElementById('crm-template').value = 'general';
    applyCrmTemplate('general');
    document.getElementById('crmCampaignModal').style.display = 'flex';
};

window.closeCrmCampaign = function() {
    document.getElementById('crmCampaignModal').style.display = 'none';
};

window.applyCrmTemplate = function(template) {
    const messageEl = document.getElementById('crm-message');
    const nextHoliday = memHolidayDates.find(date => date >= getLocalISODate());
    const nextHolidayLabel = nextHoliday ? `${memHolidayNames[nextHoliday] || 'Branch Holiday'} on ${parseLocalDate(nextHoliday).toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}` : 'the notified holiday';
    const templates = {
        general: 'Dear Customer,\n\nThis is an important update from {branch}. Please contact the Branch Office if you need assistance with your Post Office account.\n\nRegards,\n{branch}',
        passbook: 'Dear Customer,\n\nYour passbook/account document is ready at {branch}. Please visit the Branch Office during working hours with valid identification.\n\nRegards,\n{branch}',
        holiday: `Dear Customer,\n\nPlease note that {branch} will remain closed for ${nextHolidayLabel}. Treasury and counter services will resume on the next working day.\n\nRegards,\n{branch}`,
        custom: ''
    };
    messageEl.value = templates[template] ?? '';
    if (template === 'custom') messageEl.focus();
};

function getResolvedCrmMessage() {
    return document.getElementById('crm-message').value.trim().replace(/\{branch\}/gi, globalBoName || 'Branch Office');
}

window.copyCrmMessage = async function() {
    const message = getResolvedCrmMessage();
    if (!message) return alert('Write a message first.');
    try {
        await navigator.clipboard.writeText(message);
        showToast('CRM message copied.');
    } catch (error) {
        const area = document.getElementById('crm-message');
        area.focus(); area.select();
        document.execCommand('copy');
        showToast('CRM message copied.');
    }
};

window.shareCrmToWhatsApp = function() {
    const message = getResolvedCrmMessage();
    if (!message) return alert('Write a message first.');
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
};

window.exportSelectedCrmContacts = function() {
    const entries = getSelectedLedgerEntries();
    if (!entries.length) return alert('Select at least one customer.');
    const rows = entries.map((entry,index) => ({
        'Sr No': index+1, 'Customer Name': entry.name || '', Phone: entry.phone || '', 'Account Number': entry.acc || '',
        CIF: entry.cif || '', Scheme: entry.scheme || '', 'Passbook Status': entry.pbStatus || '', Remarks: entry.remarks || ''
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'CRM Contacts');
    XLSX.writeFile(workbook, createExportFilename('Customer_Connect_CRM_Contacts', 'xlsx'));
};

window.applyBulkLedgerEdit = async function() {
    if (!selectedLedgerIndices.size) return closeBulkEditModal();
    const date = document.getElementById('bulk-edit-date').value;
    const scheme = document.getElementById('bulk-edit-scheme').value;
    const status = document.getElementById('bulk-edit-status').value;
    const remarks = document.getElementById('bulk-edit-remarks').value.trim();
    const remarksMode = document.getElementById('bulk-edit-remarks-mode').value;
    if (!date && !scheme && !status && !remarks) return alert("Choose at least one change.");

    selectedLedgerIndices.forEach(index => {
        const entry = memAccReg[index];
        if (!entry) return;
        if (date) entry.date = date;
        if (scheme) entry.scheme = scheme;
        if (status) entry.pbStatus = status;
        if (remarks) entry.remarks = remarksMode === 'replace' || !entry.remarks ? remarks : `${entry.remarks}; ${remarks}`;
    });
    await localforage.setItem('accRegister', memAccReg);
    closeBulkEditModal();
    renderRegTable(); renderDashboard();
    showToast(`Updated ${selectedLedgerIndices.size} accounts.`);
};

function normalizeImportHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readImportValue(row, aliases) {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeImportHeader(key), value]));
    for (const alias of aliases) {
        const value = normalized[normalizeImportHeader(alias)];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
}

function normalizeImportDate(value) {
    if (typeof value === 'number' && window.XLSX?.SSF) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return new Date().toISOString().slice(0, 10);
}

window.importLedgerBulkFile = function(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(loadEvent) {
        try {
            const workbook = XLSX.read(loadEvent.target.result, { type: 'array', cellDates: false });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
            if (!rows.length) throw new Error('The selected file has no data rows.');

            const existingAccounts = new Set(memAccReg.map(entry => entry.acc).filter(Boolean));
            const imported = [], errors = [];
            rows.forEach((row, rowIndex) => {
                const line = rowIndex + 2;
                const name = String(readImportValue(row, ['Name', 'Customer Name', 'Full Name'])).trim();
                const schemeInput = String(readImportValue(row, ['Scheme'])).trim();
                const scheme = activeSchemesRegister.find(item => item.toLowerCase() === schemeInput.toLowerCase());
                const amt = Number(String(readImportValue(row, ['Deposit Amount', 'Amount', 'Deposit'])).replace(/[^\d.-]/g, ''));
                let acc = String(readImportValue(row, ['Account No', 'Account Number', 'A/C No', 'Acc'])).replace(/\D/g, '');
                const cif = String(readImportValue(row, ['CIF'])).replace(/\D/g, '');
                const phone = String(readImportValue(row, ['Phone', 'Mobile', 'Mobile Number'])).replace(/\D/g, '');
                const aadhaar = String(readImportValue(row, ['Aadhaar', 'Aadhar'])).replace(/\D/g, '');
                const pan = String(readImportValue(row, ['PAN'])).toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (acc.length === 9 && scheme) {
                    const longScheme = scheme.includes('TD') || ['RD','MIS','SCSS','KVP','NSC','MSSC'].includes(scheme);
                    acc = (longScheme ? '020' : '010') + acc;
                }
                if (!name || !scheme || !Number.isFinite(amt) || amt <= 0) { errors.push(`Row ${line}: name, valid scheme and positive amount are required.`); return; }
                if (!acc && !cif && !phone && !aadhaar && !pan) { errors.push(`Row ${line}: provide at least one customer ID.`); return; }
                if (acc && acc.length !== 12) { errors.push(`Row ${line}: account number must be 9 or 12 digits.`); return; }
                if (acc && existingAccounts.has(acc)) { errors.push(`Row ${line}: duplicate account ${acc}.`); return; }
                if (acc) existingAccounts.add(acc);
                const prValue = Number(readImportValue(row, ['PR No', 'PR']));
                const statusInput = String(readImportValue(row, ['Passbook Status', 'Status'])).trim();
                const defaultStatus = scheme.includes('TD') || ['SSA','SB','RD'].includes(scheme) ? 'Pending AO' : 'N/A';
                const pbStatus = ['N/A','Pending AO','At BO','Delivered'].includes(statusInput) ? statusInput : defaultStatus;
                imported.push({
                    date: normalizeImportDate(readImportValue(row, ['Date'])), acc, cif, phone, aadhaar, pan,
                    prNo: prValue >= 1 && prValue <= 50 ? prValue : '', name, scheme, amt, pbStatus,
                    remarks: String(readImportValue(row, ['Remarks', 'Nominee', 'Extra Details'])).trim()
                });
            });
            if (imported.length) {
                memAccReg = imported.concat(memAccReg);
                await localforage.setItem('accRegister', memAccReg);
                clearLedgerSelection(false); renderRegTable(); renderDashboard();
            }
            const errorSummary = errors.length ? `\n\nSkipped ${errors.length}:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? '\n…' : ''}` : '';
            alert(`Imported ${imported.length} account${imported.length === 1 ? '' : 's'}.${errorSummary}`);
        } catch (error) {
            alert(`Import failed: ${error.message}`);
        } finally {
            input.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};

window.downloadLedgerImportTemplate = function() {
    const sample = [{ Date: new Date().toISOString().slice(0,10), 'PR No': 1, Scheme: 'SB', 'Deposit Amount': 1000, 'Customer Name': 'Sample Customer', 'Account Number': '010123456789', CIF: '123456789', Phone: '9876543210', Aadhaar: '', PAN: '', 'Passbook Status': 'Pending AO', Remarks: '' }];
    const sheet = XLSX.utils.json_to_sheet(sample);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ledger Import');
    XLSX.writeFile(workbook, createExportFilename('Smart_Ledger_Import_Template', 'xlsx'));
};

window.generateBulkReceipts = function() {
    const entries = getSelectedLedgerEntries();
    if (!entries.length) return alert("Select at least one account.");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    entries.forEach((entry, pageIndex) => {
        if (pageIndex) pdf.addPage();
        pdf.setDrawColor(225, 29, 72); pdf.setLineWidth(0.8); pdf.rect(12, 12, 186, 273);
        pdf.setTextColor(225, 29, 72); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text('DEPARTMENT OF POSTS, INDIA', 105, 27, { align: 'center' });
        pdf.setTextColor(20, 20, 20); pdf.setFontSize(13); pdf.text(globalBoName || 'Branch Office', 105, 36, { align: 'center' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text('Customer Deposit Acknowledgment Receipt', 105, 43, { align: 'center' });
        pdf.line(20, 49, 190, 49);
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.text(`Date: ${entry.date || '-'}`, 20, 59); pdf.text(`Receipt: DD-${String(pageIndex + 1).padStart(3, '0')}`, 190, 59, { align: 'right' });
        const details = [
            ['Customer Name', entry.name || '-'], ['Phone Number', entry.phone || 'N/A'], ['Scheme', entry.scheme || '-'],
            ['Account Number', entry.acc || 'Pending Assignment'], ['CIF', entry.cif || 'Pending'], ['Deposit Amount', `INR ${Number(entry.amt || 0).toLocaleString('en-IN')}`]
        ];
        let y = 72;
        details.forEach(([label, value]) => {
            pdf.setFillColor(248, 250, 252); pdf.rect(20, y - 7, 58, 13, 'F'); pdf.rect(20, y - 7, 170, 13);
            pdf.setFont('helvetica', 'bold'); pdf.text(label, 24, y + 1);
            pdf.setFont('helvetica', 'normal'); pdf.text(String(value), 83, y + 1, { maxWidth: 103 }); y += 13;
        });
        pdf.setFontSize(9); pdf.setTextColor(90, 90, 90); pdf.text('This is a provisional branch office receipt. Update the passbook at the Account Office for final confirmation.', 105, 168, { align: 'center', maxWidth: 165 });
        pdf.setTextColor(20, 20, 20); pdf.line(24, 245, 82, 245); pdf.line(140, 245, 186, 245);
        pdf.setFontSize(10); pdf.text('Branch Postmaster Signature', 53, 252, { align: 'center' }); pdf.text('B.O. Stamp', 163, 252, { align: 'center' });
        pdf.setFontSize(8); pdf.setTextColor(100, 100, 100); pdf.text(`Receipt ${pageIndex + 1} of ${entries.length}`, 105, 276, { align: 'center' });
    });
    pdf.save(createExportFilename('Smart_Ledger_Selected_Account_Receipts', 'pdf'));
    showToast(`Generated ${entries.length} receipts in one PDF.`);
};

function getFilteredLedgerEntries() {
    const searchTerm = (document.getElementById('ledgerSearchInput')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('ledgerStatusFilter')?.value || 'All';
    const monthFilter = document.getElementById('ledgerMonthFilter')?.value || 'All';
    return memAccReg.map((e, index) => ({...e, originalIndex: index})).filter(e => {
        const matchesSearch = !searchTerm || String(e.name || '').toLowerCase().includes(searchTerm) || String(e.acc || '').includes(searchTerm) || String(e.phone || '').includes(searchTerm) || String(e.cif || '').includes(searchTerm) || String(e.aadhaar || '').includes(searchTerm) || String(e.pan || '').toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'All' || e.pbStatus === statusFilter;
        const matchesMonth = monthFilter === 'All' || String(e.date || '').startsWith(monthFilter);
        return matchesSearch && matchesStatus && matchesMonth;
    }).sort((a, b) => {
        let dateDiff = new Date(a.date || '9999-12-31') - new Date(b.date || '9999-12-31');
        if (dateDiff !== 0) return dateDiff;
        let prA = parseInt(a.prNo) || 99999; let prB = parseInt(b.prNo) || 99999;
        return prA - prB;
    });
}

function updateLedgerMonthFilter() {
    const el = document.getElementById('ledgerMonthFilter');
    if (!el) return;
    const current = el.value || 'All';
    const months = [...new Set(memAccReg.map(entry => String(entry.date || '').slice(0, 7)).filter(month => /^\d{4}-\d{2}$/.test(month)))].sort();
    el.innerHTML = '<option value="All">All Months</option>' + months.map(month => `<option value="${month}">${parseLocalDate(month + '-01').toLocaleString('en-IN', { month: 'short', year: 'numeric' })}</option>`).join('');
    el.value = months.includes(current) ? current : 'All';
}

function renderPassbookBoard(entries) {
    const board = document.getElementById('passbook-board-view');
    if (!board) return;
    const boardEntries = entries.filter(e => passbookBoardStatuses.some(status => status.key === (e.pbStatus || 'N/A')));
    board.innerHTML = passbookBoardStatuses.map(status => {
        const cards = boardEntries.filter(entry => entry.pbStatus === status.key);
        return `<section class="passbook-column" data-status="${escapeHTML(status.key)}" ondragover="handlePassbookDragOver(event)" ondragleave="handlePassbookDragLeave(event)" ondrop="handlePassbookDrop(event, '${escapeHTML(status.key)}')">
            <div class="passbook-column-header">
                <div class="passbook-column-title"><i data-lucide="${status.icon}"></i><strong>${escapeHTML(status.title)}</strong></div>
                <span class="passbook-count">${cards.length}</span>
            </div>
            <div class="passbook-card-list">
                ${cards.length ? cards.map(renderPassbookCard).join('') : '<div class="passbook-empty">No passbooks</div>'}
            </div>
        </section>`;
    }).join('');
    lucide.createIcons();
}

function renderPassbookCard(entry) {
    return `<article class="passbook-card" data-status="${escapeHTML(entry.pbStatus || 'N/A')}" draggable="true" ondragstart="handlePassbookDragStart(event, ${entry.originalIndex})" ondragend="handlePassbookDragEnd(event)">
        <div class="passbook-card-name">${escapeHTML(entry.name || 'Unnamed Customer')}</div>
        <div class="passbook-card-meta">
            <span>A/C <b>${escapeHTML(entry.acc || 'Pending')}</b></span>
            <span>Scheme <b>${escapeHTML(entry.scheme || '--')}</b></span>
            <span>Date <b>${escapeHTML(entry.date || '--')}</b></span>
            <span>PR <b>${escapeHTML(entry.prNo || '--')}</b></span>
            ${entry.phone ? `<span>Phone <b>${escapeHTML(entry.phone)}</b></span>` : ''}
        </div>
        <div class="passbook-card-actions">
            <span class="badge">${escapeHTML(entry.pbStatus || 'N/A')}</span>
            <div>
                <button class="passbook-mini-btn" type="button" onclick="openLedgerEditModal(${entry.originalIndex})" title="Edit"><i data-lucide="edit-2"></i></button>
            </div>
        </div>
    </article>`;
}

function renderSchemeBoard(entries) {
    const board = document.getElementById('scheme-board-view');
    if (!board) return;
    const knownSchemes = activeSchemesRegister.filter(scheme => entries.some(entry => entry.scheme === scheme));
    const extraSchemes = [...new Set(entries.map(entry => entry.scheme).filter(scheme => scheme && !activeSchemesRegister.includes(scheme)))];
    const schemes = [...knownSchemes, ...extraSchemes];

    board.innerHTML = schemes.length ? schemes.map(scheme => {
        const cards = entries.filter(entry => entry.scheme === scheme);
        const total = cards.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
        return `<section class="passbook-column scheme-column">
            <div class="passbook-column-header">
                <div class="passbook-column-title"><i data-lucide="landmark"></i><strong>${escapeHTML(scheme)}</strong></div>
                <span class="passbook-count">${cards.length}</span>
            </div>
            <div class="scheme-column-total">${money(total)} deposited</div>
            <div class="passbook-card-list">
                ${cards.map(renderSchemeCard).join('')}
            </div>
        </section>`;
    }).join('') : '<div class="passbook-empty">No accounts match the selected filters.</div>';
    lucide.createIcons();
}

function renderSchemeCard(entry) {
    return `<article class="passbook-card scheme-card" data-status="${escapeHTML(entry.pbStatus || 'N/A')}">
        <div class="passbook-card-name">${escapeHTML(entry.name || 'Unnamed Customer')}</div>
        <div class="passbook-card-meta">
            <span>A/C <b>${escapeHTML(entry.acc || 'Pending')}</b></span>
            <span>Deposit <b>${money(entry.amt)}</b></span>
            <span>Date <b>${escapeHTML(entry.date || '--')}</b></span>
            <span>PR <b>${escapeHTML(entry.prNo || '--')}</b></span>
        </div>
        <div class="passbook-card-actions">
            <span class="badge">${escapeHTML(entry.pbStatus || 'N/A')}</span>
            <div>
                <button class="passbook-mini-btn" type="button" onclick="openLedgerEditModal(${entry.originalIndex})" title="Edit account"><i data-lucide="edit-2"></i></button>
                <button class="passbook-mini-btn" type="button" onclick="delReg(${entry.originalIndex})" title="Delete account"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    </article>`;
}

window.handlePassbookDragStart = function(event, index) {
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
    event.currentTarget.classList.add('dragging');
};

window.handlePassbookDragEnd = function(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.passbook-column.drag-over').forEach(column => column.classList.remove('drag-over'));
};

window.handlePassbookDragOver = function(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';
};

window.handlePassbookDragLeave = function(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drag-over');
};

window.handlePassbookDrop = async function(event, status) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const index = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(index) || !memAccReg[index] || memAccReg[index].pbStatus === status) return;
    memAccReg[index].pbStatus = status;
    await localforage.setItem('accRegister', memAccReg);
    renderRegTable();
    renderDashboard();
    showToast(`Passbook moved to ${status}.`);
};

function renderRegTable() { 
    const tbody = document.getElementById('regBody');
    updateLedgerMonthFilter();
    let filteredData = getFilteredLedgerEntries();

    lastFilteredLedgerIndices = filteredData.map(e => e.originalIndex);

    updateLedgerStats();
    updateBulkLedgerToolbar();
    renderPassbookBoard(filteredData);
    renderSchemeBoard(filteredData);
    const tableView = document.getElementById('ledger-table-view');
    const boardView = document.getElementById('passbook-board-view');
    const schemeBoardView = document.getElementById('scheme-board-view');
    const tableBtn = document.getElementById('ledger-view-table');
    const boardBtn = document.getElementById('ledger-view-board');
    const schemeBtn = document.getElementById('ledger-view-scheme');
    if (tableView) tableView.style.display = ledgerViewMode === 'table' ? '' : 'none';
    if (boardView) boardView.style.display = ledgerViewMode === 'board' ? 'grid' : 'none';
    if (schemeBoardView) schemeBoardView.style.display = ledgerViewMode === 'scheme' ? 'grid' : 'none';
    if (tableBtn) tableBtn.classList.toggle('active', ledgerViewMode === 'table');
    if (boardBtn) boardBtn.classList.toggle('active', ledgerViewMode === 'board');
    if (schemeBtn) schemeBtn.classList.toggle('active', ledgerViewMode === 'scheme');

    if (filteredData.length === 0) { tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 48px; color: var(--text-muted); font-size: 0.95rem;">No records found matching your criteria.</td></tr>`; return; }

    tbody.innerHTML = filteredData.map((e, displayIndex) => {
        let pbOptions = ['N/A', 'Pending AO', 'At BO', 'Delivered'].map(opt => `<option value="${opt}" ${e.pbStatus===opt?'selected':''}>${opt}</option>`).join('');
        let accDisplay = `<div style="font-weight: 700; color: var(--text-main); font-family: monospace; font-size: 0.95rem;">${escapeHTML(e.acc || '--')}</div>`;
        if(e.cif) accDisplay += `<div style="font-size:0.75rem; color:var(--text-muted); margin-top: 2px;">CIF: ${escapeHTML(e.cif)}</div>`;
        
        let nameDisplay = `<div style="font-weight: 600; color: var(--text-main);">${escapeHTML(e.name)}</div>`;
        let subDetails = [];
        if(e.phone) subDetails.push(`<span style="color:var(--text-muted);">📱 ${escapeHTML(e.phone)}</span>`);
        if(e.aadhaar) subDetails.push(`<span style="color:#d97706;">Aadhaar: ${escapeHTML(e.aadhaar)}</span>`);
        if(e.pan) subDetails.push(`<span style="color:#9333ea;">PAN: ${escapeHTML(e.pan)}</span>`);
        if(e.relationName) subDetails.push(`<span style="color:#0f766e;">👤 ${escapeHTML(e.relationName)}</span>`);
        if(e.remarks) subDetails.push(`<span style="color:#8b5cf6;">ℹ️ ${escapeHTML(e.remarks)}</span>`);
        if (subDetails.length > 0) { nameDisplay += `<div style="font-size:0.75rem; font-weight: 500; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">${subDetails.join('')}</div>`; }
        
        let selectBg = 'transparent'; let selectColor = 'var(--text-main)';
        if (e.pbStatus === 'Pending AO') { selectBg = '#fef2f2'; selectColor = '#e11d48'; } else if (e.pbStatus === 'At BO') { selectBg = '#fffbeb'; selectColor = '#d97706'; } else if (e.pbStatus === 'Delivered') { selectBg = '#ecfdf5'; selectColor = '#059669'; }

        const isSelected = selectedLedgerIndices.has(e.originalIndex);
        return `<tr class="${isSelected ? 'ledger-row-selected' : ''}">
            <td class="no-print ledger-select-cell"><input class="ledger-row-select" type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleLedgerSelection(${e.originalIndex}, this.checked)" aria-label="Select ${escapeHTML(e.name)}"></td>
            <td style="font-weight: 600; color: var(--text-muted);">${displayIndex + 1}</td>
            <td style="color: var(--text-muted); font-weight: 500;">${escapeHTML(e.date || '--')}</td>
            <td style="color: var(--text-muted); font-weight: 600;">${escapeHTML(getFinancialYear(e.date))}</td>
            <td>${accDisplay}</td>
            <td>${nameDisplay}</td>
            <td style="font-weight: 800; color: var(--primary); font-size: 1rem;">${e.prNo||'--'}</td>
            <td><span class="badge">${escapeHTML(e.scheme)}</span></td>
            <td class="text-right" style="font-weight: 800; font-size: 1.05rem; color: var(--text-main);">${money(e.amt)}</td>
            <td class="text-center no-print">
                <select onchange="updateRegPbStatus(${e.originalIndex}, this.value)" style="padding: 8px 12px; font-size: 0.8rem; border-radius: 99px; font-weight: 700; border: none; background-color: ${selectBg}; color: ${selectColor}; cursor: pointer; outline: none; box-shadow: none;">
                    ${pbOptions}
                </select>
            </td>
            <td class="text-right no-print">
                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button class="btn-icon" onclick="openLedgerEditModal(${e.originalIndex})" title="Edit Entry"><i data-lucide="edit-2"></i></button>
                    <button class="btn-icon text-danger" onclick="delReg(${e.originalIndex})" title="Delete Entry"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>`;
    }).join(""); 
    lucide.createIcons();
}

function updateLedgerStats() {
    let currentMonth = new Date().toISOString().slice(0, 7);
    let totalAcc = memAccReg.length; let monthAcc = 0; let totalDep = 0; let monthDep = 0; let pendingPb = 0;
    memAccReg.forEach(r => { const amt = Number(r.amt) || 0; totalDep += amt; if(String(r.date || '').startsWith(currentMonth)) { monthAcc++; monthDep += amt; } if(r.pbStatus === 'Pending AO') { pendingPb++; } });
    document.getElementById('stat-acc').textContent = totalAcc; document.getElementById('stat-acc-month').textContent = `${monthAcc} this month`; document.getElementById('stat-dep').textContent = money(totalDep); document.getElementById('stat-dep-month').textContent = `${money(monthDep)} this month`; document.getElementById('stat-pb').textContent = pendingPb;
}

window.exportLedgerExcel = function() {
    if(memAccReg.length === 0) return alert("No data to export.");
    let sortedData = [...memAccReg].sort((a, b) => { let dateDiff = new Date(a.date) - new Date(b.date); if (dateDiff !== 0) return dateDiff; let prA = parseInt(a.prNo) || 99999; let prB = parseInt(b.prNo) || 99999; return prA - prB; });
    const exportData = sortedData.map((e, index) => ({ "Sr No": index + 1, "Date": e.date, "Name": e.name, "Account No": e.acc || '', "CIF": e.cif || '', "Phone": e.phone || '', "Aadhaar": e.aadhaar || '', "PAN": e.pan || '', "Scheme": e.scheme, "Deposit Amount": e.amt, "PR No": e.prNo || '', "Passbook Status": e.pbStatus, "Remarks": e.remarks || '' }));
    const worksheet = XLSX.utils.json_to_sheet(exportData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger"); XLSX.writeFile(workbook, createExportFilename('Smart_Ledger_Account_Export', 'xlsx'));
};

function openLedgerEditModal(i) {
    currentEditIndex = i; const e = memAccReg[i];
    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ''; };
    setValue('ledgerModDate', e.date);
    setValue('ledgerModScheme', e.scheme);
    setValue('ledgerModPr', e.prNo || '');
    setValue('ledgerModAcc', e.acc || '');
    setValue('ledgerModPhone', e.phone || '');
    setValue('ledgerModCif', e.cif || '');
    setValue('ledgerModAadhaar', e.aadhaar || '');
    setValue('ledgerModPan', e.pan || '');
    setValue('ledgerModName', e.name);
    setValue('ledgerModRelationName', e.relationName || '');
    setValue('ledgerModAmount', e.amt);
    setValue('ledgerModPbStatus', e.pbStatus || 'N/A');
    setValue('ledgerModRemarks', e.remarks || '');
    const modal = document.getElementById('ledgerEditModal');
    if (modal) modal.style.display = 'flex';
}
function closeLedgerEditModal() { const modal = document.getElementById('ledgerEditModal'); if (modal) modal.style.display = 'none'; currentEditIndex = -1; }

async function saveEditedLedgerEntry() {
    if (currentEditIndex < 0) return;
    const readValue = id => document.getElementById(id)?.value ?? '';
    const prRaw = document.getElementById('ledgerModPr').value.trim(); const prNo = prRaw ? parseInt(prRaw) : ''; if (prNo && (prNo < 1 || prNo > 50)) return alert("PR Number must be between 1 and 50.");
    let accRaw = readValue('ledgerModAcc').trim(); const scheme = readValue('ledgerModScheme');
    if (accRaw.length > 0 && accRaw.length !== 12) { return alert("Account number must be exactly 12 digits."); }
    if(accRaw && memAccReg.some((r, idx) => r.acc === accRaw && idx !== currentEditIndex)) { return alert("Duplicate Error: This Account Number already exists in another entry."); }
    const name = readValue('ledgerModName').trim(); if(!name) return alert("Customer name is required.");
    
    memAccReg[currentEditIndex] = { date: readValue('ledgerModDate'), scheme: scheme, prNo: prNo, acc: accRaw, phone: readValue('ledgerModPhone').trim(), cif: readValue('ledgerModCif').trim(), aadhaar: readValue('ledgerModAadhaar').replace(/[^0-9]/g, ''), pan: readValue('ledgerModPan').toUpperCase().replace(/[^A-Z0-9]/g, ''), name: name, relationName: readValue('ledgerModRelationName').trim(), amt: Number(readValue('ledgerModAmount')), pbStatus: readValue('ledgerModPbStatus') || 'N/A', remarks: readValue('ledgerModRemarks').trim() };
    await localforage.setItem('accRegister', memAccReg); 
    closeLedgerEditModal(); renderRegTable(); renderDashboard(); showToast("✏️ Entry updated successfully.");
}

async function delReg(i) { if(!confirm("Delete this entry?")) return; memAccReg.splice(i,1); clearLedgerSelection(false); await localforage.setItem('accRegister', memAccReg); renderRegTable(); renderDashboard(); showToast("🗑️ Entry Deleted"); }
function printLedger() { printModule('Smart_Ledger_Account_Report', 'printing-ledger'); }

window.printPassbookSlip = function(index) {
    const e = memAccReg[index];
    document.getElementById('slip-bo-name').textContent = globalBoName; document.getElementById('slip-date').textContent = e.date; document.getElementById('slip-name').textContent = e.name; document.getElementById('slip-scheme').textContent = e.scheme; document.getElementById('slip-acc').textContent = e.acc || 'Pending'; document.getElementById('slip-cif').textContent = e.cif || 'Pending'; document.getElementById('slip-amount').textContent = money(e.amt);
    printModule(`Smart_Ledger_Passbook_Slip_${e.name}`, 'printing-slip');
};

window.generateCustomerReceipt = async function(index) {
    const e = memAccReg[index];
    document.getElementById('rect-bo-name').textContent = globalBoName; document.getElementById('rect-date').textContent = e.date; document.getElementById('rect-name').textContent = e.name; document.getElementById('rect-scheme').textContent = e.scheme; document.getElementById('rect-acc').textContent = e.acc || 'Pending Assignment'; document.getElementById('rect-amount').textContent = money(e.amt); document.getElementById('rect-phone').textContent = e.phone || 'N/A'; document.getElementById('rect-ref').textContent = `DD-${Date.now().toString().slice(-6)}`;
    showToast("⏳ Generating Customer PDF...");
    const wrap = document.getElementById('receipt-print-wrap'); wrap.style.left = '0'; wrap.style.top = '0'; wrap.style.zIndex = '1';
    await window.exportModulePDF('receipt-print-area', `Smart_Ledger_Customer_Receipt_${e.name}`);
    wrap.style.left = '-9999px'; wrap.style.zIndex = '-1'; showToast("✅ PDF Downloaded");
};

// --------------------------------------------------------------------------------------
// SMART POSB CALCULATOR LOGIC
// --------------------------------------------------------------------------------------
const PO_SCHEMES_CALC = {
  'Custom': { rate: 4.0, years: 10, logic: 'MONTHLY', desc: 'Custom: Compounded Monthly', allowLump: true, allowSip: true },
  'Savings': { rate: 4.0, years: 10, logic: 'ANNUALLY', desc: 'Savings: Compounded Annually', allowLump: true, allowSip: true },
  'RD (5 Yr)': { rate: 6.7, years: 5, logic: 'RD', desc: 'RD: Compounded Quarterly', allowLump: false, allowSip: true },
  'TD (1 Yr)': { rate: 6.9, years: 1, logic: 'TD', desc: 'TD: Compounded Quarterly, Paid Annually', allowLump: true, allowSip: false },
  'TD (2 Yr)': { rate: 7.0, years: 2, logic: 'TD', desc: 'TD: Compounded Quarterly, Paid Annually', allowLump: true, allowSip: false },
  'TD (3 Yr)': { rate: 7.1, years: 3, logic: 'TD', desc: 'TD: Compounded Quarterly, Paid Annually', allowLump: true, allowSip: false },
  'TD (5 Yr)': { rate: 7.5, years: 5, logic: 'TD', desc: 'TD: Compounded Quarterly, Paid Annually', allowLump: true, allowSip: false },
  'MIS': { rate: 7.4, years: 5, logic: 'MIS', desc: 'MIS: Simple Interest, Paid Monthly', allowLump: true, allowSip: false },
  'PPF': { rate: 7.1, years: 15, logic: 'ANNUALLY', desc: 'PPF: Compounded Annually', allowLump: true, allowSip: true },
  'NSC': { rate: 7.7, years: 5, logic: 'ANNUALLY', desc: 'NSC: Compounded Annually', allowLump: true, allowSip: false },
  'KVP': { rate: 7.5, years: 10, logic: 'ANNUALLY', desc: 'KVP: Compounded Annually', allowLump: true, allowSip: false },
  'SCSS': { rate: 8.2, years: 5, logic: 'SCSS', desc: 'SCSS: Simple Interest, Paid Quarterly', allowLump: true, allowSip: false },
  'SSA': { rate: 8.2, years: 21, logic: 'ANNUALLY', desc: 'SSA: Compounded Annually', allowLump: true, allowSip: true },
  'MSSC': { rate: 7.5, years: 2, logic: 'MSSC', desc: 'MSSC: Compounded Quarterly', allowLump: true, allowSip: false }
};

let posbState = { active: 'Custom', lastResult: null };

function renderPosbPresets() {
    const container = document.getElementById('posb-presets');
    if (!container) return;
    let html = '';
    Object.keys(PO_SCHEMES_CALC).forEach(key => {
        if (key !== 'Custom') {
            html += `<button type="button" class="posb-preset-btn ${posbState.active === key ? 'active' : ''}" onclick="setPosbPreset('${key}')" title="${PO_SCHEMES_CALC[key].desc}">${key}</button>`;
        }
    });
  container.innerHTML = html;
}
function setPosbPreset(key) {
    const rate = document.getElementById('posb-rate');
    const rateSlider = document.getElementById('posb-rate-slider');
    const years = document.getElementById('posb-years');
    const yearsSlider = document.getElementById('posb-years-slider');
    if (!rate || !rateSlider || !years || !yearsSlider) return;
    posbState.active = key;
    const s = PO_SCHEMES_CALC[key];
    rate.value = s.rate;
    rateSlider.value = s.rate;
    years.value = s.years;
    yearsSlider.value = s.years;
    updatePosbCalculator();
    renderPosbPresets();
}
function setPosbCustom() { posbState.active = 'Custom'; renderPosbPresets(); }
function printRates() { printModule('POSB_Interest_Rates_Report', 'printing-rates'); }

function updatePosbCalculator() {
    const requiredEls = [
        'posb-active-label', 'posb-active-desc', 'posb-wrap-init', 'posb-wrap-sip', 'posb-warn-lump', 'posb-warn-sip',
        'posb-init', 'posb-sip', 'posb-rate', 'posb-years', 'posb-val-invested', 'posb-val-returns', 'posb-val-total',
        'posb-chart-container'
    ];
    if (requiredEls.some(id => !document.getElementById(id))) return;
  const activeConf = PO_SCHEMES_CALC[posbState.active] || PO_SCHEMES_CALC['Custom'];
  document.getElementById('posb-active-label').textContent = posbState.active; document.getElementById('posb-active-desc').textContent = activeConf.desc.split(': ')[1] || activeConf.desc;
  const lumpWrap = document.getElementById('posb-wrap-init'); const sipWrap = document.getElementById('posb-wrap-sip');
  
  if (!activeConf.allowLump) { lumpWrap.style.opacity = '0.4'; lumpWrap.style.pointerEvents = 'none'; document.getElementById('posb-warn-lump').style.display = 'block'; } 
  else { lumpWrap.style.opacity = '1'; lumpWrap.style.pointerEvents = 'auto'; document.getElementById('posb-warn-lump').style.display = 'none'; }
  if (!activeConf.allowSip) { sipWrap.style.opacity = '0.4'; sipWrap.style.pointerEvents = 'none'; document.getElementById('posb-warn-sip').style.display = 'block'; } 
  else { sipWrap.style.opacity = '1'; sipWrap.style.pointerEvents = 'auto'; document.getElementById('posb-warn-sip').style.display = 'none'; }

  const safeInitial = activeConf.allowLump ? (Number(document.getElementById('posb-init').value) || 0) : 0;
  const safeMonthly = activeConf.allowSip ? (Number(document.getElementById('posb-sip').value) || 0) : 0;
  const safeRate = Number(document.getElementById('posb-rate').value) || 0;
  const safeYears = Number(document.getElementById('posb-years').value) || 0;

  let principal = safeInitial; let invested = safeInitial; let accumulatedInterest = 0; let paidOutInterest = 0; const yearlyData = [];
  const r = safeRate / 100; const tdAnnualYield = Math.pow(1 + r/4, 4) - 1;

  for (let y = 1; y <= safeYears; y++) {
    for (let m = 1; m <= 12; m++) {
      if (activeConf.allowSip) { principal += safeMonthly; invested += safeMonthly; }
      let monthInterest = 0;
      switch(activeConf.logic) {
          case 'TD': if (m === 12) { monthInterest = principal * tdAnnualYield; paidOutInterest += monthInterest; } break;
          case 'MIS': monthInterest = principal * (r / 12); paidOutInterest += monthInterest; break;
          case 'SCSS': monthInterest = principal * (r / 12); accumulatedInterest += monthInterest; if (m % 3 === 0) { paidOutInterest += accumulatedInterest; accumulatedInterest = 0; } break;
          case 'MSSC':
          case 'RD': monthInterest = principal * (r / 12); accumulatedInterest += monthInterest; if (m % 3 === 0) { principal += accumulatedInterest; accumulatedInterest = 0; } break;
          case 'ANNUALLY': monthInterest = principal * (r / 12); accumulatedInterest += monthInterest; if (m === 12) { principal += accumulatedInterest; accumulatedInterest = 0; } break;
          case 'MONTHLY':
          default: monthInterest = principal * (r / 12); principal += monthInterest; break;
      }
    }
    const totalValue = principal + accumulatedInterest + paidOutInterest; yearlyData.push({ year: y, invested: Math.round(invested), balance: Math.round(totalValue), interest: Math.round(totalValue - invested) });
  }

  const finalInvested = Math.round(invested); const finalBalance = Math.round(principal + accumulatedInterest + paidOutInterest); const finalInterest = Math.round(finalBalance - invested);
  posbState.lastResult = { schemeName: posbState.active, rate: safeRate, years: safeYears, deposit: activeConf.allowSip ? safeMonthly : safeInitial, maturity: finalBalance };

  document.getElementById('posb-val-invested').textContent = money(finalInvested); document.getElementById('posb-val-returns').textContent = '+' + money(finalInterest); document.getElementById('posb-val-total').textContent = money(finalBalance);

  const chartContainer = document.getElementById('posb-chart-container');
  chartContainer.innerHTML = `<div style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; pointer-events:none; opacity:0.2;"><div style="border-top:1px dashed var(--text-muted); width:100%;"></div><div style="border-top:1px dashed var(--text-muted); width:100%;"></div><div style="border-top:1px dashed var(--text-muted); width:100%;"></div><div style="border-top:1px dashed var(--text-muted); width:100%;"></div><div style="border-top:1px dashed var(--text-muted); width:100%;"></div></div>`;
  
  if (yearlyData.length > 0) {
    const maxBalance = finalBalance || 1;
    yearlyData.forEach((data, idx) => {
        const investedHeight = (data.invested / maxBalance) * 100; const interestHeight = (data.interest / maxBalance) * 100; const showLabel = safeYears <= 15 || idx % Math.ceil(safeYears / 10) === 0 || idx === safeYears - 1;
        chartContainer.innerHTML += `<div class="chart-bar-group"><div class="chart-tooltip"><div style="border-bottom:1px solid #4b5563; padding-bottom:4px; margin-bottom:4px;">Year ${data.year}</div><div style="display:flex; justify-content:space-between; gap:12px;"><span>Invested:</span> <span style="color:#93c5fd;">${money(data.invested)}</span></div><div style="display:flex; justify-content:space-between; gap:12px;"><span>Interest:</span> <span style="color:#fde047;">+${money(data.interest)}</span></div><div style="display:flex; justify-content:space-between; gap:12px; margin-top:4px; border-top:1px solid #4b5563; padding-top:4px; color:#6ee7b7;"><span>Total:</span> <span>${money(data.balance)}</span></div></div><div style="width:100%; display:flex; flex-direction:column; justify-content:flex-end; height:100%;"><div style="width:100%; background:var(--success); border-radius:2px 2px 0 0; height:${interestHeight}%; transition:height 0.3s;"></div><div style="width:100%; background:var(--blue); border-radius:0 0 2px 2px; height:${investedHeight}%; transition:height 0.3s;"></div></div>${showLabel ? `<div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:8px; font-size:10px; color:var(--text-muted); font-weight:500;">Yr ${data.year}</div>` : ''}</div>`;
    });
  }
}

window.sharePosbWA = function() { if(!posbState.lastResult) return; const res = posbState.lastResult; const depositAmount = res.deposit.toLocaleString('en-IN'); const maturityAmount = res.maturity.toLocaleString('en-IN'); let msg = `📊 Post Office Investment Estimate\n\nNamaskar 🙏,\n\nAgar aap ₹${depositAmount} ko ${res.schemeName} mein nivesh karte hain, to vartaman byaj dar (${res.rate}%) ke anusaar ${res.years} saal baad aapko lagbhag ₹${maturityAmount} prapt ho sakte hain.\n\n✅ Sarkari Suraksha\n✅ Guaranteed Returns\n✅ Vishwasniya Bachat Yojana\n\nYeh kewal ek anumaan hai. Adhik jankari ke liye apne najdeeki Post Office se sampark karein.\n\n📮 India Post – ${globalBoName}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`); };
window.sendWhatsApp = function(phone, name, scheme, status) { if(!phone || phone.length < 10) return alert("Valid phone number required."); let msg = `Namaskar ${name} Ji,\n\n`; if(status === 'At BO') { msg += `Aapka Post Office ka ${scheme} Passbook branch office mein aa gaya hai. Kripya samay nikal kar ise collect kar lein.`; } else { msg += `Aapka Post Office ka ${scheme} Account safaltapurvak khol diya gaya hai.`; } msg += `\n\nDhanyavaad,\nIndia Post - ${globalBoName}`; window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`); }

// --------------------------------------------------------------------------------------
// REPORT GENERATOR LOGIC
// --------------------------------------------------------------------------------------
window.showReportSection = function(section) {
    document.getElementById('rep-section-analytics').style.display = 'none';
    document.getElementById('rep-section-bosummary').style.display = (section === 'bosummary') ? 'block' : 'none';
    document.getElementById('rep-section-accounts').style.display = (section === 'accounts') ? 'block' : 'none';

    let todayStr = new Date().toISOString().slice(0, 10);
    let firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    let curMonth = todayStr.slice(0, 7);

    if (section === 'bosummary') {
        if (!document.getElementById('summary-month').value) document.getElementById('summary-month').value = curMonth;
        generateBOSummaryReport();
    }
    if (section === 'accounts') {
        if (!document.getElementById('accFromDate').value) document.getElementById('accFromDate').value = firstDay;
        if (!document.getElementById('accToDate').value) document.getElementById('accToDate').value = todayStr;
        generateAccountSummaryReport();
    }
    if (section === 'insights' || section === 'analytics') {
        runInsightsStudio();
    }
};

// ── Insights Studio ──────────────────────────────────────────────────────────
let isTrendChart = null, isPortfolioChart = null, isIncentiveChart = null;
let insightsTrendTab = 'deposits';

window.switchTrendTab = function(tab) {
    insightsTrendTab = tab;
    ['deposits', 'accounts', 'incentive'].forEach(t => {
        document.getElementById('trend-tab-' + t)?.classList.toggle('active', t === tab);
    });
    drawTrendChart(window._insightsCurrentData);
};

function getInsightsDateRange() {
    const from = document.getElementById('is-from')?.value;
    const to = document.getElementById('is-to')?.value;
    if (!from || !to) {
        const today = getLocalISODate();
        const firstOfMonth = today.slice(0, 7) + '-01';
        return { from: firstOfMonth, to: today };
    }
    return { from, to };
}

function getCompareRange(from, to, mode) {
    if (mode === 'none') return null;
    const a = parseLocalDate(from), b = parseLocalDate(to);
    const diffDays = Math.round((b - a) / 86400000) + 1;
    if (mode === 'prev_period') {
        const newTo = new Date(a); newTo.setDate(newTo.getDate() - 1);
        const newFrom = new Date(newTo); newFrom.setDate(newFrom.getDate() - diffDays + 1);
        return { from: getLocalISODate(newFrom), to: getLocalISODate(newTo) };
    }
    if (mode === 'prev_month') {
        const pm = new Date(a); pm.setMonth(pm.getMonth() - 1);
        const pmFirst = new Date(pm.getFullYear(), pm.getMonth(), 1);
        const pmLast = new Date(pm.getFullYear(), pm.getMonth() + 1, 0);
        return { from: getLocalISODate(pmFirst), to: getLocalISODate(pmLast) };
    }
    if (mode === 'prev_year') {
        return {
            from: `${Number(from.slice(0,4))-1}${from.slice(4)}`,
            to: `${Number(to.slice(0,4))-1}${to.slice(4)}`
        };
    }
    return null;
}

function getDataForRange(from, to, schemeFilter) {
    let entries = memAccReg.filter(e => e.date >= from && e.date <= to);
    if (schemeFilter && schemeFilter !== 'All') entries = entries.filter(e => e.scheme === schemeFilter);
    const totalDeposits = entries.reduce((s, e) => s + (Number(e.amt) || 0), 0);
    const totalAccounts = entries.length;
    const avgDeposit = totalAccounts ? totalDeposits / totalAccounts : 0;

    // TD incentive from ledger entries in range
    let tdIncentive = 0;
    entries.forEach(e => {
        const term = getTdTermFromScheme(e.scheme);
        if (term) tdIncentive += (Number(e.amt) || 0) * (INCENTIVE_RATES[term] || 0);
    });

    // Scheme breakdown
    const schemeMap = {};
    entries.forEach(e => {
        if (!schemeMap[e.scheme]) schemeMap[e.scheme] = { accounts: 0, deposits: 0 };
        schemeMap[e.scheme].accounts++;
        schemeMap[e.scheme].deposits += Number(e.amt) || 0;
    });

    // Pipeline
    const allPipeline = schemeFilter === 'All' ? memAccReg : memAccReg.filter(e => e.scheme === schemeFilter);
    const pendingAO = allPipeline.filter(e => e.pbStatus === 'Pending AO').length;
    const atBO = allPipeline.filter(e => e.pbStatus === 'At BO').length;
    const delivered = allPipeline.filter(e => e.pbStatus === 'Delivered').length;

    // Monthly trend (last 6 months of date range)
    const months = [];
    let cur = new Date(from + 'T00:00:00');
    const endD = parseLocalDate(to);
    while (cur <= endD) {
        const ym = getLocalISODate(cur).slice(0, 7);
        if (!months.includes(ym)) months.push(ym);
        cur.setMonth(cur.getMonth() + 1);
    }
    const trend = months.map(ym => {
        const mEntries = entries.filter(e => e.date.startsWith(ym));
        return {
            label: ym,
            deposits: mEntries.reduce((s, e) => s + (Number(e.amt) || 0), 0),
            accounts: mEntries.length,
            incentive: mEntries.reduce((s, e) => {
                const term = getTdTermFromScheme(e.scheme);
                return s + (term ? (Number(e.amt) || 0) * (INCENTIVE_RATES[term] || 0) : 0);
            }, 0)
        };
    });

    return { totalDeposits, totalAccounts, avgDeposit, tdIncentive, schemeMap, pendingAO, atBO, delivered, trend, entries };
}

function deltaHTML(curr, prev, isAmount = false) {
    if (prev === null || prev === undefined) return '';
    const diff = curr - prev;
    const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : (diff > 0 ? '100' : '0');
    const sign = diff >= 0 ? '+' : '';
    const cls = diff > 0 ? 'is-delta-up' : diff < 0 ? 'is-delta-down' : 'is-delta-neutral';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const label = isAmount ? `${sign}${money(diff)}` : `${sign}${diff}`;
    return `<span class="${cls}">${arrow} ${label} (${sign}${pct}%) vs prev</span>`;
}

function drawTrendChart(data) {
    if (!data) return;
    const ctx = document.getElementById('is-trend-chart')?.getContext('2d');
    if (!ctx) return;
    if (isTrendChart) { isTrendChart.destroy(); isTrendChart = null; }
    const key = insightsTrendTab;
    const labels = data.trend.map(t => t.label);
    const values = data.trend.map(t => t[key]);
    const color = key === 'deposits' ? '#8b1e3f' : key === 'accounts' ? '#4c1d95' : '#0f766e';
    isTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: key.charAt(0).toUpperCase() + key.slice(1),
                data: values,
                backgroundColor: color + '33',
                borderColor: color,
                borderWidth: 2,
                borderRadius: 6,
                type: 'bar'
            }, {
                label: 'Trend',
                data: values,
                type: 'line',
                borderColor: color,
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: color
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function drawPortfolioChart(schemeMap) {
    const ctx = document.getElementById('is-portfolio-chart')?.getContext('2d');
    if (!ctx) return;
    if (isPortfolioChart) { isPortfolioChart.destroy(); isPortfolioChart = null; }
    const schemes = Object.keys(schemeMap);
    const total = schemes.reduce((s, k) => s + schemeMap[k].deposits, 0);
    if (!total) return;
    const colors = ['#8b1e3f','#4c1d95','#0f766e','#c97a1f','#2563eb','#7c3aed','#0891b2','#65a30d','#d97706','#9f1239','#166534','#1d4ed8'];
    isPortfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: schemes,
            datasets: [{ data: schemes.map(k => schemeMap[k].deposits), backgroundColor: colors.slice(0, schemes.length), borderWidth: 2, borderColor: 'var(--bg-card)' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '68%' }
    });
    const legend = document.getElementById('is-portfolio-legend');
    if (legend) {
        legend.innerHTML = schemes.map((k, i) => `<div class="is-donut-legend-item"><span class="is-legend-dot" style="background:${colors[i]};"></span>${escapeHTML(k)} ${((schemeMap[k].deposits/total)*100).toFixed(0)}%</div>`).join('');
    }
}

function drawIncentiveChart(data) {
    const ctx = document.getElementById('is-incentive-chart')?.getContext('2d');
    if (!ctx) return;
    if (isIncentiveChart) { isIncentiveChart.destroy(); isIncentiveChart = null; }
    const labels = data.trend.map(t => t.label);
    const values = data.trend.map(t => t.incentive);
    isIncentiveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'TD Incentive', data: values, borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.12)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function buildInsights(curr, prev, allEntries, from, to) {
    const insights = [];
    if (prev) {
        if (curr.totalDeposits > prev.totalDeposits * 1.1) insights.push({ type: 'green', title: 'Strong Deposit Momentum', desc: `Deposits increased ${(((curr.totalDeposits - prev.totalDeposits) / (prev.totalDeposits || 1)) * 100).toFixed(0)}% compared with the previous period.` });
        if (curr.totalDeposits < prev.totalDeposits * 0.9) insights.push({ type: 'yellow', title: 'Deposit Slowdown Detected', desc: `Deposits dropped ${(((prev.totalDeposits - curr.totalDeposits) / (prev.totalDeposits || 1)) * 100).toFixed(0)}% compared with the previous period. Consider a campaign or customer outreach.` });
    }

    const pendingOld = memAccReg.filter(e => e.pbStatus === 'Pending AO');
    if (pendingOld.length >= 10) insights.push({ type: 'yellow', title: 'Passbook Processing Needs Attention', desc: `${pendingOld.length} passbook${pendingOld.length === 1 ? '' : 's'} are currently pending at Account Office.` });

    const atBOEntries = memAccReg.filter(e => e.pbStatus === 'At BO');
    const today = getLocalISODate();
    const stuckAtBO = atBOEntries.filter(e => e.date && ((new Date(today) - new Date(e.date)) / 86400000) > 7);
    if (stuckAtBO.length > 0) insights.push({ type: 'red', title: 'Action Required – Pending Delivery', desc: `${stuckAtBO.length} account${stuckAtBO.length === 1 ? '' : 's'} ${stuckAtBO.length === 1 ? 'has' : 'have'} been "At BO" for more than 7 days.` });

    // TD incentive opportunity
    const tdEntries = curr.entries.filter(e => ['1Y TD','2Y TD','3Y TD','5Y TD'].includes(e.scheme));
    const td5Entries = curr.entries.filter(e => e.scheme === '5Y TD');
    if (tdEntries.length > 0) {
        const td5Share = td5Entries.length / tdEntries.length;
        const td5IncShare = td5Entries.reduce((s,e)=>s+(e.amt||0),0) * 0.02 / (curr.tdIncentive || 1);
        if (td5Share < 0.35 && td5IncShare > 0.4) insights.push({ type: 'blue', title: 'TD Incentive Opportunity', desc: `5-Year TD represents only ${(td5Share*100).toFixed(0)}% of TD accounts but generates ~${(td5IncShare*100).toFixed(0)}% of your TD incentive. Increasing 5Y TD share could significantly boost incentive earnings.` });
    }

    const schemeKeys = Object.keys(curr.schemeMap);
    if (schemeKeys.length > 0) {
        const top = schemeKeys.reduce((a, b) => curr.schemeMap[a].deposits >= curr.schemeMap[b].deposits ? a : b);
        insights.push({ type: 'green', title: 'Top Performing Scheme', desc: `${top} leads with ${money(curr.schemeMap[top].deposits)} in deposits across ${curr.schemeMap[top].accounts} account${curr.schemeMap[top].accounts === 1 ? '' : 's'} this period.` });
    }

    if (insights.length === 0) insights.push({ type: 'blue', title: 'No Alerts', desc: 'All metrics are within normal range. Open filters to analyse a specific period or scheme.' });
    return insights;
}

let _insightsDrillData = null;

window.openSchemeDrillModal = function() {
    const modal = document.getElementById('is-drill-modal');
    if (!modal || !_insightsDrillData) return;
    modal.style.display = 'flex';
};
window.closeSchemeDrillModal = function() {
    const modal = document.getElementById('is-drill-modal');
    if (modal) modal.style.display = 'none';
};

function buildSchemeDrillModal(schemeMap, entries) {
    const schemes = Object.keys(schemeMap).sort((a, b) => schemeMap[b].deposits - schemeMap[a].deposits);
    const totalDeposits = schemes.reduce((s, k) => s + schemeMap[k].deposits, 0);
    let html = '<div style="display:flex; flex-direction:column; gap:16px;">';
    schemes.forEach(s => {
        const { accounts, deposits } = schemeMap[s];
        const avg = accounts ? deposits / accounts : 0;
        const share = totalDeposits ? ((deposits / totalDeposits) * 100).toFixed(1) : 0;
        const term = getTdTermFromScheme(s);
        const incentive = term ? deposits * (INCENTIVE_RATES[term] || 0) : null;
        html += `<div style="background:var(--bg-input); border:1px solid var(--border); border-radius:12px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:800; font-size:1rem;">${escapeHTML(s)}</span>
            <span class="badge">${share}% share</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:0.82rem;">
            <div><span style="color:var(--text-muted);">Accounts</span><br><strong>${accounts}</strong></div>
            <div><span style="color:var(--text-muted);">Total Deposits</span><br><strong>${money(deposits)}</strong></div>
            <div><span style="color:var(--text-muted);">Avg Deposit</span><br><strong>${money(avg)}</strong></div>
            ${incentive !== null ? `<div><span style="color:var(--text-muted);">TD Incentive</span><br><strong class="text-success">${money(incentive)}</strong></div>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
    const titleEl = document.getElementById('is-drill-title');
    const bodyEl = document.getElementById('is-drill-body');
    if (titleEl) titleEl.textContent = 'Scheme Detail Analysis';
    if (bodyEl) bodyEl.innerHTML = html;
    _insightsDrillData = { schemeMap, entries };
}

window.runInsightsStudio = function() {
    const { from, to } = getInsightsDateRange();
    const mode = document.getElementById('is-compare-mode')?.value || 'prev_period';
    const schemeFilter = document.getElementById('is-scheme-filter')?.value || 'All';

    const curr = getDataForRange(from, to, schemeFilter);
    const compRange = getCompareRange(from, to, mode);
    const prev = compRange ? getDataForRange(compRange.from, compRange.to, schemeFilter) : null;

    window._insightsCurrentData = curr;

    // KPI strip
    document.getElementById('is-v-deposits').textContent = money(curr.totalDeposits);
    document.getElementById('is-v-accounts').textContent = curr.totalAccounts;
    document.getElementById('is-v-incentive').textContent = money(curr.tdIncentive);
    document.getElementById('is-v-avg').textContent = money(curr.avgDeposit);
    document.getElementById('is-d-deposits').innerHTML = prev ? deltaHTML(curr.totalDeposits, prev.totalDeposits, true) : '';
    document.getElementById('is-d-accounts').innerHTML = prev ? deltaHTML(curr.totalAccounts, prev.totalAccounts, false) : '';
    document.getElementById('is-d-incentive').innerHTML = prev ? deltaHTML(curr.tdIncentive, prev.tdIncentive, true) : '';
    document.getElementById('is-d-avg').innerHTML = prev ? deltaHTML(curr.avgDeposit, prev.avgDeposit, true) : '';

    // Trend chart
    drawTrendChart(curr);

    // Scheme performance table
    const schemeKeys = Object.keys(curr.schemeMap).sort((a, b) => curr.schemeMap[b].deposits - curr.schemeMap[a].deposits);
    const totalDep = curr.totalDeposits || 1;
    let tbody = '';
    schemeKeys.forEach(s => {
        const { accounts, deposits } = curr.schemeMap[s];
        const avg = accounts ? deposits / accounts : 0;
        const share = ((deposits / totalDep) * 100).toFixed(0);
        const prevDep = prev?.schemeMap?.[s]?.deposits ?? null;
        let trendHtml = '<span class="is-trend-neutral">→</span>';
        if (prevDep !== null) {
            if (deposits > prevDep * 1.05) trendHtml = '<span class="is-trend-up">↑</span>';
            else if (deposits < prevDep * 0.95) trendHtml = '<span class="is-trend-down">↓</span>';
        }
        tbody += `<tr>
          <td><span class="badge">${escapeHTML(s)}</span></td>
          <td class="text-right">${accounts}</td>
          <td class="text-right">${money(deposits)}</td>
          <td class="text-right">${money(avg)}</td>
          <td class="text-right">${share}%</td>
          <td class="text-center">${trendHtml}</td>
        </tr>`;
    });
    document.getElementById('is-scheme-tbody').innerHTML = tbody || '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">No accounts found for this period.</td></tr>';

    const drillBtn = document.getElementById('is-scheme-drill-btn');
    if (drillBtn) drillBtn.style.display = schemeKeys.length ? 'inline-flex' : 'none';
    buildSchemeDrillModal(curr.schemeMap, curr.entries);

    // Portfolio chart
    drawPortfolioChart(curr.schemeMap);

    // Incentive stats
    const tdEntriesFull = curr.entries.filter(e => ['1Y TD','2Y TD','3Y TD','5Y TD'].includes(e.scheme));
    const bestTdTerm = ['5Y TD','3Y TD','2Y TD','1Y TD'].find(t => curr.schemeMap[t]?.accounts > 0) || 'N/A';
    const bestTdDeposits = curr.schemeMap[bestTdTerm]?.deposits || 0;
    const bestTdIncentive = getTdTermFromScheme(bestTdTerm) ? bestTdDeposits * (INCENTIVE_RATES[getTdTermFromScheme(bestTdTerm)] || 0) : 0;
    const avgIncentive = tdEntriesFull.length ? curr.tdIncentive / tdEntriesFull.length : 0;
    document.getElementById('is-incentive-stats').innerHTML = `
      <div class="is-stat-cell"><div class="is-stat-cell-label">Current Bill</div><div class="is-stat-cell-value">${money(curr.tdIncentive)}</div></div>
      <div class="is-stat-cell"><div class="is-stat-cell-label">Eligible Deposits</div><div class="is-stat-cell-value">${money(tdEntriesFull.reduce((s,e)=>s+(e.amt||0),0))}</div></div>
      <div class="is-stat-cell"><div class="is-stat-cell-label">Avg per Account</div><div class="is-stat-cell-value">${money(avgIncentive)}</div><div class="is-stat-cell-note">${tdEntriesFull.length} accounts</div></div>
      <div class="is-stat-cell"><div class="is-stat-cell-label">Best Term</div><div class="is-stat-cell-value">${escapeHTML(bestTdTerm)}</div><div class="is-stat-cell-note">${money(bestTdDeposits)} · ${money(bestTdIncentive)} incentive</div></div>
    `;
    drawIncentiveChart(curr);

    // Pipeline
    document.getElementById('is-pipeline-grid').innerHTML = `
      <div class="is-pipeline-cell is-pipeline-pending"><div class="is-pipeline-cell-label">Pending AO</div><div class="is-pipeline-cell-value">${curr.pendingAO}</div></div>
      <div class="is-pipeline-cell is-pipeline-atbo"><div class="is-pipeline-cell-label">At BO</div><div class="is-pipeline-cell-value">${curr.atBO}</div></div>
      <div class="is-pipeline-cell is-pipeline-delivered"><div class="is-pipeline-cell-label">Delivered</div><div class="is-pipeline-cell-value">${curr.delivered}</div></div>
    `;
    const today = getLocalISODate();
    const atBOList = memAccReg.filter(e => e.pbStatus === 'At BO' && e.date);
    const avgDays = atBOList.length ? (atBOList.reduce((s,e) => s + Math.round((new Date(today) - new Date(e.date)) / 86400000), 0) / atBOList.length).toFixed(1) : 0;
    const oldest = atBOList.length ? Math.max(...atBOList.map(e => Math.round((new Date(today) - new Date(e.date)) / 86400000))) : 0;
    document.getElementById('is-pipeline-meta').innerHTML = `<span>Avg Time at BO: <b>${avgDays} days</b></span><span>Oldest pending: <b>${oldest} days</b></span><span>Total in registry: <b>${memAccReg.length}</b></span>`;

    // Operational insights
    const insightItems = buildInsights(curr, prev, memAccReg, from, to);
    document.getElementById('is-insights-list').innerHTML = insightItems.map(item => `
      <div class="is-insight-item is-insight-${item.type}">
        <div class="is-insight-icon">${item.type === 'green' ? '🟢' : item.type === 'yellow' ? '🟡' : item.type === 'blue' ? '🔵' : '🔴'}</div>
        <div class="is-insight-body"><div class="is-insight-title">${escapeHTML(item.title)}</div><div class="is-insight-desc">${escapeHTML(item.desc)}</div></div>
      </div>`).join('');

    lucide.createIcons();
};

window.previewCustomReport = function() {
    const from = document.getElementById('crb-from')?.value;
    const to = document.getElementById('crb-to')?.value;
    if (!from || !to) { showToast('Please select a date range first.'); return; }
    document.getElementById('is-from').value = from;
    document.getElementById('is-to').value = to;
    window.runInsightsStudio();
    showToast('Report refreshed with selected date range.');
};

function initInsightsStudioFilters() {
    const today = getLocalISODate();
    const firstOfMonth = today.slice(0, 7) + '-01';
    const fromEl = document.getElementById('is-from');
    const toEl = document.getElementById('is-to');
    const crbFrom = document.getElementById('crb-from');
    const crbTo = document.getElementById('crb-to');
    if (fromEl && !fromEl.value) fromEl.value = firstOfMonth;
    if (toEl && !toEl.value) toEl.value = today;
    if (crbFrom && !crbFrom.value) crbFrom.value = firstOfMonth;
    if (crbTo && !crbTo.value) crbTo.value = today;
}

window.generateBOSummaryReport = function() {
    let monthInput = document.getElementById('summary-month').value;
    if(!monthInput) return;
    
    let [year, month] = monthInput.split('-');
    let daysInMonth = new Date(year, month, 0).getDate();
    let rows = [];
    
    function getOpBal(targetDate) {
        let dates = [...new Set(memCbData.map(d=>d.date)), ...Object.keys(memOverrides)].sort();
        let run = 0;
        for (let d of dates) {
            if (d >= targetDate) break;
            if (memOverrides[d] !== undefined) run = memOverrides[d];
            let dayData = memCbData.filter(x => x.date === d);
            dayData.forEach(tx => { if (tx.type === 'receipt') run += tx.amt; else run -= tx.amt; });
        }
        if (memOverrides[targetDate] !== undefined) return memOverrides[targetDate];
        return run;
    }
    
    for(let i=1; i<=daysInMonth; i++) {
        let dateStr = `${year}-${month}-${String(i).padStart(2, '0')}`;
        let dayData = memCbData.filter(d => d.date === dateStr);
        let hasOverride = memOverrides[dateStr] !== undefined;
        let isSaved = memCbStates[dateStr]?.saved || memCbStates[dateStr]?.tallyLocked;
        
        if(dayData.length > 0 || hasOverride || isSaved) {
            let opBal = getOpBal(dateStr);
            let cashFromAO = 0, spBooking = 0, pliRpli = 0, ippbDep = 0, sbDep = 0, rdDep = 0, ssa = 0, td = 0, otherRec = 0;
            let cashToAO = 0, ippbWith = 0, sbWith = 0, otherPay = 0;
            
            dayData.forEach(tx => {
                if(tx.type === 'receipt') {
                    if(tx.desc.includes('[Cash from AO]')) cashFromAO += tx.amt;
                    else if(tx.desc.includes('[Stamp Sales]')) spBooking += tx.amt;
                    else if(tx.desc.includes('PLI')) pliRpli += tx.amt;
                    else if(tx.desc.includes('[IPPB Deposit]')) ippbDep += tx.amt;
                    else if(tx.desc.includes('[SB Deposit]')) sbDep += tx.amt;
                    else if(tx.desc.includes('[RD Deposit]')) rdDep += tx.amt;
                    else if(tx.desc.includes('[SSA/PPF Deposit]')) ssa += tx.amt;
                    else if(tx.desc.includes('[TD/MIS/SCSS Deposit]')) td += tx.amt;
                    else otherRec += tx.amt;
                } else {
                    if(tx.desc.includes('[Remittance to AO]')) cashToAO += tx.amt;
                    else if(tx.desc.includes('[IPPB Withdrawal]')) ippbWith += tx.amt;
                    else if(tx.desc.includes('[SB Withdrawal]')) sbWith += tx.amt;
                    else otherPay += tx.amt;
                }
            });
            
            let pureReceipts = cashFromAO + spBooking + pliRpli + ippbDep + sbDep + rdDep + ssa + td + otherRec;
            let totRec = opBal + pureReceipts;
            let totPay = cashToAO + ippbWith + sbWith + otherPay;
            let clBal = totRec - totPay;
            
            rows.push({ date: i, dateStr, opBal, cashFromAO, spBooking, pliRpli, ippbDep, sbDep, rdDep, ssa, td, otherRec, totRec, cashToAO, ippbWith, sbWith, otherPay, totPay, clBal });
        }
    }
    
    window._lastSummaryRows = rows;
    let area = document.getElementById('boSummaryTableArea');
    if(rows.length === 0) { area.innerHTML = "<div style='padding: 32px; text-align: center; color: var(--text-muted); border: 1px solid var(--border); border-radius: 8px;'>No Day Book records found for this month.</div>"; return; }
    
    let html = `
      <table class="summary-table" id="summaryTable" style="min-width: 1600px; width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead style="position: sticky; top: 0; background: var(--bg-input); z-index: 10;">
          <tr>
            <th rowspan="2" style="border:1px solid var(--border); text-align:center; min-width: 60px; padding: 12px;">Date</th>
            <th rowspan="2" style="border:1px solid var(--border); text-align:center; min-width: 100px; padding: 12px;">Opening<br>Balance</th>
            <th colspan="9" style="text-align:center; border:1px solid var(--border); background:#ecfdf5; padding: 12px;">MONTHLY RECEIPTS</th>
            <th rowspan="2" style="border:1px solid var(--border); text-align:center; background:#d1fae5; color:#065f46; padding: 12px;">Total Receipts<br>(Inc. Op. Bal)</th>
            <th colspan="4" style="text-align:center; border:1px solid var(--border); background:#fef2f2; padding: 12px;">MONTHLY PAYMENTS</th>
            <th rowspan="2" style="border:1px solid var(--border); text-align:center; background:#fee2e2; color:#991b1b; padding: 12px;">Total<br>Payments</th>
            <th rowspan="2" style="border:1px solid var(--border); text-align:center; min-width: 100px; padding: 12px;">Closing<br>Balance</th>
          </tr>
          <tr>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">Cash from AO</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">SP Booking</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">PLI/RPLI</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">IPPB</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">SB</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">RD</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">SSA</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">TD</th>
            <th style="border:1px solid var(--border); text-align:center; background:#ecfdf5; padding: 8px;">Other</th>
            <th style="border:1px solid var(--border); text-align:center; background:#fef2f2; padding: 8px;">Cash to AO</th>
            <th style="border:1px solid var(--border); text-align:center; background:#fef2f2; padding: 8px;">IPPB Wd.</th>
            <th style="border:1px solid var(--border); text-align:center; background:#fef2f2; padding: 8px;">Savings Wd.</th>
            <th style="border:1px solid var(--border); text-align:center; background:#fef2f2; padding: 8px;">Other</th>
          </tr>
        </thead>
        <tbody>`;
        
    html += rows.map(r => `<tr>
        <td style="border:1px solid var(--border); text-align:center; padding: 8px;">${r.date}</td>
        <td style="border:1px solid var(--border); text-align:right; font-weight:600; padding: 8px;">${r.opBal}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.cashFromAO || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.spBooking || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.pliRpli || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.ippbDep || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.sbDep || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.rdDep || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.ssa || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.td || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#065f46; padding: 8px;">${r.otherRec || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; font-weight:700; color:var(--success); background:rgba(16, 185, 129, 0.05); padding: 8px;">${r.totRec}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#991b1b; padding: 8px;">${r.cashToAO || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#991b1b; padding: 8px;">${r.ippbWith || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#991b1b; padding: 8px;">${r.sbWith || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; color:#991b1b; padding: 8px;">${r.otherPay || ''}</td>
        <td style="border:1px solid var(--border); text-align:right; font-weight:700; color:var(--danger); background:rgba(239, 68, 68, 0.05); padding: 8px;">${r.totPay}</td>
        <td style="border:1px solid var(--border); text-align:right; font-weight:800; color:var(--brand-red); padding: 8px;">${r.clBal}</td>
      </tr>`).join('');
    
    html += `</tbody></table>`;
    area.innerHTML = html;
};

window.exportSummaryCSV = function() {
    let monthInput = document.getElementById('summary-month').value;
    if(!monthInput || !window._lastSummaryRows || window._lastSummaryRows.length === 0) return alert("Generate a summary first.");
    let dateObj = new Date(monthInput + '-01'); let monthName = dateObj.toLocaleString('en-IN', { month: 'long' }); let year = dateObj.getFullYear();
    const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let csv = `${csvCell(`MONTHLY DAILY ACCOUNT OF THE ${globalBoName.toUpperCase()} FOR ${monthName.toUpperCase()} ${year}`)},,,,,,,,,,,,,,,,,\n`;
    csv += `MONTHLY RECEIPTS,,,,,,,,,,,MONTHLY PAYMENTS,,,,,,\n`;
    csv += `DATE,OPENING BALANCE,CASH FROM AO,SP BOOKING,PLI/RPLI,INDIA POST PAYMENTS BANK,SAVINGS BANK,RECURRING DEPOSIT,SSA,TIME DEPOSIT,OTHER RECEIPTS,TOTAL RECEIPTS (INC. OP BAL),CASH TO AO,IPPB WITHDRAWAL,SAVINGS WITHDRAWAL,OTHER PAYMENTS,TOTAL OF PAYMENTS,CLOSING BALANCE\n`;
    window._lastSummaryRows.forEach(r => { csv += [r.date,r.opBal,r.cashFromAO,r.spBooking,r.pliRpli,r.ippbDep,r.sbDep,r.rdDep,r.ssa,r.td,r.otherRec,r.totRec,r.cashToAO,r.ippbWith,r.sbWith,r.otherPay,r.totPay,r.clBal].map(csvCell).join(',') + '\n'; });
    let blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }); let link = document.createElement("a"); let url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", createExportFilename(`BO_Monthly_Account_Report_${monthName}_${year}`, 'csv')); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
};

// Date math helpers
function addDaysToDateStr(dateStr, days) { let d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function addYearsToDateStr(dateStr, years) { let d = new Date(dateStr); d.setFullYear(d.getFullYear() + years); return d.toISOString().slice(0, 10); }

function getAccStatsForPeriod(from, to, scheme) {
    let filtered = memAccReg.filter(e => e.date >= from && e.date <= to && (scheme === 'All' || e.scheme === scheme));
    let amount = filtered.reduce((s, e) => s + e.amt, 0);
    return { count: filtered.length, amount: amount };
}
function formatChangePct(current, previous) {
    if (previous === 0) return current > 0 ? `<span style="color:var(--success);">+100% ↗</span>` : `<span style="color:var(--text-muted);">0% -</span>`;
    const pct = ((current - previous) / previous) * 100;
    if (pct > 0) return `<span style="color:var(--success);">+${pct.toFixed(1)}% ↗</span>`;
    if (pct < 0) return `<span style="color:var(--danger);">${pct.toFixed(1)}% ↘</span>`;
    return `<span style="color:var(--text-muted);">0% -</span>`;
}

window.generateAccountSummaryReport = function() {
    const from = document.getElementById('accFromDate').value; const to = document.getElementById('accToDate').value; const scheme = document.getElementById('accScheme').value;
    if(!from || !to) return;

    let filtered = memAccReg.filter(e => e.date >= from && e.date <= to && (scheme === 'All' || e.scheme === scheme));
    filtered.sort((a,b) => new Date(a.date) - new Date(b.date));
    const area = document.getElementById('accSummaryTableArea');
    
    const d1 = new Date(from); const d2 = new Date(to); const diffDays = Math.round((d2 - d1)/(1000*60*60*24));
    const p7From = addDaysToDateStr(from, -7); const p7To = addDaysToDateStr(to, -7);
    const p30From = addDaysToDateStr(from, -30); const p30To = addDaysToDateStr(to, -30);
    const pYFrom = addYearsToDateStr(from, -1); const pYTo = addYearsToDateStr(to, -1);
    
    const curStats = getAccStatsForPeriod(from, to, scheme); const p7Stats = getAccStatsForPeriod(p7From, p7To, scheme); const p30Stats = getAccStatsForPeriod(p30From, p30To, scheme); const pYStats = getAccStatsForPeriod(pYFrom, pYTo, scheme);

    const insightsArea = document.getElementById('accInsightsArea');
    if(filtered.length > 0) {
        insightsArea.style.display = 'block';
        document.getElementById('accInsightsCards').innerHTML = `
            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border);"><div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Current Selection (${diffDays+1} Days)</div><div style="font-size:1.25rem; font-weight:800; color:var(--text-main);">${money(curStats.amount)}</div><div style="font-size:0.75rem; color:var(--text-muted);">${curStats.count} Accounts Opened</div></div>
            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border);"><div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Vs Prev 7 Days</div><div style="font-size:1.25rem; font-weight:800;">${formatChangePct(curStats.amount, p7Stats.amount)}</div><div style="font-size:0.75rem; color:var(--text-muted);">Prev: ${money(p7Stats.amount)}</div></div>
            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border);"><div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Vs Prev 30 Days</div><div style="font-size:1.25rem; font-weight:800;">${formatChangePct(curStats.amount, p30Stats.amount)}</div><div style="font-size:0.75rem; color:var(--text-muted);">Prev: ${money(p30Stats.amount)}</div></div>
            <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border);"><div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Vs Last Year</div><div style="font-size:1.25rem; font-weight:800;">${formatChangePct(curStats.amount, pYStats.amount)}</div><div style="font-size:0.75rem; color:var(--text-muted);">Prev: ${money(pYStats.amount)}</div></div>
        `;
    } else {
        insightsArea.style.display = 'none';
        area.innerHTML = "<div style='padding: 32px; text-align: center; color: var(--text-muted); border: 1px solid var(--border); border-radius: 8px;'>No accounts found for this selection.</div>"; 
        return;
    }

    let html = `
    <div style="text-align:center; margin-bottom: 16px;">
        <h3 style="font-size: 1.1rem; font-weight: 700;">Account Performance Report</h3>
        <p style="font-size: 0.875rem; color: var(--text-muted);">Period: ${new Date(from).toLocaleDateString('en-IN')} to ${new Date(to).toLocaleDateString('en-IN')} | Scheme: ${scheme}</p>
    </div>
    <table id="accSummaryTable" class="table w-full text-sm border-collapse" style="border: 1px solid var(--border);">
      <thead><tr><th style="border: 1px solid var(--border); text-align:left; background: #f8fafc;">Date</th><th style="border: 1px solid var(--border); text-align:left; background: #f8fafc;">Customer Details</th><th style="border: 1px solid var(--border); text-align:left; background: #f8fafc;">Account Number</th><th style="border: 1px solid var(--border); text-align:left; background: #f8fafc;">Scheme</th><th class="text-right" style="border: 1px solid var(--border); background: #f8fafc;">Deposit Amount</th></tr></thead>
      <tbody>`;
    
    filtered.forEach(e => { 
        html += `<tr><td style="border: 1px solid var(--border); color: var(--text-muted); font-weight: 500;">${e.date}</td><td style="border: 1px solid var(--border); font-weight:600;">${e.name} ${e.phone ? '<br><span style="font-size:0.75rem; font-weight:500; color:var(--text-muted);">'+e.phone+'</span>' : ''}</td><td style="border: 1px solid var(--border); font-family: monospace; font-weight: 600;">${e.acc || '--'}</td><td style="border: 1px solid var(--border);">${e.scheme}</td><td class="text-right" style="border: 1px solid var(--border); color:var(--success); font-weight:800; font-size: 1.05rem;">${e.amt}</td></tr>`; 
    });
    
    html += `<tr style="background:var(--bg-input);"><td colspan="4" class="text-right" style="border: 1px solid var(--border); font-weight:800; font-size: 1.05rem;">Total Ledger Deposit:</td><td class="text-right" style="border: 1px solid var(--border); font-weight:800; color:var(--text-main); font-size: 1.05rem;">${curStats.amount}</td></tr></tbody></table>`;
    area.innerHTML = html;
};

window.generateReportCharts = function() {
    const start = document.getElementById('rep-start')?.value;
    const end = document.getElementById('rep-end')?.value;
    if (!start || !end) return;
    let filteredCb = memCbData.filter(d => d.date >= start && d.date <= end);
    let totRec = 0, totPay = 0; filteredCb.forEach(d => { if(d.type === 'receipt') totRec += d.amt; else totPay += d.amt; });
    
    if(repChartCashFlow) repChartCashFlow.destroy();
    const ctxCF = document.getElementById('rep-chart-cashflow').getContext('2d');
    repChartCashFlow = new Chart(ctxCF, { type: 'bar', data: { labels: ['Cash Flow'], datasets: [ { label: 'Receipts (+)', data: [totRec], backgroundColor: '#10b981' }, { label: 'Payments (-)', data: [totPay], backgroundColor: '#ef4444' } ] }, options: { responsive: true, maintainAspectRatio: false } });

    let filteredLedger = memAccReg.filter(d => d.date >= start && d.date <= end);
    let schemeCounts = {}; filteredLedger.forEach(d => { schemeCounts[d.scheme] = (schemeCounts[d.scheme] || 0) + 1; });
    if(repChartSchemes) repChartSchemes.destroy();
    const ctxSch = document.getElementById('rep-chart-schemes').getContext('2d');
    repChartSchemes = new Chart(ctxSch, {
        type: 'doughnut',
        data: {
            labels: Object.keys(schemeCounts).length ? Object.keys(schemeCounts) : ['No Data'],
            datasets: [{ data: Object.values(schemeCounts).length ? Object.values(schemeCounts) : [1], backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'] }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_, elements, chart) => {
                if (!elements.length) return;
                const label = chart.data.labels[elements[0].index];
                const isTd = String(label || '').includes('TD');
                renderTdDrillChart(filteredLedger, isTd);
            }
        }
    });

    renderTdDrillChart(filteredLedger, false);
    renderClosingTrendline(end || getLocalISODate());
    renderPassbookTatGraph();
    renderYoyHeatmap(end || getLocalISODate());
    updateInsightStudioWidgets(start, end, filteredCb, filteredLedger);
};

function getDateRange(start, end) {
    const dates = [];
    const s = parseLocalDate(start);
    const e = parseLocalDate(end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) dates.push(getLocalISODate(d));
    return dates;
}

function getClosingBalanceForDate(dateStr) {
    const opening = getOpeningBalance(dateStr);
    const dayEntries = memCbData.filter(entry => entry.date === dateStr);
    return dayEntries.reduce((bal, entry) => bal + (entry.type === 'receipt' ? Number(entry.amt) : -Number(entry.amt)), opening);
}

function getSchemeTargets() {
    return JSON.parse(localStorage.getItem('schemeTargetsV1') || '{}');
}

window.saveSchemeTarget = function(scheme, value) {
    const targets = getSchemeTargets();
    targets[scheme] = Math.max(0, Number(value) || 0);
    localStorage.setItem('schemeTargetsV1', JSON.stringify(targets));
    updateInsightStudioWidgets();
};

function renderTargetBars(currentMonth, monthEntries) {
    const container = document.getElementById('target-bars');
    if (!container) return;
    const targets = getSchemeTargets();
    const schemes = ['SSA', 'RD', '1Y TD', '2Y TD', '3Y TD', '5Y TD', 'MSSC'];
    container.innerHTML = schemes.map(scheme => {
        const target = Math.max(0, Number(targets[scheme] || 0));
        const achieved = monthEntries.filter(entry => entry.scheme === scheme).length;
        const percent = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
        return `<div class="target-row"><div class="target-row-head"><span>${scheme}</span><span>${achieved}/${target || '-'} </span></div><div style="display:flex; gap:8px; align-items:center;"><input type="number" min="0" value="${target}" onchange="saveSchemeTarget('${scheme}', this.value)" style="width:88px;"><div class="insight-meter" style="flex:1;"><span style="width:${percent}%"></span></div></div></div>`;
    }).join('');
}

function renderTdDrillChart(filteredLedger, showTdOnly) {
    const canvas = document.getElementById('rep-chart-td-drill');
    if (!canvas) return;
    const tdSchemes = ['1Y TD', '2Y TD', '3Y TD', '5Y TD'];
    const source = showTdOnly ? filteredLedger.filter(entry => String(entry.scheme || '').includes('TD')) : filteredLedger;
    const counts = tdSchemes.map(s => source.filter(entry => entry.scheme === s).length);
    const hasData = counts.some(v => v > 0);
    if (repChartTdDrill) repChartTdDrill.destroy();
    repChartTdDrill = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? tdSchemes : ['No TD Data'],
            datasets: [{ data: hasData ? counts : [1], backgroundColor: hasData ? ['#dc2626', '#2563eb', '#10b981', '#f59e0b'] : ['#cbd5e1'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });
}

function renderClosingTrendline(anchorDate) {
    const canvas = document.getElementById('rep-chart-closing');
    if (!canvas) return;
    const end = parseLocalDate(anchorDate);
    const labels = [];
    const values = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const iso = getLocalISODate(d);
        labels.push(iso.slice(5));
        values.push(getClosingBalanceForDate(iso));
    }
    if (repChartClosing) repChartClosing.destroy();
    repChartClosing = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Closing Balance', data: values, borderColor: '#da291c', backgroundColor: 'rgba(218,41,28,0.12)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderPassbookTatGraph() {
    const canvas = document.getElementById('rep-chart-tat');
    if (!canvas) return;
    const today = new Date();
    const pending = memAccReg.filter(entry => entry.pbStatus === 'Pending AO');
    const atBo = memAccReg.filter(entry => entry.pbStatus === 'At BO');
    const delivered = memAccReg.filter(entry => entry.pbStatus === 'Delivered');
    const avgDays = entries => entries.length ? Math.round(entries.reduce((sum, entry) => sum + Math.max(0, Math.round((today - parseLocalDate(entry.date || getLocalISODate())) / (24*60*60*1000))), 0) / entries.length) : 0;
    if (repChartTat) repChartTat.destroy();
    repChartTat = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: ['Pending AO', 'At BO', 'Delivered'], datasets: [{ label: 'Average days since opening', data: [avgDays(pending), avgDays(atBo), avgDays(delivered)], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderYoyHeatmap(anchorDate) {
    const container = document.getElementById('yoy-heatmap');
    if (!container) return;
    const [year, month] = String(anchorDate).slice(0, 7).split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrevYearMonth = new Date(year - 1, month, 0).getDate();
    const countFor = (y, m, d) => memAccReg.filter(entry => entry.date === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).length;
    const currentCounts = Array.from({ length: daysInMonth }, (_, i) => countFor(year, month, i + 1));
    const prevCounts = Array.from({ length: daysInPrevYearMonth }, (_, i) => countFor(year - 1, month, i + 1));
    const maxCount = Math.max(1, ...currentCounts, ...prevCounts);
    const cell = count => {
        const level = count === 0 ? '' : count / maxCount <= 0.25 ? 'l1' : count / maxCount <= 0.5 ? 'l2' : count / maxCount <= 0.75 ? 'l3' : 'l4';
        return `<div class="heat-cell ${level}" title="${count} openings"></div>`;
    };
    container.innerHTML = `<div class="insight-sub" style="grid-column:1 / -1; margin-bottom:4px;">Current Year (${year})</div>${currentCounts.map(cell).join('')}<div class="insight-sub" style="grid-column:1 / -1; margin-top:8px; margin-bottom:4px;">Last Year (${year - 1})</div>${prevCounts.map(cell).join('')}`;
}

window.updateInsightStudioWidgets = function(startArg, endArg, filteredCbArg, filteredLedgerArg) {
    const start = startArg || document.getElementById('rep-start')?.value;
    const end = endArg || document.getElementById('rep-end')?.value;
    if (!start || !end) return;
    const filteredCb = filteredCbArg || memCbData.filter(entry => entry.date >= start && entry.date <= end);
    const filteredLedger = filteredLedgerArg || memAccReg.filter(entry => entry.date >= start && entry.date <= end);

    const today = new Date();
    const currentMonth = getLocalISODate().slice(0, 7);
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const ssaCurrent = memAccReg.filter(entry => String(entry.date || '').startsWith(currentMonth) && entry.scheme === 'SSA').length;
    const ssaPrev = memAccReg.filter(entry => String(entry.date || '').startsWith(prevMonth) && entry.scheme === 'SSA').length;
    const ssaDiff = ssaPrev ? Math.round(((ssaCurrent - ssaPrev) / ssaPrev) * 100) : (ssaCurrent > 0 ? 100 : 0);
    const narrativeEl = document.getElementById('insight-narrative');
    if (narrativeEl) narrativeEl.textContent = `You opened ${ssaCurrent} Sukanya Samriddhi (SSA) accounts this month, ${ssaDiff >= 0 ? `${ssaDiff}% higher` : `${Math.abs(ssaDiff)}% lower`} than last month.`;

    const cashLimit = Math.max(1, Number(document.getElementById('cash-limit-input')?.value || 100000));
    const latestClosing = getClosingBalanceForDate(end);
    const limitPct = Math.max(0, Math.min(100, Math.round((latestClosing / cashLimit) * 100)));
    const cashFill = document.getElementById('cash-limit-fill');
    const cashText = document.getElementById('cash-limit-text');
    if (cashFill) cashFill.style.width = `${limitPct}%`;
    if (cashText) cashText.textContent = `Current: ${money(latestClosing)} of limit ${money(cashLimit)} (${limitPct}%). ${limitPct >= 90 ? 'Remittance recommended.' : ''}`;

    const pendingOld = memAccReg.filter(entry => entry.pbStatus === 'Pending AO' && entry.date && (today - parseLocalDate(entry.date)) / (24*60*60*1000) > 14).length;
    const alerts = [];
    alerts.push(`<div class="insight-pill">Pending AO >14 days: <strong>${pendingOld}</strong></div>`);

    const allDates = getDateRange(start, end);
    const zeroEntryDays = allDates.filter(date => !memCbData.some(entry => entry.date === date));
    const withdrawals = filteredCb.filter(entry => entry.type === 'payment').map(entry => Number(entry.amt) || 0).sort((a,b)=>a-b);
    const withdrawalThreshold = withdrawals.length ? Math.max(50000, withdrawals[Math.floor(withdrawals.length * 0.95)] || 0) : 50000;
    const hugeWithdrawals = filteredCb.filter(entry => entry.type === 'payment' && Number(entry.amt) >= withdrawalThreshold);
    alerts.push(`<div class="insight-pill">Zero-entry cashbook days: <strong>${zeroEntryDays.length}</strong></div>`);
    alerts.push(`<div class="insight-pill">Unusually high withdrawals: <strong>${hugeWithdrawals.length}</strong></div>`);
    const alertsEl = document.getElementById('insight-alerts');
    if (alertsEl) alertsEl.innerHTML = alerts.join('');

    const completeKyc = memAccReg.filter(entry => entry.phone && entry.aadhaar && entry.pan).length;
    const totalLedger = memAccReg.length || 1;
    const kycPct = Math.round((completeKyc / totalLedger) * 100);
    const kycScore = document.getElementById('kyc-score');
    const kycFill = document.getElementById('kyc-fill');
    const kycText = document.getElementById('kyc-text');
    if (kycScore) kycScore.textContent = `${kycPct}%`;
    if (kycFill) kycFill.style.width = `${kycPct}%`;
    if (kycText) kycText.textContent = `${completeKyc} of ${memAccReg.length} entries have Phone + Aadhaar + PAN.`;

    const monthEntries = memAccReg.filter(entry => String(entry.date || '').startsWith(currentMonth));
    renderTargetBars(currentMonth, monthEntries);

    const tdLedgerEntries = filteredLedger.filter(entry => {
        const term = getTdTermFromScheme(entry.scheme);
        return term !== null && Number(entry.amt) > 0;
    });
    const tdSchemeSummary = [
        { label: '1Y TD', term: 1 },
        { label: '2Y TD', term: 2 },
        { label: '3Y TD', term: 3 },
        { label: '5Y TD', term: 5 }
    ].map(item => {
        const rows = tdLedgerEntries.filter(entry => getTdTermFromScheme(entry.scheme) === item.term);
        const depositTotal = rows.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
        const incentiveTotal = rows.reduce((sum, entry) => sum + Math.round((Number(entry.amt) || 0) * (INCENTIVE_RATES[item.term] || 0)), 0);
        return { ...item, count: rows.length, depositTotal, incentiveTotal };
    });
    const predictedTdIncentive = tdSchemeSummary.reduce((sum, item) => sum + item.incentiveTotal, 0);
    const predictor = document.getElementById('incentive-predictor');
    if (predictor) {
        if (!tdLedgerEntries.length) {
            predictor.innerHTML = '<div class="insight-pill">No TD ledger entries in this period to predict incentive.</div>';
        } else {
            predictor.innerHTML = [
                ...tdSchemeSummary.map(item => `<div class="insight-pill">${item.label}: <strong>${money(item.incentiveTotal)}</strong> <span style="color:var(--text-muted);">(${item.count} account${item.count === 1 ? '' : 's'} · ${money(item.depositTotal)} deposits)</span></div>`),
                `<div class="insight-pill">Predicted TD Incentive (Ledger): <strong>${money(predictedTdIncentive)}</strong></div>`
            ].join('');
        }
    }

    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const expectedByNow = Math.round((dayOfMonth / daysInMonth) * monthEntries.length);
    const pace = monthEntries.length >= expectedByNow ? (monthEntries.length >= expectedByNow + 3 ? 'Ahead' : 'On Track') : 'Falling Behind';
    const paceEl = document.getElementById('pace-indicator');
    if (paceEl) paceEl.textContent = `Status: ${pace}. Openings this month: ${monthEntries.length}.`;

    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonthEndDate = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0);
    const nextMonthEnd = `${nextMonthEndDate.getFullYear()}-${String(nextMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthEndDate.getDate()).padStart(2, '0')}`;
    const maturityItems = memAccReg.filter(entry => ['1Y TD', '2Y TD', '3Y TD', '5Y TD'].includes(entry.scheme)).map(entry => {
        const years = Number(String(entry.scheme).slice(0, 1));
        const maturity = addYearsToDateStr(entry.date, years);
        return { ...entry, maturity };
    }).filter(entry => entry.maturity >= nextMonthStart && entry.maturity <= nextMonthEnd).sort((a,b)=>a.maturity.localeCompare(b.maturity));
    const maturityEl = document.getElementById('maturity-forecast');
    if (maturityEl) maturityEl.innerHTML = maturityItems.length ? maturityItems.slice(0, 10).map(entry => `<div class="insight-pill">${entry.maturity} • ${escapeHTML(entry.name)} • ${escapeHTML(entry.scheme)} • ${money(entry.amt)}</div>`).join('') : '<div class="insight-pill">No TD maturities expected next month.</div>';

    const anomalyEl = document.getElementById('anomaly-list');
    if (anomalyEl) {
        const anomalyRows = [];
        if (zeroEntryDays.length) anomalyRows.push(`<div class="insight-pill">Zero cashbook activity days: ${zeroEntryDays.slice(0, 6).join(', ')}${zeroEntryDays.length > 6 ? ' ...' : ''}</div>`);
        if (hugeWithdrawals.length) anomalyRows.push(`<div class="insight-pill">High withdrawals (>= ${money(withdrawalThreshold)}): ${hugeWithdrawals.slice(0, 6).map(entry => `${entry.date} ${money(entry.amt)}`).join(' | ')}${hugeWithdrawals.length > 6 ? ' ...' : ''}</div>`);
        anomalyEl.innerHTML = anomalyRows.length ? anomalyRows.join('') : '<div class="insight-pill">No anomalies detected in selected range.</div>';
    }
};

window.runCampaignTracker = function() {
    const start = document.getElementById('campaign-start')?.value;
    const end = document.getElementById('campaign-end')?.value;
    if (!start || !end) return;
    const entries = memAccReg.filter(entry => entry.date >= start && entry.date <= end);
    const deposits = entries.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
    const schemes = entries.reduce((acc, entry) => { acc[entry.scheme] = (acc[entry.scheme] || 0) + 1; return acc; }, {});
    const topScheme = Object.entries(schemes).sort((a,b)=>b[1]-a[1])[0];
    const target = document.getElementById('campaign-results');
    if (target) target.innerHTML = `<div class="insight-pill">Accounts opened: <strong>${entries.length}</strong></div><div class="insight-pill">Deposit mobilized: <strong>${money(deposits)}</strong></div><div class="insight-pill">Top scheme: <strong>${topScheme ? `${topScheme[0]} (${topScheme[1]})` : 'N/A'}</strong></div>`;
};

window.runCustomBenchmark = function() {
    const aStart = document.getElementById('bench-a-start')?.value;
    const aEnd = document.getElementById('bench-a-end')?.value;
    const bStart = document.getElementById('bench-b-start')?.value;
    const bEnd = document.getElementById('bench-b-end')?.value;
    if (!aStart || !aEnd || !bStart || !bEnd) return;
    const periodStats = (start, end) => {
        const ledger = memAccReg.filter(entry => entry.date >= start && entry.date <= end);
        const cb = memCbData.filter(entry => entry.date >= start && entry.date <= end);
        return {
            accounts: ledger.length,
            deposits: ledger.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0),
            receipts: cb.filter(entry => entry.type === 'receipt').reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0),
            payments: cb.filter(entry => entry.type === 'payment').reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0)
        };
    };
    const a = periodStats(aStart, aEnd);
    const b = periodStats(bStart, bEnd);
    const target = document.getElementById('benchmark-results');
    if (target) target.innerHTML = `<div class="insight-pill">Accounts: A ${a.accounts} vs B ${b.accounts}</div><div class="insight-pill">Deposits: A ${money(a.deposits)} vs B ${money(b.deposits)}</div><div class="insight-pill">Receipts: A ${money(a.receipts)} vs B ${money(b.receipts)}</div><div class="insight-pill">Payments: A ${money(a.payments)} vs B ${money(b.payments)}</div>`;
};

window.generateUnifiedMasterReport = async function() {
    const start = document.getElementById('rep-start')?.value;
    const end = document.getElementById('rep-end')?.value;
    if (!start || !end) return alert('Select a date range first.');
    const cb = memCbData.filter(entry => entry.date >= start && entry.date <= end);
    const ledger = memAccReg.filter(entry => entry.date >= start && entry.date <= end);
    const wrapper = document.createElement('div');
    wrapper.id = 'master-report-wrap';
    wrapper.style.cssText = 'background:#fff;color:#111;padding:20px;font-family:Inter, sans-serif;max-width:980px;';
    const rec = cb.filter(entry => entry.type === 'receipt').reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
    const pay = cb.filter(entry => entry.type === 'payment').reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
    wrapper.innerHTML = `
      <h2 style="margin:0 0 8px;">Unified Master Report</h2>
      <div style="margin-bottom:14px;">Period: ${start} to ${end} | Branch: ${escapeHTML(globalBoName)}</div>
      <h3>Cashbook Summary</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;"><tr><th style="border:1px solid #ddd; padding:8px;">Total Receipts</th><th style="border:1px solid #ddd; padding:8px;">Total Payments</th><th style="border:1px solid #ddd; padding:8px;">Net</th></tr><tr><td style="border:1px solid #ddd; padding:8px;">${money(rec)}</td><td style="border:1px solid #ddd; padding:8px;">${money(pay)}</td><td style="border:1px solid #ddd; padding:8px;">${money(rec - pay)}</td></tr></table>
      <h3>Ledger Summary</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;"><tr><th style="border:1px solid #ddd; padding:8px;">Accounts Opened</th><th style="border:1px solid #ddd; padding:8px;">Deposit Mobilized</th><th style="border:1px solid #ddd; padding:8px;">Pending AO</th></tr><tr><td style="border:1px solid #ddd; padding:8px;">${ledger.length}</td><td style="border:1px solid #ddd; padding:8px;">${money(ledger.reduce((s,e)=>s+(Number(e.amt)||0),0))}</td><td style="border:1px solid #ddd; padding:8px;">${ledger.filter(e=>e.pbStatus==='Pending AO').length}</td></tr></table>
      <h3>Manual Overrides / Audit</h3>
      <div style="margin-bottom:10px;">Overrides in range: ${Object.keys(memOverrides).filter(date => date >= start && date <= end).length}</div>
      <div style="font-size:12px; color:#444;">Generated on ${new Date().toLocaleString('en-IN')}</div>
    `;
    document.body.appendChild(wrapper);
    try {
        await window.exportModulePDF('master-report-wrap', `Unified_Master_Report_${start}_to_${end}`);
        localStorage.setItem('lastMasterReportArchivedMonth', end.slice(0, 7));
    } finally {
        wrapper.remove();
    }
};

window.forwardMasterReportWhatsApp = function() {
    const start = document.getElementById('rep-start')?.value;
    const end = document.getElementById('rep-end')?.value;
    const msg = `Unified Master Report ready for ${globalBoName} (${start || 'N/A'} to ${end || 'N/A'}). Please find the PDF attached.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
};

window.exportPivotReadyData = function() {
    const rows = [];
    memCbData.forEach(entry => rows.push({
        record_type: 'cashbook', date: entry.date, flow_type: entry.type, scheme: (entry.desc || '').replace(/\[|\]/g, ''),
        amount: Number(entry.amt) || 0, account_no: '', customer_name: '', pr_no: '', passbook_status: ''
    }));
    memAccReg.forEach(entry => rows.push({
        record_type: 'ledger', date: entry.date, flow_type: 'account_opening', scheme: entry.scheme || '',
        amount: Number(entry.amt) || 0, account_no: entry.acc || '', customer_name: entry.name || '', pr_no: entry.prNo || '', passbook_status: entry.pbStatus || ''
    }));
    const headers = ['record_type', 'date', 'flow_type', 'scheme', 'amount', 'account_no', 'customer_name', 'pr_no', 'passbook_status'];
    const csv = [headers.join(','), ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = createExportFilename('Pivot_Ready_Data_Dump', 'csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

window.openInspectorAuditView = function() {
    const body = document.getElementById('inspectorAuditBody');
    const modal = document.getElementById('inspectorAuditModal');
    if (!body || !modal) return;
    const overrides = Object.entries(memOverrides).sort((a, b) => b[0].localeCompare(a[0]));
    body.innerHTML = `
      <div class="insight-card" style="margin-bottom:12px;"><h3><i data-lucide="history"></i> Audit Trail</h3>${memAuditLog.slice(0, 150).map(item => `<div class="insight-pill">${escapeHTML(item.at)} • ${escapeHTML(item.action)} • ${escapeHTML(item.module)} • ${escapeHTML(item.details || '')}</div>`).join('') || '<div class="insight-pill">No audit entries.</div>'}</div>
      <div class="insight-card"><h3><i data-lucide="alert-triangle"></i> Manual Overrides</h3>${overrides.map(([date, amount]) => `<div class="insight-pill">${escapeHTML(date)} → ${money(amount)}</div>`).join('') || '<div class="insight-pill">No manual overrides.</div>'}</div>
    `;
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.closeInspectorAuditView = function() {
    const modal = document.getElementById('inspectorAuditModal');
    if (modal) modal.style.display = 'none';
};

function checkMonthlyMasterReportReminder() {
    const now = new Date();
    if (now.getDate() !== 1) return;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const archived = localStorage.getItem('lastMasterReportArchivedMonth');
    if (archived !== prevMonth) showToast(`Reminder: Archive last month's Unified Master Report (${prevMonth}).`);
}

// --------------------------------------------------------------------------------------
// BACKUP & DASHBOARD
// --------------------------------------------------------------------------------------
function renderDashboard() {
    let tdTotalInc = memTdEntries.reduce((s,e)=>s+e.incentive,0);
    const now = new Date();
    const todayStr = getLocalISODate(now);
    const bpmDisplayName = globalBpmName || document.getElementById('bpmName')?.value || 'Branch Postmaster';
    const closedReason = getClosedDayReason(todayStr);
    const todayEntries = memCbData.filter(entry => entry.date === todayStr);
    const todayBalance = todayEntries.reduce((balance, entry) => balance + (entry.type === 'receipt' ? Number(entry.amt) : -Number(entry.amt)), getOpeningBalance(todayStr));
    const cashBalanceEl = document.getElementById('dashCashBalance');
    const balanceNoteEl = document.getElementById('dash-cash-balance-note');
    const closureEl = document.getElementById('dash-closure-message');
    const cashAction = document.getElementById('dash-cash-action');
    const statusText = document.getElementById('dash-status-text');
    const statusIndicator = document.getElementById('dash-status-indicator');
    const todayReceipts = todayEntries.reduce((sum, entry) => sum + (entry.type === 'receipt' ? Number(entry.amt) : 0), 0);
    const todayPayments = todayEntries.reduce((sum, entry) => sum + (entry.type === 'payment' ? Number(entry.amt) : 0), 0);
    const todayNet = todayReceipts - todayPayments;

    if (closedReason) {
        cashBalanceEl.textContent = '₹ **,***.**';
        balanceNoteEl.textContent = `Balance hidden: ${closedReason}`;
        closureEl.textContent = `Treasury access is unavailable today because the branch is closed for ${closedReason}. You can still review earlier records and reports.`;
        closureEl.classList.add('show');
        cashAction.disabled = true;
        cashAction.title = `Treasury unavailable: ${closedReason}`;
        statusText.textContent = 'Treasury Unavailable';
        statusIndicator.style.background = '#cbd5e1';
        statusIndicator.style.boxShadow = 'none';
    } else {
        cashBalanceEl.textContent = money(todayBalance);
        balanceNoteEl.textContent = "Calculated from today's Cash Book";
        closureEl.textContent = '';
        closureEl.classList.remove('show');
        cashAction.disabled = false;
        cashAction.title = 'Record a cash receipt';
        const todayState = memCbStates[todayStr] || {};
        if (todayState.tallyLocked) {
            statusText.textContent = 'Day End Completed'; statusIndicator.style.background = '#10b981';
        } else if (todayState.saved) {
            statusText.textContent = 'Treasury Closed'; statusIndicator.style.background = '#3b82f6';
        } else {
            statusText.textContent = 'Treasury Open'; statusIndicator.style.background = '#facc15';
        }
        statusIndicator.style.boxShadow = `0 0 8px ${statusIndicator.style.background}`;
    }
    const dashBpmName = document.getElementById('dash-bpm-name');
    if (dashBpmName) dashBpmName.textContent = bpmDisplayName;
    document.getElementById('dashAccCount').textContent = memAccReg.length;
    document.getElementById('dashReminderCount').textContent = memReminders.length;
    document.getElementById('dash-date-display').textContent = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let currentMonth = todayStr.slice(0, 7); let schemeCountsMonth = {};
    memAccReg.forEach(d => { if(String(d.date || '').startsWith(currentMonth)) schemeCountsMonth[d.scheme] = (schemeCountsMonth[d.scheme] || 0) + 1; });
    const monthEntries = memAccReg.filter(d => String(d.date || '').startsWith(currentMonth));
    const monthDeposits = monthEntries.reduce((sum, entry) => sum + (Number(entry.amt) || 0), 0);
    const tdCount = monthEntries.filter(entry => String(entry.scheme || '').includes('TD')).length;
    const rdCount = monthEntries.filter(entry => entry.scheme === 'RD').length;
    const ssaCount = monthEntries.filter(entry => entry.scheme === 'SSA').length;
    const pendingPassbooks = memAccReg.filter(entry => entry.pbStatus === 'Pending AO').length;
    const todayState = memCbStates[todayStr] || {};
    const closeSteps = [todayEntries.length > 0, !!todayState.saved, !!todayState.tallyLocked];
    const eodPercent = closedReason ? 0 : Math.round((closeSteps.filter(Boolean).length / closeSteps.length) * 100);
    const schemeSummary = document.getElementById('dash-scheme-summary');
    const ring = document.getElementById('dash-eod-ring');
    if (ring) ring.style.strokeDashoffset = String(314.16 - (314.16 * eodPercent / 100));
    document.getElementById('dash-eod-pct').textContent = `${eodPercent}%`;
    document.getElementById('dash-eod-note').textContent = closedReason ? `Day-close activity is unavailable: ${closedReason}.` : `${closeSteps.filter(Boolean).length} of ${closeSteps.length} day-close checks completed.`;
    document.getElementById('dash-pending-passbooks').textContent = `${pendingPassbooks} passbook${pendingPassbooks === 1 ? '' : 's'} pending`;
    document.getElementById('dash-month-accounts').textContent = `${monthEntries.length} this month`;
    document.getElementById('dash-ssa-count').textContent = `${ssaCount} account${ssaCount === 1 ? '' : 's'}`;
    document.getElementById('dash-rd-count').textContent = `${rdCount} account${rdCount === 1 ? '' : 's'}`;
    document.getElementById('dash-td-count').textContent = `${tdCount} account${tdCount === 1 ? '' : 's'}`;
    const recEl = document.getElementById('dash-today-rec');
    const payEl = document.getElementById('dash-today-pay');
    const netEl = document.getElementById('dash-today-net');
    const monthDepEl = document.getElementById('dash-month-deposits');
    const tdIncEl = document.getElementById('dash-td-total-inc');
    const backupAgeEl = document.getElementById('dash-backup-age');
    const backupNoteEl = document.getElementById('dash-backup-note');
    if (recEl) recEl.textContent = money(todayReceipts);
    if (payEl) payEl.textContent = money(todayPayments);
    if (netEl) {
        netEl.textContent = money(todayNet);
        netEl.style.color = todayNet >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (monthDepEl) monthDepEl.textContent = money(monthDeposits);
    if (tdIncEl) tdIncEl.textContent = money(tdTotalInc);

    const lastBackup = localStorage.getItem('lastBackupDate');
    if (backupAgeEl && backupNoteEl) {
        if (lastBackup) {
            const daysSinceBackup = Math.floor((Date.now() - Number(lastBackup)) / (24 * 60 * 60 * 1000));
            if (daysSinceBackup <= 1) {
                backupAgeEl.textContent = 'Backup: recent';
                backupAgeEl.className = 'omni-backup-badge good';
                backupNoteEl.textContent = 'Data backup is healthy.';
            } else if (daysSinceBackup <= 7) {
                backupAgeEl.textContent = `Backup: ${daysSinceBackup} days ago`;
                backupAgeEl.className = 'omni-backup-badge warn';
                backupNoteEl.textContent = 'Consider downloading a fresh backup this week.';
            } else {
                backupAgeEl.textContent = `Backup: ${daysSinceBackup} days ago`;
                backupAgeEl.className = 'omni-backup-badge danger';
                backupNoteEl.textContent = 'Backup is stale. Export a full backup soon.';
            }
        } else {
            backupAgeEl.textContent = 'No backup yet';
            backupAgeEl.className = 'omni-backup-badge danger';
            backupNoteEl.textContent = 'No backup has been recorded for this device.';
        }
    }

    if (schemeSummary) {
        const groupedSchemes = monthEntries.reduce((totals, entry) => {
            const scheme = String(entry.scheme || 'Other');
            const label = scheme.includes('TD') ? 'TD' : scheme;
            totals[label] = (totals[label] || 0) + 1;
            return totals;
        }, {});
        const orderedSchemes = Object.entries(groupedSchemes).sort((a, b) => b[1] - a[1]);
        const maxSchemeCount = Math.max(...orderedSchemes.map(([, count]) => count), 1);
        const barColors = { SB: 'blue', RD: 'green', TD: 'red', SSA: 'pink' };
        schemeSummary.innerHTML = orderedSchemes.length
            ? orderedSchemes.map(([scheme, count]) => `<div class="omni-scheme-bar-row"><div><span>${escapeHTML(scheme)}</span><strong>${count}</strong></div><div class="omni-scheme-bar-track"><span class="${barColors[scheme] || 'gold'}" style="width:${Math.max((count / maxSchemeCount) * 100, 8)}%"></span></div></div>`).join('')
            : '<div class="omni-scheme-empty">No accounts opened this month yet.</div>';
    }
    
    if(dashChartSchemes) dashChartSchemes.destroy();
    const ctxSchDash = document.getElementById('chartSchemesMonthly').getContext('2d');
    dashChartSchemes = new Chart(ctxSchDash, { type: 'doughnut', data: { labels: Object.keys(schemeCountsMonth).length ? Object.keys(schemeCountsMonth) : ['No Data'], datasets: [{ data: Object.values(schemeCountsMonth).length ? Object.values(schemeCountsMonth) : [1], backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1'] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%' } });

    if(tdChart) tdChart.destroy();
    const ctx1 = document.getElementById('chartIncentive').getContext('2d');
    const tdMap = { '1':0, '2':0, '3':0, '5':0 }; memTdEntries.forEach(e => tdMap[e.term] += e.incentive);
    const tdValues = [tdMap['1'], tdMap['2'], tdMap['3'], tdMap['5']];
    const hasTdData = tdValues.some(v => Number(v) > 0);
    tdChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: hasTdData ? ['1 Yr', '2 Yr', '3 Yr', '5 Yr'] : ['No Data'],
            datasets: [{
                label: 'Incentive (₹)',
                data: hasTdData ? tdValues : [1],
                backgroundColor: hasTdData ? ['#da291c', '#2563eb', '#10b981', '#f59e0b'] : ['#cbd5e1']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
}

function checkBackupReminder() {
    const lastBackup = localStorage.getItem('lastBackupDate'); const now = Date.now();
    if (!lastBackup || (now - parseInt(lastBackup)) > 7 * 24 * 60 * 60 * 1000) { setTimeout(() => { showToast("⚠️ Reminder: Please export a data backup today to keep your records safe!"); }, 3000); }
}

window.exportDataBackup = async function() {
  const dataToBackup = { appSettingsV5: await localforage.getItem('appSettingsV5'), accRegister: await localforage.getItem('accRegister'), tdBillEntries: await localforage.getItem('tdBillEntries'), cashBookDataV2: await localforage.getItem('cashBookDataV2'), tdBillBoName: await localforage.getItem('tdBillBoName'), cashBookStatesV2: await localforage.getItem('cashBookStatesV2'), cashTallyHistory: await localforage.getItem('cashTallyHistory'), tdBillHistory: await localforage.getItem('tdBillHistory'), tdBillSpo: await localforage.getItem('tdBillSpo'), tdBillHo: await localforage.getItem('tdBillHo'), manualOverridesV5: await localforage.getItem('manualOverridesV5'), branchHolidayDates: await localforage.getItem('branchHolidayDates'), branchHolidayNames: await localforage.getItem('branchHolidayNames') };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToBackup));
  const link = document.createElement('a'); link.setAttribute("href", dataStr); link.setAttribute("download", createExportFilename('Full_Data_Backup_V7', 'json')); document.body.appendChild(link); link.click(); link.remove();
  localStorage.setItem('lastBackupDate', Date.now()); showToast("✅ Backup Downloaded");
};

window.importDataBackup = function(event) {
  const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      const allowedKeys = ['appSettingsV5', 'accRegister', 'tdBillEntries', 'cashBookDataV2', 'cashBookStatesV2', 'cashTallyHistory', 'tdBillHistory', 'tdBillBoName', 'tdBillSpo', 'tdBillHo', 'manualOverridesV5', 'branchHolidayDates', 'branchHolidayNames'];
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(data, key)) await localforage.setItem(key, data[key]);
      }
      alert("✅ Data Restored! Refreshing application..."); window.location.reload(); 
    } catch(err) { alert("❌ Error loading backup. Invalid JSON file."); }
  }; reader.readAsText(file);
};

window.resetAllAppData = async function() {
    const confirmReset = confirm('This will permanently delete ALL app data (cashbook, register, bills, reminders, holidays, settings, history). Continue?');
    if (!confirmReset) return;

    const secondConfirm = confirm('Final confirmation: Reset all data now? This action cannot be undone.');
    if (!secondConfirm) return;

    try {
        await localforage.clear();
        localStorage.removeItem('lastBackupDate');
        alert('All app data has been reset. The app will now reload.');
        window.location.reload();
    } catch (err) {
        alert('Failed to reset app data. Please try again.');
    }
};

document.addEventListener('DOMContentLoaded', initApp);
