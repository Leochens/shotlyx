import { graphicsRegistry } from "../registry";
import { shotlyxMGGraphicDefinition } from "@/shotlyx/remotion-components/graphic-definition";
import { ellipseGraphicDefinition } from "./ellipse";
import { motionGraphicDefinitions } from "./motion-graphics";
import { polygonGraphicDefinition } from "./polygon";
import { rectangleGraphicDefinition } from "./rectangle";
import { starGraphicDefinition } from "./star";

const defaultGraphicDefinitions = [
	rectangleGraphicDefinition,
	ellipseGraphicDefinition,
	polygonGraphicDefinition,
	starGraphicDefinition,
	shotlyxMGGraphicDefinition,
	...motionGraphicDefinitions,
];

export function registerDefaultGraphics(): void {
	for (const definition of defaultGraphicDefinitions) {
		if (graphicsRegistry.has(definition.id)) {
			continue;
		}
		graphicsRegistry.register({
			key: definition.id,
			definition,
		});
	}
}

export {
	ellipseGraphicDefinition,
	motionGraphicDefinitions,
	polygonGraphicDefinition,
	rectangleGraphicDefinition,
	starGraphicDefinition,
};
export { STROKE_ALIGN_PARAM } from "./shared";
