import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw, Home, ShieldAlert } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL SYSTEM FAULT]:", error, errorInfo);
    // Real-world telemetry placeholder
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "exception", {
        description: error.message,
        fatal: true
      });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#041004] text-[#f5f5f0] flex flex-col items-center justify-center p-4 selection:bg-soccer-gold selection:text-black font-sans">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,77,26,0.15)_0%,transparent_70%)] pointer-events-none" />
          
          <div 
            id="error-boundary-card" 
            className="w-full max-w-md bg-soccer-dark/80 backdrop-blur-md rounded-2xl border border-soccer-neon/40 p-8 text-center space-y-6 shadow-2xl shadow-soccer-neon/10 text-soccer-cream"
          >
            <div className="mx-auto w-16 h-16 rounded-full bg-soccer-neon/10 flex items-center justify-center border border-soccer-neon/35 animate-pulse">
              <ShieldAlert className="w-8 h-8 text-soccer-neon" />
            </div>

            <div className="space-y-2">
              <h2 className="font-display font-black text-xl tracking-tight text-soccer-cream uppercase">Algo saiu de campo</h2>
              <p className="text-xs text-soccer-cream/70 leading-relaxed font-sans">
                Ocorreu uma instabilidade inesperada carregando os dados do evento. Já registramos este incidente de performance administrativamente.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#051c0f] border border-soccer-field/35 p-3 rounded-xl text-left">
                <span className="block text-[10px] font-mono text-soccer-cream/40 uppercase">Erro Diagnóstico</span>
                <p className="font-mono text-[10px] text-soccer-gold mt-1 line-clamp-2 break-all">
                  {this.state.error.message || "Erro desconhecido"}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                id="error-boundary-retry-button"
                onClick={this.handleReset}
                className="w-full py-2.5 bg-soccer-gold text-soccer-dark font-display font-extrabold text-xs rounded-xl hover:bg-yellow-500 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
              
              <button
                id="error-boundary-home-button"
                onClick={() => { window.location.href = "/"; }}
                className="w-full py-2.5 bg-soccer-field hover:bg-soccer-field/80 text-soccer-cream font-display font-semibold text-xs rounded-xl hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-soccer-field/40"
              >
                <Home className="w-3.5 h-3.5" />
                Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
