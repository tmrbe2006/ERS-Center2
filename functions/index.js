const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Phase 2.2: Triggered on Firestore when a new emergency is reported.
 * Sends native FCM push notifications to registered responder & admin devices.
 * Respects drill mode isolation (Phase 4.3).
 */
exports.sendEmergencyNotification = functions.firestore
  .document('emergencies/{emergencyId}')
  .onCreate(async (snap, context) => {
    const emergencyId = context.params.emergencyId;
    const emergency = snap.data();

    if (!emergency) {
      console.warn(`Emergency ${emergencyId} data is empty.`);
      return null;
    }

    // Phase 4.3 Isolation: Do NOT send broadcast push notifications for training simulation drills
    if (emergency.isDrill) {
      console.log(`Simulation drill ${emergencyId} detected. Real emergency push blast suppressed.`);
      await db.collection('audit_events').add({
        eventId: `audit_${Date.now()}_drill_start`,
        eventType: 'SIMULATION_STARTED',
        emergencyId,
        actorUserId: emergency.createdBy || 'system',
        actorRole: 'admin',
        timestamp: Date.now(),
        actionDetails: `بدء محاكاة تدريبية معزولة: ${emergency.typeName} في ${emergency.locationName}`,
        source: 'server'
      });
      return null;
    }

    // Deduplication check: verify if alert dispatch already recorded
    const dispatchLogRef = db.collection('notification_dispatch_logs').doc(emergencyId);
    const existingLog = await dispatchLogRef.get();
    if (existingLog.exists) {
      console.log(`Alert already dispatched for emergency: ${emergencyId}`);
      return null;
    }

    try {
      // 1. Query active registered devices for responders and admins
      const allowedRoles = ['responder', 'admin', 'super-admin'];
      const devicesSnapshot = await db.collection('user_devices')
        .where('isActive', '==', true)
        .where('notificationsEnabled', '==', true)
        .get();

      if (devicesSnapshot.empty) {
        console.log('No active devices registered for notification.');
        await dispatchLogRef.set({
          emergencyId,
          timestamp: Date.now(),
          totalRecipients: 0,
          successCount: 0,
          failureCount: 0,
          status: 'no_active_devices'
        });
        return null;
      }

      // Filter by role and collect valid tokens
      const eligibleTokens = [];
      const tokenToDocMap = new Map();

      devicesSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (allowedRoles.includes(data.userRole) && data.fcmToken) {
          eligibleTokens.push(data.fcmToken);
          tokenToDocMap.set(data.fcmToken, docSnap.ref);
        }
      });

      if (eligibleTokens.length === 0) {
        console.log('No eligible tokens found for roles:', allowedRoles);
        return null;
      }

      // Deduplicate tokens
      const uniqueTokens = Array.from(new Set(eligibleTokens));

      // 2. Prepare FCM payload with notification + high priority data
      const payload = {
        tokens: uniqueTokens,
        notification: {
          title: `🚨 إنذار طوارئ: ${emergency.typeName || 'حالة طارئة'}`,
          body: `الموقع: ${emergency.locationName || 'غير محدد'}. اضغط للاستجابة الفورية.`
        },
        data: {
          emergencyId: String(emergencyId),
          alertId: `${emergencyId}_${emergency.createdAt || Date.now()}`,
          typeName: String(emergency.typeName || 'طوارئ'),
          locationName: String(emergency.locationName || ''),
          locationId: String(emergency.locationId || ''),
          severity: String(emergency.severity || 'High'),
          url: `/#/alarm/${emergencyId}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
          ttl: 14400, // 4 hours in seconds
          notification: {
            channelId: 'ers_emergency_channel',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: 'public',
            icon: 'ic_stat_emergency'
          }
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true
            }
          }
        }
      };

      // 3. Send Multicast via Firebase Admin SDK
      const response = await admin.messaging().sendEachForMulticast(payload);
      console.log(`FCM Multicast accepted: ${response.successCount} success, ${response.failureCount} failure.`);

      // 4. Handle expired/invalid tokens and record delivery successes
      const cleanupPromises = [];
      response.responses.forEach((res, idx) => {
        const badToken = uniqueTokens[idx];
        const docRef = tokenToDocMap.get(badToken);

        if (res.success && docRef) {
          cleanupPromises.push(
            docRef.update({
              lastSuccessfulDeliveryAt: Date.now(),
              updatedAt: Date.now()
            })
          );
        } else if (!res.success && res.error) {
          const errCode = res.error.code;
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            console.log(`Deactivating obsolete FCM token: ${badToken}`);
            if (docRef) {
              cleanupPromises.push(
                docRef.update({
                  isActive: false,
                  fcmToken: '',
                  deactivatedReason: errCode,
                  updatedAt: Date.now()
                })
              );
            }
          }
        }
      });

      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
      }

      const now = Date.now();

      // 5. Update emergency record with dispatchedAt timestamp
      await snap.ref.update({
        dispatchedAt: now
      });

      // 6. Log immutable audit trail event (Phase 3.4)
      await db.collection('audit_events').add({
        eventId: `audit_${now}_dispatch`,
        eventType: 'DISPATCH_SENT',
        emergencyId,
        actorUserId: emergency.createdBy || 'system',
        actorRole: 'system',
        timestamp: now,
        actionDetails: `تم تعميم الإنذار وقبوله في FCM لـ ${response.successCount} جهاز بنجاح`,
        source: 'server'
      });

      // 7. Log dispatch results
      await dispatchLogRef.set({
        emergencyId,
        alertId: `${emergencyId}_${emergency.createdAt || Date.now()}`,
        timestamp: now,
        totalRecipients: uniqueTokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        acceptedByFCM: true,
        status: response.successCount > 0 ? 'sent' : 'failed'
      });

      return { success: true, count: response.successCount };
    } catch (error) {
      console.error('Fatal error during FCM dispatch:', error);
      await dispatchLogRef.set({
        emergencyId,
        timestamp: Date.now(),
        status: 'error',
        error: error.message
      });
      throw error;
    }
  });

/**
 * Phase 2.4: Scheduled Escalation Engine
 * Runs periodically to escalate unacknowledged active emergencies.
 */
exports.checkEmergencyEscalation = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = Date.now();
    const configSnap = await db.collection('system').doc('escalation_config').get();
    const config = configSnap.exists ? configSnap.data() : {
      level1Seconds: 30,
      level2Seconds: 60,
      level3Seconds: 120,
      level4Seconds: 180,
      autoEscalate: true
    };

    if (!config.autoEscalate) return null;

    const emergenciesSnap = await db.collection('emergencies')
      .where('status', '==', 'active')
      .get();

    for (const doc of emergenciesSnap.docs) {
      const em = doc.data();
      if (em.isDrill || em.firstAcknowledgedAt) continue;

      const elapsed = Math.floor((now - em.createdAt) / 1000);
      const curLvl = em.escalationLevel || 0;
      let targetLvl = curLvl;
      let reason = '';

      if (elapsed >= config.level4Seconds && curLvl < 4) {
        targetLvl = 4;
        reason = `مرور ${elapsed}s دون تأكيد - تصعيد للمسؤول الأعلى`;
      } else if (elapsed >= config.level3Seconds && curLvl < 3) {
        targetLvl = 3;
        reason = `مرور ${elapsed}s دون تأكيد - تصعيد لمدير الطوارئ المناوب`;
      } else if (elapsed >= config.level2Seconds && curLvl < 2) {
        targetLvl = 2;
        reason = `مرور ${elapsed}s دون تأكيد - تصعيد للمشرف الميداني`;
      } else if (elapsed >= config.level1Seconds && curLvl < 1) {
        targetLvl = 1;
        reason = `مرور ${elapsed}s دون تأكيد - تنبيه متابعة تكتيكي`;
      }

      if (targetLvl > curLvl) {
        await doc.ref.update({
          escalated: true,
          escalationLevel: targetLvl,
          escalationStatus: 'escalated',
          lastEscalationAt: now,
          escalationReason: reason
        });

        await db.collection('audit_events').add({
          eventId: `audit_${now}_esc_${targetLvl}`,
          eventType: 'ESCALATED',
          emergencyId: doc.id,
          actorUserId: 'escalation-engine',
          actorRole: 'system',
          timestamp: now,
          actionDetails: reason,
          source: 'server'
        });
      }
    }
    return null;
  });

/**
 * Callable function to test sending an FCM push notification directly to a specific device.
 * Used by Mobile Diagnostics screen to verify push functionality.
 */
exports.sendTestPushToDevice = functions.https.onCall(async (data, context) => {
  const { targetToken, userId } = data;
  if (!targetToken) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing targetToken');
  }

  const message = {
    token: targetToken,
    notification: {
      title: '🔔 اختبار نظام التنبيهات ERS',
      body: 'تم استلام إشعار الاختبار بنجاح على هذا الجهاز.'
    },
    data: {
      isTest: 'true',
      timestamp: String(Date.now()),
      alertId: `test_${Date.now()}`
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'ers_emergency_channel',
        priority: 'high',
        defaultSound: true,
        defaultVibrateTimings: true
      }
    }
  };

  try {
    const res = await admin.messaging().send(message);
    return { success: true, messageId: res };
  } catch (err) {
    console.error('Test push error:', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});
