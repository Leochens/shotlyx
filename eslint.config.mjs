import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import preferObjectParams from "./eslint/rules/prefer-object-params.mjs";

const rendererFiles = ["apps/renderer/src/**/*.{ts,tsx}"];

const shotlyxEslintPlugin = {
	meta: {
		name: "eslint-plugin-shotlyx",
		version: "0.0.0",
	},
	rules: {
		"prefer-object-params": preferObjectParams,
	},
};

function scopeToRendererFiles(config) {
	return {
		...config,
		files: rendererFiles,
	};
}

export default [
	{
		ignores: ["**/node_modules/**", "**/dist/**", "**/build/**"],
	},
	{
		files: rendererFiles,
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		linterOptions: {
			reportUnusedDisableDirectives: "warn",
		},
		settings: {
			react: {
				version: "detect",
			},
		},
	},
	scopeToRendererFiles(js.configs.recommended),
	...tseslint.configs.recommended.map(scopeToRendererFiles),
	scopeToRendererFiles(react.configs.flat.recommended),
	scopeToRendererFiles(react.configs.flat["jsx-runtime"]),
	scopeToRendererFiles(reactHooks.configs.flat["recommended-latest"]),
	scopeToRendererFiles(jsxA11y.flatConfigs.recommended),
	{
		files: rendererFiles,
		plugins: {
			shotlyx: shotlyxEslintPlugin,
		},
		rules: {
			"@typescript-eslint/no-empty-object-type": "warn",
			// These warnings predate the desktop-only extraction. Package scripts
			// enforce the current total as a ceiling so new debt still fails CI.
			"@typescript-eslint/no-unsafe-type-assertion": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"no-empty": "warn",
			"jsx-a11y/heading-has-content": "warn",
			"jsx-a11y/media-has-caption": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"shotlyx/prefer-object-params": "warn",

			// `react/prop-types` is for the JS-era React workflow where runtime
			// `propTypes` declarations are the prop contract. In this TS-only
			// scope the prop types already are the contract; the rule's only
			// effect is false positives when it can't trace destructured props
			// back to a `propTypes` definition that doesn't exist.
			"react/prop-types": "off",
		},
	},
	scopeToRendererFiles(eslintConfigPrettier),
];
