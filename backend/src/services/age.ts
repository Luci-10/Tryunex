/**
 * Minimum age to hold a TryUnex account.
 *
 * Change this one constant to change the rule everywhere — the API validator,
 * the error message, and the copy on the registration form all read from here.
 *
 * Worth knowing before changing it: India's DPDP Act 2023 treats anyone under
 * 18 as a child, and processing a child's data requires verifiable parental
 * consent. Setting this below 18 therefore does not lower the obligation — it
 * accepts users who are children in law, which is precisely when the parental
 * consent requirement applies.
 */
export const MINIMUM_AGE = 18;

/** Whole years elapsed, counting the birthday itself. */
export function ageOn(dob: string, on = new Date()): number {
  const b = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return NaN;
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < b.getUTCMonth() ||
    (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type AgeCheck = { ok: true; age: number } | { ok: false; reason: string };

export function checkAge(dob: string): AgeCheck {
  const age = ageOn(dob);
  if (Number.isNaN(age)) return { ok: false, reason: "That date doesn't look right." };
  if (age < 0 || age > 120) return { ok: false, reason: "That date doesn't look right." };
  if (age < MINIMUM_AGE) {
    return {
      ok: false,
      reason: `You need to be ${MINIMUM_AGE} or older to use TryUnex.`,
    };
  }
  return { ok: true, age };
}
