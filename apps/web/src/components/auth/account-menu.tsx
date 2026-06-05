"use client";

import { LogOut } from "lucide-react";
import { clearAuthSession, type AuthUser } from "@/auth/client";
import { useRouter } from "@/platform/router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountIdentity = Pick<AuthUser, "email" | "name">;

function takeInitials(value: string): string {
	const parts = value
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
	}
	return (parts[0] ?? value.trim()).slice(0, 2).toUpperCase();
}

export function getAccountInitials(user: AccountIdentity): string {
	const nameInitials = takeInitials(user.name);
	if (nameInitials) return nameInitials;
	const emailLocalPart = user.email.split("@")[0] ?? "";
	return takeInitials(emailLocalPart) || "U";
}

export function AccountMenu({ user }: { user: AuthUser }) {
	const router = useRouter();
	const displayName = user.name.trim() || user.email.split("@")[0] || user.email;

	const handleLogout = () => {
		clearAuthSession();
		router.replace("/login");
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="size-9 rounded-full border-border/70 bg-background p-0 hover:bg-accent"
					aria-label="账户菜单"
					title="账户菜单"
				>
					<Avatar className="size-8">
						<AvatarFallback className="bg-cyan-500/10 font-medium text-cyan-700 text-xs dark:bg-cyan-300/10 dark:text-cyan-100">
							{getAccountInitials(user)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<div className="px-2 py-1.5">
					<p className="truncate font-medium text-sm">{displayName}</p>
					<p className="truncate text-muted-foreground text-xs">{user.email}</p>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					icon={<LogOut />}
					onSelect={handleLogout}
				>
					退出登录
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
