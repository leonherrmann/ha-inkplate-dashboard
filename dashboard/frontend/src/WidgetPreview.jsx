// Approximations of what each widget looks like on the panel. Deliberately not
// pixel-exact: the firmware owns the real rendering, this only has to be close
// enough to lay a dashboard out against. A new widget type falls back to a
// labelled placeholder until a preview is written for it.

function Frame({ children }) {
  // The e-ink widgets are drawn as a rounded box with a hard offset shadow
  return <div className="preview-frame">{children}</div>;
}

function ClockPreview() {
  return (
    <div className="preview-clock">
      <span className="preview-clock-hours">08</span>
      <span className="preview-clock-minutes">45</span>
      <div className="preview-clock-date">MAR 14</div>
    </div>
  );
}

function ClimatePreview({ options }) {
  return (
    <Frame>
      <div className="preview-climate">
        <div className="preview-climate-icon">{(options.icon || "rooms_bed").replace("rooms_", "")}</div>
        <div className="preview-climate-temp">21.5°</div>
        <div className="preview-climate-humidity">48%</div>
      </div>
    </Frame>
  );
}

function Placeholder({ type }) {
  return (
    <Frame>
      <div className="preview-placeholder">{type}</div>
    </Frame>
  );
}

const previews = {
  clock: ClockPreview,
  climate: ClimatePreview,
};

export default function WidgetPreview({ type, options }) {
  const Preview = previews[type];
  if (!Preview) {
    return <Placeholder type={type} />;
  }
  return <Preview options={options || {}} />;
}
