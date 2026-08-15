// Voltage over the last week, with gaps where the device was not reporting.
// Small on purpose: Home Assistant owns the real history, this is a glance.

const WIDTH = 300;
const HEIGHT = 60;

export default function Sparkline({ samples }) {
  if (!samples || samples.length < 2) {
    return <p className="hint">Not enough history yet — samples are taken every 15 minutes.</p>;
  }

  const times = samples.map((sample) => sample.t);
  const volts = samples.map((sample) => sample.v);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  // Pad the voltage range so a flat line does not sit on the floor of the box
  const minVolt = Math.min(...volts) - 0.02;
  const maxVolt = Math.max(...volts) + 0.02;

  const spanTime = maxTime - minTime || 1;
  const spanVolt = maxVolt - minVolt || 1;

  const x = (t) => ((t - minTime) / spanTime) * WIDTH;
  const y = (v) => HEIGHT - ((v - minVolt) / spanVolt) * HEIGHT;

  const line = samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");

  // Stretches where the device was offline, drawn under the trace
  const gaps = [];
  for (let i = 1; i < samples.length; i += 1) {
    if (!samples[i].on || !samples[i - 1].on) {
      gaps.push([x(samples[i - 1].t), x(samples[i].t)]);
    }
  }

  const hours = Math.round((maxTime - minTime) / 3600);

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img">
        {gaps.map(([from, to], index) => (
          <rect key={index} x={from} y="0" width={Math.max(1, to - from)} height={HEIGHT} className="spark-gap" />
        ))}
        <path d={line} className="spark-line" />
      </svg>
      <div className="sparkline-scale">
        <span>{minVolt.toFixed(2)}V</span>
        <span>
          {hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`} of history
        </span>
        <span>{maxVolt.toFixed(2)}V</span>
      </div>
    </div>
  );
}
