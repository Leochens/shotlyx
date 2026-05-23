import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Braces, GitBranch, ShieldCheck, Terminal } from "lucide-react";
import { PRODUCT_NAME, SITE_INFO } from "@/site/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: `Foundation - ${SITE_INFO.title}`,
	description: `${SITE_INFO.title} product foundation and licensing notes.`,
};

const NOTES = [
	{
		icon: Terminal,
		title: "Product identity",
		body: "The public interface, copy, and visual system now use the new AI-native workspace identity.",
	},
	{
		icon: GitBranch,
		title: "Source lineage",
		body: "The engineering foundation remains open to review through the repository and license notices.",
	},
	{
		icon: ShieldCheck,
		title: "User-facing clarity",
		body: "Attribution can live in legal or repository surfaces without making the old mark the product brand.",
	},
];

export default function BrandPage() {
	return (
		<main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
			<div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
				<header className="flex h-14 items-center justify-between">
					<Link href="/" className="flex items-center gap-3">
						<span className="grid size-9 place-items-center rounded-md border border-cyan-300/35 bg-cyan-300/10 text-cyan-200">
							<Braces className="size-5" />
						</span>
						<span className="font-semibold text-sm uppercase tracking-[0.18em]">
							{PRODUCT_NAME}
						</span>
					</Link>
					<Button
						asChild
						variant="outline"
						className="border-white/12 bg-white/[0.03] text-white hover:bg-white/10"
					>
						<Link href="/">
							Back
							<ArrowRight className="size-4" />
						</Link>
					</Button>
				</header>

				<section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr]">
					<div>
						<p className="font-mono text-cyan-200 text-xs uppercase tracking-[0.22em]">
							Foundation
						</p>
						<h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-normal sm:text-7xl">
							New face. Clear lineage.
						</h1>
						<p className="mt-7 max-w-xl text-lg text-white/55 leading-8">
							{PRODUCT_NAME} is presented as its own AI video workspace while
							keeping source and license context available where it belongs.
						</p>
					</div>

					<div className="grid gap-px overflow-hidden border border-white/10 bg-white/10">
						{NOTES.map((note) => (
							<div key={note.title} className="bg-[#080b0c] p-6">
								<note.icon className="mb-6 size-6 text-cyan-200" />
								<h2 className="text-xl font-semibold">{note.title}</h2>
								<p className="mt-3 text-sm text-white/50 leading-6">
									{note.body}
								</p>
							</div>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
