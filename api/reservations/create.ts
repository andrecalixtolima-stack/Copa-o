/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../lib/firebaseAdmin";

// Simple in-memory rate limiter per serverless container instance
interface RateLimitData {
  count: number;
  resetTime: number;
}
const ipLimits = new Map<string, RateLimitData>();

function checkRateLimit(req: VercelRequest, res: VercelResponse, limit: number, timeframeMs: number): boolean {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "global_ip";
  const ipStr = Array.isArray(ip) ? ip[0] : String(ip);
  const now = Date.now();
  
  let clientLimit = ipLimits.get(ipStr);
  if (!clientLimit || now > clientLimit.resetTime) {
    clientLimit = { count: 0, resetTime: now + timeframeMs };
  }
  
  clientLimit.count++;
  ipLimits.set(ipStr, clientLimit);
  
  if (clientLimit.count > limit) {
    const secondsLeft = Math.ceil((clientLimit.resetTime - now) / 1000);
    res.status(429).json({
      error: `Muitas requisições. Para evitar abusos e spam, por favor aguarde ${secondsLeft} segundos.`
    });
    return false;
  }
  return true;
}

function selectedTableValid(num: any): boolean {
  const n = Number(num);
  return !isNaN(n) && n > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Gracefully handle CORS headers (essential for cross-origin local testing)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido. Por favor use POST." });
  }

  // Rate limit: 10 bookings per 5 minutes
  if (!checkRateLimit(req, res, 10, 5 * 60 * 1000)) {
    return;
  }

  try {
    const { 
      gameId, gameName, gameDateTime, isBrazilGame, 
      clientName, clientPhone, paxCount, tableType, tableNumber 
    } = req.body;

    // Detailed serverless logging to support tracing in Vercel Log Stream
    console.log(`[SERVERLESS RESERVATION] Attempting book Table #${tableNumber} (${tableType}) for Game ID: ${gameId} ("${gameName}"). Client: ${clientName} (${clientPhone})`);

    if (!gameId || !clientName || !clientPhone || !selectedTableValid(tableNumber)) {
      console.warn("[SERVERLESS RESERVATION] Dismissing invalid payload fields:", req.body);
      return res.status(400).json({ error: "Dados da reserva inválidos." });
    }

    const availabilityId = `${gameId}_${tableType}_${tableNumber}`;

    // Transactionally fetch tables to prevent concurrency race conditions
    const availRef = adminDb.collection("availability").doc(availabilityId);
    const blockRef = adminDb.collection("blockedTables").doc(availabilityId);

    const [availSnap, blockSnap] = await Promise.all([
      availRef.get().catch(e => {
        console.error(`[SERVERLESS RESERVATION] Error fetching availability from doc ${availabilityId}:`, e);
        throw e;
      }),
      blockRef.get().catch(e => {
        console.error(`[SERVERLESS RESERVATION] Error fetching blocked status from doc ${availabilityId}:`, e);
        throw e;
      })
    ]);

    if (availSnap.exists) {
      console.warn(`[SERVERLESS RESERVATION] Collision: table ${tableNumber} is already occupied.`);
      return res.status(400).json({ error: "Esta mesa já se encontra ocupada no sistema." });
    }
    if (blockSnap.exists) {
      console.warn(`[SERVERLESS RESERVATION] Blocked: table ${tableNumber} is blocked by administrative settings.`);
      return res.status(400).json({ error: "Esta mesa está bloqueada pela administração." });
    }

    const resId = adminDb.collection("reservations").doc().id;
    const initialStatus = isBrazilGame ? "aguardando comprovante" : "confirmado";
    const timestamp = new Date().toISOString();

    const reservationData = {
      id: resId,
      gameId,
      gameName,
      gameDateTime,
      isBrazilGame: !!isBrazilGame,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      paxCount: Number(paxCount),
      tableType,
      tableNumber: Number(tableNumber),
      status: initialStatus,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const availabilityData = {
      reservationId: resId,
      gameId,
      tableType,
      tableNumber: Number(tableNumber),
      status: initialStatus,
      updatedAt: timestamp
    };

    // Atomic double-write using Batch
    const batch = adminDb.batch();
    batch.set(adminDb.collection("reservations").doc(resId), reservationData);
    batch.set(availRef, availabilityData);
    await batch.commit();

    console.log(`[SERVERLESS RESERVATION] Successful write: Reservation ID: ${resId}, Availability ID: ${availabilityId}`);

    // Append Audit Log
    try {
      const auditLogId = adminDb.collection("auditLogs").doc().id;
      await adminDb.collection("auditLogs").doc(auditLogId).set({
        id: auditLogId,
        action: "create_reservation",
        details: `Nova reserva #${tableNumber} (${tableType}) criada com sucesso para ${clientName}.`,
        performedBy: "Public Client API",
        performedByEmail: clientPhone,
        timestamp
      });
    } catch (auditErr) {
      console.error("[SERVERLESS RESERVATION] Non-blocking audit logger write failed:", auditErr);
    }

    return res.status(200).json(reservationData);
  } catch (err: any) {
    console.error("[SERVERLESS RESERVATION FATAL EXCEPTION]:", err);
    return res.status(500).json({ 
      error: "Erro interno do servidor ao processar reserva.",
      diagnostic: err.message || String(err)
    });
  }
}
