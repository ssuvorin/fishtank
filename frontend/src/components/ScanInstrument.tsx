import { useEffect, useState } from "react";
import { Matrix, type Frame } from "./elevenlabs/matrix";
const rows = 17;
const cols = 25;
const idle: Frame = Array.from({ length: rows }, (_, y) =>
  Array.from({ length: cols }, (_, x) => {
    const dx = (x - 12) / 1.45,
      dy = y - 8;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance > 5 && distance < 7 && !(x > 13 && Math.abs(dy) < 3)
      ? 1
      : 0.025;
  }),
);
const scanFrames: Frame[] = Array.from({ length: 25 }, (_, frame) =>
  idle.map((row, y) =>
    row.map((value, x) =>
      Math.max(
        value * 0.3,
        Math.max(0, 1 - Math.abs(x - frame) / 3) * (y > 1 && y < 15 ? 1 : 0.2),
      ),
    ),
  ),
);
export default function ScanInstrument({
  active = false,
}: {
  active?: boolean;
}) {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div className="scan-instrument" aria-hidden="true">
      <div className="instrument-top">
        <span>CR / SITE REVIEW</span>
        <span className={active ? "signal active" : "signal"} />
      </div>
      <div className="matrix-window">
        <Matrix
          rows={rows}
          cols={cols}
          pattern={active && !reduced ? undefined : idle}
          frames={scanFrames}
          autoplay={active && !reduced}
          fps={16}
          size={6}
          gap={5}
          palette={{ on: "#ff6b35", off: "#61594d" }}
        />
      </div>
      <div className="instrument-bottom">
        <span>{active ? "REQUEST IN PROGRESS" : "READY FOR A WEBSITE"}</span>
        <span>01—10</span>
      </div>
    </div>
  );
}
