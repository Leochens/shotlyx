"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/ui";
import { useTopicWorkbenchStore } from "./store";

export function CreatorProfileDialogTrigger({
	className,
	label = "账号画像",
}: {
	className?: string;
	label?: string;
}) {
	const creatorProfile = useTopicWorkbenchStore(
		(state) => state.creatorProfile,
	);
	const setCreatorProfile = useTopicWorkbenchStore(
		(state) => state.setCreatorProfile,
	);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(creatorProfile);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setDraft(creatorProfile);
		setOpen(nextOpen);
	};

	const hasProfile = creatorProfile.trim().length > 0;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					className={cn("shrink-0", className)}
				>
					<UserRound size={14} />
					{hasProfile ? label : "填写账号画像"}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-xl rounded-sm">
				<DialogHeader>
					<DialogTitle>全局用户画像</DialogTitle>
					<DialogDescription>
						介绍账号定位、受众、内容风格、常用平台和不能碰的表达边界。Agent
						会把这些作为选题、调研和脚本建议的长期上下文。
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={9}
						placeholder="例如：我是做 AI 工具和独立开发内容的创作者，主要发 B 站和 YouTube，受众是想提升生产力的产品经理、设计师和开发者。我的内容需要真实实验、少一点空泛预测，多一点可执行流程。"
						className="min-h-48 bg-background leading-6"
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						取消
					</Button>
					<Button
						onClick={() => {
							setCreatorProfile({ profile: draft });
							setOpen(false);
						}}
					>
						保存画像
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
