/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Game, Reservation, BlockedTable, DashboardMetrics, ReservationStatus, HomepageSettings, getDirectImageUrl, isValidDirectImageUrl } from "../types";
import LogoImage from "./LogoImage";
import { db, handleFirestoreError, OperationType, storage } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, writeBatch, setDoc
} from "firebase/firestore";
import { 
  Calendar, Clock, DollarSign, Users, Trash2, Edit2, Shield, Plus, X, Check, Eye, HelpCircle, AlertOctagon, RefreshCw, Layers, PhoneCall, CheckCircle2, Ban
} from "lucide-react";

interface AdminPanelProps {
  games: Game[];
  reservations: Reservation[];
  blockedTables: BlockedTable[];
  onRefresh: () => void;
  homepageTexts: HomepageSettings;
}

export default function AdminPanel({ games, reservations, blockedTables, onRefresh, homepageTexts }: AdminPanelProps) {
  
  const [activeTab, setActiveTab] = useState<"dashboard" | "games" | "reservations" | "blocking" | "texts">("dashboard");

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

  // Blocking / Manual Booking states
  const [selectedGameId, setSelectedGameId] = useState("");
  const [blockTableType, setBlockTableType] = useState<"mesa4" | "mesa2">("mesa4");
  const [blockTableNumber, setBlockTableNumber] = useState<number | "">("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientPhone, setManualClientPhone] = useState("");

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
    }
  }, [homepageTexts]);

  const handleSaveTexts = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settingsRef = doc(db, "settings", "homepage");
      await setDoc(settingsRef, {
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
      });
      showFeedback("Textos da página principal e logotipo atualizados com sucesso!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "settings/homepage");
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
        const price = r.tableType === "mesa4" 
          ? (game?.priceTable4 || 24) 
          : (game?.priceTable2 || 12);
        
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
    setFormTables2(3);
    setFormPrice4(24);
    setFormPrice2(12);
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
        updatedAt: new Date().toISOString()
      };

      if (editingGame) {
        // UPDATE
        const docRef = doc(db, "games", editingGame.id);
        await updateDoc(docRef, gamePayload);
        showFeedback("Partida atualizada com sucesso no banco!");
      } else {
        // CREATE
        const gamesRef = collection(db, "games");
        await addDoc(gamesRef, {
          ...gamePayload,
          createdAt: new Date().toISOString()
        });
        showFeedback("Novo jogo da Copa do Mundo cadastrado!");
      }
      setShowGameForm(false);
      onRefresh();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "games");
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
      await deleteDoc(doc(db, "games", gameId));
      showFeedback("Jogo excluído com sucesso.");
      onRefresh();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `games/${gameId}`);
    } finally {
      setLoading(false);
    }
  };

  // Manual Status modification
  const handleUpdateStatus = async (resId: string, nextStatus: ReservationStatus) => {
    try {
      const docRef = doc(db, "reservations", resId);
      await updateDoc(docRef, {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
      showFeedback(`Status da reserva alterado para: ${nextStatus}`);
      onRefresh();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `reservations/${resId}`);
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
        // Create Block record
        const blocksRef = collection(db, "blockedTables");
        await addDoc(blocksRef, {
          gameId: selectedGameId,
          tableType: blockTableType,
          tableNumber: Number(blockTableNumber),
          blockedBy: "Futebol Admin",
          createdAt: new Date().toISOString()
        });
        showFeedback(`Mesa #${blockTableNumber} foi BLOQUEADA temporariamente.`);
      } else if (action === "unblock") {
        const blk = blockedTables.find(
          b => b.gameId === selectedGameId && b.tableType === blockTableType && b.tableNumber === Number(blockTableNumber)
        );
        if (blk) {
          await deleteDoc(doc(db, "blockedTables", blk.id));
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

        const resPayload = {
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

        await addDoc(collection(db, "reservations"), resPayload);
        showFeedback(`Mesa #${blockTableNumber} reservada manualmente para ${manualClientName}.`);
        
        // Reset manual inputs
        setManualClientName("");
        setManualClientPhone("");
      }

      setBlockTableNumber("");
      onRefresh();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "admin_action");
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
        <div className="space-y-8 animate-fade-in">
          
          {/* Analytical Bento Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total Reservas */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative overflow-hidden">
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
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative">
              <div className="p-3 bg-soccer-orange/10 border border-soccer-orange/30 rounded-xl">
                <DollarSign className="w-6 h-6 text-soccer-orange" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Faturamento Projetado
                </span>
                <span className="font-display text-2xl font-black text-soccer-cream font-mono">
                  R$ {metrics.faturamentoPrevisto},00
                </span>
              </div>
            </div>

            {/* Faturamento Confirmado */}
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative">
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
            <div className="bg-soccer-field/30 border border-soccer-field/60 p-6 rounded-2xl flex items-center gap-4 relative">
              <div className="p-3 bg-soccer-neon/10 border border-soccer-neon/30 rounded-xl">
                <Layers className="w-6 h-6 text-soccer-neon" />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase tracking-wider">
                  Soma Mesas Restantes
                </span>
                <span className="font-display text-2xl font-black text-soccer-cream font-mono">
                  {metrics.mesasReservadas} reservadas
                </span>
              </div>
            </div>

          </div>

          {/* Quick instructions and scheduler note */}
          <div className="bg-soccer-field/20 border border-soccer-gold/20 p-5 rounded-2xl text-xs space-y-2">
            <span className="font-display font-bold text-soccer-gold block text-sm">Automações Agendadas & Verificadores:</span>
            <p className="text-soccer-cream/80 text-xs leading-relaxed">
              Nosso servidor roda um monitorador a cada 10 segundos para conferir a agenda de jogos. Caso uma reserva seja <span className="text-soccer-orange font-bold uppercase font-mono">Gratuita</span> e a partida esteja a <strong>menos de 1 hora</strong> para iniciar, todos os slots expiram automaticamente, alterando o status para <span className="text-soccer-neon font-bold uppercase font-mono">liberada automaticamente</span> para evitar assentos vazios no Quinteiro.
            </p>
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
        <div className="space-y-6 animate-fade-in">
          
          {/* Reservation Filtering tools */}
          <div className="bg-[#03150b] p-5 rounded-2xl border border-soccer-field/90 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-soccer-gold uppercase mb-1">Filtrar por Partida</label>
              <select
                id="admin_filter_game_select"
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="w-full bg-[#051c0f] border border-soccer-field rounded-lg py-2 pl-3 pr-8 text-xs text-soccer-cream"
              >
                <option value="">-- Todas as Copas --</option>
                {games.map(g => (
                  <option key={g.id} value={g.id}>{g.homeTeam} vs {g.awayTeam}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col justify-end">
              <span className="block text-[10px] font-mono text-soccer-cream/50 uppercase text-right mb-1">Total Exibição</span>
              <span className="text-right text-xs font-mono font-bold text-soccer-gold">
                {selectedGameId 
                  ? reservations.filter(r => r.gameId === selectedGameId).length 
                  : reservations.length} reservas registradas
              </span>
            </div>
          </div>

          {/* LIST TABLE OF RESERVATIONS */}
          <div className="overflow-x-auto bg-[#03150b] rounded-2xl border border-soccer-field">
            <table className="w-full text-left text-xs text-soccer-cream">
              <thead className="bg-soccer-field/30 uppercase text-[10px] font-mono text-soccer-gold border-b border-soccer-field">
                <tr>
                  <th className="px-4 py-4">Convidado / Tel</th>
                  <th className="px-4 py-4">Jogo</th>
                  <th className="px-4 py-4">Mesa</th>
                  <th className="px-4 py-4">Pax</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4 text-right">Alterar Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soccer-field/30">
                {(selectedGameId 
                  ? reservations.filter(r => r.gameId === selectedGameId) 
                  : reservations
                ).map((res) => {
                  let statusColor = "bg-soccer-cream/10 text-soccer-cream/80 border-transparent";
                  if (res.status === "confirmado" || res.status === "ativa") {
                    statusColor = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
                  } else if (res.status === "aguardando comprovante") {
                    statusColor = "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse";
                  } else if (res.status === "cancelado" || res.status === "liberada automaticamente") {
                    statusColor = "bg-red-500/10 border-red-500/30 text-red-400";
                  }

                  return (
                    <tr key={res.id} className="hover:bg-soccer-field/20">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-sm">{res.clientName}</div>
                        <div className="text-[10px] font-mono text-soccer-cream/60 flex items-center gap-1 mt-0.5">
                          <PhoneCall className="w-3 h-3 text-soccer-orange shrink-0" />
                          <span>{res.clientPhone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 truncate max-w-[150px]">
                        <div>{res.gameName}</div>
                        <div className="text-[9px] font-mono text-soccer-cream/40">ID: {res.id.substring(0, 5).toUpperCase()}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs font-black">
                        <span className="text-soccer-gold">
                          {res.tableType === "mesa4" ? "M4" : "M2"}
                        </span>
                        <span className="ml-1 text-soccer-cream">#{res.tableNumber}</span>
                      </td>
                      <td className="px-4 py-4 font-mono">{res.paxCount} pessoas</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold ${statusColor}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <select
                          id={`change_res_status_${res.id}`}
                          value={res.status}
                          onChange={(e) => handleUpdateStatus(res.id, e.target.value as ReservationStatus)}
                          className="bg-[#051c0f] border border-soccer-field rounded-lg text-[11px] font-semibold text-soccer-cream py-1 px-1 outline-none"
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
              </tbody>
            </table>
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

                                if (file.size > 5 * 1024 * 1024) {
                                  throw new Error("A imagem é muito grande! Escolha um arquivo de no máximo 5MB.");
                                }

                                // Store user-selected filename and raw format dimensions
                                const originalSizeFormatted = (file.size / 1024).toFixed(1) + " KB";
                                setUploadedFileInfo({
                                  name: file.name,
                                  size: originalSizeFormatted
                                });

                                let fileToUpload: File | Blob = file;

                                // Compress JPEGs/PNGs client-side using a Canvas helper to save load time & bandwidth
                                if (fileExtension !== "svg" && file.type !== "image/svg+xml") {
                                  setFirebaseResponse("Otimizando dimensões para carregamento instantâneo...");
                                  try {
                                    fileToUpload = await new Promise<File | Blob>((resolve) => {
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        const img = new Image();
                                        img.onload = () => {
                                          const canvas = document.createElement("canvas");
                                          let width = img.width;
                                          let height = img.height;
                                          
                                          const MAX_BOUND = 1000;
                                          if (width > MAX_BOUND || height > MAX_BOUND) {
                                            if (width > height) {
                                              height = Math.round((height * MAX_BOUND) / width);
                                              width = MAX_BOUND;
                                            } else {
                                              width = Math.round((width * MAX_BOUND) / height);
                                              height = MAX_BOUND;
                                            }
                                          }
                                          
                                          canvas.width = width;
                                          canvas.height = height;
                                          const ctx = canvas.getContext("2d");
                                          if (ctx) {
                                            ctx.drawImage(img, 0, 0, width, height);
                                            const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
                                            canvas.toBlob((blob) => {
                                              if (blob) {
                                                const compressedFile = new File([blob], file.name, { type: outputType });
                                                // Update info with optimized weight
                                                setUploadedFileInfo({
                                                  name: file.name,
                                                  size: `${originalSizeFormatted} (Oposto: ${(blob.size / 1024).toFixed(1)} KB)`
                                                });
                                                resolve(compressedFile);
                                              } else {
                                                resolve(file);
                                              }
                                            }, outputType, 0.85);
                                          } else {
                                            resolve(file);
                                          }
                                        };
                                        img.onerror = () => resolve(file);
                                        img.src = event.target?.result as string;
                                      };
                                      reader.onerror = () => resolve(file);
                                      reader.readAsDataURL(file);
                                    });
                                  } catch (err) {
                                    console.warn("Falha na compressão automática, usando arquivo original:", err);
                                  }
                                }

                                setFirebaseResponse("Iniciando upload para o Firebase Storage...");
                                // Target folder 'settings/' with file name 'logo-evento' as mandated
                                const storageRef = ref(storage, `settings/logo-evento.${fileExtension}`);
                                const uploadTask = uploadBytesResumable(storageRef, fileToUpload);
                                
                                uploadTask.on('state_changed', 
                                  (snapshot) => {
                                    const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                                    setUploadProgress(progress);
                                    setFirebaseResponse(`Enviando ao Storage: ${progress}% concluído.`);
                                  }, 
                                  (error) => {
                                    console.error("Erro Firebase Storage:", error);
                                    setUploadStatus("error");
                                    setUploadError(error.message);
                                  }, 
                                  async () => {
                                    try {
                                      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                      setUploadStatus("success");
                                      setTextLogoUrl(downloadURL);
                                      setFirebaseResponse("Logo salva e atualizada com sucesso no Firestore em tempo real!");
                                      
                                      // Real-time Firestore document update
                                      const docRef = doc(db, "settings", "homepage");
                                      await updateDoc(docRef, { logoUrl: downloadURL });
                                    } catch (err: any) {
                                      setUploadStatus("error");
                                      setUploadError(err.message);
                                    }
                                  }
                                );
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
                            setTextLogoUrl("");
                            setUploadStatus("idle");
                            setUploadError("");
                            setUploadedFileInfo(null);
                            setFirebaseResponse("Logotipo removido.");
                            try {
                              // Real-time Firestore document wipe
                              const docRef = doc(db, "settings", "homepage");
                              await updateDoc(docRef, { logoUrl: "" });
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
                              const docRef = doc(db, "settings", "homepage");
                              await updateDoc(docRef, { logoUrl: val });
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

                  {/* MONITOR DE LOGOTIPO & FIREBASE STORAGE */}
                  {(uploadStatus !== "idle" || textLogoUrl) && (
                    <div className="mt-4 p-4 rounded-xl bg-[#03140a] border border-soccer-field/30 space-y-2.5 text-left">
                      <div className="flex items-center justify-between border-b border-soccer-field/20 pb-1.5">
                        <span className="text-soccer-gold font-sans font-bold uppercase text-[10px] tracking-wider">📦 Status do Logotipo</span>
                        <span className="text-[9px] font-mono text-soccer-cream/50">Auto-sincronizado</span>
                      </div>

                      <div className="space-y-2 text-xs text-soccer-cream">
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
                              <span className="text-amber-400 font-bold animate-pulse">Enviando imagem otimizada...</span>
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
                              ✨ Logo atualizada com sucesso!
                            </span>
                            Salvo e atualizado automaticamente no Firestore em tempo real. Os visitantes já veem a nova logo.
                          </div>
                        )}

                        {uploadStatus === "error" && uploadError && (
                          <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-[11px]">
                            <span className="font-bold block mb-0.5 text-red-400">⚠️ Erro no Upload:</span>
                            {uploadError}
                          </div>
                        )}

                        {textLogoUrl && (
                          <div className="text-[10px] font-mono bg-[#020e06] border border-soccer-field/15 p-2 rounded break-all text-soccer-cream/80 space-y-1">
                            <span className="text-soccer-gold font-sans font-bold uppercase text-[8px] tracking-wider block">URL Ativa da Imagem (Firestore):</span>
                            <span className="select-all block text-zinc-300">{textLogoUrl}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-soccer-cream/45 font-mono leading-tight">Formatos permitidos: .PNG, .JPG, .JPEG, .WEBP, .SVG. Imagens enviadas são carregadas no Firebase Storage; links manuais devem referenciar o arquivo de imagem diretamente.</p>
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

    </div>
  );
}
