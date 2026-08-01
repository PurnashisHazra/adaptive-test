import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles/base.css";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/utilities.css";
import "./styles/components.css";
import "./styles/responsive.css";

console.log("Developed by Purnashis Hazra, Github: github.com/lobrockyl");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
    </BrowserRouter>
  </StrictMode>,
);
