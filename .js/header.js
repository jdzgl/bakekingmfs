import { auth, db } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
    collection, 
    onSnapshot, 
    doc, 
    getDoc, 
    query, 
    where, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let isSidebarOpen = false;
let cartUnsub = null;
let notifUnsub = null;

function openSidebar() {
    const sidebar = document.getElementById('navSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (!sidebar || !overlay) return;

    sidebar.style.display = 'flex';
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
        sidebar.classList.add('is-open');
        overlay.classList.add('is-visible');
        if (hamburgerBtn) hamburgerBtn.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        isSidebarOpen = true;
    });
    history.pushState({ sidebarOpen: true }, '');
}

function closeSidebar() {
    const sidebar = document.getElementById('navSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (!sidebar || !overlay) return;

    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-visible');
    if (hamburgerBtn) hamburgerBtn.classList.remove('is-open');
    document.body.style.overflow = '';
    isSidebarOpen = false;
    setTimeout(() => {
        if (!isSidebarOpen) {
            sidebar.style.display = 'none';
            overlay.style.display = 'none';
        }
    }, 300);
}

function updateCartBadges(count) {
    const sideBadge = document.getElementById('sidebarCartCount');
    const navBadge = document.getElementById('cartBadge');
    const genericBadge = document.querySelector('.cart-count-badge');
    
    [sideBadge, navBadge, genericBadge].forEach(badge => {
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
}

function updateNotifBadges(count) {
    const navNotifBadge = document.getElementById('custNotifBadge') || document.getElementById('notifUnreadCount');
    const sideNotifBadge = document.getElementById('sidebarNotifCount');
    
    [navNotifBadge, sideNotifBadge].forEach(badge => {
        if (badge) {
            if (count > 0) {
                badge.style.display = 'flex';
                badge.textContent = count > 99 ? '99+' : count;
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

async function getUserName(user) {
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return null;
        const data = snap.data();
        return data.name || data.fullName || data.username || null;
    } catch (e) { return null; }
}

onAuthStateChanged(auth, async (user) => {
    const loginBlock = document.getElementById('sidebarLoginBlock');
    const userBlock = document.getElementById('sidebarUserBlock');
    const userNameEl = document.getElementById('sidebarUserName');

    if (cartUnsub) cartUnsub();
    if (notifUnsub) notifUnsub();

    if (user) {
        if (loginBlock) loginBlock.style.display = 'none';
        if (userBlock) userBlock.style.display = 'flex';
        const name = await getUserName(user);
        if (userNameEl) userNameEl.textContent = name ? `Hello, ${name}!` : "Hello!";

        cartUnsub = onSnapshot(collection(db, 'users', user.uid, 'cart'), (snap) => {
            updateCartBadges(snap.size);
        });

        const notifQuery = query(
            collection(db, 'notifications'),
            where('role', '==', 'customer'),
            where('userId', '==', user.uid),
            where('isRead', '==', false)
        );
        notifUnsub = onSnapshot(notifQuery, (snap) => {
            updateNotifBadges(snap.size);
        });
    } else {
        if (loginBlock) loginBlock.style.display = 'flex';
        if (userBlock) userBlock.style.display = 'none';
        updateCartBadges(0);
        updateNotifBadges(0);
    }
});

function attachListeners() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    const overlay = document.getElementById('sidebarOverlay');

    if (hamburgerBtn) hamburgerBtn.onclick = (e) => { e.preventDefault(); openSidebar(); };
    if (overlay) overlay.onclick = closeSidebar;
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.onclick = closeSidebar;
    });

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await signOut(auth);
            window.location.href = 'login.html';
        };
    }
}

const injectionObserver = new MutationObserver(() => {
    if (document.getElementById('navSidebar')) {
        attachListeners();
        injectionObserver.disconnect();
    }
});
injectionObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('popstate', () => { if (isSidebarOpen) closeSidebar(); });

window.handleAddTocart = async function(productData) {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to add items to your cart.");
        return;
    }
    try {
        await addDoc(collection(db, 'users', user.uid, 'cart'), {
            ...productData,
            addedAt: serverTimestamp() 
        });
        if (typeof showCheckoutToast === 'function') showCheckoutToast("Item added to cart!");
    } catch (error) {
        console.error("Cart error:", error);
    }
};