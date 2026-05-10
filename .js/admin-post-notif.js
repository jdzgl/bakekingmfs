import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

async function submitGeneralAnnouncement() {
    const titleInput = document.getElementById('postNotifTitle');
    const messageInput = document.getElementById('postNotifMessage');
    const btn = document.getElementById('submitPostBtn');

    if (!titleInput.value.trim() || !messageInput.value.trim()) {
        showToast("Please fill in all fields");
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = "POSTING...";

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("role", "==", "customer"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showToast("No customers found");
            return;
        }

        const promises = querySnapshot.docs.map(userDoc => {
            return addDoc(collection(db, 'notifications'), {
                type: 'general',
                title: titleInput.value.trim(),
                message: messageInput.value.trim(),
                createdAt: serverTimestamp(),
                role: 'customer',
                isRead: false,
                userId: userDoc.id,
                orderId: '',
                productName: ''
            });
        });

        await Promise.all(promises);

        showToast(`Announcement posted to ${querySnapshot.size} customers!`);
        closePostModal();
    } catch (error) {
        console.error("Firebase Error:", error);
        showToast("Failed to post announcement");
    } finally {
        btn.disabled = false;
        btn.textContent = "Post to Customers";
    }
}

function openPostModal() {
    document.getElementById('postNotifModal').classList.remove('pdm-hidden');
}

function closePostModal() {
    document.getElementById('postNotifModal').classList.add('pdm-hidden');
    document.getElementById('postNotifTitle').value = '';
    document.getElementById('postNotifMessage').value = '';
}

window.openPostModal = openPostModal;
window.closePostModal = closePostModal;
window.submitGeneralAnnouncement = submitGeneralAnnouncement;