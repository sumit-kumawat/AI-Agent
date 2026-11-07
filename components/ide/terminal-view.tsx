"use client";

import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import type { IdeTheme } from "@/components/ide/use-ide-theme";

const THEMES = {
  light: {
    background: "#ffffff",
    foreground: "#1f2328",
    cursor: "#1f2328",
    selectionBackground: "#b6d7ff",
    black: "#24292f",
    brightBlack: "#57606a",
  },
  dark: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: "#264f78",
  },
};

/** One live shell. Output arrives by Server-Sent Events; keystrokes are batched into POSTs. */
export function TerminalView({
  id,
  theme,
  visible,
  onExit,
}: {
  id: string;
  theme: IdeTheme;
  visible: boolean;
  onExit: (code: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    const terminal = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host.current!);
    term.current = terminal;
    fit.current = fitAddon;

    let pending = "";
    let flushing: ReturnType<typeof setTimeout> | null = null;
    const post = (body: unknown) =>
      fetch(`/api/ide/terminals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    const input = terminal.onData((data) => {
      pending += data;
      flushing ??= setTimeout(() => {
        const chunk = pending;
        pending = "";
        flushing = null;
        void post({ input: chunk });
      }, 8);
    });

    let lastSize = "";
    const resize = () => {
      if (!host.current || host.current.offsetParent === null) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      const size = `${terminal.cols}x${terminal.rows}`;
      if (size !== lastSize) {
        lastSize = size;
        void post({ cols: terminal.cols, rows: terminal.rows });
      }
    };
    const observer = new ResizeObserver(() => resize());
    observer.observe(host.current!);

    const events = new EventSource(`/api/ide/terminals/${id}`);
    events.addEventListener("data", (event) => terminal.write(JSON.parse((event as MessageEvent).data) as string));
    events.addEventListener("exit", (event) => {
      const code = JSON.parse((event as MessageEvent).data) as number;
      terminal.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
      events.close();
      onExitRef.current(code);
    });

    return () => {
      events.close();
      observer.disconnect();
      input.dispose();
      if (flushing) clearTimeout(flushing);
      terminal.dispose();
    };
  }, [id]);

  useEffect(() => {
    if (term.current) term.current.options.theme = THEMES[theme];
  }, [theme]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      try {
        fit.current?.fit();
      } catch {
        // Not laid out yet.
      }
      term.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return <div ref={host} data-terminal={id} className={`h-full w-full px-2 pt-1 ${visible ? "" : "hidden"}`} />;
}
