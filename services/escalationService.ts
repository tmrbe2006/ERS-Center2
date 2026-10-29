import { db } from '../firebase';
import { 
  doc, getDoc, setDoc, updateDoc, collection, query, 
  where, getDocs, runTransaction 
} from 'firebase/firestore';
import { EscalationConfig, Emergency, EmergencyStatus } from '../types';
import { auditService } from './auditService';

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  level1Seconds: 30,  // Level 1: Follow-up alert after 30s
  level2Seconds: 60,  // Level 2: Escalate to Supervisor after 60s
  level3Seconds: 120, // Level 3: Escalate to Duty Manager after 120s
  level4Seconds: 180, // Level 4: Escalate to Chief Emergency Officer after 180s
  autoEscalate: true
};

export class EscalationService {
  private static instance: EscalationService;
  private cachedConfig: EscalationConfig = DEFAULT_ESCALATION_CONFIG;
  private isChecking = false;

  private constructor() {
    this.loadConfig();
  }

  public static getInstance(): EscalationService {
    if (!EscalationService.instance) {
      EscalationService.instance = new EscalationService();
    }
    return EscalationService.instance;
  }

  public async loadConfig(): Promise<EscalationConfig> {
    try {
      const snap = await getDoc(doc(db, 'system', 'escalation_config'));
      if (snap.exists()) {
        this.cachedConfig = { ...DEFAULT_ESCALATION_CONFIG, ...(snap.data() as EscalationConfig) };
      }
    } catch (e) {
      this.cachedConfig = DEFAULT_ESCALATION_CONFIG;
    }
    return this.cachedConfig;
  }

  public async updateConfig(newConfig: Partial<EscalationConfig>): Promise<void> {
    const updated = { ...this.cachedConfig, ...newConfig, updatedAt: Date.now() };
    await setDoc(doc(db, 'system', 'escalation_config'), updated, { merge: true });
    this.cachedConfig = updated;

    await auditService.logEvent({
      eventType: 'CONFIG_MODIFIED',
      actorUserId: 'admin',
      actorRole: 'admin',
      actionDetails: `تم تحديث قواعد محرك التصعيد التلقائي: L1=${updated.level1Seconds}s, L2=${updated.level2Seconds}s, L3=${updated.level3Seconds}s, L4=${updated.level4Seconds}s`,
      source: 'web'
    });
  }

  public getConfig(): EscalationConfig {
    return this.cachedConfig;
  }

  /**
   * Evaluates active emergencies and executes atomic escalation if acknowledgment thresholds are breached.
   * Safe against race conditions and concurrent workers.
   */
  public async checkAndEscalateEmergencies(): Promise<{ escalatedCount: number }> {
    if (this.isChecking) return { escalatedCount: 0 };
    this.isChecking = true;

    let escalatedCount = 0;
    try {
      const cfg = this.cachedConfig.autoEscalate ? this.cachedConfig : await this.loadConfig();
      if (!cfg.autoEscalate) {
        this.isChecking = false;
        return { escalatedCount: 0 };
      }

      // Query active, non-drill emergencies
      const q = query(collection(db, 'emergencies'), where('status', '==', EmergencyStatus.ACTIVE));
      const snapshot = await getDocs(q);

      const now = Date.now();

      for (const emergencyDoc of snapshot.docs) {
        const emergency = { id: emergencyDoc.id, ...emergencyDoc.data() } as Emergency;

        // Skip drills from automatic production escalation blasts
        if (emergency.isDrill) continue;

        // If emergency is already acknowledged by at least one responder, halt non-ack escalation
        if (emergency.firstAcknowledgedAt || (emergency.responders && emergency.responders.length > 0)) {
          continue;
        }

        const elapsedSeconds = Math.floor((now - emergency.createdAt) / 1000);
        const currentLevel = emergency.escalationLevel || 0;

        let targetLevel = currentLevel;
        let reason = '';
        let targetRoles: string[] = [];

        if (elapsedSeconds >= cfg.level4Seconds && currentLevel < 4) {
          targetLevel = 4;
          reason = `مرور ${elapsedSeconds} ثانية دون أي تأكيد استلام - تصعيد للمسؤول الأعلى للطوارئ`;
          targetRoles = ['super-admin', 'emergency-director'];
        } else if (elapsedSeconds >= cfg.level3Seconds && currentLevel < 3) {
          targetLevel = 3;
          reason = `مرور ${elapsedSeconds} ثانية دون أي تأكيد استلام - تصعيد إلى مدير الطوارئ المناوب`;
          targetRoles = ['admin', 'duty-manager'];
        } else if (elapsedSeconds >= cfg.level2Seconds && currentLevel < 2) {
          targetLevel = 2;
          reason = `مرور ${elapsedSeconds} ثانية دون أي تأكيد استلام - تصعيد إلى المشرف الميداني`;
          targetRoles = ['supervisor', 'team-lead'];
        } else if (elapsedSeconds >= cfg.level1Seconds && currentLevel < 1) {
          targetLevel = 1;
          reason = `مرور ${elapsedSeconds} ثانية دون تأكيد - تنبيه متابعة تكتيكي عاجل لفرق التدخل`;
          targetRoles = ['responder'];
        }

        if (targetLevel > currentLevel) {
          // Concurrency-safe atomic transaction
          const docRef = doc(db, 'emergencies', emergency.id);
          let success = false;

          await runTransaction(db, async (txn) => {
            const freshSnap = await txn.get(docRef);
            if (!freshSnap.exists()) return;
            const freshData = freshSnap.data() as Emergency;

            // Check again inside transaction: Has it been closed or acknowledged in the meantime?
            if (freshData.status === EmergencyStatus.CLOSED || freshData.firstAcknowledgedAt) {
              return;
            }

            if ((freshData.escalationLevel || 0) < targetLevel) {
              txn.update(docRef, {
                escalated: true,
                escalationLevel: targetLevel,
                escalationStatus: 'escalated',
                lastEscalationAt: now,
                escalatedTo: targetRoles,
                escalationReason: reason,
                nextEscalationAt: targetLevel < 4 ? now + (cfg.level2Seconds * 1000) : null
              });
              success = true;
            }
          });

          if (success) {
            escalatedCount++;
            await auditService.logEvent({
              eventType: 'ESCALATED',
              emergencyId: emergency.id,
              actorUserId: 'system-escalation-engine',
              actorName: 'محرك التصعيد التلقائي',
              actorRole: 'system',
              actionDetails: `تم رفع مستوى تصعيد البلاغ (${emergency.typeName}) إلى المستوى ${targetLevel}: ${reason}`,
              source: 'server'
            });
          }
        }
      }
    } catch (err) {
      console.warn('Escalation engine tick error:', err);
    } finally {
      this.isChecking = false;
    }

    return { escalatedCount };
  }
}

export const escalationService = EscalationService.getInstance();
