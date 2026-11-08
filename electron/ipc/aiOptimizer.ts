import { ipcMain } from 'electron';
import { AiOptimizerEngine } from '../engine/aiOptimizerEngine';

export function registerAiOptimizerIpc(): void {
  ipcMain.handle('aiOptimizer:scanAndPlan', async () => {
    return await AiOptimizerEngine.scanAndGeneratePlan();
  });

  ipcMain.handle(
    'aiOptimizer:execute',
    async (event, payload?: { actionIds?: string[] }) => {
      const actionIds = payload?.actionIds || [];
      return await AiOptimizerEngine.executePlan(actionIds, (step, percent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('aiOptimizer:progress', { step, percent });
        }
      });
    }
  );

  ipcMain.handle('aiOptimizer:undo', async () => {
    return await AiOptimizerEngine.undoAiOptimization();
  });

  ipcMain.handle('aiOptimizer:getSnapshot', async () => {
    return AiOptimizerEngine.getActiveSnapshot();
  });
}
