import { ThemeProvider } from "@/platform/theme";
import Script from "@/platform/script";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { isDesktopMode } from "@/desktop/config/server";

const enableReactScan = process.env.VITE_REACT_SCAN === "true";

export const metadata = baseMetaData;

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{process.env.NODE_ENV === "development" && enableReactScan && (
					<>
						<Script
							src="//unpkg.com/react-scan/dist/auto.global.js"
							crossOrigin="anonymous"
							strategy="beforeInteractive"
						/>
					</>
				)}
			</head>
			<body className="font-sans antialiased">
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					disableTransitionOnChange={true}
				>
					<TooltipProvider>
						<Toaster />
						{children}
					</TooltipProvider>
				</ThemeProvider>
				<Script
					src="https://cdn.databuddy.cc/databuddy.js"
					strategy="afterInteractive"
					async
					data-client-id="UP-Wcoy5arxFeK7oyjMMZ"
					data-disabled={
						process.env.NODE_ENV === "development" || isDesktopMode()
					}
					data-track-attributes={false}
					data-track-errors={true}
					data-track-outgoing-links={false}
					data-track-web-vitals={false}
					data-track-sessions={false}
				/>
			</body>
		</html>
	);
}
