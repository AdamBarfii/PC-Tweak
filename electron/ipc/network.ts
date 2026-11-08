import { ipcMain } from 'electron';
import { NetworkEngine } from '../engine/networkEngine';
import {
  NetworkTestEngine,
  NetworkTestTarget,
  NetworkSample,
  NetworkTestSummary,
  BaselineReport,
} from '../engine/networkTestEngine';
import { DnsEngine, CurrentDnsInfo, DnsBenchmarkResult } from '../engine/dnsEngine';
import { DnsStore, DnsPreset } from '../storage/dnsStore';
import { AdapterTweaksEngine } from '../engine/adapterTweaksEngine';
import { NetworkRepairEngine } from '../engine/networkRepairEngine';
import { AdvancedNetworkEngine } from '../engine/advancedNetworkEngine';
import { AutoRevertWatchdog } from '../engine/autoRevertWatchdog';

export function registerNetworkIpc() {
  ipcMain.handle('network:getOverview', async () => {
    return await NetworkEngine.getOverview();
  });

  ipcMain.handle('network:undoAll', async (_event, adapterName?: string) => {
    return await NetworkEngine.undoAll(adapterName);
  });

  // ----------------------------------------------------
  // DNS Engine Handlers
  // ----------------------------------------------------
  ipcMain.handle('network:getCurrentDns', async (_event, adapterName: string) => {
    return await DnsEngine.getCurrentDns(adapterName);
  });

  ipcMain.handle('network:listDnsPresets', async () => {
    return DnsStore.listPresets();
  });

  ipcMain.handle(
    'network:saveDnsPreset',
    async (
      _event,
      payload: { id?: string; preset: Omit<DnsPreset, 'id' | 'isDefault'> }
    ) => {
      if (payload.id) {
        return DnsStore.updatePreset(payload.id, payload.preset);
      }
      return DnsStore.addPreset(payload.preset);
    }
  );

  ipcMain.handle('network:deleteDnsPreset', async (_event, id: string) => {
    return DnsStore.deletePreset(id);
  });

  ipcMain.handle(
    'network:applyDns',
    async (
      _event,
      payload: { adapterName: string; preset: DnsPreset; enableDoh?: boolean }
    ) => {
      const res = await DnsEngine.applyPreset(payload.adapterName, payload.preset, payload.enableDoh);
      if (res.success && res.requiresAutoRevert) {
        AutoRevertWatchdog.arm({
          tweakName: `DNS: ${payload.preset.name}`,
          adapterName: payload.adapterName,
          category: 'dns',
        });
      }
      return res;
    }
  );

  ipcMain.handle('network:resetDnsToDhcp', async (_event, adapterName: string) => {
    return await DnsEngine.resetDnsToDhcp(adapterName);
  });

  ipcMain.handle('network:revertDns', async (_event, adapterName: string) => {
    return await DnsEngine.revertDns(adapterName);
  });

  ipcMain.handle('network:flushDnsCache', async () => {
    return await DnsEngine.flushDnsCache();
  });

  ipcMain.handle(
    'network:benchmarkDns',
    async (
      _event,
      payload: {
        servers: { id: string; name: string; ip: string }[];
        domains?: string[];
      }
    ) => {
      return await DnsEngine.benchmarkDns(payload.servers, payload.domains);
    }
  );

  // ----------------------------------------------------
  // Adapter Tweaks & Wi-Fi Handlers
  // ----------------------------------------------------
  ipcMain.handle('network:getAdapterDetails', async (_event, adapterName: string) => {
    return await AdapterTweaksEngine.getAdapterDetails(adapterName);
  });

  ipcMain.handle('network:getWifiDetails', async () => {
    return await AdapterTweaksEngine.getWifiDetails();
  });

  ipcMain.handle(
    'network:applyAdapterTweak',
    async (
      _event,
      payload: { adapterName: string; tweakId: string; value?: any }
    ) => {
      const res = await AdapterTweaksEngine.applyTweak(
        payload.adapterName,
        payload.tweakId,
        payload.value
      );
      if (res.success && res.requiresAutoRevert) {
        AutoRevertWatchdog.arm({
          tweakName: payload.tweakId,
          adapterName: payload.adapterName,
          tweakId: payload.tweakId,
          category: 'adapter',
        });
      }
      return res;
    }
  );

  ipcMain.handle(
    'network:revertAdapterTweak',
    async (_event, payload: { adapterName: string; tweakId: string }) => {
      return await AdapterTweaksEngine.revertTweak(payload.adapterName, payload.tweakId);
    }
  );

  // ----------------------------------------------------
  // Latency & Benchmark Test Handlers
  // ----------------------------------------------------
  ipcMain.handle(
    'network:startTest',
    async (event, payload: { targets: NetworkTestTarget[]; durationSeconds: number }) => {
      const { targets, durationSeconds } = payload;
      const onSample = (sample: NetworkSample) => {
        try {
          event.sender.send('network:testSample', sample);
        } catch {}
      };

      return await NetworkTestEngine.startTest(targets, durationSeconds, onSample);
    }
  );

  ipcMain.handle('network:stopTest', async () => {
    NetworkTestEngine.stopTest();
    return { success: true };
  });

  ipcMain.handle('network:runBaseline', async (_event, target: NetworkTestTarget) => {
    return await NetworkTestEngine.runBaseline(target);
  });

  ipcMain.handle(
    'network:compareDelta',
    async (_event, payload: { summary: NetworkTestSummary; baseline: BaselineReport }) => {
      return NetworkTestEngine.compareDelta(payload.summary, payload.baseline);
    }
  );

  // ----------------------------------------------------
  // Network Repair & Safety Tools Handlers
  // ----------------------------------------------------
  ipcMain.handle(
    'network:executeRepair',
    async (_event, payload: { actionId: string; adapterName?: string }) => {
      switch (payload.actionId) {
        case 'flush_dns':
          return await NetworkRepairEngine.flushDns();
        case 'renew_ip':
          return await NetworkRepairEngine.renewIp(payload.adapterName || 'Ethernet');
        case 'reset_winsock':
          return await NetworkRepairEngine.resetWinsock();
        case 'reset_tcpip':
          return await NetworkRepairEngine.resetTcpIp();
        case 'restart_adapter':
          return await NetworkRepairEngine.restartAdapter(payload.adapterName || 'Ethernet');
        case 'reset_firewall':
          return await NetworkRepairEngine.resetFirewall();
        default:
          return { success: false, message: `Unknown repair action: ${payload.actionId}` };
      }
    }
  );

  ipcMain.handle('network:resetAllDefaults', async (_event, adapterName?: string) => {
    return await NetworkRepairEngine.resetAllNetworkDefaults(adapterName);
  });

  ipcMain.handle('network:openRecoveryFolder', async () => {
    return await NetworkRepairEngine.openNetworkRecoveryFolder();
  });

  // ----------------------------------------------------
  // Advanced & Experimental Tweaks Handlers
  // ----------------------------------------------------
  ipcMain.handle('network:getAdvancedState', async (_event, adapterName: string) => {
    return await AdvancedNetworkEngine.getAdvancedState(adapterName);
  });

  ipcMain.handle(
    'network:applyAdvancedTweak',
    async (
      _event,
      payload: { adapterName: string; tweakId: string; value?: any }
    ) => {
      const res = await AdvancedNetworkEngine.applyTweak(
        payload.adapterName,
        payload.tweakId,
        payload.value
      );
      if (res.success && res.requiresAutoRevert) {
        AutoRevertWatchdog.arm({
          tweakName: payload.tweakId,
          adapterName: payload.adapterName,
          tweakId: payload.tweakId,
          category: 'advanced',
        });
      }
      return res;
    }
  );

  ipcMain.handle('network:confirmChanges', async () => {
    return AutoRevertWatchdog.confirm();
  });

  ipcMain.handle('network:getWatchdogState', async () => {
    return AutoRevertWatchdog.getState();
  });

  ipcMain.handle(
    'network:revertAdvancedTweak',
    async (_event, payload: { adapterName: string; tweakId: string }) => {
      return await AdvancedNetworkEngine.revertTweak(payload.adapterName, payload.tweakId);
    }
  );

  ipcMain.handle('network:detectOptimalMtu', async (_event, targetHost?: string) => {
    return await AdvancedNetworkEngine.detectOptimalMtu(targetHost);
  });

  ipcMain.handle(
    'network:setMtu',
    async (_event, payload: { adapterName: string; mtu: number }) => {
      return await AdvancedNetworkEngine.setMtu(payload.adapterName, payload.mtu);
    }
  );

  // ----------------------------------------------------
  // Gaming Server Radar & Benchmark Handlers
  // ----------------------------------------------------
  ipcMain.handle('network:getGameServers', async () => {
    return NetworkTestEngine.getGameServers();
  });

  ipcMain.handle('network:benchmarkGameServers', async (event, gameIdFilter?: string) => {
    return await NetworkTestEngine.benchmarkGameServers(gameIdFilter, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('network:gameServerBenchmarkProgress', progress);
      }
    });
  });

  ipcMain.handle(
    'network:monitorGameServer',
    async (event, payload: { serverId: string; durationSeconds?: number }) => {
      return await NetworkTestEngine.monitorGameServer(
        payload.serverId,
        payload.durationSeconds || 10,
        (sample) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('network:gameServerMonitorSample', sample);
          }
        }
      );
    }
  );

  ipcMain.handle(
    'network:optimizeGameRoute',
    async (
      _event,
      payload: { gameId: string; serverId: string; adapterName?: string }
    ) => {
      const adapterName = payload.adapterName || 'Ethernet';
      const servers = NetworkTestEngine.getGameServers();
      const server = servers.find((s) => s.id === payload.serverId);
      const appliedTweaks: string[] = [];

      try {
        // 1. Apply TCP NoDelay & ACK Frequency
        await AdvancedNetworkEngine.applyTweak(adapterName, 'tcp_ack_frequency', 1);
        appliedTweaks.push('TCP ACK Frequency (1:1 Immediate)');

        await AdvancedNetworkEngine.applyTweak(adapterName, 'tcp_nodelay', 1);
        appliedTweaks.push('TCP NoDelay (Nagle Algorithm Disabled)');

        await AdvancedNetworkEngine.applyTweak(adapterName, 'network_throttling_index', -1);
        appliedTweaks.push('Network Throttling Disabled');

        // 2. Set Optimal MTU if recommended
        if (server && server.recommendedMtu) {
          await AdvancedNetworkEngine.setMtu(adapterName, server.recommendedMtu);
          appliedTweaks.push(`MTU set to ${server.recommendedMtu}`);
        }

        // 3. Apply Cloudflare Gaming DNS (1.1.1.1 / 1.0.0.1)
        const cfPreset = {
          id: 'cloudflare',
          name: 'Cloudflare Gaming DNS',
          primary: '1.1.1.1',
          secondary: '1.0.0.1',
          description: 'Lowest ping authoritative gaming resolver',
        };
        await DnsEngine.applyPreset(adapterName, cfPreset as any, false);
        appliedTweaks.push('Cloudflare Low-Latency DNS (1.1.1.1)');

        return {
          success: true,
          message: `Optimized route for ${server ? server.game : payload.gameId}: applied competitive low-latency optimizations.`,
          appliedTweaks,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Failed to optimize game route: ${err.message}`,
          appliedTweaks,
        };
      }
    }
  );
}
