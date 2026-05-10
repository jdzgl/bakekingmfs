import { db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, deleteDoc, addDoc, updateDoc, getDoc, collectionGroup } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { uploadImageToCloud } from './imgbb-util.js';
import { showToast } from './toast-util.js';

const productGrid = document.getElementById('productGrid'), 
      categoryTitle = document.getElementById('categoryTitle'), 
      totalProdCount = document.getElementById('totalProdCount'), 
      monthlyOrderCount = document.getElementById('monthlyOrderCount'), 
      variantRows = document.getElementById('variantRows'), 
      addonRows = document.getElementById('addonRows'), 
      colorRows = document.getElementById('colorRows'),
      galleryContainer = document.getElementById('galleryContainer'),
      prodImagePath = document.getElementById('prodImagePath'),
      productForm = document.getElementById('productForm'),
      confirmModal = document.getElementById('confirmModal'),
      confirmMessage = document.getElementById('confirmMessage'),
      confirmYes = document.getElementById('confirmYes'),
      confirmNo = document.getElementById('confirmNo');

const urlParams = new URLSearchParams(window.location.search), 
      currentCategory = urlParams.get('category') || 'Ovens';

const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

const openConfirm = (msg, onConfirm) => {
    confirmMessage.textContent = msg;
    confirmModal.classList.add('is-visible');
    confirmYes.onclick = () => {
        confirmModal.classList.remove('is-visible');
        onConfirm();
    };
    confirmNo.onclick = () => confirmModal.classList.remove('is-visible');
};

async function fetchProductsAndStats() {
    try {
        categoryTitle.textContent = currentCategory.toUpperCase();
        const pSnap = await getDocs(query(collection(db, "products"), where("category", "==", currentCategory)));
        let products = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const oSnap = await getDocs(collectionGroup(db, "orders")), now = new Date();
        let stats = {}, mCount = 0;
        oSnap.forEach(od => {
            const d = od.data(), dt = d.timestamp?.toDate();
            if (dt && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()) mCount++;
            stats[d.productId] = (stats[d.productId] || 0) + 1;
        });
        if(totalProdCount) totalProdCount.textContent = products.length;
        if(monthlyOrderCount) monthlyOrderCount.textContent = mCount;
        renderProducts(products, stats);
    } catch (e) { console.error(e); }
}

function renderProducts(products, stats) {
    if (!productGrid) return;
    if (!products.length) { productGrid.innerHTML = `<p class="ap-empty">No products found.</p>`; return; }
    productGrid.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.innerHTML = `
            <div class="prod-img-wrap">
                <span class="prod-order-badge">This Month: ${stats[p.id] || 0}</span>
                <img src="${p.image || 'assets/photos/placeholder.png'}" onerror="this.src='assets/photos/placeholder.png'">
            </div>
            <div class="prod-details">
                <h3>${p.name}</h3>
                <span class="prod-price">₱${Number(p.price).toLocaleString()}</span>
                <div class="prod-actions">
                    <button class="btn-edit" onclick="editProduct('${p.id}')">EDIT</button>
                    <button class="btn-delete" onclick="deleteProduct('${p.id}')">DELETE</button>
                </div>
            </div>`;
        productGrid.appendChild(card);
    });
}

window.deleteProduct = (id) => {
    openConfirm("Are you sure you want to delete this product?", async () => {
        try {
            await deleteDoc(doc(db, "products", id));
            showToast("Product deleted successfully.");
            setTimeout(() => location.reload(), 1500);
        } catch (err) {
            showToast("Error deleting: " + err.message);
        }
    });
};

async function handleFileUpload(file, previewImg, pathInput, statusText) {
    if (!file) return;
    if (statusText) {
        statusText.style.display = 'block';
        statusText.textContent = "Uploading...";
    }
    try {
        const url = await uploadImageToCloud(file);
        if (pathInput) pathInput.value = url;
        if (previewImg) {
            previewImg.src = url;
            previewImg.style.display = 'block';
        }
        if (statusText) statusText.style.display = 'none';
        return url;
    } catch (err) {
        if (statusText) statusText.textContent = "Upload failed.";
        console.error(err);
    }
}

function setupMainImageUploader() {
    const dropZone = document.getElementById('mainImageDropZone'),
          fileInput = document.getElementById('prodImageFile'),
          preview = document.getElementById('apImgPreview'),
          status = document.getElementById('apImgNone');
    if(!dropZone) return;
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFileUpload(e.target.files[0], preview, prodImagePath, status);
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.toggle('drag-over', evt === 'dragover');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        handleFileUpload(file, preview, prodImagePath, status);
    });
}

function addGalleryItem(url = "") {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.innerHTML = `
        <img src="${url || 'assets/photos/placeholder.png'}" class="gallery-img-preview">
        <input type="hidden" class="gallery-path" value="${url}">
        <button type="button" class="remove-gallery-btn">&times;</button>
    `;
    item.querySelector('.remove-gallery-btn').onclick = () => item.remove();
    galleryContainer.appendChild(item);
}

document.getElementById('addGalleryPhoto').onclick = () => {
    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.accept = 'image/*';
    tempInput.onchange = async (e) => {
        const url = await handleFileUpload(e.target.files[0]);
        if (url) addGalleryItem(url);
    };
    tempInput.click();
};

function addDynamicRow(type, data = "") {
    let c;
    if(type === 'variant') c = variantRows;
    else if(type === 'addon') c = addonRows;
    else if(type === 'color') c = colorRows;
    if(!c) return;
    const row = document.createElement('div');
    row.className = 'ap-dynamic-row';
    const placeholder = type === 'variant' ? "Type | Price | LxWxH" : (type === 'color' ? "e.g. red or #000000" : "Name | Price");
    row.innerHTML = `<input type="text" class="ap-row-input" placeholder="${placeholder}" value="${data}"><button type="button" class="ap-remove-row-btn">&times;</button>`;
    row.querySelector('.ap-remove-row-btn').onclick = () => row.remove();
    c.appendChild(row);
}

document.getElementById('addVariantRow').onclick = () => addDynamicRow('variant');
document.getElementById('addAddonRow').onclick = () => addDynamicRow('addon');
document.getElementById('addColorRow').onclick = () => addDynamicRow('color');

window.editProduct = async (id) => {
    const s = await getDoc(doc(db, "products", id));
    if (s.exists()) {
        const d = s.data();
        setVal('prodName', d.name); setVal('prodPrice', d.price); setVal('prodDesc', d.description); setVal('prodImagePath', d.image);
        const sp = d.specs?.[0] || {};
        setVal('specPowerSource', sp['power source']); setVal('specMaterial', sp.material); setVal('specTraySize', sp['tray size']); setVal('specWarranty', sp.warranty); setVal('specInclusion', sp.inclusion);
        variantRows.innerHTML = addonRows.innerHTML = colorRows.innerHTML = galleryContainer.innerHTML = '';
        if (d.variant) d.variant.forEach(v => { 
            const dm = v.dimension || {}; 
            addDynamicRow('variant', `${v.type} | ${v.price} | ${dm.length || 0}x${dm.width || 0}x${dm.height || 0}`); 
        });
        if (d.addons) d.addons.forEach(a => addDynamicRow('addon', `${a.type || a.name} | ${a.price}`));
        if (d.colors) d.colors.forEach(c => addDynamicRow('color', c));
        if (d.photos) d.photos.forEach(url => addGalleryItem(url));
        const pr = document.getElementById('apImgPreview'), n = document.getElementById('apImgNone');
        if(pr && d.image) { pr.src = d.image; pr.style.display = 'block'; if(n) n.style.display = 'none'; }
        document.getElementById('modalTitle').textContent = "Edit Product";
        document.getElementById('productModal').classList.add('is-visible');
        productForm.dataset.editId = id;
    }
};

productForm.onsubmit = (e) => {
    e.preventDefault();
    openConfirm("Save product changes?", async () => {
        const eid = productForm.dataset.editId;
        const vs = Array.from(variantRows.querySelectorAll('.ap-row-input')).map(i => {
            const p = i.value.split('|').map(s => s.trim()), d = (p[2] || "0x0x0").split('x').map(n => parseFloat(n) || 0);
            return { type: p[0], price: parseFloat(p[1]) || 0, dimension: { length: d[0], width: d[1], height: d[2] } };
        });
        const ads = Array.from(addonRows.querySelectorAll('.ap-row-input')).map(i => {
            const p = i.value.split('|').map(s => s.trim());
            return { type: p[0], price: parseFloat(p[1]) || 0 };
        });
        const cols = Array.from(colorRows.querySelectorAll('.ap-row-input')).map(i => i.value.trim()).filter(val => val !== "");
        const photos = Array.from(galleryContainer.querySelectorAll('.gallery-path')).map(i => i.value);
        const data = {
            name: document.getElementById('prodName').value, 
            price: parseFloat(document.getElementById('prodPrice').value),
            description: document.getElementById('prodDesc').value, 
            image: document.getElementById('prodImagePath').value,
            category: currentCategory, 
            variant: vs, 
            addons: ads,
            colors: cols,
            photos: photos,
            specs: [{ 
                "power source": document.getElementById('specPowerSource').value, 
                material: document.getElementById('specMaterial').value, 
                "tray size": document.getElementById('specTraySize').value, 
                warranty: document.getElementById('specWarranty').value, 
                inclusion: document.getElementById('specInclusion').value 
            }]
        };
        try {
            eid ? await updateDoc(doc(db, "products", eid), data) : await addDoc(collection(db, "products"), data);
            showToast("Product changes saved successfully!");
            setTimeout(() => location.reload(), 1500);
        } catch (err) { 
            showToast("Error: " + err.message); 
        }
    });
};

document.getElementById('openAddProduct').onclick = () => {
    productForm.reset(); 
    variantRows.innerHTML = addonRows.innerHTML = colorRows.innerHTML = galleryContainer.innerHTML = '';
    const pr = document.getElementById('apImgPreview'), n = document.getElementById('apImgNone');
    if(pr) pr.style.display = 'none';
    if(n) { n.style.display = 'block'; n.textContent = "Drag & Drop or Click to Upload"; }
    delete productForm.dataset.editId;
    document.getElementById('modalTitle').textContent = "Add New Product";
    document.getElementById('productModal').classList.add('is-visible');
};

const closeM = () => { document.getElementById('productModal').classList.remove('is-visible'); };
document.getElementById('closeProductModal').onclick = closeM;
document.getElementById('cancelBtn').onclick = () => {
    openConfirm("Discard unsaved changes?", () => closeM());
};

setupMainImageUploader();
fetchProductsAndStats();