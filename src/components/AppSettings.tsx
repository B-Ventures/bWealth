import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Download, Upload, Coins, Loader2, BellRing, Smartphone } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { DEFAULT_STATE } from '../types';
import { requestNotificationPermission } from '../firebase';

export function AppSettings() {
  const { state, updateGoldPrice, importData } = useStore();
  const [price, setPrice] = useState(state.currentGoldPricePerUnit.toString());
  const [saved, setSaved] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string>('Enable Notifications');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleSavePrice = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(price);
    if (!isNaN(val) && val > 0) {
      updateGoldPrice(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleEnableNotifications = async () => {
    setNotifStatus('Requesting...');
    try {
      await requestNotificationPermission();
      if (Notification.permission === 'granted') {
        setNotifStatus('Enabled');
      } else {
        setNotifStatus('Permission Denied (Open app in new tab)');
      }
    } catch(e) {
      setNotifStatus('Permission Denied (Open app in new tab)');
    }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "family_gold_savings_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && typeof json === 'object' && 'beneficiaries' in json) {
          importData({ ...DEFAULT_STATE, ...json });
          alert("Backup restored successfully!");
        } else {
          alert("Invalid backup file format.");
        }
      } catch (err) {
        alert("Error parsing backup file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-display font-semibold tracking-tight text-stone-900">Settings</h2>
        <p className="text-sm text-stone-500 mt-1 tracking-wide">Manage global preferences and data backups.</p>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-stone-200/60 overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-stone-900 text-lg">Current Market Price</h3>
              <p className="text-sm text-stone-500 tracking-wide mt-0.5">Live data fetching is enabled via Yahoo Finance.</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex justify-between items-center bg-stone-50 p-5 rounded-2xl border border-stone-200/60 shadow-sm">
            <span className="text-sm font-medium text-stone-500 uppercase tracking-widest">Live 21K English Coin (8g) Price</span>
            <span className="text-2xl font-light tracking-tight text-amber-600">
              {formatCurrency(state.currentGoldPricePerUnit, state.currency)}
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-4 flex items-center gap-2 font-medium tracking-wide">
            <Loader2 className="w-3.5 h-3.5 animate-spin"/> Price updates automatically in the background
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-stone-200/60 overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-stone-900 text-lg">Push Notifications</h3>
              <p className="text-sm text-stone-500 tracking-wide mt-0.5">Get reminded when deposits are due.</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <button 
            onClick={handleEnableNotifications}
            disabled={notifStatus === 'Enabled'}
            className={`w-full py-4 rounded-xl font-medium transition-all shadow-sm ${
              notifStatus === 'Enabled' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-stone-900 text-white hover:bg-stone-800 hover:shadow-md'
            }`}
          >
            {notifStatus}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-stone-200/60 overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-stone-900 text-lg">Install App</h3>
              <p className="text-sm text-stone-500 tracking-wide mt-0.5">Add Vault &amp; Vine to your home screen.</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {installPrompt ? (
            <button 
              onClick={handleInstallClick}
              className="w-full py-4 rounded-xl font-medium transition-all shadow-sm bg-sky-600 text-white hover:bg-sky-700 hover:shadow-md"
            >
              Install App
            </button>
          ) : (
            <div className="text-sm text-stone-600 text-center bg-stone-50 p-4 rounded-xl border border-stone-200">
              <p className="font-medium mb-1">To install this app:</p>
              <ul className="text-left space-y-1 list-disc list-inside opacity-90 mx-auto w-fit">
                <li>Make sure you're viewing in a standard browser window (not an iframe preview).</li>
                <li>Tap <strong className="text-stone-900">Share</strong> (iOS) or browser menu (Android/Desktop).</li>
                <li>Select <strong className="text-stone-900">Add to Home Screen</strong>.</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[24px] shadow-sm border border-stone-200/60 overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/30">
          <h3 className="font-display font-semibold text-stone-900 text-lg">Data Backup & Restore</h3>
          <p className="text-sm text-stone-500 mt-1 tracking-wide">Export your data to a file for safekeeping, or restore from a previous backup.</p>
        </div>
        
        <div className="p-6 flex flex-col sm:flex-row gap-4">
          <button 
            onClick={handleExport}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-xl font-medium transition-all shadow-sm hover:shadow"
          >
            <Download className="w-5 h-5" />
            Export Backup
          </button>

          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImport}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-xl font-medium transition-all shadow-sm hover:shadow"
          >
            <Upload className="w-5 h-5" />
            Restore Backup
          </button>
        </div>
      </div>
    </div>
  );
}
