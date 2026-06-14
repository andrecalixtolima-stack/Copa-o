import React, { useState, useEffect } from "react";
import { X, Check, Clipboard, ExternalLink, Calendar, Users, Phone, User, AlertCircle } from "lucide-react";
import { Game, Reservation } from "../types";

interface SharedGroupModalProps {
  groupId: string;
  onClose: () => void;
}

export default function SharedGroupModal({ groupId, onClose }: SharedGroupModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parentRes, setParentRes] = useState<Reservation | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [contributions, setContributions] = useState<Reservation[]>([]);

  // Guest form inputs
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestPax, setGuestPax] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Reservation | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchInfo();
  }, [groupId]);

  const fetchInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared-group/info?id=${groupId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar os dados do grupo de aniversário.");
      }
      setParentRes(data.parent);
      setGame(data.game);
      setContributions(data.contributions || []);
    } catch (err: any) {
      setError(err.message || "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText("48558675000187");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestPhone.trim() || guestPax <= 0) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          clientName: guestName.trim(),
          clientPhone: guestPhone.trim(),
          paxCount: guestPax
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao registrar presença de convidado.");
      }
      setSubmitSuccess(data.reservation);
      // Refresh contributions list
      fetchInfo();
    } catch (err: any) {
      alert(err.message || "Falha ao registrar reserva de convidado.");
    } finally {
      setSubmitting(false);
    }
  };

  const getWhatsappUrl = (contrib: Reservation) => {
    const whatsappNumber = "+5531975099398";
    const hostName = parentRes?.clientName || "Aniversariante";
    const gName = game ? `${game.homeTeam} vs ${game.awayTeam}` : "Copaço";
    const amount = contrib.paxCount * 6; // Per person rate is 6 BRL

    const textMsg = `Olá! Sou convidado(a) da mesa de aniversário de *${hostName}* para o jogo *${gName}* no Quinteiro e acabei de fazer minha transferência PIX individual de R$ ${amount},00.\n\n*Resumo da Presença*:\nAniversariante: ${hostName}\nConvidado: ${contrib.clientName.replace(` (Convidado de ${hostName})`, "")}\nQuantidade de pessoas: ${contrib.paxCount} pessoas\nValor pago: R$ ${amount},00\n\nAguardando confirmação!`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(textMsg)}`;
  };

  // Convert ISO Date or timestamp safely
  const formatGameDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
    } catch {
      return dateStr;
    }
  };

  // Total confirmed seats in this collective table
  const totalSeatsReservados = (parentRes?.paxCount || 0) + contributions.reduce((sum, c) => sum + (c.paxCount || 0), 0);
  const tablesLabel = parentRes?.tableNumbers && parentRes.tableNumbers.length > 0
    ? `Mesa(s): #${parentRes.tableNumbers.join(", #")}`
    : `Mesa: #${parentRes?.tableNumber}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-soccer-dark/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-[#051c0e] to-[#010904] border border-soccer-gold/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-500 via-soccer-gold to-soccer-orange" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-soccer-cream/50 hover:text-soccer-cream hover:bg-soccer-field/80 p-2 rounded-full transition-all z-10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-20 text-center text-soccer-cream space-y-4">
            <div className="w-12 h-12 border-4 border-soccer-gold border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono text-soccer-gold/80 uppercase tracking-widest">Carregando convite especial...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-soccer-cream space-y-4">
            <AlertCircle className="w-12 h-12 text-soccer-orange mx-auto" />
            <p className="font-display font-bold text-lg">{error}</p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-soccer-field hover:bg-soccer-field/80 text-soccer-gold font-mono text-xs rounded-xl"
            >
              Fechar Janela
            </button>
          </div>
        ) : (
          <div className="p-6 md:p-8 space-y-6">
            
            {/* Success screen inside same modal */}
            {submitSuccess ? (
              <div className="text-center space-y-6 py-4 animate-fade-in text-soccer-cream">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest block mb-1">
                    PRESENÇA REGISTRADA
                  </span>
                  <h3 className="text-2xl font-display font-black text-soccer-cream">
                    Seja Bem-vindo(a) à Mesa!
                  </h3>
                  <p className="text-xs text-soccer-cream/80 mt-2">
                    Para garantir sua vaga, efetue o pagamento do seu PIX individual e envie o comprovante.
                  </p>
                </div>

                <div className="bg-[#03150b] border border-soccer-field/50 p-5 rounded-2xl text-left space-y-4 font-mono text-xs">
                  <div className="bg-soccer-dark/60 p-4 rounded-xl border border-soccer-field/50 space-y-1">
                    <span className="block text-[10px] font-mono text-soccer-gold uppercase font-bold">Instruções de Pagamento</span>
                    <p className="text-xs text-soccer-cream/85 leading-normal">
                      Valor a pagar: <strong className="text-soccer-gold text-sm font-extrabold font-mono">R$ {submitSuccess.paxCount * 6},00</strong> (para {submitSuccess.paxCount} {submitSuccess.paxCount === 1 ? "pessoa" : "pessoas"})
                    </p>
                    <div className="flex items-center justify-between mt-3 bg-black/40 p-2.5 rounded-lg border border-soccer-field/30">
                      <span className="text-xs text-soccer-cream font-semibold">48558675000187</span>
                      <button
                        onClick={handleCopyPix}
                        className="px-2.5 py-1.5 bg-soccer-field hover:bg-soccer-field/80 text-soccer-gold font-mono text-[9px] uppercase rounded transition-all flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                        <span>{copied ? "Copiado!" : "Copiar Chave"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#03150b] p-4 rounded-xl border border-soccer-field/50 space-y-2 text-[11px] leading-relaxed text-soccer-cream/90">
                    <p className="font-bold text-soccer-gold font-sans">Como confirmar no WhatsApp:</p>
                    <ol className="list-decimal list-inside space-y-1 text-zinc-300">
                      <li>Copie e pague a chave PIX (CNPJ acima) no seu banco.</li>
                      <li>Clique no botão abaixo para abrir o WhatsApp de atendimento do Quinteiro.</li>
                      <li>Envie a foto do seu comprovante de transferência diretamente pelo chat do WhatsApp.</li>
                    </ol>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 bg-[#03150b] border border-soccer-field/60 hover:bg-soccer-field/95 text-soccer-gold rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer"
                  >
                    Já paguei / Concluir
                  </button>
                  <a
                    href={getWhatsappUrl(submitSuccess)}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-soccer-cream py-3.5 rounded-xl text-xs font-display font-medium flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <span>Enviar Comprovante</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* Header Convite */}
                <div className="text-center space-y-2">
                  <div className="bg-soccer-gold/20 text-soccer-gold text-[10px] tracking-widest font-mono font-bold uppercase inline-block px-3 py-1.5 rounded-full border border-soccer-gold/30">
                    🎂 Convite de Mesa Compartilhada
                  </div>
                  <h3 className="text-2xl font-display font-black text-soccer-cream leading-tight">
                    Aniversário do(a) {parentRes?.clientName}
                  </h3>
                  <p className="text-xs text-soccer-cream/70 max-w-md mx-auto">
                    Você foi convidado(a) para se juntar à mesa em comemoração especial no Copaço do Quinteiro!
                  </p>
                </div>

                {/* Match Information */}
                <div className="bg-[#03150b] border border-soccer-field p-5 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-soccer-cream">
                  <div className="space-y-1.5">
                    <span className="block text-[9px] uppercase font-mono text-soccer-gold tracking-wider">Jogo Selecionado</span>
                    <span className="block text-sm font-display font-extrabold text-white">{game ? `${game.homeTeam} vs ${game.awayTeam}` : parentRes?.gameName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-soccer-cream/70 mt-1">
                      <Calendar className="w-3.5 h-3.5 text-soccer-gold" />
                      {parentRes && formatGameDate(parentRes.gameDateTime)}
                    </span>
                  </div>
                  <div className="space-y-1.5 sm:border-l sm:border-soccer-field/50 sm:pl-4">
                    <span className="block text-[9px] uppercase font-mono text-soccer-gold tracking-wider">Detalhes da Mesa</span>
                    <span className="block text-sm font-semibold text-white">{tablesLabel}</span>
                    <span className="flex items-center gap-1.5 text-xs text-soccer-cream/75">
                      <Users className="w-3.5 h-3.5 text-soccer-gold" />
                      Mesa de {parentRes?.tableType === "mesa4" ? "4 lugares (R$ 6/pessoa)" : "2 lugares (R$ 6/pessoa)"}
                    </span>
                  </div>
                </div>

                {/* Contributions list - Real Somatória! */}
                <div className="bg-soccer-dark/30 border border-soccer-field/50 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center border-b border-soccer-field/40 pb-2">
                    <h4 className="text-xs font-mono font-bold text-soccer-gold uppercase">
                      Confirmados na Mesa ({totalSeatsReservados} lugares ocupados)
                    </h4>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-soccer-field/15">
                      <span className="text-soccer-cream/90 font-medium">✨ {parentRes?.clientName} (Anfitrião)</span>
                      <span className="font-mono text-soccer-gold font-bold">{parentRes?.paxCount || 0} {parentRes?.paxCount === 1 ? "lugar" : "lugares"}</span>
                    </div>
                    {contributions.length === 0 ? (
                      <div className="text-center py-2 text-[11px] text-soccer-cream/40 italic">
                        Nenhum convidado confirmou presença ainda. Seja o primeiro!
                      </div>
                    ) : (
                      contributions.map((c, idx) => (
                        <div key={`contrib_${idx}`} className="flex justify-between items-center py-1 border-b border-soccer-field/15">
                          <span className="text-soccer-cream/80">{c.clientName.replace(` (Convidado de ${parentRes?.clientName})`, "")}</span>
                          <span className="font-mono font-bold text-soccer-cream/90">{c.paxCount} {c.paxCount === 1 ? "lugar" : "lugares"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Contribution form */}
                <form onSubmit={handleSubmitContribution} className="space-y-4">
                  <h4 className="text-xs font-mono font-bold text-soccer-gold uppercase border-b border-soccer-field/30 pb-1.5">
                    Garanta seu lugar na Mesa
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-2">
                    <div>
                      <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Seu Nome Completo</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-soccer-cream/35" />
                        <input
                          type="text"
                          required
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder="Digite seu nome"
                          className="w-full bg-[#041a0d] border border-soccer-field/40 focus:border-soccer-gold text-soccer-cream rounded-xl py-2 pl-9 pr-3 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-soccer-cream/70 uppercase mb-1">Seu celular / whatsapp</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-soccer-cream/35" />
                        <input
                          type="tel"
                          required
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="(31) 99999-9999"
                          className="w-full bg-[#041a0d] border border-soccer-field/40 focus:border-soccer-gold text-soccer-cream rounded-xl py-2 pl-9 pr-3 text-xs outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#042010] p-4 rounded-xl border border-soccer-field/30">
                    <div className="space-y-0.5">
                      <span className="block text-xs font-bold text-white">Quantas cadeiras quer pagar?</span>
                      <span className="block text-[10px] text-soccer-cream/70">Cada cadeira/ingresso individual custa R$ 6,00.</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setGuestPax(Math.max(1, guestPax - 1))}
                        className="w-8 h-8 rounded-full border border-soccer-field bg-[#03150b] text-soccer-gold hover:bg-soccer-field/60 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-sm font-bold text-white w-5 text-center">{guestPax}</span>
                      <button
                        type="button"
                        onClick={() => setGuestPax(guestPax + 1)}
                        className="w-8 h-8 rounded-full border border-soccer-field bg-[#03150b] text-soccer-gold hover:bg-soccer-field/60 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-soccer-field/30 pt-4 flex-row gap-4">
                    <div className="text-left font-mono">
                      <span className="block text-[9px] uppercase text-soccer-gold">Total para Pagar</span>
                      <span className="text-xl font-display font-black text-white">R$ {guestPax * 6},00</span>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-8 py-3 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-gold text-[#03150b] font-display font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all transform hover:scale-105 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? "Processando..." : "Confirmar Presença"}
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
