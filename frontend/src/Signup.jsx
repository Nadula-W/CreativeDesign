import React, { useEffect, useState } from "react";
import "./SignUp.css";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });

  // login page eke body eka design eka login page eke witharak nisa
  useEffect(() => {
    document.body.classList.add("auth-body");
    return () => {
      document.body.classList.remove("auth-body");
    };
  }, []);


  const handleSubmit = (e) => {
    e.preventDefault();//normally submit button eka click karama page eka refresh wena eka nawaththanna

    const ok = form.username.trim() && form.password.trim();
    if (!ok) return; //mokuth enter kare nathnm return wenna kiyala

    axios
      .post("http://localhost:3000/api/login", { username: form.username, password: form.password })
      .then((result) => {
        console.log(result);
        navigate("/home");
      })
      .catch((err) => console.log(err));
  };

  return (
    <div className="ring">
      <i style={{ "--clr": "#00ff0a" }} />
      <i style={{ "--clr": "#ff0057" }} />
      <i style={{ "--clr": "#fffd44" }} />

      <div className="login">
        <h2>Login</h2>

        <form onSubmit={handleSubmit}>
          <div className="inputBx">
            <input
              type="text"
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>

          <div className="inputBx">
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </form>

        {/* kept as-is: Link wrapping the submit input */}
        <Link to="/Home">
          <div className="inputBx">
            <input
              type="submit"
              value="Sign in"
              onClick={(e) => {
                e.preventDefault();   
                e.stopPropagation();
                handleSubmit(e);     
              }}
            />
  </div>
</Link>


        <div className="links">
          <Link to="/forgot">Forget Password</Link>
        </div>

        <Link to="/register" className="Register">
          <h4>Don’t have an account? Sign Up</h4>
        </Link>
      </div>
    </div>
  );
}
