/** eduskill_viewer: read-only access for any verified @adda247.com Google
 *  account — no DB record; the role exists only in the session JWT. */
export type Role = "eduskill_faculty" | "eduskill_manager" | "eduskill_admin" | "eduskill_viewer";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type VideoStatus =
  | "uploaded"
  | "analyzing"
  | "gradi_done"
  | "manager_rated"
  | "no_transcript";

export interface User {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  subjects: string[];           // verticals (ssc, foundation, neet, etc.)
  teachingSubject?: string;     // what they actually teach (Maths, History, etc.)
  examTarget?: string;          // detailed exam target description
  cohort?: string;              // e.g. "June EduSkill", "March EduSkill"
  adjustToken?: string;         // Adjust tracking token
  trackingLink?: string;        // Full adjust tracking link
  videoSampleLink?: string;     // sample teaching video (YouTube/Drive), from signup
  resumeLink?: string;          // resume URL (Drive/Dropbox), from signup
  approvalStatus?: ApprovalStatus; // absent = approved (legacy/admin-created accounts)
  address?: string;             // legacy free-text address (pre-dates structured fields below)
  addressLine1?: string;        // from onboarding form — house/street (joining kits ship here)
  addressLine2?: string;        // optional — landmark/area
  city?: string;
  state?: string;
  pincode?: string;             // 6-digit Indian PIN code
  backupPhone?: string;         // optional alternate contact if primary is unreachable
  tshirtSize?: string;          // from onboarding form (S/M/L/XL/XXL)
  profileComplete?: boolean;    // false = must complete the onboarding form before using the dashboard
  onboardedAt?: string;         // when the onboarding form was submitted
  passwordHash?: string;
  avatarUrl?: string;
  age?: number;
  dob?: string;
  gender?: string;
  createdAt: string;
}

export interface Cohort {
  cohortId: string;
  name: string;            // e.g. "August EduSkill" — stored on User.cohort
  inviteCode: string;      // short code embedded in the public /join/<code> link
  signupOpen: boolean;     // admin can pause self-registration without deleting
  capacity?: number;       // max enrolled (approved) members; unlimited if absent
  createdBy: string;       // admin userId
  createdAt: string;
}

/** A candidate marked "selected" for a cohort — imported from an evaluation
 *  sheet or toggled from the manager roster (then sourceUserId is set). */
export interface SelectedCandidate {
  candidateId: string;
  cohort: string;
  name: string;
  regNo?: string;
  contact?: string;
  subject?: string;
  vertical?: string;
  replacement?: string;        // Yes / No / May be (from evaluation sheet)
  newInitiatives?: string;
  offlineEducators?: string;
  resumeLink?: string;
  videoLink?: string;
  sourceUserId?: string;       // set when selected from the roster
  selectedBy?: string;
  createdAt: string;
}

export interface Video {
  facultyId: string;
  videoId: string;
  youtubeUrl: string;
  subject: string;
  subjectId: string;
  title: string;
  duration?: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  status: VideoStatus;
  facultyName?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export interface GradiAnalysis {
  videoId: string;
  gradiScore: number;        // 0–5, raw from Gradi API
  scoreReason: string;
  oneLiner: string;
  summary: string;
  positives: string[];
  improvements: string[];
  // Gradi's 6 internal parameters (0–5 each, informational)
  ratingClarity: number;
  ratingDepth: number;
  ratingStructure: number;
  ratingCommunication: number;
  ratingInteraction: number;
  ratingCommercial: number;
  videoMetadata?: Record<string, unknown>;
  analyzedAt: string;
}

/**
 * Manager scores 5 parameters from the original EduSkill sheet:
 * Board-work, Visual TLM, Energy, Delivery, Hook  — each 1–5 = 25 pts total
 */
export interface ManagerRating {
  videoId: string;
  managerId: string;
  managerName?: string;
  boardWork: number;    // 1–5
  visualTLM: number;   // 1–5
  energy: number;      // 1–5
  delivery: number;    // 1–5
  hook: number;        // 1–5
  total: number;       // boardWork + visualTLM + energy + delivery + hook (5–25)
  notes?: string;
  ratedAt: string;
}

export interface Subject {
  subjectId: string;
  name: string;
  description?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

/** 5 parameters the manager scores, mirroring the original EduSkill Video Log sheet */
export const MANAGER_PARAMS = [
  { key: "boardWork",  label: "Board-work",  desc: "Whiteboard / chalk work quality" },
  { key: "visualTLM", label: "Visual TLM",   desc: "Teaching-learning material usage" },
  { key: "energy",    label: "Energy",       desc: "Enthusiasm & on-screen presence" },
  { key: "delivery",  label: "Delivery",     desc: "Clarity, pacing & language" },
  { key: "hook",      label: "Hook",         desc: "Opening engagement & retention" },
] as const;

export type ManagerParamKey = (typeof MANAGER_PARAMS)[number]["key"];

/** Gradi's 6 internal analysis parameters (informational only) */
export const GRADI_PARAMS = [
  { key: "ratingClarity",        label: "Clarity" },
  { key: "ratingDepth",          label: "Depth" },
  { key: "ratingStructure",      label: "Structure" },
  { key: "ratingCommunication",  label: "Communication" },
  { key: "ratingInteraction",    label: "Interaction" },
  { key: "ratingCommercial",     label: "Commercial" },
] as const;

// Kept for backwards compat in archive section
export const RATING_PARAMS = GRADI_PARAMS;
export type RatingKey = (typeof GRADI_PARAMS)[number]["key"];

/** Indian states & union territories — used for onboarding address validation
 *  (client dropdown and server-side check share this one list). */
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;
