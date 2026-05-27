// Forces Node's global fetch to use IPv4 with a longer connect timeout.
// Some networks/macOS Node builds get stuck in IPv6 Happy-Eyeballs limbo on AWS
// endpoints (Neon), even though curl works. This guarantees outbound HTTPS works.
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(
  new Agent({
    connect: { timeout: 30_000, family: 4 },
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
  }),
);
