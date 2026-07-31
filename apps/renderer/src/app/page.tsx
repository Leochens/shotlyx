import { Hero } from "@/components/landing/hero";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import type { PageMetadata } from "@/platform/metadata";
import { SITE_URL } from "@/site/brand";

export const metadata: PageMetadata = {
	alternates: {
		canonical: SITE_URL,
	},
};

export default function Home() {
	return (
		<div>
			<Header />
			<Hero />
			<Footer />
		</div>
	);
}
