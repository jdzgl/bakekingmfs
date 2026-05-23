import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast } from './toast-util.js';

document.addEventListener('DOMContentLoaded', () => {
    handleNewsletter();
    handleProductNavigation();
    fetchProductReviews();
    handleScrollAnimations();
});

async function fetchProductReviews() {
    const reviewsContainer = document.querySelector('.reviews-container');
    if (!reviewsContainer) return;

    try {
        const productsSnapshot = await getDocs(collection(db, "products"));
        let allReviews = [];

        const reviewPromises = productsSnapshot.docs.map(async (productDoc) => {
            const reviewsRef = collection(db, `products/${productDoc.id}/reviews`);
            const q = query(reviewsRef, orderBy("timestamp", "desc"), limit(6));
            const reviewSnap = await getDocs(q);
            return reviewSnap.docs.map(doc => doc.data());
        });

        const reviewsResults = await Promise.all(reviewPromises);
        allReviews = reviewsResults.flat();

        if (allReviews.length > 0) {
            reviewsContainer.innerHTML = '';
            
            allReviews.sort((a, b) => {
                const timeB = b.timestamp?.seconds || 0;
                const timeA = a.timestamp?.seconds || 0;
                return timeB - timeA;
            });

            const displayReviews = allReviews.slice(0, 6);

            displayReviews.forEach(review => {
                const card = document.createElement('article');
                card.className = 'review-card';
                const stars = '★'.repeat(review.rating || 5);
                
                card.innerHTML = `
                    <div class="stars">${stars}</div>
                    <h3>${review.userName || "Verified Buyer"}</h3>
                    <p>"${review.comment || review.text || ""}"</p>
                `;
                reviewsContainer.appendChild(card);
            });
        }
    } catch (error) {
        console.error("Subcollection Fetch Exception:", error);
    }
}

async function handleNewsletter() {
    const newsletterForm = document.querySelector('#newsletter form');
    if (!newsletterForm) return;

    newsletterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = newsletterForm.querySelector('input[type="email"]');
        const email = emailInput.value.trim();
        const button = newsletterForm.querySelector('button');

        try {
            button.disabled = true;
            await addDoc(collection(db, "subscribers"), {
                email: email,
                timestamp: serverTimestamp()
            });

            showToast("Welcome to Bake KING! 👑", "success");
            emailInput.value = "";
        } catch (error) {
            console.error("Newsletter Error:", error);
            showToast("Oops! Something went wrong.", "error");
        } finally {
            button.disabled = false;
        }
    });
}

function handleProductNavigation() {
    const productArticles = document.querySelectorAll('.product-grid article, .category-card');
    
    productArticles.forEach(article => {
        article.addEventListener('click', () => {
            if (article.classList.contains('view-more-card')) {
                window.location.href = 'order-now.html';
                return;
            }

            let categorySlug = '';

            if (article.classList.contains('ovens-card')) {
                categorySlug = 'Ovens';
            } else if (article.classList.contains('mixers-card')) {
                categorySlug = 'Mixers';
            } else if (article.classList.contains('rollers-card')) {
                categorySlug = 'Rollers'; 
            } else if (article.classList.contains('packages-card')) {
                categorySlug = 'Packages';
            } else {
                const h3Element = article.querySelector('h3');
                if (!h3Element) return;
                const text = h3Element.textContent.trim().toLowerCase();
                categorySlug = text.includes('&') ? text.split('&')[1].trim() : text;
            }

            window.location.href = `shop.html?category=${encodeURIComponent(categorySlug)}`;
        });
    });
}

function handleScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    const checkInterval = setInterval(() => {
        const elements = document.querySelectorAll('.product-grid article, .review-card, #newsletter');
        if (elements.length > 0) {
            elements.forEach(el => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(30px)';
                el.style.transition = 'all 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)';
                observer.observe(el);
            });
            clearInterval(checkInterval);
        }
    }, 100);
}