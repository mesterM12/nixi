import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueueSignal } from "@/components/nixi/queue-signal";
test("idle signal never invents activity", () => {
  const { container } = render(
    <QueueSignal active={0} queued={0} progress={0} connected ready />,
  );
  expect(
    screen.getByRole("status", { name: "Queue status" }),
  ).toHaveTextContent("All quiet");
  expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(0);
});
test("signal labels real active and waiting jobs and reflects their progress", () => {
  const { container } = render(
    <QueueSignal active={3} queued={2} progress={50} connected ready />,
  );
  expect(
    screen.getByRole("status", { name: "Queue status" }),
  ).toHaveTextContent("03 active · 2 waiting");
  expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(20);
});
test("unavailable engine cannot present an idle or active queue", () => {
  const { rerender } = render(
    <QueueSignal active={0} queued={0} progress={0} connected={false} ready />,
  );
  expect(
    screen.getByRole("status", { name: "Queue status" }),
  ).toHaveTextContent("Connecting");
  rerender(
    <QueueSignal active={0} queued={0} progress={0} connected ready={false} />,
  );
  expect(
    screen.getByRole("status", { name: "Queue status" }),
  ).toHaveTextContent("Tools unavailable");
});
