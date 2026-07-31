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
	title: "Third-Party Notices - Shotlyx",
	description:
		"OpenCut lineage, third-party dependency notices, and asset provenance guidance for Shotlyx.",
};

export default function ThirdPartyNoticesPage() {
	return (
		<BasePage
			title="Third-party notices"
			description="Shotlyx keeps upstream attribution and dependency notice boundaries visible for public and self-hosted deployments."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">OpenCut Lineage</h2>
				<p>
					Shotlyx includes code derived from the OpenCut project, including
					foundational browser editor and runtime code.
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>OpenCut is licensed under the MIT License.</li>
					<li>Copyright 2025-2026 OpenCut.</li>
					<li>
						The preserved OpenCut MIT notice is available in the repository at{" "}
						<Link
							href={`${SOCIAL_LINKS.github}/blob/main/licenses/OpenCut-MIT.txt`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							licenses/OpenCut-MIT.txt
						</Link>
						.
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Dependency Notices</h2>
				<p>
					JavaScript, TypeScript, Rust, and deployment dependencies remain
					subject to their own licenses and upstream notices. Review the exact
					package versions included in your distribution or hosted deployment.
				</p>
				<p>
					The repository notice index is maintained in{" "}
					<Link
						href={`${SOCIAL_LINKS.github}/blob/main/THIRD_PARTY_NOTICES.md`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						THIRD_PARTY_NOTICES.md
					</Link>
					.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Assets and Generated Media</h2>
				<p>
					Third-party media, fonts, templates, example footage, generated
					outputs, stock assets, and provider content are not automatically
					covered by the Shotlyx AGPL-3.0-only repository license.
				</p>
			</section>

			<Separator />

			<p className="text-muted-foreground text-sm">
				For source and warranty context, see{" "}
				<Link href="/source" className="text-primary hover:underline">
					Source code
				</Link>{" "}
				and{" "}
				<Link href="/license" className="text-primary hover:underline">
					License
				</Link>
				.
			</p>
		</BasePage>
	);
}
