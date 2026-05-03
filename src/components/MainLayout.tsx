import React, { useState } from 'react';
import { useStore } from '../store';
import { Settings, Users, ArrowLeft, LogIn, ShieldCheck, TrendingUp, Sparkles, Download } from 'lucide-react';
import { Dashboard } from './Dashboard';
import { BeneficiaryDetail } from './BeneficiaryDetail';
import { AppSettings } from './AppSettings';
import { motion, AnimatePresence } from 'motion/react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function MainLayout() {
  const { user, authReady, login } = useStore();
  const [view, setView] = useState<'dashboard' | 'settings' | 'detail'>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { deferredPrompt, install } = useInstallPrompt();

  const navigateTo = (view: 'dashboard' | 'settings', id: string | null = null) => {
    setView(view);
    setSelectedId(id);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex flex-col font-sans selection:bg-amber-100 italic-care">
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="w-20 h-20 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-10 mx-auto ring-1 ring-amber-500/20 rotate-3 hover:rotate-0 transition-transform duration-500">
              <Users className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl font-display font-bold tracking-tight text-stone-900 mb-4">
              Legacy in Gold.
            </h1>
            <p className="text-stone-500 text-lg leading-relaxed mb-12">
              The professional way to track family wealth, secured by Google. 
              Manage beneficiaries, recurring savings, and gold investments in one place.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-12 text-left">
              <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <ShieldCheck className="w-6 h-6 text-emerald-500 mb-2" />
                <h3 className="font-semibold text-stone-900 text-sm">Secure Data</h3>
                <p className="text-xs text-stone-500">Encrypted per user</p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <TrendingUp className="w-6 h-6 text-amber-500 mb-2" />
                <h3 className="font-semibold text-stone-900 text-sm">Price Tracking</h3>
                <p className="text-xs text-stone-500">Live market sync</p>
              </div>
            </div>

            <button
              onClick={login}
              className="w-full py-4 px-6 bg-stone-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-stone-800 transition-all active:scale-[0.98] shadow-xl shadow-stone-900/10 mb-4"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>

            {deferredPrompt && (
              <button
                onClick={install}
                className="w-full py-4 px-6 bg-white text-stone-900 border border-stone-200 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-stone-50 transition-all active:scale-[0.98] shadow-sm mb-4"
              >
                <Download className="w-5 h-5 text-amber-500" />
                Install App to Device
              </button>
            )}
            
            <p className="mt-8 text-xs text-stone-400 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Your data is private and never shared.
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans text-stone-900">
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-200 sticky top-0 z-50 transition-all">
        <div className="w-full max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view !== 'dashboard' && (
              <button 
                onClick={() => navigateTo('dashboard')}
                className="p-2 -ml-2 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-white shadow-sm ring-1 ring-amber-500/20">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-display font-semibold tracking-tight text-stone-900">bWealth</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {deferredPrompt && (
              <button
                onClick={install}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-full text-xs font-semibold transition-colors mr-2"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}
            <button 
              onClick={() => navigateTo('settings')}
              className="p-2.5 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={view + (selectedId || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {view === 'dashboard' && <Dashboard onSelect={(id) => { setSelectedId(id); setView('detail'); }} />}
            {view === 'settings' && <AppSettings />}
            {view === 'detail' && selectedId && <BeneficiaryDetail id={selectedId} onBack={() => navigateTo('dashboard')} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
