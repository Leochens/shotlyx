"use client";

import Link from "next/link";
import { PRODUCT_NAME } from "@/site/brand";
import { useAppLocale } from "@/i18n/use-app-locale";
import { ShotlyxLogo } from "@/components/brand-logo";

export function Footer() {
	const { copy } = useAppLocale();

	return (
		<footer className="border-slate-950/10 border-t bg-[#f6fbfc] text-slate-950 dark:border-white/10 dark:bg-[#050607] dark:text-white">
			<div className="mx-auto max-w-7xl px-6 py-12">
				<div className="mb-8 grid grid-cols-1 gap-12 md:grid-cols-2">
					<div className="max-w-sm md:col-span-1">
						<div className="mb-4 flex items-center justify-start gap-2">
							<ShotlyxLogo
								size={34}
								alt=""
								className="drop-shadow-[0_0_18px_rgba(34,211,238,0.2)]"
							/>
							<span className="font-semibold tracking-[0.18em] text-sm uppercase">
								{PRODUCT_NAME}
							</span>
						</div>
						<p className="mb-5 text-sm text-slate-600 leading-6 dark:text-white/58 md:text-left">
							{copy.footer.description}
						</p>
					</div>

					<div className="flex items-start justify-start gap-12 py-2">
						{copy.footer.categories.map((category) => (
							<div key={category.label} className="flex flex-col gap-2">
								<h3 className="font-mono text-slate-700 text-xs uppercase tracking-[0.18em] dark:text-white/80">
									{category.label}
								</h3>
								<ul className="space-y-2 text-sm">
									{category.links.map((link) => (
										<li key={link.href}>
											<Link
												href={link.href}
												className="text-slate-500 transition-colors hover:text-cyan-700 dark:text-white/45 dark:hover:text-cyan-200"
												target={
													link.href.startsWith("http") ? "_blank" : undefined
												}
												rel={
													link.href.startsWith("http")
														? "noopener noreferrer"
														: undefined
												}
											>
												{link.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col items-start justify-between gap-4 pt-2 md:flex-row">
					<div className="flex items-center gap-4 font-mono text-slate-400 text-xs uppercase tracking-[0.16em] dark:text-white/35">
						<span>
							© {new Date().getFullYear()} {PRODUCT_NAME}
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
