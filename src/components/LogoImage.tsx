import React, { useState, useEffect, useMemo } from "react";
import { Trophy } from "lucide-react";
import { motion } from "motion/react";
import { getDirectImageUrl, isValidDirectImageUrl } from "../types";

interface LogoImageProps {
  logoUrl?: string;
  logoUpdatedAt?: number;
  alt: string;
  className: string;
  fallbackType: "header" | "hero" | "admin";
}

const LogoImage = React.memo(function LogoImage({ 
  logoUrl, 
  logoUpdatedAt, 
  alt, 
  className, 
  fallbackType 
}: LogoImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  // Reset error and loading state if the URL or update timestamp changes
  useEffect(() => {
    setHasError(false);
    setIsImageLoading(true);
  }, [logoUrl, logoUpdatedAt]);

  const isValid = isValidDirectImageUrl(logoUrl);
  
  const directUrl = useMemo(() => {
    if (!logoUrl || !isValid) return "";
    const rawDirectUrl = getDirectImageUrl(logoUrl);
    if (!rawDirectUrl) return "";
    
    // Only append version query parameter if logoUpdatedAt is available
    if (logoUpdatedAt) {
      return rawDirectUrl.includes("?") 
        ? `${rawDirectUrl}&t=${logoUpdatedAt}` 
        : `${rawDirectUrl}?t=${logoUpdatedAt}`;
    }
    return rawDirectUrl;
  }, [logoUrl, logoUpdatedAt, isValid]);

  const isDev = !!(import.meta as any).env?.DEV;

  if (isDev) {
    console.log(`[LogoImage] rendering -> logoUrl: ${logoUrl}, logoUpdatedAt: ${logoUpdatedAt}, directUrl: ${directUrl}`);
  }

  // Elegant Premium Fallbacks when there's an error, URL is invalid, or URL is empty
  if (!logoUrl || hasError || !isValid) {
    if (fallbackType === "header") {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-[#EAB308] to-[#F97316] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 font-display font-black text-[#041004] text-2xl select-none">
          Q
        </div>
      );
    }
    if (fallbackType === "admin") {
      return (
        <div className="w-10 h-10 bg-gradient-to-br from-[#EAB308] to-[#F97316] rounded-lg flex items-center justify-center font-display font-black text-[#041004] text-lg select-none">
          Q
        </div>
      );
    }
    // High-fidelity premium hero fallback when logo is missing or load failed
    return (
      <div className="pt-2 flex justify-center animate-fade-in">
        <div className="relative inline-flex flex-col items-center p-6 rounded-2xl bg-white/5 border border-white/10 shadow-xl max-w-[240px]">
          <Trophy className="w-10 h-10 text-soccer-gold animate-bounce mb-2" />
          <span className="font-display font-black text-sm text-soccer-gold uppercase tracking-widest">COPAÇO</span>
          <span className="font-mono text-[8px] text-soccer-cream/50 uppercase tracking-[0.2em] mt-0.5">Quinteiro Oficial</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-center overflow-hidden rounded-xl">
      {/* Skeleton Loading State with pulse animation */}
      {isImageLoading && (
        <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center animate-pulse">
          <Trophy className="w-6 h-6 text-soccer-gold/40 animate-pulse" />
        </div>
      )}

      {/* Actual Direct Image Tag with Fade-In Animation */}
      <motion.img
        src={directUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={() => setIsImageLoading(false)}
        onError={() => {
          if (isDev) {
            console.error(`[LogoImage] Falha ao renderizar imagem: ${directUrl}`);
          }
          setHasError(true);
          setIsImageLoading(false);
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isImageLoading ? 0 : 1, scale: isImageLoading ? 0.95 : 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`${className} object-contain max-w-full max-h-full`}
      />
    </div>
  );
});

export default LogoImage;
