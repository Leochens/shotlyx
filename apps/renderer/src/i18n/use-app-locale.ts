"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
	DEFAULT_APP_LOCALE,
	type AppLocale,
	getLocaleMeta,
	getSiteCopy,
	isAppLocale,
} from "./locales";

const STORAGE_KEY = "shotlyx:locale";

let currentLocale: AppLocale = DEFAULT_APP_LOCALE;
let hasHydratedLocale = false;
const listeners = new Set<() => void>();

function notifyListeners() {
	for (const listener of listeners) listener();
}

export function resolveAppLocaleFromLanguage(
	language?: string | null,
): AppLocale {
	return language?.toLowerCase().startsWith("zh")
		? "zh-CN"
		: DEFAULT_APP_LOCALE;
}

function resolveBrowserLocale(): AppLocale {
	if (typeof navigator === "undefined") return DEFAULT_APP_LOCALE;
	const primaryLanguage = navigator.languages?.[0] ?? navigator.language;
	return resolveAppLocaleFromLanguage(primaryLanguage);
}

function readStoredLocale(): AppLocale {
	if (typeof window === "undefined") return DEFAULT_APP_LOCALE;
	const storedLocale = window.localStorage.getItem(STORAGE_KEY);
	if (isAppLocale(storedLocale)) return storedLocale;
	return resolveBrowserLocale();
}

function applyDocumentLocale(locale: AppLocale) {
	if (typeof document === "undefined") return;
	document.documentElement.lang = getLocaleMeta(locale).htmlLang;
	document.documentElement.dataset.locale = locale;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return currentLocale;
}

function getServerSnapshot() {
	return DEFAULT_APP_LOCALE;
}

export function setAppLocale(locale: AppLocale) {
	currentLocale = locale;
	hasHydratedLocale = true;
	if (typeof window !== "undefined") {
		window.localStorage.setItem(STORAGE_KEY, locale);
	}
	applyDocumentLocale(locale);
	notifyListeners();
}

export function useAppLocale() {
	const locale = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	useEffect(() => {
		const nextLocale = readStoredLocale();
		if (hasHydratedLocale && currentLocale === nextLocale) {
			applyDocumentLocale(currentLocale);
			return;
		}

		currentLocale = nextLocale;
		hasHydratedLocale = true;
		applyDocumentLocale(nextLocale);
		notifyListeners();
	}, []);

	return {
		locale,
		setLocale: setAppLocale,
		copy: getSiteCopy(locale),
		localeMeta: getLocaleMeta(locale),
	};
}
