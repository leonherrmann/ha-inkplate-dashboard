// Approximations of what each widget looks like on the panel. Deliberately not
// pixel-exact: the firmware owns the real rendering, this only has to be close
// enough to lay a dashboard out against. Previews are drawn at the widget's
// true pixel size, and the whole panel is scaled, so proportions stay honest.
//
// A widget type with no preview here still works and is still placeable; it just
// renders as a labelled block.

import { imagePreviewUrl } from "./api.js";

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

function BatteryPreview() {
  return (
    <div className="pv-battery">
      <div className="pv-battery-cell">
        <div className="pv-battery-fill" />
      </div>
      <div className="pv-battery-nub" />
      <span className="pv-battery-text">72%</span>
    </div>
  );
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

// The real widget is a solid black rounded box with white content, and the
// first day is drawn larger with no weekday label above it.
function WeatherPreview() {
  return (
    <div className="pv-weather">
      {DAYS.map((day, index) => (
        <div className={index === 0 ? "pv-weather-day big" : "pv-weather-day"} key={day}>
          {index !== 0 && <span className="pv-weather-name">{day}</span>}
          <span className="pv-weather-icon" />
          <span className="pv-weather-temp">{18 - index}°</span>
        </div>
      ))}
    </div>
  );
}

// An uploaded image is shown as the converted 1-bit version, which is what the
// panel will actually draw; the built-ins are vendored under public/photos.
function ImagePreview({ options, uploads }) {
  const name = options.image;
  if (!name) {
    return (
      <Frame className="pv-placeholder">
        <span>pick an image</span>
      </Frame>
    );
  }

  const uploaded = uploads?.some((image) => image.name === name);
  const source = uploaded ? imagePreviewUrl(name) : `photos/${name}.png`;
  return <img className="pv-image" src={source} alt={name} />;
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
  battery: BatteryPreview,
  weather: WeatherPreview,
  image: ImagePreview,
};

export default function WidgetPreview({ type, options, size, uploads }) {
  const Preview = previews[type];
  return (
    <div className="pv" style={{ width: size?.width, height: size?.height }}>
      {Preview ? (
        <Preview options={options || {}} uploads={uploads} />
      ) : (
        <Placeholder type={type} />
      )}
    </div>
  );
}
