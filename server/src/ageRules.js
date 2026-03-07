export const MAJORITY_BY_COUNTRY = {
  fr: 18,
  us: 18,
  ca: 18,
  gb: 18,
  de: 18,
  it: 18,
  es: 18,
  jp: 18,
  kr: 19,
  ch: 18,
  sa: 18,
  ae: 18,
  in: 18,
  br: 18,
  ru: 18,
  cn: 18,
  tr: 18,
};

export function requiredMajorAge(countryCode) {
  if (!countryCode) return 18;
  return MAJORITY_BY_COUNTRY[countryCode.toLowerCase()] || 18;
}

export function calculateAge(dateString) {
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}
