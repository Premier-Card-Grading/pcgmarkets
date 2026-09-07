import { writeFileSync } from "node:fs";
import { THECARDAPI } from "../packages/connectors/src/thecardapi/schema";
const u = new URL(THECARDAPI.salesPath, THECARDAPI.baseUrl);
for (const [k, v] of Object.entries(THECARDAPI.queryParams)) u.searchParams.set(k, v);
const res = await fetch(u, { headers: THECARDAPI.authHeaders(process.env.THECARDAPI_KEY!) });
console.log(res.status, u.toString());
const body = await res.text();
writeFileSync("packages/connectors/test/fixtures/thecardapi-sample.json", body);
console.log(body.slice(0, 2000));
