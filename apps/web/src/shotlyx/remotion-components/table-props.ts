import type { ShotlyxMGPropValue } from "./types";

export type ShotlyxMGTableCellValue = string | number | boolean;
export type ShotlyxMGTableRow = Record<string, ShotlyxMGTableCellValue>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTableCellValue(value: unknown): value is ShotlyxMGTableCellValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

export function getShotlyxMGTableColumns({
	columns,
	value,
}: {
	columns?: string[];
	value: ShotlyxMGPropValue;
}): string[] {
	if (columns?.length) return columns;
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(value.flatMap((row) => (isRecord(row) ? Object.keys(row) : []))),
	);
}

export function normalizeShotlyxMGTableRows({
	value,
	columns,
}: {
	value: ShotlyxMGPropValue;
	columns: string[];
}): ShotlyxMGTableRow[] {
	if (!Array.isArray(value)) return [];
	return value.map((row) => {
		const record = isRecord(row) ? row : {};
		return Object.fromEntries(
			columns.map((column) => {
				const cellValue = record[column];
				return [column, isTableCellValue(cellValue) ? cellValue : ""];
			}),
		);
	});
}

export function parseShotlyxMGTableCellInput({
	input,
	previousValue,
}: {
	input: string;
	previousValue: ShotlyxMGTableCellValue;
}): ShotlyxMGTableCellValue {
	if (typeof previousValue === "number") {
		const nextNumber = Number(input);
		return Number.isFinite(nextNumber) && input.trim().length > 0
			? nextNumber
			: input;
	}
	if (typeof previousValue === "boolean") {
		const normalized = input.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return input;
}

export function updateShotlyxMGTableCell({
	rows,
	rowIndex,
	column,
	value,
}: {
	rows: ShotlyxMGTableRow[];
	rowIndex: number;
	column: string;
	value: ShotlyxMGTableCellValue;
}): ShotlyxMGTableRow[] {
	return rows.map((row, index) =>
		index === rowIndex ? { ...row, [column]: value } : row,
	);
}

export function appendShotlyxMGTableRow({
	rows,
	columns,
}: {
	rows: ShotlyxMGTableRow[];
	columns: string[];
}): ShotlyxMGTableRow[] {
	return [
		...rows,
		Object.fromEntries(columns.map((column) => [column, ""])),
	];
}

export function removeShotlyxMGTableRow({
	rows,
	rowIndex,
}: {
	rows: ShotlyxMGTableRow[];
	rowIndex: number;
}): ShotlyxMGTableRow[] {
	return rows.filter((_, index) => index !== rowIndex);
}
