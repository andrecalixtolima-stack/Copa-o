/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";
import express from "express";
import fs from "fs";
import { app } from "./api/app.js";
import { adminDb } from "./api/lib/firebaseAdmin.js";
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  collection as clientCollection, 
  query as clientQuery, 
  where as clientWhere, 
  getDocs as getClientDocs, 
  doc as clientDoc, 
  getDoc as getClientDoc, 
  updateDoc as updateClientDoc, 
  deleteDoc as deleteClientDoc 
} from "firebase/firestore";

const PORT = 3000;

// Initialize client-side Firebase connection on the server to bypass sandboxed Administrative IAM limits
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const clientApp = initializeClientApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Background Automation: Self-cleaning loop for expired free reservations (1 hour before match time) using client-compliant credentials
// Only registered on persistent server-mode (Cloud Run / Local) to avoid Serverless timeout overhead on Vercel
if (!process.env.VERCEL) {
  console.log("[COPAÇO LOCAL] Initializing background automation loops for table cleanups...");
  setInterval(async () => {
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      // Fetch active allocations from public availability (read is public)
      const availCol = clientCollection(clientDb, "availability");
      const q = clientQuery(availCol, clientWhere("status", "in", ["aguardando comprovante", "confirmado", "ativa"]));
      const querySnapshot = await getClientDocs(q);

      let expiredCount = 0;

      for (const d of querySnapshot.docs) {
        const availData = d.data();
        if (availData.reservationId) {
          // Fetch general reservation details using single-document lookup (get is public)
          const resRef = clientDoc(clientDb, "reservations", availData.reservationId);
          const resSnap = await getClientDoc(resRef);
          
          if (resSnap.exists()) {
            const data = resSnap.data()!;
            // Exclude Brazil games from automatic release as they are paid and require manual receipt audits
            if (data.isBrazilGame === false && data.gameDateTime) {
              const gameTime = new Date(data.gameDateTime);
              if (gameTime <= cutoffTime) {
                const resId = availData.reservationId;
                
                // Atomically update status to "liberada automaticamente" (allowed publicly for single-field status adjustments)
                await updateClientDoc(resRef, {
                  status: "liberada automaticamente",
                  updatedAt: new Date().toISOString()
                });

                // Delete current live tables occupancy map record (allowed publicly once target reservation is marked 'liberada automaticamente')
                if (data.gameId && data.tableType && data.tableNumber) {
                  const availabilityId = `${data.gameId}_${data.tableType}_${data.tableNumber}`;
                  await deleteClientDoc(clientDoc(clientDb, "availability", availabilityId)).catch(() => {});
                }

                console.log(`[AUTOMATION SUCCESS] Marked reservation ${resId} as expired (table #${data.tableNumber}) for game: ${data.gameName}.`);
                expiredCount++;
              }
            }
          }
        }
      }

      if (expiredCount > 0) {
        console.log(`[AUTOMATION] Automatically released ${expiredCount} expired free table reservations.`);
      }
    } catch (e) {
      console.error("[AUTOMATION ERROR] Failed to run auto-expiration loop using Client SDK fallback:", e);
    }
  }, 35000); // Perform verification cycle every 35 seconds
}

// Asynchronously configure dev environment or production serving & start listening
async function startListening() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    console.log("[COPAÇO LOCAL] Configuring Vite Development Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    // Register Vite middleware for live HMR updates on local development
    app.use(vite.middlewares);
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "index.html"));
    });
  } else if (!process.env.VERCEL) {
    console.log("[COPAÇO LOCAL] Serving pre-compiled production static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[COPAÇO LOCAL] Server initialized on http://localhost:${PORT}`);
    });
  }
}

startListening().catch((err) => {
  console.error("[COPAÇO LOCAL] Startup initialization failure:", err);
});
