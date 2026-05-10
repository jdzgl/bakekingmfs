import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const emailInput = document.getElementById('profileEmail');
        if (emailInput) emailInput.value = user.email;
        
        const displayEl = document.getElementById('displayUserName');
        if (displayEl) displayEl.textContent = user.email.split('@')[0].toUpperCase();
        
        await loadUserData(user.uid);
    } else {
        window.location.href = 'bakeking_login.html';
    }
});

async function loadUserData(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        
        if (snap.exists()) {
            const data = snap.data();

            const nameInput = document.getElementById('profileName');
            if (nameInput && data.name) nameInput.value = data.name;

            const passInput = document.getElementById('profilePassword');
            if (passInput) {
                const len = data.passwordLength || 8; 
                passInput.value = "•".repeat(len);
            }
        }
    } catch (e) {
        console.error("Error loading profile:", e);
    }
}

async function reauth() {
    const currentPassword = prompt("Please enter your current password to confirm changes:");
    if (!currentPassword) throw new Error("Re-authentication cancelled.");
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
}

async function saveToFirestore(data) {
    await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });
}

window.toggleEdit = async function(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    
    const isLocked = input.disabled;

    if (isLocked) {
        input.disabled = false;

        if (fieldId === 'profilePassword') {
            input.value = ""; 
            input.placeholder = "Enter new password";
        }
        
        input.focus();
        input.classList.add('editing');

        input.onkeydown = async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await saveField(fieldId, input.value.trim());
            }
        };
    } else {
        await saveField(fieldId, input.value.trim());
    }
};

async function saveField(fieldId, value) {
    if (!currentUser) return;
    const input = document.getElementById(fieldId);

    try {
        if (fieldId === 'profileEmail') {
            if (!value || value === currentUser.email) {
                lockField(input, currentUser.email);
                return;
            }
            await reauth();
            await updateEmail(currentUser, value);
            await saveToFirestore({ email: value });
            lockField(input, value);
            showToast("Email updated successfully!");
        }

        else if (fieldId === 'profilePassword') {
            if (!value) {
                const snap = await getDoc(doc(db, "users", currentUser.uid));
                const len = snap.exists() ? (snap.data().passwordLength || 8) : 8;
                lockField(input, "•".repeat(len));
                return;
            }

            if (value.length < 6) {
                showToast("Password must be at least 6 characters.");
                return;
            }

            await reauth();
            await updatePassword(currentUser, value);

            await saveToFirestore({ 
                passwordLength: value.length 
            });

            lockField(input, "•".repeat(value.length));
            showToast("Password updated successfully!");
        }

    } catch (e) {
        console.error(`Error:`, e);
        handleAuthErrors(e);
        await loadUserData(currentUser.uid);
    }
}

function lockField(input, finalValue) {
    input.value = finalValue;
    input.disabled = true;
    input.onkeydown = null;
    input.classList.remove('editing');
}

function handleAuthErrors(e) {
    const errorMap = {
        'auth/requires-recent-login': "Session expired. Please log out and back in.",
        'auth/email-already-in-use': "This email is already registered.",
        'auth/wrong-password': "Current password incorrect.",
        'auth/weak-password': "Password is too weak."
    };
    
    if (e.message === "Re-authentication cancelled.") {
        showToast("Update cancelled.");
    } else {
        showToast(errorMap[e.code] || "Update failed: " + e.message);
    }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = 'login.html');
    });
}