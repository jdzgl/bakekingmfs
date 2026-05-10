import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { initAdminHeader } from './admin-header.js';

async function injectHeader() {
    const placeholder = document.getElementById('admin-header-placeholder');
    if (!placeholder) return;

    try {
        const res = await fetch('admin-header.html');
        const html = await res.text();
        placeholder.innerHTML = html;

        const links = document.querySelectorAll('.adm-nav-link');
        const currentPath = window.location.pathname.split('/').pop();
        
        links.forEach(link => {
            const linkPath = link.getAttribute('href');
            if (linkPath === currentPath) {
                link.classList.add('adm-nav-active');
            } else {
                link.classList.remove('adm-nav-active');
            }
        });

        initAdminHeader();
    } catch (e) {
        console.error("Failed to inject admin header:", e);
    }
}

function listenForHeaderNotifs() {
    const dot = document.getElementById('admNotifDot');
    if (!dot) return;

    const q = query(
        collection(db, "notifications"), 
        where("role", "==", "admin"), 
        where("isRead", "==", false)
    );

    onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            dot.style.display = 'block';
            dot.textContent = snapshot.size; 
        } else {
            dot.style.display = 'none';
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists() || snap.data().role !== 'Admin') {
            alert("Access denied. Admins only.");
            window.location.href = 'login.html';
        }
    } catch (e) {
        console.error("Role check error:", e);
    }
});

injectHeader();