import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

export function initAdminHeader() {
    const mobileMenuBtn = document.getElementById('admMobileMenuBtn');
    const sidebar = document.getElementById('admSidebar');
    const overlay = document.getElementById('admOverlay');
    const closeBtn = document.getElementById('admSidebarClose');
    const notifBadge = document.getElementById('notifUnreadCount');

    const qUnread = query(
        collection(db, 'notifications'),
        where('role', '==', 'admin'),
        where('isRead', '==', false)
    );

    onSnapshot(qUnread, (snapshot) => {
        const unreadCount = snapshot.size;

        if (notifBadge) {
            if (unreadCount > 0) {
                notifBadge.style.display = 'flex';
                notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            } else {
                // Hide badge if zero
                notifBadge.style.display = 'none';
                notifBadge.textContent = '';
            }
        }
    }, (error) => console.error("Error fetching unread count:", error));

    const openSidebar = () => {
        if (sidebar) sidebar.classList.add('is-open');
        if (overlay) overlay.classList.add('is-visible');
        if (mobileMenuBtn) mobileMenuBtn.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    };

    const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove('is-open');
        if (overlay) overlay.classList.remove('is-visible');
        if (mobileMenuBtn) mobileMenuBtn.classList.remove('is-open');
        document.body.style.overflow = '';
    };

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.onclick = () => {
            const isOpen = sidebar.classList.contains('is-open');
            if (isOpen) closeSidebar(); else openSidebar();
        };
    }

    if (closeBtn) closeBtn.onclick = closeSidebar;
    if (overlay) overlay.onclick = closeSidebar;

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            closeSidebar(); 
        }
    });
}