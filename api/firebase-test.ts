/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "./lib/firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  console.log("[FIREBASE TEST ENDPOINT] Initiating Firestore connectivity probe...");

  try {
    // Perform a lightweight check on the "games" collection
    const snap = await adminDb.collection("games").limit(1).get();
    const count = snap.size;
    console.log(`[FIREBASE TEST ENDPOINT] Query success. Size: ${count}`);

    return res.status(200).json({
      ok: true,
      message: "Conexão com Firestore realizada com sucesso utilizando apenas process.env no banco default!",
      gamesCountInQuery: count,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[FIREBASE TEST ENDPOINT ERROR] Query failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || String(error),
      code: error.code || "unknown",
      timestamp: new Date().toISOString()
    });
  }
}
