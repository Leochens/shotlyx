/*
 * SPDX-FileCopyrightText: 2026 GuanTou Lab and Shotlyx contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PageMetadata } from "@/platform/metadata";
import Link from "@/platform/link";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: PageMetadata = {
	title: "Source Code - Shotlyx",
	description:
		"Source code, license, warranty, and third-party notice entry points for Shotlyx.",
};

const sourceLinks = [
	{
		label: "Source repository",
		href: SOCIAL_LINKS.github,
		description: "Browse Shotlyx source code and public project history.",
	},
	{
		label: "AGPL-3.0-only license",
		href: "/license",
		description: "Read the community license and commercial licensing notes.",
	},
	{
		label: "Third-party notices",
		href: "/third-party-notices",
		description: "Review OpenCut lineage and third-party dependency notices.",
	},
];

export default function SourcePage() {
	return (
		<BasePage
			title="Source code"
			description="Shotlyx is distributed as AGPL-3.0-only community software with explicit source, license, and notice entry points."
		>
			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-semibold">Corresponding Source</h2>
				<p>
					The public Shotlyx source repository is the main place to inspect,
					fork, modify, self-host, and contribute to the community edition.
					Modified public network deployments should provide their own
					corresponding source as required by AGPL-3.0-only.
				</p>
			</section>

			<section className="grid gap-4">
				{sourceLinks.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						target={item.href.startsWith("http") ? "_blank" : undefined}
						rel={
							item.href.startsWith("http") ? "noopener noreferrer" : undefined
						}
						className="group border border-slate-950/10 p-5 transition-colors hover:border-cyan-600/50 dark:border-white/10 dark:hover:border-cyan-200/50"
					>
						<h2 className="font-semibold text-lg group-hover:text-cyan-700 dark:group-hover:text-cyan-200">
							{item.label}
						</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							{item.description}
						</p>
					</Link>
				))}
			</section>

			<Separator />

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">No Warranty</h2>
				<p>
					Shotlyx Community Edition is provided without warranty, as described
					in the AGPL-3.0-only license and project terms.
				</p>
			</section>
		</BasePage>
	);
}
