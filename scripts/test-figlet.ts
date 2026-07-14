import figlet from "figlet";

try {
  const art =
    figlet.textSync("SILICONFLOWER", { font: "ANSI Shadow", horizontalLayout: "fitted" }) ??
    "(empty)";
  console.log(art);
  console.log("FIGLET_OK len=" + String(art.length));
} catch (e) {
  console.log("FIGLET_ERROR: " + String(e));
}
