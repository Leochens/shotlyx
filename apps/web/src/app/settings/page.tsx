import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/site/brand";

export default function SettingsPage() {
	return (
		<main className="min-h-screen bg-background px-6 py-10 text-foreground">
			<div className="mx-auto flex max-w-3xl flex-col gap-5">
				<div>
					<p className="text-sm text-muted-foreground">{PRODUCT_NAME}</p>
					<h1 className="text-3xl font-semibold tracking-normal">Settings</h1>
				</div>
				<p className="text-sm leading-6 text-muted-foreground">
					Desktop local mode starts from API configuration so Agent and
					provider-backed tools can run from the local server immediately.
				</p>
				<Button asChild className="w-fit">
					<Link href="/settings/api">
						<Settings className="size-4" />
						Open API settings
					</Link>
				</Button>
			</div>
		</main>
	);
}
