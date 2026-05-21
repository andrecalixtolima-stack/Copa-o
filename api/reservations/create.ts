/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../lib/firebaseAdmin.js";

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

  let currentStep = "PARSE_REQUEST_BODY";
  const diagnosticLogs: string[] = [];

  function logDiagnostic(msg: string) {
    const time = new Date().toISOString();
    const formatted = `[${time}] ${msg}`;
    console.log(formatted);
    diagnosticLogs.push(formatted);
  }

  try {
    const body = req.body || {};
    logDiagnostic(`RAW BODY RECEIVED: ${JSON.stringify(body)}`);

    const { 
      gameId, gameName, gameDateTime, isBrazilGame, 
      clientName, clientPhone, paxCount, tableType, tableNumber 
    } = body;

    logDiagnostic(`Parsed fields: gameId="${gameId}", gameName="${gameName}", gameDateTime="${gameDateTime}", isBrazilGame=${isBrazilGame}, clientName="${clientName}", clientPhone="${clientPhone}", paxCount=${paxCount}, tableType="${tableType}", tableNumber=${tableNumber}`);

    currentStep = "VALIDATE_INPUT_FIELDS";
    logDiagnostic("Validating input fields...");
    
    if (!gameId) {
      logDiagnostic("Validation failed: gameId is missing");
      return res.status(400).json({
        error: "Faltando ID do Jogo.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    if (!clientName || !clientName.trim()) {
      logDiagnostic("Validation failed: clientName is empty");
      return res.status(400).json({
        error: "Nome do cliente é obrigatório.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    if (!clientPhone || !clientPhone.trim()) {
      logDiagnostic("Validation failed: clientPhone is empty");
      return res.status(400).json({
        error: "Telefone do cliente é obrigatório.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    if (!selectedTableValid(tableNumber)) {
      logDiagnostic(`Validation failed: tableNumber "${tableNumber}" is invalid`);
      return res.status(400).json({
        error: "Número de mesa selecionado inválido.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    if (!tableType) {
      logDiagnostic("Validation failed: tableType is missing");
      return res.status(400).json({
        error: "Tipo de mesa é obrigatório.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    currentStep = "DATABASE_VERIFY_GAME_EXISTS";
    logDiagnostic(`Checking if game doc in Firestore collection "games" exists for ID: ${gameId}...`);
    
    if (!adminDb) {
      throw new Error("adminDb (Firestore object) is undefined! Firebase initialization might have failed.");
    }

    let gameDocSnap;
    try {
      gameDocSnap = await adminDb.collection("games").doc(gameId).get();
      logDiagnostic(`Game doc load completed. Exists: ${gameDocSnap.exists}`);
    } catch (dbErr: any) {
      logDiagnostic(`Failed to check game doc in Firestore: ${dbErr.message}`);
      throw dbErr;
    }

    if (!gameDocSnap.exists) {
      logDiagnostic(`Validation failed: Game with ID "${gameId}" does not exist in collection "games".`);
      return res.status(404).json({
        error: "O jogo selecionado não existe ou já foi encerrado/removido pela administração.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    const loadedGameData = gameDocSnap.data();
    logDiagnostic(`Game details retrieved successfully: ${JSON.stringify(loadedGameData)}`);

    const availabilityId = `${gameId}_${tableType}_${tableNumber}`;
    logDiagnostic(`Checking availability path ID: ${availabilityId}`);

    currentStep = "DATABASE_FETCH_AVAILABILITY_AND_BLOCKS";
    logDiagnostic(`Executing concurrent reads for documented table slot: availability document "${availabilityId}" and blockedTables document "${availabilityId}"`);

    let availSnap, blockSnap;
    try {
      const availRef = adminDb.collection("availability").doc(availabilityId);
      const blockRef = adminDb.collection("blockedTables").doc(availabilityId);

      const [aS, bS] = await Promise.all([
        availRef.get(),
        blockRef.get()
      ]);
      availSnap = aS;
      blockSnap = bS;
      logDiagnostic(`Slot fetches completed successfully. Reserved (availSnap): ${availSnap.exists}, Blocked (blockSnap): ${blockSnap.exists}`);
    } catch (dbErr: any) {
      logDiagnostic(`Failed concurrent check for slot availability: ${dbErr.message}`);
      throw dbErr;
    }

    if (availSnap.exists) {
      logDiagnostic(`Validation Collision: Table #${tableNumber} for game ${gameId} already has reservation id: ${availSnap.data()?.reservationId}`);
      return res.status(400).json({
        error: "Esta mesa já se encontra reservada ou ocupada para este jogo no sistema.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    if (blockSnap.exists) {
      logDiagnostic(`Validation Collision: Table #${tableNumber} is blocked by administration settings.`);
      return res.status(400).json({
        error: "Esta mesa está temporariamente indisponível ou bloqueada pela administração do bar.",
        step: currentStep,
        logs: diagnosticLogs
      });
    }

    currentStep = "PREPARE_TRANSACTIONAL_BATCH";
    logDiagnostic("Preparing transactional batch for atomic write...");

    const resId = adminDb.collection("reservations").doc().id;
    const initialStatus = isBrazilGame ? "aguardando comprovante" : "confirmado";
    const timestamp = new Date().toISOString();

    const reservationData = {
      id: resId,
      gameId,
      gameName: gameName || loadedGameData?.gameName || `${loadedGameData?.homeTeam} x ${loadedGameData?.awayTeam}`,
      gameDateTime: gameDateTime || loadedGameData?.dateTime || loadedGameData?.gameDateTime || "",
      isBrazilGame: !!isBrazilGame || !!loadedGameData?.isBrazilGame,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      paxCount: Number(paxCount || 4),
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

    logDiagnostic(`Prepared reservation object: ${JSON.stringify(reservationData)}`);
    logDiagnostic(`Prepared availability object: ${JSON.stringify(availabilityData)}`);

    currentStep = "EXECUTE_FIRESTORE_BATCH_COMMIT";
    logDiagnostic(`Executing Firestore Batch write containing: reservations/${resId} AND availability/${availabilityId}`);

    try {
      const batch = adminDb.batch();
      batch.set(adminDb.collection("reservations").doc(resId), reservationData);
      batch.set(adminDb.collection("availability").doc(availabilityId), availabilityData);
      
      await batch.commit();
      logDiagnostic("Firestore Batch write committed successfully!");
    } catch (batchErr: any) {
      logDiagnostic(`Firestore Batch commit failed: ${batchErr.message}`);
      throw batchErr;
    }

    currentStep = "WRITE_DIAGNOSTIC_AUDIT_LOG";
    logDiagnostic("Appending audit log entry for historical transparency...");

    try {
      const auditLogId = adminDb.collection("auditLogs").doc().id;
      await adminDb.collection("auditLogs").doc(auditLogId).set({
        id: auditLogId,
        action: "create_reservation",
        details: `Nova reserva #${tableNumber} (${tableType}) criada com sucesso para ${clientName} no jogo ${reservationData.gameName}.`,
        performedBy: "Public Client API",
        performedByEmail: clientPhone,
        timestamp
      });
      logDiagnostic(`Audit log entry saved: auditLogs/${auditLogId}`);
    } catch (auditErr: any) {
      logDiagnostic(`Non-blocking audit log append warning: ${auditErr.message}`);
    }

    logDiagnostic("All steps finished successfully!");
    return res.status(200).json({
      success: true,
      ok: true,
      reservation: reservationData,
      logs: diagnosticLogs
    });

  } catch (err: any) {
    console.error(`[SERVERLESS RESERVATION FATAL EXCEPTION] Failed at step: [${currentStep}]:`, err);
    
    // Gather safe diagnostic environment details to return inside JSON
    const envStatus = {
      project_id_present: !!process.env.GOOGLE_CLOUD_PROJECT,
      client_email_present: !!process.env.FIREBASE_CLIENT_EMAIL,
      private_key_present: !!process.env.FIREBASE_PRIVATE_KEY,
      firestore_database_id: process.env.FIRESTORE_DATABASE_ID || "default-or-not-specified"
    };

    return res.status(500).json({ 
      error: err.message || "Erro interno do servidor ao processar a reserva.",
      step: currentStep,
      stack: err.stack || null,
      diagnostics: diagnosticLogs,
      environmentInfo: envStatus
    });
  }
}
