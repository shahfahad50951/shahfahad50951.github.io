import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("dist");
const sourceIndex = path.join(outDir, "index.html");
const writings = JSON.parse(
  await readFile(path.resolve("src/content/generated/writings.json"), "utf8"),
);

const routes = [
  "about",
  "writings",
  ...writings.map((writing) => `writings/${writing.slug}`),
];

await Promise.all(
  routes.map(async (route) => {
    const routeDir = path.join(outDir, route);
    await mkdir(routeDir, { recursive: true });
    await copyFile(sourceIndex, path.join(routeDir, "index.html"));
  }),
);

await Promise.all(
  writings.map(async (writing) => {
    const source = path.resolve("src/content/writings", writing.slug, "images");
    const destination = path.join(outDir, "writings", writing.slug, "images");

    try {
      await cp(source, destination, { recursive: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }),
);

await copyFile(sourceIndex, path.join(outDir, "404.html"));
await writeFile(path.join(outDir, ".nojekyll"), "");

console.log(`Created ${routes.length} static routes plus 404.html.`);
