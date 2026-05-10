import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const titleMap = {
    "Ovens": { prefix: "GAS", highlight: "OVENS" },
    "Rollers": { prefix: "DOUGH", highlight: "ROLLERS" },
    "Slicer": { prefix: "BREAD", highlight: "SLICERS" },
    "Mixers": { prefix: "ELECTRIC", highlight: "MIXERS" },
    "Others": { prefix: "MORE", highlight: "EQUIPMENTS" },
    "Packages": { prefix: "SULIT", highlight: "BUNDLES" },
    "Crushers": { prefix: "BREAD", highlight: "CRUSHERS" },
};

function createProductCard(data) {
    const p = (data.variant && data.variant.length > 0) ? data.variant[0].price : data.price;
    const pd = p && Number(p) > 0 ? `₱${Number(p).toLocaleString()}` : `₱–,–––`;
    const isf = data.isFavorite === true;
    return `<div class="shop-product-card" onclick="if(window.openProductModal) window.openProductModal('${data.id}')"><div class="shop-card-img"><img src="${data.image || 'assets/photos/placeholder.png'}" alt="${data.name}" onerror="this.src='assets/photos/placeholder.png'"></div><div class="shop-card-footer"><div class="shop-card-text"><h3>${data.name}</h3><p class="shop-card-price">${pd}</p></div><div class="crown-box ${isf ? 'crown-active' : ''}" onclick="window.toggleFavorite('${data.id}', ${isf}, event)"><img src="${isf ? 'assets/icons/crown-selected.png' : 'assets/icons/crown.png'}" alt="Fav" class="crown-icon"></div></div></div>`;
}

function createQuotationCard() {
    return `
        <div class="shop-product-card quotation-card" onclick="window.location.href='https://www.facebook.com/gcso1230'">
            <div class="quotation-content">
                <h3>Cannot find what you are looking for?</h3>
                <p>Message us for direct quotation</p>
            </div>
        </div>`;
}

window.toggleFavorite = async (id, cur, e) => {
    if (e) e.stopPropagation();
    try {
        await updateDoc(doc(db, "products", id), { isFavorite: !cur });
        fetchProducts(); fetchGlobalFavorites();
    } catch (err) { console.error(err); }
};

async function fetchGlobalFavorites() {
    const s = document.getElementById('favorites-section'), g = document.getElementById('favorites-grid');
    if (!g) return;
    try {
        const q = query(collection(db, "products"), where("isFavorite", "==", true)), snap = await getDocs(q);
        if (snap.empty) { s.style.display = "none"; return; }
        s.style.display = "block"; g.innerHTML = "";
        snap.forEach(d => g.innerHTML += createProductCard({ id: d.id, ...d.data() }));
    } catch (err) { console.error(err); }
}

async function fetchProducts() {
    const g = document.getElementById('product-grid'), t = document.getElementById('page-title'), c = new URLSearchParams(window.location.search).get('category');
    if (!g) return;
    if (!c) { g.innerHTML = `<p class="shop-empty-msg">No category selected.</p>`; return; }
    const m = titleMap[c];
    if (m) t.innerHTML = `${m.prefix} <span class="highlight">${m.highlight}</span>`;
    try {
        const q = query(collection(db, "products"), where("category", "==", c)), snap = await getDocs(q);
        let ps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        ps.sort((a, b) => (b.isFavorite === true) - (a.isFavorite === true));
        g.innerHTML = ""; 
        ps.forEach(d => g.innerHTML += createProductCard(d));
        g.innerHTML += createQuotationCard();
    } catch (err) { console.error(err); }
}

fetchProducts(); fetchGlobalFavorites();