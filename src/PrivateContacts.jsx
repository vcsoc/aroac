import { useEffect, useRef, useState } from "react";
import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import {
  phoneCountries,
  formatMobile,
  maskMobile,
  maskEmail,
  validEmail,
  phoneDigits,
} from "../shared/profile";
import { api } from "./lib";
import { Help } from "./InterfaceUI";
const names = new Intl.DisplayNames(undefined, { type: "region" });
const countries = phoneCountries
  .map((code) => ({
    code,
    name: names.of(code),
    dial: "+" + getCountryCallingCode(code),
    flag: [...code]
      .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
      .join(""),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
function PrivateField({
  label,
  name,
  initial,
  format,
  mask,
  validate,
  inputMode,
  maxLength,
}) {
  const [value, setValue] = useState(initial || ""),
    [focused, focus] = useState(false),
    [hovered, hover] = useState(false);
  const input = useRef();
  useEffect(() => {
    input.current.setCustomValidity(validate?.(value) || "");
  }, [value, validate]);
  return (
    <label onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      {label}
      <input
        ref={input}
        aria-label={label}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        value={focused || hovered ? value : mask(value)}
        onFocus={() => focus(true)}
        onBlur={() => focus(false)}
        onInvalid={() => focus(true)}
        onChange={(e) =>
          setValue(format ? format(e.target.value) : e.target.value)
        }
      />
      <input type="hidden" name={name} value={value} />
    </label>
  );
}
export default function PrivateContacts({ account, home }) {
  const parsed = account.mobile?.startsWith("+")
    ? parsePhoneNumberFromString(account.mobile)
    : null;
  const [country, setCountry] = useState(
    account.mobileCountry || parsed?.country || "",
  );
  const changed = useRef(false);
  useEffect(() => {
    if (
      country ||
      changed.current ||
      !Number.isFinite(home?.lat) ||
      !Number.isFinite(home?.lng)
    )
      return;
    let live = true;
    api(`/country?lat=${home.lat}&lng=${home.lng}`)
      .then((p) => {
        const match = countries.find(
          (c) => c.code === p.countryCode || c.name === p.country,
        );
        if (live && !changed.current && match) setCountry(match.code);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [home?.lat, home?.lng]);
  return (
    <>
      <div className="profile-field-mobile">
        <div className="clock-field-heading">
          <span>Mobile number (optional)</span>
          <Help label="About mobile privacy">
            Choose a country prefix and a 10-digit local number. The requested
            display format is ###-###-####; this is not a worldwide phone-number
            validity check. Hover or focus to reveal the number. Country
            defaults to the known home location, not your device timezone.
            Masking is only visual; the local database is not encrypted.
          </Help>
        </div>
        <div className="mobile-fields">
          <label>
            Country code
            <select
              aria-label="Mobile country code"
              name="mobileCountry"
              value={country}
              onChange={(e) => {
                changed.current = true;
                setCountry(e.target.value);
              }}
            >
              <option value="">Choose country</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.dial})
                </option>
              ))}
            </select>
          </label>
          <PrivateField
            label="Mobile number"
            name="mobile"
            initial={formatMobile(parsed?.nationalNumber || account.mobile)}
            format={formatMobile}
            mask={maskMobile}
            inputMode="tel"
            maxLength={12}
            validate={(v) =>
              !v || (phoneDigits(v).length === 10 && country)
                ? ""
                : "Choose a country code and enter a 10-digit local number, or leave it blank."
            }
          />
        </div>
      </div>
      <div className="profile-field-email">
        <PrivateField
          label="Email address (optional)"
          name="email"
          initial={account.email}
          mask={maskEmail}
          inputMode="email"
          maxLength={254}
          validate={(v) =>
            validEmail(v)
              ? ""
              : "Enter a valid email address or leave it blank."
          }
        />
      </div>
    </>
  );
}
