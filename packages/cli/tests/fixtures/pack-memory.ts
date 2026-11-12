/* Packs one folder with createArchive and prints its peak memory, as JSON on one line.
   Run as its own process by tests/big-upload.test.ts, so the peak belongs to packaging
   alone: the test runner's own heap is not in it. Arguments: the build folder, then the
   folder the snapshot and archive are written to. */
import { createArchive } from "../../src/archive";
import { Output } from "../../src/output";

const [folder, workDirectory] = process.argv.slice(2);
const manifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
const before = process.memoryUsage().rss;
const archive = await createArchive(folder!, manifest as never, new Output(true, () => {}), { workDirectory });
const peak = process.resourceUsage().maxRSS * 1024;
process.stdout.write(JSON.stringify({ before, peak, file: archive.file, byteSize: archive.byteSize, sha256: archive.sha256, fileCount: archive.fileCount }) + "\n");
