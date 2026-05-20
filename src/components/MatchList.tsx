/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Game, Reservation, BlockedTable } from "../types";
import { Calendar, Clock, Disc, Gift, Users, Edit2, CheckCircle2, ChevronRight, Sparkles, MapPin, Star } from "lucide-react";

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

    const isSoldOut = totalAvail === 0;

    return {
      avail4,
      avail2,
      totalAvail,
      isSoldOut,
      percentReserved: Math.round(
        ((reserved4 + reserved2 + blocked4 + blocked2) / 
        (game.tablesTotal4 + game.tablesTotal2)) * 100
      )
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
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#eab308] via-[#ec4899] to-[#f97316] rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-500 pointer-events-none" />
              )}

              <div
                className={`relative rounded-3xl overflow-hidden backdrop-blur-md transition-all duration-500 hover:-translate-y-1 h-full flex flex-col ${
                  isBrazil 
                    ? "bg-[#061e0f] border border-soccer-gold/40" 
                    : "bg-white/5 border border-white/10 hover:bg-white/10"
                }`}
              >
                {/* Badge Jogo do Brasil */}
                {isBrazil && (
                  <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-soccer-dark font-mono text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                    <Star className="w-3.5 h-3.5 fill-soccer-dark stroke-none" />
                    JOGO DO BRASIL {game.priceTable4 ? `(R$ ${game.priceTable4})` : ""}
                  </div>
                )}

                {/* Status Ribbon: ESGOTADO */}
                {stats.isSoldOut && (
                  <div className="absolute inset-0 z-20 bg-soccer-dark/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-soccer-neon text-soccer-cream text-sm font-display font-black uppercase tracking-widest px-6 py-2 rounded-xl shadow-lg border border-soccer-neon/40 rotate-[-4deg]">
                      ESGOTADO
                    </div>
                    <p className="text-soccer-cream/75 text-xs mt-3 font-mono">
                      Todos os lugares reservados com transmissão ao vivo garantida.
                    </p>
                    {isAdmin && onEditGame && (
                      <button
                        id={`edit_game_soldout_btn_${game.id}`}
                        onClick={() => onEditGame(game)}
                        className="mt-4 flex items-center gap-1 px-4 py-2 bg-soccer-field hover:bg-soccer-field/80 text-soccer-gold font-mono text-xs rounded-lg transition-transform"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Painel do Jogo
                      </button>
                    )}
                  </div>
                )}

              <div className="flex flex-col sm:flex-row h-full">
                
                {/* Visual Banner Left */}
                <div className="sm:w-2/5 relative h-48 sm:h-auto overflow-hidden bg-soccer-dark">
                  {game.imageUrl ? (
                    <img 
                      src={game.imageUrl} 
                      alt={`${game.homeTeam} vs ${game.awayTeam}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    /* Elegant Custom Themed Soccer Abstract Placeholder */
                    <div className="w-full h-full bg-gradient-to-br from-soccer-field via-soccer-dark to-[#03150b] flex flex-col items-center justify-center p-4 relative">
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#eab308_1px,transparent_1px)] [background-size:16px_16px]" />
                      
                      <div className="flex items-center gap-2 mb-3 z-10 w-full justify-around">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-soccer-cream/10 border border-soccer-cream/20 rounded-full flex items-center justify-center font-display font-black text-soccer-gold text-lg shadow-md uppercase">
                            {game.homeTeam.substring(0, 2)}
                          </div>
                        </div>
                        <div className="text-soccer-cream/40 font-mono text-[10px] uppercase font-bold">X</div>
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-soccer-cream/10 border border-soccer-cream/20 rounded-full flex items-center justify-center font-display font-black text-soccer-gold text-lg shadow-md uppercase">
                            {game.awayTeam.substring(0, 2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-center z-10">
                        <span className="text-[10px] font-mono text-soccer-gold tracking-widest uppercase block mb-1">
                          COPA DO MUNDO
                        </span>
                        <span className="text-xs text-soccer-cream/90 font-semibold font-display truncate max-w-[150px] block">
                          Quinteiro Arena
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Decorative Field Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-transparent to-soccer-dark/90" />
                </div>

                {/* Game Match Details Content */}
                <div className="flex-1 p-6 flex flex-col justify-between">
                  <div>
                    {/* Date Details */}
                    <div className="flex items-center gap-4 text-xs font-mono text-soccer-gold/90 mb-2.5">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="uppercase text-[11px] font-bold tracking-tight">
                          {formatMatchDate(game.dateTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-soccer-orange" />
                        <span className="font-semibold">{formatMatchTime(game.dateTime)}</span>
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
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-500/10 shrink-0" />
                        <span>A reserva garante entrada no telão principal</span>
                      </div>
                    </div>
                  </div>

                  {/* Booking Trigger Footer Information */}
                  <div>
                    {/* Capacity Indicator Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center text-[10px] font-mono text-soccer-cream/60 mb-1">
                        <span>Lotação de Mesas:</span>
                        <span className="font-semibold text-soccer-gold">{stats.percentReserved}% reservada</span>
                      </div>
                      <div className="w-full bg-[#051c0f] h-1.5 rounded-full overflow-hidden border border-soccer-field">
                        <div 
                          className="bg-gradient-to-r from-soccer-field via-soccer-gold to-soccer-orange h-full rounded-full transition-all duration-500" 
                          style={{ width: `${stats.percentReserved}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-mono text-soccer-gold/90 mt-1.5 italic">
                        Restam {stats.totalAvail} mesas de {game.tablesTotal4 + game.tablesTotal2} totais
                      </p>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        id={`reserve_btn_${game.id}`}
                        onClick={() => onSelectGame(game)}
                        className="flex-1 bg-gradient-to-r from-soccer-field to-emerald-800 hover:from-emerald-700 hover:to-green-950 text-soccer-cream border border-emerald-500/30 hover:border-soccer-gold/30 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-[0.98]"
                      >
                        <span>Reservar Mesa</span>
                        <ChevronRight className="w-3.5 h-3.5 text-soccer-gold" />
                      </button>

                      {isAdmin && onEditGame && (
                        <button
                          id={`edit_game_btn_${game.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditGame(game);
                          }}
                          className="p-2.5 bg-soccer-field/40 hover:bg-soccer-field hover:text-soccer-gold text-soccer-cream/80 border border-soccer-field rounded-xl transition-all"
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
