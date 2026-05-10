import { db, auth } from './firebase-config.js';
import { collectionGroup, onSnapshot, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

let allOrders = [];
let searchQuery = '';
let currentPage = 1;
const rowsPerPage = 20;

const STATUS_COLORS = {
    'pending': '#f0a500',
    'in_production': '#1976d2',
    'ready': '#7b1fa2',
    'delivered': '#2e7d32',
    'completed': '#1b5e20',
    'cancelled': '#b71c1c'
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        startHistoryListener();
    } else {
        window.location.href = 'login.html';
    }
});

function startHistoryListener() {
    const q = query(collectionGroup(db, 'orders'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snapshot) => {
        allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const countElem = document.getElementById('totalHistoryCount');
        if (countElem) countElem.textContent = `${allOrders.length} orders`;
        renderHistory();
    }, (error) => {
        console.error("Firestore Error:", error);
    });
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    const filteredOrders = allOrders.filter(o => {
        if (!searchQuery) return true;
        return (o.id.toLowerCase().includes(searchQuery) || 
                `${o.customer?.firstName} ${o.customer?.lastName}`.toLowerCase().includes(searchQuery));
    });

    const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedOrders = filteredOrders.slice(startIndex, startIndex + rowsPerPage);

    list.innerHTML = paginatedOrders.map(o => {
        const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'N/A';
        const statusColor = STATUS_COLORS[o.status] || '#888';
        const isMatch = searchQuery && (
            o.id.toLowerCase().includes(searchQuery) || 
            `${o.customer?.firstName} ${o.customer?.lastName}`.toLowerCase().includes(searchQuery)
        );
        const highlightClass = isMatch ? 'search-highlight' : '';
        
        return `
            <tr onclick="viewOrder('${o.id}')" class="${highlightClass}">
                <td>${date}</td>
                <td style="font-weight:bold;">#${o.id.slice(-6).toUpperCase()}</td>
                <td>${o.customer?.firstName || ''} ${o.customer?.lastName || ''}</td>
                <td>${o.productName || 'Unknown'}</td>
                <td>₱${Number(o.total || 0).toLocaleString()}</td>
                <td>
                    <span class="status-pill" style="background:${statusColor}">${o.status || 'pending'}</span>
                </td>
                <td><span class="view-btn">Details</span></td>
            </tr>
        `;
    }).join('');

    updatePaginationControls(filteredOrders.length, totalPages);
}

function updatePaginationControls(totalItems, totalPages) {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageNumbers = document.getElementById('pageNumbers');

    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (pageNumbers) pageNumbers.textContent = `Page ${currentPage} of ${totalPages || 1}`;
}

window.viewOrder = async (id) => {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    const modal = document.getElementById('admModal');
    if (!modal) return;

    let deliveryFee = Number(order.deliveryFee || 0);
    const c = order.customer || {};

    if (deliveryFee === 0 && c.province) {
        try {
            const feeDoc = await getDoc(doc(db, 'delivery_fee', c.province));
            if (feeDoc.exists()) {
                deliveryFee = Number(feeDoc.data().fee || 0);
            }
        } catch (e) {
            console.error("Fee fetch error:", e);
        }
    }

    const badge = document.getElementById('admModalBadge');
    if (badge) {
        badge.textContent = (order.status || 'pending').toUpperCase();
        badge.style.background = STATUS_COLORS[order.status] || '#888';
    }

    document.getElementById('admModalERN').textContent = id.slice(-6).toUpperCase();
    document.getElementById('admRName').textContent = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    document.getElementById('admRAddress').textContent = c.address || '—';
    document.getElementById('admDContact').textContent = c.contact || '—';
    
    const createdAt = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0);
    document.getElementById('admRDate').textContent = createdAt.toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    document.getElementById('admRPayment').textContent = order.paymentMode || 'Cash on Delivery';
    document.getElementById('admRProdName').textContent = (order.productName || '').toUpperCase();
    document.getElementById('admRQty').textContent = order.quantity || 1;
    
    const detailsArr = [order.color, order.variant].filter(Boolean);
    document.getElementById('admRProdDetails').textContent = detailsArr.join(' • ');

    const subtotal = Number(order.unitPrice || 0) * Number(order.quantity || 1);
    document.getElementById('admRProdPrice').textContent = `₱${subtotal.toLocaleString()}`;
    document.getElementById('admRDelivery').textContent = `₱${deliveryFee.toLocaleString()}`;
    document.getElementById('admRTotal').textContent = `₱${(subtotal + deliveryFee).toLocaleString()}`;

    modal.classList.add('adm-modal-active');
    document.body.style.overflow = 'hidden';
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('histSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            currentPage = 1;
            renderHistory();
        });
    }

    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderHistory();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const filteredCount = allOrders.filter(o => {
                if (!searchQuery) return true;
                return (o.id.toLowerCase().includes(searchQuery) || 
                        `${o.customer?.firstName} ${o.customer?.lastName}`.toLowerCase().includes(searchQuery));
            }).length;
            const totalPages = Math.ceil(filteredCount / rowsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderHistory();
            }
        });
    }

    const closeBtn = document.getElementById('admModalClose');
    const modal = document.getElementById('admModal');
    
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.remove('adm-modal-active');
            document.body.style.overflow = '';
        };
    }

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.classList.remove('adm-modal-active');
            document.body.style.overflow = '';
        }
    };
});