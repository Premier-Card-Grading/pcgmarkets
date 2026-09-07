import { soldComps } from "@pcg/connectors";
import { soldConnectorJob } from "./sold-connector";
export const soldCompsJob = soldConnectorJob(soldComps);
