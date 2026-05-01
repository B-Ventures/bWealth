import React, { useState } from 'react';
import { useStore } from '../store';
import { Settings, Users, ArrowLeft } from 'lucide-react';
import { Dashboard } from './Dashboard';
import { BeneficiaryDetail } from './BeneficiaryDetail';
import { AppSettings } from './AppSettings';

export function MainLayout() {
  const [view, setView] = useState<'dashboard' | 'settings' | 'detail'>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const navigateTo = (view: 'dashboard' | 'settings', id: string | null = null) => {
    setView(view);
    setSelectedId(id);
  };

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
              <h1 className="text-xl font-display font-semibold tracking-tight text-stone-900">Vault & Vine</h1>
            </div>
          </div>
          
          <button 
            onClick={() => navigateTo('settings')}
            className="p-2.5 text-stone-400 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
        {view === 'dashboard' && <Dashboard onSelect={(id) => { setSelectedId(id); setView('detail'); }} />}
        {view === 'settings' && <AppSettings />}
        {view === 'detail' && selectedId && <BeneficiaryDetail id={selectedId} onBack={() => navigateTo('dashboard')} />}
      </main>
    </div>
  );
}
