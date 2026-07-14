import figlet from "figlet";

const FLOWER = `
      . : *  *  *  : .
    *   . _ . _ . _ .   *
  .  _.'   \\     /   '._  .
 *  ' .    [ {R}]    . '  *
  .  '_'   /     \\   '_'  .
    *   . '' . '' . ''   *
      ' : *  *  *  : '
`;

export function renderLogo(): { art: string; color: string } {
  let art: string;
  try {
    art =
      figlet.textSync("SILICONFLOWER", { font: "ANSI Shadow", horizontalLayout: "fitted" }) ??
      "SILICONFLOWER";
  } catch {
    art = "SILICONFLOWER";
  }
  return { art, color: "magenta" };
}

export function flowerGlyph(accent = "R"): string {
  return FLOWER.replace("{R}", accent);
}
