"use client";

import Image from "next/image";
import Link from "next/link";
import {
	ArrowRight,
	BrainCircuit,
	Code2,
	FileVideo,
	GitBranch,
	Sparkles,
	Terminal,
	Workflow,
	Zap,
} from "lucide-react";
import { Button } from "../ui/button";
import { PRODUCT_NAME } from "@/site/brand";
import { useAppLocale } from "@/i18n/use-app-locale";

const PIPELINE_ICONS = [BrainCircuit, Workflow, GitBranch];
const PREVIEW_STATUS_ICONS = [FileVideo, Zap, Workflow];

export function Hero() {
	const { copy } = useAppLocale();
	const hero = copy.hero;

	return (
		<main className="min-h-screen overflow-hidden bg-[#f6fbfc] text-slate-950 dark:bg-[#050607] dark:text-white">
			<section className="relative flex min-h-[92svh] flex-col px-4 pt-24 sm:px-6 lg:px-8">
				<Atmosphere />
				<div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1fr)]">
					<div className="max-w-3xl">
						<div className="mb-8 inline-flex items-center gap-2 border border-cyan-600/20 bg-cyan-500/10 px-3 py-1.5 font-mono text-cyan-700 text-xs uppercase tracking-[0.2em] dark:border-cyan-300/25 dark:bg-cyan-300/8 dark:text-cyan-100/80">
							<Terminal className="size-3.5" />
							{hero.kicker}
						</div>

						<h1 className="text-balance font-black text-5xl leading-[0.92] tracking-normal sm:text-7xl lg:text-8xl">
							{hero.title}
						</h1>

						<p className="mt-7 max-w-2xl text-lg text-slate-600 leading-8 dark:text-white/62 sm:text-xl">
							{PRODUCT_NAME} {hero.body}
						</p>

						<div className="mt-8 flex flex-col gap-3 sm:flex-row">
							<Button
								asChild
								size="lg"
								className="h-12 rounded-md bg-cyan-300 px-6 text-black hover:bg-cyan-200"
							>
								<Link href="/projects">
									{hero.launch}
									<ArrowRight className="size-4" />
								</Link>
							</Button>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="h-12 rounded-md border-slate-950/10 bg-white/80 px-6 text-slate-700 hover:bg-slate-100 dark:border-white/12 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10"
							>
								<Link href="/login">
									{hero.login}
									<Terminal className="size-4" />
								</Link>
							</Button>
						</div>

						<div className="mt-10 grid max-w-xl grid-cols-2 gap-3 font-mono text-[0.7rem] text-slate-500 uppercase tracking-[0.18em] dark:text-white/45 sm:grid-cols-5">
							{hero.signals.map((signal) => (
								<div
									key={signal}
									className="border-slate-950/10 border-t pt-3 dark:border-white/10"
								>
									{signal}
								</div>
							))}
						</div>
					</div>

					<EditorPreview />
				</div>

				<div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between border-slate-950/10 border-t py-5 font-mono text-[0.68rem] text-slate-500 uppercase tracking-[0.2em] dark:border-white/10 dark:text-white/38">
					<span>{hero.footerLeft}</span>
					<span className="hidden sm:inline">{hero.footerRight}</span>
				</div>
			</section>

			<section
				id="engine"
				className="relative border-slate-950/10 border-t px-4 py-20 dark:border-white/10 sm:px-6 lg:px-8"
			>
				<div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
					<div>
						<p className="font-mono text-cyan-700 text-xs uppercase tracking-[0.22em] dark:text-cyan-200">
							{hero.engineKicker}
						</p>
						<h2 className="mt-4 max-w-xl text-4xl font-bold tracking-normal sm:text-5xl">
							{hero.engineTitle}
						</h2>
					</div>
					<div className="grid gap-px overflow-hidden border border-slate-950/10 bg-slate-950/10 dark:border-white/10 dark:bg-white/10 md:grid-cols-3">
						{hero.pipeline.map((item, index) => {
							const Icon = PIPELINE_ICONS[index] ?? BrainCircuit;
							return (
								<div
									key={item.title}
									className="bg-white/85 p-6 dark:bg-[#080b0c]"
								>
									<Icon className="mb-8 size-6 text-cyan-700 dark:text-cyan-200" />
									<p className="font-mono text-[0.68rem] text-slate-400 uppercase tracking-[0.18em] dark:text-white/35">
										{item.kicker}
									</p>
									<h3 className="mt-4 text-lg font-semibold leading-6">
										{item.title}
									</h3>
									<p className="mt-4 text-sm text-slate-600 leading-6 dark:text-white/50">
										{item.body}
									</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<section
				id="pipeline"
				className="border-slate-950/10 border-t px-4 py-20 dark:border-white/10 sm:px-6 lg:px-8"
			>
				<div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
					<div className="border border-slate-950/10 bg-white/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
						<div className="mb-6 flex items-center gap-2 font-mono text-slate-500 text-xs uppercase tracking-[0.18em] dark:text-white/45">
							<Code2 className="size-4 text-cyan-700 dark:text-cyan-200" />
							{hero.traceTitle}
						</div>
						<pre className="overflow-hidden text-sm text-slate-700 leading-7 dark:text-white/70">
							{hero.trace}
						</pre>
					</div>
					<div id="labs" className="flex flex-col justify-center">
						<p className="font-mono text-cyan-700 text-xs uppercase tracking-[0.22em] dark:text-cyan-200">
							{hero.labsKicker}
						</p>
						<h2 className="mt-4 text-4xl font-bold tracking-normal sm:text-5xl">
							{hero.labsTitle}
						</h2>
						<p className="mt-6 max-w-xl text-slate-600 leading-7 dark:text-white/55">
							{hero.labsBody}
						</p>
					</div>
				</div>
			</section>
		</main>
	);
}

function Atmosphere() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			<div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.055)_1px,transparent_1px)] bg-[size:52px_52px] dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(8,145,178,0.16),transparent_34%),radial-gradient(circle_at_25%_72%,rgba(132,204,22,0.1),transparent_30%)] dark:bg-[radial-gradient(circle_at_65%_20%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_25%_72%,rgba(132,204,22,0.12),transparent_30%)]" />
			<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,251,252,0.1),#f6fbfc_96%)] dark:bg-[linear-gradient(180deg,rgba(5,6,7,0.12),#050607_96%)]" />
		</div>
	);
}

function EditorPreview() {
	const { copy } = useAppLocale();
	const hero = copy.hero;

	return (
		<div className="relative mx-auto w-full max-w-2xl">
			<div className="-inset-6 absolute border border-cyan-500/10 bg-cyan-500/[0.03] dark:border-cyan-300/10 dark:bg-cyan-300/[0.02]" />
			<div className="relative border border-slate-950/12 bg-white/90 shadow-[0_30px_100px_rgba(15,23,42,0.18)] dark:border-white/12 dark:bg-[#090d0f] dark:shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
				<div className="flex items-center justify-between border-slate-950/10 border-b px-4 py-3 font-mono text-[0.68rem] text-slate-400 uppercase tracking-[0.18em] dark:border-white/10 dark:text-white/38">
					<span>{hero.workspaceLabel}</span>
					<span className="text-cyan-700 dark:text-cyan-200">
						{hero.agentOnline}
					</span>
				</div>
				<div className="grid gap-px bg-slate-950/10 dark:bg-white/10 lg:grid-cols-[0.8fr_1.2fr]">
					<div className="bg-white p-4 dark:bg-[#080b0c]">
						<div className="mb-4 flex items-center gap-2 text-slate-700 dark:text-white/70">
							<Sparkles className="size-4 text-cyan-700 dark:text-cyan-200" />
							<span className="font-mono text-xs uppercase tracking-[0.16em]">
								{hero.previewPromptLabel}
							</span>
						</div>
						<p className="text-sm text-slate-600 leading-6 dark:text-white/62">
							{hero.previewPrompt}
						</p>
						<div className="mt-6 space-y-2 font-mono text-[0.68rem] text-slate-500 uppercase tracking-[0.14em] dark:text-white/45">
							{hero.previewRows.map(([label, value], index) => (
								<div
									key={label}
									className={
										index === 1
											? "flex items-center justify-between border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/8 dark:text-cyan-100"
											: "flex items-center justify-between border border-slate-950/10 px-3 py-2 dark:border-white/10"
									}
								>
									<span>{label}</span>
									<span>{value}</span>
								</div>
							))}
						</div>
					</div>
					<div className="bg-slate-100 p-3 dark:bg-[#050607]">
						<div className="relative aspect-[16/11] overflow-hidden border border-slate-950/10 dark:border-white/10">
							<Image
								src="/landing-page-dark.png"
								alt={`${PRODUCT_NAME} editor workspace preview`}
								fill
								className="object-cover opacity-88"
								priority
								sizes="(min-width: 1024px) 560px, 90vw"
							/>
							<div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_58%,rgba(5,6,7,0.64))] dark:bg-[linear-gradient(180deg,transparent_58%,rgba(5,6,7,0.82))]" />
							<div className="absolute right-3 bottom-3 left-3 grid grid-cols-4 gap-1">
								{[44, 72, 58, 86].map((width, index) => (
									<div key={width} className="h-7 bg-white/10">
										<div
											className="h-full bg-cyan-300/55"
											style={{ width: `${width}%` }}
										/>
										<span className="sr-only">timeline lane {index + 1}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-px bg-slate-950/10 font-mono text-[0.65rem] uppercase tracking-[0.16em] dark:bg-white/10">
					{hero.previewStatus.map((label, index) => {
						const Icon = PREVIEW_STATUS_ICONS[index] ?? FileVideo;
						return (
							<div
								key={label}
								className="flex items-center gap-2 bg-white px-3 py-3 text-slate-500 dark:bg-[#080b0c] dark:text-white/45"
							>
								<Icon className="size-3.5 text-cyan-700 dark:text-cyan-200" />
								<span>{label}</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
