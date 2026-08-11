import { INDIAN_STATES } from "@/types";

/**
 * Shared validation for the onboarding form's address/DOB/backup-number
 * fields — used by both the public claim flow and the authenticated
 * profile-completion route so the rules can't drift between them.
 */
export function validateOnboardingExtras(
  body: Record<string, unknown>,
  primaryPhone: string
): { error: string } | { fields: Record<string, unknown> } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const addressLine1 = str(body.addressLine1);
  const addressLine2 = str(body.addressLine2);
  const city = str(body.city);
  const state = str(body.state);
  const pincode = str(body.pincode);
  const backupPhoneRaw = str(body.backupPhone);
  const dob = str(body.dob);
  const gender = str(body.gender);
  const tshirtSize = str(body.tshirtSize);

  if (addressLine1.length < 5 || addressLine1.length > 200) {
    return { error: "Address Line 1 must be between 5 and 200 characters" };
  }
  if (addressLine2.length > 200) {
    return { error: "Address Line 2 is too long" };
  }
  if (!/^[A-Za-z\s.'-]{2,60}$/.test(city)) {
    return { error: "Enter a valid city name" };
  }
  if (!(INDIAN_STATES as readonly string[]).includes(state)) {
    return { error: "Select a valid state or union territory" };
  }
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    return { error: "Enter a valid 6-digit pincode" };
  }

  let backupPhone: string | undefined;
  if (backupPhoneRaw) {
    const digits = backupPhoneRaw.replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return { error: "Enter a valid 10-digit backup mobile number" };
    }
    if (digits === primaryPhone) {
      return { error: "Backup number must be different from your primary mobile number" };
    }
    backupPhone = digits;
  }

  if (dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return { error: "Invalid date of birth" };
    }
    const d = new Date(dob);
    const ageYears = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() || ageYears < 10 || ageYears > 100) {
      return { error: "Enter a valid date of birth" };
    }
  }

  const fields: Record<string, unknown> = { addressLine1, city, state, pincode };
  if (addressLine2) fields.addressLine2 = addressLine2;
  if (backupPhone) fields.backupPhone = backupPhone;
  if (dob) fields.dob = dob;
  if (gender) fields.gender = gender;
  if (tshirtSize) fields.tshirtSize = tshirtSize;
  return { fields };
}
