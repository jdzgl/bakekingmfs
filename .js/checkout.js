import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { createNotification } from './notif-util.js';
import { uploadImageToCloud } from './imgbb-util.js';
import { showToast } from './toast-util.js';

window._order = null;
window._orderId = null;

const getEl = (id) => document.getElementById(id);

const toggleSteps = (activeId) => {
    document.querySelectorAll('.pdm-step').forEach(s => s.classList.add('pdm-hidden'));
    const active = getEl(activeId);
    if (active) active.classList.remove('pdm-hidden');
};

function sanitizeForFirestore(obj) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    if (typeof obj === 'object' && typeof obj.toMillis === 'function') return null;
    if (typeof obj === 'object') {
        const clean = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object' && v._methodName) continue;
            clean[k] = sanitizeForFirestore(v);
        }
        return clean;
    }
    return obj;
}

window.initCheckout = function(input) {
    const raw = Array.isArray(input) ? input : [input];
    if (!raw.length) return;

    const items = raw.map(item => sanitizeForFirestore(item));

    const subtotal = items.reduce((sum, i) => {
        const vPrice = Number(i.variantPrice || 0);
        const aPrice = Number(i.addonPrice || 0);
        const qty    = Number(i.quantity || 1);
        i.calculatedTotal = (vPrice + aPrice) * qty;
        return sum + i.calculatedTotal;
    }, 0);

    const deliveryFee = Number(items[0].deliveryFee || 0);

    window._order = {
        ...items[0],
        items,
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        productName: items.length > 1
            ? `${items[0].productName} & More`
            : items[0].productName
    };

    renderCheckout(items);
    toggleSteps('pdmStep3');

    const overlay = getEl('pdmOverlay');
    if (overlay) {
        overlay.classList.remove('pdm-hidden');
        overlay.style.display = 'flex';
    }
};

function renderCheckout(items) {
    const { total, deliveryFee, productName, imageURL, subtotal } = window._order;

    if (getEl('pdmS3Name'))     getEl('pdmS3Name').textContent     = productName;
    if (getEl('pdmS3Img'))      getEl('pdmS3Img').src              = imageURL || '';
    if (getEl('pdmInvNumber'))  getEl('pdmInvNumber').textContent  = `#${Math.floor(1000 + Math.random() * 9000)}`;
    if (getEl('pdmS3BasePrice')) getEl('pdmS3BasePrice').textContent = `₱${subtotal.toLocaleString()}`;

    const tbody = getEl('pdmInvBody');
    if (tbody) {
        tbody.innerHTML = items.map(i => `
            <tr>
                <td>${i.quantity}x</td>
                <td>
                    <strong>${i.productName}</strong><br>
                    <small>${[i.variant, i.color, i.addon].filter(v => v && v !== 'None').join(', ')}</small>
                </td>
                <td>₱${Number(i.calculatedTotal || 0).toLocaleString()}</td>
            </tr>`).join('');
    }

    if (getEl('pdmInvDelivery')) getEl('pdmInvDelivery').textContent = `₱${deliveryFee.toLocaleString()}`;
    if (getEl('pdmInvTotal'))    getEl('pdmInvTotal').textContent    = `₱${total.toLocaleString()}`;

    setupPaymentLogic();
}

function setupPaymentLogic() {
    const modeSelect  = getEl('pdmPaymentMode');
    const infoDiv     = getEl('pdmPaymentInfo');
    const proofInput  = getEl('pdmProofContainer');

    if (modeSelect) {
        modeSelect.onchange = () => {
            const isManual = ['GCash', 'Bank Transfer'].includes(modeSelect.value);
            if (infoDiv) {
                infoDiv.innerHTML = modeSelect.value === 'GCash'
                    ? `<p><strong>GCash:</strong> Gian Carlo So<br>0922 629 5810</p>`
                    : `<p><strong>BDO:</strong> Gian Carlo So<br>1234-5678-9012</p>`;
                infoDiv.style.display = isManual ? 'block' : 'none';
            }
            if (proofInput) proofInput.style.display = isManual ? 'block' : 'none';
        };
        modeSelect.onchange();
    }

    const checkoutBtn = getEl('pdmInvoiceCheckoutBtn');
    const backBtn     = getEl('pdmInvBackBtn');
    if (checkoutBtn) checkoutBtn.onclick = submitOrder;
    if (backBtn)     backBtn.onclick     = window.closeModal;
}

async function submitOrder() {
    const user = auth.currentUser;
    if (!user) { showToast("Please log in to complete your order."); return; }

    const mode = getEl('pdmPaymentMode').value;
    const file = getEl('pdmPaymentProofFile')?.files[0];
    const btn  = getEl('pdmInvoiceCheckoutBtn');
    let proofUrl = null;

    if (['GCash', 'Bank Transfer'].includes(mode)) {
        if (!file) { showToast("Please upload your payment receipt."); return; }
        btn.disabled    = true;
        btn.textContent = 'UPLOADING...';
        try {
            proofUrl = await uploadImageToCloud(file);
        } catch (e) {
            console.error("Proof upload error:", e);
            showToast("Upload failed. Please try again.");
            btn.disabled    = false;
            btn.textContent = 'CHECKOUT';
            return;
        }
    }

    try {
        btn.disabled    = true;
        btn.textContent = 'SAVING...';

        const { items, addedAt, ...orderBase } = window._order;

        const orderDoc = sanitizeForFirestore({
            ...orderBase,
            paymentMode:  mode,
            'receipt-img': proofUrl,
            status:       'pending',
            createdAt:    null,
        });

        orderDoc.createdAt = serverTimestamp();

        const ref = await addDoc(collection(db, 'users', user.uid, 'orders'), orderDoc);
        window._orderId = ref.id;

        try {
            await createNotification({
                userId:      'admin_general',
                type:        'new_order',
                title:       'New Order Received',
                message:     `Order from ${window._order.customerName || 'Customer'}! ID: #${ref.id.slice(-6).toUpperCase()}`,
                orderId:     ref.id,
                role:        'admin'
            });
        } catch (notifErr) {
            console.warn("Notification create failed (non-fatal):", notifErr);
        }

        if (items?.length) {
            for (const item of items) {
                const cid = item.cartId || item.cartItemId;
                if (cid) {
                    await deleteDoc(doc(db, 'users', user.uid, 'cart', cid)).catch(console.warn);
                }
            }
        }

        showToast(`Order Saved! ERN: ${ref.id.slice(-6).toUpperCase()}`);
        window.populateStep4(mode);
        toggleSteps('pdmStep4');

        const panel = document.querySelector('.pdm-panel');
        if (panel) panel.scrollTop = 0;

    } catch (e) {
        console.error("submitOrder failed:", e);
        showToast(`Order failed: ${e.message}`);
        btn.disabled    = false;
        btn.textContent = 'CHECKOUT';
    }
}

window.populateStep4 = function(paymentMode) {
    const o   = window._order;
    const c   = o.customer || {};
    const ern = window._orderId ? window._orderId.slice(-6).toUpperCase() : 'TEMP';

    if (getEl('pdmReceiptERN'))    getEl('pdmReceiptERN').textContent    = ern;
    if (getEl('pdmRName'))         getEl('pdmRName').textContent         = `${c.firstName || o.firstName || 'Customer'} ${c.lastName || o.lastName || ''}`.trim();
    if (getEl('pdmRAddress'))      getEl('pdmRAddress').textContent      = c.address || o.address || 'N/A';
    if (getEl('pdmRSumText'))      getEl('pdmRSumText').textContent      = 'Philippine Pesos Only';
    if (getEl('pdmRSumNum'))       getEl('pdmRSumNum').textContent       = Number(o.total || 0).toLocaleString();
    if (getEl('pdmRItem'))         getEl('pdmRItem').textContent         = o.productName;
    if (getEl('pdmRQty'))          getEl('pdmRQty').textContent          = o.quantity || 1;
    if (getEl('pdmRProdName'))     getEl('pdmRProdName').textContent     = o.productName;
    if (getEl('pdmRProdDetails'))  getEl('pdmRProdDetails').textContent  = [
        o.color, o.variant,
        (o.addon && o.addon !== 'None') ? `With ${o.addon}` : ''
    ].filter(Boolean).join(', ');

    const unitPrice = Number(o.unitPrice || o.variantPrice || 0);
    if (getEl('pdmRProdPrice'))    getEl('pdmRProdPrice').textContent    = `₱${(unitPrice * Number(o.quantity || 1)).toLocaleString()}`;
    if (getEl('pdmRDelivery'))     getEl('pdmRDelivery').textContent     = `₱${Number(o.deliveryFee || 0).toLocaleString()}`;
    if (getEl('pdmRTotal'))        getEl('pdmRTotal').textContent        = `₱${Number(o.total || 0).toLocaleString()}`;
    if (getEl('pdmRPaymentMethod')) getEl('pdmRPaymentMethod').textContent = `Paid via ${paymentMode}`;

    if (getEl('pdmUploadSection')) getEl('pdmUploadSection').classList.add('pdm-hidden');

    const screenshotBtn = getEl('pdmScreenshotBtn');
    if (screenshotBtn) {
        screenshotBtn.classList.remove('pdm-hidden');
        screenshotBtn.onclick = captureReceipt;
    }

    const confirmBtn = getEl('pdmConfirmOrderBtn');
    if (confirmBtn) {
        confirmBtn.textContent = 'CLOSE';
        confirmBtn.onclick     = window.closeModal;
    }
};

async function captureReceipt() {
    const receiptEl = getEl('pdmReceiptPaper');
    if (!receiptEl) { showToast("Receipt element not found."); return; }
    if (typeof html2canvas === 'undefined') { showToast("Screenshot library not loaded."); return; }
    try {
        const canvas = await html2canvas(receiptEl, { scale: 2, useCORS: true });
        const link   = document.createElement('a');
        link.download = `Receipt-${getEl('pdmReceiptERN')?.textContent || 'BK'}.png`;
        link.href     = canvas.toDataURL('image/png');
        link.click();
    } catch (e) {
        console.error("captureReceipt error:", e);
        showToast("Could not capture screenshot.");
    }
}

window.closeModal = () => {
    const overlay = getEl('pdmOverlay');
    if (overlay) overlay.classList.add('pdm-hidden');
    document.body.style.overflow = 'auto';
};