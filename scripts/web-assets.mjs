import { cp, mkdir } from "node:fs/promises";
const target = new URL("../apps/web/public/", import.meta.url);
for (const [src, dest] of [
  ["data/published", "data"],
  ["exports", "exports"],
]) {
  await mkdir(new URL(dest + "/", target), { recursive: true });
  await cp(
    new URL("../" + src + "/", import.meta.url),
    new URL(dest + "/", target),
    { recursive: true },
  );
}
