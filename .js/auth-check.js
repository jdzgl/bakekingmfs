import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let isUserLoggedIn = false;

async function handleRouting(user) {
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        if (userDoc.exists() && userData.role === 'Admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'homepage.html';
        }
    } catch (error) {
        console.error("Routing Error:", error);
        window.location.href = 'homepage.html';
    }
}

async function updateUI(user) {
    try {
        const notification = document.querySelector(".notification-content");
        const headerElement = document.querySelector("header");
        const mainSection = document.querySelector("main");
        const placeholder = document.getElementById("header-placeholder");

        if (user && user.emailVerified) {
            isUserLoggedIn = true;
            if (notification) notification.classList.remove("is-active");

            if (headerElement) headerElement.style.height = "100px";
            if (placeholder) placeholder.style.height = "100px";
            
            console.log("UI: User logged in");
        } else {
            isUserLoggedIn = false;
            if (notification) {
                notification.classList.add("is-active");
            }
            if (headerElement) headerElement.style.height = "100px";
            if (placeholder) placeholder.style.height = "100px";
            
            console.log("UI: Guest mode active");
        }
    } catch (error) {
        console.error("UI Update Error:", error);
    }
}

const runAuthLogic = async (user) => {
    try {
        const currentPage = window.location.pathname;
        const isAuthPage = currentPage.includes("login.html") || currentPage.includes("register.html");
        if (user && user.emailVerified) {
            if (isAuthPage) await handleRouting(user);
            else await updateUI(user);
        } else {
            await updateUI(null);
        }
    } catch (error) {
        console.error("Auth Logic Error:", error);
    }
};

window.addEventListener('componentsInjected', () => {
    onAuthStateChanged(auth, async (user) => {
        await runAuthLogic(user);
    });
});

onAuthStateChanged(auth, async (user) => {
    await runAuthLogic(user);
});

document.addEventListener('DOMContentLoaded', () => {
    const protectRoute = (e) => {
        if (!isUserLoggedIn) {
            e.preventDefault();
            window.location.href = "login.html";
        }
    };

    const productArticles = document.querySelectorAll('.product-grid');
    productArticles.forEach(article => {
        article.style.cursor = 'pointer';
        article.addEventListener('click', protectRoute);
    });

    const heroOrderBtn = document.querySelector(".hero-button");
    if (heroOrderBtn) heroOrderBtn.addEventListener("click", protectRoute);

    const cartIcon = document.querySelector(".cart-wrapper");
    const profileIcon = document.querySelector(".prof-icon");
    if (cartIcon) cartIcon.addEventListener("click", protectRoute);
    if (profileIcon) profileIcon.addEventListener("click", protectRoute);

    window.addEventListener('componentsInjected', () => {
        const orderLinks = document.querySelectorAll('a[href*="order-now.html"]');
        orderLinks.forEach(link => link.addEventListener("click", protectRoute));
        
        const dynamicCart = document.querySelector(".cart-wrapper");
        const dynamicProf = document.querySelector(".prof-icon");
        if (dynamicCart) dynamicCart.addEventListener("click", protectRoute);
        if (dynamicProf) dynamicProf.addEventListener("click", protectRoute);
    });
});