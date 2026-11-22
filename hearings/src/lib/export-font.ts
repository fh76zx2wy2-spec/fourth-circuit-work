// Embed the same local font in PNGs; system fonts are unavailable inside SVG images.
let embeddedFonts: Promise<string> | undefined;
export function exportFontCSS(): Promise<string> {
  if (!embeddedFonts) embeddedFonts = Promise.all(
    [["Regular", "400"], ["Medium", "500 600"], ["Bold", "700 900"]].map(async ([name, weight]) => {
      const response = await fetch(new URL(`assets/fonts/thmanyahsans-${name}.woff2`, document.baseURI));
      if (!response.ok) throw new Error("تعذر تحميل خط ثمانية للصورة");
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return `@font-face{font-family:"Thmanyah Sans";font-style:normal;font-weight:${weight};src:url("${data}") format("woff2");}`;
    })
  ).then(fonts => fonts.join("\n")).catch(error => { embeddedFonts = undefined; throw error; });
  return embeddedFonts;
}
