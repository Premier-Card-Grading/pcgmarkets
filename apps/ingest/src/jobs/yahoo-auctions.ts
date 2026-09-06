import { yahooAuctions } from "@pcg/connectors";
import { soldConnectorJob } from "./sold-connector";
export const yahooAuctionsJob = soldConnectorJob(yahooAuctions);
