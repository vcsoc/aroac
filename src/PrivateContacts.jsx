import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
function CountryCodePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef(null);
  const trigger = useRef(null);
  const search = useRef(null);
  const selected = countries.find((c) => c.code === value);
  const filtered = countries.filter((c) => {
    const term = query.trim().toLocaleLowerCase();
    return (
      !term ||
      c.name.toLocaleLowerCase().includes(term) ||
      c.code.toLocaleLowerCase().includes(term) ||
      c.dial.includes(term)
    );
  });
  const close = () => {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };
  const select = (code) => {
    onChange(code);
    close();
  };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event) => {
      if (!root.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="country-picker-field" ref={root}>
      <span>Country code</span>
      <input type="hidden" name="mobileCountry" value={value} />
      <button
        ref={trigger}
        type="button"
        className="country-picker-trigger"
        role="combobox"
        aria-label="Mobile country code"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? "mobile-country-options" : undefined}
        title={
          selected ? `${selected.name} (${selected.dial})` : "Choose country"
        }
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        <span>
          {selected ? `${selected.flag} ${selected.dial}` : "Choose country"}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="country-picker-menu">
          <input
            ref={search}
            type="search"
            aria-label="Search country or dial code"
            placeholder="Search country or +code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                root.current?.querySelector('[role="option"]')?.focus();
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (filtered.length) select(filtered[0].code);
              }
            }}
          />
          <div
            id="mobile-country-options"
            role="listbox"
            aria-label="Country calling codes"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => select("")}
            >
              Choose country
            </button>
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={value === country.code}
                onClick={() => select(country.code)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                    event.preventDefault();
                    const options = [
                      ...root.current.querySelectorAll('[role="option"]'),
                    ];
                    options[
                      Math.max(
                        0,
                        Math.min(
                          options.length - 1,
                          options.indexOf(event.currentTarget) +
                            (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      )
                    ]?.focus();
                  }
                }}
              >
                <span>
                  {country.flag} {country.name}
                </span>
                <span>{country.dial}</span>
              </button>
            ))}
            {!filtered.length && <p>No matching countries</p>}
          </div>
        </div>
      )}
    </div>
  );
}
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
          <CountryCodePicker
            value={country}
            onChange={(code) => {
              changed.current = true;
              setCountry(code);
            }}
          />
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
