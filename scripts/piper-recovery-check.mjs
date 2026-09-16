import { createPiperEngine } from "../shared/piper.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const workers = [];
class FakeWorker {
  constructor() {
    this.terminated = false;
    workers.push(this);
  }

  postMessage(message) {
    if (message.type !== "prepare") return;
    if (workers.length === 1) {
      queueMicrotask(() => this.onerror?.({ message: "simulated worker crash" }));
    } else {
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, type: "ready" } }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}

globalThis.Worker = FakeWorker;

const engine = createPiperEngine();
let firstFailed = false;
try {
  await engine.prepare();
} catch {
  firstFailed = true;
}
assert(firstFailed, "simulated Piper worker crash did not reject prepare()");
assert(workers.length === 1 && workers[0].terminated, "crashed Piper worker was not terminated");

await engine.prepare();
assert(workers.length === 2, "Piper did not create a fresh worker after a crash");
engine.destroy();
assert(workers[1].terminated, "replacement Piper worker was not terminated on destroy()");

console.log("✓ Piper recreates its worker after a crash");
