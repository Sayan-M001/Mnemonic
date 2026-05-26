import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { OCRTextBlock } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const helperPath = path.resolve(__dirname, "../../scripts/vision_ocr.swift").replace("app.asar", "app.asar.unpacked");

export type OCRResult = {
  fullText: string;
  blocks: OCRTextBlock[];
  averageConfidence: number;
  imageSize: {
    width: number;
    height: number;
  };
  processedAt: string;
};

export async function extractTextFromImage(imagePath: string): Promise<OCRResult | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/swift", [helperPath, imagePath], {
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024
    });

    if (!stdout.trim()) {
      return null;
    }

    const parsed = JSON.parse(stdout) as OCRResult;
    return parsed;
  } catch {
    return null;
  }
}
