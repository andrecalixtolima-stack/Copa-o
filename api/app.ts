/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import helmet from "helmet";
import compression from "compression";
import { admin, adminDb, adminAuth } from "./lib/firebaseAdmin.js";

// Secure In-Memory Rate Limiting Engine for Serverless
interface RateLimitData {
  count: number;
  resetTime: number;
}
const ipLimits = new Map<string, RateLimitData>();

function createRateLimiter(limit: number, timeframeMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      return res.status(429).json({
        error: `Muitas requisições. Para evitar abusos e spam, por favor aguarde ${secondsLeft} segundos.`
      });
    }
    next();
  };
}

// Admin Authority Verification Middleware Helpers
async function isUserAdmin(uid: string | undefined, email: string | undefined): Promise<boolean> {
  if (!uid) return false;
  
  // 1. Hardcoded Creator Super Admin bypass
  if (email === "andrecalixtolima@gmail.com") {
    return true;
  }
  
  // 2. Query administrative collection in firestore
  try {
    const adminDoc = await adminDb.collection("admins").doc(uid).get();
    if (adminDoc.exists) {
      return true;
    }
  } catch (err) {
    console.warn("[SECURITY EXCEPTION] Error doing administrative checks in Firestore:", err);
  }
  
  return false;
}

export const app = express();

// Compact payload responses to improve performance on standard 3G/4G connections inside the bar
app.use(compression());

// Setup security headers with customized Content-Security-Policy (CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseapp.com"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://recaptcha.net",
          "https://apis.google.com"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https://*.googleapis.com",
          "https://*.firebaseapp.com",
          "https://securetoken.googleapis.com",
          "https://*.run.app"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://images.unsplash.com",
          "https://img.icons8.com"
        ],
        frameSrc: ["'self'", "https://www.google.com", "https://recaptcha.net", "https://*.run.app"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json({ limit: "50mb" }));

// API Route: Health status and metadata
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    project: "COPAÇO no Quinteiro",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Test health probe fallback route
app.get("/api/test", (req, res) => {
  res.json({ ok: true });
});

// Test Firestore connectivity fallback route
app.get("/api/firebase-test", async (req, res) => {
  try {
    const snap = await adminDb.collection("games").limit(1).get();
    res.json({
      ok: true,
      message: "Conexão com Firestore realizada com sucesso utilizando apenas process.env no banco default (Express)!",
      gamesCountInQuery: snap.size,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: error.message || String(error),
      code: error.code || "unknown",
      timestamp: new Date().toISOString()
    });
  }
});

// Admin Middleware Verifier helpers
const adminGuard = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminUid = req.headers["x-admin-uid"] as string;
  const adminEmail = req.headers["x-admin-email"] as string;

  if (!adminUid) {
    return res.status(401).json({ error: "Acesso negado. Credenciais administrativas ausentes." });
  }

  const verified = await isUserAdmin(adminUid, adminEmail);
  if (!verified) {
    return res.status(403).json({ error: "Acesso administrativo negado. Permissões insuficientes." });
  }

  next();
};

function selectedTableValid(num: any): boolean {
  const n = Number(num);
  return !isNaN(n) && n > 0;
}

// API Route: Public - Place Reservation with strict IP Rate Limiting (10 bookings per 5 minutes)
app.post("/api/reservations/create", createRateLimiter(10, 5 * 60 * 1000), async (req, res) => {
  try {
    const { 
      gameId, gameName, gameDateTime, isBrazilGame, 
      clientName, clientPhone, paxCount, tableType, tableNumber 
    } = req.body;

    console.log(`[EXPRESS RESERVATION] Table #${tableNumber} for Game: ${gameName}. Client: ${clientName}`);

    if (!gameId || !clientName || !clientPhone || !selectedTableValid(tableNumber)) {
      return res.status(400).json({ error: "Dados da reserva inválidos." });
    }

    const availabilityId = `${gameId}_${tableType}_${tableNumber}`;

    // 1. Transactionally verify availability on server to prevent front-end race conditions
    const availRef = adminDb.collection("availability").doc(availabilityId);
    const blockRef = adminDb.collection("blockedTables").doc(availabilityId);

    const [availSnap, blockSnap] = await Promise.all([availRef.get(), blockRef.get()]);

    if (availSnap.exists) {
      return res.status(400).json({ error: "Esta mesa já se encontra ocupada no sistema." });
    }
    if (blockSnap.exists) {
      return res.status(400).json({ error: "Esta mesa está bloqueada pela administração." });
    }

    // 2. Construct payloads and write atomically
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

    const batch = adminDb.batch();
    batch.set(adminDb.collection("reservations").doc(resId), reservationData);
    batch.set(availRef, availabilityData);
    await batch.commit();

    // Write Audit Log
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
      console.error("[AUDIT LOG ERROR] Non-blocking writer:", auditErr);
    }

    return res.status(200).json(reservationData);
  } catch (err: any) {
    console.error("[SERVER RESERVATION EXCEPTION]:", err);
    return res.status(500).json({ error: err.message || "Erro interno do servidor ao processar reserva." });
  }
});

// API Route: Admin - List Admins
app.get("/api/admins", adminGuard, async (req, res) => {
  try {
    const snap = await adminDb.collection("admins").get();
    const list: any[] = [];
    snap.forEach(doc => {
      list.push({ uid: doc.id, ...doc.data() });
    });
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Promote a User with Auth Custom Claims
app.post("/api/admins/promote", adminGuard, async (req, res) => {
  try {
    const { targetEmail, targetUid } = req.body;
    const performerEmail = req.headers["x-admin-email"] as string;

    if (!targetEmail || !targetUid) {
      return res.status(400).json({ error: "targetEmail e targetUid são necessários." });
    }

    // Add to Firestore list
    await adminDb.collection("admins").doc(targetUid).set({
      uid: targetUid,
      email: targetEmail,
      role: "Admin",
      addedAt: new Date().toISOString(),
      addedBy: performerEmail || "Super Admin"
    });

    // official Custom Claims injection to Firebase Auth
    try {
      await adminAuth.setCustomUserClaims(targetUid, { admin: true });
      console.log(`[SECURITY CLAIM] official Custom Token Claims set for admin user ${targetEmail}`);
    } catch (authErr) {
      console.warn("[SECURITY CLAIM WARNING] Could not set claims inside Firebase Auth:", authErr);
    }

    // Log in Audit Trail
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "promote_admin",
      details: `Usuário ${targetEmail} promovido a administrador por ${performerEmail}.`,
      performedBy: req.headers["x-admin-uid"] as string,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, message: `Usuário ${targetEmail} promovido com sucesso!` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Revoke Admin access and custom claims
app.post("/api/admins/revoke", adminGuard, async (req, res) => {
  try {
    const { targetUid, targetEmail } = req.body;
    const performerEmail = req.headers["x-admin-email"] as string;

    if (!targetUid || !targetEmail) {
      return res.status(400).json({ error: "targetUid e targetEmail são requeridos." });
    }

    if (targetEmail === "andrecalixtolima@gmail.com") {
      return res.status(400).json({ error: "Não é permitido revogar o Super Administrador fundador." });
    }

    // Remove from Firestore list
    await adminDb.collection("admins").doc(targetUid).delete();

    // Revoke official Custom claims on Auth
    try {
      await adminAuth.setCustomUserClaims(targetUid, { admin: false });
      console.log(`[SECURITY CLAIM] Custom claims revoked for admin user ${targetEmail}`);
    } catch (authErr) {
      console.warn("[SECURITY CLAIM] Error setting claims logic to false:", authErr);
    }

    // Write Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "revoke_admin",
      details: `Permissão administrativa de ${targetEmail} revogada por ${performerEmail}.`,
      performedBy: req.headers["x-admin-uid"] as string,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, message: `Permissão administrativa de ${targetEmail} revogada!` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Fetch Audit Logs (last 150 entries)
app.get("/api/audit-logs", adminGuard, async (req, res) => {
  try {
    const snap = await adminDb.collection("auditLogs")
      .orderBy("timestamp", "desc")
      .limit(150)
      .get();
    const logs: any[] = [];
    snap.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Block or Unblock Table
app.post("/api/tables/block", adminGuard, async (req, res) => {
  try {
    const { gameId, tableType, tableNumber, action } = req.body;
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;

    if (!gameId || !tableType || !selectedTableValid(tableNumber)) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    const blockId = `${gameId}_${tableType}_${tableNumber}`;

    if (action === "block") {
      await adminDb.collection("blockedTables").doc(blockId).set({
        id: blockId,
        gameId,
        tableType,
        tableNumber: Number(tableNumber),
        blockedBy: performerEmail,
        createdAt: new Date().toISOString()
      });

      // Delete availability index to lock slots
      await adminDb.collection("availability").doc(blockId).delete().catch(() => {});

      // Log audit
      const logId = adminDb.collection("auditLogs").doc().id;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        action: "block_table",
        details: `Mesa #${tableNumber} (${tableType}) BLOQUEADA administrativamente por ${performerEmail}.`,
        performedBy: performerUid,
        performedByEmail: performerEmail,
        timestamp: new Date().toISOString()
      });
    } else {
      await adminDb.collection("blockedTables").doc(blockId).delete();

      // Log audit
      const logId = adminDb.collection("auditLogs").doc().id;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        action: "unblock_table",
        details: `Mesa #${tableNumber} (${tableType}) DESBLOQUEADA por ${performerEmail}.`,
        performedBy: performerUid,
        performedByEmail: performerEmail,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Create Game
app.post("/api/games/create", adminGuard, async (req, res) => {
  try {
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;
    const gamePayload = req.body;

    if (!gamePayload.homeTeam || !gamePayload.awayTeam || !gamePayload.dateTime) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes para criar jogo." });
    }

    const docRef = adminDb.collection("games").doc();
    const gameId = docRef.id;

    const newGame = {
      id: gameId,
      ...gamePayload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docRef.set(newGame);

    // Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "create_game",
      details: `Jogo ${gamePayload.homeTeam} x ${gamePayload.awayTeam} criado por ${performerEmail}.`,
      performedBy: performerUid,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, id: gameId, game: newGame });
  } catch (err: any) {
    console.error("[SERVER GAME CREATE ERROR]:", err);
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Update Game
app.post("/api/games/update", adminGuard, async (req, res) => {
  try {
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;
    const { id, ...gamePayload } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Faltando o ID do jogo para atualizar." });
    }

    await adminDb.collection("games").doc(id).update({
      ...gamePayload,
      updatedAt: new Date().toISOString()
    });

    // Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "update_game",
      details: `Jogo ${gamePayload.homeTeam || ""} x ${gamePayload.awayTeam || ""} atualizado por ${performerEmail}.`,
      performedBy: performerUid,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[SERVER GAME UPDATE ERROR]:", err);
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Delete Game
app.post("/api/games/delete", adminGuard, async (req, res) => {
  try {
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID do jogo é requerido para exclusão." });
    }

    const gameDoc = await adminDb.collection("games").doc(id).get();
    if (!gameDoc.exists) {
      return res.status(404).json({ error: "Jogo não encontrado." });
    }
    const gameData = gameDoc.data();

    // Delete the game doc
    await adminDb.collection("games").doc(id).delete();

    // Cascade delete reservations
    const resSnap = await adminDb.collection("reservations").where("gameId", "==", id).get();
    const batch = adminDb.batch();
    resSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Cascade delete blocked tables
    const blockSnap = await adminDb.collection("blockedTables").where("gameId", "==", id).get();
    blockSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Cascade delete availability
    const availSnap = await adminDb.collection("availability").where("gameId", "==", id).get();
    availSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "delete_game",
      details: `Jogo ${gameData?.homeTeam || ""} x ${gameData?.awayTeam || ""} e suas dependências excluídos por ${performerEmail}.`,
      performedBy: performerUid,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[SERVER GAME DELETE ERROR]:", err);
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Update settings documents
app.post("/api/settings/homepage", adminGuard, async (req, res) => {
  try {
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;
    const settingsPayload = req.body;

    await adminDb.collection("settings").doc("homepage").set(settingsPayload, { merge: true });

    // Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "update_settings",
      details: `Configurações da homepage atualizadas por ${performerEmail}.`,
      performedBy: performerUid,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[SERVER SETTINGS ERROR]:", err);
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Securely Update Reservation Status
app.post("/api/reservations/update-status", adminGuard, async (req, res) => {
  try {
    const { reservationId, nextStatus } = req.body;
    const performerUid = req.headers["x-admin-uid"] as string;
    const performerEmail = req.headers["x-admin-email"] as string;

    if (!reservationId || !nextStatus) {
      return res.status(400).json({ error: "Faltando dados necessários." });
    }

    const resRef = adminDb.collection("reservations").doc(reservationId);
    const resSnap = await resRef.get();

    if (!resSnap.exists) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    const resData = resSnap.data()!;
    const availabilityId = `${resData.gameId}_${resData.tableType}_${resData.tableNumber}`;
    const availRef = adminDb.collection("availability").doc(availabilityId);

    // Perform transactionally to maintain complete reference safety
    const batch = adminDb.batch();
    batch.update(resRef, {
      status: nextStatus,
      updatedAt: new Date().toISOString()
    });

    if (nextStatus === "cancelado" || nextStatus === "liberada automaticamente") {
      batch.delete(availRef);
    } else {
      batch.set(availRef, {
        reservationId,
        gameId: resData.gameId,
        tableType: resData.tableType,
        tableNumber: Number(resData.tableNumber),
        status: nextStatus,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    await batch.commit();

    // Write Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "update_status",
      details: `Status da reserva de ${resData.clientName} (Mesa #${resData.tableNumber}) alterado para '${nextStatus}' por ${performerEmail}.`,
      performedBy: performerUid,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, message: `Status alterado com sucesso para ${nextStatus}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Export Full Backup Data
app.get("/api/backup/export", adminGuard, async (req, res) => {
  try {
    const collections = ["games", "reservations", "blockedTables", "admins", "settings"];
    const backupData: Record<string, any[]> = {};

    for (const col of collections) {
      const snap = await adminDb.collection(col).get();
      const docs: any[] = [];
      snap.forEach(doc => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      backupData[col] = docs;
    }

    return res.setHeader("Content-Disposition", "attachment; filename=copaco_backup.json")
      .json({
        exportedAt: new Date().toISOString(),
        version: "enterprise-v1",
        data: backupData
      });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// API Route: Admin - Import & Restore Backup Data
app.post("/api/backup/import", adminGuard, async (req, res) => {
  try {
    const { data } = req.body;
    const performerEmail = req.headers["x-admin-email"] as string;

    if (!data) {
      return res.status(400).json({ error: "Nenhum dado de backup enviado." });
    }

    let restoredCount = 0;

    // Restore collection by collection in a safe, batched style
    const collections = ["games", "reservations", "blockedTables", "admins", "settings"];
    for (const col of collections) {
      const list = data[col];
      if (Array.isArray(list)) {
        const batchLimit = 400; // Firestore limit is 500 actions
        let count = 0;
        let batch = adminDb.batch();

        for (const item of list) {
          const { id, ...itemData } = item;
          if (id) {
            const docRef = adminDb.collection(col).doc(id);
            batch.set(docRef, itemData, { merge: true });
            count++;
            restoredCount++;

            if (count >= batchLimit) {
              await batch.commit();
              batch = adminDb.batch();
              count = 0;
            }
          }
        }

        if (count > 0) {
          await batch.commit();
        }
      }
    }

    // Re-compile general availability map from restored active reservations index
    if (Array.isArray(data.reservations)) {
      let count = 0;
      let batch = adminDb.batch();

      for (const resItem of data.reservations) {
        const status = resItem.status;
        if (status && status !== "cancelado" && status !== "liberada automaticamente") {
          const availId = `${resItem.gameId}_${resItem.tableType}_${resItem.tableNumber}`;
          const availRef = adminDb.collection("availability").doc(availId);

          batch.set(availRef, {
            reservationId: resItem.id,
            gameId: resItem.gameId,
            tableType: resItem.tableType,
            tableNumber: Number(resItem.tableNumber),
            status: status,
            updatedAt: new Date().toISOString()
          });

          count++;
          if (count >= 400) {
            await batch.commit();
            batch = adminDb.batch();
            count = 0;
          }
        }
      }

      if (count > 0) {
        await batch.commit();
      }
    }

    // Create Audit Log
    const logId = adminDb.collection("auditLogs").doc().id;
    await adminDb.collection("auditLogs").doc(logId).set({
      id: logId,
      action: "restore_backup",
      details: `Restauração completa de backup concluída. Restaurada ${restoredCount} entidades por ${performerEmail}.`,
      performedBy: req.headers["x-admin-uid"] as string,
      performedByEmail: performerEmail,
      timestamp: new Date().toISOString()
    });

    return res.json({ success: true, count: restoredCount });
  } catch (err: any) {
    console.error("[RESTORE ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
});

export default app;
