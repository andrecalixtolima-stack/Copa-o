/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK using Environment Variables purely
const finalProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

console.log(`[FIREBASE Admin] Initializing Admin with Env Vars: ProjectID: ${finalProjectId || "None"}, ClientEmail: ${clientEmail ? "Provided" : "Missing"}, PrivateKey: ${privateKey ? "Provided" : "Missing"}`);

if (!finalProjectId || !clientEmail || !privateKey) {
  console.error("[FIREBASE Admin] CRITICAL ERROR: GOOGLE_CLOUD_PROJECT, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY is missing! Please configure the environment variables.");
}

if (admin.apps.length === 0) {
  try {
    if (privateKey && clientEmail && finalProjectId) {
      // Recursively trim and strip surrounding quotes
      privateKey = privateKey.trim();
      while (
        (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))
      ) {
        privateKey = privateKey.slice(1, -1).trim();
      }

      // Replace literal escaped sequence \n and double escaped \\n with actual raw line-breaks
      privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\\\n/g, "\n");

      // Log safe debugging metrics to help diagnose incorrect certificate formatting
      const hasHeader = privateKey.includes("-----BEGIN PRIVATE KEY-----");
      const hasFooter = privateKey.includes("-----END PRIVATE KEY-----");
      console.log(`[FIREBASE Admin Debug] Sanitized Key - Length: ${privateKey.length}, Has Header: ${hasHeader}, Has Footer: ${hasFooter}`);

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: finalProjectId,
          clientEmail: clientEmail,
          privateKey: privateKey
        }),
        projectId: finalProjectId
      });
      console.log("[FIREBASE Admin] Initialized with Private Key credentials (process.env.FIREBASE_PRIVATE_KEY).");
    } else {
      throw new Error("Missing required environment variables (GOOGLE_CLOUD_PROJECT, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) to initialize Firebase Admin cert.");
    }
  } catch (error) {
    console.error("[FIREBASE Admin] Exception during initialization:", error);
    throw error;
  }
}

// Connect EXCLUSIVELY to query the specific non-default database ID for AI Studio
const databaseId = "ai-studio-398a270b-78a3-408b-9ac9-7aca7526146e";
const appInstance = admin.apps[0];
const adminDb = getFirestore(appInstance as any, databaseId);

console.log(`[FIREBASE Admin] EXCLUSIVE Connection successfully established to remote Database: "${databaseId}"`);

const adminAuth = admin.auth();

export { admin, adminDb, adminAuth };
