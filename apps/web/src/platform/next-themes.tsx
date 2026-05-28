import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	resolvedTheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "shotlyx-theme";

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function readInitialTheme(defaultTheme: Theme): Theme {
	if (typeof window === "undefined") return defaultTheme;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return stored === "light" || stored === "dark" || stored === "system"
		? stored
		: defaultTheme;
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
}: {
	children: ReactNode;
	attribute?: "class";
	defaultTheme?: Theme;
	disableTransitionOnChange?: boolean;
}) {
	const [theme, setThemeState] = useState<Theme>(() =>
		readInitialTheme(defaultTheme),
	);
	const [systemTheme, setSystemTheme] = useState(getSystemTheme);
	const resolvedTheme = theme === "system" ? systemTheme : theme;

	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const updateSystemTheme = () => setSystemTheme(getSystemTheme());
		query.addEventListener("change", updateSystemTheme);
		return () => query.removeEventListener("change", updateSystemTheme);
	}, []);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
		window.localStorage.setItem(STORAGE_KEY, theme);
	}, [resolvedTheme, theme]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			theme,
			resolvedTheme,
			setTheme: (nextTheme) => setThemeState(nextTheme),
		}),
		[resolvedTheme, theme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme() {
	const value = useContext(ThemeContext);
	if (value) return value;
	return {
		theme: "system" as const,
		resolvedTheme: getSystemTheme(),
		setTheme: () => {},
	};
}
