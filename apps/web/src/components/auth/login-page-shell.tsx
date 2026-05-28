"use client";

import Link from "@/platform/link";
import { Cpu, Network, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRODUCT_NAME } from "@/site/brand";
import { useAppLocale } from "@/i18n/use-app-locale";
import { ShotlyxLogo } from "@/components/brand-logo";

const SECURITY_ICONS = [ShieldCheck, Network, Cpu];

export function LoginPageShell() {
	const { copy } = useAppLocale();

	return (
		<main className="relative min-h-screen overflow-hidden bg-[#f6fbfc] px-4 py-6 text-slate-950 dark:bg-[#050607] dark:text-white sm:px-6 lg:px-8">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.055)_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(8,145,178,0.16),transparent_30%),radial-gradient(circle_at_78%_70%,rgba(132,204,22,0.09),transparent_34%)] dark:bg-[radial-gradient(circle_at_24%_20%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_78%_70%,rgba(132,204,22,0.1),transparent_34%)]"
			/>
			<div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col">
				<header className="flex h-14 items-center justify-between">
					<Link href="/" className="flex items-center gap-3">
						<ShotlyxLogo
							size={38}
							priority
							alt=""
							className="drop-shadow-[0_0_22px_rgba(34,211,238,0.24)]"
						/>
						<span className="font-semibold text-sm uppercase tracking-[0.18em]">
							{PRODUCT_NAME}
						</span>
					</Link>
					<div className="flex items-center gap-2">
						<LanguageSelector className="border-slate-950/10 bg-white/80 dark:border-white/10 dark:bg-white/[0.03]" />
						<ThemeToggle className="border-slate-950/10 bg-white/80 dark:border-white/10 dark:bg-white/[0.03]" />
						<Link
							href="/projects"
							className="hidden font-mono text-slate-500 text-xs uppercase tracking-[0.18em] transition-colors hover:text-cyan-700 dark:text-white/45 dark:hover:text-cyan-200 sm:inline"
						>
							{copy.header.workspace}
						</Link>
					</div>
				</header>

				<div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr]">
					<section className="max-w-2xl">
						<p className="font-mono text-cyan-700 text-xs uppercase tracking-[0.22em] dark:text-cyan-200">
							{copy.login.kicker}
						</p>
						<h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-normal sm:text-7xl">
							{copy.login.title}
						</h1>
						<p className="mt-7 max-w-xl text-lg text-slate-600 leading-8 dark:text-white/55">
							{copy.login.body}
						</p>

						<div className="mt-10 grid max-w-xl gap-px overflow-hidden border border-slate-950/10 bg-slate-950/10 dark:border-white/10 dark:bg-white/10 sm:grid-cols-3">
							{copy.login.telemetry.map(([label, value]) => (
								<div key={label} className="bg-white/85 p-4 dark:bg-[#080b0c]">
									<p className="font-mono text-[0.65rem] text-slate-400 uppercase tracking-[0.18em] dark:text-white/35">
										{label}
									</p>
									<p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
										{value}
									</p>
								</div>
							))}
						</div>
					</section>

					<section className="w-full max-w-md justify-self-center lg:justify-self-end">
						<LoginForm />
					</section>
				</div>

				<footer className="grid gap-px overflow-hidden border border-slate-950/10 bg-slate-950/10 font-mono text-[0.68rem] text-slate-500 uppercase tracking-[0.16em] dark:border-white/10 dark:bg-white/10 dark:text-white/45 sm:grid-cols-3">
					{copy.login.security.map((label, index) => {
						const Icon = SECURITY_ICONS[index] ?? ShieldCheck;
						return (
							<div
								key={label}
								className="flex items-center gap-2 bg-white/85 px-4 py-3 dark:bg-[#080b0c]"
							>
								<Icon className="size-3.5 text-cyan-700 dark:text-cyan-200" />
								<span>{label}</span>
							</div>
						);
					})}
				</footer>
			</div>
		</main>
	);
}
