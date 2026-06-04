/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, onSnapshot, addDoc, doc } from "firebase/firestore";
import { Game, Reservation, BlockedTable, HomepageSettings, getDirectImageUrl } from "./types";
import Header from "./components/Header";
import MatchList from "./components/MatchList";
import ReservationModal from "./components/ReservationModal";
import SharedGroupModal from "./components/SharedGroupModal";
import AdminPanel from "./components/AdminPanel";
import LogoImage from "./components/LogoImage";
import { 
  Tv, Music, Beer, Trophy, Gift, Users2, Sparkles, HelpCircle, Star, Sparkle, RefreshCw, Eye, X, ExternalLink, MessageCircle
} from "lucide-react";

export default function App() {
  
  // Real-time state pools
  const [games, setGames] = useState<Game[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [blockedTables, setBlockedTables] = useState<BlockedTable[]>([]);
  const [homepageTexts, setHomepageTexts] = useState<HomepageSettings>({
    badgeText: "EXCLUSIVIDADE DE COPA • Vagas Limitadas",
    heroTitlePart1: "VIVA A ENERGIA DA",
    heroTitleHighlight: "NOSSA TORCIDA",
    heroDescription: "Reserve sua mesa e viva a energia da torcida no telão principal do Quinteiro. Um espaço com segurança, conforto, boa comida, bebida gelada e aquela atmosfera que transforma cada jogo em celebração.",
    telaoBannerText: "Toda reserva garante acesso à área de transmissão por telão",
    stationSectionTitle: "O QUE ACONTECE NO COPAÇO",
    stationSectionSubtitle: "A energia eletrizante dos gramados com a infraestrutura e o conforto do Quinteiro.",
    station1Title: "Transmissão por Telão",
    station1Desc: "Acompanhe todos os lances de forma clara com transmissão por telão para você não perder nada da Copa.",
    station2Title: "DJ ao Vivo",
    station2Desc: "Músicas e sets eletrizantes nos intervalos e pós-jogo para sacudir as comemorações da torcida.",
    station3Title: "Promoções Especiais",
    station3Desc: "Rodadas duplas especiais nos gols do Brasil, combos exclusivos e chopp com preços especiais para brindar com os amigos.",
    station4Title: "Bolão Premium",
    station4Desc: "Participe do nosso bolão interativo com direito a rodadas duplas exclusivas e brindes exclusivos a cada rodada."
  });
  
  const [loading, setLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [activeSharedGroupId, setActiveSharedGroupId] = useState<string | null>(null);
  const [gameToEdit, setGameToEdit] = useState<Game | null>(null);
  
  const [showMethaBanner, setShowMethaBanner] = useState(true);

  const handleDismissMethaBanner = () => {
    setShowMethaBanner(false);
  };

  const [seeding, setSeeding] = useState(false);
  const [connectionError, setConnectionError] = useState<{ message: string; code?: string; path?: string } | null>(null);

  // Subscribe to real-time collections (games, blockedTables, texts)
  useEffect(() => {
    setLoading(true);

    const unsubGames = onSnapshot(
      collection(db, "games"),
      (snap) => {
        const list: Game[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Game);
        });
        setGames(list);
        setConnectionError(null);
        setLoading(false);
      },
      (err) => {
        console.error("onSnapshot error in collection 'games':", err);
        setConnectionError({ message: err.message, code: (err as any).code, path: "games" });
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.GET, "games");
        } catch (e) {
          console.warn("Muted error throw inside games onSnapshot callback to maintain React rendering context.");
        }
      }
    );

    const unsubBlocks = onSnapshot(
      collection(db, "blockedTables"),
      (snap) => {
        const list: BlockedTable[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as BlockedTable);
        });
        setBlockedTables(list);
        setConnectionError(null);
      },
      (err) => {
        console.error("onSnapshot error in collection 'blockedTables':", err);
        setConnectionError({ message: err.message, code: (err as any).code, path: "blockedTables" });
        try {
          handleFirestoreError(err, OperationType.GET, "blockedTables");
        } catch (e) {
          console.warn("Muted error throw inside blockedTables onSnapshot callback to maintain React rendering context.");
        }
      }
    );

    const unsubTexts = onSnapshot(
      doc(db, "settings", "homepage"),
      (snap) => {
        if (snap.exists()) {
          const loadedData = snap.data();
          setHomepageTexts((prev) => {
            const merged = { ...prev };
            Object.keys(loadedData).forEach((key) => {
              const val = loadedData[key];
              if (val !== undefined && val !== null && val !== "") {
                (merged as any)[key] = val;
              }
            });
            return merged;
          });
        }
        setConnectionError(null);
      },
      (err) => {
        console.warn("Error loading homepage settings:", err);
      }
    );

    return () => {
      unsubGames();
      unsubBlocks();
      unsubTexts();
    };
  }, []);

  // Check for shared group / birthday link in URL on application load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gr = params.get("aniversario") || params.get("grupo") || params.get("group");
    if (gr) {
      setActiveSharedGroupId(gr);
    }
  }, []);

  // Secure PII Isolation: Dynamic loader for reservation feed based on role / Admin mode Active
  useEffect(() => {
    let unsubReservations = () => {};

    if (isFirebaseAdmin && isAdminMode) {
      console.log("[SECURITY ENGINE] Elevated user: streaming full reservations (including client PII)...");
      unsubReservations = onSnapshot(
        collection(db, "reservations"),
        (snap) => {
          const list: Reservation[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Reservation);
          });
          setReservations(list);
          setConnectionError(null);
        },
        (err) => {
          console.error("onSnapshot error in collection 'reservations':", err);
          setConnectionError({ message: err.message, code: (err as any).code, path: "reservations" });
          try {
            handleFirestoreError(err, OperationType.GET, "reservations");
          } catch (e) {
            console.warn("Muted error throw inside reservations onSnapshot callback to maintain React rendering context.");
          }
        }
      );
    } else {
      console.log("[SECURITY ENGINE] Guest session: streaming zero-PII table availability maps...");
      unsubReservations = onSnapshot(
        collection(db, "availability"),
        (snap) => {
          const list: any[] = [];
          snap.forEach((doc) => {
            const data = doc.data();
            list.push({
              id: doc.id,
              gameId: data.gameId,
              tableType: data.tableType,
              tableNumber: data.tableNumber,
              status: data.status,
              // Block sensitive names and phone numbers
              clientName: "Protegido por LGPD",
              clientPhone: "Oculto"
            });
          });
          setReservations(list);
          setConnectionError(null);
        },
        (err) => {
          console.error("onSnapshot error in collection 'availability':", err);
          setConnectionError({ message: err.message, code: (err as any).code, path: "availability" });
          try {
            handleFirestoreError(err, OperationType.GET, "availability");
          } catch (e) {
            console.warn("Muted error throw inside availability onSnapshot callback.");
          }
        }
      );
    }

    return () => {
      unsubReservations();
    };
  }, [isAdminMode, isFirebaseAdmin]);

  // Quick Seeder function to populate mock games for instant testing
  const handleSeedDemoGames = async () => {
    setSeeding(true);
    try {
      const demoGamesList = [
        {
          homeTeam: "Brasil",
          awayTeam: "Sérvia",
          dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // starts in 2 days
          description: "A grande estreia da Seleção Brasileira na Copa! Toda torcida junta em busca do Hexa com muita folia e cerveja estupidamente gelada no Quinteiro.",
          attractions: "DJ Guga Reis + Roda de Samba pós-jogo",
          isBrazilGame: true,
          tablesTotal4: 30,
          tablesTotal2: 2,
          priceTable4: 24,
          priceTable2: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          homeTeam: "Argentina",
          awayTeam: "México",
          dateTime: new Date(Date.now() + 4 * 10 * 60 * 1000).toISOString(), // starts in 40 mins (triggers automatic expiration test for free reservation)
          description: "O maior clássico latino-americano da Copa do Mundo. Promessa de jogão disputado ponto a ponto com transmissão ao vivo nos telões.",
          attractions: "DJ Guga Reis no intervalo",
          isBrazilGame: false,
          tablesTotal4: 30,
          tablesTotal2: 2,
          priceTable4: 0,
          priceTable2: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          homeTeam: "Brasil",
          awayTeam: "Suíça",
          dateTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // starts in 6 days
          description: "Segundo duelo do Brasil rumo à classificação! Prepare a garganta e agende sua mesa previamente para garantir o melhor ângulo do telão.",
          attractions: "Samba Quinteiro com Convidados Especiais",
          isBrazilGame: true,
          tablesTotal4: 30,
          tablesTotal2: 2,
          priceTable4: 24,
          priceTable2: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ];

      for (const dg of demoGamesList) {
        await addDoc(collection(db, "games"), dg);
      }
    } catch (e) {
      console.error("Error seeding demo:", e);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#041004] text-[#f5f5f0] overflow-hidden relative">
      
      {/* Ambient background blur elements for the Premium Dark Theme */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#004d1a] rounded-full blur-[140px] opacity-25"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#eab308] rounded-full blur-[150px] opacity-10"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#ec4899] rounded-full blur-[180px] opacity-10"></div>
      </div>

      {/* Navigation Header */}
      <Header 
        isAdminMode={isAdminMode} 
        onToggleAdminMode={setIsAdminMode} 
        homepageTexts={homepageTexts} 
        onAdminVerified={setIsFirebaseAdmin}
      />

      {/* Main Core Layout wrapping client space */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-16">
        
        {/* Connection Error Advisor Banner */}
        {connectionError && (
          <div id="firebase_not_found_advisor" className="p-6 bg-gradient-to-r from-red-950/40 to-amber-950/30 border-2 border-amber-500/20 rounded-3xl space-y-4 max-w-3xl mx-auto shadow-xl relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <RefreshCw className="w-16 h-16 text-amber-500 animate-spin-slow" />
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-amber-500/20 p-2.5 rounded-2xl border border-amber-500/30 text-amber-400 shrink-0">
                <HelpCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1 text-left">
                <h3 className="font-display font-black text-lg text-amber-400 uppercase tracking-tight">O Firestore precisa ser inicializado no Google Cloud</h3>
                <p className="text-xs text-white/80 leading-relaxed font-sans mt-1">
                  Identificamos uma restrição de resposta do Firebase: <code className="font-mono text-amber-200 select-all font-bold">Code 5 (NOT_FOUND)</code> na coleção <code className="font-mono bg-black/40 px-1 rounded text-soccer-gold">"{connectionError.path || "settings"}"</code>. Isso ocorre quando o banco de dados do seu projeto do Google Cloud <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-soccer-gold">copaco-18b74</code> ainda não foi inicializado no console.
                </p>
              </div>
            </div>
            
            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 space-y-3.5 text-left">
              <div className="text-[11px] font-mono text-soccer-gold font-bold uppercase tracking-wider">Passo a Passo para Ativar o Banco (Menos de 1 Minuto):</div>
              <ol className="text-[11px] text-white/70 space-y-2 list-decimal list-inside font-sans leading-relaxed">
                <li>Acesse o seu Painel do Firestore clicando no link direto: <a href="https://console.firebase.google.com/project/copaco-18b74/firestore" target="_blank" rel="noopener noreferrer" className="text-soccer-gold underline hover:text-yellow-300 font-bold inline-flex items-center gap-1">console.firebase.google.com/project/copaco-18b74/firestore <Eye className="w-3.5 h-3.5 inline" /></a></li>
                <li>Clique no botão <strong className="text-white">"Criar banco de dados"</strong> (ou "Create database").</li>
                <li>Mantenha o ID do banco fixado como o valor padrão <code className="font-mono text-white bg-white/10 px-1 rounded">(default)</code>.</li>
                <li>Escolha a região física do seu servidor (ex: <code className="font-mono text-white bg-white/10 px-1 rounded">southamerica-east1</code> ou <code className="font-mono text-white bg-white/10 px-1 rounded">us-central</code>) e clique em prosseguir.</li>
                <li>Inicie o banco em modo teste (para regras livres temporárias) ou modo de produção para aplicar as regras prontas e seguras.</li>
              </ol>
              <div className="text-[10px] text-zinc-400 font-sans leading-relaxed pt-1.5 border-t border-white/5">
                💡 <strong>Dica de Sincronia:</strong> Assim que você o inicializar no console da Firebase, o aplicativo vai se conectar e carregar a tela principal automaticamente em tempo real sem precisar de novo build ou re-deploy!
              </div>
            </div>
          </div>
        )}
        
        {/* HERO HEADER */}
        <section id="hero_section" className="relative rounded-3xl overflow-hidden bg-black/40 border border-white/5 p-8 md:p-12 text-center space-y-6 shadow-2xl backdrop-blur-md">
          
          {/* Subtle background sports grid */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(#eab308_1.5px,transparent_1.5px)] [background-size:24px_24px] pointer-events-none" />

          {/* Golden star badge decorative flow */}
          <div className="inline-flex items-center gap-1.5 bg-soccer-neon/10 border border-soccer-neon/30 px-3 py-1 rounded-full text-xs font-mono text-soccer-neon tracking-widest uppercase font-black">
            <Sparkle className="w-3.5 h-3.5 text-soccer-neon animate-spin-slow" />
            <span>{homepageTexts.badgeText}</span>
          </div>

          {/* Logo do Evento com Proporção de Destaque no Topo do Banner */}
          {homepageTexts.logoUrl ? (
            <div className="pt-2 flex justify-center animate-fade-in">
              <div className="relative group">
                {/* Glowing gold backdrop to highlight the event crest */}
                <div className="absolute -inset-2 bg-gradient-to-r from-soccer-gold via-[#eab308] to-amber-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-700 pointer-events-none"></div>
                
                <div id="hero_logo_container" className="relative p-4 sm:p-6 bg-black/30 border border-white/10 rounded-3xl flex items-center justify-center shadow-lg backdrop-blur-md max-w-[280px] sm:max-w-[340px] mx-auto">
                  <LogoImage 
                    logoUrl={homepageTexts.logoUrl}
                    logoUpdatedAt={homepageTexts.logoUpdatedAt}
                    alt="Logo Oficial Copaço"
                    className="h-32 sm:h-40 md:h-48 w-auto object-contain transition-transform duration-500 group-hover:scale-105"
                    fallbackType="hero"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Elegant fallback when no logo is uploaded */
            <LogoImage 
              logoUrl={undefined}
              alt="Logo Fallback"
              className=""
              fallbackType="hero"
            />
          )}

          <div className="space-y-3 max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-tight leading-[1.05] text-soccer-cream uppercase">
              {homepageTexts.heroTitlePart1} <span className="text-transparent bg-clip-text bg-gradient-to-r from-soccer-gold to-orange-600 select-none">{homepageTexts.heroTitleHighlight}</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-soccer-cream/80 max-w-2xl mx-auto font-sans leading-relaxed font-light">
              {homepageTexts.heroDescription}
            </p>
          </div>



        </section>

        {/* Guia explicativo de Espaços e Reservas */}
        <section id="spaces_guide_section">
          <div className="bg-black/40 border border-white/5 rounded-3xl p-6 md:p-8 space-y-4 text-left">
            <div className="flex flex-col lg:flex-row gap-6 items-start justify-between">
              <div className="space-y-4 flex-1">
                <span className="text-xs font-mono text-soccer-gold font-bold uppercase tracking-widest bg-soccer-gold/10 px-3 py-1 rounded-full inline-block">
                  📍 Guia de Espaços & Reservas
                </span>
                <h3 className="text-xl md:text-2xl font-display font-black text-soccer-cream uppercase leading-snug">
                  Quintal Principal (Área de Reservas)
                </h3>
                <p className="text-xs sm:text-sm text-soccer-cream/80 leading-relaxed font-sans">
                  As reservas de mesa no sistema são <strong className="text-soccer-gold">exclusivas para o Quintal Principal</strong>. Este é o sector premium do evento, onde estarão localizados:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-soccer-cream/95 font-sans pl-1">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-gold" />
                    <span>Telão Principal de Alta Definição</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-gold" />
                    <span>Sets de DJs exclusivos no intervalo e pós-jogo</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-gold" />
                    <span>Sorteios presenciais e bolão interativo</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-gold" />
                    <span>Ações com patrocinadores e distribuição de brindes</span>
                  </li>
                </ul>
              </div>

              <div className="lg:w-80 w-full bg-soccer-field/15 border border-white/5 rounded-2xl p-5 space-y-3 shrink-0">
                <h4 className="text-[10px] font-mono text-soccer-gold font-bold uppercase tracking-wider block border-b border-white/5 pb-1.5">
                  Outros Ambientes (Acesso de Graça)
                </h4>
                <p className="text-xs text-soccer-cream/90 leading-relaxed font-sans">
                  As demais dependências e varandas do Quinteiro terão mesas e cadeiras com visão para <strong className="text-[#0c5927]">TVs de 50 polegadas</strong> de alta qualidade.
                </p>
                <div className="space-y-1.5 text-[11px] text-soccer-cream/80 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-orange" />
                    <span>Ordem de chegada livre</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-orange" />
                    <span>Entrada 100% gratuita</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-soccer-orange" />
                    <span>Não exige reserva de mesa</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EXPERIENCE STATIONS (Cards modernos ilustrados d'o que acontece) */}
        <section id="experience_section" className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-soccer-cream uppercase">
              {homepageTexts.stationSectionTitle}
            </h2>
            <p className="text-xs sm:text-sm text-soccer-cream/60">
              {homepageTexts.stationSectionSubtitle}
            </p>
          </div>
 
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Telão */}
            <div className="bg-black/30 border border-white/5 rounded-2xl p-6 space-y-3 hover:border-soccer-gold/30 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-gold/10 flex items-center justify-center text-soccer-gold group-hover:scale-110 transition-transform">
                <Tv className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station1Title}</h3>
              <p className="text-xs text-soccer-cream/70 leading-relaxed">
                {homepageTexts.station1Desc}
              </p>
            </div>
 
            {/* DJ */}
            <div className="bg-black/30 border border-white/5 rounded-2xl p-6 space-y-3 hover:border-soccer-orange/30 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-orange/10 flex items-center justify-center text-soccer-orange group-hover:scale-110 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station2Title}</h3>
              <p className="text-xs text-soccer-cream/70 leading-relaxed">
                {homepageTexts.station2Desc}
              </p>
            </div>
 
            {/* Bebidas */}
            <div className="bg-black/30 border border-white/5 rounded-2xl p-6 space-y-3 hover:border-soccer-field/40 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-field/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Beer className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station3Title}</h3>
              <p className="text-xs text-soccer-cream/70 leading-relaxed">
                {homepageTexts.station3Desc}
              </p>
            </div>
 
            {/* Sorteios, Bolão & Torcida Clima */}
            <div className="bg-black/30 border border-white/5 rounded-2xl p-6 space-y-3 hover:border-soccer-neon/30 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-neon/10 flex items-center justify-center text-soccer-neon group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station4Title}</h3>
              <p className="text-xs text-soccer-cream/70 leading-relaxed">
                {homepageTexts.station4Desc}
              </p>
            </div>
 
          </div>
        </section>
 
        {loading ? (
          /* Loading Elegante Indicator requested */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-soccer-gold/20 border-t-soccer-gold animate-spin" />
            <span className="font-mono text-xs text-soccer-gold tracking-widest uppercase animate-pulse">
              Carregando Arena Quinteiro...
            </span>
          </div>
        ) : (
          <div>
            {/* If games list is empty, show a demo installer seeder for ease of testing */}
            {games.length === 0 && (
              <div className="mb-12 p-8 bg-black/40 border border-white/5 rounded-2xl text-center space-y-4 max-w-2xl mx-auto">
                <Sparkles className="w-10 h-10 text-soccer-gold mx-auto animate-bounce" />
                <h3 className="text-lg font-display font-bold text-soccer-cream">Bem-vindo ao COPAÇO no Quinteiro!</h3>
                <p className="text-xs text-soccer-cream/70 leading-relaxed">
                  Não foi encontrado nenhum jogo cadastrado no banco do Firebase. Para fins de avaliação, você pode povoar instantaneamente o seu catálogo clicando no botão abaixo:
                </p>
                <button
                  id="seed_initial_games_btn"
                  onClick={handleSeedDemoGames}
                  disabled={seeding}
                  className="px-6 py-2.5 bg-soccer-gold text-soccer-dark text-xs font-display font-black rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
                >
                  {seeding ? "Criando Partidas de Demonstração..." : "Carregar Jogos de Demonstração"}
                </button>
              </div>
            )}

            {/* MAIN ROUTE CONTENT TO TOGGLE BETWEEN CUSTOMER VIEW AND ADMIN DASH */}
            {isAdminMode ? (
              <AdminPanel 
                games={games} 
                reservations={reservations} 
                blockedTables={blockedTables} 
                onRefresh={() => {}} 
                homepageTexts={homepageTexts}
                initialGameToEdit={gameToEdit}
                onClearInitialGameToEdit={() => setGameToEdit(null)}
              />
            ) : (
              <MatchList 
                games={games} 
                reservations={reservations} 
                blockedTables={blockedTables} 
                onSelectGame={setSelectedGame} 
                isAdmin={isFirebaseAdmin} // allow edit actions if authenticated admin clicks
                onEditGame={(g) => {
                  setGameToEdit(g);
                  setIsAdminMode(true);
                }}
              />
            )}
          </div>
        )}

      </main>

      {/* CORE BOOKING FLOW MODAL SHEET */}
      {selectedGame && (
        <ReservationModal 
          game={selectedGame} 
          reservations={reservations} 
          blockedTables={blockedTables} 
          onClose={() => setSelectedGame(null)} 
          onSuccess={() => {}} 
        />
      )}

      {/* SHARED GROUP / ANNIVERSARY CONVITE MODAL */}
      {activeSharedGroupId && (
        <SharedGroupModal 
          groupId={activeSharedGroupId}
          onClose={() => {
            setActiveSharedGroupId(null);
            // also clean the URL query parameter elegantly without reloading the page
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          }}
        />
      )}

      {/* FOOTER */}
      <footer className="bg-black/30 border-t border-white/5 py-8 text-center mt-16 text-xs text-zinc-500 font-mono">
        <p>© 2026 COPAÇO no Quinteiro. Todos os direitos reservados.</p>
        <p className="text-[10px] text-soccer-gold/80 mt-1">Desenvolvido com carinho para torcedores especiais.</p>
      </footer>

      {/* FLOATING METHA ENERGIA PROMO BANNER */}
      {showMethaBanner && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[410px] bg-gradient-to-br from-[#0a2714] to-[#03150b] border-2 border-soccer-gold/80 rounded-2xl p-5 shadow-2xl z-50 animate-fade-in text-soccer-cream border-t-soccer-gold">
          <button
            onClick={handleDismissMethaBanner}
            className="absolute top-3 right-3 p-1 rounded-full text-soccer-cream/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            title="Fechar banner"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-soccer-gold/15 rounded-xl border border-soccer-gold/30 flex items-center justify-center shrink-0">
              <span className="text-xl">⚡</span>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-soccer-gold font-black uppercase tracking-widest block font-bold">PARCERIA COPAÇO</span>
              <h4 className="text-sm font-display font-black text-white uppercase leading-tight">Sua conta de Luz até 15% mais barata!</h4>
            </div>
          </div>

          <p className="text-xs text-soccer-cream/90 mt-3 leading-relaxed font-sans">
            Levando sua conta para a <strong className="text-soccer-gold">Metha Energia</strong>, você garante até 15% de desconto e ainda concorre a prêmios especiais nos jogos do Brasil! 🇧🇷
          </p>

          <div className="my-3 p-3 bg-black/40 rounded-xl border border-soccer-field/30 space-y-1.5 text-xs text-left">
            <span className="font-bold text-soccer-gold flex items-center gap-1 text-[11px]">
              🎁 Sorteios ao vivo no Copaço:
            </span>
            <div className="grid grid-cols-1 gap-1 text-[11px] text-soccer-cream/90 font-sans">
              <div className="flex items-center gap-1.5">
                <span className="text-soccer-gold font-bold">•</span>
                <span>Camisas personalizadas da torcida</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-soccer-gold font-bold">•</span>
                <span>Até 6 meses de conta de energia <strong className="text-emerald-400 font-bold">GRÁTIS</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-soccer-gold font-bold">•</span>
                <span>A sua conta <strong className="text-emerald-400 font-bold">ZERADA</strong></span>
              </div>
            </div>
            <p className="text-[10px] text-soccer-cream/50 font-mono italic">
              Realizados ao vivo durante os jogos do Brasil no Copaço.
            </p>
          </div>

          <div className="space-y-1 text-center font-mono">
            <a
              href="https://methaenergia.com.br/indicacao/U7603NFG"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#ebd152] hover:bg-yellow-500 text-black font-display font-black py-3 px-4 rounded-xl text-xs uppercase block transition-transform hover:scale-[1.01] shadow-lg shadow-soccer-gold/20 font-bold tracking-wider"
            >
              🚀 Quero Concorrer e Economizar!
            </a>
            <span className="block text-[9px] text-soccer-cream/50 pt-1">
              methaenergia.com.br/indicacao/U7603NFG
            </span>
          </div>
        </div>
      )}

      {/* FLOATING WHATSAPP SUPPORT BUTTON (ALL PAGES/VIEWS) */}
      <a
        href="https://wa.me/5531975099398?text=Olá,%20gostaria%20de%20tirar%20uma%20dúvida%20sobre%20as%20reservas%20do%20Copaço!"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-[60] flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white px-4 py-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 border border-emerald-400/30 select-none group font-display"
        title="Dúvidas? Fale conosco no WhatsApp"
      >
        <MessageCircle className="w-5 h-5 fill-white text-emerald-600 group-hover:text-emerald-500 transition-colors" />
        <span className="text-xs font-black uppercase tracking-wider">Dúvidas? Fale Conosco</span>
      </a>

    </div>
  );
}
