import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CookieAccess } from "@/components/nixi/cookie-access";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
test("cookie checks send the selected browser and expose successful access", async () => {
  vi.mocked(api).mockResolvedValue({
    browser: "zen",
    ok: true,
    count: 2,
    message: "Cookie access works. 2 cookies loaded.",
  });
  render(<CookieAccess browser="zen" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Check cookie access" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "2 cookies loaded",
  );
  expect(api).toHaveBeenCalledWith(
    "/api/cookies/check",
    "POST",
    { cookiesBrowser: "zen" },
    expect.any(AbortSignal),
  );
});
test("permission guidance opens only the fixed settings and download-tool actions", async () => {
  vi.mocked(api).mockResolvedValue({
    browser: "safari",
    ok: false,
    count: 0,
    message: "Safari requires Full Disk Access.",
    permissionRequired: true,
    toolPath: "/tools/yt-dlp",
    runtimePath: "/tools/node",
  });
  render(<CookieAccess browser="safari" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Check cookie access" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Full Disk Access",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Open Full Disk Access" }),
  );
  expect(api).toHaveBeenCalledWith("/api/cookies/permissions", "POST");
  await userEvent.click(
    screen.getByRole("button", { name: "Reveal download tool" }),
  );
  expect(api).toHaveBeenCalledWith("/api/cookies/reveal-tool", "POST");
  vi.mocked(api).mockRejectedValue(new Error("Settings could not open"));
  await userEvent.click(
    screen.getByRole("button", { name: "Open Full Disk Access" }),
  );
  expect(await screen.findByText("Settings could not open")).toBeVisible();
});
test("switching browsers aborts a check and prevents stale results", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }) as never,
  );
  const { rerender } = render(<CookieAccess browser="safari" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Check cookie access" }),
  );
  expect(
    screen.getByRole("button", { name: "Checking cookie access…" }),
  ).toBeDisabled();
  const signal = vi.mocked(api).mock.calls.at(-1)![3];
  rerender(<CookieAccess browser="zen" />);
  expect(signal?.aborted).toBe(true);
  resolve({ ok: true, message: "Stale Safari result" });
  await waitFor(() =>
    expect(screen.queryByText("Stale Safari result")).toBeNull(),
  );
  expect(
    screen.getByRole("button", { name: "Check cookie access" }),
  ).toBeEnabled();
  rerender(<CookieAccess browser="none" />);
  expect(screen.queryByRole("button")).toBeNull();
});
test("a network failure leaves cookie checks retryable", async () => {
  vi.mocked(api).mockRejectedValue(new Error("nixi is offline"));
  render(<CookieAccess browser="zen" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Check cookie access" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("nixi is offline");
  expect(
    screen.getByRole("button", { name: "Check cookie access" }),
  ).toBeEnabled();
});
