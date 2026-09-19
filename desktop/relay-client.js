import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseRelaySettings } from "../shared/relayConfig.js";
import {
  ready,
  hash,
  createIdentity,
  publicIdentity,
  validatePeer,
  signedHeaders,
  sealMessage,
  openMessage,
} from "./relay-crypto.js";

// Optional transport only. All persisted credentials, peer pins and message text
// require OS-protected storage; this never uses OAR's plaintext session fallback.
export class RelayClient {
  constructor({
    directory,
    storage,
    secure,
    offline = () => false,
    fetcher = fetch,
    allowLoopback = false,
  }) {
    Object.assign(this, {
      directory,
      storage,
      secure,
      offline,
      fetcher,
      allowLoopback,
    });
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.sessions = new Map();
    this.busy = new Map();
    this.controllers = new Set();
    this.configuration = null;
    this.importError = "";
    this.generation = 0;
    try {
      this.configuration = this.read("settings");
    } catch {
      this.importError =
        "Relay settings could not be unlocked. OS-protected storage is required.";
    }
  }
  file(key) {
    return path.join(this.directory, key + ".sealed");
  }
  read(key) {
    if (!fs.existsSync(this.file(key))) return null;
    if (!this.secure())
      throw Error("OS-protected credential storage is unavailable.");
    if (fs.statSync(this.file(key)).size > 12_000_000)
      throw Error("Relay storage exceeds its safety limit.");
    return JSON.parse(
      this.storage.decryptString(fs.readFileSync(this.file(key))),
    );
  }
  write(key, value) {
    if (!this.secure())
      throw Error("OS-protected credential storage is unavailable.");
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > 10_000_000)
      throw Error("Relay storage is full.");
    const temporary = this.file(key) + "." + randomUUID();
    try {
      fs.writeFileSync(temporary, this.storage.encryptString(json), {
        mode: 0o600,
        flag: "wx",
      });
      fs.renameSync(temporary, this.file(key));
    } catch (error) {
      this.pause();
      for (const state of this.sessions.values()) state.consent = false;
      throw error;
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  importSettings(text) {
    const next = parseRelaySettings(text, {
      allowLoopback: this.allowLoopback,
    });
    this.write("settings", next);
    this.pause();
    this.configuration = next;
    this.importError = "";
    return this.status(null);
  }
  autoImport(candidates) {
    if (this.configuration || fs.existsSync(this.file("settings"))) return;
    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const info = fs.lstatSync(candidate);
        if (!info.isFile() || info.size > 8192)
          throw Error(
            "Settings file must be a regular YAML file of at most 8 KiB.",
          );
        this.importSettings(fs.readFileSync(candidate, "utf8"));
        return;
      } catch {
        this.importError =
          "Adjacent settings.yaml could not be imported. Use manual import after checking its contents and OS credential storage.";
        return;
      }
    }
  }
  context(profile) {
    if (
      !(typeof profile === "string" && /^[a-f0-9]{32}$/.test(profile)) &&
      !(Number.isSafeInteger(profile) && profile > 0)
    )
      throw Error("Sign in to use private relay messaging.");
    if (!this.configuration) throw Error("Import relay settings first.");
    if (!this.secure())
      throw Error("OS-protected credential storage is unavailable.");
    const origin = this.configuration.relay.url,
      key = hash(Buffer.from(origin + "\n" + profile));
    if (!this.sessions.has(key))
      this.sessions.set(
        key,
        this.read(key) || {
          consent: false,
          identity: null,
          registered: false,
          peers: {},
          messages: [],
          outbox: [],
          seen: {},
          issues: [],
        },
      );
    return {
      origin,
      key,
      state: this.sessions.get(key),
      token: this.configuration.relay.enrollmentToken,
      generation: this.generation,
    };
  }
  status(profile) {
    const base = {
      url: this.configuration?.relay.url || null,
      secureStorage: this.secure(),
      error: this.importError,
      enabled: false,
      identity: null,
      peers: [],
      messages: [],
      pending: 0,
      issues: [],
    };
    if (!profile || !base.url || !base.secureStorage) return base;
    const { state } = this.context(profile);
    return {
      ...base,
      enabled: state.consent,
      identity: state.identity ? publicIdentity(state.identity) : null,
      peers: Object.values(state.peers),
      messages: state.messages,
      pending: state.outbox.length,
      issues: state.issues || [],
    };
  }
  async enable(profile, consent) {
    await ready;
    const { key, state } = this.context(profile);
    if (typeof consent !== "boolean")
      throw Error("Explicit enrollment consent is required.");
    if (consent && !state.identity) state.identity = createIdentity();
    state.consent = consent;
    this.write(key, state);
    if (!consent) this.pause();
    return this.status(profile);
  }
  pause() {
    this.generation++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  assertActive(context) {
    if (
      context.generation !== this.generation ||
      context.origin !== this.configuration?.relay.url ||
      !context.state.consent ||
      !this.secure() ||
      this.offline()
    )
      throw Error("Relay changed, is disabled or OAR is offline.");
  }
  async request(context, method, route, payload) {
    this.assertActive(context);
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
      throw Error("Relay transport requires TLS verification.");
    const body = payload === undefined ? "" : JSON.stringify(payload),
      controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await this.fetcher(context.origin + route, {
        method,
        redirect: "error",
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          ...signedHeaders(
            context.state.identity,
            context.origin,
            method,
            route,
            body,
          ),
        },
        ...(body ? { body } : {}),
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error("Relay request failed (" + response.status + ").");
      if (!response.body) throw Error("Empty relay response.");
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 3_500_000) throw Error("Relay response is too large.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      // Cancellation can race a completed response (or a reader's cleanup).
      // Never commit its receipt, decrypt its inbox or ack after access ended.
      this.assertActive(context);
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }
  async register(context) {
    const { state, token } = context;
    if (!state.registered) {
      const { deviceId, ...card } = publicIdentity(state.identity);
      const response = await this.request(
        context,
        "POST",
        "/v1/devices/register",
        { ...card, ...(token ? { enrollmentToken: token } : {}) },
      );
      this.assertActive(context);
      if (response.deviceId !== deviceId || response.status !== "active")
        throw Error("Relay registration identity mismatch.");
      state.registered = true;
      this.write(context.key, state);
    }
  }
  async peer(profile, deviceId) {
    await ready;
    if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(deviceId))
      throw Error("Enter a valid device ID.");
    const context = this.context(profile);
    await this.register(context);
    const peer = validatePeer(
        await this.request(context, "GET", "/v1/devices/" + deviceId),
        deviceId,
      ),
      prior = context.state.peers[deviceId];
    if (prior && JSON.stringify(prior) !== JSON.stringify(peer))
      throw Error(
        "Peer keys changed. Messaging is blocked; verify independently.",
      );
    return peer;
  }
  async trust(profile, deviceId, expectedKeySignature) {
    const original = this.context(profile).key;
    const peer = await this.peer(profile, deviceId);
    if (this.context(profile).key !== original)
      throw Error("Relay changed during peer verification.");
    if (peer.keySignature !== expectedKeySignature)
      throw Error("Peer changed during verification.");
    const { key, state } = this.context(profile);
    if (Object.keys(state.peers).length >= 500 && !state.peers[deviceId])
      throw Error("Peer limit reached.");
    state.peers[deviceId] = peer;
    this.write(key, state);
    return this.status(profile);
  }
  async send(profile, recipientId, text) {
    await ready;
    const context = this.context(profile),
      { state } = context;
    if (!state.consent) throw Error("Enable relay messaging first.");
    const peer = state.peers[recipientId];
    if (!peer) throw Error("Verify and add this peer first.");
    if (state.outbox.length >= 100) throw Error("Outbox full.");
    const envelope = sealMessage(state.identity, peer, text);
    state.outbox.push(envelope);
    state.messages.push({
      id: envelope.id,
      senderId: envelope.senderId,
      recipientId,
      text,
      createdAt: envelope.createdAt,
      status: "queued",
    });
    state.messages = state.messages.slice(-500);
    this.write(context.key, state);
    return this.status(profile);
  }
  async discard(profile, ids) {
    const context = this.context(profile),
      { state } = context;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => !state.issues?.some((issue) => issue.id === id))
    )
      throw Error("Select quarantined messages only.");
    for (const id of ids) state.seen[id] = Date.now() + 7 * 86400000;
    this.write(context.key, state); // Record the explicit discard before acknowledgement.
    await this.request(context, "POST", "/v1/messages/ack", { ids });
    this.assertActive(context);
    state.issues = state.issues.filter((issue) => !ids.includes(issue.id));
    this.write(context.key, state);
  }
  async sync(profile) {
    await ready;
    const context = this.context(profile);
    if (this.busy.has(context.key)) return this.busy.get(context.key);
    const job = this.exchange(context).finally(() =>
      this.busy.delete(context.key),
    );
    this.busy.set(context.key, job);
    return job;
  }
  async exchange(context) {
    const { state, key } = context;
    if (!state.consent || this.offline()) return;
    await this.register(context);
    this.assertActive(context);
    for (const envelope of [...state.outbox]) {
      if (Date.parse(envelope.expiresAt) <= Date.now()) {
        state.outbox = state.outbox.filter((e) => e.id !== envelope.id);
        const row = state.messages.find((m) => m.id === envelope.id);
        if (row) row.status = "expired";
        this.write(key, state);
        continue;
      }
      const response = await this.request(context, "POST", "/v1/messages", {
        recipientId: envelope.recipientId,
        envelope,
      });
      this.assertActive(context);
      if (response.id !== envelope.id)
        throw Error("Relay delivery acknowledgement mismatch.");
      state.outbox = state.outbox.filter((e) => e.id !== envelope.id);
      const row = state.messages.find((m) => m.id === envelope.id);
      if (row) row.status = "accepted by relay";
      this.write(key, state);
    }
    const response = await this.request(context, "GET", "/v1/messages");
    this.assertActive(context);
    if (!Array.isArray(response.messages) || response.messages.length > 100)
      throw Error("Invalid inbox response.");
    const acknowledge = [];
    state.issues = [];
    for (const row of response.messages) {
      if (
        !row ||
        typeof row.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          row.id,
        )
      )
        throw Error("Invalid relay message identifier.");
      if (state.seen[row.id]) {
        acknowledge.push(row.id);
        continue;
      }
      try {
        if (
          row.id !== row.envelope?.id ||
          row.senderId !== row.envelope.senderId
        )
          throw Error();
        const peer = state.peers[row.senderId];
        if (!peer) throw Error();
        const text = openMessage(state.identity, peer, row.envelope);
        state.messages.push({
          id: row.id,
          senderId: row.senderId,
          recipientId: state.identity.deviceId,
          text,
          createdAt: row.envelope.createdAt,
          status: "received",
        });
        state.seen[row.id] = Date.parse(row.envelope.expiresAt);
        acknowledge.push(row.id);
      } catch {
        state.issues.push({
          id: row.id,
          senderId:
            typeof row.senderId === "string" &&
            /^[A-Za-z0-9_-]{43}$/.test(row.senderId)
              ? row.senderId
              : "invalid sender",
          error:
            "Unknown sender or invalid encrypted message. Verify the sender independently, or explicitly discard.",
        });
      }
    }
    state.messages = state.messages.slice(-500);
    for (const [id, expiry] of Object.entries(state.seen))
      if (expiry <= Date.now()) delete state.seen[id];
    this.write(key, state); // Commit locally before acknowledgement, including duplicate IDs.
    if (acknowledge.length)
      await this.request(context, "POST", "/v1/messages/ack", {
        ids: acknowledge,
      });
  }
}
