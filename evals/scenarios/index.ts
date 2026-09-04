import { adversarial } from "./adversarial";
import { gasSmell } from "./gas-smell";
import { noHeatElderly } from "./no-heat-elderly";
import { outOfArea } from "./out-of-area";
import { routineMaintenance } from "./routine-maintenance";
import type { Scenario } from "../types";

export const SCENARIOS: Scenario[] = [
  gasSmell,
  noHeatElderly,
  routineMaintenance,
  outOfArea,
  adversarial,
];

export { adversarial, gasSmell, noHeatElderly, outOfArea, routineMaintenance };
