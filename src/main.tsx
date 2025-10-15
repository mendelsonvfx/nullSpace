import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictMode temporarily disabled to measure real render count (causes double renders in dev)
  // <React.StrictMode>
    <App />
  // </React.StrictMode>,
);