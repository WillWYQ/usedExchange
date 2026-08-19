// A determinate progress bar: `percent` drives the fill width directly, no
// internal animation state of its own. Callers (e.g. ExportPdfDialog) own
// the percent-from-stage mapping, since that logic is specific to whatever
// multi-stage operation is being shown.
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress-bar">
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
      </div>
      {label !== undefined && <span className="progress-bar-label">{label}</span>}
    </div>
  );
}
