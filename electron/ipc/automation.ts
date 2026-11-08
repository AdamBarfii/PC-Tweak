/**
 * PC Tweak - Automation & Smart Suggestions IPC Module
 * 
 * Bridges the AutomationEngine, AutomationStore, and SmartSuggestionsEngine to the renderer process.
 */

import { ipcMain } from 'electron';
import { AutomationStore, AutomationConfig } from '../storage/automationStore';
import { AutomationEngine } from '../engine/automationEngine';
import { SmartSuggestionsEngine } from '../engine/smartSuggestionsEngine';

export function registerAutomationIpc() {
  // Automation Configuration & Logs
  ipcMain.handle('automation:getConfig', async () => {
    return AutomationStore.getConfig();
  });

  ipcMain.handle('automation:updateConfig', async (_event, partial: Partial<AutomationConfig>) => {
    const res = AutomationStore.updateConfig(partial);
    // Trigger immediate evaluation if masterEnabled was toggled to true
    if (partial.masterEnabled) {
      AutomationEngine.evaluateRules().catch(() => {});
    }
    return res;
  });

  ipcMain.handle('automation:getLogs', async (_event, limit?: number) => {
    return AutomationStore.getLogs(limit);
  });

  ipcMain.handle('automation:clearLogs', async () => {
    return AutomationStore.clearLogs();
  });

  // Smart Suggestions
  ipcMain.handle('suggestions:get', async () => {
    return await SmartSuggestionsEngine.getSuggestions();
  });

  ipcMain.handle('suggestions:apply', async (_event, id: string) => {
    return await SmartSuggestionsEngine.applySuggestion(id);
  });

  ipcMain.handle('suggestions:applyAll', async () => {
    return await SmartSuggestionsEngine.applyAllSafe();
  });

  ipcMain.handle('suggestions:dismiss', async (_event, id: string) => {
    SmartSuggestionsEngine.dismiss(id);
    return { success: true };
  });
}
