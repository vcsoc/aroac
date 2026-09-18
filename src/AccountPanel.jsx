import { useEffect, useRef, useState } from "react";
import {
  X,
  UserRound,
  Pencil,
  LogOut,
  Plus,
  Trash2,
  FileDown,
} from "lucide-react";
import { api, post } from "./lib";
import { confirmAction, Help } from "./InterfaceUI";
import { useToastStatus } from "./Toasts";
import PrivateContacts from "./PrivateContacts";
import { imageDimensions } from "../shared/media";
const imageUrl = (a) => (a ? `data:${a.mime};base64,${a.data}` : null);
export default function AccountPanel({
  user,
  onClose,
  onUser,
  onAvatar,
  onLogout,
  initial = "summary",
  home,
}) {
  const ref = useRef(),
    file = useRef(),
    [screen, setScreen] = useState(initial),
    [account, setAccount] = useState(null),
    [status, setStatus] = useToastStatus(),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/account").then((value) => {
      setAccount(value);
      onAvatar?.(value.avatar);
    });
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    load().catch((e) => setStatus(e.message));
    return () => node.close();
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  };
  const avatar = (f) =>
    run(async () => {
      if (
        !f ||
        f.size > 4 * 1024 * 1024 ||
        !["image/jpeg", "image/png"].includes(f.type)
      )
        throw Error("Choose a PNG/JPEG avatar up to 4 MiB.");
      const dimensions = imageDimensions(
        new Uint8Array(await f.arrayBuffer()),
        f.type,
      );
      if (
        !dimensions ||
        !dimensions.width ||
        !dimensions.height ||
        dimensions.width * dimensions.height > 40000000
      )
        throw Error("Invalid image dimensions (maximum 40 megapixels).");
      const bitmap = await createImageBitmap(f);
      try {
        if (bitmap.width * bitmap.height > 40000000)
          throw Error("Image dimensions are too large.");
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        await api("/account/avatar", {
          method: "PUT",
          body: JSON.stringify({
            name: "avatar.png",
            data: canvas.toDataURL("image/png").split(",")[1],
          }),
        });
        await load();
        setStatus("Avatar saved in your local database.");
      } finally {
        bitmap.close();
      }
    });
  return (
    <dialog
      ref={ref}
      className={"account-dialog " + (screen === "summary" ? "user-menu" : "")}
      onCancel={onClose}
    >
      <header>
        <h2>
          {screen === "summary" ? "Logged in user" : "Profile & equipment"}
        </h2>
        <button
          className="icon-button"
          title="Close account panel"
          aria-label="Close account panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <h3>
        {user.callsign} · {user.name}
      </h3>
      {account ? (
        <>
          {screen === "summary" ? (
            <>
              {account.avatar ? (
                <img
                  className="account-avatar"
                  src={imageUrl(account.avatar)}
                  alt="Your avatar"
                />
              ) : (
                <span className="account-avatar account-avatar-placeholder">
                  <UserRound size={42} />
                </span>
              )}
              <div className="account-actions">
                <button onClick={() => setScreen("profile")}>
                  <Pencil size={16} />
                  Edit profile
                </button>
                <button
                  onClick={() =>
                    run(async () => {
                      await onLogout();
                      onClose();
                    })
                  }
                  disabled={busy}
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="account-actions">
                <button
                  aria-pressed={screen === "profile"}
                  onClick={() => setScreen("profile")}
                >
                  Profile
                </button>
                <button
                  aria-pressed={screen === "devices"}
                  onClick={() => setScreen("devices")}
                >
                  My devices
                </button>
              </div>
              {screen === "profile" ? (
                <>
                  <input
                    ref={file}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-label="Upload avatar"
                    onChange={(e) => {
                      avatar(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="account-avatar-drop"
                    onClick={() => file.current.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!busy) avatar(e.dataTransfer.files[0]);
                    }}
                  >
                    {account.avatar ? (
                      <img
                        className="account-avatar"
                        src={imageUrl(account.avatar)}
                        alt="Your avatar"
                      />
                    ) : (
                      <span className="account-avatar account-avatar-placeholder">
                        <UserRound size={42} />
                      </span>
                    )}
                    <span>
                      Click or drop a PNG/JPEG avatar
                      <br />
                      <small>Resized to 512 px; saved locally</small>
                    </span>
                  </button>
                  {account.avatar && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api("/account/avatar", { method: "DELETE" });
                          await load();
                        })
                      }
                    >
                      Remove avatar
                    </button>
                  )}
                  <form
                    className="profile-editor-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const values = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      run(async () => {
                        setAccount(
                          await api("/account", {
                            method: "PATCH",
                            body: JSON.stringify(values),
                          }),
                        );
                        onUser(await api("/me"));
                        setStatus(
                          `Updated the local operator profile for ${user.callsign}.`,
                        );
                      });
                    }}
                  >
                    <div className="account-grid">
                      {[
                        ["firstName", "First name", 80],
                        ["lastName", "Last name", 80],
                        ["name", "Display name (local directory)", 80],
                        ["address", "Address", 500],
                        ["grid", "Maidenhead grid (optional)", 6],
                      ].map(([key, label, max]) => (
                        <label key={key} className={"profile-field-" + key}>
                          {label}
                          <input
                            name={key}
                            defaultValue={account[key] || ""}
                            required={["name", "email"].includes(key)}
                            type={
                              key === "email"
                                ? "email"
                                : key === "mobile"
                                  ? "tel"
                                  : "text"
                            }
                            maxLength={max}
                          />
                        </label>
                      ))}
                      <PrivateContacts
                        key={JSON.stringify([
                          account.mobile,
                          account.mobileCountry,
                          account.email,
                        ])}
                        account={account}
                        home={home}
                      />
                    </div>
                    <label>
                      About your station
                      <textarea
                        name="bio"
                        defaultValue={account.bio || ""}
                        maxLength={500}
                      />
                    </label>
                    <small>
                      First/last names, mobile, email, address, avatar and
                      devices are account-scoped in OAR, not published in the
                      local directory. Display name/grid/biography appear in
                      that directory. No cloud synchronization. Database and
                      backups are not encrypted: anyone with OS-user or
                      full-backup access can read them.
                    </small>
                    <button className="primary" disabled={busy}>
                      Save profile
                    </button>
                  </form>
                  <details>
                    <summary>Change password</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          values = Object.fromEntries(new FormData(form));
                        run(async () => {
                          await post("/account/password", values);
                          form.reset();
                          setStatus(
                            "Password changed. Other sign-in sessions were revoked; this session remains signed in.",
                          );
                        });
                      }}
                    >
                      {[
                        ["currentPassword", "Current password"],
                        ["newPassword", "New password"],
                        ["confirmPassword", "Confirm password"],
                      ].map(([name, label]) => (
                        <label key={name}>
                          {label}
                          <input
                            name={name}
                            aria-label={label}
                            type="password"
                            autoComplete={
                              name === "currentPassword"
                                ? "current-password"
                                : "new-password"
                            }
                            required
                            minLength={name === "currentPassword" ? 1 : 12}
                            maxLength={128}
                          />
                        </label>
                      ))}
                      <button disabled={busy}>Change password</button>
                    </form>
                  </details>
                </>
              ) : (
                <DeviceInventory user={user} account={account} />
              )}
            </>
          )}
        </>
      ) : (
        <p>Loading account…</p>
      )}
      {status && (
        <p role="status" className="account-status">
          {status}
        </p>
      )}
    </dialog>
  );
}
const fields = [
  ["name", "Device name"],
  ["manufacturer", "Manufacturer"],
  ["model", "Model"],
  ["serial", "Serial number"],
  ["purchaseDate", "Purchase date"],
  ["price", "Purchase price"],
  ["currency", "Currency"],
  ["supplier", "Supplier"],
  ["supplierEmail", "Supplier email"],
  ["supplierPhone", "Supplier phone"],
  ["supplierAddress", "Supplier address"],
  ["warrantyUntil", "Warranty expiry"],
  ["notes", "Notes / specifications"],
];
function DeviceInventory({ user, account }) {
  const [rows, setRows] = useState([]),
    [draft, setDraft] = useState(null),
    [status, setStatus] = useToastStatus(),
    [busy, setBusy] = useState(false);
  const load = () => api("/devices").then(setRows);
  useEffect(() => {
    load().catch((e) => setStatus(e.message));
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  };
  const report = (list) =>
    run(async () => {
      setStatus("Preparing a local PDF with original invoice attachments…");
      const { ownershipPdf } = await import("./ownershipPdf");
      const data = await ownershipPdf(user, account, list);
      if (!window.oarDesktop?.savePdf)
        throw Error("PDF saving requires the standalone desktop app.");
      const saved = await window.oarDesktop.savePdf(data);
      setStatus(
        saved.canceled ? "Export canceled." : "PDF saved: " + saved.path,
      );
    });
  return (
    <section>
      <h3>
        My devices{" "}
        <Help label="About devices and ownership records">
          Private local inventory. Invoices are stored unchanged in SQLite
          (PDF/JPG/PNG, up to 4 MiB each, eight per device). Ownership reports
          are user-entered records, not certified proof or guaranteed warranty
          coverage. PDFs contain private account and invoice details; review
          before sharing. PDF invoices are embedded attachments; image invoices
          have page previews within size/decoding limits. Use an
          attachment-capable PDF viewer to retrieve originals. Exports allow up
          to 32 MiB of original attachments; use per-device exports for larger
          inventories.
        </Help>
      </h3>
      <div className="account-actions">
        <button disabled={busy} onClick={() => setDraft({})}>
          <Plus size={16} />
          Add device
        </button>
        <button disabled={busy || !rows.length} onClick={() => report(rows)}>
          <FileDown size={16} />
          Export all devices to PDF
        </button>
      </div>
      {draft && (
        <form
          className="device-card"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const body = Object.fromEntries(
                fields.map(([key]) => [key, draft[key] || ""]),
              );
              await api(draft.id ? "/devices/" + draft.id : "/devices", {
                method: draft.id ? "PUT" : "POST",
                body: JSON.stringify(body),
              });
              setDraft(null);
              await load();
              setStatus(
                "Equipment details saved to your private local inventory.",
              );
            });
          }}
        >
          <div className="account-grid">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                {key === "notes" ? (
                  <textarea
                    aria-label={label}
                    maxLength={4000}
                    value={draft[key] || ""}
                    onChange={(e) =>
                      setDraft((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    aria-label={label}
                    type={
                      ["purchaseDate", "warrantyUntil"].includes(key)
                        ? "date"
                        : key === "supplierEmail"
                          ? "email"
                          : "text"
                    }
                    required={key === "name"}
                    maxLength={
                      key === "supplierAddress"
                        ? 500
                        : key === "supplierEmail"
                          ? 254
                          : key === "serial"
                            ? 160
                            : 120
                    }
                    value={draft[key] || ""}
                    onChange={(e) =>
                      setDraft((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <div className="account-actions">
            <button className="primary" disabled={busy}>
              Save device
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel device editing
            </button>
          </div>
        </form>
      )}
      {rows.map((d) => (
        <article className="device-card" key={d.id}>
          <h4>{d.name}</h4>
          <dl>
            {fields
              .filter(([key]) => d[key])
              .map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {d[key]}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="account-actions">
            <button disabled={busy} onClick={() => setDraft(d)}>
              <Pencil size={14} />
              Edit device
            </button>
            <button disabled={busy} onClick={() => report([d])}>
              <FileDown size={14} />
              Export device PDF
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmAction(
                    "Delete this device and all its invoices?",
                  )
                )
                  run(async () => {
                    await api("/devices/" + d.id, { method: "DELETE" });
                    await load();
                  });
              }}
            >
              <Trash2 size={14} />
              Delete device
            </button>
          </div>
          <details>
            <summary>Invoices ({d.invoices.length})</summary>
            {d.invoices.map((f) => (
              <p key={f.id}>
                {f.name} · {Math.ceil(f.size / 1024)} KiB{" "}
                <button
                  disabled={busy}
                  aria-label={"Delete invoice " + f.name}
                  onClick={async () => {
                    if (await confirmAction("Delete this invoice?"))
                      run(async () => {
                        await api(`/devices/${d.id}/invoices/${f.id}`, {
                          method: "DELETE",
                        });
                        await load();
                      });
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </p>
            ))}
            <label>
              Add PDF/JPG/PNG invoice
              <input
                type="file"
                aria-label={"Invoice for " + d.name}
                accept="application/pdf,image/jpeg,image/png"
                disabled={busy || d.invoices.length >= 8}
                onChange={(e) => {
                  const f = e.target.files[0];
                  e.target.value = "";
                  if (f)
                    run(async () => {
                      if (f.size > 4 * 1024 * 1024)
                        throw Error("Invoices must be at most 4 MiB.");
                      const { base64 } = await import("./ownershipPdf");
                      await post(`/devices/${d.id}/invoices`, {
                        name: f.name,
                        data: base64(new Uint8Array(await f.arrayBuffer())),
                      });
                      await load();
                      setStatus(
                        "Invoice attached to this device in your local equipment inventory.",
                      );
                    });
                }}
              />
            </label>
          </details>
        </article>
      ))}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
