/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  dateTime: string; // ISO String
  description: string;
  attractions: string;
  imageUrl?: string;
  isBrazilGame: boolean;
  tablesTotal4: number; // default 30
  tablesTotal2: number; // default 3
  priceTable4: number;  // default 24
  priceTable2: number;  // default 12
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus = 
  | "aguardando comprovante" 
  | "confirmado" 
  | "cancelado" 
  | "liberada automaticamente" 
  | "ativa";

export interface Reservation {
  id: string;
  gameId: string;
  gameName: string; // e.g. "Brasil vs Sérvia"
  gameDateTime: string; // ISO string
  isBrazilGame: boolean;
  clientName: string;
  clientPhone: string;
  paxCount: number;
  tableType: "mesa4" | "mesa2";
  tableNumber: number; // 1-indexed up to respective tablesTotal
  status: ReservationStatus;
  paymentProofUrl?: string; // or text proof info
  createdAt: string;
  updatedAt: string;
}

export interface BlockedTable {
  id: string; // gameId_tableType_tableNumber
  gameId: string;
  tableType: "mesa4" | "mesa2";
  tableNumber: number;
  blockedBy: string;
  createdAt: string;
}

export type TableType = "mesa4" | "mesa2";

export interface DashboardMetrics {
  totalReservas: number;
  faturamentoPrevisto: number; // confirmed and awaiting payment
  faturamentoConfirmado: number; // confirmed only
  mesasReservadas: number;
  reservasGratuitasCount: number;
  reservasPagasCount: number;
}

export interface HomepageSettings {
  badgeText: string;
  heroTitlePart1: string;
  heroTitleHighlight: string;
  heroDescription: string;
  telaoBannerText: string;
  stationSectionTitle: string;
  stationSectionSubtitle: string;
  station1Title: string;
  station1Desc: string;
  station2Title: string;
  station2Desc: string;
  station3Title: string;
  station3Desc: string;
  station4Title: string;
  station4Desc: string;
}

