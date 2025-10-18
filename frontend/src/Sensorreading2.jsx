
import "./Sensorreading.css";
import React from "react";
import Meter from "./component/Meter";

export default function Sensorreading2({ idPrefix }) {
  const data = {
    temperature: 35.6,
    humidity: 58.6,
    airQuality: 20,
    co2: 33,
    o3: 40,
    noise: 63,
  };

  return (
    <div className="sensor-container">
      <div className="sensor-grid">
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Temperature" value={data.temperature} unit="°C" min={0} max={50} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Humidity" value={data.humidity} unit="%" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Air Quality" value={data.airQuality} unit="%" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="CO2 Level" value={data.co2} unit="" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Noise Level" value={data.noise} unit="dB" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Ozone level" value={data.o3} unit="" min={0} max={100} />
        </div>
      </div>
    </div>
  );
}
