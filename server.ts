/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";
import express from "express";
import { app } from "./api/app";
import { adminDb } from "./api/lib/firebaseAdmin";

const PORT = 3000;

// Background Automation: Self-cleaning loop for expired free reservations (1 hour before match time)
// Only registered on persistent server-mode (Cloud Run / Local) to avoid Serverless timeout overhead on Vercel
if (!process.env.VERCEL) {
  console.log("[COPAÇO LOCAL] Initializing background automation loops for table cleanups...");
  setInterval(async () => {
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      // Fetch active allocations from public availability
      const querySnapshot = await adminDb.collection("availability")
        .where("status", "in", ["aguardando comprovante", "confirmado", "ativa"])
        .get();

      let expiredCount = 0;

      for (const d of querySnapshot.docs) {
        const availData = d.data();
        if (availData.reservationId) {
          // Fetch general reservation details using the bypass-rules admin reference
          const resSnap = await adminDb.collection("reservations").doc(availData.reservationId).get();
          
          if (resSnap.exists) {
            const data = resSnap.data()!;
            // Exclude Brazil games from automatic release as they are paid and require manual receipt audits
            if (data.isBrazilGame === false && data.gameDateTime) {
              const gameTime = new Date(data.gameDateTime);
              if (gameTime <= cutoffTime) {
                const resId = availData.reservationId;
                
                // Atomically mark status as automatically released
                await adminDb.collection("reservations").doc(resId).update({
                  status: "liberada automaticamente",
                  updatedAt: new Date().toISOString()
                });

                // Delete current live tables occupancy map record
                if (data.gameId && data.tableType && data.tableNumber) {
                  const availabilityId = `${data.gameId}_${data.tableType}_${data.tableNumber}`;
                  await adminDb.collection("availability").doc(availabilityId).delete().catch(() => {});
                }

                // Add to Security and Automation Audit Trail
                const logId = adminDb.collection("auditLogs").doc().id;
                await adminDb.collection("auditLogs").doc(logId).set({
                  id: logId,
                  action: "auto_release",
                  details: `Mesa #${data.tableNumber} (${data.tableType}) liberada expirada para o jogo ${data.gameName}.`,
                  performedBy: "SYSTEM_AUTOMATION",
                  performedByEmail: "system@copaco.com",
                  timestamp: new Date().toISOString()
                });

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
      console.error("[AUTOMATION ERROR] Failed to run auto-expiration loop:", e);
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
