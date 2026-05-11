import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword,  updateProfile,  sendEmailVerification,  onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.1/firebase-auth.js";
import {  doc,  setDoc } from "https://www.gstatic.com/firebasejs/12.11.1/firebase-firestore.js";
import { showToast } from './toast-util.js';

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
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
    const modal           = document.getElementById("termsModal");
    const openTermsBtn    = document.getElementById("openTerms");
    const acceptTermsBtn  = document.getElementById("acceptTerms");
    const registerBtn     = document.getElementById("registerBtn");

    if (registerBtn) {
        registerBtn.disabled = true;
        registerBtn.style.opacity = "0.5";
        registerBtn.style.cursor = "not-allowed";
    }

    if (openTermsBtn && modal) {
        openTermsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); 
            modal.style.display = "flex";
            modal.classList.add('active');
        });
    }

    if (acceptTermsBtn && modal) {
        acceptTermsBtn.addEventListener('click', () => {
            modal.style.display = "none";
            modal.classList.remove('active');
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.style.opacity = "1";
                registerBtn.style.cursor = "pointer";
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
            modal.classList.remove('active');
        }
    });

    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    });

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
            { label: 'Weak', color: '#e53935', width: '25%' },
            { label: 'Fair', color: '#fb8c00', width: '50%' },
            { label: 'Good', color: '#fdd835', width: '75%' },
            { label: 'Strong', color: '#43a047', width: '100%' },
        ];

        const level = levels[Math.min(score, 4)];
        strengthFill.style.width = level.width;
        strengthFill.style.backgroundColor = level.color;
        strengthLabel.textContent = level.label ? `Password strength: ${level.label}` : '';
        checkMatch();
    });

    function checkMatch() {
        const p = passwordInput.value;
        const c = confirmInput.value;
        if (!c) {
            matchMsg.textContent = '';
            return;
        }
        if (p === c) {
            matchMsg.textContent = '✓ Passwords match';
            matchMsg.className = 'match-msg ok';
        } else {
            matchMsg.textContent = '✗ Passwords do not match';
            matchMsg.className = 'match-msg error';
        }
    }

    confirmInput.addEventListener('input', checkMatch);

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
        registerBtn.textContent = "SENDING VERIFICATION...";

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, { displayName: name });

            await setDoc(doc(db, "users", user.uid), {
                full_name: name,
                email: email,
                role: "Customer",
                password_length: password.length,
                created_at: new Date().toISOString()
            });

            await sendEmailVerification(user);
            
            showToast("Account created! Please verify your email at " + email + " before logging in.");
            
            await signOut(auth);
            window.location.href = "login.html";

        } catch (error) {
            registerBtn.disabled = false;
            registerBtn.textContent = "CREATE ACCOUNT";
            showToast("Registration failed: " + error.message);
        }
    });
});
