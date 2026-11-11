"use client";
const heights = [
  16, 26, 20, 32, 14, 24, 30, 18, 25, 16, 34, 23, 15, 29, 20, 25, 17, 31, 22,
  15, 26, 19, 33, 16, 24, 20, 29, 14, 23, 31, 17, 26, 20, 15, 30, 22, 17, 27,
  19, 25,
];
export function QueueSignal({
  active,
  queued,
  progress,
  connected,
  ready,
  offline = false,
}: {
  active: number;
  queued: number;
  progress: number;
  connected: boolean;
  ready: boolean;
  offline?: boolean;
}) {
  const available = connected && ready && !offline;
  const lit =
    available && active > 0
      ? Math.round(
          (Math.max(0, Math.min(100, progress)) * heights.length) / 100,
        )
      : 0;
  const label = offline
    ? "Offline"
    : !connected
      ? "Connecting"
      : !ready
        ? "Tools unavailable"
        : active
          ? `${String(active).padStart(2, "0")} active${queued ? ` · ${queued} waiting` : ""}`
          : queued
            ? `${queued} waiting`
            : "All quiet";
  return (
    <section
      className={`queue-signal ${available && active ? "is-active" : ""}`}
      role="status"
      aria-label="Queue status"
    >
      <div className="signal-label">
        <span>Queue status</span>
        <span>{label}</span>
      </div>
      <div className="signal-bars" aria-hidden="true">
        {heights.map((height, index) => (
          <i
            key={index}
            style={{ height: `${height}px` }}
            data-lit={index < lit}
          />
        ))}
      </div>
    </section>
  );
}
