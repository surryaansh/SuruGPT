// services/firebaseConfig.ts
export const firebaseConfig = {
  apiKey: "AIzaSyAIVE8hNP_Amcc_jt7kioHiv51_q6NFHNU", // Example value, use YOURS
  authDomain: "suru-3188c.firebaseapp.com",          // Example value, use YOURS
  projectId: "suru-3188c",                           // Example value, use YOURS
  storageBucket: "suru-3188c.firebasestorage.app",   // Example value, use YOURS
  messagingSenderId: "924168146042",                 // Example value, use YOURS
  appId: "1:924168146042:web:2e65a43a39cec78fa67fc3", // Example value, use YOURS
  measurementId: "G-CJJCV4H5DZ"                      // Example value, use YOURS (if provided)
};
// Check if the configuration is still using placeholder values.
export const IS_FIREBASE_CONFIG_PLACEHOLDER = 
  firebaseConfig.apiKey === "AIzaSyAIVE8hNP_Amcc_jt7kioHiv51_q6NFHNU" || 
  firebaseConfig.projectId === "suru-3188c";
