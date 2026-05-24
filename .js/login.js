import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword,  
    sendPasswordResetEmail,  
    onAuthStateChanged,  
    signOut, 
    setPersistence, 
    browserLocalPersistence, 
    browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

/* ==========================================================================
   SECURE COMPREHENSIVE ROUTING ENGINE
   ========================================================================== */
onAuthStateChanged(auth, async (user) => {
    // Standardize URL paths to prevent partial match routing leaks
    const currentPath = window.location.pathname.split('/').pop() || "index.html";
    
    if (user && user.emailVerified) {
        try {
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const isAdmin = userData.role === "Admin";
                
                if (isAdmin) {
                    // Route admins safely if they land anywhere outside the dashboard
                    if (currentPath !== "admin-dashboard.html") {
                        window.location.replace("admin-dashboard.html");
                    }
                } else {
                    // Prevent standard consumers from remaining on entry portals
                    if (currentPath === "login.html" || currentPath === "register.html") {
                        window.location.replace("index.html");
                    }
                }
            }
        } catch (error) {
            console.error("Secure Routing Fault:", error);
        }
    }
});

/* ==========================================================================
   DOM INTERACTIVE INTERFACE HANDLERS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Structural Interactivity Nodes
    const modal = document.getElementById("termsModal");
    const openBtn = document.getElementById("openTerms");
    const closeBtn = document.querySelector(".modal-close-btn");
    const acceptBtn = document.getElementById("acceptTerms");
    const loginBtn = document.getElementById("loginBtn");
    const loginForm = document.getElementById("loginForm");
    const forgotLink = document.querySelector(".forgot-link");
    const rememberMeCheckbox = document.querySelector("input[name='remember']");
    const passwordInput = document.getElementById("password");
    const passwordToggle = document.querySelector(".pw-toggle");

    // Capture standard original layout inner buttons components for text/spinner syncing
    const btnText = loginBtn ? loginBtn.querySelector(".btn-text") : null;
    const btnArrow = loginBtn ? loginBtn.querySelector(".btn-arrow") : null;

    /* ── TEXT VISIBILITY TOGGLE CONTROLLER ─────────────────────── */
    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', (e) => {
            e.preventDefault(); // Stop layout row container frame focus shifting
            const isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");
            
            // Adjust SVG paths based on view states or change text string representation
            passwordToggle.style.color = isPassword ? "var(--orange)" : "var(--gray)";
        });
    }

    /* ── SYSTEM POLICY MODAL HOOKS ─────────────────────────────── */
    const openModal = (e) => {
        if (e) e.preventDefault();
        if (!modal) return;

        // 1. Break inline style blocker layout structure
        modal.style.display = 'flex';
        
        // 2. Trigger microtask window loop processing to let display clear so transitions fire smoothly
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);

        // 3. Clear accessibility wrappers and lock background scroll
        modal.removeAttribute('inert');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        if (!modal) return;

        // 1. Transition scale/opacity metrics away
        modal.classList.remove('active');
        
        // 2. Restore global window accessibility conditions
        modal.setAttribute('inert', '');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // 3. Keep layout structure running till CSS 350ms window transition completes cleanly
        setTimeout(() => {
            modal.style.display = 'none';
        }, 350);
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    // Close modal if user clicks anywhere outside the main modal boundaries
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            closeModal();
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.classList.remove('disabled');
            }
        });
    }

    /* ── AUTHENTICATION SUBMISSION HANDLING ─────────────────────── */
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById("email").value.trim();
            const password = passwordInput ? passwordInput.value : '';

            // Guard Statement: Enforce strict verification of Policy Terms acknowledgment
            if (loginBtn && loginBtn.disabled) {
                showToast("You must accept the Terms and Conditions to proceed.");
                return;
            }

            // Visual Processing Loader States Injection
            setFormLoading(true, "VERIFYING...");

            try {
                // Persistent Context Evaluation Block
                const persistenceType = (rememberMeCheckbox && rememberMeCheckbox.checked) 
                    ? browserLocalPersistence 
                    : browserSessionPersistence;

                await setPersistence(auth, persistenceType);
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                if (!user.emailVerified) {
                    showToast("Please check your inbox and verify your email address.");
                    setFormLoading(false);
                    await signOut(auth);
                    return;
                }

                // Verify Database Context Rules Matrix
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists() && userDoc.data().role === "Admin") {
                    window.location.href = "admin-dashboard.html";
                } else {
                    window.location.href = "index.html";
                }
            } catch (error) {
                setFormLoading(false);
                handleAuthErrors(error);
            }
        });
    }

    /* ── ASYNC PASSWORD RECOVERY SYSTEM (WITH SAME-TAB REDIRECT SETTINGS) ── */
    if (forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById("email");
            const email = emailInput ? emailInput.value.trim() : '';
            
            if (!email) {
                showToast("Please enter your email address in the field above first.");
                if (emailInput) emailInput.focus();
                return;
            }
            
            // Set main submit button to a loading state to indicate background processing
            setFormLoading(true, "SENDING RESET...");
            
            try {
                // FIX: Define action settings to tell Firebase where the "Continue" button should link
                const actionCodeSettings = {
                    // Points the email page's continue button straight back to your login portal
                    url: window.location.origin + '/login.html',
                    handleCodeInApp: false
                };

                // Pass the redirect settings config directly into the reset method
                await sendPasswordResetEmail(auth, email, actionCodeSettings);
                showToast("Password recovery link sent! Check your email inbox.");
                
                // Keep button disabled briefly to show completed state message change
                if (btnText) btnText.textContent = "LINK SENT ✓";
                setTimeout(() => {
                    setFormLoading(false);
                }, 3000);

            } catch (error) {
                setFormLoading(false);
                handleAuthErrors(error);
            }
        });
    }

    /* ── AUXILIARY FORM VIEW STATE GRAPHIC HELPERS ──────────────── */
    function setFormLoading(isLoading, customText = "LOG IN") {
        if (!loginBtn) return;
        
        if (isLoading) {
            loginBtn.disabled = true;
            loginBtn.style.cursor = "wait";
            if (btnText) btnText.textContent = customText;
            if (btnArrow) {
                // Replace standard inline arrow element with loading spinner engine matching CSS specs
                btnArrow.style.display = "none";
                
                // Only create spinner if one doesn't exist yet
                if (!loginBtn.querySelector(".btn-spinner")) {
                    const spinner = document.createElement("div");
                    spinner.className = "btn-spinner";
                    loginBtn.appendChild(spinner);
                }
            }
        } else {
            loginBtn.disabled = false;
            loginBtn.style.cursor = "pointer";
            if (btnText) btnText.textContent = "LOG IN";
            if (btnArrow) btnArrow.style.display = "block";
            const activeSpinner = loginBtn.querySelector(".btn-spinner");
            if (activeSpinner) activeSpinner.remove();
        }
    }

    function handleAuthErrors(error) {
        console.error("Firebase Core Exception:", error);
        let humanizedMessage = "An unexpected connection error occurred.";
        
        switch (error.code) {
            case "auth/invalid-email":
                humanizedMessage = "The email address layout format is invalid.";
                break;
            case "auth/user-disabled":
                humanizedMessage = "This user system file access protocol has been suspended.";
                break;
            case "auth/user-not-found":
            case "auth/wrong-password":
            case "auth/invalid-credential":
                humanizedMessage = "Invalid account logging credentials.";
                break;
            case "auth/too-many-requests":
                humanizedMessage = "Access locked due to excessive attempts. Try again later.";
                break;
        }
        showToast(humanizedMessage);
    }
});