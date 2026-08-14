// Approximations of what each widget looks like on the panel. Deliberately not
// pixel-exact: the firmware owns the real rendering, this only has to be close
// enough to lay a dashboard out against. Previews are drawn at the widget's
// true pixel size, and the whole panel is scaled, so proportions stay honest.
//
// A widget type with no preview here still works and is still placeable; it just
// renders as a labelled block.

function Frame({ children, className = "" }) {
  // The e-ink widgets are a white box with a hard black offset shadow
  return <div className={`pv-frame ${className}`}>{children}</div>;
}

function ClockPreview() {
  return (
    <div className="pv-clock">
      <div className="pv-clock-time">
        <span className="pv-clock-hours">08</span>
        <span className="pv-clock-minutes">45</span>
      </div>
      <div className="pv-clock-date">MAR 14</div>
    </div>
  );
}

function ClimatePreview({ options }) {
  const room = (options.icon || "rooms_bed").replace(/^rooms_/, "");
  return (
    <Frame className="pv-climate">
      <div className="pv-climate-top">
        <span className="pv-climate-temp">21</span>
        <span className="pv-climate-deg" />
        <span className="pv-climate-room">{room}</span>
      </div>
      <div className="pv-climate-bottom">
        <span className="pv-climate-hum">48%</span>
        <span className="pv-climate-target">20°</span>
      </div>
    </Frame>
  );
}

function Placeholder({ type }) {
  return (
    <Frame className="pv-placeholder">
      <span>{type}</span>
    </Frame>
  );
}

const previews = {
  clock: ClockPreview,
  climate: ClimatePreview,
};

export default function WidgetPreview({ type, options, size }) {
  const Preview = previews[type];
  return (
    <div className="pv" style={{ width: size?.width, height: size?.height }}>
      {Preview ? <Preview options={options || {}} /> : <Placeholder type={type} />}
    </div>
  );
}
