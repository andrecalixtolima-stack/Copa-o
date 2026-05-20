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
  logoUrl?: string;
}

export function getDirectImageUrl(url: string | undefined): string {
  if (!url) return "";
  const cleanUrl = url.trim();
  
  // Convert standard Imgur patterns to direct image addresses
  if (cleanUrl.includes("imgur.com")) {
    if (cleanUrl.includes("i.imgur.com")) {
      return cleanUrl;
    }
    // Match album format: imgur.com/a/{id}
    const albumRegex = /imgur\.com\/a\/([a-zA-Z0-9]+)/;
    const albumMatch = cleanUrl.match(albumRegex);
    if (albumMatch && albumMatch[1]) {
      return `https://i.imgur.com/${albumMatch[1]}.png`;
    }
    // Match gallery format: imgur.com/gallery/{id}
    const galleryRegex = /imgur\.com\/gallery\/([a-zA-Z0-9]+)/;
    const galleryMatch = cleanUrl.match(galleryRegex);
    if (galleryMatch && galleryMatch[1]) {
      return `https://i.imgur.com/${galleryMatch[1]}.png`;
    }
    // Match basic layout format: imgur.com/{id}
    const basicRegex = /imgur\.com\/([a-zA-Z0-9]+)/;
    const basicMatch = cleanUrl.match(basicRegex);
    if (basicMatch && basicMatch[1]) {
      // Avoid matching sub-pages like imgur.com/signin, imgur.com/upload
      const reserved = ["signin", "upload", "register", "about", "help"];
      if (!reserved.includes(basicMatch[1].toLowerCase())) {
        return `https://i.imgur.com/${basicMatch[1]}.png`;
      }
    }
  }
  return cleanUrl;
}

