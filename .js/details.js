import { db, auth } from './firebase-config.js';
import {
    doc, getDoc, collection, getDocs,
    query, orderBy, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { showToast } from './toast-util.js';

let currentProduct   = null;
let currentProductId = null;
let selectedVariant  = null;
let selectedColor    = null;
let quantity         = 1;
let currentUser      = null;
let pendingOrderData = null;
let deliveryFeeMap   = {};
let selectedAddon    = null;
let deliveryFee      = 0;

onAuthStateChanged(auth, (u) => { currentUser = u; });

async function openProductModal(productId) {
    const id = typeof productId === 'object' ? productId.productId : productId;
    currentProductId = String(id);
    resetState();

    try {
        const snap = await getDoc(doc(db, 'products', currentProductId));
        if (!snap.exists()) { console.warn('Product not found:', currentProductId); return; }

        currentProduct = { id: currentProductId, ...snap.data() };
        populateCategoryHeading(currentProduct.category);
        await populateStep1(currentProduct);

        goToStep(1);
        const overlay = document.getElementById('pdmOverlay');
        if (overlay) {
            overlay.classList.remove('pdm-hidden');
            overlay.classList.add('pdm-active');
        }
        document.body.style.overflow = 'hidden';
    } catch (e) {
        console.error('Error opening modal:', e);
    }
}

async function populateStep1(data) {
    const mainImg = document.getElementById('pdmMainImg');
    if (mainImg) mainImg.src = data.image || data.imageURL || '';

    const nameEl  = document.getElementById('pdmProductName');
    const priceEl = document.getElementById('pdmProductBasePrice');
    if (nameEl)  nameEl.textContent  = data.name || '';
    if (priceEl) priceEl.textContent = `₱${Number(data.price || 0).toLocaleString()}`;

    const specs     = (data.specs && data.specs[0]) ? data.specs[0] : {};
    const specsList = document.getElementById('pdmSpecsList');
    if (specsList) {
        specsList.innerHTML = '';
        [
            { key: 'model',        label: 'Model'       },
            { key: 'power source', label: 'Power Source' },
            { key: 'material',     label: 'Material'     },
            { key: 'tray size',    label: 'Tray Size'    },
        ].forEach(({ key, label }) => {
            if (specs[key]) {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${label}:</strong> ${specs[key]}`;
                specsList.appendChild(li);
            }
        });
    }

    const inclTitle = document.getElementById('pdmInclusionTitle');
    const inclList  = document.getElementById('pdmInclusionList');
    if (inclList) {
        inclList.innerHTML = '';
        if (specs.inclusion) {
            if (inclTitle) inclTitle.style.display = '';
            specs.inclusion.split(',').forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.trim();
                inclList.appendChild(li);
            });
        } else {
            if (inclTitle) inclTitle.style.display = 'none';
        }
    }

    const warEl = document.getElementById('pdmWarrantyText');
    if (warEl) warEl.textContent = specs.warranty || '1-Year Service Warranty (No Dents)';

    const variantList = document.getElementById('pdmVariantList');
    if (variantList) {
        variantList.innerHTML = '';
        const variants = data.variant || data.variants || [];
        if (variants.length > 0) {
            selectedVariant = variants[0];
            variants.forEach((v, i) => {
                const row = document.createElement('div');
                row.className = `pdm-variant-row${i === 0 ? ' pdm-variant-selected' : ''}`;
                const dim = v.dimension
                    ? `${v.dimension.length} x ${v.dimension.width} x ${v.dimension.height} in.`
                    : '';
                row.innerHTML = `
                    <div class="pdm-variant-left">
                        <span class="pdm-variant-name">${v.type || `Variant ${i + 1}`}</span>
                        ${dim ? `<span class="pdm-variant-size">${dim}</span>` : ''}
                    </div>
                    <span class="pdm-variant-price">₱${Number(v.price).toLocaleString()}</span>`;
                row.addEventListener('click', () => {
                    document.querySelectorAll('.pdm-variant-row').forEach(r => r.classList.remove('pdm-variant-selected'));
                    row.classList.add('pdm-variant-selected');
                    selectedVariant = v;
                    if (priceEl) priceEl.textContent = `₱${Number(v.price).toLocaleString()}`;
                });
                variantList.appendChild(row);
            });
        } else {
            variantList.innerHTML = `<p style="font-family:'Satoshi';font-size:13px;opacity:0.5;">No variants available.</p>`;
        }
    }

    const colorDots = document.getElementById('pdmColorDots');
    if (colorDots) {
        colorDots.innerHTML = '';
        const existingPicker = document.getElementById('pdmCustomColorPicker');
        if (existingPicker) existingPicker.remove();
        const colors = data.colors || [];
        colors.forEach((color, i) => {
            const isMulti = color === 'multi';
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;display:inline-block;';
            const dot = document.createElement('button');
            dot.className = 'pdm-color-dot';
            dot.setAttribute('aria-label', isMulti ? 'Custom color' : color);
            if (isMulti) {
                dot.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
                dot.title = 'Custom color — pick your own';
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.id = 'pdmCustomColorPicker';
                picker.className = 'pdm-hidden-picker';
                picker.oninput = (e) => {
                    const hex = e.target.value.toUpperCase();
                    selectedColor = hex;
                    dot.style.background = hex;
                    clearColorSelection();
                    dot.classList.add('pdm-color-selected');
                };
                dot.addEventListener('click', () => picker.click());
                wrapper.appendChild(dot);
                wrapper.appendChild(picker);
            } else {
                dot.style.backgroundColor = color;
                dot.title = color;
                dot.addEventListener('click', () => {
                    clearColorSelection();
                    dot.classList.add('pdm-color-selected');
                    selectedColor = color;
                });
                wrapper.appendChild(dot);
            }
            colorDots.appendChild(wrapper);
            if (i === 0 && !isMulti) {
                dot.classList.add('pdm-color-selected');
                selectedColor = color;
            }
        });
    }

    const photoStrip = document.getElementById('pdmPhotoStrip');
    if (photoStrip) {
        photoStrip.innerHTML = '';
        const photos = [];
        if (data.image) photos.push(data.image);
        if (data.photos && Array.isArray(data.photos)) photos.push(...data.photos);
        photos.forEach(ph => {
            const img = document.createElement('img');
            img.src = ph;
            img.alt = data.name;
            img.className = 'pdm-strip-item';
            img.onerror = () => img.remove();
            img.addEventListener('click', () => { if (mainImg) mainImg.src = ph; });
            photoStrip.appendChild(img);
        });
    }

    await populateReviews(currentProductId);
}

async function populateReviews(productId) {
    const reviewList = document.getElementById('pdmReviewList');
    if (!reviewList) return;
    reviewList.innerHTML = '';

    try {
        const reviewSnap = await getDocs(
            query(
                collection(db, 'products', productId, 'reviews'),
                orderBy('createdAt', 'desc')
            )
        );

        if (reviewSnap.empty) {
            reviewList.innerHTML = `<p style="font-family:'Satoshi';font-size:13px;opacity:0.5;padding:10px 0;">No reviews yet.</p>`;
            return;
        }

        reviewSnap.forEach(d => {
            const r     = d.data();
            const stars = '★'.repeat(Math.min(Number(r.rating) || 5, 5));
            const date  = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : 'Recent';
            const card  = document.createElement('div');
            card.className = 'pdm-review-card';
            card.innerHTML = `
                <div style="color:#FF8800;margin-bottom:4px;">${stars}</div>
                <p style="font-family:'Satoshi-Bold';font-size:13px;font-weight:700;color:#2B1410;margin-bottom:2px;">${r.name || r.userName || 'Customer'}</p>
                <p style="font-family:'Satoshi';font-size:11px;color:#2B1410;opacity:0.45;margin-bottom:6px;">${date}</p>
                <p style="font-family:'Satoshi';font-size:12px;color:#2B1410;line-height:1.5;opacity:0.8;">"${r.text || r.comment || ''}"</p>`;
            reviewList.appendChild(card);
        });
    } catch (e) {
        console.warn('Reviews not loaded:', e.message);
        reviewList.innerHTML = `<p style="font-family:'Satoshi';font-size:13px;opacity:0.5;padding:10px 0;">Reviews unavailable.</p>`;
    }
}

function populateCategoryHeading(category) {
    const map = {
        'Ovens':            "GAS <span class='highlight'>OVENS</span>",
        'Rollers':          "DOUGH <span class='highlight'>ROLLERS</span>",
        'Slicer':           "BREAD <span class='highlight'>SLICERS</span>",
        'Mixers':           "ELECTRIC <span class='highlight'>MIXERS</span>",
        'Bankas':           "STAINLESS <span class='highlight'>BANKAS</span>",
        'Stainless Tables': "STAINLESS <span class='highlight'>TABLES</span>",
        'Crushers':         "ICE <span class='highlight'>CRUSHERS</span>",
        'Tray Racks':       "TRAY <span class='highlight'>RACKS</span>",
    };
    const el = document.getElementById('pdmCategoryHeading');
    if (el) el.innerHTML = map[category] || category.toUpperCase();
}

window.goToStep = function(step) {
    if (step === 2) {
        if (!selectedVariant) { showValidationMsg('Please select a variant before continuing.'); return; }
        if (!selectedColor)   { showValidationMsg('Please select a unit color before continuing.'); return; }
        populateStep2();
    }
    document.querySelectorAll('.pdm-step').forEach(s => s.classList.add('pdm-hidden'));
    const target = document.getElementById(`pdmStep${step}`);
    if (target) {
        target.classList.remove('pdm-hidden');
        const panel = document.querySelector('.pdm-panel');
        if (panel) panel.scrollTop = 0;
    }
};

function showValidationMsg(msg) {
    const existing = document.getElementById('pdmValidationMsg');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'pdmValidationMsg';
    el.textContent = msg;
    el.style.cssText = `background:#fff3cd;border:1.5px solid #FF8800;border-radius:8px;
        padding:10px 16px;font-family:'Satoshi-Bold',sans-serif;font-size:13px;
        font-weight:700;color:#2B1410;margin-top:12px;text-align:center;`;
    const btnContainer = document.querySelector('.pdm-center-btn-container');
    if (btnContainer) btnContainer.before(el);
    setTimeout(() => el.remove(), 3000);
}

window.closeModal = function() {
    const overlay = document.getElementById('pdmOverlay');
    if (overlay) {
        overlay.classList.remove('pdm-active');
        overlay.classList.add('pdm-hidden');
    }
    closeCheckoutConfirm();
    document.body.style.overflow = '';
    resetState();
};

window.closeCheckoutConfirm = function() {
    const modal = document.getElementById('checkoutConfirmModal');
    if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('pdmOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) window.closeModal();
        });
    }
});

function clearColorSelection() {
    document.querySelectorAll('.pdm-color-dot').forEach(d => d.classList.remove('pdm-color-selected'));
}

function resetState() {
    selectedVariant  = null;
    selectedColor    = null;
    quantity         = 1;
    selectedAddon    = null;
    deliveryFee      = 0;
    pendingOrderData = null;
    const msg = document.getElementById('pdmValidationMsg');
    if (msg) msg.remove();
}

async function populateStep2() {
    const s2Img = document.getElementById('pdmS2Img');
    if (s2Img) s2Img.src = currentProduct.image || currentProduct.imageURL || '';

    const s2Name = document.getElementById('pdmS2Name');
    if (s2Name) s2Name.textContent = currentProduct.name || '';

    selectedAddon = null;
    deliveryFee   = 0;
    updateS2Price();
    populateAddons(currentProduct.addons || []);
    await loadProvinces();

    const qtyDisp = document.getElementById('pdmQtyDisplay');
    if (qtyDisp) qtyDisp.textContent = quantity;

    const minus = document.getElementById('pdmQtyMinus');
    if (minus) minus.onclick = () => {
        if (quantity > 1) { quantity--; if (qtyDisp) qtyDisp.textContent = quantity; updateS2Price(); }
    };

    const plus = document.getElementById('pdmQtyPlus');
    if (plus) plus.onclick = () => {
        quantity++; if (qtyDisp) qtyDisp.textContent = quantity; updateS2Price();
    };

    const modeEl = document.getElementById('pdmDeliveryMode');
    if (modeEl) modeEl.onchange = () => {
        if (modeEl.value === 'Pick-up at Store') { deliveryFee = 0; updateS2Price(); }
        else recalcDeliveryFee();
    };

    const addCartBtn = document.getElementById('pdmAddToCartBtn');
    if (addCartBtn) addCartBtn.onclick = handleAddToCart;

    const checkoutBtn = document.getElementById('pdmCheckoutBtn');
    if (checkoutBtn) checkoutBtn.onclick = openCheckoutConfirm;
}

function populateAddons(addons) {
    const list    = document.getElementById('pdmAddonList');
    const noneTag = document.getElementById('pdmAddonNoneTag');
    if (!list) return;
    list.innerHTML = '';
    selectedAddon  = null;
    if (noneTag) noneTag.textContent = 'NONE';

    const real = addons.filter(a => a.type && a.type.toLowerCase() !== 'none' && Number(a.price) > 0);
    if (!real.length) { list.style.display = 'none'; return; }
    list.style.display = '';

    real.forEach(addon => {
        const btn = document.createElement('button');
        btn.className = 'pdm-addon-btn';
        btn.type = 'button';
        btn.innerHTML = `<span>${addon.type}</span><span class="pdm-addon-price-tag">+ ₱${Number(addon.price).toLocaleString()}</span>`;
        btn.addEventListener('click', () => {
            if (selectedAddon && selectedAddon.type === addon.type) {
                selectedAddon = null;
                btn.classList.remove('pdm-addon-active');
                if (noneTag) noneTag.textContent = 'NONE';
            } else {
                document.querySelectorAll('.pdm-addon-btn').forEach(b => b.classList.remove('pdm-addon-active'));
                btn.classList.add('pdm-addon-active');
                selectedAddon = addon;
                if (noneTag) noneTag.textContent = addon.type;
            }
            updateS2Price();
        });
        list.appendChild(btn);
    });
}

async function loadProvinces() {
    const provSel = document.getElementById('pdmProvince');
    const citySel = document.getElementById('pdmCity');
    if (!provSel || !citySel) return;
    provSel.innerHTML = '<option value="">Select Province</option>';
    citySel.innerHTML = '<option value="">Select Province first</option>';
    deliveryFeeMap = {};

    try {
        const snap = await getDocs(collection(db, 'delivery_fee'));
        snap.forEach(d => {
            const { province, city, fee } = d.data();
            if (!province || !city) return;
            if (!deliveryFeeMap[province]) deliveryFeeMap[province] = {};
            deliveryFeeMap[province][city] = fee;
        });

        Object.keys(deliveryFeeMap).sort().forEach(prov => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = prov;
            provSel.appendChild(opt);
        });

        provSel.onchange = () => {
            const prov = provSel.value;
            citySel.innerHTML = '<option value="">Select City</option>';
            deliveryFee = 0;
            updateS2Price();
            if (prov && deliveryFeeMap[prov]) {
                Object.keys(deliveryFeeMap[prov]).sort().forEach(city => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = city;
                    citySel.appendChild(opt);
                });
            }
        };
        citySel.onchange = recalcDeliveryFee;
    } catch (e) {
        console.error('Delivery fee load error:', e);
    }
}

function recalcDeliveryFee() {
    const prov = document.getElementById('pdmProvince')?.value;
    const city = document.getElementById('pdmCity')?.value;
    const mode = document.getElementById('pdmDeliveryMode')?.value;
    deliveryFee = (mode === 'Pick-up at Store') ? 0 : (deliveryFeeMap[prov]?.[city] ?? 0);
    updateS2Price();
}

function updateS2Price() {
    const base  = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct?.price || 0);
    const addon = selectedAddon   ? Number(selectedAddon.price)   : 0;
    const total = (base + addon) * quantity + deliveryFee;
    const el    = document.getElementById('pdmS2Price');
    if (el) el.textContent = `₱${total.toLocaleString()}`;
}

function validateDeliveryForm() {
    const ids = ['pdmFirstName', 'pdmLastName', 'pdmContact', 'pdmProvince', 'pdmCity', 'pdmAddress'];
    let valid = true;
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('pdm-field-error');
        if (!el.value.trim()) { el.classList.add('pdm-field-error'); valid = false; }
    });
    if (!valid) showValidationMsg('Please fill in all required delivery fields.');
    return valid;
}

function buildCartItem() {
    const variantPrice = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct?.price || 0);
    const addonPrice   = selectedAddon   ? Number(selectedAddon.price)   : 0;
    const unitPrice    = variantPrice + addonPrice;
    const fn           = document.getElementById('pdmFirstName').value.trim();
    const ln           = document.getElementById('pdmLastName').value.trim();
    return {
        productId:    currentProductId,
        productName:  currentProduct.name,
        category:     currentProduct.category,
        imageURL:     currentProduct.image || currentProduct.imageURL || '',
        variant:      selectedVariant ? selectedVariant.type : '',
        variantPrice,
        color:        selectedColor || '',
        addon:        selectedAddon ? selectedAddon.type : 'None',
        addonPrice,
        unitPrice,
        quantity,
        deliveryFee,
        total:        (unitPrice * quantity) + deliveryFee,
        customerName: `${fn} ${ln}`,
        customer: {
            firstName:    fn,
            lastName:     ln,
            contact:      '+63' + document.getElementById('pdmContact').value.trim(),
            province:     document.getElementById('pdmProvince').value,
            city:         document.getElementById('pdmCity').value,
            deliveryMode: document.getElementById('pdmDeliveryMode').value,
            address:      document.getElementById('pdmAddress').value.trim(),
        },
        userId:  currentUser ? currentUser.uid : 'guest',
        status:  'in_cart',
        addedAt: serverTimestamp()
    };
}

function openCheckoutConfirm() {
    if (!currentUser) { showToast('Please log in to checkout.'); return; }
    if (!validateDeliveryForm()) return;

    const vPrice = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct?.price || 0);
    const aPrice = selectedAddon   ? Number(selectedAddon.price)   : 0;
    const total  = ((vPrice + aPrice) * quantity) + deliveryFee;
    const fn     = document.getElementById('pdmFirstName').value.trim();
    const ln     = document.getElementById('pdmLastName').value.trim();
    const prov   = document.getElementById('pdmProvince').value;
    const city   = document.getElementById('pdmCity').value;
    const addr   = document.getElementById('pdmAddress').value.trim();
    const mode   = document.getElementById('pdmDeliveryMode').value;
    const tel    = '+63' + document.getElementById('pdmContact').value.trim();

    const content = document.getElementById('checkoutDetailsContent');
    if (content) {
        content.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(43,20,16,0.1);padding-bottom:6px;margin-bottom:2px;">
                    <span style="font-family:'Satoshi-Bold';font-weight:700;">Product</span>
                    <span>${currentProduct.name}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="font-family:'Satoshi-Bold';font-weight:700;">Variant</span>
                    <span>${selectedVariant?.type || '—'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="font-family:'Satoshi-Bold';font-weight:700;">Color</span>
                    <span style="display:flex;align-items:center;gap:6px;">
                        <span style="width:14px;height:14px;border-radius:50%;background:${selectedColor || '#ccc'};display:inline-block;border:1px solid rgba(0,0,0,0.15);"></span>
                        ${selectedColor || '—'}
                    </span>
                </div>
                ${selectedAddon ? `<div style="display:flex;justify-content:space-between;"><span style="font-family:'Satoshi-Bold';font-weight:700;">Add-on</span><span>${selectedAddon.type} (+₱${Number(selectedAddon.price).toLocaleString()})</span></div>` : ''}
                <div style="display:flex;justify-content:space-between;">
                    <span style="font-family:'Satoshi-Bold';font-weight:700;">Quantity</span>
                    <span>${quantity}</span>
                </div>
                <div style="border-top:1px solid rgba(43,20,16,0.1);padding-top:6px;margin-top:4px;display:flex;flex-direction:column;gap:4px;">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:'Satoshi-Bold';font-weight:700;">Name</span>
                        <span>${fn} ${ln}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:'Satoshi-Bold';font-weight:700;">Contact</span>
                        <span>${tel}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:'Satoshi-Bold';font-weight:700;">City</span>
                        <span>${city}, ${prov}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:'Satoshi-Bold';font-weight:700;">Address</span>
                        <span style="max-width:55%;text-align:right;">${addr}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-family:'Satoshi-Bold';font-weight:700;">Delivery</span>
                        <span>${mode}</span>
                    </div>
                </div>
                <div style="border-top:2px solid #FF8800;padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-family:'Integral-CF-Bold';font-size:15px;">TOTAL</span>
                    <span style="font-family:'Satoshi-Bold';font-size:18px;font-weight:700;color:#FF8800;">₱${total.toLocaleString()}</span>
                </div>
            </div>`;
    }

    const finalBtn = document.getElementById('finalConfirmBtn');
    if (finalBtn) {
        finalBtn.onclick = () => {
            closeCheckoutConfirm();
            const orderData = buildCartItem();
            if (typeof window.initCheckout === 'function') window.initCheckout(orderData);
            document.querySelectorAll('.pdm-step').forEach(s => s.classList.add('pdm-hidden'));
            const s3 = document.getElementById('pdmStep3');
            if (s3) {
                s3.classList.remove('pdm-hidden');
                const panel = document.querySelector('.pdm-panel');
                if (panel) panel.scrollTop = 0;
            }
        };
    }

    const modal = document.getElementById('checkoutConfirmModal');
    if (modal) modal.style.display = 'flex';
}

async function handleAddToCart() {
    if (!currentUser) { showToast('Please log in to add items to your cart.'); return; }
    if (!validateDeliveryForm()) return;
    if ((window.__cartSize || 0) >= 99) { showToast('Cart is full (99 items).'); return; }

    const btn = document.getElementById('pdmAddToCartBtn');
    try {
        btn.disabled    = true;
        btn.textContent = 'ADDING...';
        await addDoc(collection(db, 'users', currentUser.uid, 'cart'), buildCartItem());
        window.__cartSize = (window.__cartSize || 0) + 1;
        const badge = document.querySelector('.cart-count');
        if (badge) {
            badge.textContent   = window.__cartSize;
            badge.style.display = 'flex';
        }
        showToast('Added to cart successfully!');
        window.closeModal();
    } catch (e) {
        console.error('Add to cart error:', e);
        showToast('Failed to add to cart. Please try again.');
        btn.disabled    = false;
        btn.textContent = 'ADD TO CART';
    }
}

window.openProductModal = openProductModal;

window.getOrderState = () => ({
    product:   currentProduct,
    productId: currentProductId,
    variant:   selectedVariant,
    color:     selectedColor,
    addon:     selectedAddon,
    quantity,
    user:      currentUser
});