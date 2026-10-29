import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { AuditTrailEvent } from '../types';

export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Records an immutable audit event for critical emergency and system actions.
   * Saved into `audit_events` collection.
   */
  public async logEvent(event: Omit<AuditTrailEvent, 'eventId' | 'timestamp'> & { eventId?: string; timestamp?: number }): Promise<string> {
    try {
      const eventId = event.eventId || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const timestamp = event.timestamp || Date.now();

      const record: AuditTrailEvent = {
        ...event,
        eventId,
        timestamp,
      };

      // In client or server context, attempt to write directly to Firestore audit_events
      const docRef = await addDoc(collection(db, 'audit_events'), {
        ...record,
        serverCreatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      console.warn('Failed to record audit event in Firestore:', error);
      // Try local recovery log in case of offline/network block
      try {
        const localAuditQueue = JSON.parse(localStorage.getItem('ers_audit_queue') || '[]');
        localAuditQueue.push({ ...event, localTimestamp: Date.now() });
        localStorage.setItem('ers_audit_queue', JSON.stringify(localAuditQueue.slice(-50)));
      } catch (e) {}
      return '';
    }
  }

  /**
   * Fetches audit trail events for a specific emergency incident.
   */
  public async getEmergencyAuditTrail(emergencyId: string): Promise<AuditTrailEvent[]> {
    try {
      const q = query(
        collection(db, 'audit_events'),
        where('emergencyId', '==', emergencyId),
        orderBy('timestamp', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as AuditTrailEvent)
      }));
    } catch (error) {
      console.warn('Error fetching emergency audit trail:', error);
      return [];
    }
  }

  /**
   * Fetches global audit trail events with optional limit.
   */
  public async getGlobalAuditTrail(maxCount: number = 100): Promise<AuditTrailEvent[]> {
    try {
      const q = query(
        collection(db, 'audit_events'),
        orderBy('timestamp', 'desc'),
        limit(maxCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as AuditTrailEvent)
      }));
    } catch (error) {
      console.warn('Error fetching global audit trail:', error);
      return [];
    }
  }
}

export const auditService = AuditService.getInstance();
