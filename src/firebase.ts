import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, getDocFromServer, doc } from "firebase/firestore";

// Configured from the user's Firebase web application project
const firebaseConfig = {
  apiKey: "AIzaSyA2S-bb7tviNsY6_h_mDUmM_3p8M-Y7aS8",
  authDomain: "nhaplieudemo.firebaseapp.com",
  projectId: "nhaplieudemo",
  storageBucket: "nhaplieudemo.firebasestorage.app",
  messagingSenderId: "748684803899",
  appId: "1:748684803899:web:28d679ac7922042b51411e"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore Database
export const db = getFirestore(app);

// Operational helper for error mapping and diagnostics
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error("Firestore Error Detailed Details:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validation call to verify Firebase connection status
export async function testConnection(): Promise<boolean> {
  const testPath = "connection_test";
  try {
    await getDocFromServer(doc(db, testPath, "ping"));
    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("client is offline")) {
      console.error("Firebase Connection Warning: client is offline or config invalid.");
    }
    return false;
  }
}
