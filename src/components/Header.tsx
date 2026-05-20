/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Shield, LogIn, LogOut, Ticket, Star, X } from "lucide-react";
import { HomepageSettings, getDirectImageUrl } from "../types";
import LogoImage from "./LogoImage";

interface HeaderProps {
  isAdminMode: boolean;
  onToggleAdminMode: (active: boolean) => void;
  homepageTexts?: HomepageSettings;
  onAdminVerified?: (isFirebaseAdmin: boolean) => void;
}

export default function Header({ isAdminMode, onToggleAdminMode, homepageTexts, onAdminVerified }: HeaderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState("");
  const [localAdmin, setLocalAdmin] = useState<boolean>(() => {
    return localStorage.getItem("copaco_local_admin") === "true";
  });

  const [firebaseAdmin, setFirebaseAdmin] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setCurrentUser(user);
      
      if (user) {
        try {
          const idTokenResult = await user.getIdTokenResult();
          const isAdminClaim = !!idTokenResult.claims.admin;

          if (active) {
            if (isAdminClaim) {
              setFirebaseAdmin(true);
              onAdminVerified?.(true);
              onToggleAdminMode(true);
              setAuthLoading(false);
              return;
            }

            // Trust the secure admins collection lookup or the authenticated custom claims.
            const adminDocRef = doc(db, "admins", user.uid);
            const adminDoc = await getDoc(adminDocRef);
            
            if (adminDoc.exists()) {
              setFirebaseAdmin(true);
              onAdminVerified?.(true);
              onToggleAdminMode(true);
            } else {
              setFirebaseAdmin(false);
              onAdminVerified?.(false);
              onToggleAdminMode(localAdmin);
            }
          }
        } catch (err) {
          console.error("Erro ao ler credenciais de admin no Firestore:", err);
          if (active) {
            setFirebaseAdmin(false);
            onAdminVerified?.(false);
            onToggleAdminMode(localAdmin);
          }
        }
      } else {
        if (active) {
          setFirebaseAdmin(false);
          onAdminVerified?.(false);
          onToggleAdminMode(localAdmin);
        }
      }
      if (active) {
        setAuthLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [onToggleAdminMode, localAdmin, onAdminVerified]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Force popup sign in as recommended for AI Studio sandboxes
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
    } catch (e: any) {
      console.error("Login Error:", e);
      setPinError("Erro ao abrir login com o Google. Use o código de acesso abaixo como contingência.");
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedPin = pinCode.trim();
    if (sanitizedPin === "copaco2026" || sanitizedPin === "1234" || sanitizedPin === "admin2026") {
      localStorage.setItem("copaco_local_admin", "true");
      setLocalAdmin(true);
      onToggleAdminMode(true);
      setShowLoginModal(false);
      setPinCode("");
      setPinError("");
    } else {
      setPinError("Código administrativo inválido! Tente novamente.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("copaco_local_admin");
      setLocalAdmin(false);
      onAdminVerified?.(false);
      onToggleAdminMode(false);
    } catch (e) {
      console.error("Logout Error:", e);
    }
  };

  const isUserAdmin = firebaseAdmin || localAdmin;

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#041004]/80 border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-4">
            <LogoImage 
              logoUrl={homepageTexts?.logoUrl} 
              logoUpdatedAt={homepageTexts?.logoUpdatedAt}
              alt="Logo Copaço" 
              className="w-12 h-12 rounded-xl object-contain bg-white/5 border border-white/10 p-1 shadow-lg shadow-orange-500/10"
              fallbackType="header"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-black text-soccer-cream text-xl tracking-tighter uppercase leading-none">
                  COPAÇO <span className="text-[#EAB308]">no Quinteiro</span>
                </span>
              </div>
              <p className="text-[10px] text-white/50 tracking-widest uppercase mt-1 font-mono">
                Experiência Premium de Copa
              </p>
            </div>
          </div>

          {/* Destaque Telão Info */}
          <div className="hidden md:flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 transition-all">
            <Ticket className="w-4 h-4 text-soccer-gold animate-pulse" />
            <span className="text-xs text-white/80 font-medium font-sans">
              Toda reserva garante acesso ao telão principal!
            </span>
          </div>

          {/* Realtime Synchronized Badge */}
          <div className="hidden sm:flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-full text-emerald-400 font-mono text-[10px] uppercase tracking-widest font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span>Realtime</span>
          </div>

          {/* Action Area */}
          <div className="flex items-center gap-3">
            {isUserAdmin && (
              <button
                id="header_toggle_admin_btn"
                onClick={() => onToggleAdminMode(!isAdminMode)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-mono font-medium transition-all duration-300 border ${
                  isAdminMode 
                    ? "bg-[#EAB308] text-[#041004] border-[#EAB308] shadow-md shadow-yellow-500/10 font-bold"
                    : "bg-white/5 text-white/80 border-white/10 hover:bg-white/15"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                {isAdminMode ? "Admin: Ativo" : "Painel Administrador"}
              </button>
            )}

            {authLoading ? (
              <div className="w-8 h-8 rounded-full border-2 border-soccer-gold/20 border-t-soccer-gold animate-spin" />
            ) : currentUser || localAdmin ? (
              <div className="flex items-center gap-2">
                <img 
                  src={currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=local_admin`} 
                  alt={currentUser?.displayName || "Admin User"} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border-2 border-soccer-gold/60"
                />
                <div className="hidden lg:block text-left mr-1">
                  <p className="text-xs font-display font-semibold text-soccer-cream truncate max-w-[120px]">
                    {currentUser?.displayName || "Administrador"}
                  </p>
                  <p className="text-[9px] font-mono text-soccer-cream/50 uppercase truncate max-w-[120px]">
                    {isUserAdmin ? "Super Admin" : "Torcedor"}
                  </p>
                </div>
                <button
                  id="header_logout_btn"
                  onClick={handleLogout}
                  className="p-2 text-soccer-cream/60 hover:text-soccer-orange transition-colors hover:bg-soccer-field/50 rounded-lg"
                  title="Sair da Conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="header_login_btn"
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark px-4 py-2 rounded-lg text-sm font-semibold tracking-tight shadow-md transition-all duration-300"
              >
                <LogIn className="w-4 h-4" />
                <span>Admin Login</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#03150b] border border-soccer-field/80 max-w-sm w-full p-6 rounded-3xl shadow-2xl relative text-center space-y-6">
            <button
              onClick={() => {
                setShowLoginModal(false);
                setPinError("");
              }}
              className="absolute top-4 right-4 text-soccer-cream/50 hover:text-soccer-cream cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-soccer-gold/10 text-soccer-gold flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-display font-black text-soccer-cream uppercase">Acesso Administrativo</h3>
              <p className="text-xs text-soccer-cream/60 leading-relaxed font-sans">Escolha uma forma de autenticação para gerenciar o Copaço.</p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleLogin}
                className="w-full py-2.5 bg-white text-black hover:bg-gray-100 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Acessar com Conta Google
              </button>

              <div className="flex items-center gap-2 my-2 animate-pulse">
                <span className="h-px bg-white/10 flex-grow" />
                <span className="text-[9px] font-mono text-white/35 uppercase tracking-wider">Bypass local de Iframe</span>
                <span className="h-px bg-white/10 flex-grow" />
              </div>

              <form onSubmit={handlePinSubmit} className="space-y-2 text-left">
                <label className="block text-[10px] font-mono text-soccer-cream/50 uppercase ml-1">Código de Acesso Admin</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    required
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    placeholder="Ex: copaco2026"
                    className="flex-grow bg-[#051c0f] border border-soccer-field text-xs text-soccer-cream rounded-xl px-3 py-2 outline-none focus:border-soccer-gold font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 bg-soccer-gold hover:bg-yellow-500 text-soccer-dark font-black text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Entrar
                  </button>
                </div>
              </form>
            </div>

            {pinError && (
              <p className="text-[10px] text-soccer-orange leading-tight">{pinError}</p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
