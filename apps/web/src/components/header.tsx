"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { ArrowRight, Braces, Terminal } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSelector } from "./language-selector";
import { Menu02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";
import { PRODUCT_NAME } from "@/site/brand";
import { useAppLocale } from "@/i18n/use-app-locale";

export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const { copy } = useAppLocale();
	const closeMenu = () => setIsMenuOpen(false);

	const links = copy.header.links;

	return (
		<header className="fixed top-0 right-0 left-0 z-40 border-slate-950/10 border-b bg-white/78 shadow-[0_24px_80px_rgba(15,23,42,0.1)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#050607]/75 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
			<div className="relative mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
				<div className="relative z-10 flex items-center gap-6">
					<Link href="/" className="group flex items-center gap-3">
						<span className="relative grid size-9 place-items-center overflow-hidden rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 shadow-[0_0_28px_rgba(8,145,178,0.14)] dark:border-cyan-300/35 dark:bg-cyan-300/10 dark:text-cyan-200 dark:shadow-[0_0_28px_rgba(34,211,238,0.28)]">
							<span className="absolute inset-x-1 top-1 h-px bg-cyan-500/70 dark:bg-cyan-200/70" />
							<Braces className="size-5 transition-transform group-hover:scale-110" />
						</span>
						<span className="font-semibold text-slate-950 tracking-[0.18em] text-sm uppercase dark:text-white">
							{PRODUCT_NAME}
						</span>
					</Link>

					<nav className="hidden items-center gap-4 md:flex">
						{links.map((link) => (
							<Link key={link.href} href={link.href}>
								<Button
									variant="text"
									className="p-0 font-mono text-slate-500 text-xs uppercase tracking-[0.18em] hover:text-slate-950 dark:text-white/58 dark:hover:text-white"
								>
									{link.label}
								</Button>
							</Link>
						))}
					</nav>
				</div>

				<div className="relative z-10">
					<div className="flex items-center gap-3 md:hidden">
						<Button
							variant="text"
							size="icon"
							className="flex items-center justify-center p-0 text-slate-950 dark:text-white"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
						>
							<HugeiconsIcon icon={Menu02Icon} size={30} />
						</Button>
					</div>
					<div className="hidden items-center gap-3 md:flex">
						<Link href="/login">
							<Button
								className="border-slate-950/10 bg-white/70 text-slate-700 text-sm hover:bg-slate-100 dark:border-white/12 dark:bg-white/[0.03] dark:text-white/75 dark:hover:bg-white/10"
								variant="outline"
							>
								<Terminal className="size-4" />
								{copy.header.login}
							</Button>
						</Link>
						<Link href="/projects">
							<Button className="bg-cyan-300 text-black text-sm hover:bg-cyan-200">
								{copy.header.launch}
								<ArrowRight className="size-4" />
							</Button>
						</Link>
						<LanguageSelector className="border-slate-950/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]" />
						<ThemeToggle className="border-slate-950/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]" />
					</div>
				</div>
				<div
					className={cn(
						"pointer-events-none fixed inset-0 bg-white/94 opacity-0 backdrop-blur-3xl dark:bg-[#050607]/90",
						"transition-opacity duration-150",
						isMenuOpen && "pointer-events-auto opacity-100",
					)}
				>
					<div className="relative h-full">
						<button
							type="button"
							aria-label="Close menu"
							className="absolute inset-0"
							onClick={closeMenu}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" ||
									event.key === " " ||
									event.key === "Escape"
								) {
									event.preventDefault();
									closeMenu();
								}
							}}
						/>
						<nav className="flex flex-col gap-3 px-6 pt-[5rem]">
							{links.map((link, index) => (
								<motion.div
									key={link.href}
									initial={{ scale: 0.98, opacity: 0 }}
									animate={{
										scale: isMenuOpen ? 1 : 0.98,
										opacity: isMenuOpen ? 1 : 0,
									}}
									transition={{
										duration: 0.4,
										delay: isMenuOpen ? index * 0.1 : 0,
										ease: [0.25, 0.46, 0.45, 0.94],
									}}
								>
									<Link
										href={link.href}
										className="font-mono text-2xl font-semibold text-slate-950 uppercase tracking-[0.14em] dark:text-white"
										onClick={() => setIsMenuOpen(false)}
									>
										{link.label}
									</Link>
								</motion.div>
							))}
							<motion.div
								initial={{ scale: 0.98, opacity: 0 }}
								animate={{
									scale: isMenuOpen ? 1 : 0.98,
									opacity: isMenuOpen ? 1 : 0,
								}}
								transition={{
									duration: 0.4,
									delay: isMenuOpen ? links.length * 0.1 : 0,
									ease: [0.25, 0.46, 0.45, 0.94],
								}}
							>
								<Link
									href="/login"
									className="font-mono text-2xl font-semibold text-cyan-700 uppercase tracking-[0.14em] dark:text-cyan-200"
									onClick={() => setIsMenuOpen(false)}
								>
									{copy.header.login}
								</Link>
							</motion.div>
						</nav>
						<div className="absolute right-6 bottom-6 flex items-center gap-2">
							<LanguageSelector className="h-10 border-slate-950/10 bg-white/80 dark:border-white/10 dark:bg-white/[0.03]" />
							<ThemeToggle
								className="h-10 border-slate-950/10 bg-white/80 dark:border-white/10 dark:bg-white/[0.03]"
								iconClassName="!size-[1.05rem]"
								onToggle={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
							/>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
