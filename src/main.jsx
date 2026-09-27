import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { PrintPreviewProvider } from "./component/PrintPreview/PrintPreviewContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PrintPreviewProvider><App /></PrintPreviewProvider>
  </React.StrictMode>,
);
