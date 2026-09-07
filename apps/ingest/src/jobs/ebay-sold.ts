import { theCardApi } from "@pcg/connectors";
import { soldConnectorJob } from "./sold-connector";
export const ebaySold = soldConnectorJob(theCardApi);
