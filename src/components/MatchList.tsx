/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Game, Reservation, BlockedTable } from "../types";
import { Calendar, Clock, Disc, Gift, Users, Edit2, CheckCircle2, ChevronRight, Sparkles, MapPin, Star, Lock } from "lucide-react";

interface MatchListProps {
  games: Game[];
  reservations: Reservation[];
  blockedTables: BlockedTable[];
  onSelectGame: (game: Game) => void;
  isAdmin: boolean;
  onEditGame?: (game: Game) => void;
}

export default function MatchList({ 
  games, 
  reservations, 
  blockedTables, 
  onSelectGame, 
  isAdmin, 
  onEditGame 
}: MatchListProps) {

  // Function to compute table statistics for a specific game ID
  const getGameStats = (game: Game) => {
    const activeReservations = reservations.filter(
      r => r.gameId === game.id && r.status !== "cancelado" && r.status !== "liberada automaticamente"
    );
    
    const gameBlocks = blockedTables.filter(b => b.gameId === game.id);

    // Reserved counts
    const reserved4 = activeReservations.filter(r => r.tableType === "mesa4").length;
    const reserved2 = activeReservations.filter(r => r.tableType === "mesa2").length;

    // Blocked counts
    const blocked4 = gameBlocks.filter(b => b.tableType === "mesa4").length;
    const blocked2 = gameBlocks.filter(b => b.tableType === "mesa2").length;

    // Available counts
    const avail4 = Math.max(0, game.tablesTotal4 - reserved4 - blocked4);
    const avail2 = Math.max(0, game.tablesTotal2 - reserved2 - blocked2);
    const totalAvail = avail4 + avail2;

    // Sum of chairs for active reservations
    const totalChairsReserved = activeReservations.reduce((acc, r) => acc + (r.paxCount || 0), 0);

    // Day blocks automatically if available tables <= 0 OR total chairs >= 124
    const isSoldOut = totalAvail === 0 || totalChairsReserved >= 124;

    // Calculate percentage based on tables or chairs, whichever is higher, but capped at 100%
    const percentByTables = ((reserved4 + reserved2 + blocked4 + blocked2) / (game.tablesTotal4 + game.tablesTotal2)) * 100;
    const percentByChairs = (totalChairsReserved / 124) * 100;
    const percentReserved = Math.min(100, Math.round(Math.max(percentByTables, percentByChairs)));

    return {
      avail4,
      avail2,
      totalAvail,
      totalChairsReserved,
      isSoldOut,
      percentReserved
    };
  };

  const formatMatchDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      weekday: "long"
    }).replace(".", "");
  };

  const formatMatchTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    }) + "h";
  };

  if (games.length === 0) {
    return (
      <div className="text-center py-20 px-4 bg-soccer-field/20 border border-soccer-field/50 rounded-2xl">
        <Sparkles className="w-12 h-12 text-soccer-gold mx-auto mb-4 animate-bounce" />
        <p className="text-soccer-cream text-lg font-display font-medium">Nenhum jogo cadastrado para a Copa do Mundo.</p>
        <p className="text-soccer-cream/50 text-xs mt-1">Avisaremos assim que novos ingressos e transmissões forem liberados.</p>
      </div>
    );
  }

  // Sort games chronologically
  const sortedGames = [...games].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-extrabold tracking-tight text-soccer-cream">
            Agenda de Jogos & Ingressos
          </h2>
          <p className="text-sm text-soccer-cream/60">
            Garanta sua frente para o telão oficial do Quinteiro. Atualizados em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-soccer-field/30 px-4 py-2 rounded-xl text-xs font-mono text-soccer-gold border border-soccer-gold/10">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-soccer-neon animate-pulse" />
            <span>Jogos do Brasil: Reservas Pagas (Pix)</span>
          </div>
          <span className="text-soccer-cream/30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-soccer-gold" />
            <span>Demais Países: Gratuitos</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {sortedGames.map((game) => {
          const stats = getGameStats(game);
          const isBrazil = game.isBrazilGame;

          return (
            <div
              key={game.id}
              id={`game_card_${game.id}`}
              className="relative group h-full"
            >
              {/* Immersive glow background for featured matches */}
              {isBrazil && (
                <div className="absolute -inset-0.5 bg-gradient-to-r from-soccer-gold via-emerald-400 to-[#ea580c] rounded-3xl blur opacity-[0.14] group-hover:opacity-[0.25] transition duration-500 pointer-events-none" />
              )}

              <div
                className={`relative rounded-3xl overflow-hidden backdrop-blur-md transition-all duration-500 hover:-translate-y-1 h-full flex flex-col ${
                  isBrazil 
                    ? "bg-[#052912]/80 border-2 border-soccer-gold/80" 
                    : "bg-black/40 border border-white/5 hover:border-soccer-gold/30"
                }`}
              >
                {/* Badge Jogo do Brasil */}
                {isBrazil && (
                  <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-yellow-400 via-[#ca8a04] to-[#ea580c] text-white font-mono text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                    <Star className="w-3.5 h-3.5 fill-white stroke-none" />
                    JOGO DO BRASIL ({game.priceTable4 ? `4x R$ ${Math.round(game.priceTable4 / 4)}/pessoa` : "4x R$ 6/pessoa"})
                  </div>
                )}

                {/* Status Ribbon: ESGOTADO */}
                {stats.isSoldOut && (
                  <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-soccer-neon text-white text-sm font-display font-black uppercase tracking-widest px-6 py-2 rounded-xl shadow-lg border border-soccer-neon/40 rotate-[-4deg]">
                      ESGOTADO
                    </div>
                    <p className="text-soccer-cream/85 text-xs mt-3 font-mono">
                      Todos os lugares reservados com transmissão ao vivo garantida.
                    </p>
                    {isAdmin && onEditGame && (
                      <button
                        id={`edit_game_soldout_btn_${game.id}`}
                        onClick={() => onEditGame(game)}
                        className="mt-4 flex items-center gap-1 px-4 py-2 bg-soccer-field/30 hover:bg-soccer-field/50 text-soccer-gold font-mono text-xs rounded-lg transition-transform"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Painel do Jogo
                      </button>
                    )}
                  </div>
                )}

                {/* Status Ribbon: RESERVAS ANTECIPADAS ESGOTADAS */}
                {game.disableReservations && !stats.isSoldOut && (
                  <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-red-600/90 text-white text-sm font-display font-black uppercase tracking-widest px-6 py-2 rounded-xl shadow-lg border border-red-500/40 rotate-[-4deg] flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-white" />
                      RESERVAS ANTECIPADAS ESGOTADAS
                    </div>
                    <div className="text-white font-display font-black text-sm tracking-wide mt-3 uppercase">
                      {game.homeTeam} x {game.awayTeam}
                    </div>
                    <p className="text-soccer-cream/85 text-[11px] mt-2 max-w-xs font-mono leading-relaxed">
                      As reservas antecipadas de mesa para esta partida do dia estão esgotadas.
                    </p>
                    <div className="mt-3 bg-amber-500/10 border border-soccer-gold/30 p-3 rounded-xl max-w-xs text-left space-y-2">
                      <div>
                        <span className="block text-soccer-gold text-[11px] font-bold mb-0.5">🎟️ PORTARIA (ÁREA DO TELÃO):</span>
                        <p className="text-soccer-cream/90 text-[10px] leading-snug">
                          Ingresso individual na portaria por <strong className="text-soccer-gold">R$ 10,00</strong>, sujeito à lotação.
                        </p>
                      </div>
                      <div className="border-t border-soccer-gold/10 pt-1.5">
                        <span className="block text-soccer-neon text-[11px] font-bold mb-0.5">📺 ÁREAS EXTERNAS (GRATUITO):</span>
                        <p className="text-soccer-cream/90 text-[10px] leading-snug">
                          Existem áreas fora do telão principal com TVs que irão transmitir os jogos com <strong className="text-soccer-neon">entrada gratuita</strong>!
                        </p>
                      </div>
                    </div>
                    {isAdmin && onEditGame && (
                      <button
                        id={`edit_game_blocked_btn_${game.id}`}
                        onClick={() => onEditGame(game)}
                        className="mt-4 flex items-center gap-1 px-4 py-2 bg-[#dc2626]/30 hover:bg-[#dc2626]/50 text-red-200 font-mono text-xs rounded-lg transition-transform"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Painel do Jogo
                      </button>
                    )}
                  </div>
                )}

              <div className="flex flex-col sm:flex-row h-full">
                
                {/* Visual Banner Left */}
                <div className="sm:w-2/5 relative h-48 sm:h-auto overflow-hidden bg-soccer-field/15">
                  {game.imageUrl ? (
                    <img 
                      src={game.imageUrl} 
                      alt={`${game.homeTeam} vs ${game.awayTeam}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    /* Elegant Custom Themed Soccer Abstract Placeholder */
                    <div className="w-full h-full bg-gradient-to-br from-[#021f0a] via-[#041004] to-[#01240c] flex flex-col items-center justify-center p-4 relative">
                      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(#eab308_1px,transparent_1px)] [background-size:16px_16px]" />
                      
                      <div className="flex items-center gap-2 mb-3 z-10 w-full justify-around">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center font-display font-black text-soccer-gold text-lg shadow-md uppercase">
                            {(game.homeTeam || "").substring(0, 2)}
                          </div>
                        </div>
                        <div className="text-soccer-cream/40 font-mono text-[10px] uppercase font-bold">X</div>
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-black/60 border border-white/10 rounded-full flex items-center justify-center font-display font-black text-soccer-gold text-lg shadow-md uppercase">
                            {(game.awayTeam || "").substring(0, 2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-center z-10">
                        <span className="text-[10px] font-mono text-soccer-gold tracking-widest uppercase block mb-1">
                          COPA DO MUNDO
                        </span>
                        <span className="text-xs text-white font-semibold font-display truncate max-w-[150px] block">
                          Quinteiro Arena
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Decorative Field Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-transparent to-black/5" />
                </div>

                {/* Game Match Details Content */}
                <div className="flex-1 p-6 flex flex-col justify-between">
                  <div>
                    {/* Date Details */}
                    <div className="flex items-center gap-4 text-xs font-mono text-soccer-gold/90 mb-2.5">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-soccer-gold" />
                        <span className="uppercase text-[11px] font-bold tracking-tight text-soccer-cream/90">
                          {formatMatchDate(game.dateTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-soccer-orange" />
                        <span className="font-bold text-soccer-cream">{formatMatchTime(game.dateTime)}</span>
                      </div>
                    </div>

                    {/* Team Matchup Title */}
                    <h3 className="text-2xl font-display font-extrabold tracking-tight text-soccer-cream leading-tight mb-2 group-hover:text-soccer-gold transition-colors">
                      {game.homeTeam} <span className="text-soccer-gold font-sans font-light">vs</span> {game.awayTeam}
                    </h3>

                    {/* Game short description */}
                    <p className="text-xs text-soccer-cream/70 line-clamp-2 leading-relaxed mb-4">
                      {game.description || "A maior emoção da Copa do Mundo com áudio original do estádio, gastronomia e cerveja estupidamente gelada."}
                    </p>

                    {/* Performance/Show details */}
                    <div className="space-y-2 mb-5">
                      {game.attractions && (
                        <div className="flex items-start gap-1.5 text-xs text-soccer-cream">
                          <Disc className="w-3.5 h-3.5 text-soccer-orange shrink-0 mt-0.5" />
                          <span className="font-sans leading-tight">
                            Atração: <strong className="text-soccer-gold">{game.attractions}</strong>
                          </span>
                        </div>
                      )}
                      
                      {/* Booking guarantees */}
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>A reserva garante entrada no telão principal</span>
                      </div>
                    </div>
                  </div>

                  {/* Booking Trigger Footer Information */}
                  <div>
                    {/* Capacity Indicator Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center text-[10px] font-mono text-soccer-cream/40 mb-1">
                        <span>Lotação de Mesas:</span>
                        <span className="font-semibold text-soccer-gold">{stats.percentReserved}% reservada</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className="bg-gradient-to-r from-soccer-gold to-[#ca8a04] h-full rounded-full transition-all duration-500" 
                          style={{ width: `${stats.percentReserved}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono mt-1.5 font-bold">
                        <span className="text-soccer-gold">Restam {stats.totalAvail} mesas de {game.tablesTotal4 + game.tablesTotal2} totais</span>
                        <span className="text-soccer-cream/80">({stats.totalChairsReserved}/124 Cadeiras Reservadas)</span>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="flex items-center gap-2">
                      {game.disableReservations ? (
                        <button
                          disabled
                          className="flex-1 bg-zinc-800 text-zinc-500 border border-zinc-700/50 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
                        >
                          <Lock className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Reservas Antecipadas Esgotadas</span>
                        </button>
                      ) : (
                        <button
                          id={`reserve_btn_${game.id}`}
                          onClick={() => onSelectGame(game)}
                          className="flex-1 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-lg active:scale-[0.98] cursor-pointer"
                        >
                          <span>Reservar Mesa</span>
                          <ChevronRight className="w-3.5 h-3.5 text-soccer-dark" />
                        </button>
                      )}

                      {isAdmin && onEditGame && (
                        <button
                          id={`edit_game_btn_${game.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditGame(game);
                          }}
                          className="p-2.5 bg-black/40 hover:bg-white/5 text-soccer-cream border border-white/5 rounded-xl transition-all cursor-pointer"
                          title="Configuração do Jogo"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                </div>

              </div>
              
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
