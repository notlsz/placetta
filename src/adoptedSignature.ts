/* The signature an owner adopted once (src/esignDisclosure.ts), as the PNG the approval card stamps on an agency form
   (src/forms/fill.ts stampSignature). A drawn one is the image they drew; a typed one is their name, set in a script
   face on an offscreen canvas. Null when it can't be made (no canvas, a bad image): the card then asks them to sign. */
export async function adoptedPng(s: { kind: "typed" | "drawn"; by: string; image?: string }): Promise<Uint8Array | null> {
  try {
    if (s.kind === "drawn") {
      if (!s.image?.startsWith("data:image/png;base64,")) return null;
      const bin = atob(s.image.slice("data:image/png;base64,".length));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    if (typeof document === "undefined") return null;
    const name = s.by.trim().slice(0, 60);
    if (name.length < 2) return null;
    const c = document.createElement("canvas");
    c.width = 600; c.height = 160;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#111";
    ctx.font = "italic 52px 'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 16, 80, 568);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** SHA-256 of the stamped PDF, in hex: what the signature stamp record ties the placement to. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
