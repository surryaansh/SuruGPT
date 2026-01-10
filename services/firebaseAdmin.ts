import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

let adminApp: AdminApp;
const serviceAccountString = process.env.FIREBASE_ADMIN_SDK_CONFIG;

if (serviceAccountString) {
    try {
        const serviceAccount = JSON.parse(serviceAccountString);
        if (!getApps().length) {
            adminApp = initializeApp({ credential: cert(serviceAccount) });
        } else {
            adminApp = getApps()[0];
        }
    } catch (e: any) {
        console.error("Firebase Admin SDK Init Error:", e.message);
    }
}

export const dbAdmin = adminApp! ? getAdminFirestore(adminApp) : null;
export { AdminApp };