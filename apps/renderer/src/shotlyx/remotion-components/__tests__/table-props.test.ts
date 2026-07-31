import { describe, expect, test } from "bun:test";
import {
	appendShotlyxMGTableRow,
	getShotlyxMGTableColumns,
	normalizeShotlyxMGTableRows,
	parseShotlyxMGTableCellInput,
	removeShotlyxMGTableRow,
	updateShotlyxMGTableCell,
} from "../table-props";

describe("Shotlyx MG table props", () => {
	test("normalizes table rows against declared columns", () => {
		const rows = normalizeShotlyxMGTableRows({
			columns: ["病害名称", "核心症状", "防治要点"],
			value: [
				{
					病害名称: "疫病",
					核心症状: "高湿环境",
					extra: "ignored",
				},
			],
		});

		expect(rows).toEqual([
			{
				病害名称: "疫病",
				核心症状: "高湿环境",
				防治要点: "",
			},
		]);
	});

	test("derives columns from existing rows when schema columns are missing", () => {
		expect(
			getShotlyxMGTableColumns({
				value: [{ name: "A", value: 1 }, { note: "B" }],
			}),
		).toEqual(["name", "value", "note"]);
	});

	test("updates, appends, and removes rows immutably", () => {
		const rows = [{ name: "A", value: 1 }];
		const updated = updateShotlyxMGTableCell({
			rows,
			rowIndex: 0,
			column: "value",
			value: 2,
		});

		expect(updated).toEqual([{ name: "A", value: 2 }]);
		expect(rows).toEqual([{ name: "A", value: 1 }]);
		expect(appendShotlyxMGTableRow({ rows: updated, columns: ["name"] }))
			.toEqual([{ name: "A", value: 2 }, { name: "" }]);
		expect(removeShotlyxMGTableRow({ rows: updated, rowIndex: 0 })).toEqual(
			[],
		);
	});

	test("preserves numeric and boolean cell types when possible", () => {
		expect(
			parseShotlyxMGTableCellInput({ input: "42", previousValue: 1 }),
		).toBe(42);
		expect(
			parseShotlyxMGTableCellInput({ input: "false", previousValue: true }),
		).toBe(false);
		expect(
			parseShotlyxMGTableCellInput({ input: "text", previousValue: 1 }),
		).toBe("text");
	});
});
