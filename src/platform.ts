import { writeFile } from "node:fs/promises";
export async function write(path: string, data: string | Uint8Array | Blob) {
  await writeFile(
    path,
    data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data,
  );
}
