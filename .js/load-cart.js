import { auth, db } from './firebase-config.js';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { showToast } from './toast-util.js';

let uid = null;
let cart = [];
let selected = new Set();
let toDelete = null;
let currentEditData = null;

const list        = document.getElementById('cart-items-container');
const checkoutBtn = document.getElementById('globalCheckoutBtn');
const show = id   => document.getElementById(id)?.classList.remove('pdm-hidden');
const hide = id   => document.getElementById(id)?.classList.add('pdm-hidden');

function render() {
    if (!cart.length) {
        list.innerHTML = '<p class="empty-msg">Your cart is currently empty.</p>';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
    }
    list.innerHTML = cart.map(item => {
        const sel  = selected.has(item.id);
        const desc = [item.variant, item.color, item.addon !== 'None' ? item.addon : '']
            .filter(Boolean).join(' · ');
        return `
        <div class="cart-card ${sel ? 'cart-card-selected' : ''}" data-id="${item.id}">
            <img src="${item.imageURL || 'assets/photos/placeholder.png'}"
                 alt="${item.productName || 'Product'}"
                 onerror="this.onerror=null;this.src='assets/photos/placeholder.png'">
            <div class="cart-details">
                <h3>${item.productName || 'Product'}</h3>
                <p>${desc}</p>
                <p>Qty: ${item.quantity}</p>
                <p class="cart-price">₱${Number(item.total || 0).toLocaleString()}</p>
                <div class="cart-actions">
                    <button class="btn-edit"   data-id="${item.id}">EDIT</button>
                    <button class="btn-remove" data-id="${item.id}">REMOVE</button>
                </div>
            </div>
            <div class="cart-checkbox ${sel ? 'cart-checkbox-selected' : ''}" data-id="${item.id}"></div>
        </div>`;
    }).join('');
    if (checkoutBtn) checkoutBtn.disabled = selected.size === 0;
}

async function openEdit(cartId) {
    const cartSnap = await getDoc(doc(db, 'users', uid, 'cart', cartId));
    if (!cartSnap.exists()) return;
    const cartData = cartSnap.data();

    const prodSnap = await getDoc(doc(db, 'products', cartData.productId));
    if (!prodSnap.exists()) return;
    const product = prodSnap.data();

    currentEditData = {
        cartId,
        productId:    cartData.productId,
        variant:      cartData.variant     || '',
        variantPrice: cartData.variantPrice || Number(cartData.unitPrice || 0),
        color:        cartData.color       || '',
        addon:        cartData.addon       || 'None',
        addonPrice:   cartData.addonPrice  || 0,
        quantity:     cartData.quantity    || 1,
        deliveryFee:  cartData.deliveryFee || 0,
    };

    const varList   = document.getElementById('editVariantList');
    const variants  = product.variant || product.variants || [];
    varList.innerHTML = variants.map(v => {
        const dim = v.dimension
            ? `${v.dimension.length}×${v.dimension.width}×${v.dimension.height} in.`
            : '';
        return `
        <div class="variant-card ${v.type === currentEditData.variant ? 'active' : ''}"
             data-type="${v.type}">
            <span class="var-name">${v.type}</span>
            <span class="var-price">₱${Number(v.price || 0).toLocaleString()}</span>
            ${dim ? `<span class="var-dim">${dim}</span>` : ''}
        </div>`;
    }).join('');

    varList.querySelectorAll('.variant-card').forEach(card => {
        card.addEventListener('click', () => {
            varList.querySelectorAll('.variant-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const chosen = variants.find(v => v.type === card.dataset.type);
            if (chosen) {
                currentEditData.variant      = chosen.type;
                currentEditData.variantPrice = Number(chosen.price || 0);
            }
        });
    });

    const colorDots = document.getElementById('editColorDots');
    const colors    = product.colors || [];
    const pickerInput = document.getElementById('hexPicker');

    colorDots.innerHTML = colors.map(c => {
        if (c === 'multi') {
            return `
            <div class="color-dot-wrap">
                <div class="color-dot multi-picker" data-color="multi" title="Custom color">
                    <span class="multi-icon">&#9732;</span>
                    <input type="color" class="inline-color-picker" id="inlineHexPicker"
                           value="${currentEditData.color || '#FF8800'}"
                           title="Pick custom color">
                </div>
            </div>`;
        }
        const isActive = c === currentEditData.color;
        return `<div class="color-dot ${isActive ? 'active' : ''}"
                     data-color="${c}"
                     style="background:${c};"
                     title="${c}"></div>`;
    }).join('');

    const isCustom = currentEditData.color && !colors.includes(currentEditData.color);
    if (isCustom) {
        colorDots.insertAdjacentHTML('afterbegin', `
            <div class="color-dot active"
                 data-color="${currentEditData.color}"
                 style="background:${currentEditData.color};"
                 title="${currentEditData.color} (current)"></div>`);
        if (pickerInput) pickerInput.value = currentEditData.color;
    }

    colorDots.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            if (dot.dataset.color === 'multi') {
                const ip = document.getElementById('inlineHexPicker');
                if (ip) ip.click();
                return;
            }
            colorDots.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            currentEditData.color = dot.dataset.color;
        });
    });

    const inlinePicker = document.getElementById('inlineHexPicker');
    if (inlinePicker) {
        inlinePicker.addEventListener('input', (e) => {
            const hex = e.target.value.toUpperCase();
            currentEditData.color = hex;
            const multiDot = colorDots.querySelector('.multi-picker');
            if (multiDot) {
                multiDot.style.background = hex;
                colorDots.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                multiDot.classList.add('active');
            }
        });
        inlinePicker.addEventListener('click', e => e.stopPropagation());
    }

    const addonList = document.getElementById('editAddonList');
    const addons    = (product.addons || []).filter(a => a.type && a.type.toLowerCase() !== 'none' && Number(a.price) > 0);

    if (!addons.length) {
        addonList.innerHTML = '<p style="font-size:12px;opacity:0.5;font-family:Satoshi;">No add-ons available.</p>';
    } else {
        const noneActive = !currentEditData.addon || currentEditData.addon === 'None';
        addonList.innerHTML = `
            <div class="addon-card addon-none ${noneActive ? 'active' : ''}" data-type="None">
                <span class="addon-name">None</span>
                <span class="addon-price">+₱0</span>
            </div>` +
        addons.map(a => `
            <div class="addon-card ${a.type === currentEditData.addon ? 'active' : ''}"
                 data-type="${a.type}">
                <span class="addon-name">${a.type}</span>
                <span class="addon-price">+₱${Number(a.price || 0).toLocaleString()}</span>
            </div>`).join('');

        addonList.querySelectorAll('.addon-card').forEach(card => {
            card.addEventListener('click', () => {
                addonList.querySelectorAll('.addon-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                if (card.dataset.type === 'None') {
                    currentEditData.addon      = 'None';
                    currentEditData.addonPrice = 0;
                } else {
                    const chosen = addons.find(a => a.type === card.dataset.type);
                    currentEditData.addon      = chosen.type;
                    currentEditData.addonPrice = Number(chosen.price || 0);
                }
            });
        });
    }

    document.getElementById('editQtyDisplay').textContent = currentEditData.quantity;
    show('editProductModal');
}

window.updateEditQty = (change) => {
    let qty = parseInt(document.getElementById('editQtyDisplay').textContent) + change;
    if (qty < 1) qty = 1;
    document.getElementById('editQtyDisplay').textContent = qty;
    if (currentEditData) currentEditData.quantity = qty;
};

async function saveCartOverwrite() {
    if (!uid || !currentEditData) return;
    const btn = document.getElementById('saveOverwriteBtn');
    const unitPrice = currentEditData.variantPrice + (currentEditData.addonPrice || 0);
    const itemSubtotal = unitPrice * currentEditData.quantity;
    const deliveryAmount = Number(currentEditData.deliveryFee || 0);
    const finalTotal = itemSubtotal + deliveryAmount;

    try {
        await updateDoc(doc(db, 'users', uid, 'cart', currentEditData.cartId), {
            variant: currentEditData.variant,
            variantPrice: currentEditData.variantPrice,
            addon: currentEditData.addon,
            addonPrice: currentEditData.addonPrice,
            unitPrice: unitPrice,
            quantity: currentEditData.quantity,
            deliveryFee: deliveryAmount, 
            total: finalTotal,          
        });
    } finally {
        btn.disabled    = false;
        btn.textContent = 'SAVE';
    }
}

async function removeItem() {
    if (!uid || !toDelete) return;
    await deleteDoc(doc(db, 'users', uid, 'cart', toDelete));
    selected.delete(toDelete);
    toDelete = null;
    hide('cartRemoveModal');
}

function openCheckout() {
    const firstId = Array.from(selected)[0];
    const docMatch = cart.find(i => i.id === firstId);
    const itemsToBuy = cart.filter(item => selected.has(item.id))
                           .map(item => ({ ...item, cartItemId: item.id }));
    if (itemsToBuy.length > 0 && window.initCheckout) {
        window.initCheckout(itemsToBuy);
    } else {
        showToast("Please select items to checkout.");
    }
}

document.addEventListener('click', e => {
    const btn = e.target;

    if (btn.classList.contains('btn-edit')) {
        e.stopPropagation();
        openEdit(btn.dataset.id);
        return; 
    } 
    
    if (btn.classList.contains('btn-remove')) {
        e.stopPropagation();
        toDelete = btn.dataset.id;
        show('cartRemoveModal');
        return; 
    }

    const card = btn.closest('.cart-card');
    if (card) {
        const id = card.dataset.id;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        render();
    }
});
document.getElementById('saveOverwriteBtn').onclick  = saveCartOverwrite;
document.getElementById('confirmRemove').onclick      = removeItem;
document.getElementById('cancelRemove').onclick       = () => hide('cartRemoveModal');
if (checkoutBtn) checkoutBtn.onclick = openCheckout;

window.closeEditModal = () => hide('editProductModal');

onAuthStateChanged(auth, u => {
    if (!u) {
        uid = null;
        list.innerHTML = '<p class="auth-msg">Please log in to view your cart.</p>';
        return;
    }
    uid = u.uid;
    onSnapshot(collection(db, 'users', uid, 'cart'), snap => {
        cart     = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        window.__cartSize = cart.length;
        const badge = document.querySelector('.cart-count');
        if (badge) { badge.textContent = cart.length; badge.style.display = cart.length > 0 ? 'flex' : 'none'; }
        selected.forEach(id => { if (!cart.find(i => i.id === id)) selected.delete(id); });
        render();
    });
});

window.closeCheckoutModal = () => {
    const overlay = document.getElementById('pdmOverlay');
    if (overlay) overlay.classList.add('pdm-hidden');
    document.body.style.overflow = 'auto';
};