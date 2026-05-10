import { db, auth } from './firebase-config.js';
import { collectionGroup, onSnapshot, doc, getDoc, updateDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { createNotification } from './notif-util.js';
import { showToast } from './toast-util.js';

const STATUSES = [
    { value: 'pending', label: 'Pending', color: '#f0a500' },
    { value: 'in_production', label: 'In Production', color: '#1976d2' },
    { value: 'ready', label: 'Ready for Delivery', color: '#7b1fa2' },
    { value: 'delivered', label: 'Delivered', color: '#2e7d32' },
    { value: 'completed', label: 'Completed', color: '#1b5e20' },
    { value: 'cancelled', label: 'Cancelled', color: '#b71c1c' },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.value, s]));
const HIDE_STATUSES = new Set(['delivered', 'completed', 'cancelled']);

let allOrders = [], dismissedIds = new Set(JSON.parse(sessionStorage.getItem('adm_dismissed') || '[]')), activeFilter = 'all', searchQuery = '', salesChart;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists() || snap.data().role !== 'Admin') { alert("Access denied."); window.location.href = 'login.html'; return; }
        startOrderListener();
    } catch (e) { console.error(e); }
});

async function initSalesChart() {
    const ctx = document.getElementById('salesChart').getContext('2d');
    salesChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: STATUSES.map(s => ({ label: s.label, data: [], backgroundColor: s.color })) },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });
    document.querySelectorAll('.graph-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.graph-filter-btn.active')?.classList.remove('active');
            e.target.classList.add('active');
            updateChartData(e.target.dataset.range);
        });
    });
}

async function updateChartData(range) {
    if (!allOrders.length) return;
    const now = new Date();
    let filterDate = new Date();
    let labels = [];
    const groupedData = {};
    const productRevenue = {};
    const targetStatuses = STATUSES.map(s => s.value);

    if (range === 'week') {
        filterDate.setDate(now.getDate() - 7);
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const key = d.toLocaleDateString('en-US', { weekday: 'short' });
            labels.push(key);
            groupedData[key] = { products: {} };
            targetStatuses.forEach(s => groupedData[key][s] = 0);
        }
    } else if (range === 'month') {
        filterDate.setDate(now.getDate() - 30);
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const key = d.getDate().toString();
            labels.push(key);
            groupedData[key] = { products: {} };
            targetStatuses.forEach(s => groupedData[key][s] = 0);
        }
    } else if (range === 'year') {
        filterDate.setFullYear(now.getFullYear() - 1);
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(now.getMonth() - i);
            const key = d.toLocaleString('default', { month: 'short' });
            labels.push(key);
            groupedData[key] = { products: {} };
            targetStatuses.forEach(s => groupedData[key][s] = 0);
        }
    }

    allOrders.forEach(order => {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0);
        if (orderDate >= filterDate) {
            let key;
            if (range === 'week') key = orderDate.toLocaleDateString('en-US', { weekday: 'short' });
            else if (range === 'month') key = orderDate.getDate().toString();
            else if (range === 'year') key = orderDate.toLocaleString('default', { month: 'short' });
            else key = orderDate.getFullYear().toString();

            if (!groupedData[key]) {
                groupedData[key] = { products: {} };
                targetStatuses.forEach(s => groupedData[key][s] = 0);
                if (!labels.includes(key)) labels.push(key);
            }

            const status = order.status || 'pending';
            const total = Number(order.total || 0);
            const pName = (order.productName || 'Unknown').toUpperCase();

            if (targetStatuses.includes(status)) {
                groupedData[key][status] += total;

                if (!productRevenue[pName]) {
                    productRevenue[pName] = { grandTotal: 0 };
                    targetStatuses.forEach(s => productRevenue[pName][s] = 0);
                }

                productRevenue[pName][status] += total;
                if (status !== 'cancelled') {
                    productRevenue[pName].grandTotal += total;
                }
            }
        }
    });

    salesChart.data.labels = labels;
    targetStatuses.forEach((s, i) => salesChart.data.datasets[i].data = labels.map(l => groupedData[l][s]));
    salesChart.update();
    renderProductRevenueList(productRevenue);
}

function renderProductRevenueList(revenueData) {
    const container = document.getElementById('productRevenueList');
    if (!container) return;

    const sortedProducts = Object.entries(revenueData).sort((a, b) => b[1].grandTotal - a[1].grandTotal);

    if (!sortedProducts.length) {
        container.innerHTML = `<p class="adm-empty">No data for this period.</p>`;
        return;
    }

    const statusHeaders = STATUSES.map(s => `<th style="color:${s.color}; font-size: 10px;">${s.label.toUpperCase()}</th>`).join('');

    let html = `
        <div class="adm-table-responsive" style="overflow-x: auto; margin-top: 10px;">
            <table class="adm-revenue-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #eee;">
                        <th style="text-align: left; padding: 10px;">PRODUCT</th>
                        ${statusHeaders}
                        <th style="text-align: right; padding: 10px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedProducts.forEach(([name, stats]) => {
        const statusCells = STATUSES.map(s => `
            <td style="padding: 10px; font-size: 12px;">₱${(stats[s.value] || 0).toLocaleString()}</td>
        `).join('');

        html += `
            <tr style="border-bottom: 1px solid #f9f9f9;">
                <td style="padding: 10px; font-weight: bold; color: #FF8800;">${name}</td>
                ${statusCells}
                <td style="padding: 10px; text-align: right; font-weight: 800; background: #fdfaf5;">₱${stats.grandTotal.toLocaleString()}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function startOrderListener() {
    const q = query(collectionGroup(db, 'orders'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        allOrders = snapshot.docs.map(d => ({ _id: d.id, _userId: d.ref.path.split('/')[1], ...d.data() }));
        document.getElementById('admOrderCount').textContent = `${allOrders.length} orders`;
        updateChartData(document.querySelector('.graph-filter-btn.active')?.dataset.range || 'week');
        renderOrders();
    });
}

function getFilteredOrders() {
    const filtered = allOrders.filter(o => activeFilter !== 'all' ? o.status === activeFilter : !dismissedIds.has(o._id) && !HIDE_STATUSES.has(o.status));
    if (!searchQuery) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(o => (o.productName || '').toLowerCase().includes(q) || `${o.customer?.firstName} ${o.customer?.lastName}`.toLowerCase().includes(q) || o._id.toLowerCase().includes(q));
}

function renderOrders() {
    const list = document.getElementById('admOrderList'); if (!list) return;
    const orders = getFilteredOrders();
    list.innerHTML = orders.length ? orders.map(o => buildOrderCard(o)).join('') : `<p class="adm-empty">No orders.</p>`;
    list.querySelectorAll('.adm-status-select').forEach(sel => sel.addEventListener('change', () => handleStatusChange(sel)));
    list.querySelectorAll('.adm-order-card').forEach(card => card.addEventListener('click', (e) => { if (!e.target.closest('.adm-status-select')) openModal(card.dataset.id); }));
}

function buildOrderCard(o) {
    const status = o.status || 'pending', cfg = STATUS_MAP[status] || { label: status, color: '#888' }, customerName = o.customer ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() : 'Unknown';
    const optionsHTML = STATUSES.filter(s => s.value !== 'completed').map(s => `<option value="${s.value}" ${s.value === status ? 'selected' : ''}>${s.label}</option>`).join('');
    return `<div class="adm-order-card" data-id="${o._id}"><div class="adm-card-inner"><div class="adm-card-details"><h3 class="adm-card-name">${(o.productName || 'Unknown').toUpperCase()}</h3><p class="adm-card-customer">👤 ${customerName}</p><p class="adm-card-total">₱${Number(o.total || 0).toLocaleString()}</p></div><div class="adm-card-status-col"><span class="adm-status-pill" style="background:${cfg.color};">${cfg.label.toUpperCase()}</span><div class="adm-set-status-row"><label class="adm-set-label">SET STATUS:</label><select class="adm-status-select" data-id="${o._id}" data-userid="${o._userId}">${optionsHTML}</select></div></div></div></div>`;
}

async function handleStatusChange(sel) {
    const orderId = sel.dataset.id, userId = sel.dataset.userid, newStatus = sel.value, order = allOrders.find(o => o._id === orderId);
    if (!order) return;
    const customerName = order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'Customer';
    try {
        const up = { status: newStatus };
        if (newStatus === 'delivered') up.deliveredAt = new Date();
        await updateDoc(doc(db, 'users', userId, 'orders', orderId), up);
        await createNotification({ userId, type: 'status_change', title: 'Update', message: `Order #${orderId.slice(-6).toUpperCase()} for ${customerName} moved to ${newStatus}.`, orderId, status: newStatus, role: 'customer' });
        if (HIDE_STATUSES.has(newStatus)) { dismissedIds.add(orderId); sessionStorage.setItem('adm_dismissed', JSON.stringify([...dismissedIds])); }
        showToast(`Order #${orderId.slice(-6).toUpperCase()} updated to ${newStatus}`);
        order.status = newStatus; renderOrders();
    } catch (e) { 
        console.error(e);
        showToast("Error updating status");
    }
}

function openModal(id) {
    const o = allOrders.find(x => x._id === id); 
    if (!o) return;
    
    const c = o.customer || {};
    const ern = id.slice(-6).toUpperCase();

    const badge = document.getElementById('admModalBadge');
    const statusKey = o.status || 'pending';
    const statusCfg = STATUS_MAP[statusKey] || { label: statusKey, color: '#888' };

    if (badge) {
        badge.textContent = statusCfg.label.toUpperCase();
        badge.style.backgroundColor = statusCfg.color;
    }

    document.getElementById('admModalERN').textContent = ern;
    document.getElementById('admRName').textContent = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    document.getElementById('admRAddress').textContent = c.address || 'N/A';
    document.getElementById('admRContact').textContent = c.phone || 'N/A';
    document.getElementById('admRItem').textContent = o.productName || 'Unknown';
    document.getElementById('admRSumNum').textContent = Number(o.total || 0).toLocaleString();

    document.getElementById('admRQty').textContent = o.quantity || 1;
    document.getElementById('admRProdName').textContent = o.productName || 'Unknown';
    
    const unitPrice = Number(o.unitPrice || o.price || 0);
    document.getElementById('admRProdPrice').textContent = `₱${unitPrice.toLocaleString()}`;
    
    const deliveryFee = Number(o.deliveryFeeAmount || o.deliveryFee || 0);
    document.getElementById('admRDelivery').textContent = `₱${deliveryFee.toLocaleString()}`;
    
    document.getElementById('admRTotal').textContent = `₱${Number(o.total || 0).toLocaleString()}`;
    document.getElementById('admRPaymentMethod').textContent = o.paymentMode || 'N/A';

    const receiptContainer = document.getElementById('admReceiptImageContainer');
    const receiptImg = document.getElementById('admReceiptImg');
    const needsReceipt = ['GCash', 'Bank Transfer'].includes(o.paymentMode);
    const receiptUrl = o["receipt-img"] || o.paymentProof;

    if (needsReceipt && receiptUrl) {
        receiptImg.src = receiptUrl;
        receiptContainer.style.display = 'block';
    } else {
        receiptContainer.style.display = 'none';
        receiptImg.src = '';
    }

    const cancelBtn = document.getElementById('admCancelOrderBtn');
    if (cancelBtn) {
        if (!['completed', 'cancelled', 'delivered'].includes(o.status)) {
            cancelBtn.style.display = 'block';
            cancelBtn.onclick = () => openCancelConfirmation(o._id, o._userId);
        } else {
            cancelBtn.style.display = 'none';
        }
    }

    document.getElementById('admModal').classList.add('adm-modal-active');
    document.body.style.overflow = 'hidden';
}

function openCancelConfirmation(orderId, userId) {
    const confirmModal = document.getElementById('admConfirmModal');
    const confirmBtn = document.getElementById('admConfirmCancelBtn');
    const keepBtn = document.getElementById('admConfirmKeepBtn'); // Get the Keep button
    
    confirmModal.classList.add('adm-modal-active');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = () => {
        handleCancelOrder(orderId, userId);
        closeConfirmModal();
    };

    const newKeepBtn = keepBtn.cloneNode(true);
    keepBtn.parentNode.replaceChild(newKeepBtn, keepBtn);
    
    newKeepBtn.onclick = () => {
        closeConfirmModal();
    };
}

function closeConfirmModal() {
    const modal = document.getElementById('admConfirmModal');
    if (modal) {
        modal.classList.remove('adm-modal-active');
    }
}

async function handleCancelOrder(orderId, userId) {
    try {
        const orderRef = doc(db, 'users', userId, 'orders', orderId);
        await updateDoc(orderRef, { 
            status: 'cancelled',
            cancellationReason: 'Admin: Fraudulent Receipt/Manual Cancellation',
            cancelledAt: new Date()
        });

        await createNotification({ 
            userId, 
            type: 'status_change', 
            title: 'Order Cancelled', 
            message: `Your order #${orderId.slice(-6).toUpperCase()} has been cancelled by the admin due to payment verification issues.`, 
            orderId, 
            status: 'cancelled', 
            role: 'customer' 
        });

        showToast(`Order #${orderId.slice(-6).toUpperCase()} cancelled successfully.`);
        closeConfirmModal(); 
        closeModal();        
    } catch (e) {
        console.error("Error cancelling order:", e);
        showToast("Failed to cancel order.");
    }
}

function closeModal() { 
    const modal = document.getElementById('admModal');
    if (modal) {
        modal.classList.remove('adm-modal-active'); 
    }
    document.body.style.overflow = ''; 
}

document.addEventListener('DOMContentLoaded', () => {
    initSalesChart();
    document.getElementById('admStatusFilter')?.addEventListener('change', (e) => { activeFilter = e.target.value; renderOrders(); });
    document.getElementById('admSearch')?.addEventListener('input', (e) => { searchQuery = e.target.value.trim(); renderOrders(); });
    document.getElementById('admModalClose')?.addEventListener('click', closeModal);
    document.getElementById('admCloseBtn')?.addEventListener('click', closeModal);
});