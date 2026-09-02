// What each widget looks like on the panel.
//
// Where a real render exists it is used -- those come from the firmware sources
// via sim/screenshots.py, so they cannot drift from the panel. See
// widgetShots.js. The hand-written approximations below are the fallback, and
// they still matter for two cases that a screenshot cannot serve: text and
// image, whose content belongs to the user, and any widget a newer firmware
// offers that has no shot generated yet.
//
// Previews are drawn at the widget's true pixel size and the whole panel is
// scaled, so proportions stay honest either way. A widget type with neither a
// shot nor a preview is still placeable; it just renders as a labelled block.

import { imagePreviewUrl } from "./api.js";
import { fontPixels } from "./layout.js";
import { widgetShot } from "./widgetShots.js";

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

// A chip gets the cards' treatment at a smaller radius: hard offset shadow,
// border, filled body. "bare" drops all of it, for the chips that are already a
// strong shape on their own and would otherwise be a box drawn on a box.
function Chip({ children, bare = false }) {
  return <div className={bare ? "pv-chip bare" : "pv-chip"}>{children}</div>;
}

// Reading first, cell after, the way a meter reads. The text slot is fixed to
// the width of "100%" so the cell does not slide as the reading changes.
function BatteryPreview() {
  return (
    <Chip bare>
      <span className="pv-chip-text pv-battery-reading">72%</span>
      <div className="pv-battery">
        <div className="pv-battery-cell">
          <div className="pv-battery-fill" />
        </div>
        <div className="pv-battery-nub" />
      </div>
    </Chip>
  );
}

function WifiPreview() {
  return (
    <Chip>
      <span className="pv-chip-icon pv-wifi-icon" />
    </Chip>
  );
}

// The broker, as its own chip. One icon either way, so unlike the old combined
// widget its width does not depend on its state.
function MqttPreview() {
  return (
    <Chip>
      <span className="pv-chip-icon pv-cloud-icon" />
    </Chip>
  );
}

// On the panel this is absent until an update is offered. The editor always
// draws it, because a widget you cannot see is a widget you cannot move — the
// preview shows the room it will take when it does appear.
function UpdatePreview() {
  return (
    <Chip>
      <span className="pv-chip-icon pv-upgrade-icon" />
      <span className="pv-chip-text">v0.0.0</span>
    </Chip>
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
  return <img className="pv-image" src={source} alt={name} draggable={false} />;
}

// Confined text wraps in the browser the same way it does on the panel, which
// is close enough to judge whether it fits.
function TextPreview({ options, sizeId }) {
  const weight = options.font?.includes("extrabold") ? 800 : 700;
  const align = options.align === "centre" ? "center" : options.align || "left";
  // An automatic widget is as wide as its text, so wrapping it here would only
  // reflect an estimate being short. A boxed one wraps like the panel does.
  const confined = sizeId && sizeId !== "auto";

  return (
    <div
      className="pv-text"
      style={{
        fontSize: `${fontPixels(options.font)}px`,
        lineHeight: 1.35,
        fontWeight: weight,
        textAlign: align,
        whiteSpace: confined ? "pre-wrap" : "pre",
        overflow: confined ? "hidden" : "visible",
      }}
    >
      {options.text || "text"}
    </div>
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
  battery: BatteryPreview,
  wifi: WifiPreview,
  mqtt: MqttPreview,
  update: UpdatePreview,
  weather: WeatherPreview,
  image: ImagePreview,
  text: TextPreview,
};

// The shot is placed by the offset the generator recorded rather than stretched
// to fill the box. A card's render includes the shadow the firmware draws
// outside its rectangle, and the frameless clock and battery are cropped tight
// to their ink and so start a little inside theirs -- both are only in the right
// place if the image keeps its own size and sits where it was measured.
function Shot({ shot, type }) {
  return (
    <img
      className="pv-shot"
      src={shot.url}
      width={shot.width}
      height={shot.height}
      style={{ left: `${shot.dx}px`, top: `${shot.dy}px` }}
      alt={type}
      draggable={false}
    />
  );
}

export default function WidgetPreview({ type, options, size, uploads, sizeId }) {
  const shot = widgetShot(type, sizeId, options || {});
  const Preview = previews[type];

  return (
    <div
      className={shot ? "pv has-shot" : "pv"}
      style={{ width: size?.width, height: size?.height }}
    >
      {shot ? (
        <Shot shot={shot} type={type} />
      ) : Preview ? (
        <Preview options={options || {}} uploads={uploads} sizeId={sizeId} />
      ) : (
        <Placeholder type={type} />
      )}
    </div>
  );
}
