import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

export async function createNotification(data) {
    try {
        await addDoc(collection(db, "notifications"), {
            userId: data.userId || 'admin_general',
            type: data.type,
            title: data.title,
            message: data.message,
            orderId: data.orderId,
            productName: data.productName || '',
            role: data.role, 
            isRead: false,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
}