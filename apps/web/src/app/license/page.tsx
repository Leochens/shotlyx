/*
 * SPDX-FileCopyrightText: 2026 GuanTou Lab and Shotlyx contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Metadata } from "next";
import Link from "next/link";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = {
	title: "License - Shotlyx",
	description:
		"Shotlyx AGPL-3.0-only community license, commercial licensing notes, and warranty disclaimer.",
};

export default function LicensePage() {
	return (
		<BasePage
			title="License"
			description="Shotlyx Community Edition is licensed under AGPL-3.0-only. Commercial use is allowed only when you comply with the license terms."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Community License</h2>
				<p>
					Shotlyx Community Edition is licensed under AGPL-3.0-only. Commercial
					use is permitted only under the AGPL-3.0-only license terms; it is not
					unconditional commercial permission.
				</p>
				<p>
					If you run a modified public network version, the license requires you
					to make the corresponding source available under the same terms.
				</p>
				<p>
					The AGPL permission does not allow you to keep modified covered code
					closed, remove required notices, use Shotlyx or GuanTou Lab marks
					without permission, or operate a modified public network service
					without providing corresponding source.
				</p>
				<p>
					<Link
						href={`${SOCIAL_LINKS.github}/blob/main/LICENSE`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						Read the full AGPL-3.0-only license text
					</Link>
					.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Commercial Licensing</h2>
				<p>
					If you want to use Shotlyx under a proprietary license, include it in
					a closed-source product, offer a white-label or hosted deployment
					without AGPL source obligations, receive private integration support,
					or discuss enterprise/private deployment, contact GuanTou Lab.
				</p>
				<p>
					Commercial/proprietary licensing is available only for code and assets
					for which GuanTou Lab has sufficient licensing rights.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Source and Notices</h2>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						<Link href="/source" className="text-primary hover:underline">
							Source code
						</Link>
					</li>
					<li>
						<Link
							href="/third-party-notices"
							className="text-primary hover:underline"
						>
							Third-party notices
						</Link>
					</li>
					<li>
						<Link
							href={`${SOCIAL_LINKS.github}/blob/main/TRADEMARK.md`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							Trademark policy
						</Link>
					</li>
				</ul>
			</section>

			<Separator />

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">No Warranty</h2>
				<p>
					Shotlyx is provided as-is, without warranty. This page is practical
					project guidance, not legal advice.
				</p>
			</section>
		</BasePage>
	);
}
