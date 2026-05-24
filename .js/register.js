import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword,  updateProfile,  sendEmailVerification,  onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {  doc,  setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

let verificationInterval = null;

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        if (verificationInterval) clearInterval(verificationInterval);
        window.location.href = "index.html";
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const registerForm    = document.getElementById("registerForm");
    const passwordInput   = document.getElementById("password");
    const confirmInput    = document.getElementById("confirmPassword");
    const strengthFill    = document.getElementById("strengthFill");
    const strengthLabel   = document.getElementById("strengthLabel");
    const matchMsg        = document.getElementById("matchMsg");
    
    // Modal Interaction Element Bindings
    const modal           = document.getElementById("termsModal");
    const openTermsBtn    = document.getElementById("openTerms");
    const acceptTermsBtn  = document.getElementById("acceptTerms");
    const closeTermsBtn   = document.getElementById("closeTermsBtn");
    const registerBtn     = document.getElementById("registerBtn");

    if (registerBtn) {
        registerBtn.disabled = true;
    }

    // Open Modal Action
    if (openTermsBtn && modal) {
        openTermsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); 
            modal.style.display = "flex";
            modal.classList.add('active');
            modal.removeAttribute('inert');
            modal.setAttribute('aria-hidden', 'false');
        });
    }

    function closeModal() {
        if (modal) {
            modal.style.display = "none";
            modal.classList.remove('active');
            modal.setAttribute('inert', '');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    // Accept Terms Action Button Event Handler
    if (acceptTermsBtn) {
        acceptTermsBtn.addEventListener('click', () => {
            closeModal();
            if (registerBtn) {
                registerBtn.disabled = false;
            }
        });
    }

    // Close Escape Trigger Component Button Click Hook ('X')
    if (closeTermsBtn) {
        closeTermsBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    // Backdrop Click Dismissal Check Loop
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Password view toggle eye icon engines
    document.querySelectorAll('.pw-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
            }
        });
    });

    // Password Validation Matrix Calculation Loops
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const val = passwordInput.value;
            let score = 0;
            if (val.length >= 6) score++;
            if (val.length >= 10) score++;
            if (/[A-Z]/.test(val)) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            const levels = [
                { label: '', color: 'transparent', width: '0%' },
                { label: 'Weak', color: '#D93838', width: '25%' },   
                { label: 'Fair', color: '#fb8c00', width: '50%' },
                { label: 'Good', color: '#FFB347', width: '75%' },   
                { label: 'Strong', color: '#43a047', width: '100%' },
            ];

            const level = levels[Math.min(score, 4)];
            if (strengthFill) {
                strengthFill.style.width = level.width;
                strengthFill.style.backgroundColor = level.color;
            }
            if (strengthLabel) {
                strengthLabel.textContent = level.label ? `Password strength: ${level.label}` : '';
            }
            checkMatch();
        });
    }

    function checkMatch() {
        if (!passwordInput || !confirmInput || !matchMsg) return;
        
        const p = passwordInput.value;
        const c = confirmInput.value;
        if (!c) {
            matchMsg.textContent = '';
            return;
        }
        if (p === c) {
            matchMsg.textContent = '✓ Passwords match';
            matchMsg.style.color = '#43a047';
        } else {
            matchMsg.textContent = '✗ Passwords do not match';
            matchMsg.style.color = 'var(--system-red)';
        }
    }

    if (confirmInput) {
        confirmInput.addEventListener('input', checkMatch);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById("name").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;

            if (password !== confirmPassword) {
                showToast("Passwords do not match.");
                return;
            }

            registerBtn.disabled = true;
            const btnText = registerBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = "CREATING ACCOUNT...";

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update user display profile name details
                await updateProfile(user, { displayName: name });

                await setDoc(doc(db, "users", user.uid), {
                    full_name: name,
                    email: email,
                    role: "Customer",
                    password_length: password.length,
                    created_at: new Date().toISOString()
                });


                const actionCodeSettings = {
                    url: window.location.origin + '/login.html', 
                    handleCodeInApp: false
                };

                // Pass the settings into your email verification method
                await sendEmailVerification(user, actionCodeSettings);
                
                showToast("Account created! Please verify your email to continue.");
                
                // Update button text to visually hint that the system is listening
                if (btnText) btnText.textContent = "AWAITING EMAIL VERIFICATION...";
                registerBtn.style.cursor = "wait";

                // METHOD 1: Start background polling listener matrix
                verificationInterval = setInterval(async () => {
                    try {
                        // Force Firebase to sync with the server to check for updated confirmation states
                        await user.reload();
                        
                        if (user.emailVerified) {
                            clearInterval(verificationInterval); // Kill the background worker thread loops
                            showToast("Email successfully verified! Redirecting to login...");
                            
                            // Sign them out locally so they start their session with a clean authentication trace
                            await signOut(auth);
                            
                            setTimeout(() => {
                                window.location.href = "login.html";
                            }, 2500);
                        }
                    } catch (reloadError) {
                        console.error("Error checking verification state background trace:", reloadError);
                    }
                }, 3000); // Polls status metrics securely every 3 seconds

            } catch (error) {
                registerBtn.disabled = false;
                if (btnText) btnText.textContent = "CREATE ACCOUNT";
                registerBtn.style.cursor = "pointer";
                showToast("Registration failed: " + error.message);
            }
        });
    }
});