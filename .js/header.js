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
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if (!sidebar || !overlay) return;

    sidebar.style.display = 'flex';
    overlay.style.display = 'block';
    
    requestAnimationFrame(() => {
        sidebar.classList.add('is-open');
        overlay.classList.add('is-visible');
        
        // Dynamic accessibility state overrides
        sidebar.removeAttribute('inert');
        sidebar.setAttribute('aria-hidden', 'false');
        
        if (hamburgerBtn) {
            hamburgerBtn.classList.add('is-open');
            hamburgerBtn.setAttribute('aria-expanded', 'true');
        }
        
        document.body.style.overflow = 'hidden';
        isSidebarOpen = true;

        // Shift user focus rules natively inside the viewport frame safely
        if (closeSidebarBtn) closeSidebarBtn.focus();
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
    
    // Completely hide the tree from background screen-reader loops
    sidebar.setAttribute('inert', '');
    sidebar.setAttribute('aria-hidden', 'true');
    
    if (hamburgerBtn) {
        hamburgerBtn.classList.remove('is-open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        hamburgerBtn.focus(); // Return mechanical context focus safely
    }
    
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
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    const logoutDivider = document.getElementById('logoutDivider');

    if (cartUnsub) cartUnsub();
    if (notifUnsub) notifUnsub();

    if (user) {
        if (loginBlock) loginBlock.style.display = 'none';
        if (userBlock) userBlock.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (logoutDivider) logoutDivider.style.display = 'block';
        
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
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (logoutDivider) logoutDivider.style.display = 'none';
        
        updateCartBadges(0);
        updateNotifBadges(0);
    }
});

function attachListeners() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('navSidebar');

    // Initialize raw baseline closed accessibility attributes accurately
    if (sidebar && !sidebar.classList.contains('is-open')) {
        sidebar.setAttribute('inert', '');
        sidebar.setAttribute('aria-hidden', 'true');
    }

    if (hamburgerBtn) hamburgerBtn.onclick = (e) => { e.preventDefault(); openSidebar(); };
    if (closeSidebarBtn) closeSidebarBtn.onclick = (e) => { e.preventDefault(); closeSidebar(); };
    if (overlay) overlay.onclick = closeSidebar;
    
    document.querySelectorAll('.sidebar-link').forEach(link => {
        // Prevent breaking logout processing handlers accidentally
        if (!link.classList.contains('sidebar-logout-btn')) {
            link.onclick = closeSidebar;
        }
    });

    if (logoutBtn) {
        logoutBtn.onclick = async (e) => {
            e.preventDefault();
            closeSidebar();
            await signOut(auth);
            window.location.href = 'login.html';
        };
    }
}

// Watch DOM mutations to bind dynamic interactive triggers instantly
const injectionObserver = new MutationObserver(() => {
    if (document.getElementById('navSidebar')) {
        attachListeners();
        injectionObserver.disconnect();
    }
});
injectionObserver.observe(document.body, { childList: true, subtree: true });

// Listen for browser navigation changes or ESC key closures
window.addEventListener('popstate', () => { if (isSidebarOpen) closeSidebar(); });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSidebarOpen) closeSidebar();
});

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
        console.error("Cart registration error:", error);
    }
};