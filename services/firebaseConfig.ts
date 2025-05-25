// services/firebaseConfig.ts
export const firebaseConfig = {
  apiKey: "AIzaSyAIVE8hNP_Amcc_jt7kiOHiv51_q6NFhNU",
  authDomain: "suru-3188c.firebaseapp.com",
  projectId: "suru-3188c",
  storageBucket: "suru-3188c.firebasestorage.app",
  messagingSenderId: "924168146042",
  appId: "1:924168146042:web:2e65a43a39cec78fa67fc3",
  measurementId: "G-CJJCV4H5DZ"                     // Example value, use YOURS (if provided)
};
// Check if the configuration is still using placeholder values.
// This check will now be false if the above values are correctly filled.
export const IS_FIREBASE_CONFIG_PLACEHOLDER = 
  firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || 
  firebaseConfig.projectId === "YOUR_PROJECT_ID";
