"use client";

import { ArrowRightIcon, Bot, CircuitBoard, Sparkles } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { SOCIAL_LINKS } from "@/site/social";
import { PRODUCT_NAME } from "@/site/brand";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../ui/dialog";

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenOnboarding",
		defaultValue: false,
	});

	const isOpen = !hasSeenOnboarding;

	const handleNext = () => {
		setStep(step + 1);
	};

	const handleClose = () => {
		setHasSeenOnboarding({ value: true });
	};

	const getStepTitle = () => {
		switch (step) {
			case 0:
				return `${PRODUCT_NAME} Command Layer`;
			case 1:
				return "Beta control room";
			case 2:
				return "Start the first cut";
			default:
				return `${PRODUCT_NAME} Onboarding`;
		}
	};

	const renderStepContent = () => {
		switch (step) {
			case 0:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<StepSignal label="AI Native Workspace" />
							<Title title="把想法交给时间线" />
							<Description description="Agent 会围绕成片目标组织计划、调用工具，并把执行过程留在左侧指挥区。" />
							<SignalGrid />
						</div>
						<NextButton onClick={handleNext}>继续</NextButton>
					</div>
				);
			case 1:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<StepSignal label="Beta Lab" />
							<Title title={getStepTitle()} />
							<Description description="这里会优先验证 AI 剪辑、素材补位、字幕、旁白这些高频任务。" />
							<Description description="遇到不确定的操作，Agent 会先给你选择，而不是直接改掉项目。" />
						</div>
						<NextButton onClick={handleNext}>继续</NextButton>
					</div>
				);
			case 2:
				return (
					<div className="space-y-5">
						<div className="space-y-3">
							<StepSignal label="Feedback Loop" />
							<Title title={getStepTitle()} />
							<Description
								description={`加入 [Discord](${SOCIAL_LINKS.discord})，把你真实的剪辑场景和不顺手的地方丢给我们。`}
							/>
						</div>
						<NextButton onClick={handleClose}>进入编辑器</NextButton>
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="overflow-hidden rounded-sm border-cyan-300/20 bg-[#07100d] text-slate-100 shadow-[0_30px_120px_rgba(0,0,0,0.48)] sm:max-w-[440px]">
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
				<DialogTitle>
					<span className="sr-only">{getStepTitle()}</span>
				</DialogTitle>
				<DialogDescription className="sr-only">
					{PRODUCT_NAME} AI-native editing workspace onboarding.
				</DialogDescription>
				<DialogBody className="p-6">{renderStepContent()}</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function StepSignal({ label }: { label: string }) {
	return (
		<div className="inline-flex items-center gap-2 rounded-sm border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-200">
			<Sparkles className="size-3.5" />
			{label}
		</div>
	);
}

function SignalGrid() {
	const items = [
		{ icon: Bot, label: "Agent" },
		{ icon: CircuitBoard, label: "Tools" },
		{ icon: Sparkles, label: "Preview" },
	];

	return (
		<div className="grid grid-cols-3 gap-2 pt-1">
			{items.map(({ icon: Icon, label }) => (
				<div
					key={label}
					className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] text-slate-300"
				>
					<Icon className="size-4 text-cyan-200" />
					<span className="text-xs font-medium">{label}</span>
				</div>
			))}
		</div>
	);
}

function Title({ title }: { title: string }) {
	return (
		<h2 className="text-xl font-semibold tracking-normal text-slate-50 md:text-2xl">
			{title}
		</h2>
	);
}

function Description({ description }: { description: string }) {
	return (
		<div className="text-sm leading-6 text-slate-400">
			<ReactMarkdown
				components={{
					p: ({ children }) => <p className="mb-0">{children}</p>,
					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-cyan-200 underline underline-offset-4 hover:text-cyan-100"
						>
							{children}
						</a>
					),
				}}
			>
				{description}
			</ReactMarkdown>
		</div>
	);
}

function NextButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<Button
			onClick={onClick}
			variant="default"
			className="h-10 w-full rounded-sm bg-cyan-300 text-neutral-950 hover:bg-cyan-200"
		>
			{children}
			<ArrowRightIcon className="size-4" />
		</Button>
	);
}
