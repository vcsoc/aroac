import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RelayClient } from "../desktop/relay-client.js";
import {
  createIdentity,
  publicIdentity,
  sealMessage,
  ready,
} from "../desktop/relay-crypto.js";
import { testVault } from "./relay-fixture.js";
for (const phase of ["inbox", "ack"])
  test(`cancellation during ${phase} preserves durable exactly-once receive across restart`, async () => {
    await ready;
    const directory = mkdtempSync(path.join(os.tmpdir(), "oar-relay-inbox-"));
    let release, started;
    const waiting = new Promise((resolve) => {
      started = resolve;
    });
    const requests = [];
    const options = { directory, storage: testVault(), secure: () => true };
    const client = new RelayClient(options);
    let restored;
    try {
      client.importSettings("version: 1\nrelay: {url: https://relay.example}");
      await client.enable(1, true);
      const context = client.context(1),
        sender = createIdentity();
      context.state.registered = true;
      context.state.peers[sender.deviceId] = publicIdentity(sender);
      const envelope = sealMessage(
          sender,
          publicIdentity(context.state.identity),
          "Durable private received text",
        ),
        row = { id: envelope.id, senderId: sender.deviceId, envelope };
      client.fetcher = async (url, request) => {
        requests.push(request.method);
        if (
          (phase === "inbox" && request.method === "GET") ||
          (phase === "ack" && request.method === "POST")
        ) {
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        }
        return Response.json({ messages: [row] });
      };
      const operation = client.sync(1);
      await waiting;
      client.pause();
      release(
        Response.json(phase === "inbox" ? { messages: [row] } : { deleted: 1 }),
      );
      await assert.rejects(operation);
      assert.equal(context.state.messages.length, phase === "inbox" ? 0 : 1);
      if (phase === "inbox") {
        assert.deepEqual(requests, ["GET"]);
        // Save the pre-existing fixture keys only, never the cancelled inbox payload.
        client.write(context.key, context.state);
      }
      restored = new RelayClient({
        ...options,
        fetcher: async (url, request) =>
          Response.json(
            request.method === "GET" ? { messages: [row] } : { deleted: 1 },
          ),
      });
      await restored.sync(1);
      await restored.sync(1);
      assert.equal(restored.status(1).messages.length, 1);
      assert.equal(
        restored.status(1).messages[0].text,
        "Durable private received text",
      );
    } finally {
      client.pause();
      restored?.pause();
      rmSync(directory, { recursive: true, force: true });
    }
  });
