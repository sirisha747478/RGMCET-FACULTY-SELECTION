import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, getDocFromServer, doc } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Analytics if measurementId is present and supported
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported && firebaseConfig.measurementId) {
      analytics = getAnalytics(app);
    }
  }).catch(err => {
    console.warn("Firebase Analytics not supported in this environment:", err);
  });
}

// Use the provided database ID if it exists and isn't "(default)", otherwise use the default database
export const db = (firebaseConfig as any).firestoreDatabaseId && (firebaseConfig as any).firestoreDatabaseId !== "(default)"
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

// Validate connection to Firestore as per guidelines
async function testConnection() {
  try {
    // Attempt to reach the server to verify configuration
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    if (error.message?.includes('offline') || error.code === 'unavailable') {
      console.error("Firestore is unreachable. This typically indicates an incorrect firestoreDatabaseId or projectId in firebase-applet-config.json.");
    }
    // Permission errors are expected for this dummy path and confirm we reached the server
  }
}
testConnection();
