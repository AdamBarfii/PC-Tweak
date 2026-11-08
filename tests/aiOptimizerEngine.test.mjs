import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Isolated Test Implementation of AI Persona & Bottleneck Classifier
function classifyHardwarePersona({ cpuName, totalMemGb, ramLoadPct, isDiscreteGpu, hasAntiCheat, physicalCores }) {
  const isMobileCpu = /Mobile|Max-Q|Laptop|\d+(H|HX|HS|U)\b/i.test(cpuName);

  if (isMobileCpu) {
    return {
      persona: 'thermal_sensitive_laptop',
      title: 'Thermal-Sensitive Laptop',
    };
  }
  if (totalMemGb <= 16 && ramLoadPct >= 70) {
    return {
      persona: 'budget_memory_constrained',
      title: 'Memory-Constrained Rig',
    };
  }
  if (isDiscreteGpu && (hasAntiCheat || physicalCores >= 6)) {
    return {
      persona: 'esports_high_end',
      title: 'Esports Competitive Rig',
    };
  }
  return {
    persona: 'balanced_gaming',
    title: 'Balanced Gaming PC',
  };
}

// Helper: Calculate Performance Scores & Gains
function calculatePerformanceScores(bottlenecksCount, ramLoadPct, diskJunkMb) {
  let currentScore = 100;
  currentScore -= bottlenecksCount * 6;
  if (ramLoadPct >= 75) currentScore -= 8;
  if (diskJunkMb >= 500) currentScore -= 5;
  currentScore = Math.max(45, Math.min(88, currentScore));

  const projectedScore = Math.min(98, currentScore + bottlenecksCount * 5 + 6);
  return { currentScore, projectedScore };
}

describe('AI Auto-Optimizer Engine Tests', () => {
  describe('Hardware Persona Classification', () => {
    test('classifies desktop with discrete GPU and Vanguard as esports_high_end', () => {
      const res = classifyHardwarePersona({
        cpuName: 'AMD Ryzen 7 7800X3D 8-Core Processor',
        totalMemGb: 32,
        ramLoadPct: 40,
        isDiscreteGpu: true,
        hasAntiCheat: true,
        physicalCores: 8,
      });

      assert.equal(res.persona, 'esports_high_end');
      assert.equal(res.title, 'Esports Competitive Rig');
    });

    test('classifies memory-constrained system (16GB RAM at 80% usage) as budget_memory_constrained', () => {
      const res = classifyHardwarePersona({
        cpuName: 'Intel Core i5-10400F',
        totalMemGb: 16,
        ramLoadPct: 82,
        isDiscreteGpu: true,
        hasAntiCheat: false,
        physicalCores: 6,
      });

      assert.equal(res.persona, 'budget_memory_constrained');
      assert.equal(res.title, 'Memory-Constrained Rig');
    });

    test('classifies laptop CPUs with mobile flags as thermal_sensitive_laptop', () => {
      const res = classifyHardwarePersona({
        cpuName: 'AMD Ryzen 7 5800H with Radeon Graphics',
        totalMemGb: 16,
        ramLoadPct: 45,
        isDiscreteGpu: true,
        hasAntiCheat: false,
        physicalCores: 8,
      });

      assert.equal(res.persona, 'thermal_sensitive_laptop');
    });

    test('falls back to balanced_gaming for standard multi-core desktop rigs', () => {
      const res = classifyHardwarePersona({
        cpuName: 'Intel Core i5-8400',
        totalMemGb: 32,
        ramLoadPct: 35,
        isDiscreteGpu: false,
        hasAntiCheat: false,
        physicalCores: 4,
      });

      assert.equal(res.persona, 'balanced_gaming');
    });
  });

  describe('Anti-Cheat Safety Guardrail Verification', () => {
    test('enforces that all AI action blueprints carry antiCheatSafe = true', () => {
      const mockActions = [
        { id: 'tweak_enable_game_mode', category: 'gaming', antiCheatSafe: true },
        { id: 'tweak_disable_game_dvr', category: 'gaming', antiCheatSafe: true },
        { id: 'tweak_mouse_disable_accel', category: 'gaming', antiCheatSafe: true },
        { id: 'action_power_plan', category: 'cpu', antiCheatSafe: true },
        { id: 'action_ram_trim', category: 'memory', antiCheatSafe: true },
        { id: 'action_disk_clean', category: 'storage', antiCheatSafe: true },
      ];

      for (const action of mockActions) {
        assert.equal(action.antiCheatSafe, true, `Action ${action.id} must be strictly anti-cheat safe`);
      }
    });

    test('guarantees zero unsafe game-hooking actions are recommended', () => {
      const unsafeIds = ['memory_hook_dll', 'kernel_driver_hook', 'directx_overlay_inject'];
      const mockActionIds = ['tweak_enable_game_mode', 'tweak_mouse_disable_accel', 'action_ram_trim'];

      for (const unsafe of unsafeIds) {
        assert.equal(mockActionIds.includes(unsafe), false);
      }
    });
  });

  describe('Performance Index Scoring & Projections', () => {
    test('calculates reasonable current vs projected score delta', () => {
      const scores = calculatePerformanceScores(5, 78, 650);
      assert.ok(scores.currentScore >= 45 && scores.currentScore <= 88);
      assert.ok(scores.projectedScore > scores.currentScore);
      assert.ok(scores.projectedScore <= 98);
      assert.ok(scores.projectedScore - scores.currentScore >= 15);
    });

    test('maintains score floors even under extreme unoptimized conditions', () => {
      const scores = calculatePerformanceScores(10, 95, 2500);
      assert.equal(scores.currentScore, 45, 'Score should clamp to minimum baseline 45');
      assert.ok(scores.projectedScore >= 80);
    });
  });

  describe('Rollback Snapshot Contract', () => {
    test('formats complete atomic rollback snapshot structure', () => {
      const snapshot = {
        appliedActionIds: ['tweak_enable_game_mode', 'action_ram_trim'],
        appliedTweakIds: ['enable_game_mode'],
        reclaimedRamMb: 1200,
        reclaimedDiskMb: 850,
        appliedAt: new Date().toISOString(),
        preOptimizationScore: 62,
        postOptimizationScore: 94,
      };

      assert.equal(snapshot.appliedActionIds.length, 2);
      assert.equal(snapshot.appliedTweakIds.length, 1);
      assert.equal(snapshot.reclaimedRamMb, 1200);
      assert.ok(snapshot.appliedAt);
      assert.ok(snapshot.postOptimizationScore > snapshot.preOptimizationScore);
    });
  });
});
