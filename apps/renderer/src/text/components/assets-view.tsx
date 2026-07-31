import Image from "@/platform/image";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import {
	buildFlowerTextMenuGraphicElement,
	getFlowerTextMenuItems,
	type FlowerTextMenuItem,
} from "@/text/flower-text-assets";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { TimelineDragData } from "@/timeline/drag";
import type { MediaTime } from "@/wasm";

export function TextView() {
	const editor = useEditor();
	const flowerTextItems = getFlowerTextMenuItems({});

	const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const element = buildTextElement({
			raw: DEFAULTS.text.element,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title="Text" contentClassName="flex flex-col gap-5 pb-4">
			<div className="flex flex-col gap-2">
				<p className="text-xs text-muted-foreground">Basic</p>
				<DraggableItem
					name="Default text"
					preview={
						<div className="bg-accent flex size-full items-center justify-center rounded">
							<span className="text-xs select-none">Default text</span>
						</div>
					}
					dragData={{
						id: "temp-text-id",
						type: DEFAULTS.text.element.type,
						name: DEFAULTS.text.element.name,
						content: "Default text",
					}}
					aspectRatio={1}
					onAddToTimeline={handleAddToTimeline}
					shouldShowLabel={false}
				/>
			</div>
			<FlowerTextSection items={flowerTextItems} />
		</PanelView>
	);
}

function FlowerTextSection({ items }: { items: FlowerTextMenuItem[] }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">Flower Text</p>
				<span className="text-xs text-muted-foreground">{items.length}</span>
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
				{items.map((item) => (
					<FlowerTextItem key={item.id} item={item} />
				))}
			</div>
		</div>
	);
}

function FlowerTextItem({ item }: { item: FlowerTextMenuItem }) {
	const editor = useEditor();

	const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		editor.timeline.insertElement({
			element: buildFlowerTextMenuGraphicElement({
				item,
				startTime: currentTime,
			}),
			placement: { mode: "auto", trackType: "graphic" },
		});
	};

	const dragData: TimelineDragData = {
		id: item.id,
		type: "graphic",
		name: item.name,
		definitionId: item.definitionId,
		params: item.params,
		duration: item.duration,
		animations: item.animations,
	};

	return (
		<DraggableItem
			name={item.name}
			preview={
				<div className="flex size-full items-center justify-center p-2">
					<Image
						src={item.previewUrl}
						alt={item.name}
						width={80}
						height={80}
						className="size-full object-contain"
						loading="lazy"
						unoptimized
					/>
				</div>
			}
			dragData={dragData}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			shouldShowLabel={false}
			containerClassName="w-full"
		/>
	);
}
