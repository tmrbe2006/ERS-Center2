import { db } from '../firebase';
import { 
  doc, getDoc, setDoc, updateDoc, collection, getDocs, 
  runTransaction, serverTimestamp, arrayUnion 
} from 'firebase/firestore';
import { 
  User, UserRole, Emergency, EmergencyStatus, 
  EmergencyAcknowledgment, AcknowledgmentStage 
} from '../types';
import { auditService } from './auditService';
import { recordAlertAcknowledgment } from './deviceService';

export class EmergencyWorkflowService {
  private static instance: EmergencyWorkflowService;

  private constructor() {}

  public static getInstance(): EmergencyWorkflowService {
    if (!EmergencyWorkflowService.instance) {
      EmergencyWorkflowService.instance = new EmergencyWorkflowService();
    }
    return EmergencyWorkflowService.instance;
  }

  /**
   * 2.3 Explicit Idempotent Acknowledgment
   * Creates/updates subcollection `emergencies/{emergencyId}/acknowledgments/{userId}`
   * Stops escalation if this is the first acknowledgment on the emergency.
   */
  public async acknowledgeEmergency(
    emergencyId: string,
    user: User,
    notes?: string,
    coords?: { lat: number; lng: number; accuracy?: number }
  ): Promise<{ success: boolean; stage: AcknowledgmentStage; message?: string }> {
    if (!emergencyId || !user?.id) return { success: false, stage: 'CREATED', message: 'بيانات غير صالحة' };

    const ackDocRef = doc(db, 'emergencies', emergencyId, 'acknowledgments', user.id);
    const emergencyDocRef = doc(db, 'emergencies', emergencyId);

    const now = Date.now();

    try {
      await runTransaction(db, async (transaction) => {
        const emergencySnap = await transaction.get(emergencyDocRef);
        if (!emergencySnap.exists()) {
          throw new Error('البلاغ غير موجود');
        }

        const emergencyData = emergencySnap.data() as Emergency;
        const ackSnap = await transaction.get(ackDocRef);

        let ackData: EmergencyAcknowledgment;

        if (ackSnap.exists()) {
          ackData = ackSnap.data() as EmergencyAcknowledgment;
          // Idempotent: Keep previous stage if already past ACKNOWLEDGED
          if (ackData.stage === 'CREATED' || ackData.stage === 'DISPATCHED' || !ackData.acknowledgedAt) {
            ackData.stage = 'ACKNOWLEDGED';
            ackData.acknowledgedAt = ackData.acknowledgedAt || now;
          }
          if (notes) ackData.notes = notes;
          if (coords) ackData.coords = coords;
          ackData.updatedAt = now;
        } else {
          ackData = {
            userId: user.id,
            userName: user.name || user.username,
            userRole: user.role,
            emergencyId,
            stage: 'ACKNOWLEDGED',
            dispatchedAt: emergencyData.dispatchedAt || emergencyData.createdAt,
            acknowledgedAt: now,
            notes: notes || '',
            coords: coords,
            updatedAt: now
          };
        }

        transaction.set(ackDocRef, ackData, { merge: true });

        // If emergency does not have firstAcknowledgedAt, record it to halt escalation
        if (!emergencyData.firstAcknowledgedAt) {
          transaction.update(emergencyDocRef, {
            firstAcknowledgedAt: now,
            escalationStatus: 'acknowledged',
            lastEscalationHaltedAt: now
          });
        }
      });

      // Update local device record
      const instId = localStorage.getItem('ers_registered_inst_id');
      if (instId) {
        recordAlertAcknowledgment(user.id, instId);
      }

      // Log immutable audit event
      await auditService.logEvent({
        eventType: 'ACKNOWLEDGED',
        emergencyId,
        actorUserId: user.id,
        actorName: user.name || user.username,
        actorRole: user.role,
        actionDetails: `المستجيب ${user.name || user.username} أكّد استلام الإنذار صراحةً`,
        source: 'web'
      });

      return { success: true, stage: 'ACKNOWLEDGED' };
    } catch (err: any) {
      console.error('Error during acknowledgment transaction:', err);
      return { success: false, stage: 'CREATED', message: err.message };
    }
  }

  /**
   * Transition to RESPONDING stage
   */
  public async startResponding(
    emergencyId: string,
    user: User,
    actionNotes: string,
    coords?: { lat: number; lng: number; accuracy?: number }
  ): Promise<{ success: boolean; message?: string }> {
    if (!emergencyId || !user?.id) return { success: false, message: 'بيانات غير صالحة' };

    const ackDocRef = doc(db, 'emergencies', emergencyId, 'acknowledgments', user.id);
    const emergencyDocRef = doc(db, 'emergencies', emergencyId);
    const now = Date.now();

    try {
      await runTransaction(db, async (transaction) => {
        const emergencySnap = await transaction.get(emergencyDocRef);
        if (!emergencySnap.exists()) throw new Error('البلاغ غير موجود');
        const emergencyData = emergencySnap.data() as Emergency;

        const ackSnap = await transaction.get(ackDocRef);
        const prevAck = ackSnap.exists() ? (ackSnap.data() as EmergencyAcknowledgment) : null;

        const updatedAck: Partial<EmergencyAcknowledgment> = {
          userId: user.id,
          userName: user.name || user.username,
          userRole: user.role,
          emergencyId,
          stage: 'RESPONDING',
          responseStartedAt: prevAck?.responseStartedAt || now,
          acknowledgedAt: prevAck?.acknowledgedAt || now,
          actionsTaken: actionNotes,
          coords: coords || prevAck?.coords,
          updatedAt: now
        };

        transaction.set(ackDocRef, updatedAck, { merge: true });

        const updateEmergency: any = {
          responders: arrayUnion(user.name || user.username),
          [`responderActions.${(user.name || user.username).replace(/\./g, '_')}`]: actionNotes
        };
        if (!emergencyData.firstResponseAt) {
          updateEmergency.firstResponseAt = now;
        }
        transaction.update(emergencyDocRef, updateEmergency);
      });

      await auditService.logEvent({
        eventType: 'RESPONSE_STARTED',
        emergencyId,
        actorUserId: user.id,
        actorName: user.name || user.username,
        actorRole: user.role,
        actionDetails: `بدء الاستجابة الميدانية وتطبيق الإجراءات: "${actionNotes}"`,
        source: 'web'
      });

      return { success: true };
    } catch (err: any) {
      console.error('Error starting response:', err);
      return { success: false, message: err.message };
    }
  }

  /**
   * Mark arrival on scene (ON_SCENE)
   */
  public async markOnScene(
    emergencyId: string,
    user: User,
    coords?: { lat: number; lng: number; accuracy?: number }
  ): Promise<{ success: boolean; message?: string }> {
    if (!emergencyId || !user?.id) return { success: false };

    const ackDocRef = doc(db, 'emergencies', emergencyId, 'acknowledgments', user.id);
    const emergencyDocRef = doc(db, 'emergencies', emergencyId);
    const now = Date.now();

    try {
      await runTransaction(db, async (transaction) => {
        const emergencySnap = await transaction.get(emergencyDocRef);
        if (!emergencySnap.exists()) throw new Error('البلاغ غير موجود');
        const emergencyData = emergencySnap.data() as Emergency;

        const ackSnap = await transaction.get(ackDocRef);
        const prevAck = ackSnap.exists() ? (ackSnap.data() as EmergencyAcknowledgment) : null;

        const updatedAck: Partial<EmergencyAcknowledgment> = {
          userId: user.id,
          userName: user.name || user.username,
          userRole: user.role,
          emergencyId,
          stage: 'ON_SCENE',
          arrivedAt: prevAck?.arrivedAt || now,
          coords: coords || prevAck?.coords,
          updatedAt: now
        };

        transaction.set(ackDocRef, updatedAck, { merge: true });

        const updateEmergency: any = {
          verifiedResponders: arrayUnion(user.name || user.username)
        };
        if (!emergencyData.firstArrivalAt) {
          updateEmergency.firstArrivalAt = now;
        }
        transaction.update(emergencyDocRef, updateEmergency);
      });

      await auditService.logEvent({
        eventType: 'ON_SCENE',
        emergencyId,
        actorUserId: user.id,
        actorName: user.name || user.username,
        actorRole: user.role,
        actionDetails: `تم تأكيد الوصول الميداني إلى موقع الحادث`,
        source: 'web'
      });

      return { success: true };
    } catch (err: any) {
      console.error('Error marking arrival on scene:', err);
      return { success: false, message: err.message };
    }
  }

  /**
   * 3.2 Authorized Emergency Closure
   * Enforces rules:
   * 1. Only the creator is authorized to close, OR an Admin/Super Admin with documented override reason.
   * 2. Atomic transaction prevents double-closure.
   * 3. Full server audit logging.
   */
  public async closeEmergencySecure(
    emergencyId: string,
    user: User,
    closureReason: string = 'تمت السيطرة وإنهاء الموقف الميداني',
    overrideReason?: string
  ): Promise<{ success: boolean; message?: string }> {
    if (!emergencyId || !user?.id) return { success: false, message: 'معرّف غير صالح' };

    const emergencyDocRef = doc(db, 'emergencies', emergencyId);
    const now = Date.now();
    let isOverride = false;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(emergencyDocRef);
        if (!snap.exists()) throw new Error('البلاغ غير موجود');

        const emergency = snap.data() as Emergency;

        // Double closure prevention
        if (emergency.status === EmergencyStatus.CLOSED) {
          throw new Error('البلاغ مغلق مسبقاً ولا يمكن إغلاقه مرة أخرى');
        }

        // Authorization check
        const isCreator = emergency.createdBy === user.id;
        const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

        if (!isCreator && !isAdmin) {
          throw new Error('غير مصرح لك بإغلاق هذا البلاغ. الإغلاق مخصص لمنشئ البلاغ أو للمسؤول الإداري فقط.');
        }

        if (!isCreator && isAdmin) {
          isOverride = true;
          if (!overrideReason || !overrideReason.trim()) {
            throw new Error('يتطلب إغلاق البلاغ بصلاحية التجاوز الإداري تدوين سبب التجاوز بشكل إلزامي.');
          }
        }

        const updateData: any = {
          status: EmergencyStatus.CLOSED,
          closedAt: now,
          closedBy: user.id,
          closedByName: user.name || user.username,
          closureReason: closureReason.trim(),
          updatedAt: now
        };

        if (isOverride) {
          updateData.overrideAuthorizedBy = `${user.name || user.username} (${user.role}): ${overrideReason}`;
        }

        transaction.update(emergencyDocRef, updateData);
      });

      // Immutable Audit Log
      await auditService.logEvent({
        eventType: isOverride ? 'OVERRIDE_CLOSED' : 'CLOSED',
        emergencyId,
        actorUserId: user.id,
        actorName: user.name || user.username,
        actorRole: user.role,
        actionDetails: isOverride 
          ? `إغلاق بتجاوز إداري معتمد: ${overrideReason}. سبب الإغلاق: ${closureReason}`
          : `إغلاق نظامي بواسطة منشئ البلاغ: ${closureReason}`,
        source: 'web'
      });

      return { success: true };
    } catch (err: any) {
      console.error('Error closing emergency:', err);
      return { success: false, message: err.message };
    }
  }

  /**
   * Fetch all acknowledgments for an emergency
   */
  public async getAcknowledgments(emergencyId: string): Promise<EmergencyAcknowledgment[]> {
    try {
      const snap = await getDocs(collection(db, 'emergencies', emergencyId, 'acknowledgments'));
      return snap.docs.map(d => d.data() as EmergencyAcknowledgment);
    } catch (e) {
      return [];
    }
  }
}

export const emergencyWorkflowService = EmergencyWorkflowService.getInstance();
