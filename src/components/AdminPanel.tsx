/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Game, Reservation, BlockedTable, DashboardMetrics, ReservationStatus, HomepageSettings, getDirectImageUrl, isValidDirectImageUrl } from "../types";
import LogoImage from "./LogoImage";
import { db, handleFirestoreError, OperationType, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, writeBatch, setDoc
} from "firebase/firestore";
import { 
  Calendar, Clock, DollarSign, Users, Trash2, Edit2, Shield, Plus, X, Check, Eye, HelpCircle, AlertOctagon, RefreshCw, Layers, PhoneCall, CheckCircle2, Ban, Download, Upload, Database, FileSpreadsheet, MessageSquare
} from "lucide-react";
import { auth } from "../firebase";

interface AdminPanelProps {
  games: Game[];
  reservations: Reservation[];
  blockedTables: BlockedTable[];
  onRefresh: () => void;
  homepageTexts: HomepageSettings;
  initialGameToEdit?: Game | null;
  onClearInitialGameToEdit?: () => void;
}

export default function AdminPanel({ 
  games, 
  reservations, 
  blockedTables, 
  onRefresh, 
  homepageTexts,
  initialGameToEdit,
  onClearInitialGameToEdit
}: AdminPanelProps) {
  
  const [activeTab, setActiveTab] = useState<"dashboard" | "games" | "reservations" | "blocking" | "texts" | "admins" | "backup">("dashboard");
  const [dashSelectedGameId, setDashSelectedGameId] = useState<string>("");
  const [dashSelectedTable, setDashSelectedTable] = useState<{type: "mesa4" | "mesa2", number: number} | null>(null);
  const [dashManualClientName, setDashManualClientName] = useState("");
  const [dashManualClientPhone, setDashManualClientPhone] = useState("");

  // State for Admin users
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  
  // Promotion inputs
  const [promoEmail, setPromoEmail] = useState("");
  const [promoUid, setPromoUid] = useState("");
  const [logFilterAction, setLogFilterAction] = useState("all");
  const [logSearch, setLogSearch] = useState("");

  // Backup files
  const [backupFileContent, setBackupFileContent] = useState<any | null>(null);
  const [backupFileName, setBackupFileName] = useState("");

  const fetchAdminsAndLogs = async () => {
    setLoadingAdmins(true);
    setAdminsError(null);
    try {
      const adminsRes = await fetch("/api/admins", {
        headers: {
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        }
      });
      
      if (!adminsRes.ok) {
        const errText = await adminsRes.text().catch(() => "Sem detalhes");
        throw new Error(`Erro na API (${adminsRes.status}): ${errText.substring(0, 100)}`);
      }

      const contentType = adminsRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("O servidor retornou uma página que não é JSON. Verifique a configuração das rotas da API no Vercel.");
      }

      const adminsData = await adminsRes.json();
      if (Array.isArray(adminsData)) {
        setAdminUsers(adminsData);
      } else {
        throw new Error("Os dados de administradores recebidos do servidor são inválidos.");
      }

      const logsRes = await fetch("/api/audit-logs", {
        headers: {
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        }
      });
      
      if (logsRes.ok) {
        const logContentType = logsRes.headers.get("content-type");
        if (logContentType && logContentType.includes("application/json")) {
          const logsData = await logsRes.json();
          setLogs(logsData);
          setFilteredLogs(logsData);
        }
      }
    } catch (err: any) {
      console.warn("Could not fetch admins or logs:", err);
      setAdminsError(err.message || "Erro de conexão ao carregar administradores.");
    } finally {
      setLoadingAdmins(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === "admins") {
      fetchAdminsAndLogs();
    }
  }, [activeTab]);

  React.useEffect(() => {
    if (initialGameToEdit) {
      setActiveTab("games");
      handleOpenEditForm(initialGameToEdit);
      onClearInitialGameToEdit?.();
    }
  }, [initialGameToEdit, onClearInitialGameToEdit]);

  React.useEffect(() => {
    let result = logs;
    
    if (logFilterAction !== "all") {
      result = result.filter(log => log.action === logFilterAction);
    }
    
    if (logSearch.trim()) {
      const s = logSearch.toLowerCase().trim();
      result = result.filter(log => 
        log.details.toLowerCase().includes(s) || 
        log.performedByEmail.toLowerCase().includes(s) ||
        log.action.toLowerCase().includes(s)
      );
    }
    
    setFilteredLogs(result);
  }, [logFilterAction, logSearch, logs]);

  const handlePromoteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoEmail.trim() || !promoUid.trim()) {
      showFeedback("", "Por favor insira um email e UID válidos.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admins/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        },
        body: JSON.stringify({
          targetEmail: promoEmail.trim(),
          targetUid: promoUid.trim()
        })
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Erro ao promover usuário.");
      }

      showFeedback(`Sucesso! ${promoEmail} foi promovido a administrador oficial com claims habilitadas.`);
      setPromoEmail("");
      setPromoUid("");
      fetchAdminsAndLogs();
    } catch (err: any) {
      showFeedback("", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAdmin = async (uid: string, email: string) => {
    if (!confirm(`Deseja revogar permanentemente os privilégios de administrador de ${email}?`)) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admins/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        },
        body: JSON.stringify({
          targetUid: uid,
          targetEmail: email
        })
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Erro ao revogar administrador.");
      }

      showFeedback(`Revogado! Acesso administrativo de ${email} cancelado com sucesso.`);
      fetchAdminsAndLogs();
    } catch (err: any) {
      showFeedback("", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (reservations.length === 0) {
      showFeedback("", "Nenhuma reserva disponível para exportar no momento.");
      return;
    }

    try {
      const csvHeaders = ["ID", "Jogo", "Data do Jogo", "Tipo", "Mesa #", "Cliente", "WhatsApp", "Pax", "Extra Cadeira", "Status", "Criado Em"];
      const csvRows = reservations.map(r => [
        r.id,
        `"${r.gameName}"`,
        r.gameDateTime,
        r.tableType === "mesa4" ? "Mesa 4" : "Mesa 2",
        r.tableNumber,
        `"${r.clientName}"`,
        `"${r.clientPhone}"`,
        r.paxCount,
        r.hasExtraSeat ? "Sim" : "Não",
        r.status,
        r.createdAt
      ]);

      const csvContent = "\ufeff" + [
        csvHeaders.join(","),
        ...csvRows.map(row => row.join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `reservas_copaco_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showFeedback("Sucesso! Planilha CSV de reservas baixada.");
    } catch (err: any) {
      showFeedback("", `Falha ao exportar CSV: ${err.message}`);
    }
  };

  const handleDownloadBackupJSON = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backup/export", {
        headers: {
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        }
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar backup no servidor.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `copaco_firestore_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showFeedback("Backup completo do Firestore exportado com sucesso.");
    } catch (err: any) {
      showFeedback("", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelectForRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === "object" && parsed.version) {
          setBackupFileContent(parsed);
          showFeedback("Arquivo de backup validado com sucesso! Pronto para restauração.");
        } else {
          showFeedback("", "Arquivo de backup inválido. Chaves de cabeçalho incompletas.");
        }
      } catch (err) {
        showFeedback("", "Erro ao ler payload JSON: arquivo corrompido.");
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = async () => {
    if (!backupFileContent) return;
    if (!confirm("⚠️ ATENÇÃO: Esta ação restaurará e mesclará todos os dados armazenados de jogos, reservas e bloqueios oficiais. Deseja continuar com a recuperação?")) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/backup/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "",
          "x-admin-email": auth.currentUser?.email || ""
        },
        body: JSON.stringify({
          data: backupFileContent.data
        })
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Erro de restauração no servidor.");
      }

      const res = await response.json();
      showFeedback(`Sincronização restaurada! ${res.count} registros re-classificados no Firestore.`);
      setBackupFileContent(null);
      setBackupFileName("");
      onRefresh();
    } catch (err: any) {
      showFeedback("", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Game Form states
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [showGameForm, setShowGameForm] = useState(false);
  const [formHomeTeam, setFormHomeTeam] = useState("");
  const [formAwayTeam, setFormAwayTeam] = useState("");
  const [formDateTime, setFormDateTime] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAttractions, setFormAttractions] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formIsBrazil, setFormIsBrazil] = useState(false);
  const [formTables4, setFormTables4] = useState(30);
  const [formTables2, setFormTables2] = useState(3);
  const [formPrice4, setFormPrice4] = useState(24);
  const [formPrice2, setFormPrice2] = useState(12);
  const [formDisableExtraSeats, setFormDisableExtraSeats] = useState(false);
  const [formDisableReservations, setFormDisableReservations] = useState(false);

  // Blocking / Manual Booking states
  const [selectedGameId, setSelectedGameId] = useState("");
  const [blockTableType, setBlockTableType] = useState<"mesa4" | "mesa2">("mesa4");
  const [blockTableNumber, setBlockTableNumber] = useState<number | "">("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientPhone, setManualClientPhone] = useState("");

  // Reservations filtering, sub-tab (Lixeira) and grouping states
  const [reservationSubTab, setReservationSubTab] = useState<"active" | "trash">("active");
  const [groupSameClient, setGroupSameClient] = useState(false);
  const [resSearchQuery, setResSearchQuery] = useState("");

  // Reservation Edit states
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [editResName, setEditResName] = useState("");
  const [editResPhone, setEditResPhone] = useState("");
  const [editResPax, setEditResPax] = useState<number>(4);
  const [editResExtra, setEditResExtra] = useState(false);
  const [isSavingResEdit, setIsSavingResEdit] = useState(false);
  const [resEditError, setResEditError] = useState("");

  const handleOpenEditRes = (res: Reservation) => {
    setEditingRes(res);
    setEditResName(res.clientName || "");
    setEditResPhone(res.clientPhone || "");
    setEditResPax(res.paxCount || 4);
    setEditResExtra(!!res.hasExtraSeat);
    setResEditError("");
  };

  const handleSaveResEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRes) return;
    if (!editResName.trim()) {
      setResEditError("O nome do convidado é obrigatório.");
      return;
    }
    if (!editResPhone.trim()) {
      setResEditError("O telefone é obrigatório.");
      return;
    }

    setIsSavingResEdit(true);
    setResEditError("");

    try {
      const response = await fetch("/api/reservations/update-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({
          reservationId: editingRes.id,
          clientName: editResName,
          clientPhone: editResPhone,
          paxCount: Number(editResPax),
          hasExtraSeat: editResExtra
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errMsg = text;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch {}
        throw new Error(errMsg || "Erro ao salvar dados.");
      }

      showFeedback("Reserva editada com sucesso!");
      setEditingRes(null);
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao salvar dados da reserva:", err);
      setResEditError(err.message || "Erro de conexão ao editar.");
    } finally {
      setIsSavingResEdit(false);
    }
  };

  // Helper to normalize phone
  const normalizePhone = (phone: string | undefined | null) => {
    if (!phone) return "";
    let num = String(phone).replace(/\D/g, "");
    if ((num.length === 10 || num.length === 11) && !num.startsWith("55")) {
      num = "55" + num;
    }
    return num;
  };

  const handleSendWhatsApp = (res: Reservation) => {
    const phone = normalizePhone(res.clientPhone);
    const clientName = res.clientName;
    const matchName = res.gameName;
    const tType = res.tableType === "mesa4" ? "Mesa para 4 pessoas" : "Mesa para 2 pessoas";
    const numExtra = res.hasExtraSeat ? " (+1 Cadeira/Ingresso Extra)" : "";
    const tableNum = res.tableNumber;
    const numPessoas = res.paxCount;
    
    const resInfo = `*DADOS DA RESERVA*\n👤 Cliente: ${clientName}\n🏟️ Jogo: ${matchName}\n🪑 Tipo: ${tType}${numExtra}\n🔢 Mesa #: ${tableNum}\n👥 Qtd Pessoas: ${numPessoas} pessoas\n\n`;

    const textMsg = `${resInfo}Sua mesa está garantida! 💚

Importante: as mesas não seguirão um mapeamento pré-definido. A ocupação será feita por ordem de chegada, então recomendamos chegar cedo para escolher o melhor lugar 😉

Caso algum amigo resolva colar de última hora, teremos venda na porta por R$10 por pessoa.

Além da transmissão dos jogos, vai rolar:
🎧 Set de DJs
🎁 Sorteios antes, durante e depois do jogo

⚡ E atenção: em todos os jogos teremos sorteio de 6 meses grátis de energia com a Metha Energia.

Para participar, faça seu cadastro no link abaixo no dia do evento:
methaenergia.com.br/indicacao/U7603NFG

Esperamos vocês!`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSendWhatsAppGroup = (group: any) => {
    const phone = normalizePhone(group.clientPhone);
    const clientName = group.clientName;
    const matchName = group.gameName;
    const tables = group.tablesDesc;
    const totalPax = group.totalPax;
    const hasExtra = group.hasExtraSeat;

    const extraLabel = hasExtra ? " (+ Cadeira Extra inclusa)" : "";

    const resInfo = `*DADOS DAS RESERVAS*\n👤 Cliente: ${clientName}\n🏟️ Jogo: ${matchName}\n🪑 Mesas Reservadas: ${tables}${extraLabel}\n👥 Total de Pessoas: ${totalPax} pessoas\n\n`;

    const textMsg = `${resInfo}Sua mesa está garantida! 💚

Importante: as mesas não seguirão um mapeamento pré-definido. A ocupação será feita por ordem de chegada, então recomendamos chegar cedo para escolher o melhor lugar 😉

Caso algum amigo resolva colar de última hora, teremos venda na porta por R$10 por pessoa.

Além da transmissão dos jogos, vai rolar:
🎧 Set de DJs
🎁 Sorteios antes, durante e depois do jogo

⚡ E atenção: em todos os jogos teremos sorteio de 6 meses grátis de energia com a Metha Energia.

Para participar, faça seu cadastro no link abaixo no dia do evento:
methaenergia.com.br/indicacao/U7603NFG

Esperamos vocês!`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getClientAggregation = (phone: string | undefined | null, activeOnly: boolean = true) => {
    if (!phone) {
      return {
        totalTables: 0,
        totalPax: 0,
        occurrences: []
      };
    }
    const normPhone = String(phone).replace(/\D/g, "");
    const occurrences = reservations.filter(r => {
      if (!r.clientPhone) return false;
      const isCancelled = r.status === "cancelado" || r.status === "liberada automaticamente";
      if (activeOnly && isCancelled) return false;
      return String(r.clientPhone).replace(/\D/g, "") === normPhone;
    });
    
    const totalTables = occurrences.length;
    const totalPax = occurrences.reduce((sum, r) => sum + r.paxCount, 0);
    
    return {
      totalTables,
      totalPax,
      occurrences
    };
  };

  const groupReservationsList = (list: Reservation[]): any[] => {
    const groups: { [key: string]: Reservation[] } = {};
    
    list.forEach(r => {
      const phoneKey = r.clientPhone ? String(r.clientPhone).replace(/\D/g, "") : `no_phone_${r.id}`;
      const key = `${r.gameId}_${phoneKey}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(r);
    });

    const grouped = Object.values(groups).map(matchingRes => {
      const sortedMatching = [...matchingRes].sort((a, b) => a.tableNumber - b.tableNumber);
      const prim = sortedMatching[0];
      const totalPax = sortedMatching.reduce((acc, r) => acc + r.paxCount, 0);
      const tablesDesc = sortedMatching.map(r => `${r.tableType === "mesa4" ? "M4" : "M2"} #${r.tableNumber}`).join(", ");
      const hasExtraSeat = sortedMatching.some(r => r.hasExtraSeat);
      
      return {
        id: prim.id,
        clientPhone: prim.clientPhone,
        clientName: prim.clientName,
        gameId: prim.gameId,
        gameName: prim.gameName,
        status: prim.status,
        reservations: sortedMatching,
        totalPax,
        tablesDesc,
        hasExtraSeat,
        isGrouped: sortedMatching.length > 1
      };
    });

    return grouped.sort((a, b) => {
      const nameA = (a.clientName || "").trim().toLowerCase();
      const nameB = (b.clientName || "").trim().toLowerCase();
      const comp = nameA.localeCompare(nameB, "pt-BR");
      if (comp !== 0) {
        return comp;
      }
      return a.id.localeCompare(b.id);
    });
  };

  const getFilteredAndSortedReservations = (): Reservation[] => {
    const filteredByTab = reservations.filter(r => {
      const isCancelledOrReleased = r.status === "cancelado" || r.status === "liberada automaticamente";
      if (reservationSubTab === "trash") {
        return isCancelledOrReleased;
      } else {
        return !isCancelledOrReleased;
      }
    });

    const filteredByGame = selectedGameId 
      ? filteredByTab.filter(r => r.gameId === selectedGameId) 
      : filteredByTab;

    const filteredBySearch = resSearchQuery.trim()
      ? filteredByGame.filter(r => {
          const query = resSearchQuery.toLowerCase().trim();
          const name = (r.clientName || "").toLowerCase();
          const phone = (r.clientPhone || "").replace(/\D/g, "");
          const cleanQuery = query.replace(/\D/g, "");
          return name.includes(query) || phone.includes(cleanQuery || query);
        })
      : filteredByGame;

    return [...filteredBySearch].sort((a, b) => {
      const nameA = (a.clientName || "").trim().toLowerCase();
      const nameB = (b.clientName || "").trim().toLowerCase();
      const comp = nameA.localeCompare(nameB, "pt-BR");
      if (comp !== 0) {
        return comp;
      }
      return a.tableNumber - b.tableNumber;
    });
  };

  const handleSendWhatsAppSummary = () => {
    const list = getFilteredAndSortedReservations();
    if (list.length === 0) {
      showFeedback("", "Nenhuma reserva encontrada para os filtros atuais.");
      return;
    }

    // Determine title / filter context
    const tabLabel = reservationSubTab === "trash" ? "LIXEIRA / CANCELADAS" : "ATIVAS";
    let title = `Resumo de Reservas (${tabLabel}) - Copaço`;
    if (selectedGameId) {
      const g = games.find(game => game.id === selectedGameId);
      if (g) {
        const gameDateFormatted = new Date(g.dateTime).toLocaleDateString("pt-BR");
        const gameTimeFormatted = new Date(g.dateTime).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });
        title = `Resumo de Reservas (${tabLabel})\n⚽ *${g.homeTeam} x ${g.awayTeam}*\n📅 *${gameDateFormatted} às ${gameTimeFormatted}*`;
      }
    } else {
      title = `Resumo Geral de Reservas (${tabLabel})\n📅 *Gerado em ${new Date().toLocaleDateString("pt-BR")}*`;
    }

    // Compile statistics
    const totalTables = list.length;
    const totalPeople = list.reduce((sum, r) => sum + (r.paxCount || 0), 0);
    const m4Count = list.filter(r => r.tableType === "mesa4").length;
    const m2Count = list.filter(r => r.tableType === "mesa2").length;

    let text = `🧾 *${title}*\n\n`;
    text += `📊 *Estatísticas:* \n`;
    text += `• Total de Mesas: *${totalTables}*\n`;
    text += `• Total de Integrantes/Pessoas: *${totalPeople}*\n`;
    text += `• Mesas de 4 Lugares (M4): *${m4Count}*\n`;
    text += `• Mesas de 2 Lugares (M2): *${m2Count}*\n\n`;

    text += `📋 *Relatório de Reservas:* \n`;

    if (groupSameClient) {
      const groupedList = groupReservationsList(list);
      groupedList.forEach((g, idx) => {
        const extraSeatLabel = g.hasExtraSeat ? " (+Cadeira Extra)" : "";
        text += `\n${idx + 1}. *${g.clientName}*\n`;
        text += `   • Mesas: ${g.tablesDesc}${extraSeatLabel}\n`;
        text += `   • Pessoas: *${g.totalPax}* | Status: _${g.status.toUpperCase()}_\n`;
        if (g.clientPhone) {
          text += `   • Contato: ${g.clientPhone}\n`;
        }
      });
    } else {
      list.forEach((r, idx) => {
        const tableLabel = `${r.tableType === "mesa4" ? "M4" : "M2"} #${r.tableNumber}`;
        const extraSeatLabel = r.hasExtraSeat ? " (+Cadeira Extra)" : "";
        text += `\n${idx + 1}. *${r.clientName}*\n`;
        text += `   • Mesa: ${tableLabel}${extraSeatLabel}\n`;
        text += `   • Pessoas: *${r.paxCount}* | Status: _${r.status.toUpperCase()}_\n`;
        if (r.clientPhone) {
          text += `   • Contato: ${r.clientPhone}\n`;
        }
        if (!selectedGameId) {
          text += `   • Jogo: ${r.gameName}\n`;
        }
      });
    }

    text += `\n\n*Gerado via Painel Administrativo Copaço*`;

    // Encode text for URL
    const urlEncodedText = encodeURIComponent(text);
    // Open in new tab or send via whatsapp API
    const whatsappUrl = `https://api.whatsapp.com/send?text=${urlEncodedText}`;
    window.open(whatsappUrl, "_blank");
  };

  // Dynamic homepage text editor states
  const [textBadge, setTextBadge] = useState("");
  const [textHeroPart1, setTextHeroPart1] = useState("");
  const [textHeroHighlight, setTextHeroHighlight] = useState("");
  const [textHeroDesc, setTextHeroDesc] = useState("");
  const [textTelaoBanner, setTextTelaoBanner] = useState("");
  const [textStationSecTitle, setTextStationSecTitle] = useState("");
  const [textStationSecSub, setTextStationSecSub] = useState("");
  const [textS1Title, setTextS1Title] = useState("");
  const [textS1Desc, setTextS1Desc] = useState("");
  const [textS2Title, setTextS2Title] = useState("");
  const [textS2Desc, setTextS2Desc] = useState("");
  const [textS3Title, setTextS3Title] = useState("");
  const [textS3Desc, setTextS3Desc] = useState("");
  const [textS4Title, setTextS4Title] = useState("");
  const [textS4Desc, setTextS4Desc] = useState("");
  const [textLogoUrl, setTextLogoUrl] = useState("");
  const [logoUpdatedAt, setLogoUpdatedAt] = useState<number>(0);

  // Storage upload debug states
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [firebaseResponse, setFirebaseResponse] = useState("");
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{ name: string; size: string } | null>(null);

  React.useEffect(() => {
    if (homepageTexts) {
      setTextBadge(homepageTexts.badgeText || "");
      setTextHeroPart1(homepageTexts.heroTitlePart1 || "");
      setTextHeroHighlight(homepageTexts.heroTitleHighlight || "");
      setTextHeroDesc(homepageTexts.heroDescription || "");
      setTextTelaoBanner(homepageTexts.telaoBannerText || "");
      setTextStationSecTitle(homepageTexts.stationSectionTitle || "");
      setTextStationSecSub(homepageTexts.stationSectionSubtitle || "");
      setTextS1Title(homepageTexts.station1Title || "");
      setTextS1Desc(homepageTexts.station1Desc || "");
      setTextS2Title(homepageTexts.station2Title || "");
      setTextS2Desc(homepageTexts.station2Desc || "");
      setTextS3Title(homepageTexts.station3Title || "");
      setTextS3Desc(homepageTexts.station3Desc || "");
      setTextS4Title(homepageTexts.station4Title || "");
      setTextS4Desc(homepageTexts.station4Desc || "");
      setTextLogoUrl(homepageTexts.logoUrl || "");
      setLogoUpdatedAt(homepageTexts.logoUpdatedAt || 0);
    }
  }, [homepageTexts]);

  const handleSaveTexts = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/settings/homepage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({
          badgeText: textBadge.trim(),
          heroTitlePart1: textHeroPart1.trim(),
          heroTitleHighlight: textHeroHighlight.trim(),
          heroDescription: textHeroDesc.trim(),
          telaoBannerText: textTelaoBanner.trim(),
          stationSectionTitle: textStationSecTitle.trim(),
          stationSectionSubtitle: textStationSecSub.trim(),
          station1Title: textS1Title.trim(),
          station1Desc: textS1Desc.trim(),
          station2Title: textS2Title.trim(),
          station2Desc: textS2Desc.trim(),
          station3Title: textS3Title.trim(),
          station3Desc: textS3Desc.trim(),
          station4Title: textS4Title.trim(),
          station4Desc: textS4Desc.trim(),
          logoUrl: textLogoUrl,
          logoUpdatedAt: logoUpdatedAt,
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Código ${response.status}`);
      }
      showFeedback("Textos da página principal e logotipo atualizados com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar textos:", err);
      showFeedback("", `Erro ao salvar textos: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  // Clean error messages after time
  const showFeedback = (success: string, error: string = "") => {
    setSuccessText(success);
    setErrorText(error);
    setTimeout(() => {
      setSuccessText("");
      setErrorText("");
    }, 4000);
  };

  // Compute Dashboard Metrics
  const getMetrics = (): DashboardMetrics => {
    const activeReservas = reservations.filter(r => r.status !== "cancelado" && r.status !== "liberada automaticamente");
    const totalReservas = activeReservas.length;

    let faturamentoPrevisto = 0;
    let faturamentoConfirmado = 0;

    activeReservas.forEach(r => {
      if (r.isBrazilGame) {
        const game = games.find(g => g.id === r.gameId);
        let price = r.tableType === "mesa4" 
          ? (game?.priceTable4 || 24) 
          : (game?.priceTable2 || 12);
        
        if (r.hasExtraSeat) {
          price += 6;
        }
        
        faturamentoPrevisto += price;
        if (r.status === "confirmado" || r.status === "ativa") {
          faturamentoConfirmado += price;
        }
      }
    });

    const totalTablesSum = games.reduce((acc, g) => acc + g.tablesTotal4 + g.tablesTotal2, 0);
    const totalOccupiedSum = activeReservas.length;
    const totalBlockedSum = blockedTables.length;
    const mesasRestantes = Math.max(0, totalTablesSum - totalOccupiedSum - totalBlockedSum);

    const reservasGratuitasCount = activeReservas.filter(r => !r.isBrazilGame).length;
    const reservasPagasCount = activeReservas.filter(r => r.isBrazilGame).length;

    return {
      totalReservas,
      faturamentoPrevisto,
      faturamentoConfirmado,
      mesasReservadas: totalOccupiedSum,
      reservasGratuitasCount,
      reservasPagasCount
    };
  };

  const metrics = getMetrics();

  // Reset Game edit form
  const handleOpenCreateForm = () => {
    setEditingGame(null);
    setFormHomeTeam("");
    setFormAwayTeam("");
    setFormDateTime("");
    setFormDescription("");
    setFormAttractions("");
    setFormImageUrl("");
    setFormIsBrazil(false);
    setFormTables4(30);
    setFormTables2(2);
    setFormPrice4(24);
    setFormPrice2(12);
    setFormDisableExtraSeats(false);
    setFormDisableReservations(false);
    setShowGameForm(true);
  };

  const handleOpenEditForm = (game: Game) => {
    setEditingGame(game);
    setFormHomeTeam(game.homeTeam);
    setFormAwayTeam(game.awayTeam);
    
    // Format timestamp back to HTML Date-Time Local string
    try {
      const date = new Date(game.dateTime);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - tzOffset);
      setFormDateTime(localDate.toISOString().slice(0, 16));
    } catch {
      setFormDateTime("");
    }

    setFormDescription(game.description || "");
    setFormAttractions(game.attractions || "");
    setFormImageUrl(game.imageUrl || "");
    setFormIsBrazil(game.isBrazilGame);
    setFormTables4(game.tablesTotal4);
    setFormTables2(game.tablesTotal2);
    setFormPrice4(game.priceTable4);
    setFormPrice2(game.priceTable2);
    setFormDisableExtraSeats(!!game.disableExtraSeats);
    setFormDisableReservations(!!game.disableReservations);
    setShowGameForm(true);
  };

  // Submit games CRUD
  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formHomeTeam || !formAwayTeam || !formDateTime) {
      showFeedback("", "Selecione data, horário e seleções válidas.");
      return;
    }

    setLoading(true);
    try {
      const gamePayload = {
        homeTeam: formHomeTeam.trim(),
        awayTeam: formAwayTeam.trim(),
        dateTime: new Date(formDateTime).toISOString(),
        description: formDescription.trim(),
        attractions: formAttractions.trim(),
        imageUrl: formImageUrl.trim(),
        isBrazilGame: formIsBrazil,
        tablesTotal4: Number(formTables4),
        tablesTotal2: Number(formTables2),
        priceTable4: Number(formPrice4),
        priceTable2: Number(formPrice2),
        disableExtraSeats: !!formDisableExtraSeats,
        disableReservations: !!formDisableReservations,
      };

      if (editingGame) {
        // UPDATE via server-side API
        const response = await fetch("/api/games/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
            "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
          },
          body: JSON.stringify({
            id: editingGame.id,
            ...gamePayload
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro desconhecido ao editar partida.");
        }
        showFeedback("Partida atualizada com sucesso no banco!");
      } else {
        // CREATE via server-side API
        const response = await fetch("/api/games/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
            "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
          },
          body: JSON.stringify(gamePayload)
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro desconhecido ao cadastrar partida.");
        }
        showFeedback("Novo jogo da Copa do Mundo cadastrado!");
      }
      setShowGameForm(false);
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao salvar partida:", err);
      showFeedback("", `Falha ao salvar partida: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete Jogo
  const handleDeleteGame = async (gameId: string) => {
    if (!confirm("Aviso: Deletar este jogo apagará irreversivelmente todas as mesas e as reservas atreladas. Continuar?")) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/games/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({ id: gameId })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao deletar partida via servidor.");
      }

      showFeedback("Jogo excluído com sucesso.");
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao deletar partida:", err);
      showFeedback("", `Falha ao deletar partida: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Manual Status modification
  const handleUpdateStatus = async (resId: string, nextStatus: ReservationStatus) => {
    try {
      const response = await fetch("/api/reservations/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({
          reservationId: resId,
          nextStatus
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Sem detalhes ao alterar status.");
      }

      showFeedback(`Status da reserva alterado para: ${nextStatus}`);
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao alterar status da reserva:", err);
      showFeedback("", `Falha ao alterar status da reserva: ${err.message || err}`);
    }
  };

  // Perform table blocking or manual booking
  const handleBlockAction = async (action: "block" | "unblock" | "manual_book") => {
    if (!selectedGameId) {
      showFeedback("", "Selecione uma partida válida.");
      return;
    }
    if (!blockTableNumber || Number(blockTableNumber) <= 0) {
      showFeedback("", "Insera um número de mesa correto.");
      return;
    }

    const game = games.find(g => g.id === selectedGameId);
    if (!game) return;

    const maxTables = blockTableType === "mesa4" ? game.tablesTotal4 : game.tablesTotal2;
    if (Number(blockTableNumber) > maxTables) {
      showFeedback("", `O número inserido ultrapassa o limite de mesas deste tipo (${maxTables}).`);
      return;
    }

    // Checking if already occupied
    const stringId = `${selectedGameId}_${blockTableType}_${blockTableNumber}`;
    setLoading(true);

    try {
      if (action === "block") {
        // Create Block record via API
        const response = await fetch("/api/tables/block", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
            "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
          },
          body: JSON.stringify({
            gameId: selectedGameId,
            tableType: blockTableType,
            tableNumber: Number(blockTableNumber),
            action: "block"
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao bloquear mesa.");
        }
        showFeedback(`Mesa #${blockTableNumber} foi BLOQUEADA temporariamente.`);
      } else if (action === "unblock") {
        const blk = blockedTables.find(
          b => b.gameId === selectedGameId && b.tableType === blockTableType && b.tableNumber === Number(blockTableNumber)
        );
        if (blk) {
          const response = await fetch("/api/tables/block", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
              "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
            },
            body: JSON.stringify({
              gameId: selectedGameId,
              tableType: blockTableType,
              tableNumber: Number(blockTableNumber),
              action: "unblock"
            })
          });

          if (!response.ok) {
            // fallback delete directly if API fails (legacy format)
            await deleteDoc(doc(db, "blockedTables", blk.id));
          }
          showFeedback(`Mesa #${blockTableNumber} DESBLOQUEADA com sucesso.`);
        } else {
          showFeedback("", "Nenhum bloqueio encontrado para cancelar.");
        }
      } else if (action === "manual_book") {
        if (!manualClientName.trim() || !manualClientPhone.trim()) {
          showFeedback("", "Defina nome e telefone para reserva administrativa.");
          setLoading(false);
          return;
        }

        const batch = writeBatch(db);
        const reservationsRef = collection(db, "reservations");
        const newReservationRef = doc(reservationsRef);
        const resId = newReservationRef.id;

        const resPayload = {
          id: resId,
          gameId: selectedGameId,
          gameName: `${game.homeTeam} vs ${game.awayTeam}`,
          gameDateTime: game.dateTime,
          isBrazilGame: game.isBrazilGame,
          clientName: manualClientName.trim(),
          clientPhone: manualClientPhone.trim(),
          paxCount: blockTableType === "mesa4" ? 4 : 2,
          tableType: blockTableType,
          tableNumber: Number(blockTableNumber),
          status: "confirmado" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const availabilityId = `${selectedGameId}_${blockTableType}_${blockTableNumber}`;
        const availabilityData = {
          reservationId: resId,
          gameId: selectedGameId,
          tableType: blockTableType,
          tableNumber: Number(blockTableNumber),
          status: "confirmado",
          updatedAt: new Date().toISOString()
        };

        batch.set(newReservationRef, resPayload);
        batch.set(doc(db, "availability", availabilityId), availabilityData);

        await batch.commit();
        showFeedback(`Mesa #${blockTableNumber} reservada manualmente para ${manualClientName}.`);
        
        // Reset manual inputs
        setManualClientName("");
        setManualClientPhone("");
      }

      setBlockTableNumber("");
      onRefresh();
    } catch (err: any) {
      console.error("Erro na ação administrativa:", err);
      showFeedback("", `Falha na ação administrativa: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // DASHBOARD ACTION: Block table
  const handleDashBlock = async (type: "mesa4" | "mesa2", number: number) => {
    const activeGameId = dashSelectedGameId || games[0]?.id || "";
    if (!activeGameId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/tables/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({
          gameId: activeGameId,
          tableType: type,
          tableNumber: number,
          action: "block"
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao bloquear mesa.");
      }

      showFeedback(`Mesa #${number} bloqueada com sucesso!`);
      setDashSelectedTable(null);
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao bloquear mesa:", err);
      showFeedback("", `Falha ao bloquear mesa: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // DASHBOARD ACTION: Unblock table
  const handleDashUnblock = async (blockId: string, number: number) => {
    setLoading(true);
    try {
      const blk = blockedTables.find(b => b.id === blockId);
      const gameId = blk?.gameId || dashSelectedGameId || games[0]?.id || "";
      const tableType = blk?.tableType || (blockTableType as "mesa4" | "mesa2");
      const tableNumber = blk?.tableNumber || number;

      const response = await fetch("/api/tables/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-uid": auth.currentUser?.uid || "local_bypass_admin",
          "x-admin-email": auth.currentUser?.email || "andrecalixtolima@gmail.com"
        },
        body: JSON.stringify({
          gameId,
          tableType,
          tableNumber,
          action: "unblock"
        })
      });

      if (!response.ok) {
        // Fallback deletion directly
        await deleteDoc(doc(db, "blockedTables", blockId));
      }

      showFeedback(`Mesa #${number} desbloqueada com sucesso!`);
      setDashSelectedTable(null);
      onRefresh();
    } catch (err: any) {
      console.error("Erro ao desbloquear mesa:", err);
      showFeedback("", `Falha ao desbloquear mesa: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // DASHBOARD ACTION: Direct Manual Register
  const handleDashManualRegister = async (type: "mesa4" | "mesa2", number: number) => {
    const activeGameId = dashSelectedGameId || games[0]?.id || "";
    const game = games.find(g => g.id === activeGameId);
    if (!activeGameId || !game) {
      showFeedback("", "Selecione uma partida válida.");
      return;
    }
    if (!dashManualClientName.trim() || !dashManualClientPhone.trim()) {
      showFeedback("", "Preencha o Nome e o WhatsApp do cliente.");
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const resCollectionRef = collection(db, "reservations");
      const newResDocRef = doc(resCollectionRef);
      const resId = newResDocRef.id;

      const resPayload = {
        id: resId,
        gameId: activeGameId,
        gameName: `${game.homeTeam} vs ${game.awayTeam}`,
        gameDateTime: game.dateTime,
        isBrazilGame: game.isBrazilGame,
        clientName: dashManualClientName.trim(),
        clientPhone: dashManualClientPhone.trim(),
        paxCount: type === "mesa4" ? 4 : 2,
        tableType: type,
        tableNumber: number,
        status: "confirmado" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const availabilityId = `${activeGameId}_${type}_${number}`;
      const availabilityData = {
        reservationId: resId,
        gameId: activeGameId,
        tableType: type,
        tableNumber: number,
        status: "confirmado",
        updatedAt: new Date().toISOString()
      };

      batch.set(newResDocRef, resPayload);
      batch.set(doc(db, "availability", availabilityId), availabilityData);

      await batch.commit();
      showFeedback(`Reserva direta efetuada para a Mesa #${number}!`);
      
      setDashManualClientName("");
      setDashManualClientPhone("");
      setDashSelectedTable(null);
      onRefresh();
    } catch (err: any) {
      console.error("Erro no registro manual da mesa:", err);
      showFeedback("", `Falha no registro manual: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-soccer-dark/40 border border-soccer-field/90 rounded-3xl p-6 md:p-8 space-y-8 shadow-xl animate-fade-in">
      
      {/* Tab Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-soccer-field/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-soccer-gold animate-pulse" />
            <span className="font-mono text-xs uppercase text-soccer-gold tracking-widest font-black">
              CONSERGE ADMIN PAINEL
            </span>
          </div>
          <h2 className="text-2xl font-display font-black text-soccer-cream">Controle Geral do Quinteiro</h2>
        </div>

        <div className="flex flex-wrap bg-[#03150b] p-1 rounded-xl border border-soccer-field/80 text-xs font-mono">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "dashboard" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("games")}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "games" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            Jogos ({games.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("reservations");
              if (games.length > 0 && !selectedGameId) setSelectedGameId(games[0].id);
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "reservations" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            Reservas ({reservations.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("blocking");
              if (games.length > 0 && !selectedGameId) setSelectedGameId(games[0].id);
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "blocking" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            Bloquear Mesas
          </button>
          <button
            onClick={() => {
              setActiveTab("texts");
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "texts" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            Editar Textos
          </button>
          <button
            onClick={() => {
              setActiveTab("admins");
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "admins" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            🔑 Admins & Auditoria
          </button>
          <button
            onClick={() => {
              setActiveTab("backup");
            }}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "backup" ? "bg-soccer-gold text-soccer-dark font-bold" : "text-soccer-cream/70 hover:text-soccer-cream"
            }`}
          >
            📦 Backup & Recovery
          </button>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {successText && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successText}</span>
        </div>
      )}
      {errorText && (
        <div className="bg-soccer-neon/10 border border-soccer-neon/30 text-soccer-cream p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-soccer-neon" />
          <span>{errorText}</span>
        </div>
      )}

      {/* TAB 1: DASHBOARD METRICS */}
      {activeTab === "dashboard" && (
        <div className="space-y-8 animate-fade-in text-soccer-cream">
          
          {/* Analytical Bento Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total Reservas */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.01]">
              <div className="p-3 bg-soccer-gold/10 border border-soccer-gold/30 rounded-xl">
                <Users className="w-6 h-6 text-soccer-gold" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Reservas Ativas
                </span>
                <span className="font-display text-2xl font-black text-soccer-cream font-mono">
                  {metrics.totalReservas}
                </span>
              </div>
              <div className="absolute top-2 right-2 flex gap-1 text-[8px] font-mono text-soccer-cream/40">
                <span>Pagas: {metrics.reservasPagasCount}</span>
                <span>•</span>
                <span>Grátis: {metrics.reservasGratuitasCount}</span>
              </div>
            </div>

            {/* Faturamento Previsto */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative shadow-lg transition-transform hover:scale-[1.01]">
              <div className="p-3 bg-soccer-orange/10 border border-soccer-orange/30 rounded-xl">
                <DollarSign className="w-6 h-6 text-soccer-gold animate-bounce" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Faturamento Projetado
                </span>
                <span className="font-display text-2xl font-black text-soccer-gold font-mono">
                  R$ {metrics.faturamentoPrevisto},00
                </span>
              </div>
            </div>

            {/* Faturamento Confirmado */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative shadow-lg transition-transform hover:scale-[1.01]">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Faturamento Recebido
                </span>
                <span className="font-display text-2xl font-black text-emerald-400 font-mono">
                  R$ {metrics.faturamentoConfirmado},00
                </span>
              </div>
            </div>

            {/* Mesas Disponíveis */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative shadow-lg transition-transform hover:scale-[1.01]">
              <div className="p-3 bg-soccer-neon/10 border border-soccer-neon/30 rounded-xl">
                <Layers className="w-6 h-6 text-soccer-neon" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Mesas Ocupadas
                </span>
                <span className="font-display text-2xl font-black text-soccer-cream font-mono">
                  {metrics.mesasReservadas} mesas
                </span>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT AREA: OCCUPATION PER GAME LIST & METRICS */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-soccer-dark border border-soccer-field/80 p-5 rounded-2xl space-y-4 shadow-xl">
                <h3 className="font-display font-black text-sm tracking-tight text-soccer-gold uppercase flex items-center gap-2">
                  <Database className="w-4 h-4 text-soccer-gold" />
                  Ocupação por Partida
                </h3>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {games.map(g => {
                    const activeRes = reservations.filter(
                      r => r.gameId === g.id && r.status !== "cancelado" && r.status !== "liberada automaticamente"
                    );
                    const blockedCount = blockedTables.filter(b => b.gameId === g.id).length;
                    const totalTables = g.tablesTotal4 + g.tablesTotal2;
                    const occupiedAndBlocked = activeRes.length + blockedCount;
                    const percent = totalTables > 0 ? Math.round((occupiedAndBlocked / totalTables) * 100) : 0;
                    
                    const isSelected = (dashSelectedGameId || (games[0]?.id || "")) === g.id;

                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setDashSelectedGameId(g.id);
                          setDashSelectedTable(null);
                        }}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-soccer-field border-soccer-gold/60 glow-soccer-gold"
                            : "bg-[#03150b] border-soccer-field/40 hover:border-soccer-gold/30 hover:bg-soccer-field/15"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-display font-bold text-white uppercase block truncate max-w-[170px]">
                            {g.homeTeam} vs {g.awayTeam}
                          </span>
                          <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded ${
                            percent >= 80 ? "bg-red-950 text-red-400" : percent >= 40 ? "bg-yellow-950 text-soccer-gold" : "bg-emerald-950 text-emerald-400"
                          }`}>
                            {percent}%
                          </span>
                        </div>
                        <div className="text-[10px] text-white/50 font-mono mt-1">
                          Mesas: {occupiedAndBlocked} / {totalTables} • Bloqueadas: {blockedCount}
                        </div>
                        
                        {/* Custom visual progress bar */}
                        <div className="w-full bg-[#051c0f] h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              percent >= 80 ? "bg-red-500" : percent >= 40 ? "bg-soccer-gold" : "bg-emerald-400"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}

                  {games.length === 0 && (
                    <p className="text-xs text-white/40 italic text-center py-6">Nenhuma partida registrada no Quinteiro.</p>
                  )}
                </div>
              </div>

              {/* AUTOMATION EXPLAINER CARD */}
              <div className="bg-soccer-field/20 border border-soccer-gold/20 p-5 rounded-2xl text-xs space-y-2">
                <span className="font-display font-bold text-soccer-gold block text-xs tracking-wider uppercase">Monitoramento & Resiliência:</span>
                <p className="text-soccer-cream/80 text-[11px] leading-relaxed font-sans">
                  A nossa camada de observabilidade do Express e Firestore monitora o status das reservas continuamente. Reservas do tipo <strong className="text-soccer-gold">Gratuito</strong> sem presença validada em jogos iminentes são expiradas de forma a otimizar a receita real do Quinteiro.
                </p>
                <div className="pt-2 flex items-center gap-2 border-t border-soccer-gold/15">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[9px] text-[#f5f5f0]/60 uppercase">Conexão do Banco Ativa</span>
                </div>
              </div>

            </div>

            {/* RIGHT AREA: THE INTERACTIVE GRAPHICAL TABLE MAP OF THE BAR */}
            <div className="lg:col-span-8 space-y-4">
              
              {/* Dynamic Game Variable configuration */}
              {(() => {
                const activeGameId = dashSelectedGameId || games[0]?.id || "";
                const activeGame = games.find(g => g.id === activeGameId);
                
                if (!activeGame) {
                  return (
                    <div className="bg-soccer-dark border border-soccer-field/80 p-8 rounded-2xl text-center text-soccer-cream/50 italic">
                      Por favor, crie ou selecione uma partida para gerar o mapa de mesas interativo.
                    </div>
                  );
                }

                // Calculations
                const activeRes = reservations.filter(
                  r => r.gameId === activeGameId && r.status !== "cancelado" && r.status !== "liberada automaticamente"
                );
                const activeBlocks = blockedTables.filter(b => b.gameId === activeGameId);

                const getTableStatus = (type: "mesa4" | "mesa2", number: number) => {
                  const matchingRes = activeRes.find(r => r.tableType === type && r.tableNumber === number);
                  const matchingBlock = activeBlocks.find(b => b.tableType === type && b.tableNumber === number);
                  
                  if (matchingBlock) return { status: "blocked" as const, block: matchingBlock };
                  if (matchingRes) return { status: "reserved" as const, res: matchingRes };
                  return { status: "free" as const };
                };

                return (
                  <div className="bg-soccer-dark border border-soccer-field/80 p-5 md:p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
                    
                    {/* Background Field Lines Overlay for Football Stadium Feel */}
                    <div className="absolute inset-x-o top-[-20%] bottom-[-20%] pointer-events-none opacity-[0.04] bg-[radial-gradient(#ebd152_2px,transparent_2px)] [background-size:16px_16px]" />
                    <div className="absolute inset-y-0 left-1/2 w-0.5 border-dashed border-2 border-soccer-gold/25 pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-soccer-gold/25 pointer-events-none" />

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-soccer-field/60 pb-4 relative z-10">
                      <div>
                        <span className="text-[9px] font-mono text-soccer-gold font-bold uppercase tracking-widest block">MAPA DE OCUPAÇÃO EM TEMPO REAL</span>
                        <h4 className="font-display font-black text-lg text-white uppercase mt-0.5">
                          {activeGame.homeTeam} vs {activeGame.awayTeam}
                        </h4>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex items-center gap-1 text-[10px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          Livre
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono bg-red-950 border border-red-900 text-red-400 px-2 py-0.5 rounded">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Reservado
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono bg-yellow-950 border border-soccer-gold/30 text-soccer-gold px-2 py-0.5 rounded">
                          <span className="w-2 h-2 rounded-full bg-soccer-gold" />
                          Bloqueado
                        </span>
                      </div>
                    </div>

                    {/* TWO GROUPS: MESA 4 E MESA 2 */}
                    <div className="space-y-6 relative z-10">
                      
                      {/* MESAS DE 4 SEATS */}
                      <div className="space-y-3">
                        <div className="text-xs font-display font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-soccer-gold" />
                          Mesas de 4 Lugares ({activeGame.tablesTotal4} Mesas Oficiais)
                        </div>

                        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
                          {Array.from({ length: activeGame.tablesTotal4 }, (_, idx) => {
                            const tableNum = idx + 1;
                            const tState = getTableStatus("mesa4", tableNum);
                            const isInspected = dashSelectedTable?.type === "mesa4" && dashSelectedTable?.number === tableNum;

                            return (
                              <button
                                key={`m4_${tableNum}`}
                                type="button"
                                onClick={() => {
                                  setDashSelectedTable({ type: "mesa4", number: tableNum });
                                  setDashManualClientName("");
                                  setDashManualClientPhone("");
                                }}
                                className={`h-11 rounded-lg font-mono text-xs text-center font-bold relative flex items-center justify-center transition-all cursor-pointer border ${
                                  isInspected
                                    ? "bg-soccer-gold text-soccer-dark border-white scale-105 shadow-md z-20 font-black animate-pulse"
                                    : tState.status === "blocked"
                                    ? "bg-yellow-950/40 text-soccer-gold border-soccer-gold/40 hover:bg-yellow-950/60"
                                    : tState.status === "reserved"
                                    ? "bg-red-950/30 text-red-300 border-red-500/40 hover:bg-red-950/50"
                                    : "bg-[#03150b] text-emerald-400 border-soccer-field/50 hover:bg-soccer-field/30 hover:border-emerald-400"
                                }`}
                                title={`Mesa M4 #${tableNum}`}
                              >
                                {tableNum}
                                {tState.status === "blocked" && <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-soccer-gold" />}
                                {tState.status === "reserved" && <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* MESAS DE 2 SEATS */}
                      <div className="space-y-3 pt-2">
                        <div className="text-xs font-display font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-soccer-orange" />
                          Mesas Bistrô de 2 Lugares ({activeGame.tablesTotal2} Mesas Extra)
                        </div>

                        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5">
                          {Array.from({ length: activeGame.tablesTotal2 }, (_, idx) => {
                            const tableNum = idx + 1;
                            const tState = getTableStatus("mesa2", tableNum);
                            const isInspected = dashSelectedTable?.type === "mesa2" && dashSelectedTable?.number === tableNum;

                            return (
                              <button
                                key={`m2_${tableNum}`}
                                type="button"
                                onClick={() => {
                                  setDashSelectedTable({ type: "mesa2", number: tableNum });
                                  setDashManualClientName("");
                                  setDashManualClientPhone("");
                                }}
                                className={`h-11 rounded-lg font-mono text-xs text-center font-bold relative flex items-center justify-center transition-all cursor-pointer border ${
                                  isInspected
                                    ? "bg-soccer-gold text-soccer-dark border-white scale-105 shadow-md z-20 font-black animate-pulse"
                                    : tState.status === "blocked"
                                    ? "bg-yellow-950/40 text-soccer-gold border-soccer-gold/40 hover:bg-yellow-950/60"
                                    : tState.status === "reserved"
                                    ? "bg-red-950/30 text-red-300 border-red-500/40 hover:bg-red-950/50"
                                    : "bg-[#03150b] text-[#ebd152] border-soccer-field/50 hover:bg-soccer-field/30 hover:border-[#ebd152]"
                                }`}
                                title={`Mesa M2 #${tableNum}`}
                              >
                                M2-{tableNum}
                                {tState.status === "blocked" && <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-soccer-gold" />}
                                {tState.status === "reserved" && <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* DYNAMIC QUICK BOTTOM SHEET / INSPECT CARD FOR CLI-SELECTION */}
                    {dashSelectedTable && (() => {
                      const tState = getTableStatus(dashSelectedTable.type, dashSelectedTable.number);
                      
                      return (
                        <div className="bg-[#03150b] border-2 border-soccer-gold/60 p-5 rounded-2xl space-y-4 animate-fade-in relative z-20 mt-4 shadow-2xl">
                          <div className="flex justify-between items-center pb-2 border-b border-soccer-field/50">
                            <h5 className="font-display font-bold text-xs uppercase text-soccer-gold tracking-widest">
                              Inspeção Rápida: {dashSelectedTable.type === "mesa4" ? "Mesa 4 Lugares" : "Bistrô 2 Lugares"} #{dashSelectedTable.number}
                            </h5>
                            <button
                              type="button"
                              onClick={() => setDashSelectedTable(null)}
                              className="text-white/40 hover:text-white hover:bg-white/5 p-1 rounded-full cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {tState.status === "free" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                              {/* Option A: Quick block table */}
                              <div className="space-y-2">
                                <p className="text-[11px] text-white/70">A mesa está <strong className="text-emerald-400">livre</strong>. Escolha uma ação rápida abaixo:</p>
                                <button
                                  type="button"
                                  onClick={() => handleDashBlock(dashSelectedTable.type, dashSelectedTable.number)}
                                  className="w-full py-2 bg-yellow-950 hover:bg-soccer-gold hover:text-black border border-soccer-gold/40 text-soccer-gold rounded-lg font-mono text-[11px] uppercase tracking-wide font-bold transition-all cursor-pointer"
                                >
                                  Bloquear Mesa Temporariamente
                                </button>
                              </div>

                              {/* Option B: Quick manual reservation */}
                              <div className="bg-[#051c0f]/80 p-3.5 border border-soccer-field rounded-xl space-y-2 text-left">
                                <span className="text-[10px] font-mono text-soccer-gold font-bold block uppercase">Reserva Manual Direta</span>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    placeholder="Nome do cliente"
                                    value={dashManualClientName}
                                    onChange={(e) => setDashManualClientName(e.target.value)}
                                    className="w-full bg-[#03150b] border border-soccer-field text-xs px-2.5 py-1.5 rounded-lg focus:border-soccer-gold outline-none"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Telefone / WhatsApp"
                                    value={dashManualClientPhone}
                                    onChange={(e) => setDashManualClientPhone(e.target.value)}
                                    className="w-full bg-[#03150b] border border-soccer-field text-xs px-2.5 py-1.5 rounded-lg focus:border-soccer-gold outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleDashManualRegister(dashSelectedTable.type, dashSelectedTable.number)}
                                    className="w-full py-1.5 bg-soccer-gold text-soccer-dark font-display font-black text-[10px] uppercase rounded-lg hover:bg-yellow-500 cursor-pointer"
                                  >
                                    Registrar Reserva Manual
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {tState.status === "blocked" && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c130b] p-3 rounded-xl border border-yellow-950">
                              <div className="text-[11px]">
                                <span className="text-soccer-gold font-bold uppercase font-mono block">Status: MESA BLOQUEADA</span>
                                <p className="text-white/60 text-xs font-sans">Mesa reservada para uso logístico / VIP.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDashUnblock(tState.block!.id, dashSelectedTable.number)}
                                className="px-4 py-2 bg-emerald-950/80 border border-emerald-700 text-emerald-400 hover:bg-emerald-800 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                              >
                                Desbloquear Mesa
                              </button>
                            </div>
                          )}

                          {tState.status === "reserved" && (
                            <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-xl space-y-3 text-left">
                              <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest font-black block">TUTOR DA RESERVA ATIVA</span>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="text-[#f5f5f0]/40 font-mono text-[9px] block uppercase">Titular</span>
                                  <span className="font-bold text-white block truncate">{tState.res!.clientName}</span>
                                </div>
                                <div>
                                  <span className="text-[#f5f5f0]/40 font-mono text-[9px] block uppercase">Telefone</span>
                                  <span className="font-mono text-soccer-gold block">{tState.res!.clientPhone}</span>
                                </div>
                                <div>
                                  <span className="text-[#f5f5f0]/40 font-mono text-[9px] block uppercase">Status Financeiro</span>
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono mt-0.5 ${
                                    tState.res!.status === "confirmado" ? "bg-emerald-950 text-emerald-400" : "bg-yellow-950 text-soccer-gold"
                                  }`}>
                                    {tState.res!.status}
                                  </span>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-red-900/40 flex justify-end gap-2 text-xs">
                                {tState.res!.status === "aguardando comprovante" && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(tState.res!.id, "confirmado")}
                                    className="px-3 py-1.5 bg-emerald-950 border border-emerald-800 hover:bg-emerald-900 text-emerald-300 font-mono text-[10px] rounded uppercase font-bold cursor-pointer"
                                  >
                                    Confirmar Pix Manualmente
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(tState.res!.id, "cancelado")}
                                  className="px-3 py-1.5 bg-red-950/80 border border-red-800 hover:bg-red-800 hover:text-white text-red-400 font-mono text-[10px] rounded uppercase font-bold cursor-pointer"
                                >
                                  Cancelar Reserva
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })()}

                  </div>
                );
              })()}

            </div>

          </div>

        </div>
      )}

      {/* TAB 2: GAMES CRUD LIST */}
      {activeTab === "games" && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="flex justify-between items-center bg-[#03150b] p-4 rounded-2xl border border-soccer-field">
            <span className="text-xs text-soccer-cream/70 font-mono">Crie jogos, defina se cobra Pix, atrações, djs, etc.</span>
            <button
              id="admin_create_game_btn"
              onClick={handleOpenCreateForm}
              className="px-4 py-2 bg-soccer-gold text-soccer-dark rounded-xl text-xs font-display font-bold flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Jogo
            </button>
          </div>

          {/* GAME EDIT FORM CONTAINER */}
          {showGameForm && (
            <form onSubmit={handleSaveGame} className="bg-[#03150b]/80 border border-soccer-gold/30 p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-soccer-field pb-3">
                <h3 className="text-base font-display font-bold text-soccer-gold">
                  {editingGame ? "Editar Jogo" : "Cadastrar Novo Jogo da Copa"}
                </h3>
                <button
                  id="admin_close_game_form"
                  type="button"
                  onClick={() => setShowGameForm(false)}
                  className="p-1 hover:bg-soccer-field rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Seleção A (Casa)</label>
                  <input
                    id="game_home_input"
                    type="text"
                    required
                    value={formHomeTeam}
                    onChange={(e) => setFormHomeTeam(e.target.value)}
                    placeholder="Ex: Brasil"
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Seleção B (Visitante)</label>
                  <input
                    id="game_away_input"
                    type="text"
                    required
                    value={formAwayTeam}
                    onChange={(e) => setFormAwayTeam(e.target.value)}
                    placeholder="Ex: Alemanha"
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Data e Hora do Chute Inicial</label>
                  <input
                    id="game_date_input"
                    type="datetime-local"
                    required
                    value={formDateTime}
                    onChange={(e) => setFormDateTime(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Atração Musical / DJs</label>
                  <input
                    id="game_attractions_input"
                    type="text"
                    value={formAttractions}
                    onChange={(e) => setFormAttractions(e.target.value)}
                    placeholder="Ex: DJ Rafa Goulart, Show de Pagode"
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">URL da Imagem de Cartaz (Opcional)</label>
                  <input
                    id="game_image_input"
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Breve Descrição do Jogo</label>
                  <textarea
                    id="game_desc_input"
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Descreva detalhes, importância do jogo ou promoções..."
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none"
                  />
                </div>

                {/* Pricing toggles and volumes */}
                <div className="border-t border-soccer-field/60 pt-4 md:col-span-2 space-y-4">
                  <div className="flex items-center gap-3 bg-soccer-field/30 p-3 rounded-lg border border-soccer-field">
                    <input
                      id="game_isbrazil_toggle"
                      type="checkbox"
                      checked={formIsBrazil}
                      onChange={(e) => setFormIsBrazil(e.target.checked)}
                      className="w-4 h-4 text-soccer-gold border-soccer-gold rounded focus:ring-soccer-gold"
                    />
                    <div>
                      <label htmlFor="game_isbrazil_toggle" className="block text-xs font-bold text-soccer-cream cursor-pointer">
                        Jogo Comercial Seleção Brasileira?
                      </label>
                      <span className="text-[10px] text-soccer-cream/50">Mesas para jogos do Brasil necessitam de comprovação de PIX.</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-red-950/40 p-3 rounded-lg border border-red-900/40">
                    <input
                      id="game_disable_reservations_toggle"
                      type="checkbox"
                      checked={formDisableReservations}
                      onChange={(e) => setFormDisableReservations(e.target.checked)}
                      className="w-4 h-4 text-soccer-gold border-soccer-gold rounded focus:ring-soccer-gold"
                    />
                    <div>
                      <label htmlFor="game_disable_reservations_toggle" className="block text-xs font-bold text-red-200 cursor-pointer">
                        🚫 Bloquear Totalmente as Reservas deste Jogo (Dia)?
                      </label>
                      <span className="text-[10px] text-red-100/70">Se ativado, impede totalmente que qualquer cliente realize reservas de mesa para esta partida/data.</span>
                    </div>
                  </div>

                  {formIsBrazil && (
                    <div className="flex items-center gap-3 bg-red-950/20 p-3 rounded-lg border border-red-900/30">
                      <input
                        id="game_disable_extras_toggle"
                        type="checkbox"
                        checked={formDisableExtraSeats}
                        onChange={(e) => setFormDisableExtraSeats(e.target.checked)}
                        className="w-4 h-4 text-soccer-gold border-soccer-gold rounded focus:ring-soccer-gold"
                      />
                      <div>
                        <label htmlFor="game_disable_extras_toggle" className="block text-xs font-bold text-soccer-cream cursor-pointer">
                          Bloquear Cadeiras / Ingressos Extras para esta Data?
                        </label>
                        <span className="text-[10px] text-soccer-cream/50">Se ativado, não permitirá que os clientes adicionem cadeira extra (Ímpar) nesta data / jogo.</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-soccer-cream/50 mb-0.5">Total Mesas (4p)</label>
                      <input
                        id="form_tables4_input"
                        type="number"
                        value={formTables4}
                        onChange={(e) => setFormTables4(Number(e.target.value))}
                        className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded p-2.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-soccer-cream/50 mb-0.5">Total Mesas (2p)</label>
                      <input
                        id="form_tables2_input"
                        type="number"
                        value={formTables2}
                        onChange={(e) => setFormTables2(Number(e.target.value))}
                        className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded p-2.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-soccer-cream/50 mb-0.5">Preço Mesa (4p)</label>
                      <input
                        id="form_price4_input"
                        type="number"
                        value={formPrice4}
                        onChange={(e) => setFormPrice4(Number(e.target.value))}
                        className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded p-2.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-mono text-soccer-cream/50 mb-0.5">Preço Mesa (2p)</label>
                      <input
                        id="form_price2_input"
                        type="number"
                        value={formPrice2}
                        onChange={(e) => setFormPrice2(Number(e.target.value))}
                        className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded p-2.5"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-soccer-field/50">
                <button
                  id="cancel_save_game_btn"
                  type="button"
                  onClick={() => setShowGameForm(false)}
                  className="px-4 py-2 bg-soccer-field hover:bg-soccer-field/80 text-soccer-cream rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  id="submit_save_game_btn"
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-soccer-gold text-soccer-dark font-display font-bold rounded-xl text-xs"
                >
                  {loading ? "Salvando..." : "Salvar Configuração"}
                </button>
              </div>
            </form>
          )}

          {/* GAMES SELECTIONS TABLE */}
          <div className="overflow-x-auto bg-[#03150b] rounded-2xl border border-soccer-field">
            <table className="w-full text-left text-xs text-soccer-cream">
              <thead className="bg-soccer-field/30 uppercase text-[10px] font-mono text-soccer-gold border-b border-soccer-field">
                <tr>
                  <th className="px-6 py-4">Seleções</th>
                  <th className="px-6 py-4">Horário</th>
                  <th className="px-6 py-4">Tipo Jogo</th>
                  <th className="px-6 py-4">Capacidade Configurada</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soccer-field/50">
                {games.map((game) => (
                  <tr key={game.id} className="hover:bg-soccer-field/20">
                    <td className="px-6 py-4 font-display font-bold text-sm">
                      {game.homeTeam} vs {game.awayTeam}
                    </td>
                    <td className="px-6 py-4 font-mono">
                      {new Date(game.dateTime).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-6 py-4">
                      {game.isBrazilGame ? (
                        <span className="px-2 py-0.5 bg-soccer-neon/10 border border-soccer-neon/30 rounded text-[9px] font-mono font-bold text-soccer-neon uppercase">
                          Brasil (Pago R$ {game.priceTable4})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-soccer-gold/10 border border-soccer-gold/30 rounded text-[9px] font-mono font-bold text-soccer-gold uppercase">
                          Gratuito
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-soccer-cream/70 text-[11px]">
                      {game.tablesTotal4}x Mesa de 4 | {game.tablesTotal2}x Mesa de 2
                    </td>
                    <td className="px-6 py-4 text-right flex gap-1 justify-end">
                      <button
                        id={`admin_edit_game_inline_${game.id}`}
                        onClick={() => handleOpenEditForm(game)}
                        className="p-2 bg-soccer-field/60 hover:bg-soccer-field hover:text-soccer-gold rounded-lg transition-colors"
                        title="Modificar Jogo"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`admin_delete_game_inline_${game.id}`}
                        onClick={() => handleDeleteGame(game.id)}
                        className="p-2 bg-red-950/40 hover:bg-red-900 border border-red-800/20 text-red-400 rounded-lg transition-colors"
                        title="Remover Jogo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 3: RESERVATIONS VISUALIZATION */}
      {activeTab === "reservations" && (
        <div className="space-y-6 animate-fade-in text-soccer-cream">
          
          {/* Subtabs for Active vs Trash Bin (Lixeira) */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#03150b] p-4 rounded-2xl border border-soccer-field/50">
            <div className="flex bg-[#051c0f]/80 p-1 rounded-xl border border-soccer-field/40">
              <button
                id="res_subtab_active_btn"
                type="button"
                onClick={() => setReservationSubTab("active")}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
                  reservationSubTab === "active"
                    ? "bg-soccer-field text-soccer-gold shadow"
                    : "text-soccer-cream/60 hover:text-soccer-cream hover:bg-soccer-field/20"
                }`}
              >
                Ativas & Confirmadas ({reservations.filter(r => r.status !== "cancelado" && r.status !== "liberada automaticamente").length})
              </button>
              <button
                id="res_subtab_trash_btn"
                type="button"
                onClick={() => setReservationSubTab("trash")}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
                  reservationSubTab === "trash"
                    ? "bg-red-900/80 text-red-100 border border-red-700 shadow"
                    : "text-soccer-cream/50 hover:text-red-400 hover:bg-red-950/20"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                Lixeira ({reservations.filter(r => r.status === "cancelado" || r.status === "liberada automaticamente").length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Same Client Grouping Toggle (Somar Pessoas) */}
              <label className="flex items-center gap-2.5 bg-[#051c0f] border border-soccer-field px-4 py-2 rounded-xl text-xs font-mono text-soccer-gold cursor-pointer hover:border-soccer-gold/60 transition-colors">
                <input
                  id="group_same_client_checkbox"
                  type="checkbox"
                  checked={groupSameClient}
                  onChange={(e) => setGroupSameClient(e.target.checked)}
                  className="w-4 h-4 accent-soccer-field border-soccer-field rounded focus:ring-0 cursor-pointer"
                />
                <span>Somar / Agrupar Mesas do Mesmo Cliente 👥</span>
              </label>

              {/* Mandar Resumo WhatsApp Button */}
              <button
                id="send_whatsapp_summary_btn"
                type="button"
                onClick={handleSendWhatsAppSummary}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white border border-emerald-500 px-4 py-2 rounded-xl text-xs font-mono font-bold cursor-pointer transition-all hover:scale-[1.02]"
                title="Mandar resumo das reservas filtradas por WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-100" />
                <span>Mandar Resumo WhatsApp 💬</span>
              </button>
            </div>
          </div>

          {/* Reservation Filtering tools */}
          <div className="bg-[#03150b] p-5 rounded-2xl border border-soccer-field/90 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">Filtrar por Partida</label>
              <select
                id="admin_filter_game_select"
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 pl-3 pr-8 text-xs text-soccer-cream"
              >
                <option value="">-- Todas as Copas --</option>
                {[...games].sort((a,b) => a.homeTeam.localeCompare(b.homeTeam, "pt-BR")).map(g => (
                  <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">🔍 Pesquisar Reserva (Nome / Fone)</label>
              <div className="relative">
                <input
                  id="admin_reservations_search_input"
                  type="text"
                  value={resSearchQuery}
                  onChange={(e) => setResSearchQuery(e.target.value)}
                  placeholder="Ex: André ou 3197..."
                  className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream placeholder-soccer-cream/30 outline-none focus:border-soccer-gold transition-all"
                />
                {resSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setResSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-soccer-cream/40 hover:text-soccer-cream hover:bg-white/5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-col justify-end">
              <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase text-right mb-1">Total Exibição no Filtro</span>
              <span className="text-right text-xs font-mono font-bold text-soccer-gold">
                {groupSameClient ? (
                  <>
                    {groupReservationsList(getFilteredAndSortedReservations()).length} registros agrupados por cliente
                  </>
                ) : (
                  <>
                    {getFilteredAndSortedReservations().length} reservas encontradas
                  </>
                )}
              </span>
            </div>
          </div>

          {/* SUMMARY STATISTICS RIBBON */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-[#03150b] p-5 rounded-2xl border border-soccer-field/90">
            <div className="bg-[#051c0f] border border-soccer-field/50 p-4 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-lg bg-soccer-gold/15 border border-soccer-gold/30 flex items-center justify-center text-xl shrink-0">
                🪑
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-gold uppercase tracking-wider">Total de Mesas</span>
                <span className="text-sm font-display font-black text-soccer-cream">
                  {getFilteredAndSortedReservations().length} mesa{getFilteredAndSortedReservations().length !== 1 && "s"}
                </span>
              </div>
            </div>

            <div className="bg-[#051c0f] border border-soccer-field/50 p-4 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-lg bg-soccer-orange/15 border border-soccer-orange/30 flex items-center justify-center text-xl shrink-0 animate-pulse">
                👥
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-gold uppercase tracking-wider">Total de Pessoas</span>
                <span className="text-sm font-display font-black text-soccer-gold">
                  {getFilteredAndSortedReservations().reduce((sum, r) => sum + (r.paxCount || 0), 0)} pessoa{getFilteredAndSortedReservations().reduce((sum, r) => sum + (r.paxCount || 0), 0) !== 1 && "s"}
                </span>
              </div>
            </div>

            <div className="bg-[#051c0f] border border-soccer-field/50 p-4 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xs font-mono font-black text-emerald-400 shrink-0">
                M4
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-gold uppercase tracking-wider font-semibold">Mesas de 4</span>
                <span className="text-sm font-display font-black text-soccer-cream">
                  {getFilteredAndSortedReservations().filter(r => r.tableType === "mesa4").length} reservada{getFilteredAndSortedReservations().filter(r => r.tableType === "mesa4").length !== 1 && "s"}
                </span>
              </div>
            </div>

            <div className="bg-[#051c0f] border border-soccer-field/50 p-4 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-xs font-mono font-black text-sky-400 shrink-0">
                M2
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-gold uppercase tracking-wider font-semibold">Mesas de 2</span>
                <span className="text-sm font-display font-black text-soccer-cream">
                  {getFilteredAndSortedReservations().filter(r => r.tableType === "mesa2").length} reservada{getFilteredAndSortedReservations().filter(r => r.tableType === "mesa2").length !== 1 && "s"}
                </span>
              </div>
            </div>
          </div>

          {/* LIST TABLE OF RESERVATIONS */}
          <div className="overflow-x-auto bg-[#03150b] rounded-2xl border border-soccer-field shadow-lg">
            
            {groupSameClient ? (
              /* GROUPED VIEW TABLE */
              <table className="w-full text-left text-xs text-soccer-cream">
                <thead className="bg-[#051c0f] uppercase text-[10px] font-mono text-soccer-gold border-b border-soccer-field/70">
                  <tr>
                    <th className="px-4 py-4">Convidado / Telefone</th>
                    <th className="px-4 py-4">Jogo</th>
                    <th className="px-4 py-4">Mesas Agrupadas</th>
                    <th className="px-4 py-4">Total Pax (Soma)</th>
                    <th className="px-4 py-4">Último Status</th>
                    <th className="px-4 py-4 text-right">Ação Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-soccer-field/20">
                  {groupReservationsList(getFilteredAndSortedReservations()).map((group) => {
                    let statusColor = "bg-soccer-cream/10 text-soccer-cream/80 border-transparent";
                    if (group.status === "confirmado" || group.status === "ativa") {
                      statusColor = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
                    } else if (group.status === "aguardando comprovante") {
                      statusColor = "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse";
                    } else if (group.status === "cancelado" || group.status === "liberada automaticamente") {
                      statusColor = "bg-red-500/10 border-red-500/30 text-red-400";
                    }

                    return (
                      <tr key={`group_${group.id}`} className="hover:bg-soccer-field/15">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-sm flex items-center gap-1.5 text-soccer-cream">
                            {group.clientName}
                            <span className="px-1.5 py-0.5 bg-soccer-gold/10 text-soccer-gold rounded font-bold text-[9px] uppercase">
                              {group.reservations.length}x Mesas
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-soccer-cream/60 flex items-center gap-1 mt-1">
                            <PhoneCall className="w-3 h-3 text-soccer-orange shrink-0" />
                            <span>{group.clientPhone}</span>
                          </div>
                          
                          {/* Direct Whatsapp send option */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppGroup(group)}
                            className="mt-2 inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] text-white font-mono font-black text-[9px] uppercase tracking-wider px-2 py-1 rounded-md transition-all cursor-pointer shadow-sm active:translate-y-px"
                          >
                            <MessageSquare className="w-3 h-3 shrink-0" />
                            <span>WhatsApp do Grupo 💚</span>
                          </button>
                        </td>
                        
                        <td className="px-4 py-4 truncate max-w-[150px]">
                          <div className="font-medium text-soccer-cream/95">{group.gameName}</div>
                          <div className="text-[9px] font-mono text-soccer-cream/40">Múltiplos IDs</div>
                        </td>
                        
                        <td className="px-4 py-4 font-mono text-xs font-black">
                          <span className="text-soccer-gold bg-soccer-gold/5 px-2 py-1 border border-soccer-gold/10 rounded">
                            {group.tablesDesc}
                          </span>
                        </td>
                        
                        <td className="px-4 py-4 font-mono">
                          <div className="font-bold text-sm text-soccer-field-light">{group.totalPax} pessoas</div>
                          <div className="text-[9px] text-soccer-cream/50">(Soma total de todas as comarcas)</div>
                        </td>
                        
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold inline-block ${statusColor}`}>
                            {group.status}
                          </span>
                        </td>
                        
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col gap-1 items-end">
                            <span className="text-[9px] text-soccer-cream/40 block">Alterar todas:</span>
                            <select
                              id={`change_group_status_${group.id}`}
                              value={group.status}
                              onChange={async (e) => {
                                const nextSt = e.target.value as ReservationStatus;
                                // Perform update for ALL reservations of this group
                                for (const r of group.reservations) {
                                  await handleUpdateStatus(r.id, nextSt);
                                }
                              }}
                              className="bg-[#051c0f] border border-soccer-field rounded-lg text-[10px] font-semibold text-soccer-cream py-1 px-1.5 outline-none cursor-pointer"
                            >
                              <option value="aguardando comprovante">Aguardando Pgto</option>
                              <option value="confirmado">Confirmado ✔</option>
                              <option value="ativa">Ativa ⚽</option>
                              <option value="cancelado">Cancelado ✖</option>
                              <option value="liberada automaticamente">Liberada Auto 🕒</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {groupReservationsList(getFilteredAndSortedReservations()).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-soccer-cream/50 italic font-mono">
                        Nenhuma reserva correspondente nesta seção.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* INDIVIDUAL VIEW TABLE (ALPHABETICAL & NUMERICAL SORTED) */
              <table className="w-full text-left text-xs text-soccer-cream">
                <thead className="bg-[#051c0f] uppercase text-[10px] font-mono text-soccer-gold border-b border-soccer-field/70">
                  <tr>
                    <th className="px-4 py-4">Convidado / Tel</th>
                    <th className="px-4 py-4">Jogo</th>
                    <th className="px-4 py-4">Mesa</th>
                    <th className="px-4 py-4">Pax</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-soccer-field/20">
                  {getFilteredAndSortedReservations().map((res) => {
                    let statusColor = "bg-soccer-cream/10 text-soccer-cream/80 border-transparent";
                    if (res.status === "confirmado" || res.status === "ativa") {
                      statusColor = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
                    } else if (res.status === "aguardando comprovante") {
                      statusColor = "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse";
                    } else if (res.status === "cancelado" || res.status === "liberada automaticamente") {
                      statusColor = "bg-red-500/10 border-red-500/30 text-red-400";
                    }

                    // Read other tables/pax of this duplicate client if any
                    const agg = getClientAggregation(res.clientPhone);
                    const isMulti = agg.totalTables > 1;

                    return (
                      <tr key={res.id} className="hover:bg-soccer-field/15">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-sm flex flex-wrap items-center gap-1.5">
                            <span>{res.clientName}</span>
                            {isMulti && (
                              <span className="px-1.5 py-0.5 bg-soccer-orange/10 border border-soccer-orange/20 text-soccer-orange rounded text-[9px] font-mono font-bold">
                                MULTI
                              </span>
                            )}
                            {res.isSharedGroup && (
                              <span className="px-1.5 py-0.5 bg-pink-500/15 border border-pink-500/30 text-pink-400 rounded text-[9px] font-mono font-bold">
                                🎂 ANIVERSÁRIO
                              </span>
                            )}
                            {res.isContribution && (
                              <span className="px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 rounded text-[9px] font-mono font-bold">
                                👥 CONVIDADO DE {res.sharedGroupHost?.toUpperCase()}
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[10px] font-mono text-soccer-cream/60 flex items-center gap-1 mt-1">
                            <PhoneCall className="w-3 h-3 text-soccer-orange shrink-0" />
                            <span>{res.clientPhone}</span>
                          </div>

                          {isMulti && (
                            <div className="mt-1 pb-1 block text-[9.5px] font-semibold text-soccer-gold">
                              🕒 Cliente reservou {agg.totalTables} mesas, somando total de {agg.totalPax} pessoas.
                            </div>
                          )}

                          {/* Action button to direct WhatsApp notification */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => handleSendWhatsApp(res)}
                              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] text-white font-mono font-black text-[9px] uppercase tracking-wider px-2.5 py-1 rounded transition-all cursor-pointer shadow shadow-emerald-950/20 active:translate-y-px"
                            >
                              <MessageSquare className="w-3 h-3 shrink-0" />
                              <span>WhatsApp 💚</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditRes(res)}
                              className="inline-flex items-center gap-1.5 bg-soccer-gold hover:bg-yellow-400 hover:scale-[1.02] text-soccer-dark font-mono font-black text-[9px] uppercase tracking-wider px-2.5 py-1 rounded transition-all cursor-pointer shadow shadow-yellow-950/20 active:translate-y-px"
                            >
                              <Edit2 className="w-3 h-3 shrink-0" />
                              <span>Editar ✏️</span>
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-4 truncate max-w-[150px]">
                          <div className="font-semibold text-soccer-cream/90">{res.gameName}</div>
                          <div className="text-[9px] font-mono text-soccer-cream/40">ID: {(res.id || "").substring(0, 5).toUpperCase()}</div>
                        </td>

                        <td className="px-4 py-4 font-mono text-xs font-black">
                          <span className="text-soccer-gold bg-soccer-gold/5 px-2 py-0.5 rounded border border-soccer-gold/10">
                            {res.tableType === "mesa4" ? "M4" : "M2"}
                          </span>
                          <span className="ml-1 text-soccer-cream">#{res.tableNumber}</span>
                        </td>

                        <td className="px-4 py-4 font-mono">
                          <div className="font-bold text-xs">{res.paxCount} pessoas</div>
                          {res.hasExtraSeat && (
                            <span className="inline-block mt-1 bg-yellow-500/10 border border-yellow-500/30 text-soccer-gold text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              +1 Extra
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold inline-block ${statusColor}`}>
                            {res.status}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <select
                            id={`change_res_status_${res.id}`}
                            value={res.status}
                            onChange={(e) => handleUpdateStatus(res.id, e.target.value as ReservationStatus)}
                            className="bg-[#051c0f] border border-soccer-field rounded-lg text-[10.5px] font-semibold text-soccer-cream py-1 px-1 outline-none cursor-pointer"
                          >
                            <option value="aguardando comprovante">Aguardando Pgto</option>
                            <option value="confirmado">Confirmado ✔</option>
                            <option value="ativa">Ativa ⚽</option>
                            <option value="cancelado">Cancelado ✖</option>
                            <option value="liberada automaticamente">Liberada Auto 🕒</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {getFilteredAndSortedReservations().length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-soccer-cream/50 italic font-mono">
                        Nenhuma reserva ativa ou no filtro para esta visualização.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}

      {/* TAB 4: BLOCKING & MANUAL RESERVATIONS */}
      {activeTab === "blocking" && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="bg-[#03150b] p-6 rounded-2xl border border-soccer-field grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Action panel Left Column */}
            <div className="md:col-span-5 space-y-4">
              <h3 className="text-sm font-display font-bold text-soccer-gold border-b border-soccer-field/50 pb-2 flex items-center gap-1.5">
                <Ban className="w-4 h-4" />
                Ação Administrativa Direta
              </h3>

              <div>
                <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase mb-1">Selecione o Jogo</label>
                <select
                  id="blocking_game_select"
                  value={selectedGameId}
                  onChange={(e) => setSelectedGameId(e.target.value)}
                  className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream"
                >
                  <option value="">-- Selecione --</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase mb-1">Tipo de Mesa</label>
                  <select
                    id="blocking_table_type_select"
                    value={blockTableType}
                    onChange={(e) => setBlockTableType(e.target.value as "mesa4" | "mesa2")}
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream"
                  >
                    <option value="mesa4">Mesa de 4 (M4)</option>
                    <option value="mesa2">Mesa de 2 (M2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase mb-1">Mesa Número (#)</label>
                  <input
                    id="blocking_number_input"
                    type="number"
                    value={blockTableNumber}
                    onChange={(e) => setBlockTableNumber(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Ex: 14"
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream"
                  />
                </div>
              </div>

              {/* Blocking Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  id="admin_block_btn"
                  onClick={() => handleBlockAction("block")}
                  className="flex-1 py-2.5 bg-red-950 border border-red-800 hover:bg-red-900 text-red-200 text-xs font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Bloquear</span>
                </button>
                <button
                  id="admin_unblock_btn"
                  onClick={() => handleBlockAction("unblock")}
                  className="flex-1 py-2.5 bg-soccer-field hover:bg-soccer-field/80 text-soccer-gold border border-soccer-field text-xs font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Desbloquear</span>
                </button>
              </div>

              {/* Manual Booking Drawer */}
              <div className="border-t border-soccer-field/60 pt-4 space-y-3">
                <h4 className="text-xs font-display font-semibold text-soccer-cream">Reserva Manual do Admin:</h4>
                <div className="space-y-3">
                  <input
                    id="manual_client_name"
                    type="text"
                    value={manualClientName}
                    onChange={(e) => setManualClientName(e.target.value)}
                    placeholder="Nome do Cliente"
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream"
                  />
                  <input
                    id="manual_client_phone"
                    type="text"
                    value={manualClientPhone}
                    onChange={(e) => setManualClientPhone(e.target.value)}
                    placeholder="Telefone / Celular"
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 px-3 text-xs text-soccer-cream"
                  />
                </div>
                <button
                  id="admin_manual_book_btn"
                  onClick={() => handleBlockAction("manual_book")}
                  className="w-full py-2.5 bg-soccer-gold hover:bg-yellow-500 text-soccer-dark text-xs font-display font-bold rounded-md shadow flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-soccer-dark" />
                  <span>Confirmar Reserva Manual</span>
                </button>
              </div>

            </div>

            {/* View column Right Column */}
            <div className="md:col-span-7 bg-soccer-dark/50 border border-soccer-field/60 p-5 rounded-2xl">
              <h3 className="text-xs font-mono font-black text-soccer-gold uppercase mb-3 tracking-wider">
                Verificação de Mesa por Jogo
              </h3>

              {!selectedGameId ? (
                <div className="text-center py-12 text-soccer-cream/50 text-xs italic">
                  Selecione um jogo da Copa no seletor para ver o mapa correspondente.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-soccer-cream font-sans">
                    Partida Selecionada: {games.find(g => g.id === selectedGameId)?.homeTeam} vs {games.find(g => g.id === selectedGameId)?.awayTeam}
                  </div>

                  {/* Blocked tables count */}
                  <div className="bg-[#03150b] p-3 rounded-xl border border-soccer-field/60 text-[11px] space-y-1.5 block">
                    <span className="font-bold text-soccer-gold block">Mesas Atualmente Bloqueadas:</span>
                    <div className="flex flex-wrap gap-2">
                      {blockedTables.filter(b => b.gameId === selectedGameId).map(b => (
                        <span key={b.id} className="px-2 py-0.5 bg-red-950/60 border border-red-800 text-red-300 rounded font-mono text-[10px] items-center flex gap-1">
                          {b.tableType === "mesa4" ? "M4" : "M2"} #{b.tableNumber}
                        </span>
                      ))}
                      {blockedTables.filter(b => b.gameId === selectedGameId).length === 0 && (
                        <span className="text-soccer-cream/50 italic">Nenhuma mesa bloqueada para este jogo.</span>
                      )}
                    </div>
                  </div>

                  {/* Reserved tables list */}
                  <div className="bg-[#03150b] p-3 rounded-xl border border-soccer-field/60 text-[11px] space-y-1.5 block">
                    <span className="font-bold text-soccer-gold block">Mesas Atualmente Reservadas:</span>
                    <div className="flex flex-wrap gap-2">
                      {reservations.filter(r => r.gameId === selectedGameId && r.status !== "cancelado" && r.status !== "liberada automaticamente").map(r => (
                        <span key={r.id} className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded font-mono text-[10px]">
                          {r.tableType === "mesa4" ? "M4" : "M2"} #{r.tableNumber} ({r.clientName})
                        </span>
                      ))}
                      {reservations.filter(r => r.gameId === selectedGameId && r.status !== "cancelado" && r.status !== "liberada automaticamente").length === 0 && (
                        <span className="text-soccer-cream/50 italic">Nenhuma mesa reservada para este jogo.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {activeTab === "texts" && (
        <form onSubmit={handleSaveTexts} className="space-y-6 animate-fade-in bg-[#03150b]/80 border border-soccer-field/95 p-6 md:p-8 rounded-3xl">
          <div>
            <h3 className="text-lg font-display font-bold text-soccer-gold">Gerenciamento Dinâmico de Conteúdo</h3>
            <p className="text-xs text-soccer-cream/60">Edite todos os textos exibidos na página principal da Copa. Toda alteração entra no ar imediatamente em tempo real para os visitantes.</p>
          </div>

          <div className="border-t border-soccer-field/30 pt-6 space-y-6">

            {/* Upload de Logotipo */}
            <div className="bg-[#051c0f]/65 border border-soccer-field/50 p-5 rounded-2xl space-y-4">
              <h4 className="text-xs uppercase font-mono text-soccer-gold font-bold tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-soccer-gold rounded-full animate-ping" />
                Logotipo do Evento (Upload de Imagem)
              </h4>
              <p className="text-[11px] text-soccer-cream/70 leading-relaxed">
                Adicione a logo oficial da sua marca ou patrocinador para dar um toque autêntico ao Copaço. Ela substituirá o ícone default no cabeçalho do site.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-5 items-center">
                <div className="w-16 h-16 rounded-xl bg-soccer-dark border border-soccer-field/90 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <LogoImage 
                    logoUrl={textLogoUrl} 
                    logoUpdatedAt={logoUpdatedAt}
                    alt="Logo Preview" 
                    className="w-full h-full object-contain p-1.5" 
                    fallbackType="admin" 
                  />
                </div>
                
                <div className="flex-grow w-full space-y-3 text-left">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <label className="px-4 py-2 bg-[#051c0f] border border-soccer-field hover:border-soccer-gold text-soccer-cream rounded-xl text-xs font-mono font-bold cursor-pointer transition-all hover:bg-[#072413] inline-block">
                        <span>Fazer Upload</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setUploadStatus("uploading");
                              setUploadProgress(0);
                              setUploadError("");
                              setFirebaseResponse("Validando e otimizando imagem...");
                              
                              try {
                                const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
                                const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'png';
                                const allowedExtensions = ["png", "jpg", "jpeg", "webp", "svg"];

                                if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                                  throw new Error("Formato não permitido! Selecione uma imagem .png, .jpg, .jpeg, .webp, ou .svg");
                                }

                                const originalSizeInKb = file.size / 1024;
                                const originalSizeFormatted = originalSizeInKb.toFixed(1) + " KB";
                                
                                setUploadedFileInfo({
                                  name: file.name,
                                  size: originalSizeFormatted
                                });

                                let fileToUpload: File | Blob = file;

                                // Compress JPEGs/PNGs/WEBP client-side using an iterative multi-pass Canvas helper to strictly stay under 320KB
                                if (fileExtension !== "svg" && file.type !== "image/svg+xml") {
                                  setFirebaseResponse("Otimizando dimensões e compactando imagem...");
                                  try {
                                    fileToUpload = await new Promise<File | Blob>((resolve, reject) => {
                                      const img = new Image();
                                      const objectUrl = URL.createObjectURL(file);
                                      
                                      img.onload = () => {
                                        URL.revokeObjectURL(objectUrl);
                                        
                                        // Multi-pass size reduction targeting < 320 KB for safe database storage 
                                        let scale = 1.0;
                                        let quality = 0.85;
                                        const originalWidth = img.width;
                                        const originalHeight = img.height;
                                        
                                        // Max initial dimension of 600px is perfect for app headers/logos
                                        const maxDim = 600;
                                        if (originalWidth > maxDim || originalHeight > maxDim) {
                                          scale = Math.min(maxDim / originalWidth, maxDim / originalHeight);
                                        }

                                        const attemptCompression = () => {
                                          const canvas = document.createElement("canvas");
                                          const ctx = canvas.getContext("2d");
                                          if (!ctx) {
                                            resolve(file);
                                            return;
                                          }

                                          canvas.width = Math.max(1, Math.round(originalWidth * scale));
                                          canvas.height = Math.max(1, Math.round(originalHeight * scale));

                                          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                                          const isPng = file.type === "image/png" || fileExtension === "png";
                                          const mimeType = isPng ? "image/png" : "image/jpeg";

                                          canvas.toBlob((blob) => {
                                            if (!blob) {
                                              resolve(file);
                                              return;
                                            }

                                            // If PNG is still too big, scale down dimensions. If JPEG is too big, reduce dimensions and quality.
                                            if (blob.size > 320 * 1024 && (scale > 0.3 || quality > 0.40)) {
                                              if (isPng) {
                                                scale *= 0.75;
                                              } else {
                                                scale *= 0.82;
                                                quality -= 0.12;
                                              }
                                              attemptCompression();
                                            } else {
                                              const compressed = new File([blob], file.name, { type: mimeType });
                                              setUploadedFileInfo({
                                                name: file.name,
                                                size: `${originalSizeFormatted} (Otimizado: ${(blob.size / 1024).toFixed(1)} KB)`
                                              });
                                              resolve(compressed);
                                            }
                                          }, mimeType, isPng ? undefined : quality);
                                        };

                                        attemptCompression();
                                      };

                                      img.onerror = () => {
                                        URL.revokeObjectURL(objectUrl);
                                        reject(new Error("Não foi possível carregar a imagem selecionada."));
                                      };

                                      img.src = objectUrl;
                                    });
                                  } catch (err) {
                                    console.warn("Falha na compactação automática, usando arquivo original:", err);
                                  }
                                } else {
                                  // For SVG vector files, verify size directly
                                  if (file.size > 320 * 1024) {
                                    throw new Error("Arquivo SVG muito grande! Por favor, utilize um arquivo SVG simplificado de no máximo 320 KB.");
                                  }
                                }

                                setFirebaseResponse("Sincronizando imagem de forma otimizada...");
                                
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  let base64 = reader.result as string;

                                  const xhr = new XMLHttpRequest();
                                  xhr.open("POST", "/api/upload");
                                  xhr.setRequestHeader("Content-Type", "application/json");
                                  xhr.setRequestHeader("x-admin-uid", auth.currentUser?.uid || "local_bypass_admin");
                                  xhr.setRequestHeader("x-admin-email", auth.currentUser?.email || "andrecalixtolima@gmail.com");

                                  xhr.upload.onprogress = (event) => {
                                    if (event.lengthComputable) {
                                      const progress = Math.round((event.loaded / event.total) * 100);
                                      setUploadProgress(progress);
                                      setFirebaseResponse("Carregando...");
                                    }
                                  };

                                  xhr.onload = async () => {
                                    try {
                                      if (xhr.status >= 200 && xhr.status < 300) {
                                        const responseData = JSON.parse(xhr.responseText);
                                        if (responseData.success && responseData.url) {
                                          const downloadURL = responseData.url;
                                          const now = Date.now();
                                          setUploadStatus("success");
                                          setTextLogoUrl(downloadURL);
                                          setLogoUpdatedAt(now);
                                          setFirebaseResponse("Logo carregada com sucesso");
                                          
                                          // Update settings document in Firestore
                                          const docRef = doc(db, "settings", "homepage");
                                          await updateDoc(docRef, { 
                                            logoUrl: downloadURL,
                                            logoUpdatedAt: now
                                          });
                                        } else {
                                          throw new Error(responseData.error || "O servidor retornou uma resposta inválida.");
                                        }
                                      } else {
                                        let errorMsg = "Erro no carregamento.";
                                        try {
                                          const errRes = JSON.parse(xhr.responseText);
                                          errorMsg = errRes.error || errorMsg;
                                        } catch {
                                          errorMsg = xhr.statusText || errorMsg;
                                        }
                                        throw new Error(errorMsg);
                                      }
                                    } catch (err: any) {
                                      console.error("Erro no processamento do upload:", err);
                                      setUploadStatus("error");
                                      setUploadError(err.message || "Falha ao processar imagem.");
                                    }
                                  };

                                  xhr.onerror = () => {
                                    setUploadStatus("error");
                                    setUploadError("Erro de comunicação ao se conectar com o servidor.");
                                  };

                                  xhr.send(JSON.stringify({
                                    base64,
                                    filename: file.name,
                                    mimeType: file.type
                                  }));
                                };

                                reader.onerror = () => {
                                  setUploadStatus("error");
                                  setUploadError("Não foi possível ler o arquivo.");
                                };

                                reader.readAsDataURL(fileToUpload);
                              } catch (err: any) {
                                setUploadStatus("error");
                                setUploadError(err.message);
                              }
                            }
                          }}
                        />
                      </label>
                      
                      {textLogoUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            // Delete old logo in Firebase Storage if present
                            if (textLogoUrl.includes("firebasestorage.googleapis.com")) {
                              try {
                                const oldRef = ref(storage, textLogoUrl);
                                await deleteObject(oldRef);
                              } catch (e) {
                                console.warn("Could not delete file from Storage:", e);
                              }
                            }
                            
                            setTextLogoUrl("");
                            setLogoUpdatedAt(0);
                            setUploadStatus("idle");
                            setUploadError("");
                            setUploadedFileInfo(null);
                            setFirebaseResponse("");
                            try {
                              const docRef = doc(db, "settings", "homepage");
                              await updateDoc(docRef, { 
                                logoUrl: "",
                                logoUpdatedAt: 0
                              });
                            } catch (err: any) {
                              console.error("Erro ao apagar logo do Firestore:", err);
                            }
                          }}
                          className="px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 rounded-xl text-xs font-mono cursor-pointer transition-all"
                        >
                          Remover Logotipo
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase">Ou use um link manual direto</label>
                      <input 
                        type="text"
                        value={textLogoUrl}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const now = Date.now();
                          setTextLogoUrl(val);
                          if (val && !isValidDirectImageUrl(val)) {
                            setUploadStatus("error");
                            setUploadError("A URL inserida não termina com uma extensão de imagem válida (.png, .jpg, .jpeg, .webp, .svg).");
                          } else {
                            if (uploadStatus === "error") {
                              setUploadStatus("success");
                              setUploadError("");
                            }
                            try {
                              setLogoUpdatedAt(now);
                              const docRef = doc(db, "settings", "homepage");
                              await updateDoc(docRef, { 
                                logoUrl: val,
                                logoUpdatedAt: now
                              });
                            } catch (err: any) {
                              console.error("Erro ao salvar URL manual:", err);
                            }
                          }
                        }}
                        placeholder="Ex: https://dominio.com/logo.png"
                        className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-xl px-3 py-2 outline-none focus:border-soccer-gold font-sans"
                      />
                    </div>
                  </div>

                  {/* PREVIEW RESPONSIVO E STATUS DE LOGOTIPO */}
                  {(uploadStatus !== "idle" || textLogoUrl) && (
                    <div className="mt-4 p-4 rounded-xl bg-[#03140a] border border-soccer-field/30 space-y-3 text-left">
                      <div className="flex items-center justify-between border-b border-soccer-field/20 pb-1.5">
                        <span className="text-soccer-gold font-sans font-bold uppercase text-[10px] tracking-wider">📦 Status do Logotipo</span>
                        <span className="text-[9px] font-mono text-soccer-cream/50">Auto-sincronizado</span>
                      </div>

                      <div className="space-y-3 text-xs text-soccer-cream">
                        {/* File Details: Name & Size */}
                        {uploadedFileInfo && (
                          <div className="text-[11px] bg-[#020e06] border border-soccer-field/15 p-2 rounded-lg text-soccer-cream/90 flex flex-col gap-0.5 font-mono">
                            <div><span className="text-soccer-gold font-sans uppercase text-[9px] font-bold">Arquivo:</span> {uploadedFileInfo.name}</div>
                            <div><span className="text-soccer-gold font-sans uppercase text-[9px] font-bold">Tamanho:</span> {uploadedFileInfo.size}</div>
                          </div>
                        )}

                        {uploadStatus === "uploading" && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-amber-400 font-bold animate-pulse">{firebaseResponse || "Processando..."}</span>
                              <span className="font-mono">{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-[#020e06] rounded-full h-1 overflow-hidden">
                              <div className="bg-soccer-gold h-1 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                          </div>
                        )}

                        {uploadStatus === "success" && (
                          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] leading-relaxed">
                            <span className="font-bold flex items-center gap-1.5 text-emerald-400 mb-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                              ✨ Logo carregada com sucesso
                            </span>
                            O logotipo oficial foi salvo de forma otimizada para carregamento instantâneo.
                          </div>
                        )}

                        {uploadStatus === "error" && uploadError && (
                          <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-[11px]">
                            <span className="font-bold block mb-0.5 text-red-400">⚠️ Erro no Upload:</span>
                            {uploadError}
                          </div>
                        )}

                        {textLogoUrl && (
                          <div className="space-y-2 border-t border-soccer-field/20 pt-2 bg-black/20 p-2 rounded-lg">
                            <span className="text-soccer-gold font-sans font-bold uppercase text-[9px] tracking-wider block">Visualização Responsiva (Header, Médio, Hero)</span>
                            <div className="flex flex-wrap gap-4 items-end justify-start">
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-10 h-10 rounded-lg bg-[#020e06] border border-soccer-field/30 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-inner">
                                  <LogoImage logoUrl={textLogoUrl} logoUpdatedAt={logoUpdatedAt} alt="Prev 1" className="w-full h-full object-contain" fallbackType="header" />
                                </div>
                                <span className="text-[8px] font-mono text-soccer-cream/40">Topo (40px)</span>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-16 h-16 rounded-xl bg-[#020e06] border border-soccer-field/30 flex items-center justify-center p-1.5 overflow-hidden shrink-0 shadow-inner">
                                  <LogoImage logoUrl={textLogoUrl} logoUpdatedAt={logoUpdatedAt} alt="Prev 2" className="w-full h-full object-contain" fallbackType="admin" />
                                </div>
                                <span className="text-[8px] font-mono text-soccer-cream/40">Médio (64px)</span>
                              </div>
                              <div className="flex flex-col items-center gap-1">
                                <div className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#020e06] to-black border border-soccer-field/30 flex items-center justify-center min-w-[100px] h-10 overflow-hidden shrink-0 shadow-inner">
                                  <LogoImage logoUrl={textLogoUrl} logoUpdatedAt={logoUpdatedAt} alt="Prev 3" className="max-h-7 max-w-[80px] object-contain" fallbackType="hero" />
                                </div>
                                <span className="text-[8px] font-mono text-soccer-cream/40">Destacado (h-40)</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-soccer-cream/45 font-mono leading-tight">Formatos recomendados: .PNG, .JPG, .JPEG, .WEBP, .SVG. Imagens são comprimidas automaticamente antes do envio.</p>
                </div>
              </div>
            </div>
            
            {/* Secção Hero */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-mono text-soccer-gold font-bold tracking-wider mb-2">1. Banner Principal (Hero Section)</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Badge de Alerta (Linha rosa no topo)</label>
                  <input
                    id="text_badge_input"
                    type="text"
                    required
                    value={textBadge}
                    onChange={(e) => setTextBadge(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Título do Hero - Parte Inicial (Sóbria)</label>
                  <input
                    id="text_hero_p1_input"
                    type="text"
                    required
                    value={textHeroPart1}
                    onChange={(e) => setTextHeroPart1(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Título do Hero - Parte Destacada (Dourada)</label>
                  <input
                    id="text_hero_highlight_input"
                    type="text"
                    required
                    value={textHeroHighlight}
                    onChange={(e) => setTextHeroHighlight(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Descrição Textual Secundária</label>
                  <textarea
                    id="text_hero_desc_input"
                    rows={3}
                    required
                    value={textHeroDesc}
                    onChange={(e) => setTextHeroDesc(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Alerta Flutuante (Abaixo do título - Banner da Reserva & Telão)</label>
                  <input
                    id="text_telao_banner_input"
                    type="text"
                    required
                    value={textTelaoBanner}
                    onChange={(e) => setTextTelaoBanner(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>
              </div>
            </div>

            {/* Secção Experiências do Copaço */}
            <div className="border-t border-soccer-field/30 pt-6 space-y-4">
              <h4 className="text-xs uppercase font-mono text-soccer-gold font-bold tracking-wider mb-2">2. Divisão de Atrações Gerais</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Título da Secção</label>
                  <input
                    id="text_sec_title_input"
                    type="text"
                    required
                    value={textStationSecTitle}
                    onChange={(e) => setTextStationSecTitle(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Subtítulo da Secção</label>
                  <input
                    id="text_sec_sub_input"
                    type="text"
                    required
                    value={textStationSecSub}
                    onChange={(e) => setTextStationSecSub(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>
              </div>

              {/* Bento cards details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                
                {/* Atração 1 */}
                <div className="bg-[#051c0f]/40 p-4 rounded-xl border border-soccer-field/50 space-y-3">
                  <span className="text-[10px] font-mono text-soccer-gold font-bold uppercase">Card 1 - Principal (TV / Telão)</span>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Título do Card</label>
                    <input
                      id="text_s1_t_input"
                      type="text"
                      required
                      value={textS1Title}
                      onChange={(e) => setTextS1Title(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Descrição do Card</label>
                    <textarea
                      id="text_s1_d_input"
                      rows={2}
                      required
                      value={textS1Desc}
                      onChange={(e) => setTextS1Desc(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                </div>

                {/* Atração 2 */}
                <div className="bg-[#051c0f]/40 p-4 rounded-xl border border-soccer-field/50 space-y-3">
                  <span className="text-[10px] font-mono text-soccer-gold font-bold uppercase">Card 2 - Ritmo (Música / DJ)</span>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Título do Card</label>
                    <input
                      id="text_s2_t_input"
                      type="text"
                      required
                      value={textS2Title}
                      onChange={(e) => setTextS2Title(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Descrição do Card</label>
                    <textarea
                      id="text_s2_d_input"
                      rows={2}
                      required
                      value={textS2Desc}
                      onChange={(e) => setTextS2Desc(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                </div>

                {/* Atração 3 */}
                <div className="bg-[#051c0f]/40 p-4 rounded-xl border border-soccer-field/50 space-y-3">
                  <span className="text-[10px] font-mono text-soccer-gold font-bold uppercase">Card 3 - Copos / Bebidas (Double Chopp)</span>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Título do Card</label>
                    <input
                      id="text_s3_t_input"
                      type="text"
                      required
                      value={textS3Title}
                      onChange={(e) => setTextS3Title(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Descrição do Card</label>
                    <textarea
                      id="text_s3_d_input"
                      rows={2}
                      required
                      value={textS3Desc}
                      onChange={(e) => setTextS3Desc(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                </div>

                {/* Atração 4 */}
                <div className="bg-[#051c0f]/40 p-4 rounded-xl border border-soccer-field/50 space-y-3">
                  <span className="text-[10px] font-mono text-soccer-gold font-bold uppercase">Card 4 - Jogos / Recompensas (Bolão)</span>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Título do Card</label>
                    <input
                      id="text_s4_t_input"
                      type="text"
                      required
                      value={textS4Title}
                      onChange={(e) => setTextS4Title(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-soccer-cream/50 mb-0.5">Descrição do Card</label>
                    <textarea
                      id="text_s4_d_input"
                      rows={2}
                      required
                      value={textS4Desc}
                      onChange={(e) => setTextS4Desc(e.target.value)}
                      className="w-full bg-[#051c0f]/80 border border-soccer-field text-xs text-soccer-cream rounded p-2 outline-none"
                    />
                  </div>
                </div>

              </div>
            </div>

          </div>

          <div className="flex justify-end gap-2 border-t border-soccer-field/30 pt-6">
            <button
              id="submit_save_texts_btn"
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-soccer-gold hover:bg-yellow-500 text-soccer-dark font-display font-black rounded-xl text-xs shadow-md transition-all hover:scale-[1.02] flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 text-soccer-dark" />
              {loading ? "Salvando Textos..." : "Salvar & Atualizar Página"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: ADMINS & AUDIT LOGS */}
      {activeTab === "admins" && (
        <div className="space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* PROMOTE ADMIN FORM */}
            <div className="lg:col-span-1 bg-soccer-dark/60 p-6 rounded-2xl border border-soccer-field/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-soccer-gold" />
                <h3 className="font-display font-bold text-sm text-soccer-gold uppercase">Promover Administrador</h3>
              </div>
              <p className="text-[11px] text-soccer-cream/70 font-sans leading-relaxed">
                Insira o UID e Email oficiais do Firebase Auth do usuário para conceder privilégios oficiais de Custom Claims.
              </p>
              
              <form onSubmit={handlePromoteAdmin} className="space-y-4 pt-2">
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase mb-1">Email do Usuário</label>
                  <input
                    type="email"
                    required
                    placeholder="ex: admin@copaco.com"
                    value={promoEmail}
                    onChange={(e) => setPromoEmail(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase mb-1">Firebase UID</label>
                  <input
                    type="text"
                    required
                    placeholder="Cole o UID do Console Firebase"
                    value={promoUid}
                    onChange={(e) => setPromoUid(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2.5 outline-none focus:border-soccer-gold"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-soccer-gold text-soccer-dark font-display font-extrabold text-xs rounded-xl hover:bg-yellow-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 text-soccer-dark" />
                  {loading ? "Promovendo..." : "Conceder Acesso"}
                </button>
              </form>
            </div>

            {/* REGISTERED ADMINS LIST */}
            <div className="lg:col-span-2 bg-soccer-dark/60 p-6 rounded-2xl border border-soccer-field/50 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-soccer-gold" />
                  <h3 className="font-display font-bold text-sm text-soccer-gold uppercase">Administradores Ativos</h3>
                </div>
                <button 
                  onClick={fetchAdminsAndLogs}
                  className="p-1 px-2.5 bg-soccer-field/40 text-soccer-cream text-[10px] font-mono rounded hover:bg-soccer-field/70 transition flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-soccer-gold" /> Recarregar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-soccer-field/30 text-soccer-cream/50 font-mono text-[10px] uppercase">
                      <th className="py-2.5">Email</th>
                      <th className="py-2.5">UID</th>
                      <th className="py-2.5">Adicionado por</th>
                      <th className="py-2.5 text-right font-sans">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-soccer-field/10 text-soccer-cream">
                    {adminUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-soccer-field/10">
                        <td className="py-3 font-semibold text-soccer-cream truncate max-w-[150px]">{user.email}</td>
                        <td className="py-3 font-mono text-[10px] text-soccer-cream/60 truncate max-w-[100px]">{user.uid}</td>
                        <td className="py-3 text-[11px] text-soccer-cream/70 truncate max-w-[100px]">{user.addedBy || "Superadmin"}</td>
                        <td className="py-3 text-right">
                          {user.email === "andrecalixtolima@gmail.com" ? (
                            <span className="text-[9px] font-mono text-soccer-gold bg-soccer-gold/10 px-1.5 py-0.5 rounded font-bold">Founder</span>
                          ) : (
                            <button
                              onClick={() => handleRevokeAdmin(user.uid, user.email)}
                              className="text-[10px] text-soccer-neon hover:underline font-mono cursor-pointer"
                            >
                              Revogar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    
                    {loadingAdmins && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-soccer-gold font-mono text-xs">
                          <span className="inline-block animate-spin mr-2">⚽</span>
                          Buscando administradores oficiais...
                        </td>
                      </tr>
                    )}

                    {!loadingAdmins && adminsError && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-red-400 font-mono text-xs px-2">
                          <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-lg text-left space-y-2">
                            <p className="font-bold">⚠️ Falha ao listar administradores:</p>
                            <p className="text-[11px] text-red-300/80 leading-relaxed font-sans">{adminsError}</p>
                            <button
                              type="button"
                              onClick={fetchAdminsAndLogs}
                              className="py-1 px-3 bg-red-900 hover:bg-red-800 text-white rounded text-[10px]"
                            >
                              Tentar Novamente
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {!loadingAdmins && !adminsError && adminUsers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-soccer-cream/40 font-mono">
                          Nenhum administrador adicional cadastrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* AUDIT LOG TIMELINE */}
          <div className="bg-soccer-dark/60 p-6 rounded-2xl border border-soccer-field/50 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-soccer-field/30 pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-soccer-gold" />
                <h3 className="font-display font-bold text-sm text-soccer-gold uppercase">Trilha de Auditoria Administrativa</h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Pesquisar logs..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2 px-3 outline-none focus:border-soccer-gold w-48 font-sans"
                />
                
                <select
                  value={logFilterAction}
                  onChange={(e) => setLogFilterAction(e.target.value)}
                  className="bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-lg p-2 px-3 outline-none focus:border-soccer-gold"
                >
                  <option value="all">Todas as Ações</option>
                  <option value="create_reservation">Criação de reserva</option>
                  <option value="update_status">Alteração de status</option>
                  <option value="block_table">Bloqueio de mesa</option>
                  <option value="unblock_table">Desbloqueio de mesa</option>
                  <option value="promote_admin">Promoção de admin</option>
                  <option value="revoke_admin">Revogação de admin</option>
                  <option value="auto_release">Expirador automático</option>
                  <option value="restore_backup">Restauração de backup</option>
                </select>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-3 bg-[#051c0f]/80 rounded-xl border border-soccer-field/20 hover:border-soccer-field/40 transition flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                      log.action.includes("promote") ? "bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20" :
                      log.action.includes("revoke") ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                      log.action.includes("block") ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      log.action.includes("auto_release") ? "bg-soccer-neon/10 text-soccer-cream border border-soccer-neon/20" :
                      "bg-soccer-field/20 text-soccer-cream"
                    }`}>
                      {log.action}
                    </span>
                    <p className="text-xs text-soccer-cream font-medium leading-normal">{log.details}</p>
                    <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-soccer-cream/50 font-mono">
                      <span>Executante: {log.performedByEmail || log.performedBy}</span>
                      <span>•</span>
                      <span>UID: {log.performedBy}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-soccer-cream/40 whitespace-nowrap pt-1">
                    {new Date(log.timestamp).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <p className="text-center font-mono text-xs text-soccer-cream/30 py-8">Nenhum evento registrado com estas características.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: BACKUP & RECOVERY */}
      {activeTab === "backup" && (
        <div className="space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* EXPORTS CARD */}
            <div className="bg-soccer-dark/60 p-6 rounded-2xl border border-soccer-field/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-soccer-gold" />
                <h3 className="font-display font-bold text-sm text-soccer-gold uppercase">Exportação Descentralizada</h3>
              </div>
              <p className="text-xs text-soccer-cream/70 font-sans leading-relaxed">
                Exporte relatórios das reservas para controle físico ou salve cópias completas do banco Firestore para contingências.
              </p>

              <div className="grid grid-cols-1 gap-3 pt-2">
                <button
                  onClick={handleExportCSV}
                  className="w-full py-4 bg-soccer-field hover:bg-soccer-field/80 text-soccer-cream font-display font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 border border-soccer-field/90 hover:scale-[1.02] cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-soccer-gold" />
                  Planilha de Reservas (CSV)
                </button>

                <button
                  onClick={handleDownloadBackupJSON}
                  className="w-full py-4 bg-soccer-dark border border-soccer-field/80 text-soccer-cream hover:bg-soccer-field/15 font-display font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-2 hover:scale-[1.02] cursor-pointer"
                >
                  <Download className="w-5 h-5 text-soccer-gold" />
                  Download Backup do Sistema (JSON)
                </button>
              </div>
            </div>

            {/* RESTORE CARD */}
            <div className="bg-soccer-dark/60 p-6 rounded-2xl border border-soccer-field/50 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Upload className="w-5 h-5 text-soccer-neon" />
                <h3 className="font-display font-bold text-sm text-soccer-neon uppercase">Restauração de Desastre</h3>
              </div>
              <p className="text-xs text-soccer-cream/70 font-sans leading-relaxed">
                Restaure todas as coleções de reserva, jogos e bloqueios em caso de exclusões indesejadas no console do Firebase.
              </p>

              <div className="space-y-4 pt-2">
                <div className="border border-dashed border-soccer-field/50 rounded-xl p-4 text-center cursor-pointer hover:bg-soccer-field/5 transition relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelectForRestore}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-8 h-8 text-soccer-gold mx-auto mb-2" />
                  <span className="block text-xs text-soccer-cream font-medium">
                    {backupFileName ? backupFileName : "Selecione arquivo copaco_backup.json"}
                  </span>
                  <span className="block text-[10px] text-soccer-cream/50 mt-1">Apenas formato de backup oficial (.json)</span>
                </div>

                {backupFileContent && (
                  <button
                    onClick={handleRestoreBackup}
                    className="w-full py-3 bg-soccer-neon text-soccer-cream font-display font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-soccer-neon/25"
                  >
                    <CheckCircle2 className="w-4 h-4 text-soccer-cream" />
                    Iniciar Restauração de Dados
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: EDIT RESERVATION DETAILS */}
      {editingRes && (
        <div id="edit_res_modal_backdrop" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-[#052912] to-[#03150b] border-2 border-soccer-gold/60 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative animate-fade-in text-soccer-cream">
            
            {/* Header decoration */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-500 via-soccer-gold to-soccer-orange" />

            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-soccer-gold" />
                  <h3 className="font-display font-extrabold text-base uppercase tracking-tight">Editar Detalhes da Reserva</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRes(null)}
                  className="text-soccer-cream/50 hover:text-soccer-cream p-1 bg-white/5 hover:bg-white/10 rounded-full transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-[#03150b] p-3 rounded-xl border border-soccer-field/40 text-[11px] font-mono text-soccer-gold/90 mb-6 flex flex-col gap-1">
                <div>⚽ JOGO: {editingRes.gameName}</div>
                <div>🪑 TIPO DE MESA: {editingRes.tableType === "mesa4" ? "Mesa para 4 (M4)" : "Mesa para 2 (M2)"} #{editingRes.tableNumber}</div>
                <div>🆔 ID DA RESERVA: {editingRes.id.toUpperCase()}</div>
              </div>

              <form onSubmit={handleSaveResEdit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">Nome do Convidado / Titular</label>
                  <input
                    type="text"
                    required
                    value={editResName}
                    onChange={(e) => setEditResName(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-xl py-2.5 px-3 text-xs text-soccer-cream outline-none focus:border-soccer-gold"
                    placeholder="Ex: André Calixto"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={editResPhone}
                    onChange={(e) => setEditResPhone(e.target.value)}
                    className="w-full bg-[#051c0f] border border-soccer-field rounded-xl py-2.5 px-3 text-xs text-soccer-cream outline-none focus:border-soccer-gold"
                    placeholder="Ex: 31975099398"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">Número de Cadeiras (Pax)</label>
                    <select
                      value={editResPax}
                      onChange={(e) => setEditResPax(Number(e.target.value))}
                      className="w-full bg-[#051c0f] border border-soccer-field rounded-xl py-2 px-3 text-xs text-soccer-cream outline-none focus:border-soccer-gold cursor-pointer"
                    >
                      <option value="1">1 Cadeira</option>
                      <option value="2">2 Cadeiras</option>
                      <option value="3">3 Cadeiras</option>
                      <option value="4">4 Cadeiras</option>
                      <option value="5">5 Cadeiras</option>
                      <option value="6">6 Cadeiras</option>
                      <option value="7">7 Cadeiras</option>
                      <option value="8">8 Cadeiras</option>
                    </select>
                  </div>

                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 bg-[#051c0f] border border-soccer-field rounded-xl py-2 px-3 text-xs text-soccer-cream outline-none cursor-pointer w-full hover:border-soccer-gold transition-colors">
                      <input
                        type="checkbox"
                        checked={editResExtra}
                        onChange={(e) => setEditResExtra(e.target.checked)}
                        className="w-4 h-4 accent-soccer-field rounded cursor-pointer"
                      />
                      <span className="text-[10px] font-mono uppercase text-soccer-gold">Cadeira Extra (+1)</span>
                    </label>
                  </div>
                </div>

                {resEditError && (
                  <div className="bg-red-950/50 border border-red-700/50 rounded-xl p-3 flex items-start gap-2 text-xs text-red-200">
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{resEditError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRes(null)}
                    className="w-1/3 py-2.5 bg-white/5 hover:bg-white/10 text-soccer-cream text-xs font-semibold rounded-xl transition-all cursor-pointer text-center"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingResEdit}
                    className="flex-1 py-2.5 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg hover:scale-[1.01]"
                  >
                    {isSavingResEdit ? "Salvando..." : "Salvar Alterações 💾"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
