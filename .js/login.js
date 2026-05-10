import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword,  sendPasswordResetEmail,  onAuthStateChanged,  signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc,  getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname;
    
    if (user && user.emailVerified) {
        try {
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const isAdmin = userData.role === "Admin";
                
                if (isAdmin && !currentPage.includes("admin-dashboard.html")) {
                    window.location.href = "admin-dashboard.html";
                } else if (!isAdmin && (currentPage.includes("login.html") || currentPage.includes("register.html"))) {
                    window.location.href = "homepage.html";
                }
            }
        } catch (error) {
            console.error("Auth Error:", error);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("termsModal");
    const openBtn = document.getElementById("openTerms");
    const acceptBtn = document.getElementById("acceptTerms");
    const loginBtn = document.getElementById("loginBtn");
    const loginForm = document.getElementById("loginForm");
    const forgotLink = document.querySelector(".forgot-link");
    const rememberMeCheckbox = document.querySelector("input[name='remember']");

    if (openBtn && modal) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = "flex"; 
            modal.classList.add('active');
        });
    }

    if (acceptBtn && modal) {
        acceptBtn.addEventListener('click', () => {
            modal.style.display = "none";
            modal.classList.remove('active');
            loginBtn.disabled = false;
            loginBtn.classList.remove('disabled');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;

            try {
                const persistenceType = (rememberMeCheckbox && rememberMeCheckbox.checked) 
                    ? browserLocalPersistence 
                    : browserSessionPersistence;

                await setPersistence(auth, persistenceType);
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                if (!user.emailVerified) {
                    showToast("Please verify your email to log in.");
                    await signOut(auth);
                    return;
                }

                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists() && userDoc.data().role === "Admin") {
                    window.location.href = "admin-dashboard.html";
                } else {
                    window.location.href = "homepage.html";
                }
            } catch (error) {
                showToast("Login failed: " + error.message);
            }
        });
    }

    if (forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById("email").value.trim();
            if (!email) {
                showToast("Please enter your email address first.");
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                showToast("Password reset email sent!");
            } catch (error) {
                showToast("Error: " + error.message);
            }
        });
    }
});