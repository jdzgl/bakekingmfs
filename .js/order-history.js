import { db, auth } from './firebase-config.js';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { createNotification } from './notif-util.js';
import { showToast } from './toast-util.js';

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: '#f0a500' },
    in_production: { label: 'In Production', color: '#1976d2' },
    ready: { label: 'Ready', color: '#388e3c' },
    delivered: { label: 'Delivered', color: '#2e7d32' },
    completed: { label: 'Completed', color: '#1b5e20' },
    cancelled: { label: 'Cancelled', color: '#d32f2f' }
};

let allOrders = [], currentPage = 0, confirmId = null;
let selectedRating = 0, activeProductId = null, activeOrderId = null;
const PAGE_SIZE = 5;

async function notifyAdmin(order, isAuto = false) {
    const customerName = order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'A customer';
    const method = isAuto ? "automatically marked" : "marked";
    
    await createNotification({
        userId: 'admin_general', 
        type: 'order_completed',
        title: 'Order Completed',
        message: `${customerName} ${method} Order #${order._id.slice(-6).toUpperCase()} as received.`,
        orderId: order._id,
        role: 'admin'
    });
}

async function checkAutoCompletion(order, uid) {
    if (order.status === 'delivered' && order.deliveredAt) {
        const diff = (new Date() - order.deliveredAt.toDate()) / (1000 * 60 * 60 * 24);
        if (diff >= 7) {
            const orderRef = doc(db, 'users', uid, 'orders', order._id);
            await updateDoc(orderRef, { 
                status: 'completed', 
                completedAt: serverTimestamp() 
            });
            await notifyAdmin(order, true);
        }
    }
}

function buildHistoryCard(order, id) {
    const status = order.status || 'pending';
    const cfg = STATUS_CONFIG[status] || { label: status, color: '#888' };
    const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A';
    const img = order.imageURL || order.image || '';
    
    let buttons = '';
    if (status === 'completed') {
        buttons = `
            <button class="oh-btn oh-btn-review" data-id="${id}" data-pid="${order.productId}" data-pname="${order.productName}">REVIEW</button>
            <button class="oh-btn oh-btn-again" data-id="${id}">ORDER AGAIN</button>
        `;
    } else if (status === 'delivered') {
        buttons = `<button class="oh-btn oh-btn-confirm" data-id="${id}">RECEIVE ORDER</button>`;
    } else if (['pending', 'in_production', 'ready', 'cancelled'].includes(status)) {
        buttons = `<button class="oh-btn oh-btn-status" data-id="${id}">SEE DETAILS</button>`;
    } else {
        buttons = `<button class="oh-btn oh-btn-again" data-id="${id}">ORDER AGAIN</button>`;
    }

    return `
        <div class="oh-card" data-id="${id}">
            <span class="oh-date">${date}</span>
            <div class="oh-card-content">
                ${img ? `<img src="${img}" class="oh-card-img">` : '<div class="oh-img-fallback"></div>'}
                <div class="oh-details">
                    <h3 class="oh-name">${(order.productName || 'Unknown').toUpperCase()}</h3>
                    <p class="oh-desc">${order.variant || ''} ${order.color || ''}</p>
                    <span class="oh-status-badge" style="background:${cfg.color}">${cfg.label}</span>
                    <div class="oh-button-group" style="margin-top:10px; display:flex; gap:5px;">
                        ${buttons}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderOrders() {
    const grid = document.getElementById('historyGrid');
    const pagin = document.getElementById('histPagination');
    if (!grid || !pagin) return;

    const start = currentPage * PAGE_SIZE;
    const paged = allOrders.slice(start, start + PAGE_SIZE);

    grid.innerHTML = paged.length ? paged.map(o => buildHistoryCard(o, o._id)).join('') : '<p class="oh-empty">No orders found.</p>';

    const maxPage = Math.ceil(allOrders.length / PAGE_SIZE);
    pagin.innerHTML = allOrders.length > PAGE_SIZE ? `
        <button class="page-arrow" ${currentPage === 0 ? 'disabled' : ''} onclick="changePage(-1)">&larr;</button>
        <span>Page ${currentPage + 1} of ${maxPage}</span>
        <button class="page-arrow" ${currentPage >= maxPage - 1 ? 'disabled' : ''} onclick="changePage(1)">&rarr;</button>
    ` : '';

    grid.querySelectorAll('.oh-btn-status').forEach(b => b.onclick = () => openStatusModal(b.dataset.id));
    grid.querySelectorAll('.oh-btn-again').forEach(b => b.onclick = () => handleOrderAgain(b.dataset.id));
    grid.querySelectorAll('.oh-btn-confirm').forEach(b => b.onclick = () => openConfirmModal(b.dataset.id));
    grid.querySelectorAll('.oh-btn-review').forEach(b => {
        b.onclick = () => openReviewModal(b.dataset.pid, b.dataset.pname, b.dataset.id);
    });
}

window.changePage = (dir) => { currentPage += dir; renderOrders(); };

function openConfirmModal(id) {
    confirmId = id;
    document.getElementById('ohConfirmModal').classList.add('oh-modal-active');
}

function closeConfirmModal() {
    confirmId = null;
    document.getElementById('ohConfirmModal').classList.remove('oh-modal-active');
}

async function handleConfirm() {
    if (!confirmId || !auth.currentUser) return;
    const order = allOrders.find(o => o._id === confirmId);
    try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'orders', confirmId), { 
            status: 'completed', completedAt: serverTimestamp() 
        });
        if (order) await notifyAdmin(order, false);
        closeConfirmModal();
    } catch (e) {
        console.error(e);
    }
}

function openReviewModal(pid, pname, orderId) {
    activeProductId = pid;
    activeOrderId = orderId;
    selectedRating = 0;
    document.getElementById('reviewProductName').textContent = pname;
    document.getElementById('reviewText').value = '';
    document.querySelectorAll('.star').forEach(s => s.style.color = '#CCC');
    document.getElementById('pdmReviewModal').style.display = 'flex';
}

async function submitReview() {
    const text = document.getElementById('reviewText').value.trim();
    if (selectedRating === 0) return showToast("Please select a star rating");
    if (!text) return showToast("Please write a comment");
    if (!auth.currentUser) return;

    const btn = document.getElementById('submitReviewBtn');
    btn.disabled = true;
    btn.textContent = "SUBMITTING...";

    try {
        await addDoc(collection(db, 'products', activeProductId, 'reviews'), {
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || "Customer",
            rating: selectedRating,
            comment: text,
            createdAt: serverTimestamp(),
            orderId: activeOrderId
        });

        showToast("Review posted successfully!");
        document.getElementById('pdmReviewModal').style.display = 'none';
    } catch (e) {
        console.error(e);
        showToast("Failed to post review.");
    } finally {
        btn.disabled = false;
        btn.textContent = "SUBMIT REVIEW";
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) return window.location.href = 'login.html';
    const q = query(collection(db, 'users', user.uid, 'orders'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        allOrders = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        allOrders.forEach(o => checkAutoCompletion(o, user.uid));
        renderOrders();
    });
});

function openStatusModal(id) {
    const order = allOrders.find(o => o._id === id);
    if (!order) return;
    
    const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#888' };
    const c = order.customer || {};
    
    document.getElementById('ohModalERN').textContent = id.slice(-6).toUpperCase();
    const badge = document.getElementById('ohModalStatus');
    badge.textContent = cfg.label.toUpperCase();
    badge.style.background = cfg.color;

    document.getElementById('ohRName').textContent = `${c.firstName || ''} ${c.lastName || ''}`;
    document.getElementById('ohRAddress').textContent = c.address || '';
    document.getElementById('ohRSumNum').textContent = Number(order.total || 0).toLocaleString();
    document.getElementById('ohRItem').textContent = order.productName || '';
    document.getElementById('ohRQty').textContent = order.quantity || 1;
    document.getElementById('ohRProdName').textContent = (order.productName || 'Unknown').toUpperCase();

    const detailsSpan = document.getElementById('ohRProdDetails');
    if (detailsSpan) detailsSpan.textContent = `${order.variant || ''} ${order.color || ''}`.trim();

    const itemPrice = order.price || (order.total - (order.deliveryFee || 0));
    document.getElementById('ohRProdPrice').textContent = `₱${Number(itemPrice || 0).toLocaleString()}`;
    document.getElementById('ohRDelivery').textContent = `₱${Number(order.deliveryFee || 0).toLocaleString()}`;
    document.getElementById('ohRTotal').textContent = `₱${Number(order.total || 0).toLocaleString()}`;

    const paymentEl = document.getElementById('ohRPayment');
    if (paymentEl) paymentEl.textContent = `Paid via ${order.paymentMethod || 'COD'}`;

    document.getElementById('ohStatusModal').classList.add('oh-modal-active');
}

function handleOrderAgain(id) {
    const o = allOrders.find(x => x._id === id);
    if (o) window.location.href = `shop.html?category=${encodeURIComponent(o.category || '')}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const statusModal = document.getElementById('ohStatusModal');
    const closeBtn = document.getElementById('ohModalClose');
    if (closeBtn) closeBtn.onclick = () => statusModal.classList.remove('oh-modal-active');
    
    document.getElementById('ohConfirmCancel').onclick = closeConfirmModal;
    document.getElementById('ohConfirmBtn').onclick = handleConfirm;

    const closeReview = document.getElementById('closeReview');
    if (closeReview) closeReview.onclick = () => document.getElementById('pdmReviewModal').style.display = 'none';

    document.querySelectorAll('.star').forEach(star => {
        star.onclick = () => {
            selectedRating = parseInt(star.dataset.value);
            document.querySelectorAll('.star').forEach(s => {
                s.style.color = parseInt(s.dataset.value) <= selectedRating ? '#FF8800' : '#CCC';
            });
        };
    });

    const submitReviewBtn = document.getElementById('submitReviewBtn');
    if (submitReviewBtn) submitReviewBtn.onclick = submitReview;
});