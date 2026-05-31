/**
 * One-shot tunnel health readout: `npm run db:tunnel:status`.
 * Shows whether the port is listening AND whether Postgres actually answers
 * through it (the distinction that matters — a zombie tunnel passes the first
 * check and fails the second).
 */

const { tcpPortListening, probeLiveness, TUNNEL_PORT } = require("./tunnel-lib");

(async () => {
  const listening = await tcpPortListening();
  const alive = listening ? await probeLiveness() : false;

  console.log(`Tunnel local port 127.0.0.1:${TUNNEL_PORT}`);
  console.log(`  listening : ${listening ? "yes" : "no"}`);
  console.log(`  postgres  : ${alive ? "answering (HEALTHY)" : "no response"}`);

  if (alive) {
    console.log("\nStatus: HEALTHY — DB reachable through the tunnel.");
    process.exit(0);
  }
  if (listening) {
    console.log("\nStatus: ZOMBIE — port open but Postgres dead. Run `npm run db:tunnel` to heal.");
  } else {
    console.log("\nStatus: DOWN — no tunnel. Run `npm run db:tunnel` to start it.");
  }
  process.exit(1);
})();
