import { db } from './firebase-config.js'; 
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

async function loadCategories() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;
    try {
        const q = query(collection(db, "categories"), orderBy("name"));
        const s = await getDocs(q);
        grid.innerHTML = '';
        if (s.empty) { grid.innerHTML = '<p>No categories found.</p>'; return; }
        s.forEach((d) => {
            const data = d.data(), name = data.name, img = data.imageURL || 'assets/shop-logos/default.png';
            const card = document.createElement('div');
            card.className = 'catalog-card';
            card.onclick = () => { window.location.href = `shop.html?category=${d.id}`; };
            card.innerHTML = `<div class="img-box"><img src="${img}" alt="${name}" onerror="this.src='assets/shop-logos/default.png'"></div><h3>${name}</h3>`;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<p>Error loading categories.</p>';
    }
}

document.addEventListener('DOMContentLoaded', loadCategories);