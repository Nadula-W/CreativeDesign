import React, { useState } from "react";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import Sensorreading from "./Sensorreading";
import Sensorreading2 from "./Sensorreading2";
import PowerPanel from "./PowerPanel";
import "./Nametabs.css";
import NavBar from "./component/NavBar";

export default function Nametabs() {
  // sidebar collapsed state coming from NavBar
  const [collapsed, setCollapsed] = useState(false);

  // panel open/close state
  const [openDept, setOpenDept] = useState(null); // "Dep1" | "Dep2" | "Dep3" | "Dep4" | null

  // machine counts per department
  const machineCounts = {
    Dep1: 5,
    Dep2: 3,
    Dep3: 6,
    Dep4: 4,
  };

  const handleOpen = (key) => setOpenDept((prev) => (prev === key ? null : key));
  const handleClose = () => setOpenDept(null);

  return (
    <>
      {/* Sidebar */}
      <NavBar onCollapse={setCollapsed} />

      {/* Main content shifts when sidebar collapses */}
      <main className={`main_content ${collapsed ? "shifted" : ""}`}>
        <div className="dept-wrap">
          <div className="dept-card">
            <header className="dept-head">
              <h2 className="dept-title">IoT Dashboard - Departments</h2>
              <p className="dept-sub">View live meters for each department.</p>
            </header>

            <Tabs
              id="department-tabs"
              defaultActiveKey="Dep1"
              className="dept-tabs"
              justify
              mountOnEnter
              unmountOnExit
              variant="pills"
            >

              <Tab eventKey="Dep1" title="Department 1">
                <div className="dept-panel">
                  <Sensorreading idPrefix="dep1" />
                  <div className="machine-overview">
                    <h4 className="h">Click here to View the Individual Machine Values</h4>
                    <button className="click" onClick={() => handleOpen("Dep1")}>
                      {openDept === "Dep1" ? "Hide" : "Click Here"}
                    </button>
                  </div>

                  {openDept === "Dep1" && (
                    <PowerPanel
                      deptName="Department 1"
                      machineCount={machineCounts.Dep1}
                      onClose={handleClose}
                      simulate={true}
                    />
                  )}
                </div>
              </Tab>

          
              <Tab eventKey="Dep2" title="Department 2">
                <div className="dept-panel">
                  <Sensorreading2 idPrefix="dep2" />
                  <div className="machine-overview">
                    <h4 className="h">Click here to View the Individual Machine Values</h4>
                    <button className="click" onClick={() => handleOpen("Dep2")}>
                      {openDept === "Dep2" ? "Hide" : "Click Here"}
                    </button>
                  </div>

                  {openDept === "Dep2" && (
                    <PowerPanel
                      deptName="Department 2"
                      machineCount={machineCounts.Dep2}
                      onClose={handleClose}
                      simulate={true}
                    />
                  )}
                </div>
              </Tab>

              
              <Tab eventKey="Dep3" title="Department 3">
                <div className="dept-panel">
                  <Sensorreading idPrefix="dep3" />
                  <div className="machine-overview">
                    <h4 className="h">Click here to View the Individual Machine Values</h4>
                    <button className="click" onClick={() => handleOpen("Dep3")}>
                      {openDept === "Dep3" ? "Hide" : "Click Here"}
                    </button>
                  </div>

                  {openDept === "Dep3" && (
                    <PowerPanel
                      deptName="Department 3"
                      machineCount={machineCounts.Dep3}
                      onClose={handleClose}
                      simulate={true}
                    />
                  )}
                </div>
              </Tab>

           
              <Tab eventKey="Dep4" title="Department 4">
                <div className="dept-panel">
                  <Sensorreading idPrefix="dep4" />
                  <div className="machine-overview">
                    <h4 className="h">Click here to View the Individual Machine Values</h4>
                    <button className="click" onClick={() => handleOpen("Dep4")}>
                      {openDept === "Dep4" ? "Hide" : "Click Here"}
                    </button>
                  </div>

                  {openDept === "Dep4" && (
                    <PowerPanel
                      deptName="Department 4"
                      machineCount={machineCounts.Dep4}
                      onClose={handleClose}
                      simulate={true}
                    />
                  )}
                </div>
              </Tab>
            </Tabs>
          </div>
        </div>
      </main>
    </>
  );
}
