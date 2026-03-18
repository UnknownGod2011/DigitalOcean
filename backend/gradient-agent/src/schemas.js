import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveSchemaDir() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "shared", "ipc-protocol", "schema"),
    path.resolve(__dirname, "..", "shared", "ipc-protocol", "schema"),
    path.resolve(process.cwd(), "shared", "ipc-protocol", "schema"),
    path.resolve(process.cwd(), "..", "..", "shared", "ipc-protocol", "schema")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "agent-request.schema.json"))) {
      return candidate;
    }
  }

  return null;
}

// Always-pass validator used when schemas are unavailable
function noopValidator(data) {
  return true;
}
noopValidator.errors = null;

export function createSchemaValidators() {
  const schemaDir = resolveSchemaDir();

  if (!schemaDir) {
    console.warn("[schemas] Schema directory not found — schema validation disabled. Requests will pass through.");
    return {
      validateRequest: noopValidator,
      validateResponse: noopValidator
    };
  }

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);

    const requestSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, "agent-request.schema.json"), "utf8"));
    const responseSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, "agent-response.schema.json"), "utf8"));

    return {
      validateRequest: ajv.compile(requestSchema),
      validateResponse: ajv.compile(responseSchema)
    };
  } catch (err) {
    console.warn("[schemas] Failed to compile schemas — schema validation disabled:", err.message);
    return {
      validateRequest: noopValidator,
      validateResponse: noopValidator
    };
  }
}
