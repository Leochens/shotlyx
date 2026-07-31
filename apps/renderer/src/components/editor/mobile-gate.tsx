"use client";

import { useEffect, useState } from "react";
import Link from "@/platform/link";
import { Button } from "../ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "@/platform/router";

const STORAGE_KEY = "mobile-acknowledged";

function getMobileAcknowledged() {
	try {
		return window.localStorage?.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function setMobileAcknowledged() {
	try {
		window.localStorage?.setItem(STORAGE_KEY, "true");
	} catch {
		// Storage can be unavailable in embedded browser previews.
	}
}

interface MobileGateProps {
	children: React.ReactNode;
}

export function MobileGate({ children }: MobileGateProps) {
	const router = useRouter();
	const [show, setShow] = useState<boolean | null>(null);

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			const isMobile = window.innerWidth < 1024;
			const acknowledged = getMobileAcknowledged();
			setShow(isMobile && !acknowledged);
		});

		return () => window.cancelAnimationFrame(frame);
	}, []);

	if (show === null) return null;
	if (!show) return <>{children}</>;

	const handleContinue = () => {
		setMobileAcknowledged();
		setShow(false);
	};

	const handleGoBack = () => {
		router.back();
	};

	return (
		<div className="bg-background relative flex h-screen w-screen flex-col overflow-hidden">
			<Button
				variant="text"
				className="absolute top-6 left-6 flex items-center gap-1 text-muted-foreground"
				onClick={handleGoBack}
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
				<span className=" text-sm">Go back</span>
			</Button>

			<div className="flex flex-1 flex-col justify-center gap-5 px-7">
				<div className="flex flex-col gap-3">
					<h1 className="text-foreground text-3xl font-bold tracking-tight">
						Desktop only (for now)
					</h1>
					<p className="text-muted-foreground text-sm leading-relaxed">
						This workspace isn&apos;t optimized for mobile or iPad yet. Things will break
						and the layout will be a mess. Come back on a desktop for the real
						experience.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Button onClick={handleContinue}>Take a look anyway</Button>
					<Button variant="ghost" asChild>
						<Link href="/projects" className="flex items-center gap-1">
							Roadmap
							<HugeiconsIcon icon={ArrowRight01Icon} size={14} />
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
