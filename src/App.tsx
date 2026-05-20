/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, onSnapshot, addDoc, doc } from "firebase/firestore";
import { Game, Reservation, BlockedTable, HomepageSettings } from "./types";
import Header from "./components/Header";
import MatchList from "./components/MatchList";
import ReservationModal from "./components/ReservationModal";
import AdminPanel from "./components/AdminPanel";
import { 
  Tv, Music, Beer, Trophy, Gift, Users2, Sparkles, HelpCircle, Star, Sparkle, RefreshCw, Eye 
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
    heroDescription: "Reserve sua mesa e garanta acesso ao telão de altíssima definição. O clima frenético de estádio com a gastronomia e o conforto premium do Quinteiro.",
    telaoBannerText: "Toda reserva garante acesso à área do telão principal do COPAÇO",
    stationSectionTitle: "O QUE ACONTECE NO COPAÇO",
    stationSectionSubtitle: "A energia eletrizante dos gramados com a infraestrutura premium do Quinteiro.",
    station1Title: "Mega Telão",
    station1Desc: "Painel LED de altíssima definição com som estéreo imersivo de estádio. Nenhum lance perdido.",
    station2Title: "DJ ao Vivo",
    station2Desc: "Músicas e sets eletrizantes nos intervalos e pós-jogo para sacudir as comemorações da torcida.",
    station3Title: "Promoções",
    station3Desc: "Double chopp nos gols do Brasil, combos especiais e descontos progressivos em chopes artesanais.",
    station4Title: "Bolão Premium",
    station4Desc: "Participe do nosso bolão interativo com direito a rodadas duplas exclusivas e brindes exclusivos a cada rodada."
  });
  
  const [loading, setLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const [seeding, setSeeding] = useState(false);

  // Subscribe to real-time collections
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
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "games")
    );

    const unsubReservations = onSnapshot(
      collection(db, "reservations"),
      (snap) => {
        const list: Reservation[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Reservation);
        });
        setReservations(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "reservations")
    );

    const unsubBlocks = onSnapshot(
      collection(db, "blockedTables"),
      (snap) => {
        const list: BlockedTable[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as BlockedTable);
        });
        setBlockedTables(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, "blockedTables")
    );

    const unsubTexts = onSnapshot(
      doc(db, "settings", "homepage"),
      (snap) => {
        if (snap.exists()) {
          setHomepageTexts(snap.data() as HomepageSettings);
        }
      },
      (err) => console.warn("Error loading homepage settings:", err)
    );

    return () => {
      unsubGames();
      unsubReservations();
      unsubBlocks();
      unsubTexts();
    };
  }, []);

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
          tablesTotal2: 3,
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
          tablesTotal2: 3,
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
          tablesTotal2: 3,
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
      
      {/* Ambient background blur elements for the Immersive Theme */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#004d1a] rounded-full blur-[120px] opacity-40"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#f97316] rounded-full blur-[150px] opacity-20"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#ec4899] rounded-full blur-[180px] opacity-10"></div>
      </div>

      {/* Navigation Header */}
      <Header isAdminMode={isAdminMode} onToggleAdminMode={setIsAdminMode} />

      {/* Main Core Layout wrapping client space */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-16">
        
        {/* HERO HEADER */}
        <section id="hero_section" className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-soccer-dark/90 via-soccer-field/40 to-black/80 border border-white/10 p-8 md:p-12 text-center space-y-6 shadow-2xl backdrop-blur-md">
          
          {/* Subtle background sports grid */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ebd152_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          {/* Golden star badge decorative flow */}
          <div className="inline-flex items-center gap-1.5 bg-[#ec4899]/20 border border-[#ec4899]/40 px-3 py-1 rounded-full text-xs font-mono text-soccer-neon tracking-widest uppercase font-black">
            <Sparkle className="w-3.5 h-3.5 text-soccer-neon animate-spin-slow" />
            <span>{homepageTexts.badgeText}</span>
          </div>

          <div className="space-y-3 max-w-3xl mx-auto">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-display font-black tracking-tight leading-[0.95] text-soccer-cream uppercase">
              {homepageTexts.heroTitlePart1} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#EAB308] to-[#F97316] select-none">{homepageTexts.heroTitleHighlight}</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-soccer-cream/80 max-w-2xl mx-auto font-sans leading-relaxed font-light">
              {homepageTexts.heroDescription}
            </p>
          </div>

          {/* Highlight text requested */}
          <div className="inline-block bg-white/5 border border-white/10 px-6 py-3 rounded-2xl shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 text-soccer-gold font-display font-bold text-sm sm:text-base tracking-tight">
              <Tv className="w-5 h-5 text-soccer-gold shrink-0" />
              <span>{homepageTexts.telaoBannerText}</span>
            </div>
          </div>

          {/* Empty Space filler for custom events logo */}
          <div className="pt-2">
            <div className="mx-auto w-36 h-12 bg-soccer-cream/5 border border-dashed border-soccer-cream/20 rounded-xl flex items-center justify-center text-[10px] uppercase tracking-wider text-soccer-cream/40 font-mono" title="Placeholder para a Logo do Evento">
              [ Copaço Oficial ]
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
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 hover:border-soccer-gold/30 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-gold/10 flex items-center justify-center text-soccer-gold group-hover:scale-110 transition-transform">
                <Tv className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station1Title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {homepageTexts.station1Desc}
              </p>
            </div>

            {/* DJ */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 hover:border-soccer-orange/40 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-orange/10 flex items-center justify-center text-soccer-orange group-hover:scale-110 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station2Title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {homepageTexts.station2Desc}
              </p>
            </div>

            {/* Bebidas */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 hover:border-emerald-400/40 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Beer className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station3Title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {homepageTexts.station3Desc}
              </p>
            </div>

            {/* Sorteios, Bolão & Torcida Clima */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 hover:bg-white/10 hover:border-soccer-neon/40 transition-all duration-300 group">
              <div className="w-10 h-10 rounded-xl bg-soccer-neon/10 flex items-center justify-center text-soccer-neon group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-base text-soccer-cream uppercase tracking-tight">{homepageTexts.station4Title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">
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
              <div className="mb-12 p-8 bg-soccer-field/20 border border-soccer-gold/30 rounded-2xl text-center space-y-4 max-w-2xl mx-auto">
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
              />
            ) : (
              <MatchList 
                games={games} 
                reservations={reservations} 
                blockedTables={blockedTables} 
                onSelectGame={setSelectedGame} 
                isAdmin={true} // allow edit actions if authenticated admin clicks
                onEditGame={(g) => {
                  setIsAdminMode(true);
                  // Optionally pass down game filtering but simply toggling switches tabs nicely
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

      {/* FOOTER */}
      <footer className="bg-[#041a0e] border-t border-soccer-field py-8 text-center mt-16 text-xs text-soccer-cream/40 font-mono">
        <p>© 2026 COPAÇO no Quinteiro. Todos os direitos reservados.</p>
        <p className="text-[10px] text-soccer-gold mt-1">Desenvolvido com carinho para torcedores especiais.</p>
      </footer>

    </div>
  );
}
