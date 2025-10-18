import React, { useState } from "react";
import "./NavBar.css";
import { Link } from "react-router-dom";
import { IoMenu, IoSettings } from "react-icons/io5";
import { BiSolidDashboard } from "react-icons/bi";
import { GrUserWorker, GrEmergency } from "react-icons/gr";
import { IoMdAlert, IoMdPerson, IoIosLogOut } from "react-icons/io";
import { SiSimpleanalytics } from "react-icons/si";

export default function NavBar({ onCollapse }) {
  const [collapsed, setCollapsed] = useState(false);

  const handleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    if (onCollapse) onCollapse(newState); // ✅ notify parent
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="logo_content">
        <button className="menu_btn" onClick={handleCollapse}>
          <IoMenu />
        </button>
        <span className="logo_name">Menu</span>
      </div>

      <ul className="navlist">
        <li>
          <Link to="/dashboard" className="navlink">
            <BiSolidDashboard />
            <span className="linktext">IoT Dashboard</span>
          </Link>
        </li>
        <li>
          <Link to="/workers" className="navlink">
            <GrUserWorker />
            <span className="linktext">Worker Check-ins</span>
          </Link>
        </li>
        <li>
          <Link to="/emergency" className="navlink">
            <GrEmergency />
            <span className="linktext">Emergency Buttons</span>
          </Link>
        </li>
        <li>
          <Link to="/alerts" className="navlink">
            <IoMdAlert />
            <span className="linktext">Alerts & Notifications</span>
          </Link>
        </li>
        <li>
          <Link to="/analytics" className="navlink">
            <SiSimpleanalytics />
            <span className="linktext">Analytics</span>
          </Link>
        </li>
      </ul>

      <ul className="navlist2">
        <li>
          <Link to="/settings" className="navlink">
            <IoSettings />
            <span className="linktext">Settings</span>
          </Link>
        </li>
        <li>
          <Link to="/about" className="navlink">
            <IoMdPerson />
            <span className="linktext">About</span>
          </Link>
        </li>
        <li>
          <Link to="/logout" className="navlink">
            <IoIosLogOut />
            <span className="linktext">Logout</span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}
