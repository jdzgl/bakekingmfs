import { db } from './firebase-config.js';
import { collection, collectionGroup, onSnapshot, doc, setDoc, updateDoc, getDocs, deleteDoc, query, where, writeBatch, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { uploadImageToCloud } from './imgbb-util.js';
import { showToast } from './toast-util.js';

let allCategories = [];
let editingId = null;
let currentEditDfId = null;
let currentDeleteDfId = null;

function startCategoryListener() {
    onSnapshot(collection(db, 'categories'), (snapshot) => {
        allCategories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCategories();
    });
}

async function renderCategories() {
    const grid = document.getElementById('ascGrid');
    if (!grid) return;

    const addCardHTML = `<div class="asc-add-card" id="openAddModal"><div class="asc-add-circle">+</div><span class="asc-add-label">Add New Category</span></div>`;
    
    const categoryCardsHTML = await Promise.all(allCategories.map(async (cat) => {
        const q = query(collectionGroup(db, 'products'), where('category', '==', cat.id));
        const snapshot = await getDocs(q);
        return `
            <div class="asc-card" onclick="navigateToCategory('${cat.id}')">
                <div class="asc-card-img">
                    <img src="${cat.imageURL}" alt="${cat.name}" onerror="this.src='assets/placeholder.png'">
                </div>
                <div class="asc-card-label">
                    <h3>${cat.name}</h3>
                    <span class="asc-id-tag">ID: ${cat.id}</span>
                    <div class="asc-stats-row">
                        <span class="asc-count-badge">${snapshot.size} Products</span>
                    </div>
                    <button class="asc-edit-trigger" onclick="handleEditClick(event, '${cat.id}')">Edit Category</button>
                </div>
            </div>`;
    }));

    grid.innerHTML = addCardHTML + categoryCardsHTML.join('');
    addDeliveryManagementCard();

    document.getElementById('openAddModal').onclick = () => {
        openCategoryModal(null);
    };
}

window.navigateToCategory = (id) => { window.location.href = `admin-products.html?category=${id}`; };
window.handleEditClick = (e, id) => { e.stopPropagation(); openCategoryModal(id); };

function setupFileUploader() {
    const dz = document.getElementById('ascDropZone'), fi = document.getElementById('ascCategoryFile'), pi = document.getElementById('ascCategoryPath'), fd = document.getElementById('selectedFileName');
    if(!dz || !fi) return;
    dz.onclick = () => fi.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag-over'); };
    dz.ondragleave = () => dz.classList.remove('drag-over');
    const handleFile = async (file) => {
        if (!file) return;
        if(fd) fd.textContent = "Uploading to cloud...";
        try {
            const url = await uploadImageToCloud(file);
            pi.value = url;
            if(fd) fd.textContent = "Cloud upload complete!";
            showToast('Image uploaded successfully!');
        } catch (err) { 
            if(fd) fd.textContent = "Upload failed."; 
            showToast('Image upload failed.');
        }
        dz.classList.remove('drag-over');
    };
    fi.onchange = (e) => handleFile(e.target.files[0]);
    dz.ondrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };
}

async function saveCategory() {
    const vn = document.getElementById('ascCategoryName').value.trim(), 
          ni = document.getElementById('ascCategoryId').value.trim(), 
          ip = document.getElementById('ascCategoryPath').value.trim(), 
          btn = document.getElementById('ascSaveBtn');
          
    if (!vn || !ni || !ip) return alert("Required fields missing.");
    
    btn.disabled = true;
    try {
        if (editingId && editingId !== ni) {
            if (!confirm("Update associated products?")) throw new Error("Cancelled");
            const q = query(collectionGroup(db, 'products'), where('category', '==', editingId)), 
                  s = await getDocs(q), 
                  b = writeBatch(db);
            s.forEach((d) => b.update(d.ref, { category: ni }));
            await b.commit();
            await deleteDoc(doc(db, 'categories', editingId));
        }
        
        const q = query(collectionGroup(db, 'products'), where('category', '==', ni)), 
              s = await getDocs(q);
              
        await setDoc(doc(db, 'categories', ni), { 
            name: vn, 
            imageURL: ip, 
            productCount: s.size, 
            updatedAt: serverTimestamp() 
        }, { merge: true });

        showToast(editingId ? 'Category updated!' : 'Category created!');
        setTimeout(() => closeModal(), 500);
    } catch (err) { 
        if(err.message !== "Cancelled") {
            alert(err.message);
            showToast('Error saving changes');
        }
    } finally { 
        btn.disabled = false; 
    }
}

function closeModal(isCancel = false) { 
    const m = document.getElementById('ascModal');
    if (m) m.classList.remove('asc-active'); 
    editingId = null; 
    if(isCancel) showToast('Changes discarded');
}

function setupDeliveryFeeListener() {
    const listContainer = document.getElementById('dfListContainer');
    onSnapshot(collection(db, 'delivery_fee'), (snapshot) => {
        listContainer.innerHTML = '';
        snapshot.forEach((d) => {
            const data = d.data();
            const div = document.createElement('div');
            div.className = 'df-fee-item';
            div.style = "display: flex; align-items: center; justify-content: space-between; background: white; padding: 12px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #EEE;";
            div.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <strong style="color: #2B1410;">${data.city}, ${data.province}</strong>
                    <span style="font-size: 0.85rem; color: #FF8800;">₱${data.fee.toLocaleString()}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="editFee('${d.id}', '${data.city}', ${data.fee})" style="background:none; border:none; cursor:pointer;"><img src='assets/icons/pencil.png' width=20px height=20px></button>
                    <button onclick="deleteFee('${d.id}', '${data.city}')" style="background:none; border:none; cursor:pointer;"><img src='assets/icons/delete.png' width=20px height=20px></button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    });
}

document.getElementById('dfAddBtn').onclick = async () => {
    const province = document.getElementById('dfProvinceInput').value.trim();
    const city = document.getElementById('dfCityInput').value.trim();
    const fee = parseFloat(document.getElementById('dfFeeInput').value);
    if (!province || !city || isNaN(fee)) return showToast("Please fill all fields correctly");
    try {
        const docId = `${province}_${city}`.replace(/\s+/g, '_');
        await setDoc(doc(db, 'delivery_fee', docId), { province, city, fee });
        document.getElementById('dfProvinceInput').value = '';
        document.getElementById('dfCityInput').value = '';
        document.getElementById('dfFeeInput').value = '';
        showToast("Location added successfully");
    } catch (e) { 
        showToast("Error adding location");
    }
};

window.editFee = (id, city, currentFee) => {
    currentEditDfId = id;
    document.getElementById('editDfLocationName').textContent = `Updating fee for: ${city}`;
    document.getElementById('editDfFeeInput').value = currentFee;
    document.getElementById('editDfModal').style.display = 'flex';
};

window.closeEditModal = () => {
    currentEditDfId = null;
    document.getElementById('editDfModal').style.display = 'none';
};

document.getElementById('saveEditDfBtn').onclick = async () => {
    const newFee = parseFloat(document.getElementById('editDfFeeInput').value);
    if (isNaN(newFee)) return showToast("Please enter a valid amount");
    try {
        await updateDoc(doc(db, 'delivery_fee', currentEditDfId), { fee: newFee });
        showToast("Delivery fee updated!");
        window.closeEditModal();
    } catch (e) {
        showToast("Failed to update fee");
    }
};

window.deleteFee = (id, city) => {
    currentDeleteDfId = id;
    document.getElementById('deleteDfMessage').textContent = `Are you sure you want to remove ${city}? This action cannot be undone.`;
    document.getElementById('deleteDfModal').style.display = 'flex';
};

window.closeDeleteModal = () => {
    currentDeleteDfId = null;
    document.getElementById('deleteDfModal').style.display = 'none';
};

document.getElementById('confirmDeleteDfBtn').onclick = async () => {
    if (!currentDeleteDfId) return;
    try {
        await deleteDoc(doc(db, 'delivery_fee', currentDeleteDfId));
        showToast("Location deleted");
        window.closeDeleteModal();
    } catch (e) {
        showToast("Error deleting location");
    }
};

function addDeliveryManagementCard() {
    const grid = document.getElementById('ascGrid');
    const settingsCard = document.createElement('div');
    settingsCard.className = 'asc-card settings-card'; 
    settingsCard.style.border = "2px dashed #FF8800";
    settingsCard.innerHTML = `
        <div class="asc-card-img" style="display:flex; align-items:center; justify-content:center; background:#F9F4F0;">
            <span style="font-size: 40px;"><img src='assets/icons/delivery.png' width=24px height=24px></span>
        </div>
        <div class="asc-card-label">
            <h3>DELIVERY FEES</h3>
            <p style="font-size:0.8rem; margin-bottom:10px;">Manage shipping rates</p>
            <button class="asc-edit-trigger" id="openDFModal" style="width:100%;">CONFIGURE</button>
        </div>`;
    grid.appendChild(settingsCard);
    document.getElementById('openDFModal').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('dfModal').style.display = 'flex';
        setupDeliveryFeeListener();
    };
}

window.openCategoryModal = (id) => {
    editingId = id;
    const m = document.getElementById('ascModal'), fd = document.getElementById('selectedFileName');
    document.getElementById('ascCategoryId').value = document.getElementById('ascCategoryName').value = document.getElementById('ascCategoryPath').value = '';
    if(fd) fd.textContent = '';
    if (id) {
        const c = allCategories.find(cat => cat.id === id);
        document.getElementById('ascModalTitle').textContent = "Edit Category";
        document.getElementById('ascCategoryId').value = c.id;
        document.getElementById('ascCategoryName').value = c.name;
        document.getElementById('ascCategoryPath').value = c.imageURL;
        document.getElementById('ascRenameWarning').style.display = 'block';
    } else {
        document.getElementById('ascModalTitle').textContent = "Add New Category";
        document.getElementById('ascRenameWarning').style.display = 'none';
    }
    m.classList.add('asc-active');
};

document.addEventListener('DOMContentLoaded', () => {
    startCategoryListener();
    setupFileUploader();
    document.getElementById('ascSaveBtn').onclick = saveCategory;
    document.getElementById('ascCancelBtn').onclick = () => closeModal(true);
    document.getElementById('ascModalClose').onclick = () => closeModal(true);
});