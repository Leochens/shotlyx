"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/platform/router";
import { toast } from "sonner";
import { ArrowRight, Fingerprint, Loader2, Terminal } from "lucide-react";
import { loginWithEmail, registerWithEmail } from "@/auth/client";
import { PRODUCT_NAME } from "@/site/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";
import { useShotlyxRouter } from "@/platform/router";

type AuthMode = "sign-in" | "sign-up";

export function LoginForm() {
	const router = useRouter();
	const { route } = useShotlyxRouter();
	const { copy } = useAppLocale();
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isSignUp = mode === "sign-up";
	const authModeOptions: { value: AuthMode; label: string }[] = [
		{ value: "sign-in", label: copy.auth.signIn },
		{ value: "sign-up", label: copy.auth.signUp },
	];

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSubmitting(true);

		try {
			if (isSignUp) {
				await registerWithEmail({
					email,
					password,
					name: name || email.split("@")[0] || PRODUCT_NAME,
				});
			} else {
				await loginWithEmail({ email, password });
			}

			const next = new URLSearchParams(route.search).get("next");
			router.push(next?.startsWith("/") ? next : "/projects");
			router.refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : copy.auth.authFailed,
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="border border-slate-950/10 bg-white/86 p-5 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#080b0c]/92 dark:shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-7">
			<div className="mb-7 flex items-start justify-between gap-4">
				<div>
					<div className="mb-3 inline-flex items-center gap-2 border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 font-mono text-cyan-700 text-xs uppercase tracking-[0.18em] dark:border-cyan-300/25 dark:bg-cyan-300/8 dark:text-cyan-100/80">
						<Terminal className="size-3.5" />
						{copy.auth.secureConsole}
					</div>
					<h1 className="text-3xl font-bold tracking-normal text-slate-950 dark:text-white">
						{isSignUp ? copy.auth.initialize : copy.auth.resume}
					</h1>
					<p className="mt-2 text-sm text-slate-500 leading-6 dark:text-white/48">
						{PRODUCT_NAME} {copy.auth.body}
					</p>
				</div>
				<div className="grid size-11 place-items-center border border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/8 dark:text-cyan-200">
					<Fingerprint className="size-5" />
				</div>
			</div>

			<div className="mb-6 grid grid-cols-2 gap-px bg-slate-950/10 p-px dark:bg-white/10">
				{authModeOptions.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						className={cn(
							"h-10 bg-white font-mono text-xs uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-slate-950 dark:bg-[#050607] dark:text-white/45 dark:hover:text-white",
							mode === value && "bg-cyan-300 text-black hover:text-black",
						)}
						onClick={() => setMode(value)}
					>
						{label}
					</button>
				))}
			</div>

			<form className="space-y-5" onSubmit={handleSubmit}>
				{isSignUp && (
					<div className="space-y-2">
						<Label
							htmlFor="name"
							className="font-mono uppercase tracking-[0.16em]"
						>
							{copy.auth.name}
						</Label>
						<Input
							id="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							autoComplete="name"
							className="h-11 rounded-none border-slate-950/10 bg-white/70 text-slate-950 dark:border-white/10 dark:bg-black/30 dark:text-white"
							placeholder={copy.auth.namePlaceholder}
						/>
					</div>
				)}

				<div className="space-y-2">
					<Label
						htmlFor="email"
						className="font-mono uppercase tracking-[0.16em]"
					>
						{copy.auth.email}
					</Label>
					<Input
						id="email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						autoComplete="email"
						required
						className="h-11 rounded-none border-slate-950/10 bg-white/70 text-slate-950 dark:border-white/10 dark:bg-black/30 dark:text-white"
						placeholder={copy.auth.emailPlaceholder}
					/>
				</div>

				<div className="space-y-2">
					<Label
						htmlFor="password"
						className="font-mono uppercase tracking-[0.16em]"
					>
						{copy.auth.password}
					</Label>
					<Input
						id="password"
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						autoComplete={isSignUp ? "new-password" : "current-password"}
						required
						minLength={8}
						showPassword={showPassword}
						onShowPasswordChange={setShowPassword}
						className="h-11 rounded-none border-slate-950/10 bg-white/70 text-slate-950 dark:border-white/10 dark:bg-black/30 dark:text-white"
						placeholder={copy.auth.passwordPlaceholder}
					/>
				</div>

				<Button
					type="submit"
					disabled={isSubmitting}
					className="h-12 w-full rounded-none bg-cyan-300 text-black hover:bg-cyan-200"
				>
					{isSubmitting ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<ArrowRight className="size-4" />
					)}
					{isSignUp ? copy.auth.createWorkspace : copy.auth.enterConsole}
				</Button>
			</form>
		</div>
	);
}
