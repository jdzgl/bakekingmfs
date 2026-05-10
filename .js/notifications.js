import { db, auth } from './firebase-config.js';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { showToast } from './toast-util.js';

const ICONS = {
    new_order:       '🛒',
    status_change:   '🔄',
    order_cancelled: '❌',
    order_delivered: '✅',
    order_completed: '🎉',
    general:         '🔔',
};

const ICON_BG = {
    new_order:       '#fff3cd',
    status_change:   '#dbeafe',
    order_cancelled: '#fee2e2',
    order_delivered: '#d1fae5',
    order_completed: '#d1fae5',
    general:         '#F5E6CC',
};

let currentFilter   = 'all';
let allNotifs       = [];
let visibleCount    = 5;
const isAdminPage   = window.location.pathname.toLowerCase().includes('admin');

const notifList     = document.getElementById('notifList') || document.getElementById('customerNotifList');
const unreadEl      = document.getElementById('notifUnreadCount');
const markAllBtn    = document.getElementById('markAllReadBtn');
const tabBtns       = document.querySelectorAll('.notif-tab');
const loadMoreBtn   = document.getElementById('loadMoreBtn');
const loadMoreCont  = document.getElementById('loadMoreContainer');

function injectModal() {
    if (document.getElementById('notifDetailModal')) return;
    const modal = document.createElement('div');
    modal.id = 'notifDetailModal';
    modal.className = 'ndm-overlay';
    modal.innerHTML = `
        <div class="ndm-panel">
            <button class="ndm-close" id="ndmClose">&times;</button>
            <div class="ndm-icon-row">
                <div class="ndm-icon" id="ndmIcon">🔔</div>
                <span class="ndm-type-badge" id="ndmTypeBadge"></span>
            </div>
            <h2 class="ndm-title" id="ndmTitle"></h2>
            <p class="ndm-time" id="ndmTime"></p>
            <p class="ndm-message" id="ndmMessage"></p>
            <div class="ndm-order-card" id="ndmOrderCard" style="display:none;">
                <div class="ndm-order-row">
                    <span class="ndm-order-label">Order ID</span>
                    <span class="ndm-order-value" id="ndmOrderId"></span>
                </div>
                <div class="ndm-order-row" id="ndmERNRow" style="display:none;">
                    <span class="ndm-order-label">Receipt (ERN#)</span>
                    <span class="ndm-order-value ndm-ern" id="ndmERN"></span>
                </div>
                <div class="ndm-order-row" id="ndmProductRow" style="display:none;">
                    <span class="ndm-order-label">Product</span>
                    <span class="ndm-order-value" id="ndmProduct"></span>
                </div>
                <div class="ndm-order-row" id="ndmStatusRow" style="display:none;">
                    <span class="ndm-order-label">Status</span>
                    <span class="ndm-order-value ndm-status-pill" id="ndmStatus"></span>
                </div>
                <div class="ndm-order-row" id="ndmAmountRow" style="display:none;">
                    <span class="ndm-order-label">Total Amount</span>
                    <span class="ndm-order-value ndm-amount" id="ndmAmount"></span>
                </div>
            </div>
            <div class="ndm-footer" id="ndmFooter" style="display:none;">
                <button class="ndm-cta-btn" id="ndmCtaBtn">View Order</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('ndmClose').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function closeModal() {
    const modal = document.getElementById('notifDetailModal');
    if (modal) modal.classList.remove('ndm-active');
}

function openNotifDetail(notif) {
    updateDoc(doc(db, 'notifications', notif.id), { isRead: true }).catch(console.error);
    
    const iconEl   = document.getElementById('ndmIcon');
    const badge    = document.getElementById('ndmTypeBadge');
    const titleEl  = document.getElementById('ndmTitle');
    const msgEl    = document.getElementById('ndmMessage');
    const card     = document.getElementById('ndmOrderCard');
    const footer   = document.getElementById('ndmFooter');

    iconEl.textContent = ICONS[notif.type] || '🔔';
    iconEl.style.background = ICON_BG[notif.type] || '#F5E6CC';

    const typeLabels = {
        new_order: 'New Order',
        status_change: 'Status Update',
        order_cancelled: 'Cancelled',
        order_delivered: 'Delivered',
        order_completed: 'Completed',
        general: 'General',
    };
    
    badge.textContent = typeLabels[notif.type] || notif.type;
    badge.style.background = ICON_BG[notif.type] || '#F5E6CC';

    titleEl.textContent = notif.title || 'Notification';
    msgEl.textContent = notif.message || '';

    const hasOrder = notif.orderId || notif.productName || notif.status || notif.total;
    card.style.display = hasOrder ? '' : 'none';

    if (hasOrder) {
        document.getElementById('ndmOrderId').textContent = notif.orderId ? notif.orderId.slice(-8).toUpperCase() : '—';
        
        const ernRow = document.getElementById('ndmERNRow');
        if (notif.orderId) {
            ernRow.style.display = '';
            document.getElementById('ndmERN').textContent = notif.orderId.slice(-6).toUpperCase();
        } else {
            ernRow.style.display = 'none';
        }

        const statusRow = document.getElementById('ndmStatusRow');
        if (notif.status) {
            statusRow.style.display = '';
            const statusEl = document.getElementById('ndmStatus');
            statusEl.textContent = notif.status.replace(/_/g, ' ').toUpperCase();
            statusEl.style.background = getStatusColor(notif.status);
        } else {
            statusRow.style.display = 'none';
        }
    }

    if (notif.orderId) {
        footer.style.display = '';
        const ctaBtn = document.getElementById('ndmCtaBtn');
        ctaBtn.onclick = () => {
            window.location.href = isAdminPage 
                ? `admin-dashboard.html` 
                : `order-history.html?id=${notif.orderId}`;
        };
    } else {
        footer.style.display = 'none';
    }
    
    document.getElementById('notifDetailModal').classList.add('ndm-active');
}

function getStatusColor(status) {
    const map = { pending: '#f0a500', in_production: '#1976d2', ready: '#7b1fa2', delivered: '#2e7d32', completed: '#1b5e20', cancelled: '#b71c1c' };
    return map[status] || '#888';
}

function renderNotifs(notifs) {
    if (!notifList) return;
    const unreadCount = notifs.filter(n => !n.isRead).length;
    if (unreadEl) {
        unreadEl.textContent = unreadCount > 0 ? `${unreadCount} Unread` : '';
        unreadEl.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const filtered = notifs.filter(n => {
        if (currentFilter === 'all') return true;

        if (isAdminPage) {
            if (currentFilter === 'order_completed') return n.type === 'order_completed';
            if (currentFilter === 'order_cancelled') return n.type === 'order_cancelled';
            if (currentFilter === 'announcement') return n.type === 'general';
            return n.type === currentFilter;
        } else {
            const isCorrectRole = n.role === 'customer' || n.role === 'all';
            if (currentFilter === 'order_completed') return isCorrectRole && n.type === 'order_completed';
            if (currentFilter === 'order_cancelled') return isCorrectRole && n.type === 'order_cancelled';
            if (currentFilter === 'announcement') return isCorrectRole && n.type === 'general';
            return isCorrectRole && n.type === currentFilter;
        }
    });

    const paginated = filtered.slice(0, visibleCount);

    if (loadMoreCont) {
        loadMoreCont.style.display = filtered.length > visibleCount ? 'flex' : 'none';
    }

    if (paginated.length === 0) {
        notifList.innerHTML = `<p class="notif-empty">No notifications here yet.</p>`;
        return;
    }

    const groups = new Map();
    paginated.forEach(n => {
        const date = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
        const key = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(n);
    });

    notifList.innerHTML = '';
    groups.forEach((items, dateLabel) => {
        const label = document.createElement('div');
        label.className = 'notif-date-label';
        label.textContent = dateLabel;
        notifList.appendChild(label);
        items.forEach(n => {
            const el = document.createElement('div');
            el.className = `notif-item${n.isRead ? '' : ' is-unread'}`;
            el.innerHTML = `
                <div class="notif-icon" style="background:${ICON_BG[n.type] || '#F5E6CC'};">${ICONS[n.type] || '🔔'}</div>
                <div class="notif-content">
                    <h3 class="notif-item-title">${n.title || 'Notification'}</h3>
                    <p class="notif-item-msg">${n.message || ''}</p>
                    <span class="notif-item-time">${n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                </div>
                ${!n.isRead ? '<div class="notif-dot"></div>' : ''}
            `;
            el.addEventListener('click', () => openNotifDetail(n));
            notifList.appendChild(el);
        });
    });
}

async function markAllRead(userId) {
    const roleFilter = isAdminPage ? 'admin' : 'customer';
    let q = query(collection(db, 'notifications'), where('role', '==', roleFilter), where('isRead', '==', false));
    if (!isAdminPage) q = query(collection(db, 'notifications'), where('role', '==', 'customer'), where('userId', '==', userId), where('isRead', '==', false));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.update(doc(db, 'notifications', d.id), { isRead: true }));
    await batch.commit();
}

injectModal();

onAuthStateChanged(auth, (user) => {
    if (!user) return;

    let q;
    if (isAdminPage) {
        q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    } else {
        q = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
    }

    onSnapshot(q, (snapshot) => {
        allNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotifs(allNotifs);
    }, console.error);

    if (markAllBtn) markAllBtn.addEventListener('click', () => markAllRead(user.uid));
});

tabBtns.forEach(tab => {
    tab.addEventListener('click', () => {
        tabBtns.forEach(t => t.classList.remove('notif-tab-active'));
        tab.classList.add('notif-tab-active');
        currentFilter = tab.dataset.filter;
        visibleCount = 5;
        renderNotifs(allNotifs);
    });
});

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
        visibleCount += 5;
        renderNotifs(allNotifs);
    });
}

export function showCheckoutToast(message) {
    showToast(message);
}

window.showCheckoutToast = showCheckoutToast;