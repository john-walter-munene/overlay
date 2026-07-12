/**
 * Worker entrypoint. Runs background jobs (settlement, CLV, stats, notify,
 * payouts) separately from the HTTP API — see docs/ARCHITECTURE.md §3.3.
 *
 * v1 stub: wire BullMQ workers here once the queue module lands.
 */
async function main() {
  // eslint-disable-next-line no-console
  console.log('Overlay worker starting (settlement/CLV/stats/notify/payouts)...');
  // TODO: register BullMQ workers:
  //   ingest-events, capture-closing-odds, settle-picks,
  //   compute-clv, recompute-stats, dispatch-notifications, run-payouts
}

main();
