import { db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc, collectionGroup, query, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { signOut, updatePassword, updateEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { showToast } from './toast-util.js';

window.toggleEdit = async function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const isDisabled = input.disabled;

    if (isDisabled) {
        input.disabled = false;
        input.focus();
        input.classList.add('editing');
    } else {
        const success = await saveProfileData(inputId, input.value);
        if (success !== false) {
            input.disabled = true;
            input.classList.remove('editing');
        }
    }
};

async function saveProfileData(fieldId, value) {
    const user = auth.currentUser;
    if (!user) return false;

    try {
        const adminRef = doc(db, 'users', user.uid);

        if (fieldId === 'profileName') {
            await updateDoc(adminRef, { fullName: value });
            showToast("Name updated successfully!");
        } 
        else if (fieldId === 'profileEmail') {
            await updateEmail(user, value);
            await updateDoc(adminRef, { email: value });
            showToast("Email updated!");
        } 
        else if (fieldId === 'profilePassword') {
            if (value.length < 6) {
                showToast("Password must be at least 6 characters.");
                return false;
            }
            await updatePassword(user, value);
            showToast("Password updated!");
            document.getElementById('profilePassword').value = ""; 
        }
    } catch (error) {
        console.error("Update error:", error);
        showToast("Update failed: " + error.message);
        return false;
    }
}

async function loadAdminData() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const docSnap = await getDoc(doc(db, 'users', user.uid));
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                if (document.getElementById('profileName')) document.getElementById('profileName').value = data.fullName || '';
                if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = data.email || user.email;
                
                const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(user.metadata.creationTime);
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                if (document.getElementById('accountCreatedDate')) {
                    document.getElementById('accountCreatedDate').textContent = createdAt.toLocaleDateString(undefined, options);
                }
                
                const ordersRef = collectionGroup(db, 'orders');
                const snapshot = await getCountFromServer(ordersRef);
                if (document.getElementById('totalOrdersManaged')) {
                    document.getElementById('totalOrdersManaged').textContent = snapshot.data().count || 0;
                }
            }
        } catch (error) {
            console.error("Load error:", error);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadAdminData();

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await signOut(auth);
            window.location.href = 'login.html';
        };
    }
});