import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCFcsHkmdvHVQe7QaldueQB57W3QEsPtXM",
    authDomain: "bakeking-mfs.firebaseapp.com",
    projectId: "bakeking-mfs",
    storageBucket: "bakeking-mfs.firebasestorage.app",
    messagingSenderId: "868325229649",
    appId: "1:868325229649:web:ac206e920e197e8beb2470",
    measurementId: "G-K5RX86Z33H"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);