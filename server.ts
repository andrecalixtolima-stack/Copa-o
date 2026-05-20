/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from "firebase/firestore";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load firebase config safely with fs to work perfectly across all node/tsx runner environments
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8")
);

// Initialize Firebase JS SDK on the server too for background background automation
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Health status and metadata
  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      project: "COPAÇO no Quinteiro",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Background Automation: Self-cleaning loop for expired free reservations (1 hour before match time)
  setInterval(async () => {
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      // Fetch active reservations that are free (isBrazilGame === false) and awaiting or confirmed
      const reservationsRef = collection(db, "reservations");
      const q = query(
        reservationsRef,
        where("isBrazilGame", "==", false),
        where("status", "in", ["aguardando comprovante", "confirmado", "ativa"])
      );

      const querySnapshot = await getDocs(q);
      let expiredCount = 0;

      for (const d of querySnapshot.docs) {
        const data = d.data();
        if (data.gameDateTime) {
          const gameTime = new Date(data.gameDateTime);
          // If match starts within 1 hour (or already started in the past) and is not already canceled
          if (gameTime <= cutoffTime) {
            const reservationDocRef = doc(db, "reservations", d.id);
            await updateDoc(reservationDocRef, {
              status: "liberada automaticamente",
              updatedAt: new Date().toISOString()
            });
            expiredCount++;
          }
        }
      }

      if (expiredCount > 0) {
        console.log(`[AUTOMATION] Automatically released ${expiredCount} expired free table reservations.`);
      }
    } catch (e) {
      console.error("[AUTOMATION ERROR] Failed to run auto-expiration loop:", e);
    }
  }, 15000); // Check every 15 seconds

  // Initialize Vite Developer middleware if not in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets compiled by Vite
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[COPAÇO SERVER] Backend running on port ${PORT}`);
  });
}

startServer();
