import { OcDataBuddyIcon, OcMarbleIcon } from "@/components/icons";

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
	{
		name: "Marble",
		description:
			"Modern headless CMS for content management and the Shotlyx blog",
		url: "https://marblecms.com?utm_source=shotlyx",
		icon: OcMarbleIcon,
	},
	{
		name: "Databuddy",
		description: "GDPR compliant analytics and user insights for Shotlyx",
		url: "https://databuddy.cc?utm_source=shotlyx",
		icon: OcDataBuddyIcon,
	},
];
