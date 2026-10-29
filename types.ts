
export enum UserRole {
  SUPER_ADMIN = 'super-admin',
  ADMIN = 'admin',
  USER = 'user',
  RESPONDER = 'responder'
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  department?: string;
  jobTitle?: string;
  contact?: string;
  country?: string;
  ip?: string;
  lastLocation?: { lat: number; lng: number; accuracy?: number; timestamp: number; isLiveShift?: boolean };
  shiftStatus?: 'on-duty' | 'off-duty';
  lastShiftStart?: number;
  lastShiftEnd?: number;
  lastHeartbeat?: number;
  status?: 'online' | 'idle' | 'offline';
  lastLogin?: number;
  deviceInfo?: {
    type: 'mobile' | 'desktop' | 'tablet';
    model: string;
    browser: string;
    os: string;
  };
}

export interface SimulatorConfig {
  customSituations: string;
  updatedAt: number;
}

export interface FacilityProfile {
  activityType: string;
  potentialHazards: string;
  criticalAssets: string;
  safetyStandards: string;
  siteDescription: string;
  updatedAt: number;
}

export interface TelemetryPoint {
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface EmergencyEvent {
  id: string;
  type: 'message' | 'task' | 'arrival' | 'escalation';
  content: string;
  userName: string;
  timestamp: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  emergencyId: string;
  questions: QuizQuestion[];
  createdAt: number;
}

export enum EmergencyStatus {
  ACTIVE = 'active',
  CONTAINED = 'contained',
  CLOSED = 'closed'
}

export type AcknowledgmentStage = 'CREATED' | 'DISPATCHED' | 'ACKNOWLEDGED' | 'RESPONDING' | 'ON_SCENE' | 'COMPLETED' | 'DELAYED' | 'ESCALATED';

export interface EmergencyAcknowledgment {
  userId: string;
  userName: string;
  userRole?: string;
  emergencyId: string;
  stage: AcknowledgmentStage;
  dispatchedAt?: number;
  acknowledgedAt?: number;
  responseStartedAt?: number;
  arrivedAt?: number;
  completedAt?: number;
  actionsTaken?: string;
  notes?: string;
  deviceId?: string;
  ip?: string;
  coords?: { lat: number; lng: number; accuracy?: number };
  updatedAt: number;
}

export interface EscalationConfig {
  level1Seconds: number; // default: 30s
  level2Seconds: number; // default: 60s
  level3Seconds: number; // default: 120s
  level4Seconds: number; // default: 180s
  autoEscalate: boolean;
  updatedAt?: number;
}

export interface AuditTrailEvent {
  id?: string;
  eventId: string;
  eventType: 
    | 'EMERGENCY_CREATED' 
    | 'DISPATCH_SENT' 
    | 'ACKNOWLEDGED' 
    | 'RESPONSE_STARTED' 
    | 'ESCALATED' 
    | 'ON_SCENE' 
    | 'SOP_TASK_COMPLETED' 
    | 'RESOLVED' 
    | 'CLOSED' 
    | 'REOPENED' 
    | 'OVERRIDE_CLOSED'
    | 'CONFIG_MODIFIED' 
    | 'ROLE_CHANGED'
    | 'SIMULATION_STARTED';
  emergencyId?: string;
  actorUserId: string;
  actorName?: string;
  actorRole: string;
  timestamp: number;
  previousState?: any;
  newState?: any;
  actionDetails: string;
  source: 'web' | 'android' | 'ios' | 'server';
  requestId?: string;
  deviceId?: string;
  correlationId?: string;
}

export interface Emergency {
  id: string;
  typeId: string;
  typeName: string;
  locationId: string;
  locationName: string;
  notes?: string;
  createdBy: string;
  creatorName: string;
  createdAt: number;
  status: EmergencyStatus;
  severity?: 'High' | 'Medium' | 'Low';
  responders: string[];
  responderActions?: Record<string, string>;
  dismissedBy?: string[];
  closedAt?: number;
  closedBy?: string;
  closedByName?: string;
  closureReason?: string;
  overrideAuthorizedBy?: string;
  aiReport?: string;
  escalated?: boolean;
  escalationLevel?: number; // 0=None, 1=Follow-up (30s), 2=Supervisor (60s), 3=Duty Manager (120s), 4=Chief (180s)
  escalationStatus?: 'pending' | 'escalated' | 'acknowledged' | 'resolved';
  lastEscalationAt?: number;
  nextEscalationAt?: number;
  escalatedTo?: string[];
  escalationReason?: string;
  checklist?: SOPTask[];
  isStreaming?: boolean;
  verifiedResponders?: string[];
  quiz?: Quiz;
  // SLA & Life cycle tracking
  isDrill?: boolean;
  drillScenarioId?: string;
  slaTargetMinutes?: number;
  dispatchedAt?: number;
  firstAcknowledgedAt?: number;
  firstResponseAt?: number;
  firstArrivalAt?: number;
}

export interface SOPTask {
  id: string;
  text: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: number;
}

export interface Location {
  id: string;
  name: string;
  floor_number: string;
  coords: { lat: number; lng: number };
  verificationCode?: string;
}

export interface JobTitle {
  id: string;
  job_name: string;
  description: string;
}

export interface Settings {
  darkMode: boolean;
  language: 'en' | 'ar';
  translationLanguage: string;
  doNotDisturb: {
    enabled: boolean;
    start: string;
    end: string;
  };
  themeColor: string;
  muteSiren: boolean;
}

export interface AppLinks {
  androidUrl: string;
  iosUrl: string;
  lastUpdated?: number;
}

export interface EmergencyType {
  id: string;
  type_name: string;
  description: string;
  severity_level: 'High' | 'Medium' | 'Low';
  alert_color: string;
  default_procedures: string;
}

export interface LoginLog {
  id: string;
  userId: string;
  userName: string;
  loginTime: number;
  logoutTime?: number;
  device?: string;
}

export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type DeviceLocationSource = 'gps' | 'ip' | 'manual' | 'none';
export type DeviceLocationStatus = 'active' | 'stale' | 'approximate' | 'failed';

export interface ConnectedDevice {
  deviceId: string;
  installationId: string;
  userId: string;
  userName?: string;
  sessionId: string;
  deviceName: string;
  deviceType: DeviceType;
  browser: string;
  operatingSystem: string;
  fcmToken: string;
  notificationEnabled: boolean;
  ipAddress: string;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  latitude: number;
  longitude: number;
  locationSource: DeviceLocationSource;
  locationAccuracy: number;
  locationStatus: DeviceLocationStatus;
  locationObservedAt: number;
  locationUpdatedAt: number;
  locationVersion: number;
  lastIpCheckAt: number;
  lastKnownCountry: string;
  lastKnownCity: string;
  activeSessionId: string;
  isOnline: boolean;
  firstSeen: number;
  lastSeen: number;
  lastLocationUpdate: number;
}

export interface LocationHistoryEntry {
  id?: string;
  deviceId: string;
  userId: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  locationSource: DeviceLocationSource;
  locationAccuracy: number;
  locationStatus: DeviceLocationStatus;
  timestamp: number;
  reason?: string;
}

export interface UserDevice {
  installationId: string;
  deviceId: string;
  userId: string;
  userName?: string;
  userRole?: string;
  deviceName: string;
  deviceModel: string;
  platform: 'android' | 'ios' | 'web';
  operatingSystem: string;
  appVersion: string;
  fcmToken: string;
  tokenUpdatedAt: number;
  notificationsEnabled: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'unsupported';
  isActive: boolean;
  lastSeen: number;
  lastHeartbeat: number;
  lastSuccessfulDeliveryAt?: number;
  lastAcknowledgedAlertAt?: number;
  createdAt: number;
  updatedAt: number;
  deactivatedReason?: string;
}


