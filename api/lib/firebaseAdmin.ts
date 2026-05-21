/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase Admin SDK with safety guards for Serverless environments (Vercel)
const ambientProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const finalProjectId = ambientProjectId && !process.env.FIREBASE_SERVICE_ACCOUNT && !(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
  ? ambientProjectId
  : firebaseConfig.projectId;

console.log(`[FIREBASE Admin] Ambient Project ID: ${ambientProjectId || "None"}. Config Project ID: ${firebaseConfig.projectId}. Target Project: ${finalProjectId}`);

if (admin.apps.length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: finalProjectId
      });
      console.log("[FIREBASE Admin] Initialized with Service Account.");
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey) {
        // Strip outer double or single quotes if they leaked from Vercel's env parsing
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
        } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
          privateKey = privateKey.slice(1, -1);
        }
        // Replace literal escaped sequence \n with actual raw line-breaks
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: finalProjectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        projectId: finalProjectId
      });
      console.log("[FIREBASE Admin] Initialized with Private Key credentials.");
    } else {
      admin.initializeApp({
        projectId: finalProjectId
      });
      console.log("[FIREBASE Admin] Initialized with ambient / default credentials (ADC).");
    }
  } catch (error) {
    console.error("[FIREBASE Admin] Exception during initialization:", error);
  }
}

const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
let adminDb: any;
try {
  const appInstance = admin.apps.length > 0 ? admin.apps[0] : undefined;
  adminDb = databaseId !== "(default)"
    ? getFirestore(appInstance as any, databaseId)
    : getFirestore(appInstance as any);
  console.log(`[FIREBASE Admin] Successfully connected to database ID: ${databaseId}`);
} catch (error) {
  console.error("[FIREBASE Admin] Failed to initialize Firestore with custom databaseId. Falling back to default DB:", error);
  adminDb = admin.firestore();
}

const adminAuth = admin.auth();

export { admin, adminDb, adminAuth, firebaseConfig };
