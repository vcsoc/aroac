export const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";
export const normalizeCallsign = (value) => normalizeText(value).toUpperCase();
// Basic syntax only, not licence verification. Accept portable/prefix/suffix forms.
export const validCallsign = (value) =>
  typeof value === "string" &&
  /^(?=.{3,32}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]{1,12}(?:\/[A-Z0-9]{1,12}){0,2}$/.test(
    value,
  );
export const validGrid = (value) =>
  typeof value === "string" &&
  (value === "" || /^[A-R]{2}\d{2}(?:[A-X]{2})?$/.test(value));
export function validateRegistration(input = {}) {
  const values = {
    callsign: normalizeCallsign(input.callsign),
    name: normalizeText(input.name),
    email: normalizeText(input.email),
    grid: normalizeText(input.grid).toUpperCase(),
    password: typeof input.password === "string" ? input.password : "",
  };
  const fields = {};
  if (!validCallsign(values.callsign))
    fields.callsign =
      "Enter your radio callsign, including letters and a number (for example ZS1ABC or EA8/ZS1ABC/P). No spaces or punctuation other than /.";
  if (!values.name || values.name.length > 80)
    fields.name = "Enter your name (1–80 characters).";
  if (values.email.length > 254 || !/^\S+@\S+\.\S+$/.test(values.email))
    fields.email = "Enter a complete email address, such as name@example.com.";
  if (
    values.password.length < 12 ||
    values.password.length > 128 ||
    !values.password.trim()
  )
    fields.password =
      "Use a password of 12–128 characters. Your password is not trimmed or changed.";
  if (
    (input.grid != null && typeof input.grid !== "string") ||
    !validGrid(values.grid)
  )
    fields.grid =
      "Leave this optional field blank, or enter a 4/6-character location grid such as FN03 or FN03CK.";
  return { values, fields };
}
