import { auth, db } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc, addDoc, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { createNotification } from './notif-util.js';
import { showToast } from './toast-util.js';

const STATUS = {
    PENDING:       'pending',
    IN_PRODUCTION: 'in_production',
    READY:         'ready',
    DELIVERED:     'delivered',
    COMPLETED:     'completed',
    CANCELLED:     'cancelled'
};

const PREVIEW_LIMIT = 3;
let selectedRating = 0;
let activeProductId = null;

const columns = {
    pending:    document.getElementById('col-pending'),
    production: document.getElementById('col-production'),
    completed:  document.getElementById('col-completed')
};

function buildOrderCard(order, id) {
    const imageURL    = order.imageURL || order.image || null;
    const description = order.description || [order.variant, order.color, order.addons].filter(Boolean).join(', ') || 'Standard';
    const status      = order.status || STATUS.PENDING;
    const ern         = id.slice(-6).toUpperCase();

    const imgHTML = imageURL
        ? `<img src="${imageURL}" class="item-image-placeholder" style="object-fit:cover; width:90px; height:110px; border-radius:10px; border:2px solid #FF8800; flex-shrink:0;">`
        : `<div class="item-image-placeholder" style="background:#FF8800; width:90px; height:110px; border-radius:10px; flex-shrink:0;"></div>`;

    let actionsHTML = '';
    if (status === STATUS.PENDING) {
        actionsHTML = `
            <div class="card-actions" style="display:flex; gap:10px;">
                <button class="btn-receipt" data-id="${id}" style="background:#F5E6CC; color:#2B1410; border:none; padding:5px 10px; border-radius:5px; font-size:10px; cursor:pointer;">VIEW RECEIPT</button>
                <button class="btn-cancel" data-id="${id}" data-ern="${ern}" style="background:transparent; color:#2B1410; border:1px solid #2B1410; padding:5px 10px; border-radius:5px; font-size:10px; cursor:pointer;">CANCEL ORDER</button>
            </div>`;
    } else if ([STATUS.DELIVERED, STATUS.COMPLETED].includes(status)) {
        actionsHTML = `
            <div class="card-actions" style="display:flex; gap:10px;">
                <button class="btn-receipt" data-id="${id}" style="background:#F5E6CC; color:#2B1410; border:none; padding:5px 10px; border-radius:5px; font-size:10px; cursor:pointer;">VIEW RECEIPT</button>
                <button class="review-btn" data-pid="${order.productId}" data-pname="${order.productName}" style="background:#FF8800; color:white; border:none; padding:5px 10px; border-radius:5px; font-size:10px; font-weight:700; cursor:pointer;">POST A REVIEW</button>
            </div>`;
    } else {
        actionsHTML = `<button class="btn-receipt" data-id="${id}" style="background:#F5E6CC; color:#2B1410; border:none; padding:5px 10px; border-radius:5px; font-size:10px; cursor:pointer;">VIEW RECEIPT</button>`;
    }

    return `
        <div class="order-card" data-id="${id}" style="background:white; border-radius:15px; padding:15px; margin-bottom:15px; border: 1px solid #F5E6CC; cursor:pointer;">
            <div class="order-content" style="display:flex; gap:15px;">
                ${imgHTML}
                <div class="item-details" style="display:flex; flex-direction:column; justify-content:space-between; flex-grow:1;">
                    <div>
                        <h3 style="margin:0; font-size:16px; color:#2B1410;">${order.productName || 'Unknown Product'}</h3>
                        <p style="margin:5px 0; font-size:11px; color:#FF8800; font-family:'Satoshi-Bold';">ERN: ${ern}</p>
                        <p style="margin:5px 0; font-size:13px; color:#666;">${description}</p>
                    </div>
                    ${actionsHTML}
                </div>
            </div>
        </div>
    `;
}

function renderColumn(container, orders) {
    if (!container) return;
    if (orders.length === 0) {
        container.innerHTML = `<p style="font-family:'Satoshi'; font-size:13px; opacity:0.5; padding:10px 0;">No orders here yet.</p>`;
        return;
    }
    let html = '';
    orders.slice(0, PREVIEW_LIMIT).forEach(({ id, data }) => {
        html += buildOrderCard(data, id);
    });
    container.innerHTML = html;
}

function attachCardListeners(uid, allOrders) {
    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation(); 
            const id = btn.dataset.id;
            const ern = btn.dataset.ern;

            if (confirm(`Are you sure you want to cancel order #${ern}?`)) {
                try {
                    const orderRef = doc(db, 'users', uid, 'orders', id);
                    await updateDoc(orderRef, {
                        status: STATUS.CANCELLED,
                        cancelledAt: Timestamp.now()
                    });

                    await createNotification({
                        userId: 'admin_general',
                        type: 'order_cancelled',
                        title: 'Order Cancelled by User',
                        message: `Order #${ern} has been cancelled by the customer.`,
                        orderId: id,
                        role: 'admin'
                    });

                    showToast(`Order #${ern} is cancelled.`);
                } catch (error) {
                    console.error("Error cancelling order:", error);
                    showToast('Failed to cancel order.');
                }
            }
        };
    });

    document.querySelectorAll('.review-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); 
            
            activeProductId = btn.dataset.pid;
            const productName = btn.dataset.pname;
            
            const nameEl = document.getElementById('reviewProductName');
            if (nameEl) nameEl.textContent = productName;
            
            const modal = document.getElementById('pdmReviewModal');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.remove('pdm-hidden');
            }
        };
    });

    document.querySelectorAll('.order-card, .btn-receipt').forEach(el => {
        el.onclick = (e) => {
            if (e.target.closest('.review-btn')) return;

            if (el.classList.contains('btn-receipt')) e.stopPropagation();

            const id = el.dataset.id || el.closest('.order-card').dataset.id;
            const orderObj = allOrders.find(o => o.id === id);

            if (orderObj) {
                window._order = orderObj.data;
                window._orderId = orderObj.id;

                const modal = document.getElementById('pdmCheckoutModal');
                const step4 = document.getElementById('pdmStep4');
                
                if (modal && step4) {
                    modal.style.display = 'flex';
                    modal.classList.remove('pdm-hidden');
                    step4.classList.remove('pdm-hidden');
                    document.getElementById('pdmStep3')?.classList.add('pdm-hidden');

                    if (typeof window.populateStep4 === 'function') {
                        window.populateStep4(orderObj.data.paymentMode || 'Cash on Delivery');
                    }
                }
            }
        };
    });
}

function setupReviewModal() {
    const stars = document.querySelectorAll('.star');
    const modal = document.getElementById('pdmReviewModal');
    const closeBtn = document.getElementById('closeReview');
    const submitBtn = document.getElementById('submitReviewBtn');

    stars.forEach(star => {
        star.onclick = () => {
            selectedRating = parseInt(star.dataset.value);
            stars.forEach(s => {
                s.style.color = parseInt(s.dataset.value) <= selectedRating ? '#FF8800' : '#CCC';
            });
        };
    });

    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const comment = document.getElementById('reviewText').value.trim();
            if (!selectedRating || !comment || !activeProductId) {
                showToast("Please provide a rating and a comment.");
                return;
            }

            try {
                const user = auth.currentUser;
                await addDoc(collection(db, 'products', activeProductId, 'reviews'), {
                    userName: user.displayName || user.email?.split('@')[0] || "Verified Baker",
                    rating: selectedRating,
                    comment: comment,
                    timestamp: serverTimestamp()
                });

                showToast("Review submitted! Thank you.");
                modal.style.display = 'none';
                document.getElementById('reviewText').value = '';
                selectedRating = 0;
                stars.forEach(s => s.style.color = '#CCC');
            } catch (error) {
                console.error("Error submitting review:", error);
                showToast("Failed to submit review.");
            }
        };
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    setupReviewModal();

    const ordersRef = collection(db, 'users', user.uid, 'orders');

    onSnapshot(ordersRef, (snapshot) => {
        const allOrders = [];
        snapshot.forEach(d => allOrders.push({ id: d.id, data: d.data() }));

        allOrders.sort((a, b) => {
            const tA = a.data.createdAt?.toMillis?.() || 0;
            const tB = b.data.createdAt?.toMillis?.() || 0;
            return tB - tA;
        });

        renderColumn(columns.pending, allOrders.filter(o => o.data.status === STATUS.PENDING));
        renderColumn(columns.production, allOrders.filter(o => [STATUS.IN_PRODUCTION, STATUS.READY].includes(o.data.status)));
        renderColumn(columns.completed, allOrders.filter(o => [STATUS.DELIVERED, STATUS.COMPLETED].includes(o.data.status)));

        attachCardListeners(user.uid, allOrders);
    });
});

window.closeModal = function() {
    const modal = document.getElementById('pdmCheckoutModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('pdm-hidden');
        const confirmBtn = document.getElementById('pdmConfirmOrderBtn');
        if (confirmBtn) confirmBtn.textContent = "CONFIRM ORDER";
    }
};