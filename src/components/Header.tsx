/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";
import { Shield, LogIn, LogOut, Ticket, Star } from "lucide-react";

interface HeaderProps {
  isAdminMode: boolean;
  onToggleAdminMode: (active: boolean) => void;
}

export default function Header({ isAdminMode, onToggleAdminMode }: HeaderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      
      // If signed in, verify if user matches admin email and optionally auto-toggle
      if (user && user.email === "andrecalixtolima@gmail.com") {
        onToggleAdminMode(true);
      } else {
        onToggleAdminMode(false);
      }
    });
    return unsubscribe;
  }, [onToggleAdminMode]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Force popup sign in as recommended for AI Studio sandboxes
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login Error:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onToggleAdminMode(false);
    } catch (e) {
      console.error("Logout Error:", e);
    }
  };

  const isUserAdmin = currentUser && currentUser.email === "andrecalixtolima@gmail.com";

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-[#041004]/80 border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#EAB308] to-[#F97316] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 font-display font-black text-[#041004] text-2xl cursor-pointer select-none">
              Q
            </div>
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
              Toda reserva garante acesso à área do telão principal!
            </span>
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
            ) : currentUser ? (
              <div className="flex items-center gap-2">
                <img 
                  src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`} 
                  alt={currentUser.displayName || "Admin User"} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border-2 border-soccer-gold/60"
                />
                <div className="hidden lg:block text-left mr-1">
                  <p className="text-xs font-display font-semibold text-soccer-cream truncate max-w-[120px]">
                    {currentUser.displayName}
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
                onClick={handleLogin}
                className="flex items-center gap-1.5 bg-gradient-to-r from-soccer-gold to-yellow-500 hover:from-yellow-500 hover:to-soccer-orange text-soccer-dark px-4 py-2 rounded-lg text-sm font-semibold tracking-tight shadow-md transition-all duration-300"
              >
                <LogIn className="w-4 h-4" />
                <span>Admin Login</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
