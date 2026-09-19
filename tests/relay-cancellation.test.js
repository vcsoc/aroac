import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RelayClient } from "../desktop/relay-client.js";
import {
  createIdentity,
  publicIdentity,
  ready,
} from "../desktop/relay-crypto.js";
import { testVault } from "./relay-fixture.js";
for (const stop of ["logout", "offline", "vault-lock"])
  test(`late transfer completion after ${stop} leaves an ambiguous send queued for identical retry`, async () => {
    await ready;
    const directory = mkdtempSync(path.join(os.tmpdir(), "oar-relay-cancel-"));
    let secure = true,
      offline = false,
      release,
      started;
    const pending = new Promise((resolve) => {
      started = resolve;
    });
    const requests = [];
    const client = new RelayClient({
      directory,
      storage: testVault(),
      secure: () => secure,
      offline: () => offline,
      fetcher: async (url, options) => {
        requests.push({ url, options });
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    try {
      client.importSettings("version: 1\nrelay: {url: https://relay.example}");
      await client.enable(1, true);
      const peer = publicIdentity(createIdentity()),
        context = client.context(1);
      context.state.registered = true;
      context.state.peers[peer.deviceId] = peer;
      await client.send(1, peer.deviceId, "Queued before cancellation");
      const envelope = context.state.outbox[0];
      const operation = client.sync(1);
      await pending;
      if (stop === "logout") client.pause();
      else if (stop === "offline") offline = true;
      else secure = false;
      release(
        Response.json({ id: envelope.id, expiresAt: envelope.expiresAt }),
      );
      await assert.rejects(operation);
      assert.equal(requests.length, 1);
      assert.equal(context.state.outbox.length, 1);
      assert.equal(context.state.messages[0].status, "queued");
      secure = true;
      offline = false;
      client.fetcher = async (url, options) => {
        requests.push({ url, options });
        return Response.json(
          options.method === "POST"
            ? { id: envelope.id, expiresAt: envelope.expiresAt }
            : { messages: [] },
        );
      };
      await client.sync(1);
      assert.deepEqual(JSON.parse(requests[1].options.body).envelope, envelope);
      assert.equal(context.state.outbox.length, 0);
    } finally {
      client.pause();
      rmSync(directory, { recursive: true, force: true });
    }
  });
