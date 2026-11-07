"use client";

/** A drag handle between panels. Reports movement in pixels since the drag started. */
export function Splitter({
  direction,
  onResize,
  label,
}: {
  direction: "horizontal" | "vertical";
  onResize: (delta: number, phase: "start" | "move") => void;
  label: string;
}) {
  const horizontal = direction === "horizontal";
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      className={`group relative z-10 shrink-0 ${horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize"} bg-border`}
      onPointerDown={(event) => {
        event.preventDefault();
        const start = horizontal ? event.clientX : event.clientY;
        onResize(0, "start");
        const move = (next: PointerEvent) => onResize((horizontal ? next.clientX : next.clientY) - start, "move");
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <div
        className={`absolute ${horizontal ? "inset-y-0 -left-1 w-2" : "inset-x-0 -top-1 h-2"} group-hover:bg-primary/30 group-active:bg-primary/40`}
      />
    </div>
  );
}
