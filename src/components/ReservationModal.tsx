/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Game, Reservation, BlockedTable } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, doc, writeBatch, getDocs } from "firebase/firestore";
import { 
  X, Info, Phone, User, Users, Clipboard, ExternalLink, Check, AlertTriangle, HelpCircle, ChevronRight,
  CreditCard, ShieldCheck, Lock, Sparkles
} from "lucide-react";

interface ReservationModalProps {
  game: Game;
  reservations: Reservation[];
  blockedTables: BlockedTable[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReservationModal({ 
  game, 
  reservations, 
  blockedTables, 
  onClose, 
  onSuccess 
}: ReservationModalProps) {
  
  const [step, setStep] = useState<"details" | "payment" | "success">("details");
  
  // Form coordinates
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [nickname, setNickname] = useState(""); // Honeypot spam defense
  const [paxCount, setPaxCount] = useState<number>(4);
  const [tableType, setTableType] = useState<"mesa4" | "mesa2">("mesa4");
  const [selectedTableNumbers, setSelectedTableNumbers] = useState<number[]>([]);
  const selectedTableNumber = selectedTableNumbers[0] || null;
  const setSelectedTableNumber = (value: number | null | ((prev: number | null) => number | null)) => {
    if (value === null) {
      setSelectedTableNumbers([]);
    } else if (typeof value === "function") {
      const next = value(selectedTableNumbers[0] || null);
      setSelectedTableNumbers(next === null ? [] : [next]);
    } else {
      setSelectedTableNumbers([value]);
    }
  };
  const [extraSeat, setExtraSeat] = useState(false);
  const [isSharedGroup, setIsSharedGroup] = useState(false);
  const [sharedGroupHost, setSharedGroupHost] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [createdReservation, setCreatedReservation] = useState<Reservation | null>(null);
  
  // Duplicate reservation warning states
  const [duplicateResFound, setDuplicateResFound] = useState<Reservation | null>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);

  // PagSeguro state management
  const [paymentOption, setPaymentOption] = useState<"pix" | "pagseguro">("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [installments, setInstallments] = useState("1");
  const [isPayingCard, setIsPayingCard] = useState(false);
  const [cardError, setCardError] = useState("");

  // Filter occupied tables for this specific game
  const activeReservationsForGame = reservations.filter(
    r => r.gameId === game.id && r.status !== "cancelado" && r.status !== "liberada automaticamente"
  );
  
  const blockedForGame = blockedTables.filter(b => b.gameId === game.id);

  // When pax changes, auto limit tableType compatibility if selecting only 1 table
  useEffect(() => {
    const numTables = Math.max(1, selectedTableNumbers.length);
    if (paxCount > numTables * 2 && tableType === "mesa2" && selectedTableNumbers.length <= 1) {
      setTableType("mesa4");
      setSelectedTableNumbers([]);
    }
  }, [paxCount, tableType, selectedTableNumbers]);

  useEffect(() => {
    if (game.disableExtraSeats) {
      setExtraSeat(false);
    }
  }, [game.disableExtraSeats]);

  // Visual helper lists of table numbers
  const mesa4Numbers = Array.from({ length: game.tablesTotal4 }, (_, i) => i + 1); // 1 to 30
  const mesa2Numbers = Array.from({ length: game.tablesTotal2 }, (_, i) => i + 1); // 1 to 3

  const isTableOccupied = (type: "mesa4" | "mesa2", number: number) => {
    return activeReservationsForGame.some(r => r.tableType === type && r.tableNumber === number);
  };

  const isTableBlocked = (type: "mesa4" | "mesa2", number: number) => {
    return blockedForGame.some(b => b.tableType === type && b.tableNumber === number);
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText("48558675000187");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const calculatePrice = () => {
    if (!game.isBrazilGame) return 0;
    const basePrice = tableType === "mesa4" ? (game.priceTable4 || 24) : (game.priceTable2 || 12);
    const count = Math.max(1, selectedTableNumbers.length);
    return extraSeat ? (basePrice * count + 6) : (basePrice * count);
  };

  const getCreatedReservationPrice = () => {
    if (!createdReservation) return calculatePrice();
    const basePrice = createdReservation.tableType === "mesa4" ? (game.priceTable4 || 24) : (game.priceTable2 || 12);
    const count = (createdReservation as any).tableNumbers && (createdReservation as any).tableNumbers.length > 0
      ? (createdReservation as any).tableNumbers.length
      : 1;
    return createdReservation.hasExtraSeat ? (basePrice * count + 6) : (basePrice * count);
  };

  const handleCardPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError("");
    
    if (!createdReservation) {
      setCardError("Nenhuma reserva vinculada identificada.");
      return;
    }

    const cleanCard = cardNumber.replace(/\s+/g, "");
    if (cleanCard.length < 15 || cleanCard.length > 16) {
      setCardError("Número do cartão inválido. Insira todos os dígitos.");
      return;
    }

    if (!cardName.trim()) {
      setCardError("Por favor, preencha o nome do titular exatamente como impresso no cartão.");
      return;
    }

    if (!cardExpiry.includes("/")) {
      setCardError("Insira a data de validade no formato MM/AA.");
      return;
    }

    if (cardCvv.length < 3 || cardCvv.length > 4) {
      setCardError("CVV incorreto. São 3 ou 4 dígitos.");
      return;
    }

    setIsPayingCard(true);

    try {
      // Simulate gateway approval timeout
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const transactionId = "PS_" + Math.random().toString(36).substring(2, 10).toUpperCase();

      const response = await fetch("/api/reservations/confirm-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reservationId: createdReservation.id,
          paymentMethod: "pagseguro",
          paymentId: transactionId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ocorreu um erro ao comunicar aprovação com o PagSeguro.");
      }

      const updatedData = await response.json();
      
      // Update local reservation state
      setCreatedReservation(prev => prev ? {
        ...prev,
        status: "confirmado",
        paymentMethod: "pagseguro",
        paymentId: transactionId
      } : null);

      setStep("success");
    } catch (err: any) {
      setCardError(err.message || "Falha na transação. Verifique seus dados do cartão ou tente novamente.");
    } finally {
      setIsPayingCard(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    if (formatted.length <= 19) {
      setCardNumber(formatted);
    }
  };

  const formatExpiry = (value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    if (clean.length >= 2) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
    }
    return clean;
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value);
    if (formatted.length <= 5) {
      setCardExpiry(formatted);
    }
  };

  const getCardBrand = (num: string) => {
    const clean = num.replace(/\s+/g, "");
    if (clean.startsWith("4")) return "visa";
    if (clean.startsWith("5")) return "mastercard";
    if (clean.startsWith("3")) return "amex";
    if (clean.startsWith("6")) return "elo";
    return "pagseguro";
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // 1. Anti-Spam: Honeypot trap check
    if (nickname.trim().length > 0) {
      console.warn("[ANTI-SPAM] Bot triggered honeypot. Simulating successful redirection.");
      setLoading(true);
      setTimeout(() => {
        setCreatedReservation({
          id: "spambot_trap_id_" + Math.random().toString(36).substring(2, 7).toUpperCase(),
          gameId: game.id,
          gameName: `${game.homeTeam} vs ${game.awayTeam}`,
          gameDateTime: game.dateTime,
          isBrazilGame: game.isBrazilGame,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          paxCount: paxCount,
          tableType: tableType,
          tableNumber: selectedTableNumber || 1,
          status: "confirmado",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setStep("success");
        setLoading(false);
      }, 1000);
      return;
    }

    // 2. Anti-Spam: Rate Limit Device Cooldown (60 seconds)
    const lastResTimeStr = localStorage.getItem("copaco_last_res_time");
    if (lastResTimeStr) {
      const diff = Date.now() - Number(lastResTimeStr);
      if (diff < 60000) {
        const secsLeft = Math.ceil((60000 - diff) / 1000);
        setFormError(`Por razões de segurança contra spam, aguarde ${secsLeft} segundos para fazer uma nova reserva.`);
        return;
      }
    }

    if (!clientName.trim()) {
      setFormError("Por favor, preencha o nome completo.");
      return;
    }
    if (!clientPhone.trim()) {
      setFormError("Por favor, informe seu telefone / WhatsApp de contato.");
      return;
    }
    if (selectedTableNumbers.length === 0) {
      setFormError("Por favor, selecione uma mesa disponível no mapa.");
      return;
    }

    // Check if the user already has a pending ("aguardando comprovante") reservation
    if (!bypassDuplicate) {
      const normPhone = (p: string) => p.replace(/\D/g, "");
      const cleanPhone = normPhone(clientPhone);
      
      const existingPending = activeReservationsForGame.find(
        r => r.status === "aguardando comprovante" && normPhone(r.clientPhone) === cleanPhone
      );
      
      if (existingPending) {
        setDuplicateResFound(existingPending);
        return; // Prevent submitting a new booking immediately
      }
    }

    // Double check rules on submission
    const currentChairsCountForGame = activeReservationsForGame.reduce((acc, r) => acc + (r.paxCount || 0), 0);
    const addedChairs = extraSeat ? (paxCount + 1) : paxCount;
    if (currentChairsCountForGame + addedChairs > 124) {
      setFormError(`Limite de ocupação de cadeiras atingido. Restam apenas ${124 - currentChairsCountForGame} cadeiras disponíveis para hoje.`);
      return;
    }

    // Validate single table limit for mesa2 if needed
    if (selectedTableNumbers.length === 1 && paxCount > 2 && tableType === "mesa2") {
      setFormError("Reservas de 2 lugares comportam no máximo 2 pessoas.");
      return;
    }

    const occupiedTable = selectedTableNumbers.find(num => isTableOccupied(tableType, num));
    if (occupiedTable) {
      setFormError(`A mesa #${occupiedTable} já se encontra reservada por outro cliente. Escolha outro número.`);
      return;
    }

    const blockedTable = selectedTableNumbers.find(num => isTableBlocked(tableType, num));
    if (blockedTable) {
      setFormError(`A mesa #${blockedTable} encontra-se bloqueada administrativamente.`);
      return;
    }

    const price = calculatePrice();
    setLoading(true);

    try {
      const response = await fetch("/api/reservations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          gameId: game.id,
          gameName: `${game.homeTeam} vs ${game.awayTeam}`,
          gameDateTime: game.dateTime,
          isBrazilGame: game.isBrazilGame,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          paxCount: extraSeat ? (paxCount + 1) : paxCount,
          tableType: tableType,
          tableNumber: selectedTableNumbers[0], // First table number for backwards compatibility
          tableNumbers: selectedTableNumbers,   // Complete array of chosen tables
          hasExtraSeat: extraSeat,
          isSharedGroup: isSharedGroup,
          sharedGroupHost: isSharedGroup ? (sharedGroupHost.trim() || clientName.trim()) : ""
        })
      });

      let reservationData: any;
      const contentType = response.headers.get("content-type");

      if (!response.ok) {
        let errMsg = "Não foi possível concluir sua reserva no servidor.";
        if (contentType && contentType.includes("application/json")) {
          try {
            const errJson = await response.json();
            errMsg = errJson.error || errMsg;
          } catch (e) {
            console.error("Erro ao analisar JSON de erro:", e);
          }
        } else {
          try {
            const errText = await response.text();
            if (errText && errText.length < 200 && !errText.includes("<!DOCTYPE") && !errText.includes("<html")) {
              errMsg = errText;
            } else {
              errMsg = "Erro interno no servidor ao processar reserva (Resposta não-JSON).";
            }
          } catch (e) {
            console.error("Erro ao ler texto de erro:", e);
          }
        }
        throw new Error(errMsg);
      }

      if (contentType && contentType.includes("application/json")) {
        reservationData = await response.json();
      } else {
        const rawText = await response.text();
        console.error("Resposta não-JSON do servidor:", rawText);
        throw new Error("Erro no servidor: o formato da resposta da reserva é inválido.");
      }
      
      // Store timestamp to reinforce anti-spam
      localStorage.setItem("copaco_last_res_time", Date.now().toString());

      const finalRes = reservationData?.reservation || reservationData;
      setCreatedReservation(finalRes);

      if (game.isBrazilGame) {
        setStep("payment");
      } else {
        setStep("success");
      }
    } catch (err: any) {
      setFormError(err.message || "Erro de conexão ao realizar reserva.");
    } finally {
      setLoading(false);
    }
  };

  // Pre-formatted messages
  const whatsappNumber = "+5531975099398";
  
  const getWhatsappUrl = () => {
    const res = createdReservation;
    const client = (res && res.clientName) ? res.clientName : (clientName.trim() || "Cliente");
    const matchName = (res && res.gameName) ? res.gameName : (`${game.homeTeam} vs ${game.awayTeam}` || "Copaço");
    const tType = (res && res.tableType) ? res.tableType : (tableType || "mesa4");
    
    // Support printing list of tables
    const listTableNumbers = (res && (res as any).tableNumbers) 
      ? (res as any).tableNumbers 
      : selectedTableNumbers;
    
    const tablesLabel = listTableNumbers.length > 1
      ? `Mesas Reservadas: #${listTableNumbers.join(", #")}`
      : `Mesa Reservada: #${listTableNumbers[0] || selectedTableNumbers[0] || ""}`;

    const pCount = (res && res.paxCount) ? res.paxCount : (extraSeat ? paxCount + 1 : paxCount);
    const hasExtra = (res && res.hasExtraSeat !== undefined) ? !!res.hasExtraSeat : extraSeat;
    
    // Explicitly determine value to make the PIX and Reservation audit airtight
    const resPrice = res ? getCreatedReservationPrice() : calculatePrice();
    const isBirthday = (res && (res as any).isSharedGroup) || isSharedGroup;
    const birthdayLabel = isBirthday && res ? `\nLink dos Convidados: ${window.location.origin}/?aniversario=${res.id}\n` : "";
    const extraLabel = hasExtra ? " (com 1 cadeira/ingresso extra individual)" : "";
    
    const textMsg = `Olá! Acabei de fazer minha reserva para o COPAÇO no Quinteiro e estou enviando meu comprovante de pagamento.\n\n*Resumo da Reserva*:\nCliente: ${client}\nJogo: ${matchName}\n${tablesLabel} (${tType === "mesa4" ? "Mesa para 4 pessoas" : "Mesa para 2 pessoas"})${extraLabel}\nQuantidade de pessoas: ${pCount} pessoas\nValor total via PIX: R$ ${resPrice},00${birthdayLabel}\n\nAguardando confirmação!`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(textMsg)}`;
  };

  if (game.disableReservations) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-soccer-dark/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-gradient-to-b from-[#051c0e] to-[#010904] border border-red-500/30 rounded-3xl w-full max-w-md p-8 text-center text-soccer-cream space-y-6 shadow-2xl relative">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-600" />
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-display font-black text-white">Reservas Antecipadas Esgotadas</h3>
            <div className="text-soccer-gold font-display font-bold text-sm tracking-wide uppercase">
              {game.homeTeam} x {game.awayTeam}
            </div>
            <p className="text-xs text-soccer-cream/80 leading-relaxed">
              As reservas antecipadas de mesa para esta partida do dia estão esgotadas.
            </p>
          </div>
          
          <div className="bg-amber-500/10 border border-soccer-gold/30 p-4 rounded-xl text-left space-y-1">
            <span className="block text-soccer-gold text-xs font-bold font-sans">🎟️ Venda na Portaria:</span>
            <p className="text-soccer-cream/90 text-xs leading-relaxed">
              Teremos venda de ingresso individual diretamente na portaria do evento no dia do jogo físico por <strong className="text-soccer-gold">R$ 10,00</strong>. Sujeito à lotação máxima do espaço! Chegue cedo para garantir seu lugar.
            </p>
          </div>

          <button
            id="close_blocked_modal_btn"
            onClick={onClose}
            className="w-full py-3 bg-[#03150b] hover:bg-soccer-field border border-soccer-field/60 text-soccer-gold font-mono text-xs rounded-xl transition-all cursor-pointer font-bold animate-pulse"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-soccer-dark/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-soccer-field/90 to-[#03150b] border border-soccer-gold/30 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
        
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-500 via-soccer-gold to-soccer-orange" />

        {/* Close Button */}
        <button
          id="close_modal_btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-soccer-cream/50 hover:text-soccer-cream hover:bg-soccer-field/80 p-2 rounded-full transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Content */}
        <div className="p-6 md:p-10 space-y-6">

          {/* PROGRESS STEPS TIMELINE */}
          <div className="w-full max-w-2xl mx-auto pb-4 relative z-20">
            <div className="flex items-center justify-between relative">
              
              {/* Connector line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -translate-y-1/2 z-0" />
              <div 
                className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-soccer-gold via-[#f97316] to-[#ec4899] -translate-y-1/2 z-0 transition-all duration-500"
                style={{
                  width: step === "details" ? "0%" : step === "payment" ? "50%" : "100%"
                }}
              />

              {/* Step 1 indicator */}
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-black transition-all ${
                  step === "details" 
                    ? "bg-soccer-gold text-soccer-dark scale-110 ring-4 ring-yellow-500/20" 
                    : "bg-soccer-field border-2 border-soccer-gold text-soccer-cream"
                }`}>
                  1
                </div>
                <span className="text-[10px] font-display font-medium text-white/70 uppercase tracking-tight mt-1.5 hidden sm:block">Mesa & Contato</span>
              </div>

              {/* Step 2 indicator */}
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-black transition-all ${
                  step === "payment" 
                    ? "bg-soccer-gold text-soccer-dark scale-110 ring-4 ring-yellow-500/20" 
                    : step === "success" 
                    ? "bg-soccer-field border-2 border-soccer-gold text-soccer-cream"
                    : "bg-soccer-dark border border-white/15 text-white/40"
                }`}>
                  2
                </div>
                <span className="text-[10px] font-display font-medium text-white/70 uppercase tracking-tight mt-1.5 hidden sm:block font-sans">
                  Garantia Pix
                </span>
              </div>

              {/* Step 3 indicator */}
              <div className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-black transition-all ${
                  step === "success" 
                    ? "bg-soccer-gold text-soccer-dark scale-110 ring-4 ring-yellow-500/20" 
                    : "bg-soccer-dark border border-white/10 text-white/40"
                }`}>
                  3
                </div>
                <span className="text-[10px] font-display font-medium text-white/70 uppercase tracking-tight mt-1.5 hidden sm:block">Sucesso!</span>
              </div>

            </div>
          </div>

          {/* STEP 1: FILL DETAILS & SELECT TABLES */}
          {step === "details" && (
            <div>
              <div className="mb-6">
                <span className="text-[10px] font-mono text-soccer-gold uppercase tracking-widest block mb-1">
                  NOVA RESERVA
                </span>
                <h3 className="text-2xl md:text-3xl font-display font-black text-soccer-cream leading-tight">
                  {game.homeTeam} vs {game.awayTeam}
                </h3>
                <p className="text-xs text-soccer-cream/60 mt-1">
                  Selecione sua mesa e preencha as informações para participar da torcida do Quinteiro.
                </p>
              </div>

              {/* Banner de Clareza sobre Espaços e Reservas */}
              <div className="mb-6 bg-soccer-field/10 border border-soccer-field/45 p-4 rounded-2xl text-left shadow-lg">
                <div className="flex gap-3 items-start">
                  <div className="bg-soccer-gold/10 p-2 rounded-xl text-soccer-gold h-fit shrink-0 mt-0.5">
                    <Info className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 text-xs text-soccer-cream">
                    <p className="font-bold text-soccer-gold font-display uppercase tracking-wider text-[11px]">
                      Aviso Importante sobre os Espaços
                    </p>
                    <p className="text-soccer-cream/80 font-sans leading-relaxed">
                      As <strong className="text-soccer-gold">reservas de mesa são exclusivas para o quintal principal</strong> (onde ficam o telão principal, DJs, sorteios, bolão e atrações especiais).
                    </p>
                    <p className="text-soccer-cream/70 font-sans text-[11px] border-t border-soccer-field/30 pt-1.5 mt-1">
                      💡 Outras áreas da casa possuem TVs de 50 polegadas que funcionam por <strong className="text-white">ordem de chegada</strong> de forma <strong className="text-emerald-400 font-bold">100% gratuita</strong>, sem exigir reserva.
                    </p>
                  </div>
                </div>
              </div>

              {formError && (
                <div className="bg-soccer-neon/10 border border-soccer-neon/40 text-soccer-cream p-4 rounded-xl text-xs flex items-center gap-2 mb-6">
                  <AlertTriangle className="w-4 h-4 text-soccer-neon shrink-0 animate-pulse" />
                  <span>{formError}</span>
                </div>
              )}

              {duplicateResFound && (
                <div className="mb-6 bg-gradient-to-br from-[#1c1404] to-[#0d0901] border border-soccer-gold p-4 md:p-5 rounded-2xl text-left shadow-2xl relative overflow-hidden animate-fade-in">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-soccer-gold/5 blur-2xl rounded-full" />
                  <div className="flex gap-4 items-start">
                    <div className="bg-soccer-gold/20 p-2.5 rounded-xl text-soccer-gold h-fit shrink-0 mt-0.5 border border-soccer-gold/30">
                      <AlertTriangle className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="space-y-4 text-xs text-soccer-cream w-full">
                      <div>
                        <p className="font-extrabold text-soccer-gold font-display uppercase tracking-wider text-[12px]">
                          ⚠️ Identificamos uma Reserva Pendente!
                        </p>
                        <p className="text-soccer-cream/90 font-sans leading-relaxed mt-1 text-[12px]">
                          Olá, <strong className="text-white">{clientName}</strong>! Já existe uma <strong className="text-soccer-gold font-bold">Mesa #{duplicateResFound.tableNumber} ({duplicateResFound.tableType === "mesa4" ? "Mesa para 4" : "Mesa para 2"} pessoas)</strong> pendente de pagamento via Pix ligada a este número de telefone para esta partida.
                        </p>
                        <p className="text-soccer-cream/60 text-[11px] mt-1.5 leading-normal">
                          Para evitar duplicidade, você quer prosseguir e visualizar os dados de pagamento da sua mesa anterior, ou de fato quer ignorar e reservar mais uma nova mesa?
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            // Go straight to payment of existing table
                            setCreatedReservation(duplicateResFound);
                            setStep("payment");
                          }}
                          className="flex-1 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-400 hover:to-soccer-gold text-soccer-dark py-2.5 px-4 rounded-xl text-xs font-display font-black flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-[1.01] active:translate-y-px"
                        >
                          <span>👉 Pagar/Ver Mesa #{duplicateResFound.tableNumber}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Let them bypass
                            setBypassDuplicate(true);
                            setDuplicateResFound(null);
                          }}
                          className="px-4 py-2.5 bg-transparent border border-soccer-cream/25 hover:border-soccer-gold hover:text-soccer-gold text-soccer-cream/75 text-[10px] uppercase font-mono rounded-xl transition-all cursor-pointer text-center"
                        >
                          Ignorar e Reservar Outra
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitDetails} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Form Fields Left Side */}
                <div className="lg:col-span-5 space-y-5">
                  <div className="bg-[#03150b] border border-soccer-field/50 p-5 rounded-2xl space-y-4 shadow-xl text-soccer-cream">
                    <h4 className="text-sm font-display font-bold text-soccer-gold border-b border-soccer-field/30 pb-2 flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      1. Informações de Contato
                    </h4>

                    {/* Guest Name */}
                    <div>
                      <label className="block text-[10px] font-mono text-soccer-cream/60 uppercase mb-1.5">
                        Nome Completo
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3 w-4 h-4 text-soccer-cream/35" />
                        <input
                          id="client_name_input"
                          type="text"
                          required
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="Digite seu nome legal"
                          className="w-full bg-[#041a0d] border border-soccer-field/50 focus:border-soccer-gold text-soccer-cream rounded-xl py-2.5 pl-10 pr-4 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Honeypot hidden input for anti-spam */}
                    <div className="absolute hidden w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
                      <input
                        id="form_nickname_field"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="Your Nickname"
                      />
                    </div>

                    {/* Guest Phone */}
                    <div>
                      <label className="block text-[10px] font-mono text-soccer-cream/60 uppercase mb-1.5">
                        WhatsApp (Celular)
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3 w-4 h-4 text-soccer-cream/35" />
                        <input
                          id="client_phone_input"
                          type="tel"
                          required
                          value={clientPhone}
                          onChange={(e) => setClientPhone(e.target.value)}
                          placeholder="(31) 99999-9999"
                          className="w-full bg-[#041a0d] border border-soccer-field/50 focus:border-soccer-gold text-soccer-cream rounded-xl py-2.5 pl-10 pr-4 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Pax Count */}
                    <div>
                      <label className="block text-[10px] font-mono text-soccer-cream/60 uppercase mb-1.5">
                        Quantidade de Pessoas
                      </label>
                      <div className="relative">
                        <Users className="absolute left-3.5 top-3 w-4 h-4 text-soccer-cream/35" />
                        <select
                          id="pax_select"
                          value={paxCount}
                          onChange={(e) => setPaxCount(Number(e.target.value))}
                          className="w-full bg-[#041a0d] border border-soccer-field/50 focus:border-soccer-gold text-soccer-cream rounded-xl py-2.5 pl-10 pr-4 text-xs outline-none transition-all appearance-none cursor-pointer"
                        >
                          {Array.from({ 
                            length: tableType === "mesa4" 
                              ? Math.max(1, selectedTableNumbers.length) * 4 
                              : Math.max(1, selectedTableNumbers.length) * 2 
                          }, (_, idx) => idx + 1).map((val) => (
                            <option key={`pax_option_${val}`} value={val}>
                              {val} {val === 1 ? "Pessoa" : "Pessoas"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Odd-number extra seat option for Brazil games */}
                    {game.isBrazilGame && !game.disableExtraSeats && (
                      <div className="bg-[#042010] border border-soccer-field/40 p-3 rounded-xl mt-3 space-y-1.5 transition-all">
                        <label className="flex items-start gap-2.5 cursor-pointer group select-none">
                          <input
                            id="extra_seat_checkbox"
                            type="checkbox"
                            checked={extraSeat}
                            onChange={(e) => setExtraSeat(e.target.checked)}
                            className="mt-0.5 rounded border-soccer-field/60 text-soccer-gold focus:ring-0 cursor-pointer h-4 w-4 bg-[#03140a]"
                          />
                          <div className="text-xs">
                            <span className="font-bold text-white group-hover:text-soccer-gold transition-colors block">
                              Adicionar ingresso extra? (Ímpar)
                            </span>
                            <span className="text-[10px] text-soccer-cream/70 leading-normal block mt-0.5">
                              Quero incluir 1 cadeira / pessoa adicional na minha mesa pagando antecipadamente <strong className="text-soccer-gold font-bold">+ R$ 6,00</strong>.
                            </span>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Mesa de Aniversário ou Dividida por Link (Vaquinha) Toggle */}
                    <div className="bg-[#042010] border border-soccer-field/40 p-4 rounded-xl mt-3 space-y-3 transition-all">
                      <label className="flex items-start gap-2.5 cursor-pointer group select-none">
                        <input
                          id="shared_group_checkbox"
                          type="checkbox"
                          checked={isSharedGroup}
                          onChange={(e) => setIsSharedGroup(e.target.checked)}
                          className="mt-0.5 rounded border-soccer-field/60 text-soccer-gold focus:ring-0 cursor-pointer h-4 w-4 bg-[#03140a]"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-white group-hover:text-soccer-gold transition-colors block">
                            🎂 Abrir como Mesa de Aniversário ou Dividida?
                          </span>
                          <span className="text-[10px] text-soccer-cream/70 leading-normal block mt-0.5">
                            Seus convidados poderão confirmar e pagar a cadeira deles individualmente via Pix usando um link exclusivo!
                          </span>
                        </div>
                      </label>

                      {isSharedGroup && (
                        <div className="space-y-1.5 pt-2 animate-fade-in text-left">
                          <label className="block text-[10px] font-mono text-soccer-gold uppercase font-bold">
                            Nome do Aniversariante / Nome do Grupo
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Aniversário da Ana"
                            value={sharedGroupHost}
                            onChange={(e) => setSharedGroupHost(e.target.value)}
                            className="w-full bg-[#03140a] border border-soccer-field/60 focus:border-soccer-gold text-soccer-cream rounded-lg py-1.5 px-3 text-xs outline-none transition-all"
                          />
                          <p className="text-[9px] text-soccer-cream/60 italic leading-normal">
                            O link gerado no final associará as pessoas a esta mesa de aniversário pelo nome. cada cadeira avulsa custará R$ 6,00.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary Area */}
                  <div className="bg-[#03150b] border border-soccer-field/50 p-5 rounded-2xl text-soccer-cream shadow-inner">
                    <h4 className="text-xs font-mono font-black text-soccer-gold uppercase mb-3 tracking-wider">
                      Resumo Financeiro
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-soccer-cream/50">Tipo de jogo:</span>
                        <span className="font-mono text-soccer-gold font-bold">
                          {game.isBrazilGame ? "Premium (Brasil)" : "Gratuito"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-soccer-cream/50">Tipo de Mesa:</span>
                        <span className="text-soccer-cream font-semibold">
                          {tableType === "mesa4" ? "Mesa p/ 4 pessoas" : "Mesa p/ 2 pessoas"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-soccer-cream/50">Designação:</span>
                        <span className="text-soccer-cream font-mono font-bold text-right max-w-[150px] truncate">
                          {selectedTableNumbers.length > 0 
                            ? selectedTableNumbers.map(n => `#${n}`).join(", ") 
                            : "Não selecionada"
                          }
                        </span>
                      </div>
                      <div className="border-t border-soccer-field mt-3 pt-3 space-y-1.5 text-right flex flex-col items-end">
                        <div className="flex justify-between w-full items-center">
                          <span className="text-xs font-display font-medium text-soccer-cream/70">
                            {selectedTableNumbers.length > 1 
                              ? `${selectedTableNumbers.length}x Mesas (Antecipado):` 
                              : "Mesa (Antecipado):"
                            }
                          </span>
                          <span className="text-sm font-display font-black text-soccer-cream font-mono">
                            {selectedTableNumbers.length > 1
                              ? `${selectedTableNumbers.length}x R$ ${tableType === "mesa4" ? (game.priceTable4 || 24) : (game.priceTable2 || 12)},00 = R$ ${(tableType === "mesa4" ? (game.priceTable4 || 24) : (game.priceTable2 || 12)) * selectedTableNumbers.length},00`
                              : `R$ ${tableType === "mesa4" ? (game.priceTable4 || 24) : (game.priceTable2 || 12)},00`
                            }
                          </span>
                        </div>
                        {extraSeat && (
                          <div className="flex justify-between w-full items-center text-xs text-soccer-gold">
                            <span>1x Cadeira Extra (Ímpar):</span>
                            <span className="font-mono font-bold">+ R$ 6,00</span>
                          </div>
                        )}
                        {game.isBrazilGame && (
                          <div className="flex justify-between w-full items-center pt-2 border-t border-soccer-field/30 mt-1">
                            <span className="text-xs font-bold text-white">Total via PIX:</span>
                            <span className="text-lg font-display font-black text-soccer-gold font-mono animate-pulse">
                              R$ {calculatePrice()},00
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {game.isBrazilGame && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl text-[10px] text-emerald-300 mt-4 leading-relaxed">
                        <div className="flex gap-2">
                          <span className="text-base shrink-0">🎈</span>
                          <div>
                            <strong className="text-emerald-400 block font-bold mb-0.5 uppercase tracking-wide">AVISO DE PORTARIA & ANIVERSÁRIOS:</strong>
                            No dia do evento teremos venda de ingressos individuais na porta por <strong className="text-white">R$ 10,00 por pessoa</strong>.
                            <span className="block mt-1">🎂 <strong className="text-soccer-gold">Aniversariantes:</strong> Liberamos entrada <strong className="text-white">OFF (Gratuita)</strong> para o aniversariante! Seus convidados pagam normalmente na portaria ou você pode reservar mesa antecipadamente pagando 6 reais por pessoa.</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTableNumbers.length > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl text-[10px] text-amber-200 mt-3 leading-relaxed">
                        <div className="flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-soccer-orange shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-soccer-orange block font-bold mb-0.5 uppercase tracking-wide">ATENÇÃO À OCUPAÇÃO:</strong>
                            A numeração da mesa no mapa serve para controle de setores. A ocupação física das mesas ocorre por <strong className="text-white underline">ordem de chegada</strong> no dia do evento.
                          </div>
                        </div>
                      </div>
                    )}

                    {!game.isBrazilGame && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-[10px] text-amber-300 mt-4 leading-relaxed">
                        <Info className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                        <strong>Aviso:</strong> Reservas gratuitas expiram automaticamente se não forem ocupadas até 1 hora antes do início do jogo.
                      </div>
                    )}
                  </div>
                </div>

                {/* Table Map Grid right side */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-[#03150b] border border-soccer-field/50 p-5 rounded-2xl shadow-xl">
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-soccer-field/30 pb-3 mb-4">
                      <h4 className="text-sm font-display font-bold text-soccer-gold flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        2. Escolha sua Mesa no Mapa
                      </h4>

                      {/* Flex Selector */}
                      <div className="flex bg-[#041a0d] p-0.5 rounded-lg border border-soccer-field/50 text-xs">
                        <button
                          id="select_mesa4_type_btn"
                          type="button"
                          onClick={() => {
                            setTableType("mesa4");
                            setSelectedTableNumber(null);
                          }}
                          className={`px-3.5 py-1.5 rounded-md transition-all font-mono text-[10px] uppercase tracking-wider font-extrabold select-none cursor-pointer ${
                            tableType === "mesa4"
                              ? "bg-soccer-gold text-soccer-dark shadow font-black scale-102"
                              : "text-soccer-cream/60 hover:text-soccer-cream hover:bg-white/5"
                          }`}
                        >
                          Mesa de 4 (M4)
                        </button>
                        <button
                          id="select_mesa2_type_btn"
                          type="button"
                          onClick={() => {
                            if (paxCount > 2) {
                              setPaxCount(2);
                            }
                            setTableType("mesa2");
                            setSelectedTableNumber(null);
                          }}
                          className={`px-3.5 py-1.5 rounded-md transition-all font-mono text-[10px] uppercase tracking-wider font-extrabold select-none cursor-pointer ${
                            tableType === "mesa2"
                              ? "bg-soccer-gold text-soccer-dark shadow font-black scale-102"
                              : "text-soccer-cream/60 hover:text-soccer-cream hover:bg-white/5"
                          }`}
                        >
                          Mesa de 2 (M2)
                        </button>
                      </div>
                    </div>

                    {paxCount > 2 && tableType === "mesa4" && (
                      <p className="text-[10px] text-soccer-cream/80 mb-3 bg-soccer-field/25 p-2 rounded-lg italic">
                        💡 Mesas de 4 são recomendadas para seu grupo de {paxCount} pessoas. Se você preferir uma Mesa de 2 lugares (M2), clique em "Mesa de 2" acima (sua quantidade de pessoas será ajustada para 2).
                      </p>
                    )}

                    {/* Visual Status Legend */}
                    <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-soccer-dark/70 mb-5">
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-[#0e6e30] border border-[#0c5324]" />
                        <span>Disponível</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-soccer-gold border border-soccer-gold text-white flex items-center justify-center text-[8px] font-bold">✓</span>
                        <span>Selecionada</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-zinc-800 border border-zinc-700" />
                        <span>Reservada</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-red-950/80 border border-red-900" />
                        <span>Bloqueada</span>
                      </div>
                    </div>

                    {/* GRID DISPLAY FOR TABLES OF 4 (30 Tables) */}
                    {tableType === "mesa4" && (
                      <div>
                        <div className="text-[11px] font-mono text-soccer-cream/80 uppercase mb-2 flex items-center justify-between">
                          <span>MESA PARA 4 PESSOAS (30 Mesas Disponíveis)</span>
                          {game.isBrazilGame && (
                            <span className="text-soccer-gold font-bold">4x R$ {Math.round((game.priceTable4 || 24) / 4)}/pessoa</span>
                          )}
                        </div>
                        <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-6 gap-3 p-4 bg-[#041a0d] rounded-2xl border border-soccer-field/50 max-h-[300px] overflow-y-auto">
                          {mesa4Numbers.map((num) => {
                            const occupied = isTableOccupied("mesa4", num);
                            const blocked = isTableBlocked("mesa4", num);
                            const selected = selectedTableNumbers.includes(num);

                            let btnStyle = "bg-[#0e6e30] text-white border border-[#0c5324] hover:bg-[#0b5425] hover:scale-105 cursor-pointer shadow-sm";
                            if (occupied) {
                              btnStyle = "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-40";
                            } else if (blocked) {
                              btnStyle = "bg-red-950/80 text-red-500 border border-red-900/60 cursor-not-allowed opacity-40";
                            } else if (selected) {
                              btnStyle = "bg-soccer-gold text-white border border-soccer-gold font-bold scale-105 shadow-md glow-soccer-gold cursor-pointer";
                            }

                            return (
                              <button
                                key={`mesa4_${num}`}
                                id={`mesa4_select_btn_${num}`}
                                type="button"
                                disabled={occupied || blocked}
                                onClick={() => {
                                  if (selected) {
                                    setSelectedTableNumbers(prev => prev.filter(n => n !== num));
                                  } else {
                                    setSelectedTableNumbers(prev => [...prev, num]);
                                  }
                                }}
                                className={`h-11 rounded-xl border text-xs flex flex-col items-center justify-center transition-all ${btnStyle}`}
                              >
                                <span className="font-mono text-xs">M4</span>
                                <span className="text-[10px] font-bold ml-0.5">#{num}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* GRID DISPLAY FOR TABLES OF 2 (3 Tables) */}
                    {tableType === "mesa2" && (
                      <div>
                        <div className="text-[11px] font-mono text-soccer-cream/80 uppercase mb-2 flex items-center justify-between">
                          <span>MESA PARA 2 PESSOAS (3 Mesas Disponíveis)</span>
                          {game.isBrazilGame && (
                            <span className="text-soccer-gold font-bold">2x R$ {Math.round((game.priceTable2 || 12) / 2)}/pessoa</span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-4 p-4 bg-[#041a0d] rounded-2xl border border-soccer-field/50">
                          {mesa2Numbers.map((num) => {
                            const occupied = isTableOccupied("mesa2", num);
                            const blocked = isTableBlocked("mesa2", num);
                            const selected = selectedTableNumbers.includes(num);

                            let btnStyle = "bg-[#0e6e30] text-white border border-[#0c5324] hover:bg-[#0b5425] hover:scale-105 cursor-pointer shadow-sm";
                            if (occupied) {
                              btnStyle = "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-40";
                            } else if (blocked) {
                              btnStyle = "bg-red-950/80 text-red-500 border border-red-900/60 cursor-not-allowed opacity-40";
                            } else if (selected) {
                              btnStyle = "bg-soccer-gold text-white border border-soccer-gold font-bold scale-105 shadow-md glow-soccer-gold cursor-pointer";
                            }

                            return (
                              <button
                                key={`mesa2_${num}`}
                                id={`mesa2_select_btn_${num}`}
                                type="button"
                                disabled={occupied || blocked}
                                onClick={() => {
                                  if (selected) {
                                    setSelectedTableNumbers(prev => prev.filter(n => n !== num));
                                  } else {
                                    setSelectedTableNumbers(prev => [...prev, num]);
                                  }
                                }}
                                className={`h-14 rounded-xl border text-xs flex flex-col items-center justify-center transition-all ${btnStyle}`}
                              >
                                <span className="font-mono text-xs">M2</span>
                                <span className="text-xs font-bold">#{num}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Field Indicator graphic */}
                    <div className="mt-5 border-t border-dashed border-soccer-field/40 pt-4 text-center">
                      <div className="inline-block px-10 py-1 border border-soccer-field/40 rounded-t-xl bg-[#041a0d] font-display font-medium text-[10px] text-soccer-gold uppercase tracking-wider">
                        Direção do Telão Principal 📺
                      </div>
                      <div className="w-full bg-gradient-to-r from-transparent via-soccer-gold/20 to-transparent h-1" />
                    </div>

                    {/* Highly visible first-come first-served seating layout warning */}
                    <div className="mt-4 p-4 rounded-xl bg-soccer-orange/15 border border-soccer-orange/40 text-xs text-amber-200 leading-relaxed font-sans shadow-lg">
                      <div className="flex gap-2.5 items-start">
                        <AlertTriangle className="w-5 h-5 text-soccer-orange shrink-0 mt-0.5 animate-bounce" />
                        <div>
                          <span className="font-bold text-soccer-orange block uppercase tracking-wide mb-1">REGRAS DE POSICIONAMENTO DA MESA:</span>
                          As mesas físicas são ocupadas estritamente por <strong className="text-white underline font-bold">ordem de chegada</strong> no dia do jogo. 
                          O número selecionado no mapa serve apenas para controle de limites e capacidade e <strong className="text-white underline font-bold">não corresponde</strong> à uma demarcação física exata ou posição definitiva no espaço do evento.
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Submission Action Button */}
                  <button
                    id="submit_reservation_details_btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark font-display font-bold text-sm tracking-wide shadow-lg hover:shadow-soccer-gold/10 transition-all hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="w-5 h-5 rounded-full border-2 border-soccer-dark/20 border-t-soccer-dark animate-spin" />
                    ) : (
                      <>
                        <span>Avançar com Reserva</span>
                        <ChevronRight className="w-4 h-4 text-soccer-dark" />
                      </>
                    )}
                  </button>

                </div>

              </form>
            </div>
          )}

          {/* STEP 2: PIX PAYMENT (BRAZIL GAMES ONLY) */}
          {step === "payment" && createdReservation && (
            <div className="max-w-xl mx-auto text-center space-y-6 text-soccer-cream">
              <div className="w-16 h-16 bg-soccer-gold/10 border border-soccer-gold/30 rounded-full flex items-center justify-center mx-auto">
                <Clipboard className="w-7 h-7 text-soccer-gold animate-pulse" />
              </div>

              <div>
                <span className="text-[10px] font-mono text-soccer-gold font-bold uppercase tracking-widest block mb-1">
                  AGUARDANDO PAGAMENTO PIX
                </span>
                <h3 className="text-2xl font-display font-black text-soccer-cream">
                  Efetue o pagamento de R$ {getCreatedReservationPrice()},00
                </h3>
                <p className="text-xs text-soccer-cream/70 mt-2">
                  As mesas de jogos do Brasil são concorridas e necessitam de comprovação de depósito via PIX para garantia de vaga.
                </p>
              </div>

              {/* PIX Key and Value Card */}
              <div className="bg-[#03150b] border border-soccer-field p-6 rounded-2xl space-y-4 shadow-xl text-soccer-cream text-left">
                <div className="bg-soccer-dark/60 p-4 rounded-xl border border-soccer-field/50">
                  <span className="block text-[10px] font-mono text-soccer-gold uppercase font-bold">Chave PIX (CNPJ)</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono text-sm text-soccer-cream font-semibold">48558675000187</span>
                    <button
                      id="copy_pix_key_btn"
                      onClick={handleCopyPix}
                      className="px-3 py-1.5 bg-soccer-field hover:bg-soccer-field/80 text-soccer-gold font-mono text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1 font-semibold cursor-pointer border border-soccer-field/50"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-3.5 h-3.5" />
                          <span>Copiar Chave</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-[#03150b] p-4 rounded-xl border border-soccer-field/55 flex justify-between items-center font-mono text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-soccer-gold">Valor do Pix</span>
                    <span className="font-display text-lg text-soccer-cream font-extrabold">R$ {getCreatedReservationPrice()},00</span>
                  </div>
                  <div className="text-right text-[10px] text-soccer-cream/50">
                    {createdReservation && (createdReservation as any).tableNumbers && (createdReservation as any).tableNumbers.length > 1
                      ? `Mesas: #${(createdReservation as any).tableNumbers.join(", #")}`
                      : `Mesa #${createdReservation ? createdReservation.tableNumber : (selectedTableNumbers.length > 0 ? selectedTableNumbers.join(", #") : "1")}`
                    }<br />
                    Para {createdReservation ? createdReservation.paxCount : (extraSeat ? paxCount + 1 : paxCount)} pessoas {(createdReservation?.hasExtraSeat || (!createdReservation && extraSeat)) ? "(Ímpar)" : ""}
                  </div>
                </div>
              </div>

              {createdReservation && (createdReservation.isSharedGroup || isSharedGroup) && (
                <div className="bg-[#042010] border border-soccer-gold/40 p-5 rounded-2xl text-left space-y-3 font-sans text-xs text-soccer-cream shadow-md">
                  <div className="flex items-center gap-2 text-soccer-gold font-bold">
                    <span>👑 Link de Convites de Aniversário</span>
                  </div>
                  <p className="text-zinc-300 text-xs leading-normal">
                    Como você criou uma <strong>Mesa de Aniversário / Compartilhada</strong>, copie o link exclusivo abaixo e envie para os seus convidados no WhatsApp. Eles poderão confirmar presença e pagar a cadeira individual de R$ 6,00 diretamente!
                  </p>
                  
                  <div className="bg-black/40 border border-soccer-field/50 p-3 rounded-xl flex items-center justify-between gap-3 font-mono text-xs">
                    <span className="text-soccer-cream truncate select-all">{`${window.location.origin}/?aniversario=${createdReservation.id}`}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?aniversario=${createdReservation.id}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-soccer-field text-soccer-gold hover:bg-soccer-field/80 rounded transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Instructions and CTA buttons */}
              <div className="bg-soccer-neon/10 border border-soccer-neon/20 p-5 rounded-2xl text-xs text-left text-soccer-cream leading-relaxed space-y-2">
                <p className="font-semibold text-soccer-neon text-xs">Instruções Importantes:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-soccer-cream/85 text-[11px]">
                  <li>Copie o CNPJ acima e faça a transferência em seu app bancário.</li>
                  <li>Clique no botão abaixo para abrir o WhatsApp oficial de confirmações do Quinteiro.</li>
                  <li>Envie o comprovante de transferência diretamente pelo chat.</li>
                </ol>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  id="confirm_payment_whatsapp_btn"
                  onClick={() => {
                    window.open(getWhatsappUrl(), "_blank", "noopener,noreferrer");
                    setStep("success");
                  }}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-soccer-cream py-3.5 rounded-xl text-xs font-display font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  <span>Abrir WhatsApp & Enviar Comprovante</span>
                  <ExternalLink className="w-4 h-4 text-soccer-cream" />
                </button>
                <button
                  id="confirm_already_sent_btn"
                  onClick={() => setStep("success")}
                  className="px-6 py-3.5 bg-soccer-field border border-soccer-field/60 hover:bg-soccer-field/90 text-soccer-gold rounded-xl text-xs font-mono font-medium hover:border-soccer-gold/40 transition-colors cursor-pointer"
                >
                  Já enviei / Concluir
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS CONFIRMATION AND THANK YOU */}
          {step === "success" && (
            <div className="max-w-xl mx-auto text-center space-y-6 py-6 animate-fade-in text-soccer-cream">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>

              <div>
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest block mb-1">
                  RESERVA CONFIRMADA
                </span>
                <h3 className="text-3xl font-display font-black text-soccer-cream">
                  Sua mesa está reservada!
                </h3>
                <p className="text-sm text-soccer-cream/80 mt-2 font-display font-bold">
                  Tudo pronto para o COPAÇO no Quinteiro!
                </p>
              </div>

              {createdReservation && (
                <div className="bg-[#03150b] border border-soccer-field p-5 rounded-2xl text-left space-y-3 font-mono text-xs text-soccer-cream shadow-sm">
                  <div className="flex justify-between border-b border-soccer-field/40 pb-2">
                    <span className="text-soccer-cream/50">Código da Reserva:</span>
                    <span className="text-soccer-gold font-bold">{createdReservation.id?.substring(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-soccer-cream/50">Jogo:</span>
                    <span className="text-soccer-cream font-semibold">{createdReservation.gameName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-soccer-cream/50">Mesa Reservada:</span>
                    <span className="text-soccer-gold font-bold text-right max-w-[220px] truncate">
                      {createdReservation.tableType === "mesa4" ? "Mesa para 4 Pessoas" : "Mesa para 2 Pessoas"} - {
                        (createdReservation as any).tableNumbers && (createdReservation as any).tableNumbers.length > 1
                          ? `Números: #${(createdReservation as any).tableNumbers.join(", #")}`
                          : `Número: #${createdReservation.tableNumber}`
                      }
                    </span>
                  </div>
                  {createdReservation.hasExtraSeat && (
                    <div className="flex justify-between text-yellow-400">
                      <span className="text-yellow-400/70">Ingresso Extra (Ímpar):</span>
                      <span className="font-bold">+1 cadeira / ingresso incluído</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-soccer-cream/50">Total de Pessoas:</span>
                    <span className="text-soccer-cream font-semibold">{createdReservation.paxCount} pessoas</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-soccer-cream/50">Convidado Principal:</span>
                    <span className="text-soccer-cream font-semibold">{createdReservation.clientName}</span>
                  </div>
                  {createdReservation.paymentMethod && (
                    <div className="flex justify-between border-t border-soccer-field/30 pt-2">
                      <span className="text-soccer-cream/50">Pagamento:</span>
                      <span className="text-soccer-gold font-bold uppercase text-[10px]">
                        {createdReservation.paymentMethod === "pagseguro" ? "Cartão (PagSeguro)" : "PIX"}
                      </span>
                    </div>
                  )}
                  {createdReservation.paymentId && (
                    <div className="flex justify-between">
                      <span className="text-soccer-cream/50">ID Transação:</span>
                      <span className="text-soccer-cream/80 font-mono text-[10px]">{createdReservation.paymentId}</span>
                    </div>
                  )}
                </div>
              )}

              {createdReservation && (createdReservation.isSharedGroup || isSharedGroup) && (
                <div className="bg-[#042010] border border-soccer-gold/40 p-5 rounded-2xl text-left space-y-3 font-sans text-xs text-soccer-cream shadow-md">
                  <div className="flex items-center gap-2 text-soccer-gold font-bold">
                    <span>👑 Link de Convites de Aniversário</span>
                  </div>
                  <p className="text-zinc-300 text-xs leading-normal">
                    Como você criou uma <strong>Mesa de Aniversário / Compartilhada</strong>, copie o link exclusivo abaixo e envie para os seus convidados no WhatsApp. Eles poderão confirmar presença e pagar a cadeira individual de R$ 6,00 diretamente!
                  </p>
                  
                  <div className="bg-black/40 border border-soccer-field/50 p-3 rounded-xl flex items-center justify-between gap-3 font-mono text-xs">
                    <span className="text-soccer-cream truncate select-all">{`${window.location.origin}/?aniversario=${createdReservation.id}`}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?aniversario=${createdReservation.id}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-soccer-field text-soccer-gold hover:bg-soccer-field/80 rounded transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Text specifics from request criteria */}
              <div className="bg-soccer-field/30 p-5 rounded-2xl border border-soccer-field text-xs text-left text-soccer-cream leading-relaxed space-y-3 shadow-sm">
                {game.isBrazilGame ? (
                  <>
                    <p className="font-bold text-soccer-gold text-xs">Informações finais e check-in:</p>
                    <p className="text-soccer-cream/90 text-xs leading-relaxed font-sans">
                      Sua reserva garante acesso à área do telão principal do COPAÇO, com DJ, promoções especiais de bebidas, sorteios e bolão durante o jogo!
                    </p>
                    <p className="text-soccer-cream/95 text-xs leading-relaxed font-bold text-soccer-orange font-sans">
                      As mesas são ocupadas por ordem de chegada no bar. Nos vemos no jogo!
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-soccer-gold text-xs">Regras da Reserva Gratuita:</p>
                    <p className="text-soccer-cream/90 text-[11px] leading-relaxed font-sans">
                      Lembramos que as reservas gratuitas são válidas até 1 hora antes do início da partida. Após esse prazo, a mesa poderá ser liberada automaticamente para novos clientes.
                    </p>
                    <p className="text-soccer-cream/95 text-xs font-bold text-soccer-orange leading-relaxed pt-1 font-sans">
                      As mesas são ocupadas por ordem de chegada. Nos vemos no jogo!
                    </p>
                  </>
                )}
              </div>

              {/* METHA ENERGIA HIGHLY CHANCEFUL PROMO BLOCK */}
              <div className="bg-gradient-to-br from-[#0c2f18] to-[#041a0d] border-2 border-soccer-gold/70 rounded-2xl p-5 text-left space-y-4 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-30 bg-soccer-gold/5 blur-3xl rounded-full" />
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h4 className="text-xs font-mono text-soccer-gold font-bold uppercase tracking-wider">PROMOÇÃO ESPECIAL PARCEIRO COPAÇO</h4>
                    <span className="text-sm font-display font-black text-white uppercase block leading-tight">Ganhe Desconto na Luz & Prêmios! 🇧🇷</span>
                  </div>
                </div>

                <p className="text-xs text-soccer-cream/95 font-sans leading-relaxed">
                  Levando sua conta de energia para a <strong className="text-soccer-gold">Metha Energia</strong> você garante <strong className="text-emerald-400">até 15% de desconto</strong> na sua conta de luz e ainda concorre a prêmios especiais durante os jogos do Brasil!
                </p>

                <div className="bg-[#03140a] p-3 rounded-xl border border-soccer-field/40 space-y-2 text-xs">
                  <span className="font-bold text-soccer-gold flex items-center gap-1">
                    🎁 Prêmios dos sorteios:
                  </span>
                  <ul className="space-y-1.5 text-soccer-cream/90 font-sans pl-2">
                    <li className="flex items-start gap-2">
                      <span className="text-[10px] text-soccer-gold mt-0.5">•</span>
                      <span>Camisas personalizadas da torcida</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[10px] text-soccer-gold mt-0.5">•</span>
                      <span>Até 6 meses de conta de energia <strong className="text-emerald-400">GRÁTIS</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[10px] text-soccer-gold mt-0.5">•</span>
                      <span>A sua conta <strong className="text-emerald-400">ZERADA</strong></span>
                    </li>
                  </ul>
                  <p className="text-[10px] text-soccer-cream/60 font-mono italic pt-1">
                    Os sorteios serão realizados ao vivo durante os jogos do Brasil no Copaço.
                  </p>
                </div>

                <div className="space-y-2 pt-1 text-center">
                  <a
                    href="https://methaenergia.com.br/indicacao/U7603NFG"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#ebd152] hover:bg-yellow-500 font-bold text-black py-3 rounded-xl text-xs uppercase text-center block transition-transform hover:scale-[1.01] shadow-lg shadow-soccer-gold/20 font-display animate-pulse"
                  >
                    👉 Faça seu cadastro aqui!
                  </a>
                  <span className="block font-mono text-[9px] text-soccer-cream/60">
                    methaenergia.com.br/indicacao/U7603NFG
                  </span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  id="final_success_dismiss_btn"
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="w-full bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark py-4 rounded-xl text-xs font-display font-bold shadow-md cursor-pointer"
                >
                  Entendido / Voltar à Home
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
