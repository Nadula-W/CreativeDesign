import React, { useState } from "react";
import "./Home.css";
import { Link } from "react-router-dom";
import NavBar from "./component/NavBar";
import { IoMdAlert } from "react-icons/io";
import { SiSimpleanalytics } from "react-icons/si";
import { GrEmergency } from "react-icons/gr";

export default function Home() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      
      <NavBar onCollapse={setCollapsed} />
      <main className={`main_content ${collapsed ? "shifted" : ""}`}>
        <div className="header hero">
          <div className="hero-text">
            <h1>Connect your Workshop Devices</h1>
            <p className="subtitle">
              Discover nearby devices, pair securely, and start streaming live sensor data.
            </p>

            <div className="hero-badges">
              <span className="badge">
                <IoMdAlert aria-hidden="true" />
                <span>Real-time alerts</span>
              </span>
              <span className="badge">
                <SiSimpleanalytics aria-hidden="true" />
                <span>Live analytics</span>
              </span>
              <span className="badge">
                <GrEmergency aria-hidden="true" />
                <span>Emergency ready</span>
              </span>
            </div>

            <Link to="/dashboard" className="Dashboard">
              <button type="button" className="cta-btn">
                Connect Devices
              </button>
            </Link>

            <small className="hint">
              After connecting, you’ll be taken to the IoT Dashboard.
            </small>
          </div>
        </div>
      </main>
    </>
  );
}
