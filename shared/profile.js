import { getCountries, getCountryCallingCode } from "libphonenumber-js";
export const phoneCountries = getCountries();
export const validEmail = (value) =>
  !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const phoneDigits = (value) => String(value || "").replace(/\D/g, "");
export function formatMobile(value) {
  const d = phoneDigits(value);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join("-");
}
export function maskMobile(value) {
  let n = 0;
  return formatMobile(value).replace(/\d/g, (c) => (++n <= 2 ? c : "#"));
}
export function maskEmail(value) {
  return value.length > 2
    ? value[0] + "#".repeat(value.length - 2) + value.at(-1)
    : value;
}
export function validateContacts(value) {
  if (!validEmail(value.email))
    throw Error("Enter a valid email address or leave it blank.");
  const country = value.mobileCountry || "";
  if (country && !phoneCountries.includes(country))
    throw Error("Choose a valid mobile country code.");
  if (value.mobile && (phoneDigits(value.mobile).length !== 10 || !country))
    throw Error(
      "Choose a country code and enter a 10-digit local mobile number, or leave the mobile number blank.",
    );
  return {
    ...value,
    mobile: formatMobile(value.mobile),
    mobileCountry: country,
    mobileDialCode: country ? "+" + getCountryCallingCode(country) : "",
  };
}
