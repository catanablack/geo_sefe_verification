import type { Building } from "../city/cityLayout";
import BuildingMesh from "./BuildingMesh";
import { WINDOW_STYLE_COUNT } from "../city/buildingTextures";

interface CityBuildingsProps {
  buildings: Building[];
}

/** Renders the procedurally generated city blocks as textured, varied buildings. */
export default function CityBuildings({ buildings }: CityBuildingsProps) {
  return (
    <group>
      {buildings.map((b, i) => (
        <BuildingMesh key={b.id} building={b} styleIndex={i % WINDOW_STYLE_COUNT} />
      ))}
    </group>
  );
}
