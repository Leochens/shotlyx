import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installDesktopApiFetch } from "./platform/api-fetch";
import { ViteShotlyxApp } from "./vite-app";

installDesktopApiFetch();

const root = document.getElementById("root");

if (!root) {
	throw new Error("Shotlyx root element is missing");
}

createRoot(root).render(
	<StrictMode>
		<ViteShotlyxApp />
	</StrictMode>,
);
